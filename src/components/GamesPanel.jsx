import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  Gamepad2,
  ExternalLink,
  Trash2,
  Download,
  RefreshCw,
  ShieldCheck,
  DollarSign,
  CalendarPlus,
  Search,
  BadgePercent,
  ArrowUpDown,
  Star,
  Play,
  Check,
  Clock,
  Sparkles,
  X
} from 'lucide-react'
import { loc } from '../locale.js'

const fmtMoney = (amount, currency) => {
  try { return new Intl.NumberFormat(loc(), { style: 'currency', currency }).format(amount) }
  catch { return `${currency} ${amount.toFixed(2)}` }
}
const priceLabel = g => g.delisted
  ? <span style={{ color: 'var(--muted)' }}>No longer sold</span>
  : (g.price || '—')
const fmtDay = (iso, opts = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  new Date(iso.length === 10 ? iso + 'T00:00' : iso).toLocaleDateString(loc(), opts)

const SHORT_DAY = { month: 'short', day: 'numeric' }
// "ends Nov 16" — or "ends today" / "ends tomorrow" when it's that close
function endsLabel(iso) {
  const days = Math.floor((new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000)
  return days <= 0 ? 'ends today' : days === 1 ? 'ends tomorrow' : `ends ${fmtDay(iso, SHORT_DAY)}`
}
const hitTarget = g => g.targetPrice && g.priceCents != null && g.priceCents <= g.targetPrice

// Target price editor: typed in the store currency, stored in cents like Steam's prices
function TargetPrice({ game, currency, onSave }) {
  const [text, setText] = useState(game.targetPrice ? String(game.targetPrice / 100) : '')
  const [saved, setSaved] = useState(false)
  useEffect(() => { setText(game.targetPrice ? String(game.targetPrice / 100) : ''); setSaved(false) }, [game.appid, game.targetPrice])
  const save = async () => {
    const n = parseFloat(text.replace(',', '.'))
    await onSave(game.appid, Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null)
    setSaved(true)
  }
  return (
    <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <input className="settings-input mono" style={{ width: 90, height: 26 }} inputMode="decimal"
        placeholder={currency || 'Price'} value={text}
        onChange={e => { setText(e.target.value); setSaved(false) }}
        onKeyDown={e => { if (e.key === 'Enter') save() }} />
      <button type="button" className="svc-cfg-btn" onClick={save}>{text ? 'Set' : 'Clear'}</button>
      {saved && <span style={{ color: 'var(--muted)', fontSize: 11 }}>{text ? 'You’ll get a notification when it drops this low' : 'No target'}</span>}
    </span>
  )
}

function saleLabel(s) {
  const short = { month: 'short', day: 'numeric' }
  if (s.active) return `${s.name} — on now, ends ${fmtDay(s.end, short)}`
  const days = Math.ceil((new Date(s.start + 'T00:00') - Date.now()) / 86400000)
  return `${s.name} · ${fmtDay(s.start, short)} – ${fmtDay(s.end, short)} (in ${days} day${days === 1 ? '' : 's'})`
}

// Steam date strings are like "Sep 25, 2025" or "25 Sep, 2025" or "Q4 2026" / "TBA"
function parseSteamDate(str) {
  if (!str) return null
  const d = new Date(str)
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10)
  }
  // Try "DD Mon, YYYY" format
  const m = str.match(/^(\d{1,2})\s+(\w+),?\s+(\d{4})$/)
  if (m) {
    const d2 = new Date(`${m[2]} ${m[1]}, ${m[3]}`)
    if (!isNaN(d2.getTime())) return d2.toISOString().slice(0, 10)
  }
  return null
}

function getPriceValue(g) {
  if (g.comingSoon && !g.price) return 999999
  if (!g.price) return 999999
  if (/free/i.test(g.price)) return 0
  const m = g.price.match(/[\d]+([.,]\d{1,2})?/)
  return m ? parseFloat(m[0].replace(',', '.')) : 999999
}

function getReleaseTimestamp(g) {
  const parsed = parseSteamDate(g.releaseDate)
  if (parsed) return new Date(parsed).getTime()
  if (g.comingSoon) return 9999999999999
  return 0
}

