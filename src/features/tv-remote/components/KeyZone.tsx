import type { ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useHoldRepeat } from '../hooks/useHoldRepeat';
import type { TVKey } from '../types';

/** sendKey reports whether the press was queued; a full queue refuses it. */
export type KeyRemote = { sendKey(key: TVKey): boolean; repeatKey(key: TVKey): void };

type Props = {
  tvKey: TVKey;
  remote: KeyRemote;
  accessibilityLabel: string;
  repeat?: boolean;
  disabled?: boolean;
  style?: (pressed: boolean) => StyleProp<ViewStyle>;
  children: (pressed: boolean) => ReactNode;
};

// TalkBack double-tap and Switch Access perform 'activate', which never reaches onPressIn.
const ACCESSIBILITY_ACTIONS = [{ name: 'activate' as const }];

function tap() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

/** A remote key with any look: fires on touch-down with a light haptic, and with repeat keeps firing while held. */
export function KeyZone({ tvKey, remote, accessibilityLabel, repeat, disabled, style, children }: Props) {
  const onPress = () => remote.sendKey(tvKey);
  const hold = useHoldRepeat({ onPress, onRepeat: repeat ? () => remote.repeatKey(tvKey) : undefined, disabled });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      accessibilityActions={ACCESSIBILITY_ACTIONS}
      onAccessibilityAction={(event) => { if (!disabled && event.nativeEvent.actionName === 'activate') onPress(); }}
      onPressIn={() => { tap(); hold.onPressIn(); }}
      onPressOut={hold.onPressOut}
      disabled={disabled}
      style={({ pressed }) => style?.(pressed && !disabled)}
    >
      {({ pressed }) => children(pressed && !disabled)}
    </Pressable>
  );
}
