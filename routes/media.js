import { Router } from 'express'
import { proxyGet } from './lib.js'
import { getService, serviceBase } from './services.js'

const router = Router()

// ── Plex XML parser ───────────────────────────────────────────────────────────
// Plex escapes attribute values (&#233; &amp; &#39;…) — decode so titles read right
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : ENTITIES[e] ?? m)
}

function parseAttrs(str) {
  const obj = {}
  const re = /(\w+)="([^"]*)"/g
  let m
  while ((m = re.exec(str)) !== null) obj[m[1]] = decodeEntities(m[2])
  return obj
}

// Movies, episodes and seasons from a Plex library list (recently added, on deck)
function parsePlexItems(xml) {
  const items = []
  const re = /<(Video|Directory)\b([^>]*)>/g
  let m
  while ((m = re.exec(xml)) !== null) {
    const a = parseAttrs(m[2])
    if (!['movie', 'episode', 'season'].includes(a.type)) continue
    const ep = a.type === 'episode'
    const code = ep ? `S${String(a.parentIndex || 0).padStart(2, '0')}E${String(a.index || 0).padStart(2, '0')}` : null
    items.push({
      ratingKey: a.ratingKey,
      type:      a.type,
      title:     ep ? a.grandparentTitle : a.type === 'season' ? a.parentTitle : a.title,
      subtitle:  ep ? `${code} · ${a.title}` : a.type === 'season' ? a.title : a.year || '',
      thumb:     ep ? (a.grandparentThumb || a.thumb) : a.type === 'season' ? (a.parentThumb || a.thumb) : a.thumb,
      addedAt:   parseInt(a.addedAt) * 1000 || null,
      progress:  a.viewOffset && a.duration ? Math.round(parseInt(a.viewOffset) / parseInt(a.duration) * 100) : null,
    })
  }
  const machineId = (/<MediaContainer\b[^>]*machineIdentifier="([^"]+)"/.exec(xml) || [])[1] || null
  return { items, machineId }
}

async function plexList(path) {
  const plex = getService('plex')
  if (!plex?.apiKey) return { configured: false, items: [] }
  const sep = path.includes('?') ? '&' : '?'
  const xml = await fetch(`${serviceBase(plex)}${path}${sep}X-Plex-Token=${plex.apiKey}`, { signal: AbortSignal.timeout(8000) }).then(r => {
    if (!r.ok) throw new Error(`Plex ${r.status}`)
    return r.text()
  })
  const parsed = parsePlexItems(xml)
  parsed.machineId ??= await plexMachineId(plex)
  return parsed
}

// Server id for links into Plex web — library lists don't include it
let machineIdCache = null
async function plexMachineId(plex) {
  if (machineIdCache) return machineIdCache
  try {
    const xml = await fetch(`${serviceBase(plex)}/identity`, { signal: AbortSignal.timeout(5000) }).then(r => r.text())
    machineIdCache = (/machineIdentifier="([^"]+)"/.exec(xml) || [])[1] || null
  } catch {}
  return machineIdCache
}

function parsePlexSessions(xml) {
  const sessions = []
  const re = /<Video\b([^>]*)>([\s\S]*?)<\/Video>/g
  let m
  while ((m = re.exec(xml)) !== null) {
    const a     = parseAttrs(m[1])
    const inner = m[2]
    const user   = parseAttrs((/<User\b([^>]*)/.exec(inner)   || ['',''])[1])
    const player = parseAttrs((/<Player\b([^>]*)/.exec(inner) || ['',''])[1])
    sessions.push({
      type:        a.type || 'movie',
      title:       a.title || '',
      showTitle:   a.grandparentTitle || '',
      season:      a.parentTitle || '',
      thumb:       a.thumb || '',
      duration:    parseInt(a.duration)   || 0,
      viewOffset:  parseInt(a.viewOffset) || 0,
      user:        user.title   || 'Unknown',
      playerName:  player.title || '',
      state:       player.state || 'playing',
      transcoding: /<TranscodeSession/.test(inner),
    })
  }
  return sessions
}

