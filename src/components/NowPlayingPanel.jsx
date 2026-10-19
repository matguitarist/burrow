import { useState } from 'react'
import { Tv, ChevronDown } from 'lucide-react'

function useCollapse(key, defaultOpen = true) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(key) !== '0' } catch { return defaultOpen }
  })
  const toggle = () => setOpen(o => {
    const next = !o
    try { localStorage.setItem(key, next ? '1' : '0') } catch {}
    return next
  })
  return [open, toggle]
}

function fmtMs(ms) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  return `${m}:${String(sec).padStart(2,'0')}`
}

export default function NowPlayingPanel({ sessions, query = '' }) {
  const [open, toggleOpen] = useCollapse('panel-nowplaying', true)

  const lq       = query.toLowerCase()
  const filtered = query
    ? sessions.filter(s => {
        const title = (s.type === 'episode' && s.showTitle) ? s.showTitle : s.title
        return title?.toLowerCase().includes(lq)
      })
    : sessions

  return (
    <div className="glass-card now-playing-panel">
      <div className="panel-header">
        <div className="panel-icon" style={{ background: 'rgba(229,160,13,0.12)', borderColor: 'rgba(229,160,13,0.25)' }}>
          <Tv size={16} style={{ color: '#e5a00d' }} />
        </div>
        <h3 className="panel-title">Now Playing</h3>
        <span className="pill">{sessions.length} {sessions.length === 1 ? 'stream' : 'streams'}</span>
        <button className="icon-btn panel-collapse-btn" onClick={toggleOpen} title={open ? 'Collapse' : 'Expand'}>
          <ChevronDown size={13} className={open ? 'chevron-open' : 'chevron-closed'} />
        </button>
      </div>

      {open && sessions.length === 0 && (
        <p className="panel-empty">No active streams</p>
      )}

      {open && sessions.length > 0 && filtered.length === 0 && (
        <p className="panel-empty">No results for "{query}"</p>
      )}

      {open && filtered.length > 0 && (
        <div className="np-list">
          {filtered.map((s, i) => {
            const pct       = s.duration > 0 ? (s.viewOffset / s.duration) * 100 : 0
            const isEpisode = s.type === 'episode' && s.showTitle
            const mainTitle = isEpisode ? s.showTitle : s.title
            const subTitle  = isEpisode ? `${s.season ? s.season + ' · ' : ''}${s.title}` : null

            return (
              <div key={i} className="np-row">
                <div className="np-poster">
                  {s.thumb && (
                    <img
                      src={`/api/plex/thumb?path=${encodeURIComponent(s.thumb)}`}
                      alt={mainTitle}
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                  )}
                </div>

                <div className="np-info">
                  <div className="np-top-row">
                    <span className="np-title">{mainTitle}</span>
                    <div className="np-badges">
                      <span className={`np-badge ${s.state === 'playing' ? 'badge-playing' : 'badge-paused'}`}>
                        {s.state === 'playing' ? '▶' : '⏸'} {s.state}
                      </span>
                      {s.transcoding && <span className="np-badge badge-transcode">⚡ transcoding</span>}
                    </div>
                  </div>

                  {subTitle && <p className="np-sub">{subTitle}</p>}

                  <p className="np-meta">
                    {s.user}
                    {s.playerName ? <span className="np-player"> · {s.playerName}</span> : null}
                  </p>

                  <div className="np-progress-wrap">
                    <div className="np-bar">
                      <div className="np-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="np-times">
                      <span>{fmtMs(s.viewOffset)}</span>
                      <span>{Math.round(pct)}%</span>
                      <span>{fmtMs(s.duration)}</span>
                    </div>
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

