import { NativeModule, requireNativeModule } from 'expo';

export type TransportErrorCode = 'REFUSED' | 'TIMEOUT' | 'CERT' | 'NETWORK' | `HTTP_${number}`;
export type TimeoutProfile = 'fast' | 'slow';
/** Lowercase hex SHA-256 of a TV's DER leaf certificate, as presented to `probe` or read back from a stored pairing. */
export type CertificateFingerprint = string & { readonly __brand: 'CertificateFingerprint' };

declare class FireTvTransportModule extends NativeModule<{}> {
  wake(host: string): Promise<void>;
  probe(host: string, fingerprint: CertificateFingerprint | null): Promise<CertificateFingerprint>;
  request(
    host: string, fingerprint: CertificateFingerprint, path: string, method: 'GET' | 'POST', body: string, token: string, timeouts: TimeoutProfile,
  ): Promise<string>;
  holdKey(host: string, fingerprint: CertificateFingerprint, path: string, token: string, holdMs: number): Promise<void>;
  discover(windowMs: number): Promise<{ host: string; name: string | null }[]>;
  setWifiLowLatency(enabled: boolean): void;
}

const CODE_PATTERN = /^(REFUSED|TIMEOUT|CERT|NETWORK|HTTP_\d+)$/;

const transport = requireNativeModule<FireTvTransportModule>('FireTvTransport');

export function transportErrorCode(error: unknown): TransportErrorCode | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const { code } = error;
  return typeof code === 'string' && CODE_PATTERN.test(code) ? (code as TransportErrorCode) : null;
}

export default transport;
