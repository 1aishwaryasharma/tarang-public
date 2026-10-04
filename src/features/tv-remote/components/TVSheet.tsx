import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../../../theme/colors';
import { FormButton } from './FormButton';
import { inputStyle } from './PinForm';

type Props = {
  visible: boolean; name: string; paired: boolean; address: string;
  onChangeAddress: (value: string) => void; onConnect: () => void; onForget: () => void; onClose: () => void;
};

/** The rarely needed TV details, opened from the status line; it drops from the top so the keyboard never covers it. */
export function TVSheet({ visible, name, paired, address, onChangeAddress, onConnect, onForget, onClose }: Props) {
  const confirmForget = () => Alert.alert(`Forget ${name}?`, 'You’ll need a PIN from the TV to pair again.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Forget', style: 'destructive', onPress: () => { onClose(); onForget(); } },
  ]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close TV settings" />
      <View style={styles.sheet}>
        <Text style={styles.title}>Your TV</Text>
        <Text style={styles.body}>{name}. The app finds your TV on Wi‑Fi by itself; type an address only if it can’t.</Text>
        <TextInput
          accessibilityLabel="TV address"
          value={address}
          onChangeText={onChangeAddress}
          keyboardType="numeric"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={15}
          placeholder="192.168.1.100"
          placeholderTextColor={colors.mist}
          style={[inputStyle, styles.input]}
        />
        <View style={styles.actions}>
          <FormButton label="Done" quiet onPress={onClose} />
          <FormButton label="Connect" onPress={onConnect} accessibilityLabel="Connect to TV" />
        </View>
        {paired ? <FormButton label="Forget this TV" quiet onPress={confirmForget} style={styles.forget} /> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(3, 11, 30, 0.8)' },
  sheet: { marginTop: 52, marginHorizontal: 16, padding: 22, borderRadius: 28, backgroundColor: colors.deep, gap: 14 },
  title: { color: colors.foam, fontSize: 20, fontWeight: '600' },
  body: { color: colors.mist, fontSize: 14, lineHeight: 20 },
  input: { backgroundColor: colors.night },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  forget: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