// ── Seerr helpers ─────────────────────────────────────────────────────────────
export function getSeerrBase() {
  return serviceBase(getService('seerr'))
}
export function seerrConfigured() {
  const s = getService('seerr')
  return !!(s?.apiKey && serviceBase(s))
}
async function seerrFetch(path, init = {}) {
  const ac    = new AbortController()
  const timer = setTimeout(() => ac.abort(new Error('seerr timeout')), 8000)
  try {
    const res = await fetch(`${getSeerrBase()}${path}`, {
      ...init,
      headers: { 'X-Api-Key': getService('seerr')?.apiKey || '', ...(init.headers || {}) },
      signal: ac.signal,
    })
    if (!res.ok) throw new Error(`Seerr ${res.status}`)
    return res.json()
  } finally {
    clearTimeout(timer)
  }
}
export async function seerrGet(path)       { return seerrFetch(path) }
export async function seerrPost(path, body) {
  return seerrFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── In-memory cache for TMDB titles fetched from Seerr ───────────────────────
const _titleCache = new Map()
export async function fetchMediaTitle(type, tmdbId) {
  const key = `${type}:${tmdbId}`
  if (_titleCache.has(key)) return _titleCache.get(key)
  try {
    const path = type === 'movie' ? `/api/v1/movie/${tmdbId}` : `/api/v1/tv/${tmdbId}`
    const d = await seerrGet(path)
    const rawDate = d.releaseDate || d.firstAirDate || ''
    const info = {
      title:       d.title || d.name || `${type} #${tmdbId}`,
      year:        rawDate.slice(0, 4),
      releaseDate: rawDate.slice(0, 10) || null,
    }
    _titleCache.set(key, info)
    return info
  } catch {
    return { title: `${type} #${tmdbId}`, year: '', releaseDate: null }
  }
}

// ── Tautulli helper ───────────────────────────────────────────────────────────
async function tautulliGet(cmd, extra = {}) {
  const t = getService('tautulli')
  if (!t?.apiKey || !serviceBase(t)) throw new Error('not configured')
  const qs = new URLSearchParams({ apikey: t.apiKey, cmd, ...extra })
  const data = await proxyGet(`${serviceBase(t)}/api/v2?${qs}`, {}, 8000)
  if (data.response?.result !== 'success') throw new Error(data.response?.message || 'error')
  return data.response.data
}

// ── qBittorrent normalizer ────────────────────────────────────────────────────
function normalizeTorrents(torrents) {
  if (!Array.isArray(torrents)) return []
  return torrents
    .filter(t => ['downloading', 'stalledDL', 'metaDL', 'checkingDL', 'forcedDL'].includes(t.state))
    .map(t => ({
      id:       t.hash,
      title:    t.name,
      progress: Math.round(t.progress * 100),
      sizeleft: t.size - t.downloaded,
      eta:      t.eta > 0 && t.eta < 8_640_000 ? new Date(Date.now() + t.eta * 1000).toISOString() : null,
    }))
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Plex — now playing
router.get('/plex/now-playing', async (_req, res) => {
  const plex = getService('plex')
  if (!plex?.apiKey) return res.json({ sessions: [], configured: false })
  try {
    const xml = await fetch(
      `${serviceBase(plex)}/status/sessions?X-Plex-Token=${plex.apiKey}`,
      { signal: AbortSignal.timeout(6000) }
    ).then(r => r.text())
    res.json({ sessions: parsePlexSessions(xml) })
  } catch (e) { res.status(503).json({ sessions: [], error: e.message }) }
})

// Plex — recently added and continue watching (on deck)
router.get('/plex/recent', async (_req, res) => {
  try { res.json(await plexList('/library/recentlyAdded?X-Plex-Container-Start=0&X-Plex-Container-Size=16')) }
  catch (e) { res.status(503).json({ items: [], error: e.message }) }
})

router.get('/plex/ondeck', async (_req, res) => {
  try { res.json(await plexList('/library/onDeck?X-Plex-Container-Size=12')) }
  catch (e) { res.status(503).json({ items: [], error: e.message }) }
})

// Plex — thumbnail proxy
router.get('/plex/thumb', async (req, res) => {
  const { path } = req.query
  const plex = getService('plex')
  if (!path || !plex?.apiKey) return res.status(400).end()
  try {
    const r = await fetch(
      `${serviceBase(plex)}${path}?X-Plex-Token=${plex.apiKey}&width=200&height=300`,
      { signal: AbortSignal.timeout(8000) }
    )
    const buf = await r.arrayBuffer()
    res.set('Content-Type', r.headers.get('content-type') || 'image/jpeg')
    res.set('Cache-Control', 'public, max-age=300')
    res.send(Buffer.from(buf))
  } catch { res.status(503).end() }
})

// Plex — session count
router.get('/plex/sessions', async (_req, res) => {
  const plex = getService('plex')
  if (!plex?.apiKey) return res.json({ configured: false })
  try {
    const xml = await fetch(
      `${serviceBase(plex)}/status/sessions?X-Plex-Token=${plex.apiKey}`,
      { signal: AbortSignal.timeout(5000) }
    ).then(r => r.text())
    const count = (xml.match(/<Video /g) || []).length + (xml.match(/<Track /g) || []).length
    res.json({ activeSessions: count })
  } catch (e) { res.status(503).json({ error: e.message }) }
})

// Radarr — stats
router.get('/radarr/stats', async (_req, res) => {
  const radarr = getService('radarr')
  const base   = serviceBase(radarr)
  if (!radarr?.apiKey || !base) return res.json({ configured: false })
  try {
    const [status, movies] = await Promise.all([
      proxyGet(`${base}/api/v3/system/status`, { 'X-Api-Key': radarr.apiKey }),
      proxyGet(`${base}/api/v3/movie`,          { 'X-Api-Key': radarr.apiKey }),
    ])
    res.json({ version: status.version, movieCount: Array.isArray(movies) ? movies.length : 0 })
  } catch (e) { res.status(503).json({ error: e.message }) }
})

// Radarr — queue
router.get('/radarr/queue', async (_req, res) => {
  const radarr = getService('radarr')
  const base   = serviceBase(radarr)
  if (!radarr?.apiKey || !base) return res.json({ configured: false, records: [] })
  try {
    const data = await proxyGet(
      `${base}/api/v3/queue?includeUnknownMovieItems=false&includeMovie=true`,
      { 'X-Api-Key': radarr.apiKey }
    )
    const records = (data.records || []).map(r => ({
      id: r.id, title: r.movie?.title || r.title,
      size: r.size, sizeleft: r.sizeleft,
      progress: r.size > 0 ? Math.round(((r.size - r.sizeleft) / r.size) * 100) : 0,
      status: r.status, eta: r.estimatedCompletionTime || null, protocol: r.protocol,
    }))
    res.json({ records })
  } catch (e) { res.status(503).json({ error: e.message, records: [] }) }
})

// Sonarr — stats
router.get('/sonarr/stats', async (_req, res) => {
  const sonarr = getService('sonarr')
  const base   = serviceBase(sonarr)
  if (!sonarr?.apiKey || !base) return res.json({ configured: false })
  try {
    const [status, series] = await Promise.all([
      proxyGet(`${base}/api/v3/system/status`, { 'X-Api-Key': sonarr.apiKey }),
      proxyGet(`${base}/api/v3/series`,         { 'X-Api-Key': sonarr.apiKey }),
    ])
    res.json({ version: status.version, seriesCount: Array.isArray(series) ? series.length : 0 })
  } catch (e) { res.status(503).json({ error: e.message }) }
})

// Sonarr — queue
router.get('/sonarr/queue', async (_req, res) => {
  const sonarr = getService('sonarr')
  const base   = serviceBase(sonarr)
  if (!sonarr?.apiKey || !base) return res.json({ configured: false, records: [] })
  try {
    const data = await proxyGet(
      `${base}/api/v3/queue?includeSeries=true&includeEpisode=true`,
      { 'X-Api-Key': sonarr.apiKey }
    )
    const records = (data.records || []).map(r => ({
      id: r.id, title: r.series?.title || r.title,
      episode: r.episode
        ? `S${String(r.episode.seasonNumber).padStart(2,'0')}E${String(r.episode.episodeNumber).padStart(2,'0')}`
        : '',
      size: r.size, sizeleft: r.sizeleft,
      progress: r.size > 0 ? Math.round(((r.size - r.sizeleft) / r.size) * 100) : 0,
      status: r.status, eta: r.estimatedCompletionTime || null, protocol: r.protocol,
    }))
    res.json({ records })
  } catch (e) { res.status(503).json({ error: e.message, records: [] }) }
})

// qBittorrent — active downloads
router.get('/qbittorrent/queue', async (_req, res) => {
  const qb   = getService('qbittorrent')
  if (!qb || !serviceBase(qb)) return res.json({ records: [], configured: false })
  const base = `${serviceBase(qb)}/api/v2`

  const getSid = async () => {
    const r = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(qb.user)}&password=${encodeURIComponent(qb.pass)}`,
      signal: AbortSignal.timeout(5000),
    })
    // Try Set-Cookie header first, fall back to parsing the raw header string
    const cookieHeader = r.headers.get('set-cookie') || ''
    const sid = cookieHeader.match(/SID=([^;]+)/)?.[1]
    if (!sid) throw new Error('qBittorrent login failed — check credentials')
    return sid
  }

  try {
    // First attempt — no auth (works when WebUI auth is disabled)
    let r = await fetch(`${base}/torrents/info?filter=downloading`, {
      signal: AbortSignal.timeout(5000),
    })
    const body = await r.text()

    // qBittorrent signals "not authenticated" as 403 OR 200 with body "Forbidden"
    const needsAuth = r.status === 403 || body === 'Forbidden'
    if (needsAuth) {
      if (!qb.user) return res.json({ records: [], error: 'Auth required — set the username and password in Settings → Services' })
      const sid = await getSid()
      r = await fetch(`${base}/torrents/info?filter=downloading`, {
        headers: { Cookie: `SID=${sid}` },
        signal: AbortSignal.timeout(5000),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status} after login`)
      const torrents = await r.json()
      return res.json({ records: normalizeTorrents(torrents) })
    }

    const torrents = JSON.parse(body)
    res.json({ records: normalizeTorrents(torrents) })
  } catch (e) { res.status(503).json({ error: e.message, records: [] }) }
})

