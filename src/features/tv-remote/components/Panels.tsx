import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../theme/colors';
import type { FoundTV } from '../types';
import { FormButton } from './FormButton';
import { PinForm } from './PinForm';

type PairProps = {
  name: string; host: string; tvs: FoundTV[]; pinRequested: boolean; busy: boolean;
  onRequestPin: () => void; onSubmitPin: (pin: string) => void; onChooseTV: (host: string) => void;
};

export function PairPanel({ name, host, tvs, pinRequested, busy, onRequestPin, onSubmitPin, onChooseTV }: PairProps) {
  const others = tvs.filter((tv) => tv.host !== host);
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Pair with {name}</Text>
      <Text style={styles.body}>Show a PIN on the TV, then enter it here. You only do this once.</Text>
      {pinRequested
        ? <PinForm length={4} placeholder="4-digit PIN" submitLabel="Pair" accessibilityLabel="TV pairing PIN" disabled={busy} onSubmit={onSubmitPin} />
        : <FormButton label="Show PIN on TV" onPress={onRequestPin} disabled={busy} />}
      {others.length > 0 ? (
        <View style={styles.others}>
          <Text style={styles.body}>Other TVs on this network</Text>
          {others.map((tv) => (
            <FormButton key={tv.host} label={tv.name ?? tv.host} quiet disabled={busy} onPress={() => onChooseTV(tv.host)} style={styles.other} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

type LinkProps = { label: string; accessibilityLabel?: string; accessibilityHint?: string; disabled: boolean; onPress: () => void };

export function LinkButton({ label, accessibilityLabel, accessibilityHint, disabled, onPress }: LinkProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={14}
      onPress={onPress}
      style={[styles.linkButton, disabled && styles.off]}
    >
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

export function TimerGuide({ onHide }: { onHide: () => void }) {
  return (
    <View style={styles.guide}>
      <View style={styles.guideHeader}>
        <Text style={styles.guideTitle}>On your TV</Text>
        <LinkButton label="Hide" accessibilityLabel="Hide timer guide" disabled={false} onPress={onHide} />
      </View>
      <Text style={styles.body}>Choose Sleep Timer with the arrows and OK, or Off to cancel. No menu? Hold Home on the TV remote.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 14, paddingVertical: 8 },
  title: { color: colors.foam, fontSize: 20, fontWeight: '600' },
  body: { color: colors.mist, fontSize: 14, lineHeight: 20 },
  others: { gap: 10, marginTop: 10 },
  other: { alignSelf: 'flex-start' },
  link: { color: colors.crest, fontSize: 15, fontWeight: '500' },
  linkButton: { paddingVertical: 6 },
  guide: { backgroundColor: colors.deep, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  guideHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  guideTitle: { color: colors.foam, fontSize: 16, fontWeight: '600' },
  off: { opacity: 0.4 },
});
