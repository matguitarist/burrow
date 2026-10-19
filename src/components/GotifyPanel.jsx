import { useState, useEffect } from 'react'
import { Bell, RefreshCw, AlertTriangle, Info, AlertCircle } from 'lucide-react'

function fmtAge(iso) {
  const diff = Date.now() - new Date(iso)
  const m = Math.round(diff / 60000)
  if (m < 2)   return 'just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

function PriorityIcon({ p }) {
  if (p >= 8) return <AlertTriangle size={11} className="gotify-prio-high" />
  if (p >= 5) return <AlertCircle   size={11} className="gotify-prio-med"  />
  return            <Info           size={11} className="gotify-prio-low"  />
}

export default function GotifyPanel({ onCount }) {
  const [messages,   setMessages]   = useState([])
  const [configured, setConfigured] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error,      setError]      = useState(null)

  const load = async (bust = false) => {
    bust ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/gotify/messages?limit=15')
      const d   = await res.json()
      setConfigured(d.configured)
      const msgs = d.messages || []
      setMessages(msgs)
      onCount?.(msgs.length)
      if (d.error) setError(d.error)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  if (configured === false) return null

  return (
    <div className="glass-card gotify-panel">
      <div className="panel-header">
        <Bell size={14} />
        <span>Notifications</span>
        {messages.length > 0 && <span className="pill">{messages.length}</span>}
        <button className="icon-btn gotify-refresh" onClick={() => load(true)} disabled={refreshing} title="Refresh">
          <RefreshCw size={12} className={refreshing ? 'spin' : ''} />
        </button>
      </div>

      {loading && <p className="gotify-empty">Loading…</p>}
      {error   && <p className="gotify-error">✗ {error}</p>}
      {!loading && !error && messages.length === 0 && (
        <p className="gotify-empty">No notifications.</p>
      )}

      {!loading && messages.length > 0 && (
        <div className="gotify-list">
          {messages.map(m => (
            <div key={m.id} className="gotify-row">
              <PriorityIcon p={m.priority ?? 1} />
              <div className="gotify-body">
                <span className="gotify-title">{m.title}</span>
                {m.message && m.message !== m.title && (
                  <span className="gotify-message">{m.message}</span>
                )}
              </div>
              <span className="gotify-age">{fmtAge(m.date)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
