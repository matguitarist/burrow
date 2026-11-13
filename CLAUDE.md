# Burrow

A self-hosted homelab dashboard: a Node server with a React UI (Vite), run
through a macOS menu bar app, in Docker, or from a checkout. `README.md`
lists every integration and setting.

## Layout

- `server.js` the API server, with one file per area in `routes/`.
- `src/` the React UI; `public/` static files; `index.html` the entry.
- `launcher/` the macOS menu bar app (Swift, `launcher/Sources/`). It starts the server and updates through Sparkle. Its logs go to `~/Library/Logs/Burrow/`.
- `ios/` the iOS app (XcodeGen `project.yml`).
- `Dockerfile`, `docker-compose.yml` the Docker install. Data persists in `./data` there, in `~/Library/Application Support/Burrow/` for the Mac app.

## Build and check

- Dev: `npm run dev` (API on :3001 plus Vite with hot reload). Production: `npm run build && npm run server`. Needs Node 22+.
- Launcher dev build: `launcher/build.sh` (ad-hoc signed, installed to `~/Applications`, runs the server from this checkout).
- Release: `launcher/release.sh --publish` (needs `launcher/config.local.sh`). Use the mac-release skill.
- Never test against the real data folder.

## Git

- Commit after each working change, with a message that says what the user can now do.
