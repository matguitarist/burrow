# Burrow

Your homelab at a glance. A self-hosted dashboard: machine stats (Glances), service health, media (Plex, Tautulli, Seerr, Radarr, Sonarr), downloads (qBittorrent), a local AI assistant (Ollama / oMLX / any OpenAI-compatible server, Draw Things for images), a Steam wishlist with sale alerts, weather, agenda, notes and a kanban board.

It runs as a Node server with a React UI, either through the native macOS menu bar app, in Docker, or straight from a checkout.

---

## Getting started

### macOS app

Download the latest release, unzip it and move **Burrow.app** to Applications. It bundles everything it needs (Node included), lives in the menu bar, starts the server, and updates itself through Sparkle.

Settings and data are stored in `~/Library/Application Support/Burrow/` (menu → **Open Data Folder**). Logs are in `~/Library/Logs/Burrow/`.

### Docker

```bash
docker compose up -d
```

Then open http://localhost:3001 and configure everything from Settings. Data persists in `./data`.

### From source

```bash
npm install
npm run dev      # API on :3001 + Vite dev server with hot reload
# or
npm run build && npm run server   # production build served on :3001
```

Requires Node 22+.

---

## Configuration

Everything is configured from the web UI's **Settings** panel (gear icon) or the Mac app's window:

- **General**: refresh interval, region (date format, holiday calendar, Steam store country), the News tab (emulation news, GitHub release tracker), weather location.
- **Devices**: your machines (name, IP, SSH user, MAC for Wake-on-LAN) and the Glances port.
- **Services**: one card per service: where it runs (a device or a custom host), its port, and its API key or login. Add services from the template catalog: integrations that power dashboard widgets (Plex, Radarr, Sonarr, Tautulli, Seerr, qBittorrent, Gotify, Steam, Ollama, oMLX, OpenAI-compatible, Draw Things, Unraid) plus ~50 popular self-hosted apps that get a status dot and a link. **Test connection** checks reachability and credentials.
- **Export / Import template** (Services) shares a service list *without* IPs, keys or passwords.
- **Backup**: export/import everything as a zip.

Everything is stored as JSON in the data folder (`./data` by default):

| File | Holds |
|---|---|
| `settings.json` | devices, region, weather, news, Glances port |
| `services.json` | services: hosts, ports, API keys |
| `todos.json`, `events.json`, `games.json`, … | your notes, agenda, wishlist, … |

Environment variables: `PORT` (default 3001) and `BURROW_DATA_DIR` (default `./data`; the Mac app points it at Application Support).

---

## The macOS app

A SwiftUI menu bar app (`launcher/`) with a native window:

- **Overview**: server process metrics, LAN addresses, auto-start, launch at login, port.
- **Services**: the same service list as the web UI, with live status, editor, connection test and template export/import.
- **Devices & WOL**: machines with one-click Wake-on-LAN.
- **Settings**, **Logs** (live tail with filters and search) and built-in **Help** (`⌘?`).

### Building

**Dev build**: runs the server from this checkout with your installed Node; ad-hoc signed and installed to `~/Applications`:

```bash
npm run launcher:build
```

**Release build**: self-contained (bundled Node + server + UI), Developer ID signed with the hardened runtime, notarized, and added to the Sparkle appcast:

```bash
cp launcher/config.example.sh launcher/config.local.sh   # fill in once (gitignored)
npm run launcher:release                                  # → release/Burrow-<version>.zip + release/appcast.xml
```

One-time setup for releases (details in `launcher/config.example.sh`):

1. Set `BUNDLE_ID` and `SIGN_IDENTITY` (your Developer ID Application certificate).
2. Store notarization credentials: `xcrun notarytool store-credentials burrow-notary …`.
3. Generate the Sparkle signing key: `launcher/build/vendor/sparkle-<version>/bin/generate_keys` (after any build has downloaded Sparkle), then put the public key in `SPARKLE_PUBLIC_KEY`. **Back up the private key** (`generate_keys -x`): losing it means existing installs can't verify future updates.
4. Set `SPARKLE_FEED_URL` and `DOWNLOAD_URL_PREFIX`. The example config hosts everything on GitHub Releases: each release carries its zip plus `appcast.xml`, and the feed URL uses `/releases/latest/download/` so it always points at the newest one.

Each release: bump `version` in `package.json`, commit, then run `npm run launcher:release -- --publish` to build, notarize and create the GitHub release (needs the `gh` CLI). Without `--publish`, attach `release/*.zip` and `release/appcast.xml` to a release tagged `v<version>` yourself. The build number comes from the git commit count, so it only goes up.

---

## License

TBD
