import { useState, useMemo } from 'react'
import { Plus, X, ChevronDown, ChevronRight, Search, Zap, Trash2, Download, Upload, KeyRound, Loader2, Check, AlertTriangle } from 'lucide-react'
import { Field, ColorRow } from './fields.jsx'

// Fields that hold secrets or point at one specific network — stripped when the
// setup is exported as a shareable template
const PRIVATE_FIELDS = ['device', 'host', 'apiUrl', 'apiKey', 'user', 'pass', 'steamId']

function uniqueId(base, taken) {
  if (!taken.has(base)) return base
  return `${base}_${Math.random().toString(36).slice(2, 7)}`
}

export function newInstance(template, existing, devices) {
  const taken = new Set(existing.map(s => s.id))
  return {
    id: uniqueId(template.id, taken),
    template: template.id,
    name: template.name,
    color: template.color,
    enabled: true,
    device: template.cloud ? '' : (devices[0]?.id || ''),
    host: '',
    port: template.port || null,
    https: !!template.https,
    webPath: '', apiUrl: '', apiKey: '', user: '', pass: '',
  }
}

// Short "where does it live" label for the collapsed row
function locationLabel(s, t, devices) {
  if (t?.cloud) return 'Cloud account'
  const dev = devices.find(d => d.id === s.device)
  const host = dev ? dev.name : s.host
  if (!host) return 'Not configured'
  return `${host}${s.port ? `:${s.port}` : ''}`
}

// Integration whose credentials are still empty — its widgets won't work yet
function missingCreds(s, t) {
  if (!t?.integration) return false
  return (t.fields || []).some(f => f.key !== 'user' && f.key !== 'pass' && !s[f.key] && t.id !== 'openai')
}

