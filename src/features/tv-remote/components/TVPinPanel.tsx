import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, Switch, Text, View } from 'react-native';
import { colors } from '../../../theme/colors';
import { TV_PIN_LENGTH } from '../pinWheel';
import { tvPinStorage } from '../storage/tvPinStorage';
import { FormButton } from './FormButton';
import { PinForm } from './PinForm';

type Props = { disabled: boolean; onSend: (pin: string) => boolean; onClose: () => void };
type Mode = 'loading' | 'saved' | 'manual';

export function TVPinPanel({ disabled, onSend, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('loading');
  const [hasSavedPin, setHasSavedPin] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const running = useRef(false);
  const biometricsAvailable = tvPinStorage.canUseBiometrics();

  useEffect(() => {
    mounted.current = true;
    tvPinStorage.hasSavedPin().then((saved) => {
      if (!mounted.current) return;
      setHasSavedPin(saved);
      setMode(saved ? 'saved' : 'manual');
    }).catch(() => {
      if (!mounted.current) return;
      setMode('manual');
      setError('Could not check for a saved PIN. You can still enter it manually.');
    });
    return () => { mounted.current = false; };
  }, []);

  const run = async (action: () => Promise<void>, failure: string) => {
    if (running.current || disabled) return;
    running.current = true;
    setBusy(true);
    setError(null);
    Keyboard.dismiss();
    try {
      await action();
    } catch {
      if (mounted.current) setError(failure);
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const send = (pin: string) => {
    if (!mounted.current) return;
    if (onSend(pin)) onClose();
    else setError('PIN was not sent. Wait for the remote to be ready, then try again.');
  };

  const sendSaved = () => run(async () => {
    const pin = await tvPinStorage.unlock();
    if (!mounted.current) return;
    if (pin === null) {
      setHasSavedPin(false);
      setMode('manual');
      setError('The saved PIN is no longer available. Enter it again to save it.');
      return;
    }
    send(pin);
  }, 'PIN was not sent. Try biometrics again or enter the PIN manually.');

  const sendManual = (pin: string) => run(async () => {
    if (remember) {
      await tvPinStorage.save(pin);
      if (!mounted.current) return;
      setHasSavedPin(true);
    }
    send(pin);
  }, 'Could not finish saving. PIN was not sent. Try again, or turn off saving to send it once.');

  const forget = () => run(async () => {
    await tvPinStorage.forget();
    if (!mounted.current) return;
    setHasSavedPin(false);
    setRemember(false);
    setMode('manual');
  }, 'Could not forget the saved PIN. Try again.');

  const blocked = disabled || busy;

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>TV PIN</Text>
      <Text style={styles.body}>Open the TV's PIN prompt and leave it empty before sending.</Text>
      {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.body, styles.error]}>{error}</Text> : null}
      {mode === 'loading' ? <Text style={styles.body}>Checking saved PIN…</Text> : mode === 'saved' ? (
        <>
          <FormButton label={busy ? 'Please wait…' : 'Use saved PIN'} accessibilityLabel="Unlock and send saved TV PIN with biometrics" disabled={blocked || !biometricsAvailable} onPress={() => { void sendSaved(); }} />
          <Text style={styles.body}>{biometricsAvailable ? 'Confirm with your fingerprint or face to send your saved PIN.' : 'Biometrics are unavailable. Enter the PIN manually, or set up biometrics in your phone settings.'}</Text>
          <FormButton label="Enter PIN manually" quiet disabled={blocked} onPress={() => { setMode('manual'); setError(null); }} />
        </>
      ) : (
        <>
          <PinForm length={TV_PIN_LENGTH} placeholder={`${TV_PIN_LENGTH}-digit PIN`} submitLabel={busy ? 'Wait…' : 'Send'} accessibilityLabel="TV PIN" disabled={blocked} onSubmit={(pin) => { void sendManual(pin); }} />
          {biometricsAvailable ? (
            <View style={styles.remember}>
              <Text style={[styles.body, styles.rememberLabel]}>{hasSavedPin ? 'Replace saved PIN' : 'Save PIN with biometrics'}</Text>
              <Switch accessibilityLabel={hasSavedPin ? 'Replace saved PIN with biometrics' : 'Save PIN with biometrics'} value={remember} onValueChange={setRemember} disabled={blocked} trackColor={{ true: colors.crest }} />
            </View>
          ) : <Text style={styles.body}>Set up biometrics on this phone to save your PIN securely.</Text>}
          {hasSavedPin ? <FormButton label="Use saved PIN" quiet disabled={blocked} onPress={() => { setMode('saved'); setError(null); }} /> : null}
        </>
      )}
      <View style={styles.actions}>
        <FormButton label="Cancel" quiet disabled={busy} onPress={onClose} />
        {hasSavedPin ? <FormButton label="Forget saved PIN" quiet disabled={blocked} onPress={() => { void forget(); }} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12, paddingVertical: 8 },
  title: { color: colors.foam, fontSize: 20, fontWeight: '600' },
  body: { color: colors.mist, fontSize: 14, lineHeight: 20 },
  error: { color: colors.coral },
  remember: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rememberLabel: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
