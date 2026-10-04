import transport from '../../../../modules/fire-tv-transport/src/FireTvTransportModule';
import { delay } from '../delay';
import { RemoteFailure } from '../errors';

const NUDGE_COOLDOWN_MS = 30000;
// The first DIAL request after a long standby has timed out on this TV, so wake keeps asking for about a minute.
const WAKE_DEADLINE_MS = 65000;
const WAKE_POLL_MS = 1500;
const PANEL_START_MS = 2500;
// This TV took tens of seconds to expose Lightning after a Power Off press.
const LIGHTNING_RETURN_MS = 45000;
const WAKE_UNANSWERED = 'Couldn’t find the TV. If it is off, turn it on with its own remote, then tap Connect.';

/** Every DIAL request the app sends: the explicit wake and the throttled nudge after a refused press. */
export class WakeService {
  private lastNudgeAt = 0;

  nudge(host: string): void {
    const now = Date.now();
    if (now - this.lastNudgeAt < NUDGE_COOLDOWN_MS) return;
    this.lastNudgeAt = now;
    void transport.wake(host).catch(() => undefined);
  }

  /** Resolves once the TV accepts DIAL and has had a moment to start, to the time until which the caller should wait for Lightning. */
  async wake(host: string): Promise<number> {
    const deadline = Date.now() + WAKE_DEADLINE_MS;
    for (;;) {
      try {
        await transport.wake(host);
        break;
      } catch {
        if (Date.now() >= deadline) throw new RemoteFailure(WAKE_UNANSWERED, 'user');
        await delay(WAKE_POLL_MS);
      }
    }
    // Give the panel and Lightning service time to start after the DIAL response.
    await delay(PANEL_START_MS);
    return Date.now() + LIGHTNING_RETURN_MS;
  }
}
