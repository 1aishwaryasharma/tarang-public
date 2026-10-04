import * as SecureStore from 'expo-secure-store';
import { isTVPin } from '../pinWheel';

const PIN_KEY = 'firetv_child_pin';
const SAVED_KEY = 'firetv_child_pin_saved';
const options: SecureStore.SecureStoreOptions = {
  keychainService: 'tarang.tv-pin',
  requireAuthentication: true,
  authenticationPrompt: 'Unlock your TV PIN',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const tvPinStorage = {
  canUseBiometrics: () => SecureStore.canUseBiometricAuthentication(),
  hasSavedPin: async () => (await SecureStore.getItemAsync(SAVED_KEY)) === 'true',
  async save(pin: string): Promise<void> {
    if (!isTVPin(pin)) throw new Error('Enter a five-digit TV PIN.');
    if (!SecureStore.canUseBiometricAuthentication()) throw new Error('Set up biometrics on this phone first.');
    await SecureStore.setItemAsync(PIN_KEY, pin, options);
    await SecureStore.setItemAsync(SAVED_KEY, 'true');
  },
  async unlock(): Promise<string | null> {
    const pin = await SecureStore.getItemAsync(PIN_KEY, options);
    if (pin !== null && isTVPin(pin)) return pin;
    await tvPinStorage.forget();
    return null;
  },
  async forget(): Promise<void> {
    await SecureStore.deleteItemAsync(PIN_KEY, options);
    await SecureStore.deleteItemAsync(SAVED_KEY);
  },
};
