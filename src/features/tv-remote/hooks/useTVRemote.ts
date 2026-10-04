import { useCallback, useEffect, useRef, useState } from 'react';
import transport from '../../../../modules/fire-tv-transport/src/FireTvTransportModule';
import { validateAddress, validatePin } from '../validation';
import { isTVPin, pinWheelKeys } from '../pinWheel';
import { RemoteFailure } from '../errors';
import { LightningProtocol } from '../protocols/LightningProtocol';
import { discoverTVs, findVerified } from '../services/discovery';
import { WakeService } from '../services/WakeService';
import { tvStorage } from '../storage/tvStorage';
import type { Activity, ErrorSource, FoundTV, LinkState, RemoteError, TVKey } from '../types';
import { useAppActive } from './useAppActive';

const PAIRED_CHECK_MS = 15000;
const UNPAIRED_CHECK_MS = 30000;

type Session = { activity: Activity; pinRequested: boolean; error: RemoteError | null };

function toRemoteError(cause: unknown, fallbackMessage: string): RemoteError {
  return cause instanceof RemoteFailure ? cause.error : { message: fallbackMessage, source: 'user' };
}

export function useTVRemote() {
  const wakeService = useRef(new WakeService()).current;
  const protocol = useRef(new LightningProtocol(wakeService)).current;
  const running = useRef(false);
  const [address, setAddress] = useState('');
  const [link, setLink] = useState<LinkState>(protocol.link);
  const [tvs, setTVs] = useState<FoundTV[]>([]);
  const latestSearch = useRef(0);
  const [{ activity, pinRequested, error }, setSession] = useState<Session>({ activity: 'idle', pinRequested: false, error: null });
  const appActive = useAppActive();

  const patch = useCallback((changes: Partial<Session>) => {
    setSession((previous) => ({ ...previous, ...changes }));
  }, []);

  const clearError = useCallback((source: ErrorSource) => {
    setSession((previous) => (previous.error?.source === source ? { ...previous, error: null } : previous));
  }, []);

  const runActivity = useCallback(async <T>(next: Activity, fallbackMessage: string, fn: () => Promise<T>): Promise<T | undefined> => {
    if (running.current) return undefined;
    running.current = true;
    patch({ activity: next, error: null });
    try {
      return await fn();
    } catch (cause) {
      patch({ error: toRemoteError(cause, fallbackMessage) });
      return undefined;
    } finally {
      running.current = false;
      patch({ activity: 'idle' });
    }
  }, [patch]);

  const updateAddress = useCallback((value: string) => {
    setAddress(value);
    if (value.trim() !== link.host) patch({ pinRequested: false });
  }, [link.host, patch]);

  const finishConnection = useCallback(async (host: string, retryUntil?: number) => {
    await protocol.connect(host, { retryUntil });
    await tvStorage.saveAddress(host);
    setAddress(host);
    patch({ pinRequested: false });
  }, [patch, protocol]);

  const wakeAndConnect = useCallback(async (host: string) => {
    patch({ activity: 'waking' });
    await finishConnection(host, await wakeService.wake(host));
  }, [finishConnection, patch, wakeService]);

  // A step's search and the quiet one can overlap, so only the one started last replaces the list.
  const findTVs = useCallback(async () => {
    const id = ++latestSearch.current;
    const found = await discoverTVs();
    if (id === latestSearch.current) setTVs(found);
    return found;
  }, []);

  // DHCP can move the TV, so an address that does not answer sends a step looking for every Fire TV on the network.
  const search = useCallback(async (skip: string) => {
    patch({ activity: 'searching' });
    const seen = (await findTVs()).map((tv) => tv.host);
    return { seen, verified: await findVerified(seen.filter((host) => host !== skip)) };
  }, [findTVs, patch]);

  const connectTo = useCallback((candidate: string) => runActivity('connecting', 'Could not reach the TV.', async () => {
    const host = validateAddress(candidate);
    try {
      await finishConnection(host);
    } catch (cause) {
      const { verified } = await search(host);
      if (verified === null) throw cause;
      await finishConnection(verified);
    }
  }), [finishConnection, runActivity, search]);

  // Only this step wakes the TV, so opening the app never turns it on by surprise. Waking an awake TV is harmless and restarts a remote service that stopped answering.
  const connect = useCallback(() => runActivity('connecting', 'Could not reach the TV.', async () => {
    if (!address.trim()) {
      const { seen, verified } = await search('');
      if (verified !== null) {
        await finishConnection(verified);
        return;
      }
      if (seen.length === 1) {
        await wakeAndConnect(seen[0]);
        return;
      }
      throw new RemoteFailure(
        seen.length > 1 ? 'Several Fire TVs found. Enter your TV’s address in TV settings.' : 'No Fire TV found. Enter its address in TV settings.',
        'user',
      );
    }
    const host = validateAddress(address);
    try {
      await finishConnection(host);
      return;
    } catch {
      // Fall through to the search and the wake.
    }
    const { seen, verified } = await search(host);
    if (verified !== null) {
      await finishConnection(verified);
      return;
    }
    // A TV with its remote service stopped cannot prove its identity until woken, so a lone Fire TV is woken and then checked against the paired TV's certificate, or taken as the TV to pair with; with several, only the saved address is.
    await wakeAndConnect(seen.length === 1 ? seen[0] : host);
  }), [address, finishConnection, runActivity, search, wakeAndConnect]);

  // A sleeping panel can still answer Lightning, so waking always sends DIAL. The TV may have moved while asleep, so a wake nobody answers looks for it.
  const wake = useCallback(() => runActivity('waking', 'Could not wake the TV.', async () => {
    try {
      await wakeAndConnect(link.host);
    } catch (cause) {
      const { verified } = await search(link.host);
      if (verified === null) throw cause;
      await wakeAndConnect(verified);
    }
  }), [link.host, runActivity, search, wakeAndConnect]);

  const sleep = useCallback(() => runActivity('sleeping', 'Could not put the TV to sleep.', () => protocol.sleep()), [protocol, runActivity]);

  /** Resolves to whether the Home hold may have reached the TV. */
  const openTVSettings = useCallback(
    async () => (await runActivity('openingTVSettings', 'Could not open TV settings.', () => protocol.openTVSettings())) ?? false,
    [protocol, runActivity],
  );

  // A chosen TV is woken if it does not answer, and never swapped for another TV the search finds.
  const chooseTV = useCallback((candidate: string) => runActivity('connecting', 'Could not reach that TV.', async () => {
    const host = validateAddress(candidate);
    try {
      await finishConnection(host);
    } catch {
      await wakeAndConnect(host);
    }
  }), [finishConnection, runActivity, wakeAndConnect]);

  const requestPairing = useCallback(() => runActivity('requestingPin', 'Could not show a PIN on the TV.', async () => {
    await protocol.requestPairing();
    patch({ pinRequested: true });
  }), [patch, protocol, runActivity]);

  const foundName = tvs.find((tv) => tv.host === link.host)?.name ?? null;

  const submitPin = useCallback((raw: string) => runActivity('verifyingPin', 'Pairing failed. Request a new PIN.', async () => {
    const pin = validatePin(raw);
    // Once the step starts the TV may have consumed the PIN, and a failed request cannot tell, so the prompt always closes; a fresh PIN costs one tap.
    try {
      await protocol.completePairing(pin, foundName);
    } finally {
      patch({ pinRequested: false });
    }
  }), [foundName, patch, protocol, runActivity]);

  const forgetTV = useCallback(() => runActivity('forgetting', 'Could not forget the TV.', () => protocol.forget()), [protocol, runActivity]);

  // Load a saved address or discover a TV on the local network for a new install.
  useEffect(() => {
    let mounted = true;
    tvStorage.getAddress().catch(() => null).then(async (saved) => {
      if (!mounted) return;
      if (saved) {
        setAddress(saved);
        void connectTo(saved);
        return;
      }
      const found = await findTVs();
      if (!mounted) return;
      const verified = await findVerified(found.map((tv) => tv.host));
      if (!mounted) return;
      if (verified) void connectTo(verified);
      else if (found.length === 1) setAddress(found[0].host);
    });
    return () => { mounted = false; };
  }, [connectTo, findTVs]);

  useEffect(() => protocol.subscribe((event) => {
    switch (event.type) {
      case 'link':
        setLink(event.link);
        if (event.link.health === 'online') clearError('link');
        break;
      case 'failure': patch({ error: event.error }); break;
    }
  }), [clearError, patch, protocol]);

  const sendKey = useCallback((key: TVKey): boolean => {
    const accepted = protocol.sendKey(key);
    if (accepted) clearError('press');
    return accepted;
  }, [clearError, protocol]);

  /** Types a PIN into the prompt open on the TV and reports whether it was queued. */
  const typeTVPin = useCallback((pin: string): boolean => {
    if (!isTVPin(pin)) return false;
    const accepted = protocol.sendKeys(pinWheelKeys(pin));
    if (accepted) clearError('press');
    return accepted;
  }, [clearError, protocol]);

  const busy = activity !== 'idle';

  useEffect(() => {
    transport.setWifiLowLatency(appActive && link.paired);
    return () => transport.setWifiLowLatency(false);
  }, [appActive, link.paired]);

  useEffect(() => {
    if (appActive && !running.current) void protocol.checkConnection();
  }, [appActive, protocol]);

  useEffect(() => {
    if (busy || !appActive) return;
    const timer = setInterval(() => { void protocol.checkConnection(); }, link.paired ? PAIRED_CHECK_MS : UNPAIRED_CHECK_MS);
    return () => clearInterval(timer);
  }, [appActive, busy, link.paired, protocol]);

  const needsPairing = !link.paired && link.health !== 'offline';
  const canControl = link.paired && !busy && link.standby === 'none';
  const addressDiverged = link.host !== '' && address.trim() !== link.host;

  // Lightning never says what a TV is called, only mDNS does, so the app searches once whenever it lacks a name it needs: to name and list the TVs before pairing, or to name a TV paired before names were kept.
  const wantsSearch = needsPairing || (link.paired && link.name === null && link.health === 'online');
  const searched = useRef(false);
  useEffect(() => {
    if (!wantsSearch) {
      searched.current = false;
      return;
    }
    if (busy || searched.current) return;
    searched.current = true;
    void findTVs();
  }, [busy, findTVs, wantsSearch]);

  useEffect(() => {
    if (busy || !link.paired || link.name !== null || foundName === null) return;
    void protocol.rememberName(foundName).catch(() => undefined);
  }, [busy, foundName, link.name, link.paired, protocol]);

  return {
    address, setAddress: updateAddress, link, activity, pinRequested, error,
    busy, needsPairing, canControl, addressDiverged, tvs, tvName: link.name ?? foundName,
    connect, wake, sleep, openTVSettings,
    requestPairing, submitPin, forgetTV, chooseTV,
    sendKey, repeatKey: protocol.repeatKey, typeTVPin,
  };
}
