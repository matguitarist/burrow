import { proxyGet, ymd, getSettings } from './lib.js'
import { getService, serviceBase } from './services.js'

// ── Upcoming releases from Sonarr / Radarr calendars ─────────────────────────
// Shown in the agenda as read-only `release` events. Cached so the agenda and
// the chat assistant don't hit the *arr APIs on every request.
const CACHE_TTL = 15 * 60 * 1000
let cache = null   // { key, at, events }

const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

async function sonarrReleases(start, end) {
  const s = getService('sonarr')
  if (!s?.apiKey || !serviceBase(s)) return []
  const qs = new URLSearchParams({ start: start.toISOString(), end: end.toISOString(), includeSeries: 'true' })
  const eps = await proxyGet(`${serviceBase(s)}/api/v3/calendar?${qs}`, { 'X-Api-Key': s.apiKey }, 5000)
  return (Array.isArray(eps) ? eps : []).filter(ep => ep.airDateUtc).map(ep => {
    const at = new Date(ep.airDateUtc)
    const code = `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`
    return {
      id: `sonarr-${ep.id}`,
      title: `${ep.series?.title || 'Episode'} — ${code}`,
      date: ymd(at),
      time: hhmm(at),
      notes: [ep.title, ep.hasFile ? 'Downloaded' : null].filter(Boolean).join(' · ') || null,
      type: 'release', source: 'sonarr', flag: '📺', color: s.color,
    }
  })
}

const MOVIE_DATES = [
  ['inCinemas',       'in cinemas'],
  ['digitalRelease',  'digital'],
  ['physicalRelease', 'Blu-ray'],
]

async function radarrReleases(start, end) {
  const r = getService('radarr')
  if (!r?.apiKey || !serviceBase(r)) return []
  const qs = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() })
  const movies = await proxyGet(`${serviceBase(r)}/api/v3/calendar?${qs}`, { 'X-Api-Key': r.apiKey }, 5000)
  const out = []
  for (const m of Array.isArray(movies) ? movies : []) {
    for (const [field, label] of MOVIE_DATES) {
      if (!m[field]) continue
      const at = new Date(m[field])
      if (at < start || at > end) continue
      out.push({
        id: `radarr-${m.id}-${field}`,
        title: `${m.title} (${label})`,
        date: ymd(at),
        time: null,
        notes: m.hasFile ? 'Downloaded' : null,
        type: 'release', source: 'radarr', flag: '🎬', color: r.color,
      })
    }
  }
  return out
}

// Releases from a week ago to `daysAhead` days out. Failures (service down)
// just leave that source out — the agenda shouldn't break because Sonarr is off.
export async function upcomingReleases(daysAhead = 60) {
  if (!getSettings().agenda.releases) return []
  const key = `${daysAhead}|${getService('sonarr')?.id}|${getService('radarr')?.id}`
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_TTL) return cache.events

  const start = new Date(); start.setDate(start.getDate() - 7); start.setHours(0, 0, 0, 0)
  const end   = new Date(); end.setDate(end.getDate() + daysAhead); end.setHours(23, 59, 59, 999)
  const results = await Promise.allSettled([sonarrReleases(start, end), radarrReleases(start, end)])
  const events = results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
  cache = { key, at: Date.now(), events }
  return events
}