// Tautulli activity
router.get('/tautulli/activity', async (_req, res) => {
  try {
    const d = await tautulliGet('get_activity')
    res.json({
      streamCount: d.stream_count || 0,
      directPlay:  d.stream_count_direct_play  || 0,
      directStream:d.stream_count_direct_stream|| 0,
      transcode:   d.stream_count_transcode    || 0,
      sessions: (d.sessions || []).map(s => ({
        sessionKey:    s.session_key,
        mediaType:     s.media_type,
        title:         s.title,
        showTitle:     s.grandparent_title || '',
        season:        s.parent_title || '',
        thumb:         s.thumb || '',
        ratingKey:     s.rating_key,
        state:         s.state,
        user:          s.friendly_name || s.user,
        player:        s.player,
        platform:      s.platform,
        ipAddress:     s.ip_address,
        progress:      parseInt(s.progress_percent) || 0,
        viewOffset:    s.view_offset || 0,
        duration:      s.duration    || 0,
        videoResolution: s.stream_video_resolution || s.video_resolution || '',
        videoCodec:    s.stream_video_codec  || s.video_codec  || '',
        audioCodec:    s.stream_audio_codec  || s.audio_codec  || '',
        transcodeDecision: s.transcode_decision || 'direct play',
        bandwidth:     parseInt(s.bandwidth) || 0,
        qualityProfile:s.quality_profile || '',
      })),
    })
  } catch (e) {
    res.status(503).json({ error: e.message, sessions: [], streamCount: 0 })
  }
})

