import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../theme/colors';
import { FormButton } from './FormButton';
import { KeyZone, type KeyRemote } from './KeyZone';
import { LinkButton, TimerGuide } from './Panels';
import { Ring } from './Ring';
import { RoundKey } from './RoundKey';
import { VolumeSlider } from './VolumeSlider';

type Props = {
  remote: KeyRemote; disabled: boolean; width: number; onTypePin: () => void; onSleep: () => void;
  /** Resolves to whether the Home hold may have reached the TV. */
  onOpenTVSettings: () => Promise<boolean>;
};

// Remote keys fire on touch-down, so the screen never scrolls: the ring takes whatever height the other rows leave.
export function RemoteControls({ remote, disabled, width, onTypePin, onSleep, onOpenTVSettings }: Props) {
  const [guideVisible, setGuideVisible] = useState(false);
  const [ringSpace, setRingSpace] = useState<number | null>(null);
  const ringSize = Math.min(width - 72, 300, ringSpace ?? Infinity);
  const openTVSettings = async () => {
    if (await onOpenTVSettings()) setGuideVisible(true);
  };
  return (
    <View style={styles.layout}>
      {guideVisible ? <TimerGuide onHide={() => setGuideVisible(false)} /> : null}
      <View style={styles.ringSpace} onLayout={(event) => setRingSpace(event.nativeEvent.layout.height)}>
        <Ring size={ringSize} remote={remote} disabled={disabled} />
      </View>
      <View style={styles.keys}>
        <RoundKey tvKey="back" glyph="↩" accessibilityLabel="Back" remote={remote} disabled={disabled} glyphSize={28} />
        <RoundKey tvKey="home" glyph="⌂" accessibilityLabel="Home" remote={remote} disabled={disabled} glyphSize={24} />
        <RoundKey tvKey="playPause" glyph="▶❚❚" accessibilityLabel="Play or pause" remote={remote} disabled={disabled} glyphSize={15} />
      </View>
      <View style={styles.sound}>
        <VolumeSlider remote={remote} disabled={disabled} />
        <KeyZone
          tvKey="mute"
          remote={remote}
          disabled={disabled}
          accessibilityLabel="Mute"
          style={(pressed) => [styles.mute, pressed && styles.mutePressed, disabled && styles.off]}
        >
          {(pressed) => <Text style={[styles.muteText, pressed && styles.lit]}>Mute</Text>}
        </KeyZone>
      </View>
      <View style={styles.actions}>
        <LinkButton label="Type TV PIN" accessibilityLabel="Type the TV's PIN" disabled={disabled} onPress={onTypePin} />
        <LinkButton label="Sleep TV" accessibilityHint="Puts the TV in standby. Use Wake TV to turn it back on." disabled={disabled} onPress={onSleep} />
      </View>
      <FormButton
        label={guideVisible ? 'Reopen TV settings' : 'Open TV sleep timer'}
        accessibilityHint="Holds Home to request Quick Settings on the TV. Choose Sleep Timer on the TV."
        quiet
        disabled={disabled}
        onPress={() => { void openTVSettings(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { flex: 1, gap: 20 },
  ringSpace: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  keys: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 12 },
  sound: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mute: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.deep, alignItems: 'center', justifyContent: 'center' },
  mutePressed: { backgroundColor: colors.ripple },
  muteText: { color: colors.mist, fontSize: 13, fontWeight: '500' },
  lit: { color: colors.crest },
  off: { opacity: 0.4 },
  actions: { flexDirection: 'row', justifyContent: 'space-around' },
});
