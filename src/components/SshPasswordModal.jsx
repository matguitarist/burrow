import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Lock, Eye, EyeOff } from 'lucide-react'

// `reason` says what needs SSH; defaults to the Windows drive-name lookup
export default function SshPasswordModal({ device, onSubmit, onSkip, reason }) {
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [errMsg,   setErrMsg]   = useState('')

  useEffect(() => {
    setPassword('')
    setErrMsg('')
    setLoading(false)
  }, [device])

  if (!device) return null

  const submit = async () => {
    if (!password || loading) return
    setLoading(true)
    setErrMsg('')
    const ok = await onSubmit(password)
    if (!ok) {
      setErrMsg('Incorrect password')
      setLoading(false)
    }
  }

  return createPortal(
    <div className="term-backdrop" onClick={onSkip}>
      <div className="term-modal ssh-pw-modal" onClick={e => e.stopPropagation()}>
        <div className="term-header">
          <div className="term-header-left">
            <Lock size={14} style={{ color: 'var(--accent)' }} />
            <span className="term-title">SSH password needed</span>
            <span className="term-ip">{device.sshUser || 'user'}@{device.ip}</span>
          </div>
        </div>

        <div className="term-form">
          <p className="ssh-pw-hint">
            {reason || <>Reading Windows drive names from <strong>{device.name}</strong> requires SSH.</>}
            {' '}Key auth didn't work, so enter the password once — it's saved on the Burrow
            server (same as your other service credentials) and reused from now on, even
            after a restart.
          </p>

          {errMsg && (
            <div className="term-error-msg">
              <span>✗ {errMsg}</span>
            </div>
          )}

          <div className="term-fields">
            <div className="term-field">
              <label>Password</label>
              <div className="term-pw-wrap">
                <input
                  className="term-input"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Password"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && submit()}
                />
                <button className="term-eye" type="button" onClick={() => setShowPw(s => !s)}>
                  {showPw ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
            </div>
          </div>

          <div className="term-form-actions">
            <button className="term-btn-cancel" onClick={onSkip}>Skip</button>
            <button className="term-btn-connect" onClick={submit} disabled={!password || loading}>
              {loading ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
