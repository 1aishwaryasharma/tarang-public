import transport, {
  transportErrorCode, type CertificateFingerprint, type TransportErrorCode,
} from '../../../../modules/fire-tv-transport/src/FireTvTransportModule';
import { delay } from '../delay';
import { RemoteFailure } from '../errors';
import type { LinkEvent, LinkHealth, LinkState, RemoteError, TVKey } from '../types';
import { tvStorage, type Pairing } from '../storage/tvStorage';

const ACTIONS: Record<Exclude<TVKey, 'playPause'>, string> = {
  up: 'dpad_up',
  down: 'dpad_down',
  left: 'dpad_left',
  right: 'dpad_right',
  select: 'select',
  back: 'back',
  home: 'home',
  menu: 'menu',
  volumeUp: 'volume_up',
  volumeDown: 'volume_down',
  mute: 'mute',
};

const MAX_QUEUED = 2;
const RECONNECT_POLL_MS = 1200;
const UNAVAILABLE = 'Can’t reach the TV. Tap Connect to try again.';
const CERTIFICATE_CHANGED = 'TV certificate changed. Connection stopped for safety.';
const PAIRING_EXPIRED = 'Pairing expired. Pair with the TV again.';
const WAKE_NOT_RETURNED = 'The TV woke but its remote service did not start. Tap Connect again.';
const PIN_REJECTED = 'The TV did not accept that PIN. Show a new PIN and try again.';
const SLEEP_UNCONFIRMED = 'The TV may have gone to sleep before replying. Check its screen. Tap Wake TV to resume.';
// A working Fire TV integration opens Settings with this hold; it still needs a physical device test.
const SETTINGS_HOLD_MS = 400;

type RequestKind = 'press' | 'check' | 'connect' | 'pair' | 'sleep' | 'tvSettings';
/** announce: emit the error so the hook shows it, including for presses and checks that run outside any step. forgetPairing: also drop the pairing. nudge: ask WakeService for one DIAL request. */
type Outcome = { health: LinkHealth; error: RemoteError; effect?: 'announce' | 'forgetPairing' | 'nudge' };
type Exchange<T> = { ok: true; value: T } | { ok: false; code: TransportErrorCode | null; outcome: Outcome };
type Peer = { host: string; fingerprint: CertificateFingerprint };

/** Requests that act on the TV with the pairing token, so a 403 means the pairing expired. */
const COMMANDS = new Set<RequestKind>(['press', 'sleep', 'tvSettings']);

/** A timeout or dropped connection can lose the reply to a request the TV already applied. A refusal, certificate mismatch, or HTTP status means it did not. */
function mayHaveArrived(code: TransportErrorCode | null): boolean {
  return code === null || code === 'TIMEOUT' || code === 'NETWORK';
}

function keyPath(key: TVKey): string {
  return key === 'playPause' ? '/v1/media?action=play' : `/v1/FireTV?action=${ACTIONS[key]}`;
}

function classify(code: TransportErrorCode | null, kind: RequestKind): Outcome {
  if (code === 'CERT') return { health: 'offline', error: { message: CERTIFICATE_CHANGED, source: 'link' }, effect: 'announce' };
  if (code === 'HTTP_403' && COMMANDS.has(kind)) return { health: 'online', error: { message: PAIRING_EXPIRED, source: 'user' }, effect: 'forgetPairing' };
  if (code === 'REFUSED' || code === 'TIMEOUT') {
    return { health: 'offline', error: { message: UNAVAILABLE, source: 'link' }, effect: kind === 'press' ? 'nudge' : undefined };
  }
  if (code !== null && code.startsWith('HTTP_')) {
    const message = `The TV answered with an error (HTTP ${code.slice('HTTP_'.length)}).`;
    if (kind === 'press') return { health: 'online', error: { message, source: 'press' }, effect: 'announce' };
    return { health: 'online', error: { message, source: 'user' } };
  }
  return { health: kind === 'press' || kind === 'check' ? 'stale' : 'offline', error: { message: UNAVAILABLE, source: 'link' } };
}

export class LightningProtocol {
  private state: LinkState = { host: '', paired: false, health: 'offline', name: null, standby: 'none' };
  private pairing: Pairing | null = null;
  /** Every request is pinned to this: the paired TV's certificate, or before pairing, the one the connect probe saw. */
  private fingerprint: CertificateFingerprint | null = null;
  private generation = 0;
  private sending: Promise<void> | null = null;
  /** A sleep or Settings request is out alone. */
  private exclusive = false;
  /** Each entry is one tap, or one typed PIN whose keys only make sense together. */
  private pending: TVKey[][] = [];
  private listeners = new Set<(event: LinkEvent) => void>();

