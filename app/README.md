# HOOPFORM Native (Android + iOS)

Compose Multiplatform (KMP) native app for HOOPFORM — the privacy-first, on-device
basketball shooting coach. Shared engine in `commonMain`, platform camera/mic in
`androidMain` / `iosMain`. 100% offline, no cloud, open-source, no proprietary code.

## Structure
```
app/
├─ settings.gradle.kts, composeApp/build.gradle.kts, gradle/libs.versions.toml
├─ composeApp/src/
│  ├─ commonMain/kotlin/com/hoopform/
│  │   ├─ Coach.kt       pure engine: metrics, rules, Geo (angles/dist)
│  │   ├─ Analyzer.kt    release FSM (READY→HELD→FLIGHT), shot detection
│  │   ├─ CameraFeed.kt  expect: start/stop/isRunning
│  │   ├─ App.kt         Compose UI (tip card + metrics card + canvas overlay)
│  ├─ androidMain/       CameraX + MediaPipe PoseLandmarker actual, TTS Speaker
│  └─ iosMain/           AVFoundation actuals, ComposeUIViewController entry
└─ iosApp/iosApp/        SwiftUI host (ContentView.swift, Info.plist)
```

## Build
See `../scripts/build_native.sh`. Requires JDK 17 + Android SDK; for iOS open
`app/iosApp` in Xcode on a Mac.
- Android: `./gradlew :composeApp:assembleDebug`
- iOS:  `./gradlew :composeApp:embedAndSignAppleFrameworkForXcode` (from Xcode)

## Deps (open-source, credited)
| Component | License |
|---|---|
| Compose Multiplatform | Apache-2.0 |
| MediaPipe Tasks Vision | Apache-2.0 |
| AndroidX CameraX | Apache-2.0 |
| AVFoundation (iOS) | Apple (system) |

Original code, Apache-2.0. No HomeCourt/Nike/ShotTracker logic copied.

> Status: source scaffold complete; final APK/IPA build runs on a machine with the
> Android SDK + Xcode toolchains (see `NATIVE_REVIEW.md` from Ox Alpha's code review).
