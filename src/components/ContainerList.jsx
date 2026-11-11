import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Play, Square, RotateCw, ScrollText, X, RefreshCw, Loader2 } from 'lucide-react'
import SshPasswordModal from './SshPasswordModal.jsx'

// Glances reports health ("healthy", "starting"…) in place of "running"
const STOPPED = new Set(['exited', 'created', 'dead', 'paused', 'removing'])
export const isRunning = c => !STOPPED.has(String(c.status).toLowerCase())

// Calls a container endpoint; a 401 means "ask for the SSH password and retry"
async function call(url, init) {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) return { authRequired: true }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

function LogsModal({ device, container, onClose, onAuth }) {
  const [logs,    setLogs]    = useState('')
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const bottom = useRef(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const r = await call(`/api/containers/${device.id}/${encodeURIComponent(container)}/logs?tail=300`)
      if (r.authRequired) return onAuth(load)
      setLogs(r.logs || '(no output)')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [container])
  useEffect(() => { bottom.current?.scrollIntoView() }, [logs])

  return createPortal(
    <div className="term-backdrop" onClick={onClose}>
      <div className="term-modal logs-modal" onClick={e => e.stopPropagation()}>
        <div className="term-header">
          <div className="term-header-left">
            <ScrollText size={14} style={{ color: 'var(--accent)' }} />
            <span className="term-title">{container}</span>
            <span className="term-ip">{device.name} · last 300 lines</span>
          </div>
          <div className="logs-actions">
            <button className="icon-btn" onClick={load} disabled={loading} title="Refresh">
              <RefreshCw size={13} className={loading ? 'spin' : ''} />
            </button>
            <button className="icon-btn" onClick={onClose} title="Close"><X size={14} /></button>
          </div>
        </div>
        {error
          ? <p className="logs-error">✗ {error}</p>
          : <pre className="logs-body">{logs}<span ref={bottom} /></pre>}
      </div>
    </div>,
    document.body
  )
}

// Docker containers on one machine, with start/stop/restart and logs over SSH
export default function ContainerList({ device, containers, onChanged }) {
  const [busy,      setBusy]      = useState({})     // name → action in progress
  const [error,     setError]     = useState(null)
  const [logsFor,   setLogsFor]   = useState(null)
  const [authRetry, setAuthRetry] = useState(null)   // fn to rerun once the password is saved

  const act = async (name, action) => {
    if (action !== 'start' && !confirm(`${action === 'stop' ? 'Stop' : 'Restart'} ${name} on ${device.name}?`)) return
    setBusy(b => ({ ...b, [name]: action })); setError(null)
    try {
      const r = await call(`/api/containers/${device.id}/${encodeURIComponent(name)}/${action}`, { method: 'POST' })
      if (r.authRequired) { setAuthRetry(() => () => act(name, action)); return }
      onChanged?.()
    } catch (e) { setError(`${name}: ${e.message}`) }
    finally { setBusy(b => { const n = { ...b }; delete n[name]; return n }) }
  }

  const submitPassword = async (password) => {
    const res = await fetch(`/api/ssh-password/${device.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
    })
    if (!res.ok) return false
    const retry = authRetry
    setAuthRetry(null)
    retry?.()
    return true
  }

  return (
    <div className="card-docker-list">
      {containers.map(c => {
        const running = isRunning(c)
        const doing = busy[c.name]
        return (
          <div key={c.name} className="docker-row">
            <span className={`docker-dot docker-dot-${running ? 'up' : 'down'}`} />
            <span className="docker-name">{c.name}</span>
            {doing
              ? <span className="docker-status"><Loader2 size={9} className="spin" /> {doing}…</span>
              : <span className="docker-status">{c.status}</span>}
            <div className="docker-actions">
              <button title="Logs" onClick={() => setLogsFor(c.name)}><ScrollText size={10} /></button>
              <button title="Restart" disabled={!!doing || !running} onClick={() => act(c.name, 'restart')}><RotateCw size={10} /></button>
              {running
                ? <button title="Stop" disabled={!!doing} onClick={() => act(c.name, 'stop')}><Square size={9} /></button>
                : <button title="Start" disabled={!!doing} onClick={() => act(c.name, 'start')}><Play size={10} /></button>}
            </div>
          </div>
        )
      })}
      {error && <p className="docker-error">✗ {error}</p>}

      {logsFor && (
        <LogsModal device={device} container={logsFor} onClose={() => setLogsFor(null)}
          onAuth={retry => setAuthRetry(() => retry)} />
      )}
      <SshPasswordModal
        device={authRetry ? device : null}
        reason={`Controlling containers on ${device.name} uses SSH.`}
        onSubmit={submitPassword}
        onSkip={() => setAuthRetry(null)}
      />
    </div>
  )
}
