import { useState, useEffect } from 'react'
import { Lock, ShieldCheck, LogOut, X, Monitor } from 'lucide-react'
import { Group, Field } from './fields.jsx'
import { loc } from '../../locale.js'

// Password, protection level and signed-in devices. Saves immediately —
// separate from the panel's "Save Changes".
export default function SecuritySettings() {
  const [status,   setStatus]   = useState(null)
  const [sessions, setSessions] = useState([])
  const [current,  setCurrent]  = useState('')
  const [next,     setNext]     = useState('')
  const [confirm2, setConfirm2] = useState('')
  const [result,   setResult]   = useState(null)

  const load = async () => {
    const s = await fetch('/api/auth/status').then(r => r.json()).catch(() => null)
    setStatus(s)
    if (s?.passwordSet) fetch('/api/auth/sessions').then(r => r.ok ? r.json() : []).then(setSessions).catch(() => {})
  }
  useEffect(() => { load() }, [])

  const post = async (body, okText) => {
    setResult(null)
    const res = await fetch('/api/auth/password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return setResult({ error: data.error || 'Failed' })
    setResult({ ok: okText })
    setCurrent(''); setNext(''); setConfirm2('')
    load()
  }

  const savePassword = () => {
    if (next !== confirm2) return setResult({ error: "Passwords don't match" })
    post({ current, password: next }, status.passwordSet ? 'Password changed — other devices were signed out.' : 'Password set. Sign-in is now on.')
  }

  const revoke = async id => {
    await fetch(`/api/auth/sessions/${id}`, { method: 'DELETE' })
    load()
  }

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    load()
  }

  if (!status) return null
  const needsCurrent = status.passwordSet && !status.local

  return (
    <>
      <Group title="Sign-in" icon={<Lock size={12} />}>
        <p className="settings-hint">
          {status.passwordSet
            ? status.local
              ? 'Sign-in is on. You’re on this Mac, which is always trusted.'
              : status.signedIn ? 'Sign-in is on and this device is signed in.' : 'Sign-in is on.'
            : 'Burrow is open to anyone who can reach it. Set a password to require sign-in for changes (or everything).'}
        </p>
        {needsCurrent && <Field label="Current password" value={current} onChange={setCurrent} secret />}
        <Field label={status.passwordSet ? 'New password' : 'Password'} value={next} onChange={setNext} secret hint="At least 6 characters" />
        <Field label="Confirm" value={confirm2} onChange={setConfirm2} secret />
        <div className="svc-cfg-actions">
          <button type="button" className="svc-cfg-btn" onClick={savePassword} disabled={next.length < 6 || !confirm2 || (needsCurrent && !current)}>
            <ShieldCheck size={11} /> {status.passwordSet ? 'Change password' : 'Set password'}
          </button>
          {status.passwordSet && (
            <button type="button" className="svc-cfg-btn danger"
              onClick={() => window.confirm('Turn off sign-in? Anyone who can reach Burrow will be able to control it.') && post({ current, password: null }, 'Sign-in turned off.')}
              disabled={needsCurrent && !current}>
              Turn off sign-in
            </button>
          )}
        </div>
        {result?.ok    && <div className="settings-result ok">✓ {result.ok}</div>}
        {result?.error && <div className="settings-result error">✗ {result.error}</div>}
      </Group>

      {status.passwordSet && (
        <Group title="Protection" icon={<ShieldCheck size={12} />}>
          <div className="settings-field">
            <label className="settings-label">Require sign-in for</label>
            <select className="settings-input" value={status.mode} onChange={e => post({ current, mode: e.target.value }, 'Saved.')}>
              <option value="control">Changes and secrets (viewing stays open)</option>
              <option value="all">Everything</option>
            </select>
          </div>
          <p className="settings-hint">Changes include settings, container and wake actions, the terminal, chat and backups. Requests from this Mac itself never need sign-in.</p>
        </Group>
      )}

      {status.passwordSet && (
        <Group title="Signed-in devices" icon={<Monitor size={12} />}>
          {sessions.length === 0 && <p className="settings-hint">No devices are signed in.</p>}
          {sessions.map(s => (
            <div key={s.id} className="session-row">
              <div className="session-info">
                <span>{s.name}{s.current && <span className="session-current"> · this device</span>}</span>
                <span className="settings-hint">{s.ip} · last seen {new Date(s.lastSeen).toLocaleString(loc(), { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
              <button type="button" className="device-row-btn device-row-delete" onClick={() => revoke(s.id)} title="Sign out this device"><X size={12} /></button>
            </div>
          ))}
          {status.signedIn && (
            <button type="button" className="add-device-btn-sm" onClick={signOut}><LogOut size={11} /> Sign out on this device</button>
          )}
        </Group>
      )}
    </>
  )
}
