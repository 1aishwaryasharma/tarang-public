import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

function subscribe(onChange: () => void): () => void {
  const subscription = AppState.addEventListener('change', onChange);
  return () => subscription.remove();
}

function isActive(): boolean {
  const state = AppState.currentState;
  return state === 'active' || state === 'unknown';
}

export function useAppActive(): boolean {
  return useSyncExternalStore(subscribe, isActive);
}
