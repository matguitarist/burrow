# Burrow

A self-hosted homelab dashboard: a Node server with a React UI (Vite), run
through a macOS menu bar app, in Docker, or from a checkout. `README.md`
lists every integration and setting.

Shared rules for how every project is laid out and named:
@~/.claude/project-layout.md

## Layout

- `server.js` the API server, with one file per area in `routes/`.
- `src/` the React UI; `public/` static files; `index.html` the entry.
- `macos/` the macOS menu bar app, the launcher (Swift, `macos/Sources/`). It starts the server and updates through Sparkle. Its logs go to `~/Library/Logs/Burrow/`.
- `ios/` the iOS app (XcodeGen `project.yml`).
- `Dockerfile`, `docker-compose.yml` the Docker install. Data persists in `./data` there, in `~/Library/Application Support/Burrow/` for the Mac app.

## Build and check

- Dev: `npm run dev` (API on :3001 plus Vite with hot reload). Production: `npm run build && npm run server`. Needs Node 22+.
- Mac app dev build: `macos/build.sh` (ad-hoc signed, installed to `~/Applications`, runs the server from this checkout).
- Release: `macos/release.sh --publish` (needs `macos/config.local.sh`). Use the mac-release skill.
- Never test against the real data folder.

## Git

- Commit after each working change, with a message that says what the user can now do.
