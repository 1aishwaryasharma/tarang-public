import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { colors } from '../../../theme/colors';
import { FormButton } from './FormButton';

type Props = { length: number; placeholder: string; submitLabel: string; accessibilityLabel: string; disabled: boolean; onSubmit: (pin: string) => void };

export function PinForm({ length, placeholder, submitLabel, accessibilityLabel, disabled, onSubmit }: Props) {
  const [pin, setPin] = useState('');
  return (
    <View style={styles.row}>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        value={pin}
        onChangeText={(text) => setPin(text.replace(/\D/g, ''))}
        keyboardType="number-pad"
        secureTextEntry
        editable={!disabled}
        autoFocus
        maxLength={length}
        placeholder={placeholder}
        placeholderTextColor={colors.mist}
        style={styles.input}
      />
      <FormButton label={submitLabel} onPress={() => onSubmit(pin)} disabled={disabled || pin.length !== length} />
    </View>
  );
}

export const inputStyle = { height: 48, paddingHorizontal: 18, color: colors.foam, backgroundColor: colors.deep, borderRadius: 24, fontSize: 16 } as const;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: { ...inputStyle, flex: 1, letterSpacing: 4 },
});
