import { StyleSheet } from 'react-native';
import type { TVKey } from '../types';
import { colors } from '../../../theme/colors';
import { GlyphText } from './Glyphs';
import { KeyZone, type KeyRemote } from './KeyZone';

type Props = { tvKey: TVKey; glyph: string; accessibilityLabel: string; remote: KeyRemote; disabled: boolean; size?: number; repeat?: boolean; glyphSize?: number };

export function RoundKey({ tvKey, glyph, accessibilityLabel, remote, disabled, size = 64, repeat, glyphSize }: Props) {
  return (
    <KeyZone
      tvKey={tvKey}
      remote={remote}
      repeat={repeat}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      style={(pressed) => [styles.key, { width: size, height: size, borderRadius: size / 2 }, pressed && styles.pressed, disabled && styles.off]}
    >
      {(pressed) => <GlyphText lit={pressed} size={glyphSize}>{glyph}</GlyphText>}
    </KeyZone>
  );
}

const styles = StyleSheet.create({
  key: { backgroundColor: colors.deep, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: colors.ripple },
  off: { opacity: 0.4 },
});