router.get('/tautulli/history', async (_req, res) => {
  try {
    const d = await tautulliGet('get_history', { length: 12, order_column: 'date', order_dir: 'desc' })
    res.json({
      records: (d.data || []).map(r => ({
        date:          r.date,
        mediaType:     r.media_type,
        title:         r.title,
        showTitle:     r.grandparent_title || '',
        season:        r.parent_title || '',
        thumb:         r.thumb || '',
        ratingKey:     r.rating_key,
        user:          r.friendly_name || r.user,
        player:        r.player,
        duration:      r.duration || 0,
        percentComplete: r.percent_complete || 0,
        watched:       r.watched_status === 1,
      })),
    })
  } catch (e) {
    res.status(503).json({ error: e.message, records: [] })
  }
})

// Tautulli — last 30 days: plays, watch time, top movies / shows / users
router.get('/tautulli/stats', async (_req, res) => {
  try {
    const after = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
    const [stats, history] = await Promise.all([
      tautulliGet('get_home_stats', { time_range: '30', stats_count: '5' }),
      tautulliGet('get_history', { after, length: '1' }),
    ])
    const rows = id => (stats.find(s => s.stat_id === id)?.rows || [])
    res.json({
      plays:      history.recordsFiltered ?? null,
      duration:   history.filter_duration || null,
      topMovies:  rows('top_movies').map(r => ({ title: r.title, year: r.year, plays: r.total_plays, thumb: r.thumb })),
      topShows:   rows('top_tv').map(r => ({ title: r.title, plays: r.total_plays, thumb: r.thumb })),
      topUsers:   rows('top_users').map(r => ({ name: r.friendly_name || r.user, plays: r.total_plays })),
    })
  } catch (e) {
    const auth = /401|unauthor|invalid apikey/i.test(e.message)
    res.status(503).json({ error: auth ? 'Tautulli rejected the API key — update it in Settings → Services' : e.message })
  }
})

