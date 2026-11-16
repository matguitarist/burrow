#!/bin/bash
# Shared helpers for build.sh (dev) and release.sh (signed + notarized + Sparkle).
# Sourced, not run.

LAUNCHER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$(dirname "$LAUNCHER")"
BUILD="$LAUNCHER/build"
VENDOR="$BUILD/vendor"

# Local, gitignored identity/signing config (see config.example.sh)
[ -f "$LAUNCHER/config.local.sh" ] && source "$LAUNCHER/config.local.sh"

APP_NAME="${APP_NAME:-Burrow}"
BUNDLE_ID="${BUNDLE_ID:-io.github.example.burrow}"
NODE_VERSION="${NODE_VERSION:-24.22.0}"
SPARKLE_VERSION="${SPARKLE_VERSION:-2.10.0}"
SPARKLE_FEED_URL="${SPARKLE_FEED_URL:-}"
SPARKLE_PUBLIC_KEY="${SPARKLE_PUBLIC_KEY:-}"

VERSION="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$PROJECT/package.json" | head -1)"
# Sparkle compares CFBundleVersion — must only ever go up
BUILD_NUMBER="${BUILD_NUMBER:-$(git -C "$PROJECT" rev-list --count HEAD 2>/dev/null || echo 1)}"

SPARKLE_DIR="$VENDOR/sparkle-$SPARKLE_VERSION"
NODE_DIR="$VENDOR/node-v$NODE_VERSION-darwin-arm64"

fetch_sparkle() {
    [ -d "$SPARKLE_DIR/Sparkle.framework" ] && return
    echo "Downloading Sparkle $SPARKLE_VERSION..."
    mkdir -p "$SPARKLE_DIR"
    curl -fsSL "https://github.com/sparkle-project/Sparkle/releases/download/$SPARKLE_VERSION/Sparkle-$SPARKLE_VERSION.tar.xz" \
        | tar -xJ -C "$SPARKLE_DIR"
}

fetch_node() {
    [ -x "$NODE_DIR/bin/node" ] && return
    local tarball="node-v$NODE_VERSION-darwin-arm64.tar.gz"
    local url="https://nodejs.org/dist/v$NODE_VERSION"
    echo "Downloading Node $NODE_VERSION..."
    mkdir -p "$VENDOR"
    curl -fsSL "$url/$tarball" -o "$VENDOR/$tarball"
    # Verify against the official checksums before using it
    local expected
    expected="$(curl -fsSL "$url/SHASUMS256.txt" | awk -v f="$tarball" '$2 == f { print $1 }')"
    echo "$expected  $VENDOR/$tarball" | shasum -a 256 -c - >/dev/null || { echo "Node checksum mismatch" >&2; exit 1; }
    tar -xzf "$VENDOR/$tarball" -C "$VENDOR"
    rm "$VENDOR/$tarball"
}

# assemble_app <app-path> <dev|release>
# Compiles the launcher, embeds Sparkle, writes Info.plist and the icon.
assemble_app() {
    local app="$1" mode="$2"
    rm -rf "$app"
    mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources" "$app/Contents/Frameworks"

    echo "Compiling launcher..."
    swiftc -O -parse-as-library -target arm64-apple-macos15 \
        -F "$SPARKLE_DIR" -framework Sparkle \
        -Xlinker -rpath -Xlinker @executable_path/../Frameworks \
        "$LAUNCHER"/Sources/*.swift -o "$app/Contents/MacOS/Burrow"

    ditto "$SPARKLE_DIR/Sparkle.framework" "$app/Contents/Frameworks/Sparkle.framework"

    # App icon (rendered once; delete build/AppIcon.icns to redraw it)
    if [ ! -f "$BUILD/AppIcon.icns" ]; then
        echo "Rendering app icon..."
        mkdir -p "$BUILD"
        swift "$LAUNCHER/AppIcon.swift" "$BUILD/AppIcon.iconset"
        iconutil -c icns "$BUILD/AppIcon.iconset" -o "$BUILD/AppIcon.icns"
        rm -rf "$BUILD/AppIcon.iconset"
    fi
    cp "$BUILD/AppIcon.icns" "$app/Contents/Resources/"

    local plist="$app/Contents/Info.plist"
    cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
    <key>CFBundleName</key><string>$APP_NAME</string>
    <key>CFBundleDisplayName</key><string>$APP_NAME</string>
    <key>CFBundleExecutable</key><string>Burrow</string>
    <key>CFBundleIconFile</key><string>AppIcon</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>$VERSION</string>
    <key>CFBundleVersion</key><string>$BUILD_NUMBER</string>
    <key>LSMinimumSystemVersion</key><string>15.0</string>
    <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST
    # Dev builds run the server straight from this checkout
    if [ "$mode" = dev ]; then
        /usr/libexec/PlistBuddy -c "Add :BurrowProjectPath string $PROJECT" "$plist"
    fi
    # Updates are only enabled for release builds with a feed + key configured —
    # a dev build would otherwise "update" itself into the self-contained release
    if [ "$mode" = release ] && [ -n "$SPARKLE_FEED_URL" ] && [ -n "$SPARKLE_PUBLIC_KEY" ]; then
        /usr/libexec/PlistBuddy -c "Add :SUFeedURL string $SPARKLE_FEED_URL" "$plist"
        /usr/libexec/PlistBuddy -c "Add :SUPublicEDKey string $SPARKLE_PUBLIC_KEY" "$plist"
        /usr/libexec/PlistBuddy -c "Add :SUEnableAutomaticChecks bool true" "$plist"
    fi
}

# make_dmg <app-path> <dmg-path> [skip-notarize]
# Drag-to-Applications disk image around an already signed + stapled app.
# The image itself is signed, notarized and stapled so it opens without warnings.
make_dmg() {
    local app="$1" dmg="$2" skip_notarize="${3:-0}"
    local src
    src="$(mktemp -d)"
    ditto "$app" "$src/$(basename "$app")"
    ln -s /Applications "$src/Applications"
    rm -f "$dmg"
    echo "Creating disk image..."
    hdiutil create -volname "$APP_NAME" -srcfolder "$src" -fs HFS+ -format UDZO -ov "$dmg" >/dev/null
    rm -rf "$src"
    codesign --force --timestamp --sign "$SIGN_IDENTITY" "$dmg"
    if [ "$skip_notarize" = 0 ]; then
        echo "Notarizing disk image..."
        xcrun notarytool submit "$dmg" --keychain-profile "${NOTARY_PROFILE:?NOTARY_PROFILE is not set}" --wait
        xcrun stapler staple "$dmg"
        spctl --assess --type open --context context:primary-signature "$dmg" && echo "Gatekeeper (dmg): accepted"
    fi
}
