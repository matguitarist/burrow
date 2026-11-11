import { useState, useEffect } from 'react'
import { Film, Tv, Clock, CheckCircle, XCircle, Download, CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react'
import { loc } from '../locale.js'

const STATUS_MAP = {
  1: { label: 'Pending',   color: 'var(--orange)', Icon: Clock },
  2: { label: 'Approved',  color: 'var(--green)', Icon: CheckCircle },
  3: { label: 'Declined',  color: 'var(--red)', Icon: XCircle },
  4: { label: 'Available', color: 'var(--blue)', Icon: Download },
  5: { label: 'Partial',   color: 'var(--purple)', Icon: Download },
}

function releaseInfo(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d)) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const label = d.toLocaleDateString(loc(), { month: 'short', day: 'numeric', year: 'numeric' })
  return { label, upcoming: d > today }
}

export default function SeerrPanel({ query = '' }) {
  const [page,     setPage]     = useState(1)
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [calAdded, setCalAdded] = useState({})

  useEffect(() => {
    setLoading(true)
    fetch(`/api/seerr/requests?page=${page}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [page])

  useEffect(() => { setPage(1) }, [query])

  if (!data) return null
  const { results = [], configured = true, error, pageInfo, take = 20 } = data

  if (!configured) return null

  const totalCount = pageInfo?.results ?? results.length
  const totalPages = Math.max(1, Math.ceil(totalCount / take))

  if (error && results.length === 0) return (
    <div className="glass-card seerr-panel">
      <div className="panel-header"><Film size={14} /><span>Media Requests</span></div>
      <p className="seerr-empty">Seerr unreachable — check settings.</p>
    </div>
  )

  const addToCalendar = async (r) => {
    try {
      await fetch('/api/events', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title: `${r.type === 'movie' ? '🎬' : '📺'} ${r.title} releases`,
          date:  r.releaseDate,
          notes: null,
        }),
      })
      setCalAdded(prev => ({ ...prev, [r.id]: true }))
    } catch {}
  }

  const lq       = query.toLowerCase()
  const filtered = query ? results.filter(r => r.title?.toLowerCase().includes(lq)) : results

  return (
    <div className="glass-card seerr-panel">
      <div className="panel-header">
        <Film size={14} />
        <span>Media Requests</span>
        {totalCount > 0 && <span className="tab-badge">{totalCount}</span>}
        {totalPages > 1 && (
          <div className="seerr-pagination">
            <button
              className="icon-btn seerr-page-btn"
              onClick={() => setPage(p => p - 1)}
              disabled={page === 1 || loading}
              title="Previous page"
            >
              <ChevronLeft size={12} />
            </button>
            <span className="seerr-page-label">{page} / {totalPages}</span>
            <button
              className="icon-btn seerr-page-btn"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages || loading}
              title="Next page"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        )}
      </div>

      {loading && <p className="seerr-empty">Loading…</p>}

      {!loading && results.length === 0 && (
        <p className="seerr-empty">No requests yet.</p>
      )}
      {!loading && results.length > 0 && filtered.length === 0 && (
        <p className="seerr-empty">No results for "{query}"</p>
      )}

      {!loading && filtered.length > 0 && (
        <div className="seerr-list">
          {filtered.map(r => {
            const status  = STATUS_MAP[r.status] || STATUS_MAP[1]
            const title   = r.title || 'Unknown'
            const year    = r.year || ''
            const isTV    = r.type !== 'movie'
            const release = releaseInfo(r.releaseDate)
            const seasons = r.seasons?.length > 0
              ? `S${r.seasons.map(s => s.seasonNumber).join(', S')}`
              : null
            const subtitle = seasons
              ?? (release ? (release.upcoming ? `Coming Soon · ${release.label}` : release.label) : '')
            return (
              <div key={r.id} className="seerr-row">
                <div className="seerr-row-icon" style={{ color: isTV ? 'var(--accent)' : 'var(--pink)' }}>
                  {isTV ? <Tv size={13} /> : <Film size={13} />}
                </div>
                <div className="seerr-row-info">
                  <span className="seerr-title">{title}{year ? ` (${year})` : ''}</span>
                  <span className={`seerr-subtitle${release?.upcoming && !seasons ? ' seerr-coming-soon' : ''}`}>
                    {subtitle}
                  </span>
                </div>
                <div className="seerr-row-actions">
                  <div className="seerr-status" style={{ color: status.color }}>
                    {release?.upcoming && !seasons && (
                      <button
                        className={`icon-btn seerr-cal${calAdded[r.id] ? ' seerr-cal-done' : ''}`}
                        onClick={() => addToCalendar(r)}
                        disabled={!!calAdded[r.id]}
                        title={calAdded[r.id] ? 'Added to calendar' : `Add release to calendar (${release.label})`}
                      >
                        <CalendarPlus size={11} />
                      </button>
                    )}
                    <status.Icon size={11} />
                    <span>{status.label}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
