#!/bin/bash
# Dev build: menu bar launcher that runs the server from this checkout with your
# installed Node. Ad-hoc signed, installed to ~/Applications.
# For a distributable, self-contained build use launcher/release.sh.
# Usage: launcher/build.sh [install-dir]
set -euo pipefail
source "$(dirname "$0")/scripts/common.sh"

DEST="${1:-$HOME/Applications}"
APP="$BUILD/$APP_NAME.app"

fetch_sparkle
assemble_app "$APP" dev
codesign --force --deep --sign - "$APP"

mkdir -p "$DEST"
rm -rf "$DEST/$APP_NAME.app"
cp -R "$APP" "$DEST/"
echo "Installed $DEST/$APP_NAME.app ($VERSION, build $BUILD_NUMBER)"
