import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../theme/colors';
import { Chevron, type Direction } from './Glyphs';
import { KeyZone, type KeyRemote } from './KeyZone';

type Props = { size: number; remote: KeyRemote; disabled: boolean };

const LABELS: Record<Direction, string> = { up: 'Up', right: 'Right', down: 'Down', left: 'Left' };

/** The D-pad as one wheel: four direction zones around a centre OK, like the physical remote. */
export function Ring({ size, remote, disabled }: Props) {
  const center = size * 0.42;
  const band = (size - center) / 2;
  const span = size * 0.56;
  const zone: Record<Direction, object> = {
    up: { top: 0, left: (size - span) / 2, width: span, height: band },
    down: { bottom: 0, left: (size - span) / 2, width: span, height: band },
    left: { left: 0, top: (size - span) / 2, width: band, height: span },
    right: { right: 0, top: (size - span) / 2, width: band, height: span },
  };
  return (
    <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, disabled && styles.off]}>
      {(Object.keys(zone) as Direction[]).map((direction) => (
        <KeyZone key={direction} tvKey={direction} remote={remote} repeat disabled={disabled} accessibilityLabel={LABELS[direction]} style={() => [styles.zone, zone[direction]]}>
          {(pressed) => <Chevron direction={direction} size={size * 0.05} lit={pressed} />}
        </KeyZone>
      ))}
      <KeyZone
        tvKey="select"
        remote={remote}
        disabled={disabled}
        accessibilityLabel="Select"
        style={(pressed) => [styles.ok, { width: center, height: center, borderRadius: center / 2, top: band, left: band }, pressed && styles.okPressed]}
      >
        {() => <Text style={styles.okText}>OK</Text>}
      </KeyZone>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { backgroundColor: colors.deep, alignSelf: 'center' },
  off: { opacity: 0.4 },
  zone: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ok: { position: 'absolute', backgroundColor: colors.ripple, alignItems: 'center', justifyContent: 'center' },
  okPressed: { backgroundColor: colors.crest },
  okText: { color: colors.foam, fontSize: 18, fontWeight: '600', letterSpacing: 0.5 },
});
