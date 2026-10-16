#!/usr/bin/env bash
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "🚀 Building Untis⁺ Android Debug APK..."

cd "$REPO_ROOT"

# Ensure web assets are built
echo "📦 Building Web app..."
npm run build

# Sync web assets to Capacitor Android project
echo "🔄 Syncing Capacitor Android assets..."
npm --prefix "$REPO_ROOT/apps/web" run cap:sync android

# Ensure local.properties exists
ANDROID_DIR="$REPO_ROOT/apps/web/android"
if [ ! -f "$ANDROID_DIR/local.properties" ]; then
  if [ -d "/root/android-sdk" ]; then
    echo "sdk.dir=/root/android-sdk" > "$ANDROID_DIR/local.properties"
  elif [ -n "$ANDROID_HOME" ]; then
    echo "sdk.dir=$ANDROID_HOME" > "$ANDROID_DIR/local.properties"
  fi
fi

# Ensure JAVA_HOME
if [ -z "$JAVA_HOME" ]; then
  if [ -d "/usr/lib/jvm/java-21-openjdk" ]; then
    export JAVA_HOME="/usr/lib/jvm/java-21-openjdk"
  elif [ -d "/usr/lib/jvm/java-17-openjdk" ]; then
    export JAVA_HOME="/usr/lib/jvm/java-17-openjdk"
  fi
  if [ -n "$JAVA_HOME" ]; then
    export PATH="$JAVA_HOME/bin:$PATH"
  fi
fi

# Build APK via Gradle
echo "🔨 Running Gradle assembleDebug..."
cd "$ANDROID_DIR"
chmod +x gradlew
./gradlew assembleDebug --no-daemon

APK_SRC="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK_SRC" ]; then
  OUT_DIR="$REPO_ROOT/dist-mobile"
  mkdir -p "$OUT_DIR"
  cp "$APK_SRC" "$OUT_DIR/UntisPlus-debug.apk"
  echo "✅ Success! Android APK generated:"
  echo "   📁 $OUT_DIR/UntisPlus-debug.apk"
  ls -lh "$OUT_DIR/UntisPlus-debug.apk"
else
  echo "❌ Error: APK output file not found at $APK_SRC"
  exit 1
fi