// ── Template picker ──────────────────────────────────────────────────────────
function TemplatePicker({ templates, categories, onPick, onCancel }) {
  const [q, setQ]     = useState('')
  const [cat, setCat] = useState('All')

  const shown = templates.filter(t =>
    (cat === 'All' || t.category === cat) &&
    (!q || `${t.name} ${t.description || ''}`.toLowerCase().includes(q.toLowerCase()))
  )
  const usedCats = categories.filter(c => templates.some(t => t.category === c))

  return (
    <div className="tpl-picker">
      <div className="tpl-picker-head">
        <div className="tpl-search">
          <Search size={12} />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search templates…" />
        </div>
        <button className="device-row-btn" onClick={onCancel} title="Close"><X size={13} /></button>
      </div>
      <div className="tpl-cats">
        {['All', ...usedCats].map(c => (
          <button key={c} type="button" className={`tpl-cat${cat === c ? ' active' : ''}`} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <div className="tpl-grid">
        {shown.map(t => (
          <button key={t.id} type="button" className="tpl-item" onClick={() => onPick(t)} title={t.description || t.name}>
            <span className="tpl-dot" style={{ background: t.color }} />
            <span className="tpl-name">{t.name}</span>
            {t.integration && <Zap size={9} className="tpl-int" />}
          </button>
        ))}
        {shown.length === 0 && <p className="settings-hint">No match — use the Custom template for anything else.</p>}
      </div>
      <p className="settings-hint"><Zap size={9} style={{ verticalAlign: '-1px' }} /> = dashboard integration (widgets, chat tools). Others get a status dot and a link.</p>
    </div>
  )
}

// ── One service (collapsed row + editor) ─────────────────────────────────────
function ServiceCard({ svc, template: t, devices, status, open, onToggle, onChange, onDelete }) {
  const [test, setTest] = useState(null) // null | 'loading' | { ok, message }
  const upd = (k, v) => { onChange({ ...svc, [k]: v }); setTest(null) }

  const runTest = async () => {
    setTest('loading')
    try {
      const r = await fetch('/api/service-config/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(svc),
      })
      setTest(await r.json())
    } catch (e) { setTest({ ok: false, message: e.message }) }
  }

  const online  = status?.online
  const missing = missingCreds(svc, t)
  const custom  = !svc.device

  return (
    <div className={`svc-cfg${open ? ' open' : ''}${svc.enabled === false ? ' disabled' : ''}`}>
      <button type="button" className="svc-cfg-row" onClick={onToggle}>
        <span className="svc-cfg-dot" style={{ background: svc.color, opacity: online === false ? 0.35 : 1 }}
          title={online === true ? 'Online' : online === false ? 'Offline' : ''} />
        <span className="svc-cfg-name">{svc.name}</span>
        {missing && <KeyRound size={10} className="svc-cfg-warn" title="Credentials missing" />}
        <span className="svc-cfg-loc mono">{svc.enabled === false ? 'disabled' : locationLabel(svc, t, devices)}</span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>

      {open && (
        <div className="svc-cfg-body">
          <div className="svc-cfg-meta">
            <span className="svc-cfg-tpl">{t?.name || svc.template}{t?.integration ? ' · integration' : ''}</span>
            <label className="svc-cfg-toggle">
              <input type="checkbox" checked={svc.enabled !== false} onChange={e => upd('enabled', e.target.checked)} />
              Enabled
            </label>
          </div>
          {t?.description && <p className="settings-hint">{t.description}</p>}

          <Field label="Display name" value={svc.name} onChange={v => upd('name', v)} />
          <ColorRow value={svc.color} onChange={c => upd('color', c)} extra={t?.color} />

          {!t?.cloud && (
            <>
              <div className="svc-cfg-grid">
                <div className="settings-field">
                  <label className="settings-label">Runs on</label>
                  <select className="settings-input" value={svc.device || ''} onChange={e => upd('device', e.target.value)}>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}{d.ip ? ` — ${d.ip}` : ''}</option>)}
                    <option value="">Custom host…</option>
                  </select>
                </div>
                <Field label="Port" value={svc.port ?? ''} onChange={v => upd('port', v.replace(/\D/g, ''))} placeholder={String(t?.port || '')} mono />
              </div>
              {custom && (
                <Field label="Host / IP" value={svc.host} onChange={v => upd('host', v)} placeholder="192.168.x.x or nas.local" mono />
              )}
              <label className="svc-cfg-toggle">
                <input type="checkbox" checked={!!svc.https} onChange={e => upd('https', e.target.checked)} />
                Use HTTPS
              </label>
            </>
          )}

          {(t?.fields || []).map(f => (
            <Field key={f.key} label={f.label} value={svc[f.key] || ''} onChange={v => upd(f.key, v)}
              secret={f.secret} mono hint={f.hint} />
          ))}

          {!t?.cloud && (
            <details className="svc-cfg-adv">
              <summary>Advanced</summary>
              <Field label="Web path" value={svc.webPath} onChange={v => upd('webPath', v)}
                placeholder={t?.webPath || '/'} mono hint="Appended to the link that opens in your browser." />
              <Field label="Server URL override" value={svc.apiUrl} onChange={v => upd('apiUrl', v)}
                placeholder="http://127.0.0.1:port" mono
                hint="Only if the dashboard server must reach it differently than your browser does — e.g. a service that only listens on localhost." />
            </details>
          )}

          <div className="svc-cfg-actions">
            <button type="button" className="svc-cfg-btn" onClick={runTest} disabled={test === 'loading'}>
              {test === 'loading' ? <Loader2 size={11} className="spin" /> : <Zap size={11} />} Test connection
            </button>
            <button type="button" className="svc-cfg-btn danger" onClick={onDelete}><Trash2 size={11} /> Remove</button>
          </div>
          {test && test !== 'loading' && (
            <div className={`settings-result ${test.ok ? 'ok' : 'error'}`}>
              {test.ok ? <Check size={11} /> : <AlertTriangle size={11} />} {test.message}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Services tab ─────────────────────────────────────────────────────────────
export default function ServicesSettings({ services, onChange, templates, categories, devices, status }) {
  const [openId,   setOpenId]   = useState(null)
  const [picking,  setPicking]  = useState(false)
  const [importMsg, setImportMsg] = useState(null)

  const tplById = useMemo(() => Object.fromEntries(templates.map(t => [t.id, t])), [templates])

  // Grouped by template category, in catalog order
  const groups = useMemo(() => {
    const g = {}
    for (const s of services) (g[tplById[s.template]?.category || 'Other'] ??= []).push(s)
    return categories.filter(c => g[c]).map(c => [c, g[c]])
  }, [services, tplById, categories])

  const add = (t) => {
    const inst = newInstance(t, services, devices)
    onChange([...services, inst])
    setOpenId(inst.id)
    setPicking(false)
  }
  const update = (id, next) => onChange(services.map(s => s.id === id ? next : s))
  const remove = (id) => {
    const s = services.find(x => x.id === id)
    if (!confirm(`Remove ${s?.name || 'this service'}?`)) return
    onChange(services.filter(x => x.id !== id))
  }

  const exportTemplate = () => {
    const data = {
      format: 'burrow/services',
      version: 1,
      services: services.map(s => {
        const out = { ...s }
        for (const k of PRIVATE_FIELDS) delete out[k]
        return out
      }),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'burrow-services-template.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importTemplate = async (file) => {
    try {
      const data = JSON.parse(await file.text())
      const incoming = Array.isArray(data) ? data : data.services
      if (!Array.isArray(incoming)) throw new Error('Not a services template')
      const list = [...services]
      let added = 0
      for (const raw of incoming) {
        const t = tplById[raw.template] || tplById.custom
        const base = newInstance(t, list, devices)
        // Keep the shape (name/port/paths), never private fields from the file
        const clean = { ...raw }
        for (const k of PRIVATE_FIELDS) delete clean[k]
        list.push({ ...base, ...clean, id: base.id, template: t.id })
        added++
      }
      onChange(list)
      setImportMsg({ ok: true, text: `Added ${added} service${added === 1 ? '' : 's'} — set their host and keys, then save.` })
    } catch (e) {
      setImportMsg({ ok: false, text: e.message })
    }
  }

  return (
    <div className="svc-settings">
      <p className="settings-hint">
        Each service has its own address and credentials. Pick the device it runs on (IPs come from the Devices tab) or enter a custom host.
      </p>

      {groups.map(([cat, list]) => (
        <div key={cat} className="svc-cfg-group">
          <div className="svc-cfg-group-label">{cat}<span>{list.length}</span></div>
          {list.map(s => (
            <ServiceCard
              key={s.id}
              svc={s}
              template={tplById[s.template]}
              devices={devices}
              status={status?.[s.id]}
              open={openId === s.id}
              onToggle={() => setOpenId(openId === s.id ? null : s.id)}
              onChange={next => update(s.id, next)}
              onDelete={() => remove(s.id)}
            />
          ))}
        </div>
      ))}

      {services.length === 0 && !picking && (
        <p className="settings-hint">No services yet — add one from a template.</p>
      )}

      {picking ? (
        <TemplatePicker templates={templates} categories={categories} onPick={add} onCancel={() => setPicking(false)} />
      ) : (
        <button className="add-device-btn-sm" onClick={() => setPicking(true)}>
          <Plus size={11} /> Add service
        </button>
      )}

      <div className="svc-share">
        <div className="settings-section-title"><Upload size={11} /><span>Share setup</span></div>
        <p className="settings-hint">Export your service list as a template, without IPs, API keys or passwords. Importing one adds its services, ready to fill in.</p>
        <div className="backup-row">
          <button type="button" className="backup-btn" onClick={exportTemplate} disabled={!services.length}>
            <Download size={12} /> Export template
          </button>
          <label className="backup-btn backup-import-btn">
            <Upload size={12} /> Import template
            <input type="file" accept=".json,application/json" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importTemplate(f) }} />
          </label>
        </div>
        {importMsg && <p className={`backup-status ${importMsg.ok ? 'ok' : 'error'}`}>{importMsg.ok ? '✓' : '✗'} {importMsg.text}</p>}
      </div>
    </div>
  )
}
