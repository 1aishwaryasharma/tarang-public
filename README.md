# Tarang TV Remote

Tarang is an Android remote for Fire TV devices on the same Wi-Fi network. It pairs with the PIN shown on the TV and sends commands through the TV's local Lightning service. It does not use a cloud account.

The app was developed and tested with one Insignia Fire TV running Fire OS 7. Other Fire TV models may behave differently. Tarang is an independent project and is not affiliated with Amazon or Insignia.

## Features

- Navigate with the D-pad, Back, Home, Play/Pause, and volume controls.
- Find a Fire TV on the local network, pair with its on-screen PIN, and save the pairing in Android SecureStore.
- Wake a TV with a DIAL request or ask it to enter standby.
- Send a five-digit Child PIN with the TV's on-screen PIN wheel. Optionally store that PIN behind phone biometrics.
- Open the TV's Quick Settings with a held Home command so you can set its built-in sleep timer. This path still needs a physical device test.

The pairing token and Child PIN stay on the phone. Tarang checks the TV's certificate before sending the pairing token. The initial connection must be made on a network you trust because the app has not pinned a certificate yet.

## Build

You need Bun, JDK 17, the Android SDK, and an Android phone or emulator. Expo Go cannot run the custom Kotlin transport module.

```sh
bun install
bun run typecheck
bun test
bun run build:android
```

The build writes `android/app/build/outputs/apk/release/app-release.apk`. It uses a local Android debug signing key for personal builds, not Play Store signing. The build script saves the key in the ignored `.local/` directory so later builds can update an installed copy. Keep that key private and back it up if you use this build for updates.

## Connect

Install the APK on an Android phone on the same network as the TV. On a new install, Tarang searches for Fire TVs and connects to one whose remote service answers. If it finds only a sleeping TV, it shows its discovered address for a manual Connect attempt. You can enter a TV's IPv4 address in the TV settings panel if discovery fails. Connect searches again when the address is empty. Opening the app does not wake the TV; tapping Connect may send a wake request.

Tap **Show PIN on TV**, enter the four-digit PIN displayed on the TV, and tap **Pair**. Tarang stores the pairing token and the certificate fingerprint presented by that TV. The app checks the certificate on later requests and stops if it changes. Use **Forget this TV** to delete the phone's saved pairing. That action does not revoke the token on the TV.

**Sleep TV** requests immediate standby; it cannot confirm the screen's power state. **Open TV sleep timer** requests Quick Settings, where you set or cancel the timer on the TV itself. Tarang does not read or set timer durations through an API.

## Development

`bun run start` starts Metro for a development build. Choose an Android phone or emulator explicitly when installing a development build. `bun run typecheck` checks TypeScript and `bun test` runs the protocol and storage tests.

## Security and license

To report a vulnerability, use GitHub's private vulnerability reporting for this repository. See [SECURITY.md](SECURITY.md).

Tarang is licensed under the [MIT License](LICENSE). The Expo module license in `modules/fire-tv-transport/LICENSE` covers upstream Expo code included in that module.
