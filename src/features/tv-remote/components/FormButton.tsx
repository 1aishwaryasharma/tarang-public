import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { colors } from '../../../theme/colors';

type Props = { label: string; onPress: () => void; disabled?: boolean; quiet?: boolean; style?: ViewStyle; accessibilityLabel?: string; accessibilityHint?: string };

/** A step button (Connect, Pair, Send) that fires on release, unlike a remote key. */
export function FormButton({ label, onPress, disabled, quiet, style, accessibilityLabel, accessibilityHint }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, quiet && styles.quiet, disabled && styles.off, pressed && !disabled && styles.pressed, style]}
    >
      <Text style={[styles.label, quiet && styles.quietLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { height: 48, paddingHorizontal: 20, borderRadius: 24, backgroundColor: colors.crest, alignItems: 'center', justifyContent: 'center' },
  quiet: { backgroundColor: colors.deep },
  off: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
  label: { color: colors.crestText, fontSize: 15, fontWeight: '600' },
  quietLabel: { color: colors.foam },
});
