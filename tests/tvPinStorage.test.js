import { beforeEach, expect, mock, test } from 'bun:test';

const entries = new Map();
let available = true;
let authenticate = async () => {};
const protectedReads = [];
const protectedWrites = [];

mock.module('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7,
  canUseBiometricAuthentication: () => available,
  getItemAsync: async (key, options) => {
    if (options?.requireAuthentication) {
      protectedReads.push(options);
      await authenticate();
    }
    return entries.get(key) ?? null;
  },
  setItemAsync: async (key, value, options) => {
    if (options?.requireAuthentication) {
      protectedWrites.push(options);
      await authenticate();
    }
    entries.set(key, value);
  },
  deleteItemAsync: async (key) => { entries.delete(key); },
}));

const { tvPinStorage } = await import('../src/features/tv-remote/storage/tvPinStorage');

beforeEach(() => {
  entries.clear();
  available = true;
  authenticate = async () => {};
  protectedReads.length = 0;
  protectedWrites.length = 0;
});

test('saving protects the PIN with biometrics in its own keychain', async () => {
  await tvPinStorage.save('12345');
  expect(await tvPinStorage.hasSavedPin()).toBe(true);
  expect(protectedWrites).toEqual([{
    keychainService: 'tarang.tv-pin',
    requireAuthentication: true,
    authenticationPrompt: 'Unlock your TV PIN',
    keychainAccessible: 7,
  }]);
  expect(protectedReads).toHaveLength(0);
});

test('each use authenticates again, without keeping an unlocked PIN', async () => {
  await tvPinStorage.save('12345');
  expect(await tvPinStorage.unlock()).toBe('12345');
  expect(await tvPinStorage.unlock()).toBe('12345');
  expect(protectedReads).toHaveLength(2);
  expect(protectedReads[0]).toEqual(protectedWrites[0]);
});

test('canceling authentication returns no PIN and preserves the saved PIN for retry', async () => {
  await tvPinStorage.save('12345');
  authenticate = async () => { throw new Error('Authentication canceled'); };
  await expect(tvPinStorage.unlock()).rejects.toThrow('Authentication canceled');
  expect(await tvPinStorage.hasSavedPin()).toBe(true);
  authenticate = async () => {};
  expect(await tvPinStorage.unlock()).toBe('12345');
});

test('canceling a save does not advertise a saved PIN', async () => {
  authenticate = async () => { throw new Error('Authentication canceled'); };
  await expect(tvPinStorage.save('12345')).rejects.toThrow();
  expect(await tvPinStorage.hasSavedPin()).toBe(false);
  expect(entries.size).toBe(0);
});

test('canceling replacement preserves the previous PIN', async () => {
  await tvPinStorage.save('12345');
  authenticate = async () => { throw new Error('Authentication canceled'); };
  await expect(tvPinStorage.save('54321')).rejects.toThrow();
  authenticate = async () => {};
  expect(await tvPinStorage.unlock()).toBe('12345');
});

test('an invalidated biometric key clears saved status and asks for manual entry', async () => {
  await tvPinStorage.save('12345');
  entries.delete('firetv_child_pin');
  expect(await tvPinStorage.unlock()).toBeNull();
  expect(await tvPinStorage.hasSavedPin()).toBe(false);
});

test('forgetting the TV PIN preserves the remote pairing token and address', async () => {
  entries.set('firetv_pairing_token', 'pairing-token');
  entries.set('firetv_address', '192.0.2.10');
  await tvPinStorage.save('12345');
  await tvPinStorage.forget();
  expect(await tvPinStorage.hasSavedPin()).toBe(false);
  expect(await tvPinStorage.unlock()).toBeNull();
  expect(entries.get('firetv_pairing_token')).toBe('pairing-token');
  expect(entries.get('firetv_address')).toBe('192.0.2.10');
});

test('PIN saving requires enrolled, supported biometrics', async () => {
  available = false;
  expect(tvPinStorage.canUseBiometrics()).toBe(false);
  await expect(tvPinStorage.save('12345')).rejects.toThrow('Set up biometrics');
  expect(entries.size).toBe(0);
});

test('invalid PINs are never saved or returned', async () => {
  for (const pin of ['', '1234', '123456', 'abcde', '12 45']) {
    await expect(tvPinStorage.save(pin)).rejects.toThrow('five-digit');
  }
  expect(entries.size).toBe(0);
  entries.set('firetv_child_pin', 'bad');
  expect(await tvPinStorage.unlock()).toBeNull();
});
