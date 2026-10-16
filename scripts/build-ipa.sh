#!/usr/bin/env bash
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "🍏 Preparing Untis⁺ iOS IPA build..."

cd "$REPO_ROOT"

# 1. Build Web app
echo "📦 Building Web frontend assets..."
npm run build

# 2. Sync web assets into Capacitor iOS project
echo "🔄 Syncing Capacitor iOS project..."
cd "$REPO_ROOT/apps/web"
npx cap sync ios

IOS_DIR="$REPO_ROOT/apps/web/ios/App"
OUT_DIR="$REPO_ROOT/dist-mobile"
mkdir -p "$OUT_DIR"

echo "📱 Checking build environment..."
if command -v xcodebuild >/dev/null 2>&1; then
  echo "🔨 Detected macOS with xcodebuild: Compiling Xcode project..."
  cd "$IOS_DIR"

  # Clean and build simulator or device archive
  xcodebuild -project App.xcodeproj \
    -scheme App \
    -configuration Release \
    -sdk iphoneos \
    -archivePath "$OUT_DIR/UntisPlus.xcarchive" \
    archive CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO

  echo "📦 Packaging .xcarchive into standalone UntisPlus.ipa (Ad-Hoc / Sideloading)..."
  mkdir -p "$OUT_DIR/Payload"
  cp -r "$OUT_DIR/UntisPlus.xcarchive/Products/Applications/App.app" "$OUT_DIR/Payload/UntisPlus.app"
  cd "$OUT_DIR"
  zip -qr "UntisPlus-unsigned.ipa" Payload
  rm -rf Payload

  echo "✅ Success! iOS IPA packaged:"
  echo "   📁 $OUT_DIR/UntisPlus-unsigned.ipa"
  ls -lh "$OUT_DIR/UntisPlus-unsigned.ipa"
else
  echo "ℹ️ Note: macOS with Xcode is required to run native arm64 iOS compilation directly."
  echo "   On Linux/Windows, you can:"
  echo "   1. Push this repo to GitHub and run the automated GitHub Actions workflow (.github/workflows/ios.yml)."
  echo "   2. Open $IOS_DIR in Xcode on a Mac (run: 'cd apps/web && npx cap open ios')."
  echo "   3. Sideload the generated unsigned IPA or build via AltStore / Sideloadly / Scarlet / TrollStore."
fi
