# Tabby Games

Two-player games for kids (about 4–8 years old), played **on one shared tablet screen at the same time**: one player sits at each short end of a landscape tablet. Built with [Phaser 3](https://phaser.io), TypeScript and Vite, and packaged for Android and iOS with [Capacitor](https://capacitorjs.com).

22 games: Air Hockey, Pong, Table Football, Hungry Hippos, Fishing Pond, Curling, Milk Race, Sumo Bumpers, Snake Duel, Snowball Fight, Cannon Duel, Balloon Pop Race, Bin Basketball, Penalty Shootout, Marble Flick, Whack-a-Mole, Tug of War, Connect 4, Dots & Boxes, Tic-Tac-Toe, Safe Cracker, Yarn Catch.

> **Note:** the app id `nl.tabbygames.app` is a **placeholder**. Change it before any store upload (see [Changing the app id](#changing-the-app-id)).

---

## Contents

1. [Requirements](#requirements)
2. [Install and run in the browser](#install-and-run-in-the-browser)
3. [Android](#android) (macOS and Windows)
4. [iOS](#ios) (macOS only)
5. [Release builds](#release-builds)
6. [Tests](#tests)
7. [Project layout and adding a game](#project-layout-and-adding-a-game)
8. [Troubleshooting](#troubleshooting)

---

## Requirements

| Tool | Version | Needed for |
|---|---|---|
| Node.js | **22 or newer** (includes npm) | everything |
| Git | any recent | cloning |
| JDK | **21** | Android (Android Studio ships one, see below) |
| Android Studio | current stable (with Android SDK 36) | Android |
| Xcode | current stable (iOS 15+ deployment target) | iOS, **macOS only** |

**Windows cannot build the iOS app.** Apple only allows iOS builds on macOS (Xcode). On Windows you can build and run the Android app and the browser version; for iOS use a Mac (or a cloud Mac / CI such as GitHub Actions `macos` runners).

### macOS setup

```sh
# Node 22+ (Homebrew example; nvm/fnm also work)
brew install node git

# Android: install Android Studio from https://developer.android.com/studio
# then open it once and install the Android SDK (SDK Manager -> Android 16 / API 36 + Platform-Tools).

# iOS: install Xcode from the App Store, then
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
```

Add the Android tools to your shell (`~/.zshrc`), then open a new terminal:

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools"
# Use the JDK that ships with Android Studio:
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

### Windows setup

Install with [winget](https://learn.microsoft.com/windows/package-manager/winget/) (or download the installers):

```powershell
winget install OpenJS.NodeJS
winget install Git.Git
winget install Google.AndroidStudio
```

Open Android Studio once and install the Android SDK (SDK Manager -> Android 16 / API 36 + Platform-Tools). Then set these environment variables (Start -> "Edit the system environment variables"), and open a **new** terminal:

```powershell
# Typical locations - adjust if yours differ
setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
setx JAVA_HOME "C:\Program Files\Android\Android Studio\jbr"
# add to PATH:  %ANDROID_HOME%\platform-tools
```

Check:

```powershell
node -v      # v22 or newer
adb version
```

---

## Install and run in the browser

```sh
git clone https://github.com/ouzmpasa/tabby-games.git
cd tabby-games
npm install

npm run dev        # http://localhost:5173 (also reachable from other devices on your Wi-Fi)
```

Handy URL options (dev server):

| URL | What it does |
|---|---|
| `/?game=airhockey` | jump straight into a game (ids are the folder names in `src/games/`) |
| `/?nosplash` | skip the splash screen |
| `/?dev=1` | keyboard stand-in for player 2 (arrow keys / WASD move a finger inside the right half, Space/Enter presses) |

The mouse acts as one finger. Left half = player 1 (orange), right half = player 2 (blue). Real multi-touch needs a touch screen or the device builds below.

Production web build (type-checks first, output in `dist/`):

```sh
npm run build
npm run preview    # serves dist/ on http://localhost:4173
```

---

## Android

Everything below works the same on **macOS and Windows** except where noted.

### One-time device setup

1. On the tablet: Settings -> About tablet -> tap **Build number** 7 times.
2. Settings -> System -> Developer options -> enable **USB debugging**.
3. Connect the tablet with a **data** USB cable (charge-only cables won't show up), set USB mode to **File transfer**, and accept the "Allow USB debugging?" prompt.
4. Check that it is listed:

```sh
adb devices          # the tablet must show as "device" (not "unauthorized")
```

(No cable? Android 11+ supports Developer options -> **Wireless debugging**: `adb pair <ip>:<port>` then `adb connect <ip>:<port>`.)

### Build and run on the tablet

```sh
npm install                  # once
npm run build                # compile the web app into dist/
npx cap sync android         # copy dist/ and plugins into the Android project
npx cap run android          # pick your tablet from the list, builds + installs + launches
```

Skip the interactive list with `npx cap run android --target <id>` (the id is the first column of `adb devices`).

### Android Studio (any OS)

```sh
npm run build && npx cap sync android
npx cap open android         # opens the project in Android Studio; press Run with your tablet selected
```

### Build a debug APK from the command line

macOS / Linux:

```sh
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n nl.tabbygames.app/.MainActivity
```

Windows (PowerShell):

```powershell
cd android
.\gradlew.bat assembleDebug
adb install -r app\build\outputs\apk\debug\app-debug.apk
adb shell am start -n nl.tabbygames.app/.MainActivity
```

The APK is at `android/app/build/outputs/apk/debug/app-debug.apk`; you can also copy it to a tablet and open it there (allow "install unknown apps").

### Live reload on the tablet (Wi-Fi)

The Mac/PC and the tablet must be on the same network:

```sh
npx cap run android -l --external
```

### Debug the WebView

Open `chrome://inspect` in Chrome on your computer and click **inspect** under the Tabby Games WebView.

---

## iOS

**macOS only** (needs Xcode). The iOS project uses Swift Package Manager, so there is no CocoaPods step.

### Simulator

```sh
npm install
npm run build
npx cap sync ios
xcrun simctl list devices available | grep iPad     # find an iPad simulator
npx cap run ios --target "<iPad simulator name or id>"
```

### Real iPad / iPhone

```sh
npm run build && npx cap sync ios
npx cap open ios             # opens ios/App/App.xcodeproj in Xcode
```

In Xcode:

1. Select the **App** project -> **App** target -> **Signing & Capabilities**.
2. Tick *Automatically manage signing* and pick your **Team** (a free Apple ID works for testing on your own device; the app expires after 7 days. A paid Apple Developer account is needed for TestFlight / App Store).
3. Change the **Bundle Identifier** if `nl.tabbygames.app` is already taken (see [Changing the app id](#changing-the-app-id)).
4. Choose your device at the top and press **Run**.
5. First launch on the device: Settings -> General -> **VPN & Device Management** -> trust your developer profile.

Debug the WebView: Safari -> Develop menu -> your device -> Tabby Games (enable Safari's Develop menu and the device's Settings -> Safari -> Advanced -> Web Inspector first).

---

## Release builds

### Android (Play Store)

1. Create an upload keystore **once and keep it safe, never commit it** (`*.keystore` / `*.jks` are git-ignored):

   ```sh
   keytool -genkey -v -keystore tabby-release.keystore -alias tabby -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Build the bundle (`.aab`) for the Play Store, or an APK:

   ```sh
   npm run build && npx cap sync android
   cd android
   ./gradlew bundleRelease        # Windows: .\gradlew.bat bundleRelease
   ./gradlew assembleRelease      # APK instead of AAB
   ```

3. Sign it: configure a `signingConfigs.release` block in `android/app/build.gradle` that reads your keystore path and passwords from a **git-ignored** `keystore.properties` (or environment variables), or sign in Android Studio via *Build -> Generate Signed Bundle / APK*. Output: `android/app/build/outputs/bundle/release/app-release.aab`.

### iOS (TestFlight / App Store)

```sh
npm run build && npx cap sync ios
npx cap open ios
```

In Xcode choose **Any iOS Device (arm64)** -> *Product -> Archive* -> **Distribute App** -> App Store Connect. You need a paid Apple Developer account.

### Changing the app id

The placeholder id `nl.tabbygames.app` lives in:

- `capacitor.config.ts` (`appId`)
- `android/app/build.gradle` (`namespace`, `applicationId`), and the package folders `android/app/src/main/java/nl/tabbygames/app/` (move `MainActivity.java` and update its `package` line, and the `.MainActivity` references in `AndroidManifest.xml` if the package changes)
- the iOS bundle identifier (Xcode -> App target -> General, or `PRODUCT_BUNDLE_IDENTIFIER` in `ios/App/App.xcodeproj/project.pbxproj`)

Then run `npx cap sync` again.

---

## Tests

```sh
npm test                           # unit tests (Vitest): game logic, input assignment, scoring
npx playwright install chromium    # first time only
npm run e2e                        # browser tests (Playwright, simulated multi-touch, boots every game)
npm run build                      # also type-checks (tsc)
```

Tip: on a busy machine run the browser tests one at a time: `npx playwright test --workers=1`.

More detail (on-device checklist, tuning notes): [`docs/TESTING.md`](docs/TESTING.md).

---

## Project layout and adding a game

```
src/
  main.ts               Phaser game setup and scene list
  core/                 shared base: BaseGameScene, input (per-player touch zones), layout, theme, i18n (en/nl), audio, match state
  ui/                   buttons, score badges, countdown, Home tiles, labels
  scenes/               Boot, Preload, Splash, Home, Pause, Win
  games/<id>/           one folder per game: config.ts (tuning knobs), logic.ts (pure, unit-tested), *Scene.ts, pieces.ts (drawing), index.ts
tests/unit, tests/e2e   Vitest and Playwright
android/, ios/          Capacitor native projects (commit them)
```

**Add a game:** create `src/games/<id>/` with a scene that extends `BaseGameScene` and an `index.ts` exporting a `GameModule` (`id`, `sceneKey`, `scenes`, `color`, `title: { en, nl }`, optional `drawIcon`). Folders under `src/games/*/index.ts` are **registered automatically**, and the game appears on the Home screen. Look at `src/games/airhockey` or `src/games/tugofwar` as small examples.

Each game's difficulty and match length are tuned with the knobs at the top of its `config.ts` (target score, speeds, ramps).

---

## Troubleshooting

- **`adb devices` shows nothing:** try another (data) cable and USB port, set USB mode to File transfer, re-accept the debugging prompt (Developer options -> *Revoke USB debugging authorizations*, then replug).
- **`unauthorized` in `adb devices`:** unlock the tablet and accept the RSA prompt.
- **Gradle says no SDK:** make sure `ANDROID_HOME` is set, or that `android/local.properties` contains `sdk.dir=...` (Android Studio creates it; it is git-ignored).
- **Gradle/Java version errors:** use JDK 21 (`java -version`); Android Studio's bundled JDK is fine (see the `JAVA_HOME` lines above).
- **`npx cap sync` complains about `dist/`:** run `npm run build` first.
- **Blank screen / old version on device:** `npm run build && npx cap sync <android|ios>` and run again.
- **Fonts/text look wrong in the browser:** hard-reload; the fonts are bundled in `public/assets/fonts` (no network needed).