  constructor(private readonly wakeService: { nudge(host: string): void }) {}

  get link(): LinkState { return this.state; }

  subscribe(listener: (event: LinkEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Probes once, or with retryUntil re-probes until Lightning answers, the deadline passes, or the certificate mismatches. */
  async connect(host: string, { retryUntil }: { retryUntil?: number } = {}): Promise<void> {
    this.invalidate();
    this.pairing = await tvStorage.getPairing();
    const expected = this.pairing?.fingerprint ?? null;
    this.fingerprint = expected;
    const paired = expected !== null;
    const name = this.pairing?.name ?? null;
    this.setLink(host === this.state.host ? { paired, name } : { host, paired, name, health: 'offline' });
    for (;;) {
      const result = await this.exchange('connect', () => transport.probe(host, expected));
      if (result.ok) {
        this.fingerprint = result.value;
        this.setLink({ standby: 'none' });
        return;
      }
      const { code, outcome } = result;
      if (retryUntil === undefined || code === 'CERT') throw RemoteFailure.from(outcome.error);
      if (Date.now() >= retryUntil) throw new RemoteFailure(WAKE_NOT_RETURNED, 'link');
      await delay(RECONNECT_POLL_MS);
    }
  }

  async requestPairing(): Promise<void> {
    const peer = this.requireProbed();
    this.invalidate();
    const result = await this.pairingPost(peer, '/v1/FireTV/pin/display', { friendlyName: 'Tarang TV Remote' });
    if (!result.ok) throw RemoteFailure.from(result.outcome.error);
  }

  /** name: what the TV called itself when a search last saw it, kept with the pairing so the app can name it without searching. */
  async completePairing(pin: string, name: string | null): Promise<void> {
    const peer = this.requireProbed();
    this.invalidate();
    const result = await this.pairingPost(peer, '/v1/FireTV/pin/verify', { pin });
    if (!result.ok) {
      const { code, outcome } = result;
      if (code !== null && /^HTTP_4\d\d$/.test(code)) throw new RemoteFailure(PIN_REJECTED, 'user');
      throw RemoteFailure.from(outcome.error);
    }
    const value: unknown = JSON.parse(result.value);
    const token = typeof value === 'object' && value !== null && 'description' in value ? value.description : null;
    if (typeof token !== 'string' || !token) throw new RemoteFailure('The TV did not return a pairing token.', 'user');
    const pairing = { fingerprint: peer.fingerprint, token, name };
    await tvStorage.savePairing(pairing);
    this.pairing = pairing;
    this.setLink({ paired: true, name, health: 'online' });
  }

  /** Drops the pairing but keeps the host and the certificate it presented, so pairing again goes to the same TV. */
  forget(): Promise<void> {
    return this.forgetPairing(this.state.health);
  }

  /** Keeps the name a search found for a TV that was paired before its name was known. */
  async rememberName(name: string): Promise<void> {
    const { pairing } = this;
    if (pairing === null || pairing.name !== null) return;
    this.pairing = { ...pairing, name };
    this.setLink({ name });
    await tvStorage.savePairing(this.pairing);
  }

  /** Queues a tap and reports whether it was accepted; a full queue or a missing pairing drops it. */
  sendKey = (key: TVKey): boolean => this.enqueue([key]);

  /** Queues keys that are sent in order and abandoned at the first failure, so a dropped key never shifts the ones after it. */
  sendKeys(keys: TVKey[]): boolean {
    return this.enqueue(keys);
  }

  /** One tick of a held key: sent only when the TV has caught up, so a release never overshoots by more than the press already on the way. */
  repeatKey = (key: TVKey): void => {
    if (this.sending) return;
    this.sendKey(key);
  };

  /** Resolves to whether the TV took the request. A lost reply leaves standby unconfirmed instead of retrying. */
  async sleep(): Promise<boolean> {
    const result = await this.exclusively('sleep', (host, { fingerprint, token }) => transport.request(
      host, fingerprint, '/v1/FireTV?action=sleep', 'POST', JSON.stringify({ keyActionType: 'keyDownUp' }), token, 'fast',
    ));
    if (result === null) return false;
    if (result.ok) {
      this.setLink({ standby: 'requested' });
      return true;
    }
    if (!mayHaveArrived(result.code)) throw RemoteFailure.from(result.outcome.error);
    this.setLink({ standby: 'uncertain' });
    throw new RemoteFailure(SLEEP_UNCONFIRMED, 'user');
  }

  /** Holds Home to request Quick Settings. Resolves to whether the hold may have reached the TV, because only its screen shows whether the menu opened. */
  async openTVSettings(): Promise<boolean> {
    const result = await this.exclusively('tvSettings', (host, { fingerprint, token }) => transport.holdKey(
      host, fingerprint, keyPath('home'), token, SETTINGS_HOLD_MS,
    ));
    if (result === null) return false;
    if (result.ok || mayHaveArrived(result.code)) return true;
    throw RemoteFailure.from(result.outcome.error);
  }

  async checkConnection(): Promise<void> {
    if (this.paused) return;
    const { host } = this.state;
    const { fingerprint } = this;
    if (!host || !fingerprint) return;
    const token = this.pairing?.token ?? '';
    await this.exchange('check', () => transport.request(host, fingerprint, '/v1/FireTV', 'GET', '', token, 'fast'));
  }

  /** Standby or an exclusive request: keys and passive checks wait. */
  private get paused(): boolean {
    return this.state.standby !== 'none' || this.exclusive;
  }

  /** Sends one request alone: drops queued taps, waits for the press already out, and blocks keys and checks until it settles. Resolves to null when it cannot start or a connect, pairing, or forget overtook it. */
  private async exclusively<T>(kind: RequestKind, call: (host: string, pairing: Pairing) => Promise<T>): Promise<Exchange<T> | null> {
    const { pairing } = this;
    const { host } = this.state;
    if (pairing === null || !host || this.paused) return null;
    this.exclusive = true;
    this.invalidate();
    const generation = this.generation;
    try {
      await this.sending;
      if (generation !== this.generation) return null;
      const result = await this.exchange(kind, () => call(host, pairing));
      return generation === this.generation ? result : null;
    } finally {
      this.exclusive = false;
    }
  }

  private pairingPost({ host, fingerprint }: Peer, path: string, body: object): Promise<Exchange<string>> {
    return this.exchange('pair', () => transport.request(host, fingerprint, path, 'POST', JSON.stringify(body), '', 'slow'));
  }

  private enqueue(keys: TVKey[]): boolean {
    if (!this.pairing || !this.state.host || this.paused || this.pending.length >= MAX_QUEUED) return false;
    this.pending.push(keys);
    if (!this.sending) this.sending = this.pump().finally(() => { this.sending = null; });
    return true;
  }

  private async pump(): Promise<void> {
    for (let batch = this.pending.shift(); batch !== undefined; batch = this.pending.shift()) {
      const { generation, pairing } = this;
      if (pairing === null) continue;
      for (const key of batch) {
        const result = await this.press(key, pairing);
        if (!result.ok || generation !== this.generation) break;
      }
    }
  }

  private press(key: TVKey, { fingerprint, token }: Pairing): Promise<Exchange<string>> {
    return this.exchange('press', () => transport.request(this.state.host, fingerprint, keyPath(key), 'POST', '', token, 'fast'));
  }

  /** Every Lightning request. A result only touches the link if no connect, pairing, or forget happened while it was out. */
  private async exchange<T>(kind: RequestKind, call: () => Promise<T>): Promise<Exchange<T>> {
    const generation = this.generation;
    try {
      const value = await call();
      if (generation === this.generation) this.setLink({ health: 'online' });
      return { ok: true, value };
    } catch (error) {
      const code = transportErrorCode(error);
      const outcome = classify(code, kind);
      if (generation === this.generation) await this.settle(outcome);
      return { ok: false, code, outcome };
    }
  }

  private async settle({ health, effect, error }: Outcome): Promise<void> {
    if (effect === 'forgetPairing') {
      await this.forgetPairing(health).catch(() => undefined);
      this.emit({ type: 'failure', error });
      return;
    }
    this.setLink({ health });
    if (effect === 'announce') this.emit({ type: 'failure', error });
    if (effect === 'nudge') this.wakeService.nudge(this.state.host);
  }

  // Memory and the link clear first so a SecureStore failure still leaves the UI unpaired. Only forget reports that failure, because the pairing would return on the next launch.
  private async forgetPairing(health: LinkHealth): Promise<void> {
    this.invalidate();
    this.pairing = null;
    this.setLink({ paired: false, name: null, health, standby: 'none' });
    await tvStorage.clearPairing();
  }

  /** Every request already out stops touching the link, and every queued tap is dropped. */
  private invalidate(): void {
    this.generation += 1;
    this.pending.length = 0;
  }

  private setLink(patch: Partial<LinkState>): void {
    const next = { ...this.state, ...patch };
    if ((Object.keys(next) as (keyof LinkState)[]).every((key) => next[key] === this.state[key])) return;
    this.state = next;
    this.emit({ type: 'link', link: next });
  }

  private emit(event: LinkEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private requireProbed(): Peer {
    const { host } = this.state;
    const { fingerprint } = this;
    if (!host || !fingerprint) throw new RemoteFailure('Connect to the TV first.', 'user');
    return { host, fingerprint };
  }
}
