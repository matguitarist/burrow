import { useState } from 'react'
import { Tv, ChevronDown, Clock, Zap, Wifi } from 'lucide-react'
import { loc } from '../locale.js'

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
  if (!ms) return '0:00'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  return `${m}:${String(sec).padStart(2,'0')}`
}

function fmtBandwidth(kbps) {
  if (!kbps) return null
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`
  return `${kbps} Kbps`
}

function fmtDate(unixSec) {
  if (!unixSec) return ''
  const d = new Date(unixSec * 1000)
  const now = new Date()
  const diff = now - d
  const mins = Math.floor(diff / 60000)
  const hrs  = Math.floor(mins / 60)
  const days = Math.floor(hrs / 24)
  if (days === 0 && hrs < 1)  return `${mins}m ago`
  if (days === 0)              return `${hrs}h ago`
  if (days === 1)              return 'Yesterday'
  if (days < 7)               return `${days}d ago`
  return d.toLocaleDateString(loc(), { month: 'short', day: 'numeric' })
}

function transcodeColor(decision) {
  if (!decision) return 'var(--muted)'
  const d = decision.toLowerCase()
  if (d === 'direct play')   return '#34d399'
  if (d.includes('copy') || d.includes('stream')) return '#fbbf24'
  return '#f87171'
}

function resolutionLabel(res) {
  if (!res) return ''
  const r = String(res).toLowerCase()
  if (r === '4k' || r === '2160') return '4K'
  if (r === '1080') return '1080p'
  if (r === '720')  return '720p'
  if (r === '480')  return '480p'
  return res
}

function Thumb({ thumb, alt, className }) {
  const [err, setErr] = useState(false)
  if (!thumb || err) return <div className={`${className} tt-thumb-placeholder`} />
  return (
    <img
      className={className}
      src={`/api/tautulli/thumb?img=${encodeURIComponent(thumb)}`}
      alt={alt}
      onError={() => setErr(true)}
    />
  )
}

function StreamRow({ s }) {
  const isEpisode = s.mediaType === 'episode' && s.showTitle
  const mainTitle = isEpisode ? s.showTitle : s.title
  const subTitle  = isEpisode ? `${s.season ? s.season + ' · ' : ''}${s.title}` : null
  const bw        = fmtBandwidth(s.bandwidth)
  const res       = resolutionLabel(s.videoResolution)
  const codec     = [res, s.videoCodec?.toUpperCase(), s.audioCodec?.toUpperCase()].filter(Boolean).join(' · ')
  const tColor    = transcodeColor(s.transcodeDecision)

  return (
    <div className="tt-stream-row">
      <Thumb thumb={s.thumb} alt={mainTitle} className="tt-stream-poster" />

      <div className="tt-stream-info">
        <div className="tt-stream-top">
          <span className="tt-stream-title">{mainTitle}</span>
          <div className="tt-stream-badges">
            <span className={`tt-state-badge ${s.state === 'playing' ? 'tt-playing' : 'tt-paused'}`}>
              {s.state === 'playing' ? '▶' : '⏸'} {s.state}
            </span>
            {bw && (
              <span className="tt-bw-badge">
                <Wifi size={8} /> {bw}
              </span>
            )}
          </div>
        </div>

        {subTitle && <p className="tt-stream-sub">{subTitle}</p>}

        <p className="tt-stream-meta">
          {s.user}
          {s.player && <span className="tt-dim"> · {s.player}</span>}
          {s.ipAddress && <span className="tt-dim"> · {s.ipAddress}</span>}
        </p>

        {codec && (
          <p className="tt-stream-quality">
            {codec}
            {s.transcodeDecision && (
              <span className="tt-transcode" style={{ color: tColor }}>
                {' · '}{s.transcodeDecision}
              </span>
            )}
          </p>
        )}

        <div className="tt-progress-wrap">
          <div className="tt-bar">
            <div className="tt-fill" style={{ width: `${s.progress}%` }} />
          </div>
          <div className="tt-times">
            <span>{fmtMs(s.viewOffset)}</span>
            <span>{s.progress}%</span>
            <span>{fmtMs(s.duration)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function HistoryItem({ r }) {
  const isEpisode = r.mediaType === 'episode' && r.showTitle
  const title     = isEpisode ? r.showTitle : r.title
  const sub       = isEpisode ? r.title : null

  return (
    <div className="tt-hist-item">
      <Thumb thumb={r.thumb} alt={title} className="tt-hist-thumb" />
      <div className="tt-hist-info">
        <span className="tt-hist-title">{title}</span>
        {sub && <span className="tt-hist-sub">{sub}</span>}
        <span className="tt-hist-meta">{r.user}</span>
        <div className="tt-hist-foot">
          <span className="tt-hist-date">
            <Clock size={9} /> {fmtDate(r.date)}
          </span>
          {r.watched
            ? <span className="tt-hist-watched">✓ Watched</span>
            : <span className="tt-hist-partial">{r.percentComplete}%</span>
          }
        </div>
      </div>
    </div>
  )
}

export default function TautulliPanel({ activity, history, query = '' }) {
  const [streamOpen, toggleStream] = useCollapse('panel-tt-streams', true)
  const [histOpen,   toggleHist]   = useCollapse('panel-tt-history', true)

  const sessions = activity?.sessions  || []
  const records  = history?.records    || []
  const streamCount = activity?.streamCount || 0

  const directPlay  = activity?.directPlay   || 0
  const directStream= activity?.directStream || 0
  const transcode   = activity?.transcode    || 0

  const lq              = query.toLowerCase()
  const filteredSessions = query
    ? sessions.filter(s => {
        const title = (s.mediaType === 'episode' && s.showTitle) ? s.showTitle : s.title
        return title?.toLowerCase().includes(lq)
      })
    : sessions
  const filteredRecords = query
    ? records.filter(r => {
        const title = (r.mediaType === 'episode' && r.showTitle) ? r.showTitle : r.title
        return title?.toLowerCase().includes(lq)
      })
    : records

  return (
    <div className="tt-panels">

      {/* Now Streaming */}
      <div className="glass-card tt-card">
        <div className="panel-header">
          <div className="panel-icon" style={{ background: 'rgba(229,160,13,0.12)', borderColor: 'rgba(229,160,13,0.25)' }}>
            <Tv size={16} style={{ color: '#e5a00d' }} />
          </div>
          <h3 className="panel-title">Now Streaming</h3>
          <span className="pill">{streamCount} {streamCount === 1 ? 'stream' : 'streams'}</span>
          {streamCount > 0 && (
            <div className="tt-transcode-pills">
              {directPlay   > 0 && <span className="tt-tp tt-tp-dp">{directPlay}  Direct</span>}
              {directStream > 0 && <span className="tt-tp tt-tp-ds">{directStream} Stream</span>}
              {transcode    > 0 && <span className="tt-tp tt-tp-tr">{transcode}   Transcode</span>}
            </div>
          )}
          <button className="icon-btn panel-collapse-btn" onClick={toggleStream}>
            <ChevronDown size={13} className={streamOpen ? 'chevron-open' : 'chevron-closed'} />
          </button>
        </div>

        {streamOpen && sessions.length === 0 && (
          <p className="panel-empty">No active streams</p>
        )}
        {streamOpen && sessions.length > 0 && filteredSessions.length === 0 && (
          <p className="panel-empty">No results for "{query}"</p>
        )}
        {streamOpen && filteredSessions.length > 0 && (
          <div className="tt-stream-list">
            {filteredSessions.map(s => <StreamRow key={s.sessionKey} s={s} />)}
          </div>
        )}
      </div>

      {/* Recently Watched */}
      <div className="glass-card tt-card">
        <div className="panel-header">
          <div className="panel-icon" style={{ background: 'rgba(129,140,248,0.12)', borderColor: 'rgba(129,140,248,0.25)' }}>
            <Clock size={16} style={{ color: '#818cf8' }} />
          </div>
          <h3 className="panel-title">Recently Watched</h3>
          <span className="pill">{records.length} items</span>
          <button className="icon-btn panel-collapse-btn" onClick={toggleHist}>
            <ChevronDown size={13} className={histOpen ? 'chevron-open' : 'chevron-closed'} />
          </button>
        </div>

        {histOpen && records.length === 0 && (
          <p className="panel-empty">No watch history</p>
        )}
        {histOpen && records.length > 0 && filteredRecords.length === 0 && (
          <p className="panel-empty">No results for "{query}"</p>
        )}
        {histOpen && filteredRecords.length > 0 && (
          <div className="tt-hist-grid">
            {filteredRecords.map((r, i) => <HistoryItem key={r.ratingKey + '_' + i} r={r} />)}
          </div>
        )}
      </div>
    </div>
  )
}
