import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Lock } from 'lucide-react'
import { t } from '../i18n.js'

// Opened by src/auth.js whenever an API call needs sign-in
export default function LoginModal() {
  const [request,  setRequest]  = useState(null)   // { resolve }
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error,    setError]    = useState(null)
  const [busy,     setBusy]     = useState(false)
  const [required, setRequired] = useState(false)  // 'all' mode: no cancelling

  useEffect(() => {
    const open = e => {
      setRequest(e.detail); setPassword(''); setError(null)
      fetch('/api/auth/status').then(r => r.json()).then(s => setRequired(s.mode === 'all')).catch(() => {})
    }
    window.addEventListener('burrow:login', open)
    return () => window.removeEventListener('burrow:login', open)
  }, [])

  if (!request) return null

  const finish = ok => { request.resolve(ok); setRequest(null) }

  const submit = async e => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, remember }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return setError(data.error || t('Sign-in failed'))
      finish(true)
    } finally { setBusy(false) }
  }

  return createPortal(
    <div className={`login-backdrop${required ? ' login-required' : ''}`} onClick={() => !required && finish(false)}>
      <form className="login-card" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="login-icon"><Lock size={18} /></div>
        <h2>{t('Sign in to Burrow')}</h2>
        <p className="settings-hint">{required ? t('This dashboard is protected.') : t('This action needs you to be signed in.')}</p>
        <input
          className="settings-input" type="password" autoFocus autoComplete="current-password"
          value={password} onChange={e => setPassword(e.target.value)} placeholder={t('Password')}
        />
        <label className="svc-cfg-toggle">
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
          {t('Remember this device')}
        </label>
        {error && <div className="settings-result error">✗ {error}</div>}
        <div className="login-actions">
          {!required && <button type="button" className="modal-btn-cancel" onClick={() => finish(false)}>{t('Cancel')}</button>}
          <button type="submit" className="modal-btn-save" disabled={!password || busy}>{busy ? t('Signing in…') : t('Sign in')}</button>
        </div>
      </form>
    </div>,
    document.body
  )
}
