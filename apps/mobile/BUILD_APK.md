# Build DL Chat APK - DEATH LEGION Team

## Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g @expo/cli`
- EAS CLI: `npm install -g eas-cli`
- Expo account (free at https://expo.dev)
- Android Studio (for local builds)

## Quick Build - APK (Android)

```bash
cd apps/mobile
npm install

# Login to Expo
eas login

# Build APK (takes ~10-15 mins, done in cloud)
eas build --platform android --profile apk --non-interactive

# Download the APK from the URL provided after build
```

## Local Build (No EAS account needed)

```bash
cd apps/mobile
npm install

# Install Android dependencies
npx expo run:android

# Or generate native project first
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
# APK will be at: android/app/build/outputs/apk/release/app-release.apk
```

## Build iOS

```bash
# Requires macOS + Xcode + Apple Developer account
eas build --platform ios --profile production
```

## Environment Setup

Create `.env` file:
```
EXPO_PUBLIC_API_URL=https://dl-chat-api.workers.dev
EXPO_PUBLIC_WS_URL=wss://dl-chat-api.workers.dev/ws
```

## Build Variants

| Profile | Platform | Output | Distribution |
|---------|----------|--------|--------------|
| `apk` | Android | .apk | Internal testing |
| `preview` | Both | .apk / .ipa | Internal |
| `production` | Both | .aab / .ipa | Store |

## Common Issues

**Build fails with "metro bundler"**: Run `npx expo start --clear`

**Firebase issues**: Add `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) from Firebase Console

**Permissions**: All permissions are declared in `app.json`. No changes needed.

## Output Locations

- APK: Provided as URL after EAS build, or at `android/app/build/outputs/apk/release/`
- AAB: For Google Play Store submission
- IPA: Provided as URL after EAS build

## Install on Android Device

1. Download the APK from the EAS build URL
2. Enable "Install from Unknown Sources" on your Android device
3. Open the APK file to install
4. Grant required permissions on first launch

## Version Management

Update version in `app.json`:
```json
{
  "expo": {
    "version": "1.0.1",
    "android": {
      "versionCode": 2
    }
  }
}
```

---

**DL Chat v1.0.0 | DEATH LEGION Team**
