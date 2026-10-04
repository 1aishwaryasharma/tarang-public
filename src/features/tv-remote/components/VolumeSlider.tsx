import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '../../../theme/colors';
import type { TVKey } from '../types';
import { GlyphText } from './Glyphs';
import type { KeyRemote } from './KeyZone';

// The TV reports no volume level, so the slider is relative: the handle rests in the middle and each step of drag sends one press.
const STEP = 20;
const TAP_SLOP = 6;
const DRAIN_MS = 90;
const THUMB = 44;

type Props = { remote: KeyRemote; disabled: boolean };

export function VolumeSlider({ remote, disabled }: Props) {
  const [sent, setSent] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const offset = useRef(new Animated.Value(0)).current;
  const latest = useRef({ remote, disabled, reach: 0 });
  latest.current = { remote, disabled, reach: Math.max(0, trackWidth / 2 - THUMB / 2 - 6) };
  const drain = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const trackWidthRef = useRef(0);
  trackWidthRef.current = trackWidth;

  const responder = useMemo(() => {
    const drag = { target: 0, sent: 0, startX: 0 };
    const step = () => {
      const owed = drag.target - drag.sent;
      if (owed === 0) return;
      const key: TVKey = owed > 0 ? 'volumeUp' : 'volumeDown';
      // A full queue refuses the press; the drain retries it, and release drops whatever is still owed.
      if (!latest.current.remote.sendKey(key)) return;
      drag.sent += Math.sign(owed);
      setSent(drag.sent);
      void Haptics.selectionAsync().catch(() => undefined);
    };
    const finish = () => {
      clearInterval(drain.current);
      Animated.spring(offset, { toValue: 0, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
      setSent(0);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.disabled,
      onMoveShouldSetPanResponder: () => !latest.current.disabled,
      onPanResponderGrant: (event) => {
        Object.assign(drag, { target: 0, sent: 0, startX: event.nativeEvent.locationX });
        clearInterval(drain.current);
        drain.current = setInterval(step, DRAIN_MS);
      },
      onPanResponderMove: (_, { dx }) => {
        const { reach } = latest.current;
        offset.setValue(Math.max(-reach, Math.min(reach, dx)));
        drag.target = Math.trunc(dx / STEP);
        step();
      },
      onPanResponderRelease: (_, { dx, dy }) => {
        if (Math.hypot(dx, dy) < TAP_SLOP && drag.sent === 0) {
          // A tap on either end is one step, like the old − and + keys.
          const third = trackWidthRef.current / 3;
          if (drag.startX < third) drag.target = -1;
          else if (drag.startX > third * 2) drag.target = 1;
          step();
        }
        finish();
      },
      onPanResponderTerminate: finish,
    });
  }, [offset]);

  useEffect(() => () => clearInterval(drain.current), []);

  return (
    <View
      {...responder.panHandlers}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Volume. Drag right to turn up, left to turn down."
      accessibilityState={{ disabled }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={({ nativeEvent: { actionName } }) => {
        if (disabled) return;
        if (actionName === 'increment') remote.sendKey('volumeUp');
        if (actionName === 'decrement') remote.sendKey('volumeDown');
      }}
      style={[styles.track, disabled && styles.off]}
    >
      <View style={styles.ends} pointerEvents="none">
        <GlyphText size={24}>−</GlyphText>
        <View style={styles.line} />
        <GlyphText size={24}>+</GlyphText>
      </View>
      <Animated.View pointerEvents="none" style={[styles.thumb, sent !== 0 && styles.thumbActive, { transform: [{ translateX: offset }] }]}>
        {sent !== 0 ? <Text style={styles.count}>{sent > 0 ? `+${sent}` : `−${-sent}`}</Text> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flex: 1, height: 64, borderRadius: 32, backgroundColor: colors.deep, justifyContent: 'center', alignItems: 'center' },
  off: { opacity: 0.4 },
  ends: { position: 'absolute', left: 22, right: 22, flexDirection: 'row', alignItems: 'center', gap: 14 },
  line: { flex: 1, height: 2, borderRadius: 1, backgroundColor: colors.ripple },
  thumb: { width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: colors.ripple, borderWidth: 2, borderColor: colors.mist, alignItems: 'center', justifyContent: 'center' },
  thumbActive: { backgroundColor: colors.crest, borderColor: colors.crest },
  count: { color: colors.crestText, fontSize: 13, fontWeight: '700' },
});
