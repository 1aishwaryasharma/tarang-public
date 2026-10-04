import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../theme/colors';
import type { Activity, LinkHealth, Standby } from '../types';
import { FormButton } from './FormButton';

const ACTIVITY_TEXT: Record<Exclude<Activity, 'idle'>, string> = {
  connecting: 'Connecting…',
  searching: 'Looking for your TV…',
  waking: 'Waking TV…',
  sleeping: 'Sending sleep…',
  openingTVSettings: 'Opening TV settings…',
  requestingPin: 'Pairing…',
  verifyingPin: 'Pairing…',
  forgetting: 'Forgetting…',
};

const STANDBY_TEXT: Record<Exclude<Standby, 'none'>, string> = { requested: 'Sleep requested', uncertain: 'Sleep unconfirmed' };

const HEALTH_TEXT: Record<LinkHealth, string> = { online: 'Connected', stale: 'Unstable', offline: 'Not connected' };

type Props = { name: string; health: LinkHealth; standby: Standby; activity: Activity; needsPairing: boolean; error: string | null; onConnect: () => void; onWake: () => void; onOpenTV: () => void };

export function StatusRow({ name, health, standby, activity, needsPairing, error, onConnect, onWake, onOpenTV }: Props) {
  const busy = activity !== 'idle';
  const asleep = standby !== 'none';
  const text = busy ? ACTIVITY_TEXT[activity] : asleep ? STANDBY_TEXT[standby] : needsPairing ? 'Not paired yet' : HEALTH_TEXT[health];
  const dot = busy || asleep || needsPairing || health === 'stale' ? styles.pending : health === 'online' ? styles.online : styles.offline;
  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${text}. Opens TV settings.`} onPress={onOpenTV} style={styles.identity} hitSlop={8}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <View style={styles.statusLine}>
            <View style={[styles.dot, dot]} />
            <Text style={styles.status}>{text}</Text>
          </View>
        </Pressable>
        {busy ? null : asleep ? <FormButton label="Wake TV" onPress={onWake} />
          : health !== 'online' ? <FormButton label="Connect" onPress={onConnect} accessibilityLabel="Connect to TV" /> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="TV settings" onPress={onOpenTV} style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
          <Text style={styles.moreText}>⋯</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  identity: { flex: 1 },
  name: { color: colors.foam, fontSize: 20, fontWeight: '600' },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  online: { backgroundColor: colors.online },
  pending: { backgroundColor: colors.crest },
  offline: { backgroundColor: colors.coral },
  status: { color: colors.mist, fontSize: 14 },
  more: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: colors.deep },
  moreText: { color: colors.mist, fontSize: 22, marginTop: -6 },
  error: { color: colors.coral, fontSize: 14, lineHeight: 20 },
});
