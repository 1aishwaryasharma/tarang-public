import type { TVKey } from './types';

// The TV's PIN prompt is a wheel: the centre and the four directions enter 0–4, and Menu flips it to 5–9 until pressed again.
const WHEEL: TVKey[] = ['select', 'up', 'right', 'down', 'left'];

export const TV_PIN_LENGTH = 5;

export function isTVPin(input: string): boolean {
  return new RegExp(`^\\d{${TV_PIN_LENGTH}}$`).test(input);
}

/** The keys that type a PIN into a freshly opened prompt, which always starts on 0–4. */
export function pinWheelKeys(pin: string): TVKey[] {
  const keys: TVKey[] = [];
  let upper = false;
  for (const char of pin) {
    const digit = Number(char);
    if (digit >= 5 !== upper) {
      keys.push('menu');
      upper = !upper;
    }
    keys.push(WHEEL[digit % 5]);
  }
  return keys;
}
