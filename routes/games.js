import { Router } from 'express'
import { readJSON, writeJSON, uid, getSettings } from './lib.js'
import { getService, serviceBase } from './services.js'

// Store region for prices/currency (Settings → General → Region)
const steamCountry = () => getSettings().region.steamCountry

const router = Router()

// ── Steam helpers ─────────────────────────────────────────────────────────────
async function steamApiFetch(path, ms = 10000) {
  const ac    = new AbortController()
  const timer = setTimeout(() => ac.abort(), ms)
  try {
    const res = await fetch(`https://api.steampowered.com${path}`, { signal: ac.signal })
    if (!res.ok) throw new Error(`Steam API ${res.status}`)
    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

// Fetch all wishlist pages via the store AJAX endpoint (needs public profile)
async function fetchSteamWishlistAll(steamId) {
  const all = {}
  let page = 0
  while (true) {
    const ac    = new AbortController()
    const timer = setTimeout(() => ac.abort(), 10000)
    let data
    try {
      const res = await fetch(
        `https://store.steampowered.com/wishlist/profiles/${steamId}/wishlistdata/?p=${page}`,
        {
          signal: ac.signal,
          headers: {
            'Accept':           'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer':          'https://store.steampowered.com/',
            'User-Agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          },
        }
      )
      clearTimeout(timer)
      const ct = res.headers.get('content-type') || ''
      if (!ct.includes('json')) {
        const body = await res.text()
        if (body.includes('login') || body.includes('<!DOCTYPE')) {
          throw new Error('Steam profile appears to be private — go to steamcommunity.com/my/edit/settings and set Profile to Public, then try again')
        }
        throw new Error(`Steam returned unexpected content (${res.status})`)
      }
      data = await res.json()
    } finally {
      clearTimeout(timer)
    }
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) break
    Object.assign(all, data)
    if (Object.keys(data).length < 100) break
    page++
  }
  return all
}

// ── Steam Store helpers ───────────────────────────────────────────────────────
export async function steamStoreFetch(path, ms = 8000) {
  const ac    = new AbortController()
  const timer = setTimeout(() => ac.abort(), ms)
  try {
    const res = await fetch(`https://store.steampowered.com${path}`, { signal: ac.signal })
    if (!res.ok) throw new Error(`Steam ${res.status}`)
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('json')) {
      throw new Error('Steam returned an HTML page — make sure your Steam64 ID is correct and your profile is set to Public')
    }
    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function steamFetchGameDetails(appid) {
  const data  = await steamStoreFetch(`/api/appdetails?appids=${appid}&cc=${steamCountry()}&l=english`)
  const entry = data[String(appid)]
  if (!entry?.success) throw new Error(`No details for appid ${appid}`)
  const d = entry.data
  const p = d.price_overview
  const r = d.release_date
  return {
    appid:       d.steam_appid,
    title:       d.name,
    headerImage: d.header_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
    price:       p?.final_formatted   || (d.is_free ? 'Free' : null),
    // Released, not free, yet no price → Steam stopped selling it (e.g. an old edition)
    delisted:    !p && !d.is_free && !r?.coming_soon,
    // Demos → their game (DLC also has `fullgame`, but owning the base game doesn't mean owning the DLC)
    fullgame:    d.type === 'demo' && d.fullgame?.appid ? parseInt(d.fullgame.appid) : null,
    origPrice:   p?.initial_formatted || null,
    discountPct: p?.discount_percent  || 0,
    onSale:      (p?.discount_percent || 0) > 0,
    url:         `https://store.steampowered.com/app/${appid}`,
    releaseDate: r?.date        || null,
    comingSoon:  r?.coming_soon || false,
  }
}

// ── Steam seasonal sales ──────────────────────────────────────────────────────
// Valve publishes these ahead of time at partner.steamgames.com/doc/marketing/upcoming_events
// — append new ones as they're announced. Dates are inclusive (sales start 10am PT).
const STEAM_SALES = [
  { name: 'Winter Sale', start: '2026-12-17', end: '2027-01-04' },
  { name: 'Spring Sale', start: '2027-03-18', end: '2027-03-25' },
  { name: 'Summer Sale', start: '2027-06-24', end: '2027-07-08' },
]

function nextSteamSale() {
  const today = new Date().toISOString().slice(0, 10)
  const s = STEAM_SALES.find(s => s.end >= today)
  return s ? { ...s, active: s.start <= today } : null
}

// ── IsThereAnyDeal — lowest Steam price ever ──────────────────────────────────
// The API allows ~100 requests / 5 min, so lows are cached on disk and refreshed
// in bulk (lookup + storelow both take up to 200 games per call) with the daily
// price refresh. Opening a game only hits the API when its entry is missing/stale.
const ITAD_API   = 'https://api.isthereanydeal.com'
const ITAD_STEAM = 61                     // ITAD's shop id for Steam
const ITAD_FILE  = 'itad_cache.json'      // { [appid]: { id, low, country, at } }
const LOW_TTL    = 24 * 60 * 60 * 1000
let itadCache        = readJSON(ITAD_FILE, {})
let itadBlockedUntil = 0                  // set from Retry-After on a 429

async function itadFetch(path, key, body) {
  if (Date.now() < itadBlockedUntil) throw new Error('rate limited — backing off')
  const res = await fetch(`${ITAD_API}${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`, {
    method:  body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body:    body ? JSON.stringify(body) : undefined,
    signal:  AbortSignal.timeout(8000),
  })
  if (res.status === 429) {
    itadBlockedUntil = Date.now() + (parseInt(res.headers.get('retry-after')) || 300) * 1000
    throw new Error('rate limited (429)')
  }
  if (!res.ok) throw new Error(`IsThereAnyDeal ${res.status}`)
  return res.json()
}

const itadFresh = (c, country) => c && c.country === country && Date.now() - c.at < LOW_TTL

// Refresh cached lows for the given appids in as few requests as possible
async function refreshItadLows(appids) {
  const key = getService('itad')?.apiKey
  if (!key || !appids.length) return
  const country = steamCountry()
  for (let i = 0; i < appids.length; i += 200) {
    const chunk = appids.slice(i, i + 200)
    // ITAD ids never change — only look up the ones we don't know yet
    const ids     = Object.fromEntries(chunk.map(a => [a, itadCache[a]?.id || null]))
    const unknown = chunk.filter(a => !ids[a])
    if (unknown.length) {
      const found = await itadFetch(`/lookup/id/shop/${ITAD_STEAM}/v1`, key, unknown.map(a => `app/${a}`))
      for (const a of unknown) ids[a] = found[`app/${a}`] || null
    }
    const listed = chunk.filter(a => ids[a])
    const lows   = {}
    if (listed.length) {
      const res = await itadFetch(`/games/storelow/v2?country=${country}&shops=${ITAD_STEAM}`, key, listed.map(a => ids[a]))
      for (const e of res) {
        const l = e.lows?.find(l => l.shop?.id === ITAD_STEAM)
        if (l) lows[e.id] = { price: l.price.amount, regular: l.regular?.amount ?? null, currency: l.price.currency, cut: l.cut || 0, date: l.timestamp }
      }
    }
    const at = Date.now()
    for (const a of chunk) itadCache[a] = { id: ids[a], low: lows[ids[a]] || null, country, at }
  }
  writeJSON(ITAD_FILE, itadCache)
}

// Daily: refresh stale entries for the wishlist, drop games no longer in it
async function refreshWishlistLows(games) {
  if (!getService('itad')?.apiKey) return
  const keep = new Set(games.map(g => String(g.appid)))
  for (const a of Object.keys(itadCache)) if (!keep.has(a)) delete itadCache[a]
  const country = steamCountry()
  await refreshItadLows(games.map(g => g.appid).filter(a => !itadFresh(itadCache[a], country)))
}

// → { price, regular, currency, cut, date } | null (never sold on Steam) | undefined (no key / unavailable)
async function steamHistoryLow(appid) {
  if (!getService('itad')?.apiKey) return undefined
  const country = steamCountry()
  if (!itadFresh(itadCache[appid], country)) {
    try { await refreshItadLows([appid]) }
    catch (e) { console.error(`[ITAD] History low for ${appid} failed:`, e.message) }
  }
  const c = itadCache[appid]               // possibly stale — better than nothing
  return c?.country === country ? c.low : undefined
}

// ── Gotify push helper (sale alerts) ─────────────────────────────────────────
async function gotifyPush(title, message, priority = 5) {
  const g = getService('gotify')
  const url = serviceBase(g), token = g?.apiKey
  if (!url || !token) return
  try {
    await fetch(`${url}/message?token=${token}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title, message, priority }),
      signal:  AbortSignal.timeout(5000),
    })
  } catch {}
}

// ── Price refresh ─────────────────────────────────────────────────────────────
export async function refreshGamePrices() {
  const games = readJSON('games.json', [])
  if (!games.length) return 0
  const CONCURRENT = 5
  let updated = 0
  const saleAlerts = []
  for (let i = 0; i < games.length; i += CONCURRENT) {
    const batch   = games.slice(i, i + CONCURRENT)
    const results = await Promise.allSettled(batch.map(g => steamFetchGameDetails(g.appid)))
    for (let j = 0; j < results.length; j++) {
      if (results[j].status !== 'fulfilled') continue
      const d   = results[j].value
      const idx = games.findIndex(g => g.appid === d.appid)
      if (idx >= 0) {
        if (!games[idx].onSale && d.onSale) saleAlerts.push(d)
        games[idx] = { ...games[idx], price: d.price, origPrice: d.origPrice, discountPct: d.discountPct, onSale: d.onSale, releaseDate: d.releaseDate, comingSoon: d.comingSoon, delisted: d.delisted, fullgame: d.fullgame }
        updated++
      }
    }
  }
  writeJSON('games.json', games)
  writeJSON('steam_meta.json', { lastPriceRefresh: new Date().toISOString() })
  for (const g of saleAlerts) {
    await gotifyPush(`🎮 Sale: ${g.title}`, `${g.origPrice} → ${g.price} (-${g.discountPct}%)`)
  }
  console.log(`[Steam] Price refresh: ${updated}/${games.length} updated${saleAlerts.length ? `, ${saleAlerts.length} new sales` : ''}`)
  await refreshWishlistLows(games).catch(e => console.error('[ITAD] Bulk refresh failed:', e.message))
  return updated
}

export function scheduleDailyPriceRefresh() {
  const MS_24H = 24 * 60 * 60 * 1000
  const meta   = readJSON('steam_meta.json', {})
  const last   = meta.lastPriceRefresh ? new Date(meta.lastPriceRefresh).getTime() : 0
  const age    = Date.now() - last

  const runAndSchedule = () => {
    refreshGamePrices().catch(e => console.error('[Steam] Auto price refresh failed:', e.message))
    setInterval(() => {
      refreshGamePrices().catch(e => console.error('[Steam] Auto price refresh failed:', e.message))
    }, MS_24H)
  }

  if (age >= MS_24H) {
    // Overdue — run shortly after startup
    setTimeout(runAndSchedule, 10_000)
  } else {
    // Wait until 24h has elapsed since last refresh
    setTimeout(runAndSchedule, MS_24H - age)
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Games wishlist — CRUD (data/games.json)
router.get('/games', (_req, res) => res.json(readJSON('games.json', [])))

// Store info (description, genres, screenshots…) barely changes, so it's kept on
// disk for a week per region and the details modal opens with it right away.
const DETAILS_FILE = 'steam_details_cache.json'   // { [appid]: { country, at, info } }
const DETAILS_TTL  = 7 * 24 * 60 * 60 * 1000
let detailsCache   = readJSON(DETAILS_FILE, {})

async function steamStoreInfo(appid) {
  const country = steamCountry()
  const c = detailsCache[appid]
  if (c?.country === country && Date.now() - c.at < DETAILS_TTL) return c.info
  try {
    const data  = await steamStoreFetch(`/api/appdetails?appids=${appid}&cc=${country}&l=english`)
    const entry = data[String(appid)]
    if (!entry?.success) return null
    const d = entry.data
    const info = {
      appid: d.steam_appid,
      title: d.name,
      description: d.short_description || '',
      headerImage: d.header_image,
      genres: (d.genres || []).map(g => g.description),
      developers: d.developers || [],
      publishers: d.publishers || [],
      screenshots: (d.screenshots || []).slice(0, 4).map(s => s.path_thumbnail),
      platforms: d.platforms || {},
      releaseDate: d.release_date?.date || null,
      comingSoon: d.release_date?.coming_soon || false,
    }
    detailsCache[appid] = { country, at: Date.now(), info }
    writeJSON(DETAILS_FILE, detailsCache)
    return info
  } catch (e) {
    if (c?.info) return c.info               // stale beats nothing when Steam is slow
    throw e
  }
}

router.get('/games/:appid/details', async (req, res) => {
  const appid = parseInt(req.params.appid)
  try {
    const [info, historyLow] = await Promise.all([steamStoreInfo(appid), steamHistoryLow(appid)])
    if (!info) return res.status(404).json({ error: 'Details not available' })
    res.json({
      ...info,
      historyLow,                       // undefined → ITAD not configured
      itadConfigured: !!getService('itad')?.apiKey,
      nextSale: nextSteamSale(),
    })
  } catch (e) {
    res.status(503).json({ error: e.message })
  }
})

router.post('/games', async (req, res) => {
  const { appid } = req.body
  if (!appid) return res.status(400).json({ error: 'appid required' })
  const games = readJSON('games.json', [])
  if (games.find(g => g.appid === appid)) return res.status(409).json({ error: 'already in wishlist', already: true })
  try {
    const details = await steamFetchGameDetails(appid)
    const game    = { ...details, status: 'want', addedAt: new Date().toISOString() }
    games.unshift(game)
    writeJSON('games.json', games)
    res.json(game)
  } catch (e) { res.status(503).json({ error: e.message }) }
})

router.put('/games/:appid', (req, res) => {
  const appid = parseInt(req.params.appid)
  const games = readJSON('games.json', [])
  const idx   = games.findIndex(g => g.appid === appid)
  if (idx < 0) return res.status(404).json({ error: 'not found' })
  games[idx] = { ...games[idx], ...req.body }
  writeJSON('games.json', games)
  res.json(games[idx])
})

router.delete('/games/:appid', (req, res) => {
  const appid = parseInt(req.params.appid)
  writeJSON('games.json', readJSON('games.json', []).filter(g => g.appid !== appid))
  res.json({ ok: true })
})

// Steam — import real wishlist from Steam
router.post('/steam/import-wishlist', async (req, res) => {
  const steam   = getService('steam')
  const steamId = steam?.steamId
  if (!steamId) return res.status(400).json({ error: 'Steam ID not configured — add the Steam service in Settings → Services' })
  try {
    if (!steam.apiKey) {
      return res.status(400).json({ error: 'Steam API key required — add one in Settings (free at steamcommunity.com/dev/apikey).' })
    }

    // Get wishlist appids via official API
    const apiData = await steamApiFetch(`/IWishlistService/GetWishlist/v1/?key=${steam.apiKey}&steamid=${steamId}`)
    const items   = apiData.response?.items || []
    if (!items.length) return res.status(400).json({ error: 'Wishlist is empty or private. Go to Steam → Edit Profile → Privacy Settings → set Game Details to Public.' })

    // Fetch owned games to mark them
    let ownedIds = new Set()
    try {
      const od = await steamApiFetch(`/IPlayerService/GetOwnedGames/v1/?key=${steam.apiKey}&steamid=${steamId}`)
      ownedIds = new Set((od.response?.games || []).map(g => g.appid))
    } catch {}

    const existing    = readJSON('games.json', [])
    const existingMap = new Map(existing.map(g => [g.appid, g]))

    // Fetch details 5 at a time — wishlist items plus manually added games, so a
    // manual demo learns which full game it belongs to
    const wishlistIds = new Set(items.map(i => i.appid))
    const toFetch     = [...wishlistIds, ...existing.filter(g => !wishlistIds.has(g.appid) && !g.fromSteam).map(g => g.appid)]
    const CONCURRENT  = 5
    const incoming    = []
    const delisted    = new Set()
    for (let i = 0; i < toFetch.length; i += CONCURRENT) {
      const batch   = toFetch.slice(i, i + CONCURRENT)
      const results = await Promise.allSettled(batch.map(appid => steamFetchGameDetails(appid)))
      for (const r of results) {
        if (r.status !== 'fulfilled') continue
        const d = r.value
        if (existingMap.has(d.appid)) {
          existingMap.set(d.appid, { ...existingMap.get(d.appid), price: d.price, origPrice: d.origPrice, discountPct: d.discountPct, onSale: d.onSale, releaseDate: d.releaseDate, comingSoon: d.comingSoon, delisted: d.delisted, fullgame: d.fullgame })
        } else if (!d.delisted) {
          incoming.push({ ...d, status: 'want', addedAt: new Date().toISOString(), fromSteam: true })
        }
        // Steam keeps editions it no longer sells on your wishlist — nothing to track
        if (d.delisted && wishlistIds.has(d.appid)) delisted.add(d.appid)
      }
    }

    // Owning the game (or, for a demo, its full game) takes it off the list,
    // manual entries included — mirrors Steam dropping purchases from the wishlist
    const isOwned = g => ownedIds.has(g.appid) || (g.fullgame && ownedIds.has(g.fullgame))
    const kept    = existing
      .filter(g => !g.fromSteam || wishlistIds.has(g.appid))
      .map(g => existingMap.get(g.appid) || g)
      .filter(g => !(g.fromSteam && delisted.has(g.appid)))
    const merged  = [...incoming, ...kept].filter(g => !isOwned(g)).map(g => ({ ...g, owned: false }))
    const stayed  = merged.filter(g => existingMap.has(g.appid)).length
    writeJSON('games.json', merged)
    return res.json({ ok: true, added: merged.length - stayed, removed: existing.length - stayed, total: merged.length })
  } catch (e) {
    res.status(503).json({ error: e.message })
  }
})

// Steam — refresh owned flags on all games in wishlist
router.post('/steam/refresh-owned', async (req, res) => {
  const steam = getService('steam')
  if (!steam?.apiKey || !steam?.steamId) return res.status(400).json({ error: 'Steam ID and API key required — set them in Settings → Services' })
  try {
    const od = await steamApiFetch(`/IPlayerService/GetOwnedGames/v1/?key=${steam.apiKey}&steamid=${steam.steamId}`)
    const ownedIds = new Set((od.response?.games || []).map(g => g.appid))
    const games    = readJSON('games.json', []).map(g => ({ ...g, owned: ownedIds.has(g.appid) || (!!g.fullgame && ownedIds.has(g.fullgame)) }))
    writeJSON('games.json', games)
    res.json({ ok: true, ownedCount: ownedIds.size })
  } catch (e) {
    res.status(503).json({ error: e.message })
  }
})

// Steam — refresh prices for all wishlist games
router.post('/steam/refresh-prices', async (_req, res) => {
  try {
    const updated = await refreshGamePrices()
    res.json({ ok: true, updated, total: readJSON('games.json', []).length })
  } catch (e) {
    res.status(503).json({ error: e.message })
  }
})

// Steam — search proxy
router.get('/steam/search', async (req, res) => {
  const { q } = req.query
  if (!q) return res.status(400).json({ error: 'q required' })
  try {
    const data = await steamStoreFetch(`/api/storesearch/?term=${encodeURIComponent(q)}&l=english&cc=${steamCountry()}`)
    res.json(data)
  } catch (e) { res.status(503).json({ error: e.message }) }
})

export default router
