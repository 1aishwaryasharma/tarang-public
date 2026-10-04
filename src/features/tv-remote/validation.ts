import { RemoteFailure } from './errors';

export function validateAddress(input: string): string {
  const host = input.trim();
  const octets = host.split('.');
  if (octets.length !== 4 || octets.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) {
    throw new RemoteFailure('Enter the TV’s IPv4 address, such as 192.168.1.100.', 'user');
  }
  return host;
}

export function validatePin(input: string): string {
  const pin = input.trim();
  if (!/^\d{4}$/.test(pin)) throw new RemoteFailure('Enter the four-digit PIN shown on your TV.', 'user');
  return pin;
}
