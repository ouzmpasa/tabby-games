# Testing Tabby Games

App id `nl.tabbygames.app` is a PLACEHOLDER (change in `capacitor.config.ts`, then the Android package/folders and the iOS bundle id, before any store upload).

## 1. Browser dev
```
npm install
npm run dev            # http://localhost:5173 (also on your LAN, for a tablet browser)
```
- Mouse = a finger. Left half = player 0 (orange), right half = player 1 (blue).
- DevInput (dev server, or add `?dev=1`): arrow keys / WASD move a virtual finger for player 1 inside the right half, Space/Enter presses it.
- Skip the splash screen: add `?nosplash`. Jump straight into a game: `http://localhost:5173/?game=dummy`.
- Device spike screen: Home > hold the "Device test" button for 2 s.
- DevTools only emulates ONE touch. Real multi-touch is covered by Playwright (below).

## 2. Automated tests
```
npx vitest run         # pure logic: assign, MatchState, layout, hold gate
npx playwright test    # multi-touch (4 fingers via CDP) + Boot>Home>Game>Win loop
npx playwright install chromium   # first time only
npm run build          # tsc + production bundle in dist/
```

## 3. Android tablet
One-time on the tablet: Settings > About > tap Build number 7x > Developer options > enable USB debugging. Connect with USB and accept the RSA prompt.
```
adb devices                                   # tablet must show as "device" (adb is on PATH via ~/.zshrc; open a new terminal)
npm run build && npx cap sync android
npx cap run android --target <id>             # <id> = first column of `adb devices`
```
Live reload (tablet and Mac on the same Wi-Fi; needs the INTERNET permission, which is in the manifest):
```
npx cap run android -l --external
```
Debug the WebView: open `chrome://inspect` in Chrome on the Mac, click "inspect" under the Tabby Games WebView.
Debug APK without a device: `cd android && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug` -> `android/app/build/outputs/apk/debug/app-debug.apk` (install with `adb install -r <apk>`).
Android Studio alternative: `npx cap open android`.

## 4. iPad
Simulator:
```
npm run build && npx cap sync ios
xcrun simctl list devices available | grep iPad
npx cap run ios --target "<iPad simulator name or id>"
```
Real iPad: `npx cap open ios`, select the App target > Signing & Capabilities > pick your Team (change the bundle id if needed), choose the iPad, Run. First run: trust the developer profile on the iPad (Settings > General > VPN & Device Management). TestFlight comes later.

## 5. On-device checklist (record results here)
Use Home > hold "Device test" (2 s) for items 1 to 3 and 5.

| # | Check | Pass criterion | Result |
|---|-------|----------------|--------|
| 1 | FPS for 5 min | >= 55 (min shown on screen) | |
| 2 | 4 simultaneous touches | "max" reaches 4 (try 2 per side) | |
| 3 | Touch latency | < 50 ms, feels instant; "Input event delay" stays low | |
| 4 | Tap-to-sound | < 100 ms (tap "Beep"; compare with reported audio latency; slow-mo video if unsure) | |
| 5 | Edge swipes don't exit | swiping from edges only shows bars briefly, app stays | |
| 6 | 15 min battery / thermal | modest battery drop, tablet not hot | |
| 7 | Airplane mode | everything works, font loads, no errors | |
| 8 | Dummy game | tap each half scores for the right player; text readable from each end; pause/resume; win screen; Play again | |

Record device model, Android version and date next to the results.

## 6. Air Hockey playtest checklist
Tuning knobs live in `src/games/airhockey/config.ts` (puck max speed, restitution, friction, mallet and puck radius, goal width, target score, serve speed). Change, `npm run build && npx cap sync android`, reinstall.

Install the debug build on the Android tablet (USB debugging on, `adb devices` shows it as "device"):
```
cd ~/source/tabby-games
npm run build && npx cap sync android
cd android && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug && cd ..
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n nl.tabbygames.app/.MainActivity
```
One-step alternative: `npx cap run android --target <id>` (id from `adb devices`).

Play with two people, one at each short end, then tick off:

| # | Check | What good looks like | Result |
|---|-------|----------------------|--------|
| 1 | Puck speed | Fast enough to be exciting, slow enough that a 5-year-old can react. Note: too fast / too slow (tune `puckMaxSpeed`, `friction`) | |
| 2 | Mallet responsiveness | Mallet sticks to the finger, no visible lag, no jitter; fast flicks still hit (tune `malletMaxSpeed`) | |
| 3 | Hitting | Hard flick = hard shot; gentle tap = gentle shot; puck never sticks to or passes through a mallet | |
| 4 | Two kids at once | Both mallets move simultaneously with no dropped finger; palms resting on the screen do not break it | |
| 5 | Goals | Goal flash, "GOAL!" facing both players, sound and vibration; serve goes toward the player who conceded; 3-2-1 readable from both ends | |
| 6 | Pause from both sides | Either pause button opens Pause; puck frozen; Resume continues exactly; Home leaves the game | |
| 7 | Win | First to 5 gets "You win!" the right way up for them; Play again resets to 0-0; Home works | |
| 8 | Edge cases | 3 or 4 fingers on one half (extra fingers ignored, the mallet does not jump); finger slides across the centre line (mallet stops at the line); lift and re-touch; puck pinned in a corner by a mallet gets out; touching the pause button while playing | |
| 9 | Frame rate | Smooth for 5 min (FPS counter from Home > hold "Device test") | |
| 10 | Goal size / mallet size | Goals feel fair, mallets big enough for small hands (tune `goalWidth`, `malletRadius`) | |

Record device model, Android version and date next to the results. Home tiles for the other four games say "Coming soon!" when tapped.
