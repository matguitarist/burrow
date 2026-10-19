import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// ── Shared settings form primitives ──────────────────────────────────────────
export function Field({ label, value, onChange, placeholder, secret, mono, hint, type = 'text' }) {
  const [show, setShow] = useState(false)
  return (
    <div className="settings-field">
      <label className="settings-label">{label}</label>
      <div className="settings-input-wrap">
        <input
          className={`settings-input${mono ? ' mono' : ''}${secret ? ' settings-input-with-eye' : ''}`}
          type={secret && !show ? 'password' : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || ''}
          autoComplete="off" spellCheck={false}
        />
        {secret && (
          <button className="settings-eye" type="button" onClick={() => setShow(s => !s)}>
            {show ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        )}
      </div>
      {hint && <span className="settings-field-hint">{hint}</span>}
    </div>
  )
}

export function Section({ title, icon, children }) {
  return (
    <div className="settings-section">
      <div className="settings-section-title">{icon}<span>{title}</span></div>
      <div className="settings-fields">{children}</div>
    </div>
  )
}

export function Group({ title, icon, children }) {
  return (
    <div className="settings-group">
      <div className="settings-group-label">{icon}<span>{title}</span></div>
      {children}
    </div>
  )
}

export const ACCENT_OPTS = [
  '#ff6b35','#818cf8','#34d399','#60a5fa','#f472b6',
  '#fb923c','#a78bfa','#4ade80','#f59e0b','#22d3ee',
]

export function ColorRow({ value, onChange, extra }) {
  const opts = extra && !ACCENT_OPTS.includes(extra) ? [extra, ...ACCENT_OPTS] : ACCENT_OPTS
  return (
    <div className="device-color-row">
      {opts.map(c => (
        <button
          key={c} type="button"
          className={`color-swatch${value === c ? ' color-swatch-active' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  )
}
