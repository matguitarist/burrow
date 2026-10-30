#!/bin/bash
# Build the iPad app and upload it to App Store Connect (TestFlight), signed
# through the Apple account in Xcode → Settings → Accounts.
# Usage: ios/upload.sh   (bump MARKETING_VERSION in project.yml for a new version;
#                         the build number is the commit count, so it always goes up)
#
# The archive is made unsigned and signed for distribution at export: archiving
# with automatic signing would need a development profile, which needs a device.
set -euo pipefail
cd "$(dirname "$0")"

BUILD_NUMBER="$(git rev-list --count HEAD)"
ARCHIVE=build/Burrow.xcarchive

xcodegen -q
rm -rf "$ARCHIVE" build/export
echo "Archiving (build $BUILD_NUMBER)..."
xcodebuild -project Burrow.xcodeproj -scheme Burrow -configuration Release \
    -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
    CURRENT_PROJECT_VERSION="$BUILD_NUMBER" CODE_SIGNING_ALLOWED=NO -quiet archive

echo "Signing and uploading..."
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist ExportOptions.plist \
    -exportPath build/export -allowProvisioningUpdates -quiet
echo "Uploaded build $BUILD_NUMBER — it shows up in TestFlight once Apple finishes processing (a few minutes)."
