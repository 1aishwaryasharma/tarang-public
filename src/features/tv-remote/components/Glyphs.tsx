import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../theme/colors';

export type Direction = 'up' | 'right' | 'down' | 'left';

const TURN: Record<Direction, string> = { up: '45deg', right: '135deg', down: '225deg', left: '-45deg' };

/** A drawn chevron, so arrows stay crisp and identical in every font. */
export function Chevron({ direction, size = 14, lit }: { direction: Direction; size?: number; lit?: boolean }) {
  return (
    <View
      style={[
        styles.chevron,
        { width: size, height: size, transform: [{ rotate: TURN[direction] }], marginTop: direction === 'up' ? size / 3 : direction === 'down' ? -size / 3 : 0, marginLeft: direction === 'left' ? size / 3 : direction === 'right' ? -size / 3 : 0 },
        lit && styles.lit,
      ]}
    />
  );
}

export function GlyphText({ children, lit, size = 20 }: { children: string; lit?: boolean; size?: number }) {
  return <Text style={[styles.text, { fontSize: size }, lit && styles.litText]}>{children}</Text>;
}

const styles = StyleSheet.create({
  chevron: { borderTopWidth: 2.5, borderLeftWidth: 2.5, borderColor: colors.mist, borderTopLeftRadius: 2 },
  lit: { borderColor: colors.crest },
  text: { color: colors.foam, fontWeight: '500' },
  litText: { color: colors.crest },
});
