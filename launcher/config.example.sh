# Copy to launcher/config.local.sh (gitignored) and fill in for signed releases.
# Dev builds (launcher/build.sh) work without it.

# App identity
APP_NAME="Burrow"
# Reverse-DNS, permanent once shipped (no domain? use io.github.<user>.<app>)
BUNDLE_ID="io.github.YOUR_USER.burrow"

# Developer ID signing — `security find-identity -v -p codesigning`
SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID1234)"

# Notarization — create once with:
#   xcrun notarytool store-credentials burrow-notary \
#     --apple-id you@example.com --team-id TEAMID1234 --password <app-specific-password>
NOTARY_PROFILE="burrow-notary"

# Sparkle — generate the EdDSA key pair once with:
#   launcher/build/vendor/sparkle/bin/generate_keys
# (stores the private key in your login keychain and prints the public key)
SPARKLE_PUBLIC_KEY=""
# Everything lives on GitHub Releases: each release carries its zip + appcast.xml,
# and /releases/latest/download/ always redirects to the newest one.
SPARKLE_FEED_URL="https://github.com/YOUR_USER/burrow/releases/latest/download/appcast.xml"
# Where release zips are downloaded from; {VERSION} is replaced
DOWNLOAD_URL_PREFIX="https://github.com/YOUR_USER/burrow/releases/download/v{VERSION}/"

# Pinned dependencies (override to upgrade)
# NODE_VERSION="24.22.0"
# SPARKLE_VERSION="2.10.0"
