#!/bin/bash
# Release build: self-contained app (bundled Node + server + UI), Developer ID
# signed with the hardened runtime, notarized, stapled, zipped and added to the
# Sparkle appcast. Needs launcher/config.local.sh (see config.example.sh).
#
# Usage: launcher/release.sh [--skip-notarize] [--publish]
# Output: release/<App>-<version>.zip and release/appcast.xml
# --publish creates GitHub release v<version> with both files (needs `gh`).
set -euo pipefail
source "$(dirname "$0")/scripts/common.sh"

SKIP_NOTARIZE=0
PUBLISH=0
for arg in "$@"; do
    case "$arg" in
        --skip-notarize) SKIP_NOTARIZE=1 ;;
        --publish)       PUBLISH=1 ;;
        *) echo "Unknown option: $arg" >&2; exit 1 ;;
    esac
done
if [ "$PUBLISH" = 1 ] && [ "$SKIP_NOTARIZE" = 1 ]; then
    echo "Refusing to publish a build that wasn't notarized." >&2; exit 1
fi

[ -f "$LAUNCHER/config.local.sh" ] || { echo "Missing launcher/config.local.sh — copy config.example.sh and fill it in." >&2; exit 1; }
[ -n "${SIGN_IDENTITY:-}" ] || { echo "SIGN_IDENTITY is not set" >&2; exit 1; }
if [ -z "$SPARKLE_FEED_URL" ] || [ -z "$SPARKLE_PUBLIC_KEY" ]; then
    echo "Warning: SPARKLE_FEED_URL / SPARKLE_PUBLIC_KEY not set — this build won't check for updates." >&2
fi

RELEASE="$PROJECT/release"
STAGE="$BUILD/release"
APP="$STAGE/$APP_NAME.app"
RES="$APP/Contents/Resources"
ZIP="$RELEASE/${APP_NAME// /-}-$VERSION.zip"

fetch_sparkle
fetch_node
rm -rf "$STAGE"; mkdir -p "$STAGE" "$RELEASE"

# ── 1. Web UI ─────────────────────────────────────────────────────────────────
echo "Building web UI..."
(cd "$PROJECT" && npm run build >/dev/null)

# ── 2. App shell ──────────────────────────────────────────────────────────────
assemble_app "$APP" release

# ── 3. Server + production deps, compiled against the bundled Node ───────────
echo "Bundling server..."
SERVER="$RES/server"
mkdir -p "$SERVER"
cp -R "$PROJECT/server.js" "$PROJECT/routes" "$PROJECT/dist" "$PROJECT/package.json" "$PROJECT/package-lock.json" "$SERVER/"
(cd "$SERVER" && PATH="$NODE_DIR/bin:$PATH" npm ci --omit=dev --no-audit --no-fund >/dev/null)

mkdir -p "$RES/node/bin"
cp "$NODE_DIR/bin/node" "$RES/node/bin/node"
cp "$NODE_DIR/LICENSE" "$RES/node/LICENSE"

# ── 4. Sign, inside out ───────────────────────────────────────────────────────
echo "Signing..."
sign() { codesign --force --timestamp --options runtime --sign "$SIGN_IDENTITY" "$@"; }

# Native addons and any other Mach-O files in node_modules
while IFS= read -r -d '' f; do
    if file -b "$f" | grep -q 'Mach-O'; then sign "$f"; fi
done < <(find "$SERVER/node_modules" -type f \( -name '*.node' -o -perm -u+x \) -print0)

sign --entitlements "$LAUNCHER/entitlements/node.entitlements" "$RES/node/bin/node"

# Sparkle's helpers, per https://sparkle-project.org/documentation/sandboxing/#code-signing
FW="$APP/Contents/Frameworks/Sparkle.framework"
sign "$FW/Versions/B/XPCServices/Installer.xpc"
sign --preserve-metadata=entitlements "$FW/Versions/B/XPCServices/Downloader.xpc"
sign "$FW/Versions/B/Autoupdate"
sign "$FW/Versions/B/Updater.app"
sign "$FW"

sign --entitlements "$LAUNCHER/entitlements/app.entitlements" "$APP"
codesign --verify --deep --strict "$APP"

# ── 5. Notarize + staple ──────────────────────────────────────────────────────
rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"
if [ "$SKIP_NOTARIZE" = 0 ]; then
    echo "Notarizing (this takes a few minutes)..."
    xcrun notarytool submit "$ZIP" --keychain-profile "${NOTARY_PROFILE:?NOTARY_PROFILE is not set}" --wait
    xcrun stapler staple "$APP"
    rm -f "$ZIP"
    ditto -c -k --keepParent "$APP" "$ZIP"
    spctl --assess --type execute "$APP" && echo "Gatekeeper: accepted"
fi

# ── 6. Sparkle appcast ────────────────────────────────────────────────────────
# generate_appcast signs the zip with the EdDSA key in your keychain and writes
# the entry. It runs on a scratch folder holding only this zip (+ the current
# appcast) because the download prefix is per-version and would otherwise be
# applied to older zips too.
if [ -n "$SPARKLE_FEED_URL" ] && [ -n "$SPARKLE_PUBLIC_KEY" ]; then
    PREFIX="${DOWNLOAD_URL_PREFIX//\{VERSION\}/$VERSION}"
    CAST="$STAGE/appcast"
    mkdir -p "$CAST"
    cp "$ZIP" "$CAST/"
    [ -f "$RELEASE/appcast.xml" ] && cp "$RELEASE/appcast.xml" "$CAST/"
    "$SPARKLE_DIR/bin/generate_appcast" --download-url-prefix "$PREFIX" "$CAST"
    cp "$CAST/appcast.xml" "$RELEASE/appcast.xml"
fi

echo
echo "Done: $ZIP ($VERSION, build $BUILD_NUMBER)"

# ── 7. Publish ────────────────────────────────────────────────────────────────
if [ "$PUBLISH" = 1 ]; then
    echo "Publishing GitHub release v$VERSION..."
    (cd "$PROJECT" && gh release create "v$VERSION" "$ZIP" "$RELEASE/appcast.xml" \
        --title "$APP_NAME $VERSION" --generate-notes --latest)
else
    echo "Next: attach the zip and release/appcast.xml to a GitHub release tagged v$VERSION"
    echo "      (or rerun with --publish to do it with gh)."
fi