// Tautulli image proxy (serves Plex artwork via Tautulli's pms_image_proxy)
router.get('/tautulli/thumb', async (req, res) => {
  const { img } = req.query
  const t = getService('tautulli')
  if (!img || !t?.apiKey || !serviceBase(t)) return res.status(400).end()
  try {
    const qs = new URLSearchParams({ apikey: t.apiKey, cmd: 'pms_image_proxy', img, width: '160', height: '240', fallback: 'poster' })
    const r = await fetch(`${serviceBase(t)}/api/v2?${qs}`, { signal: AbortSignal.timeout(8000) })
    const buf = await r.arrayBuffer()
    res.set('Content-Type', r.headers.get('content-type') || 'image/jpeg')
    res.set('Cache-Control', 'public, max-age=300')
    res.send(Buffer.from(buf))
  } catch { res.status(503).end() }
})

// Seerr — recent requests (enriched with titles, paginated)
router.get('/seerr/requests', async (req, res) => {
  if (!seerrConfigured()) return res.json({ results: [], configured: false })
  const take = 20
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const skip = (page - 1) * take
  try {
    const data = await seerrGet(`/api/v1/request?take=${take}&skip=${skip}&sort=added&filter=all`)
    const reqs = data.results || []
    const enriched = await Promise.all(
      reqs.map(async r => {
        const tmdbId = r.media?.tmdbId
        const { title, year, releaseDate } = tmdbId
          ? await fetchMediaTitle(r.type, tmdbId)
          : { title: 'Unknown', year: '', releaseDate: null }
        return { ...r, title, year, releaseDate }
      })
    )
    res.json({ ...data, results: enriched, page, take })
  } catch (e) { res.status(503).json({ results: [], error: e.message }) }
})

// Seerr — direct request by TMDB ID (used by the inline picker in chat)
router.post('/seerr/request-direct', async (req, res) => {
  const { mediaId, mediaType } = req.body
  if (!mediaId || !mediaType) return res.status(400).json({ error: 'mediaId and mediaType required' })
  if (!seerrConfigured()) return res.status(503).json({ error: 'Seerr not configured' })
  try {
    const body = { mediaType, mediaId }
    if (mediaType === 'tv') {
      try {
        const tv      = await seerrGet(`/api/v1/tv/${mediaId}`)
        const seasons = (tv.seasons || []).filter(s => s.seasonNumber > 0).map(s => s.seasonNumber)
        if (seasons.length) body.seasons = seasons
      } catch { body.seasons = [1] }
    }
    await seerrPost('/api/v1/request', body)
    res.json({ ok: true })
  } catch (e) {
    const already = e.message.includes('409')
    res.status(already ? 409 : 503).json({ error: e.message, already })
  }
})

// Seerr — search
router.get('/seerr/search', async (req, res) => {
  const { q } = req.query
  if (!q) return res.status(400).json({ error: 'q required' })
  if (!seerrConfigured()) return res.status(503).json({ error: 'Seerr not configured' })
  try {
    const data = await seerrGet(`/api/v1/search?query=${encodeURIComponent(q)}&page=1`)
    res.json(data)
  } catch (e) { res.status(503).json({ error: e.message }) }
})

export default router
