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
    price:       p?.final_formatted   || (r?.coming_soon ? null : 'Free'),
    origPrice:   p?.initial_formatted || null,
    discountPct: p?.discount_percent  || 0,
    onSale:      (p?.discount_percent || 0) > 0,
    url:         `https://store.steampowered.com/app/${appid}`,
    releaseDate: r?.date        || null,
    comingSoon:  r?.coming_soon || false,
  }
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
        games[idx] = { ...games[idx], price: d.price, origPrice: d.origPrice, discountPct: d.discountPct, onSale: d.onSale, releaseDate: d.releaseDate, comingSoon: d.comingSoon }
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

router.get('/games/:appid/details', async (req, res) => {
  const appid = parseInt(req.params.appid)
  try {
    const data  = await steamStoreFetch(`/api/appdetails?appids=${appid}&cc=${steamCountry()}&l=english`)
    const entry = data[String(appid)]
    if (!entry?.success) return res.status(404).json({ error: 'Details not available' })
    const d = entry.data
    res.json({
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

    // Fetch details 5 at a time (steamFetchGameDetails already works for single appids)
    const CONCURRENT = 5
    const incoming   = []
    let added = 0
    for (let i = 0; i < items.length; i += CONCURRENT) {
      const batch   = items.slice(i, i + CONCURRENT)
      const results = await Promise.allSettled(batch.map(item => steamFetchGameDetails(item.appid)))
      for (const r of results) {
        if (r.status !== 'fulfilled') continue
        const d = r.value
        if (existingMap.has(d.appid)) {
          existingMap.set(d.appid, { ...existingMap.get(d.appid), price: d.price, origPrice: d.origPrice, discountPct: d.discountPct, onSale: d.onSale, releaseDate: d.releaseDate, comingSoon: d.comingSoon, owned: ownedIds.has(d.appid) })
          continue
        }
        incoming.push({ ...d, status: 'want', owned: ownedIds.has(d.appid), addedAt: new Date().toISOString(), fromSteam: true })
        added++
      }
    }

    const wishlistIds = new Set(items.map(i => i.appid))
    const kept    = existing.filter(g => !g.fromSteam || wishlistIds.has(g.appid))
    const removed = existing.length - kept.length
    const merged  = [...incoming, ...kept.map(g => existingMap.get(g.appid) || g)]
    writeJSON('games.json', merged)
    return res.json({ ok: true, added, removed, total: merged.length })
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
    const games    = readJSON('games.json', []).map(g => ({ ...g, owned: ownedIds.has(g.appid) }))
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
