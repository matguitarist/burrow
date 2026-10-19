import { readJSON, writeJSON } from './lib.js'

// ── Uptime history — data/uptime.json ────────────────────────────────────────
// Per check id (service id, or device_<id>): the confirmed state, since when,
// and incidents { start, end } (end null while still down). A failure only
// becomes an incident after FAILS_TO_CONFIRM consecutive failed checks, so one
// slow response doesn't show up as an outage.
const FILE = 'uptime.json'
const FAILS_TO_CONFIRM = 2
const KEEP_MS = 30 * 86400_000
const DAY = 86400_000

let state = readJSON(FILE, {})   // id → { online, since, fails, firstFail, incidents: [] }
let dirty = false

setInterval(() => { if (dirty) { writeJSON(FILE, state); dirty = false } }, 60_000).unref()

export function flushUptime() {
  if (dirty) { writeJSON(FILE, state); dirty = false }
}

// Record one check result; returns { online, since } for the confirmed state
export function record(id, online, at = Date.now()) {
  // New ids start as up, so a service that's already down when first seen
  // opens an incident through the normal confirmation path
  if (!state[id]) { state[id] = { online: true, since: at, fails: 0, firstFail: null, incidents: [] }; dirty = true }
  const s = state[id]
  if (online) {
    s.fails = 0
    s.firstFail = null
    if (!s.online) {
      const open = s.incidents.at(-1)
      if (open && open.end == null) open.end = at
      Object.assign(s, { online: true, since: at })
      dirty = true
    }
  } else if (s.online) {
    s.fails++
    s.firstFail ??= at
    if (s.fails >= FAILS_TO_CONFIRM) {
      s.incidents.push({ start: s.firstFail, end: null })
      Object.assign(s, { online: false, since: s.firstFail })
      dirty = true
    }
  }
  // Drop incidents that ended more than 30 days ago
  const cutoff = at - KEEP_MS
  if (s.incidents.length && s.incidents[0].end != null && s.incidents[0].end < cutoff) {
    s.incidents = s.incidents.filter(i => i.end == null || i.end >= cutoff)
    dirty = true
  }
  return { online: s.online, since: new Date(s.since).toISOString() }
}

// Downtime (ms) of `incidents` overlapping [from, to)
function downtime(incidents, from, to) {
  let total = 0
  for (const i of incidents) {
    const start = Math.max(i.start, from), end = Math.min(i.end ?? Date.now(), to)
    if (end > start) total += end - start
  }
  return total
}

// Uptime % for the last 24h and 7 days, one value per day (oldest first), and
// recent incidents — for ids in `ids` (defaults to everything tracked)
export function uptimeSummary(ids = Object.keys(state)) {
  const now = Date.now()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const out = {}
  for (const id of ids) {
    const s = state[id]
    if (!s) continue
    const pct = (from, to) => Math.round((1 - downtime(s.incidents, from, to) / (to - from)) * 10000) / 100
    const days = []
    for (let d = 6; d >= 0; d--) {
      const from = today.getTime() - d * DAY
      days.push({ date: new Date(from).toISOString().slice(0, 10), uptime: pct(from, Math.min(from + DAY, now)) })
    }
    out[id] = {
      uptime24h: pct(now - DAY, now),
      uptime7d:  pct(now - 7 * DAY, now),
      days,
      incidents: s.incidents.slice(-10).reverse().map(i => ({
        start: new Date(i.start).toISOString(),
        end:   i.end == null ? null : new Date(i.end).toISOString(),
      })),
    }
  }
  return out
}