const STATUS_OPTS = ['want', 'playing', 'done']
const STATUS_LABELS = { want: '★ Want', playing: '▶ Playing', done: '✓ Done' }
const STATUS_COLORS = { want: '#818cf8', playing: '#34d399', done: '#94a3b8' }

// ── Details cache ────────────────────────────────────────────────────────────
// Kept for the session so reopening a game shows everything at once; rows
// prefetch on hover so the first open usually has it too.
const detailsCache = new Map()
const detailsInflight = new Map()

function loadDetails(appid, { force = false } = {}) {
  if (!force && detailsCache.has(appid)) return Promise.resolve(detailsCache.get(appid))
  if (detailsInflight.has(appid)) return detailsInflight.get(appid)
  const p = fetch(`/api/games/${appid}/details`)
    .then(r => r.json())
    .then(d => { if (d && !d.error) { detailsCache.set(appid, d); return d } return detailsCache.get(appid) || null })
    .catch(() => detailsCache.get(appid) || null)
    .finally(() => detailsInflight.delete(appid))
  detailsInflight.set(appid, p)
  return p
}

// ── Game Details Modal ────────────────────────────────────────────────────────
function GameDetailsModal({ game, onClose, onSetStatus, onSetTarget, onAddToCalendar, onRemove, calAdded, deleting }) {
  const [details, setDetails] = useState(() => detailsCache.get(game?.appid) || null)
  const [loading, setLoading] = useState(!details)

  useEffect(() => {
    if (!game) return
    let cancelled = false
    const cached = detailsCache.get(game.appid)
    setDetails(cached || null)
    setLoading(!cached)
    loadDetails(game.appid, { force: !!cached })   // cached: refresh quietly in the background
      .then(d => { if (!cancelled && d) setDetails(d) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [game?.appid])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!game) return null

  const isoDate = parseSteamDate(game.releaseDate)

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog game-modal-dialog" onClick={e => e.stopPropagation()}>
        <div className="game-modal-banner-wrap">
          {game.headerImage && (
            <img src={game.headerImage} alt={game.title} className="game-modal-banner" />
          )}
          <div className="game-modal-banner-overlay">
            <div className="game-modal-banner-top">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {game.onSale && (
                  <span className="games-sale" style={{ fontSize: 11, padding: '2px 7px' }}>
                    -{game.discountPct}% OFF
                  </span>
                )}
                {game.owned && (
                  <span className="games-owned-badge" style={{ margin: 0, fontSize: 10 }}>
                    <ShieldCheck size={11} /> In Library
                  </span>
                )}
                {game.comingSoon && (
                  <span className="games-coming-soon" style={{ fontSize: 10 }}>
                    Coming Soon
                  </span>
                )}
              </div>
              <button
                className="icon-btn"
                onClick={onClose}
                style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: '50%' }}
                title="Close"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        </div>

        <div className="game-modal-heading">
          <h2 className="game-modal-title">{game.title}</h2>
          <div className="games-price game-modal-price">
            {game.comingSoon
              ? <span className="games-coming-soon">{game.releaseDate || 'TBA'}</span>
              : game.onSale && game.origPrice
                ? <><s className="games-orig">{game.origPrice}</s> <span style={{ color: 'var(--green)' }}>{game.price}</span>
                    {game.saleEnds && <span className="games-ends"> · {endsLabel(game.saleEnds)}</span>}</>
                : priceLabel(game)
            }
          </div>
        </div>

        <div className="game-modal-body">
          {loading && !details ? (
            <p style={{ color: 'var(--muted)', fontSize: 12 }}>Loading Steam details…</p>
          ) : details?.description ? (
            <p className="game-modal-desc">{details.description}</p>
          ) : null}

          {details?.genres?.length > 0 && (
            <div className="game-modal-genres">
              {details.genres.map(genre => (
                <span key={genre} className="game-modal-genre">{genre}</span>
              ))}
            </div>
          )}

          <div className="game-modal-grid">
            <div className="game-modal-grid-item">
              <span className="game-modal-grid-label">Status</span>
              <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                {STATUS_OPTS.map(s => (
                  <button
                    key={s}
                    className={`games-status-btn${game.status === s ? ' active' : ''}`}
                    style={game.status === s ? { color: STATUS_COLORS[s], borderColor: STATUS_COLORS[s] + '55' } : {}}
                    onClick={() => onSetStatus(game.appid, s)}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            <div className="game-modal-grid-item">
              <span className="game-modal-grid-label">Release Date</span>
              <span className="game-modal-grid-val">{game.releaseDate || 'To be announced'}</span>
            </div>

            <div className="game-modal-grid-item">
              <span className="game-modal-grid-label">Developers</span>
              <span className="game-modal-grid-val">{details?.developers?.join(', ') || '—'}</span>
            </div>

            <div className="game-modal-grid-item">
              <span className="game-modal-grid-label">Steam App ID</span>
              <span className="game-modal-grid-val" style={{ fontFamily: 'monospace' }}>{game.appid}</span>
            </div>

            <div className="game-modal-grid-item">
              <span className="game-modal-grid-label">Lowest Price Ever</span>
              <span className="game-modal-grid-val">
                {!details ? '—'
                  : !details.itadConfigured
                    ? <span style={{ color: 'var(--muted)' }}>Add IsThereAnyDeal in Settings → Services</span>
                    : details.historyLow === undefined ? '—'
                    : !details.historyLow
                      ? <span style={{ color: 'var(--muted)' }}>No price history yet</span>
                      : <>
                          <span style={{ color: 'var(--green)' }}>{fmtMoney(details.historyLow.price, details.historyLow.currency)}</span>
                          {details.historyLow.cut > 0 && <span className="games-sale" style={{ marginLeft: 6 }}>-{details.historyLow.cut}%</span>}
                          <span style={{ color: 'var(--muted)', marginLeft: 6 }}>{fmtDay(details.historyLow.date)}</span>
                        </>
                }
              </span>
            </div>

            {details?.bestDeal && (
              <div className="game-modal-grid-item">
                <span className="game-modal-grid-label">Best Price Now</span>
                <span className="game-modal-grid-val">
                  <a href={details.bestDeal.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green)' }}>
                    {fmtMoney(details.bestDeal.price, details.bestDeal.currency)}
                  </a>
                  <span style={{ color: 'var(--muted)', marginLeft: 6 }}>at {details.bestDeal.shop}</span>
                  {details.bestDeal.cut > 0 && <span className="games-sale" style={{ marginLeft: 6 }}>-{details.bestDeal.cut}%</span>}
                </span>
              </div>
            )}

            {!game.comingSoon && !game.delisted && (
              <div className="game-modal-grid-item">
                <span className="game-modal-grid-label">Notify Me Below (Steam)</span>
                <span className="game-modal-grid-val">
                  <TargetPrice game={game} onSave={onSetTarget}
                    currency={game.currency || details?.historyLow?.currency || details?.bestDeal?.currency} />
                </span>
              </div>
            )}

            <div className="game-modal-grid-item">
              <span className="game-modal-grid-label">Next Steam Sale</span>
              <span className="game-modal-grid-val" style={details?.nextSale?.active ? { color: 'var(--green)' } : {}}>
                {details?.nextSale ? saleLabel(details.nextSale) : '—'}
              </span>
            </div>
          </div>

          {details?.screenshots?.length > 0 && (
            <div>
              <span className="modal-label" style={{ marginBottom: 6 }}>Screenshots</span>
              <div className="game-modal-shots">
                {details.screenshots.map((s, idx) => (
                  <img key={idx} src={s} alt="" className="game-modal-shot" loading="lazy" />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="game-modal-actions">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a
              href={game.url}
              target="_blank"
              rel="noopener noreferrer"
              className="game-modal-steam-btn"
              title="Open game on Steam store"
            >
              <ExternalLink size={14} /> Open on Steam
            </a>

            {isoDate && (
              <button
                className={`games-toolbar-btn${calAdded[game.appid] ? ' games-cal-done' : ''}`}
                onClick={() => onAddToCalendar(game)}
                disabled={!!calAdded[game.appid]}
                style={{ height: 36, padding: '0 12px' }}
              >
                <CalendarPlus size={13} />
                {calAdded[game.appid] ? 'Added to Calendar' : 'Add to Calendar'}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="icon-btn games-del"
              onClick={() => { onRemove(game.appid); onClose() }}
              disabled={deleting === game.appid}
              title="Remove from wishlist"
              style={{ width: 34, height: 34 }}
            >
              <Trash2 size={14} />
            </button>
            <button type="button" className="modal-btn-cancel" onClick={onClose} style={{ padding: '8px 16px' }}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Main Games Panel ──────────────────────────────────────────────────────────
// openAppid: open that game's summary (from the command palette), then onOpened()
export default function GamesPanel({ games = [], onUpdate, openAppid, onOpened }) {
  const [deleting,     setDeleting]     = useState(null)
  const [importState,  setImportState]  = useState(null)
  const [ownedState,   setOwnedState]   = useState(null)
  const [priceState,   setPriceState]   = useState(null)
  const [calAdded,     setCalAdded]     = useState({})
  const [query,        setQuery]        = useState('')
  const [filter,       setFilter]       = useState('all') // 'all' | 'sale' | 'want' | 'playing' | 'done' | 'owned' | 'comingSoon'
  const [sortBy,       setSortBy]       = useState('added_desc')
  const [selectedGame, setSelectedGame] = useState(null)
  // Open once the details are in (or after a short wait), so the modal doesn't
  // appear half-empty and then grow as the description and screenshots land.
  const openGame = g => {
    if (detailsCache.has(g.appid)) return setSelectedGame(g)
    Promise.race([loadDetails(g.appid), new Promise(r => setTimeout(r, 1500))])
      .then(() => setSelectedGame(g))
  }
  useEffect(() => {
    if (openAppid == null) return
    const g = games.find(x => x.appid === openAppid)
    if (g) openGame(g)
    onOpened?.()
  }, [openAppid, games])

  const setStatus = async (appid, status) => {
    try {
      await fetch(`/api/games/${appid}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status }),
      })
      onUpdate?.()
      setSelectedGame(prev => prev && prev.appid === appid ? { ...prev, status } : prev)
    } catch {}
  }

  const setTarget = async (appid, targetPrice) => {
    try {
      const res = await fetch(`/api/games/${appid}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ targetPrice }),
      })
      const saved = await res.json()
      onUpdate?.()
      setSelectedGame(prev => prev && prev.appid === appid ? { ...prev, targetPrice: saved.targetPrice } : prev)
    } catch {}
  }

  const remove = async (appid) => {
    setDeleting(appid)
    try {
      await fetch(`/api/games/${appid}`, { method: 'DELETE' })
      onUpdate?.()
      if (selectedGame?.appid === appid) setSelectedGame(null)
    } catch {}
    setDeleting(null)
  }

  const importWishlist = async () => {
    setImportState('loading')
    try {
      const res = await fetch('/api/steam/import-wishlist', { method: 'POST' })
      const d   = await res.json()
      setImportState(res.ok ? { ok: true, added: d.added, removed: d.removed, total: d.total } : { error: d.error })
      if (res.ok) onUpdate?.()
    } catch (e) {
      setImportState({ error: e.message })
    }
  }

  const addToCalendar = async (game) => {
    const isoDate = parseSteamDate(game.releaseDate)
    if (!isoDate) return
    try {
      await fetch('/api/events', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: `🎮 ${game.title} releases`, date: isoDate, notes: game.url }),
      })
      setCalAdded(prev => ({ ...prev, [game.appid]: true }))
    } catch {}
  }

  const refreshPrices = async () => {
    setPriceState('loading')
    try {
      const res = await fetch('/api/steam/refresh-prices', { method: 'POST' })
      const d   = await res.json()
      setPriceState(res.ok ? { ok: true, updated: d.updated, total: d.total } : { error: d.error })
      if (res.ok) onUpdate?.()
    } catch (e) {
      setPriceState({ error: e.message })
    }
  }

  const refreshOwned = async () => {
    setOwnedState('loading')
    try {
      const res = await fetch('/api/steam/refresh-owned', { method: 'POST' })
      const d   = await res.json()
      setOwnedState(res.ok ? { ok: true, ownedCount: d.ownedCount } : { error: d.error })
      if (res.ok) onUpdate?.()
    } catch (e) {
      setOwnedState({ error: e.message })
    }
  }

  // Pre-calculate counts for each filter category
  const counts = useMemo(() => ({
    all:        games.length,
    sale:       games.filter(g => g.onSale).length,
    want:       games.filter(g => g.status === 'want').length,
    playing:    games.filter(g => g.status === 'playing').length,
    done:       games.filter(g => g.status === 'done').length,
    owned:      games.filter(g => g.owned).length,
    comingSoon: games.filter(g => g.comingSoon).length,
  }), [games])

  // Filter and sort games
  const filteredAndSorted = useMemo(() => {
    const lq = query.trim().toLowerCase()
    const list = games.filter(g => {
      // Search query match
      if (lq && !g.title.toLowerCase().includes(lq)) return false

      // Category filter
      if (filter === 'sale')       return g.onSale
      if (filter === 'want')       return g.status === 'want'
      if (filter === 'playing')    return g.status === 'playing'
      if (filter === 'done')       return g.status === 'done'
      if (filter === 'owned')      return g.owned
      if (filter === 'comingSoon') return g.comingSoon
      return true
    })

    list.sort((a, b) => {
      switch (sortBy) {
        case 'discount_desc': {
          const diff = (b.discountPct || 0) - (a.discountPct || 0)
          return diff !== 0 ? diff : a.title.localeCompare(b.title)
        }
        case 'price_asc': {
          const diff = getPriceValue(a) - getPriceValue(b)
          return diff !== 0 ? diff : a.title.localeCompare(b.title)
        }
        case 'price_desc': {
          const diff = getPriceValue(b) - getPriceValue(a)
          return diff !== 0 ? diff : a.title.localeCompare(b.title)
        }
        case 'name_asc':
          return a.title.localeCompare(b.title)
        case 'name_desc':
          return b.title.localeCompare(a.title)
        case 'release_desc': {
          const diff = getReleaseTimestamp(b) - getReleaseTimestamp(a)
          return diff !== 0 ? diff : a.title.localeCompare(b.title)
        }
        case 'release_asc': {
          const diff = getReleaseTimestamp(a) - getReleaseTimestamp(b)
          return diff !== 0 ? diff : a.title.localeCompare(b.title)
        }
        case 'added_asc':
          return (new Date(a.addedAt || 0).getTime()) - (new Date(b.addedAt || 0).getTime())
        case 'added_desc':
        default:
          return (new Date(b.addedAt || 0).getTime()) - (new Date(a.addedAt || 0).getTime())
      }
    })

    return list
  }, [games, query, filter, sortBy])

  const hasActiveFilters = query.trim() !== '' || filter !== 'all' || sortBy !== 'added_desc'

  const resetFilters = () => {
    setQuery('')
    setFilter('all')
    setSortBy('added_desc')
  }

  const FILTER_TABS = [
    { id: 'all',        label: 'All',         count: counts.all,        icon: Sparkles },
    { id: 'sale',       label: 'On Sale',     count: counts.sale,       icon: BadgePercent, isSale: true },
    { id: 'want',       label: 'Want',        count: counts.want,       icon: Star },
    { id: 'playing',    label: 'Playing',     count: counts.playing,    icon: Play },
    { id: 'done',       label: 'Done',        count: counts.done,       icon: Check },
    { id: 'owned',      label: 'Owned',       count: counts.owned,      icon: ShieldCheck },
    { id: 'comingSoon', label: 'Coming Soon', count: counts.comingSoon, icon: Clock },
  ]

  return (
    <div className="glass-card games-panel">
      <div className="panel-header">
        <Gamepad2 size={14} />
        <span>Game Wishlist</span>
        {games.length > 0 && <span className="tab-badge">{games.length}</span>}
        {counts.sale > 0 && (
          <span className="pill pill-active" title={`${counts.sale} games on sale right now`}>
            <BadgePercent size={11} /> {counts.sale} on sale
          </span>
        )}
        {counts.owned > 0 && <span className="games-owned-count">{counts.owned} owned</span>}

        <div className="games-toolbar">
          <button
            className="games-toolbar-btn"
            onClick={importWishlist}
            disabled={importState === 'loading'}
            title="Import from Steam wishlist (profile must be public)"
          >
            <Download size={11} />
            {importState === 'loading' ? 'Importing…' : 'Import from Steam'}
          </button>
          <button
            className="games-toolbar-btn games-toolbar-btn-sm"
            onClick={refreshPrices}
            disabled={priceState === 'loading'}
            title="Refresh prices for all wishlist games"
          >
            <DollarSign size={11} className={priceState === 'loading' ? 'spin' : ''} />
          </button>
          <button
            className="games-toolbar-btn games-toolbar-btn-sm"
            onClick={refreshOwned}
            disabled={ownedState === 'loading'}
            title="Refresh owned game status (requires Steam API key)"
          >
            <RefreshCw size={11} className={ownedState === 'loading' ? 'spin' : ''} />
          </button>
        </div>
      </div>

      <div className="games-controls">
        <div className="games-search-bar">
          <div className="tab-search-wrap">
            <span className="tab-search-icon"><Search size={14} /></span>
            <input
              className="tab-search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search games by title…"
            />
            {query && (
              <button className="tab-search-clear" onClick={() => setQuery('')} title="Clear search">✕</button>
            )}
          </div>

          <div className="games-sort-wrap" title="Sort games">
            <ArrowUpDown size={13} />
            <select
              className="games-sort-select"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              aria-label="Sort games"
            >
              <option value="added_desc">Recently Added</option>
              <option value="added_asc">Date Added (Oldest)</option>
              <option value="discount_desc">Highest Discount %</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="name_asc">Title (A → Z)</option>
              <option value="name_desc">Title (Z → A)</option>
              <option value="release_desc">Release Date (Newest)</option>
              <option value="release_asc">Release Date (Upcoming)</option>
            </select>
          </div>
        </div>

        <div className="games-filter-bar">
          {FILTER_TABS.map(tab => {
            const Icon = tab.icon
            const isActive = filter === tab.id
            return (
              <button
                key={tab.id}
                className={`games-filter-chip${tab.isSale ? ' chip-sale' : ''}${isActive ? ' active' : ''}`}
                onClick={() => setFilter(tab.id)}
              >
                <Icon size={12} />
                <span>{tab.label}</span>
                <span className="chip-count">{tab.count}</span>
              </button>
            )
          })}
        </div>

        {hasActiveFilters && (
          <div className="games-meta-bar">
            <span>
              Showing <strong>{filteredAndSorted.length}</strong> of {games.length} games
              {filter !== 'all' && ` · Filter: ${FILTER_TABS.find(t => t.id === filter)?.label}`}
              {query && ` · Matching "${query}"`}
            </span>
            <button className="games-reset-btn" onClick={resetFilters}>
              Reset filters
            </button>
          </div>
        )}
      </div>

      {(importState || priceState || ownedState) && (
        <div className="games-status-bar">
          {importState && importState !== 'loading' && (
            importState.ok
              ? <span className="games-status-ok">✓ {importState.added} added{importState.removed > 0 ? `, ${importState.removed} removed` : ''} — {importState.total} total</span>
              : <span className="games-status-err">✗ {importState.error}</span>
          )}
          {priceState && priceState !== 'loading' && (
            priceState.ok
              ? <span className="games-status-ok">✓ Prices refreshed ({priceState.updated}/{priceState.total} updated)</span>
              : <span className="games-status-err">✗ {priceState.error}</span>
          )}
          {ownedState && ownedState !== 'loading' && (
            ownedState.ok
              ? <span className="games-status-ok">✓ {ownedState.ownedCount} owned games marked</span>
              : <span className="games-status-err">✗ {ownedState.error}</span>
          )}
        </div>
      )}

      {games.length === 0 ? (
        <p className="games-empty">No games yet — import your Steam wishlist or ask the assistant to add one.</p>
      ) : filteredAndSorted.length === 0 ? (
        <div className="games-empty">
          <p>
            {query && filter === 'sale'
              ? `No discounted games matching "${query}"`
              : query
                ? `No games matching "${query}"`
                : filter === 'sale'
                  ? 'No games are currently on sale'
                  : filter === 'owned'
                    ? 'No owned games found in wishlist'
                    : filter === 'comingSoon'
                      ? 'No unreleased games found'
                      : `No games in "${filter}" category`}
          </p>
          {hasActiveFilters && (
            <button className="games-reset-btn" onClick={resetFilters} style={{ marginTop: 6 }}>
              Show all games
            </button>
          )}
        </div>
      ) : (
        <div className="games-list">
          {filteredAndSorted.map(g => (
            <div
              key={g.appid}
              className={`games-row${g.owned ? ' games-row-owned' : ''}`}
              onClick={() => openGame(g)}
              onMouseEnter={() => loadDetails(g.appid)}
              title="Click to view game details"
            >
              {g.headerImage && (
                <img
                  src={g.headerImage}
                  alt=""
                  className="games-thumb"
                  loading="lazy"
                  onError={e => { e.currentTarget.style.display = 'none' }}
                />
              )}

              <div className="games-row-info">
                <span className="games-title">
                  {g.title}
                  {g.owned && (
                    <span className="games-owned-badge" title="You own this game">
                      <ShieldCheck size={10} /> Owned
                    </span>
                  )}
                </span>
                <span className="games-price">
                  {g.comingSoon
                    ? <span className="games-coming-soon">Coming Soon{g.releaseDate && !/coming soon/i.test(g.releaseDate) ? ` · ${g.releaseDate}` : ' · To be announced'}</span>
                    : g.onSale && g.origPrice
                      ? <><s className="games-orig">{g.origPrice}</s> {g.price} <span className="games-sale">-{g.discountPct}%</span>
                          {g.saleEnds && <span className="games-ends"> {endsLabel(g.saleEnds)}</span>}</>
                      : priceLabel(g)
                  }
                  {hitTarget(g) && <span className="games-target" title="At or below your target price">🎯 Target</span>}
                </span>
              </div>

              <div className="games-actions">
                {STATUS_OPTS.map(s => (
                  <button
                    key={s}
                    className={`games-status-btn status-${s}${g.status === s ? ' active' : ''}`}
                    onClick={e => { e.stopPropagation(); setStatus(g.appid, s) }}
                    title={STATUS_LABELS[s]}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
                {(() => {
                  const isoDate = parseSteamDate(g.releaseDate)
                  return (
                    <button
                      className={`icon-btn games-cal${calAdded[g.appid] ? ' games-cal-done' : ''}${!isoDate ? ' games-cal-disabled' : ''}`}
                      onClick={e => { e.stopPropagation(); addToCalendar(g) }}
                      disabled={!isoDate || !!calAdded[g.appid]}
                      title={!isoDate ? 'No release date to add' : calAdded[g.appid] ? 'Added to calendar' : `Add release date to calendar (${g.releaseDate})`}
                    >
                      <CalendarPlus size={11} />
                    </button>
                  )
                })()}
                <a
                  href={g.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="icon-btn games-link"
                  onClick={e => e.stopPropagation()}
                  title="Open in Steam"
                >
                  <ExternalLink size={11} />
                </a>
                <button
                  className="icon-btn games-del"
                  onClick={e => { e.stopPropagation(); remove(g.appid) }}
                  disabled={deleting === g.appid}
                  title="Remove from wishlist"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedGame && (
        <GameDetailsModal
          game={selectedGame}
          onClose={() => setSelectedGame(null)}
          onSetStatus={setStatus}
          onSetTarget={setTarget}
          onAddToCalendar={addToCalendar}
          onRemove={remove}
          calAdded={calAdded}
          deleting={deleting}
        />
      )}
    </div>
  )
}
