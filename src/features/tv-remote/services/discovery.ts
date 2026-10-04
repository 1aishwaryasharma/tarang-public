import transport from '../../../../modules/fire-tv-transport/src/FireTvTransportModule';
import { tvStorage } from '../storage/tvStorage';
import type { FoundTV } from '../types';

const DISCOVERY_WINDOW_MS = 3000;

/** Every Fire TV on the network that announced itself during the search window. */
export function discoverTVs(): Promise<FoundTV[]> {
  return transport.discover(DISCOVERY_WINDOW_MS).catch((): FoundTV[] => []);
}

/** The first host whose remote service presents the paired TV's certificate, or before any pairing, the first whose remote service answers at all. A TV whose remote service has stopped cannot pass until it is woken. */
export async function findVerified(hosts: string[]): Promise<string | null> {
  const fingerprint = (await tvStorage.getPairing())?.fingerprint ?? null;
  for (const host of hosts) {
    if (await transport.probe(host, fingerprint).then(() => true, () => false)) return host;
  }
  return null;
}
