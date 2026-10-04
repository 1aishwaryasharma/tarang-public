import { useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import { PairPanel } from './src/features/tv-remote/components/Panels';
import { TVPinPanel } from './src/features/tv-remote/components/TVPinPanel';
import { RemoteControls } from './src/features/tv-remote/components/RemoteControls';
import { StatusRow } from './src/features/tv-remote/components/StatusRow';
import { TVSheet } from './src/features/tv-remote/components/TVSheet';
import { useTVRemote } from './src/features/tv-remote/hooks/useTVRemote';
import { colors } from './src/theme/colors';

export default function App() {
  const remote = useTVRemote();
  const { width } = useWindowDimensions();
  const [tvSheetOpen, setTVSheetOpen] = useState(false);
  const [typingTVPin, setTypingTVPin] = useState(false);
  const pairing = remote.needsPairing || remote.pinRequested;
  const tvName = remote.tvName ?? 'Fire TV';

  const closeTVSheet = () => {
    if (remote.addressDiverged) remote.setAddress(remote.link.host);
    setTVSheetOpen(false);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <NavigationBar style="dark" />
      <StatusRow
        name={tvName}
        health={remote.link.health}
        standby={remote.link.standby}
        activity={remote.activity}
        needsPairing={remote.needsPairing}
        error={remote.error?.message ?? null}
        onConnect={() => { void remote.connect(); }}
        onWake={() => { void remote.wake(); }}
        onOpenTV={() => setTVSheetOpen(true)}
      />
      <View style={styles.body}>
        {pairing ? (
          <PairPanel
            name={tvName}
            host={remote.link.host}
            tvs={remote.tvs}
            pinRequested={remote.pinRequested}
            busy={remote.busy}
            onRequestPin={() => { void remote.requestPairing(); }}
            onSubmitPin={(pin) => { void remote.submitPin(pin); }}
            onChooseTV={(host) => { void remote.chooseTV(host); }}
          />
        ) : typingTVPin ? (
          <ScrollView keyboardShouldPersistTaps="handled">
            <TVPinPanel
              disabled={!remote.canControl}
              onSend={remote.typeTVPin}
              onClose={() => { Keyboard.dismiss(); setTypingTVPin(false); }}
            />
          </ScrollView>
        ) : (
          // Remounts for another TV or a sleep, so the timer guide never outlives the TV menu it describes.
          <RemoteControls
            key={`${remote.link.host}:${remote.link.standby}`}
            remote={remote}
            disabled={!remote.canControl}
            width={width}
            onTypePin={() => setTypingTVPin(true)}
            onSleep={() => { void remote.sleep(); }}
            onOpenTVSettings={remote.openTVSettings}
          />
        )}
      </View>
      <TVSheet
        visible={tvSheetOpen}
        name={tvName}
        paired={remote.link.paired}
        address={remote.address}
        onChangeAddress={remote.setAddress}
        onConnect={() => { setTVSheetOpen(false); void remote.connect(); }}
        onForget={() => { void remote.forgetTV(); }}
        onClose={closeTVSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night, paddingTop: 56, paddingBottom: 44, paddingHorizontal: 24 },
  body: { flex: 1, marginTop: 20 },
});
