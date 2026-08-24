#!/usr/bin/env bash
# Set up and build the HOOPFORM native app (Android + iOS via Compose Multiplatform).
# Requires: JDK 17+, Android SDK (ANDROID_HOME set), gradle (or ./gradlew).
set -e
export JAVA_HOME="${JAVA_HOME:-$(dirname "$(readlink -f "$(which java)")" | sed 's#/bin##')}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
cd "$(dirname "$0")/app"

echo "JAVA_HOME=$JAVA_HOME"
echo "ANDROID_HOME=$ANDROID_HOME"

# Build Android debug APK
echo "==> Building Android debug APK"
if [ -x ./gradlew ]; then ./gradlew :composeApp:assembleDebug; else gradle :composeApp:assembleDebug; fi

echo ""
echo "APK output: app/composeApp/build/outputs/apk/debug/composeApp-debug.apk"
echo "iOS: open app/iosApp/ in Xcode and run (framework built via gradlew :composeApp:embedAndSignAppleFrameworkForXcode)."
