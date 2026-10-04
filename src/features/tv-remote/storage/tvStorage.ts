import * as SecureStore from 'expo-secure-store';
import type { CertificateFingerprint } from '../../../../modules/fire-tv-transport/src/FireTvTransportModule';

export type Pairing = { fingerprint: CertificateFingerprint; token: string; name: string | null };

const ADDRESS_KEY = 'firetv_address';
const PAIRING_KEY = 'firetv_pairing';
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

function parsePairing(raw: string): Pairing | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || !('fingerprint' in value) || !('token' in value)) return null;
  const { fingerprint, token } = value;
  if (typeof fingerprint !== 'string' || !FINGERPRINT_PATTERN.test(fingerprint) || typeof token !== 'string' || !token) return null;
  // Pairings saved before names were kept have none.
  const name = 'name' in value && typeof value.name === 'string' ? value.name : null;
  return { fingerprint: fingerprint as CertificateFingerprint, token, name };
}

async function getPairing(): Promise<Pairing | null> {
  const raw = await SecureStore.getItemAsync(PAIRING_KEY);
  return raw !== null ? parsePairing(raw) : null;
}

export const tvStorage = {
  getAddress: () => SecureStore.getItemAsync(ADDRESS_KEY),
  saveAddress: (host: string) => SecureStore.setItemAsync(ADDRESS_KEY, host),
  getPairing,
  savePairing: (pairing: Pairing) => SecureStore.setItemAsync(PAIRING_KEY, JSON.stringify(pairing)),
  clearPairing: () => SecureStore.deleteItemAsync(PAIRING_KEY),
};
