import { useState } from 'react'
import { Download, Clock, ChevronDown } from 'lucide-react'

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

function fmtBytes(bytes) {
  if (!bytes && bytes !== 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const gb = bytes / 1024 ** 3
  const mb = bytes / 1024 ** 2
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${mb.toFixed(0)} MB`
}

function fmtEta(eta) {
  if (!eta) return null
  const diff = new Date(eta) - Date.now()
  if (diff <= 0) return 'finishing…'
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function QueueItem({ item, color }) {
  const eta = fmtEta(item.eta)
  return (
    <div className="qi-row">
      <div className="qi-header">
        <span className="qi-title">{item.title}</span>
        {item.episode && <span className="qi-ep">{item.episode}</span>}
      </div>
      <div className="qi-bar-row">
        <div className="qi-track">
          <div className="qi-fill" style={{ width: `${item.progress}%`, background: color }} />
        </div>
        <span className="qi-pct">{item.progress}%</span>
        <span className="qi-size">{fmtBytes(item.sizeleft)} left</span>
      </div>
      {eta && (
        <div className="qi-eta">
          <Clock size={9} /> {eta}
        </div>
      )}
    </div>
  )
}

export default function QueuePanel({ radarr, sonarr, qbit = [], query = '' }) {
  const [open, toggleOpen] = useCollapse('panel-queue', true)

  const lq             = query.toLowerCase()
  const filteredRadarr = query ? radarr.filter(i => i.title?.toLowerCase().includes(lq)) : radarr
  const filteredSonarr = query ? sonarr.filter(i => i.title?.toLowerCase().includes(lq)) : sonarr
  const filteredQbit   = query ? qbit.filter(i => i.title?.toLowerCase().includes(lq))   : qbit
  const total          = radarr.length + sonarr.length + qbit.length
  const filteredTotal  = filteredRadarr.length + filteredSonarr.length + filteredQbit.length

  return (
    <div className="glass-card queue-panel">
      <div className="panel-header">
        <div className="panel-icon" style={{ background: 'rgba(129,140,248,0.12)', borderColor: 'rgba(129,140,248,0.25)' }}>
          <Download size={16} style={{ color: '#818cf8' }} />
        </div>
        <h3 className="panel-title">Downloads</h3>
        <span className="pill">{total} active</span>
        <button className="icon-btn panel-collapse-btn" onClick={toggleOpen} title={open ? 'Collapse' : 'Expand'}>
          <ChevronDown size={13} className={open ? 'chevron-open' : 'chevron-closed'} />
        </button>
      </div>

      {open && total === 0 && (
        <p className="panel-empty">No active downloads</p>
      )}

      {open && total > 0 && filteredTotal === 0 && (
        <p className="panel-empty">No results for "{query}"</p>
      )}

      {open && filteredTotal > 0 && (
        <div className="queue-cols">
          {filteredRadarr.length > 0 && (
            <div className="queue-col">
              <h4 className="queue-col-title" style={{ color: '#a78bfa' }}>Radarr</h4>
              {filteredRadarr.map(item => <QueueItem key={item.id} item={item} color="#a78bfa" />)}
            </div>
          )}
          {filteredSonarr.length > 0 && (
            <div className="queue-col">
              <h4 className="queue-col-title" style={{ color: '#38bdf8' }}>Sonarr</h4>
              {filteredSonarr.map(item => <QueueItem key={item.id} item={item} color="#38bdf8" />)}
            </div>
          )}
          {filteredQbit.length > 0 && (
            <div className="queue-col">
              <h4 className="queue-col-title" style={{ color: '#6CB4E4' }}>qBittorrent</h4>
              {filteredQbit.map(item => <QueueItem key={item.id} item={item} color="#6CB4E4" />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
