import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

// ── Persistent data (JSON files) ─────────────────────────────────────────────
// ./data by default (dev, Docker). The Mac app points BURROW_DATA_DIR at
// ~/Library/Application Support/Burrow so the app bundle stays read-only.
export const DATA = process.env.BURROW_DATA_DIR || './data'
mkdirSync(DATA, { recursive: true })
export const IMAGES_DIR = join(DATA, 'images')
mkdirSync(IMAGES_DIR, { recursive: true })

export function readJSON(file, fallback) {
  try { return JSON.parse(readFileSync(`${DATA}/${file}`, 'utf8')) } catch { return fallback }
}
export function writeJSON(file, data) {
  writeFileSync(`${DATA}/${file}`, JSON.stringify(data, null, 2))
}
export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5) }

export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ── Global settings — data/settings.json ─────────────────────────────────────
// Per-service settings (hosts, ports, keys) live in data/services.json.
const SETTINGS_FILE = 'settings.json'
export const DEFAULT_SETTINGS = {
  devices:     [],                                  // { id, name, ip, mac, icon, accent, sshUser }
  glancesPort: 61208,
  weather:     { lat: '', lon: '' },
  region:      { locale: '', holidays: '', steamCountry: 'US' },  // locale '' = browser's
  news:        { emulation: false, tracked: [] },   // tracked: { name, repo } — repo 'arrm' is special
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v)

// Keep only known keys, with the right types — the file and API input are untrusted
function sanitize(input) {
  const d = DEFAULT_SETTINGS, out = {}
  const str = v => (typeof v === 'string' || typeof v === 'number') ? String(v).trim() : ''
  out.devices = Array.isArray(input.devices)
    ? input.devices.filter(x => isObj(x) && x.id).map(x => ({
        id: str(x.id), name: str(x.name), ip: str(x.ip), mac: str(x.mac),
        icon: str(x.icon) || 'server', accent: str(x.accent), sshUser: str(x.sshUser),
        ...(parseInt(x.sshPort) ? { sshPort: parseInt(x.sshPort) } : {}),
      }))
    : d.devices
  out.glancesPort = parseInt(input.glancesPort) || d.glancesPort
  const w = isObj(input.weather) ? input.weather : {}
  out.weather = { lat: str(w.lat), lon: str(w.lon) }
  const r = isObj(input.region) ? input.region : {}
  out.region = { locale: str(r.locale), holidays: str(r.holidays), steamCountry: str(r.steamCountry).toUpperCase() || d.region.steamCountry }
  const n = isObj(input.news) ? input.news : {}
  out.news = {
    emulation: n.emulation === true,
    tracked: Array.isArray(n.tracked)
      ? n.tracked.filter(t => isObj(t) && str(t.repo)).map(t => ({ name: str(t.name) || str(t.repo).split('/').pop(), repo: str(t.repo) }))
      : d.news.tracked,
  }
  return out
}

let settings = sanitize(readJSON(SETTINGS_FILE, {}))

export function getSettings() { return settings }

// Shallow-merges top-level sections; each section is replaced as a whole
export function updateSettings(patch) {
  settings = sanitize({ ...settings, ...(isObj(patch) ? patch : {}) })
  writeJSON(SETTINGS_FILE, settings)
  return settings
}

// Re-read after a backup restore replaces the file
export function reloadSettings() {
  settings = sanitize(readJSON(SETTINGS_FILE, {}))
}

export function getDevices() { return settings.devices }
export function getDeviceIp(id) { return (getDevices().find(d => d.id === id) || {}).ip || null }

// ── Helpers ───────────────────────────────────────────────────────────────────
export async function ping(url, ms = 5000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms) })
    return { online: true, status: res.status }
  } catch {
    return { online: false, status: null }
  }
}

// Try primary URL first, fall back to secondary (e.g. Glances port) if it fails.
// Unraid often redirects port 80 → HTTPS with a self-signed cert that Node rejects.
export async function pingWithFallback(primary, fallback, msEach = 4000) {
  const r = await ping(primary, msEach)
  if (r.online) return r
  return ping(fallback, msEach)
}

export async function proxyGet(url, headers = {}, ms = 6000) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(ms) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── Recurring event expansion ─────────────────────────────────────────────────
// Expand a single template event into concrete occurrences up to maxDate.
// Recurring instances get IDs like "baseId_2026-07-01" so the server can
// identify the template when the client deletes an instance.
export function expandRecurring(event, maxDate) {
  if (!event.repeat) return [event]
  const exceptions = new Set(event.exceptions || [])
  const results = []
  let current = new Date(event.date + 'T00:00:00')
  const end   = new Date(maxDate)
  let step    = 0
  while (current <= end && step < 500) {
    const dateStr = ymd(current)
    if (!exceptions.has(dateStr)) {
      results.push({
        ...event,
        id:   results.length === 0 ? event.id : `${event.id}_${dateStr}`,
        date: dateStr,
      })
    }
    const next = new Date(current)
    switch (event.repeat) {
      case 'weekly':   next.setDate(next.getDate() + 7);         break
      case 'biweekly': next.setDate(next.getDate() + 14);        break
      case 'monthly':  next.setMonth(next.getMonth() + 1);       break
      case 'annually': next.setFullYear(next.getFullYear() + 1); break
      default:         return results
    }
    current = next
    step++
  }
  return results
}
