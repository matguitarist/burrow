import { useState, useEffect } from 'react'
import { Settings, Zap, Save, X, Plus, Pencil, Check, Server, Monitor, Cpu, Laptop, Download, Upload, CloudSun, Bot, Boxes, Archive, Globe, Newspaper, CalendarDays, PanelsTopLeft, Lock, Workflow, Image as ImageIcon } from 'lucide-react'
import { Field, Group, ACCENT_OPTS } from './settings/fields.jsx'
import ServicesSettings from './settings/ServicesSettings.jsx'
import LayoutSettings from './settings/LayoutSettings.jsx'
import SecuritySettings from './settings/SecuritySettings.jsx'
import BackupsSettings from './settings/BackupsSettings.jsx'
import AutomationsSettings from './settings/AutomationsSettings.jsx'

const ICON_OPTS = [
  { value: 'server',  label: 'Server / NAS',   Icon: Server  },
  { value: 'monitor', label: 'Desktop PC',      Icon: Monitor },
  { value: 'cpu',     label: 'Mini PC / SBC',   Icon: Cpu     },
  { value: 'laptop',  label: 'Laptop',          Icon: Laptop  },
  { value: 'mac',     label: 'Mac',             Icon: Laptop  },
]

function getIcon(icon) {
  return (ICON_OPTS.find(o => o.value === icon) || ICON_OPTS[0]).Icon
}

function slugId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 20) + '_' + Math.random().toString(36).slice(2, 7)
}

// ── Single device card (view + inline-edit) ───────────────────────────────────
function DeviceCard({ device, onChange, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(device)

  const upd = (k, v) => setDraft(prev => ({ ...prev, [k]: v }))

  const save = () => { onChange(draft); setEditing(false) }
  const cancel = () => { setDraft(device); setEditing(false) }

  const Icon = getIcon(editing ? draft.icon : device.icon)

  return (
    <div className={`device-card${editing ? ' device-card-editing' : ''}`}>
      {/* Top row: icon + name + accent dot */}
      <div className="device-card-top">
        {editing ? (
          <select
            className="device-icon-select"
            value={draft.icon}
            onChange={e => upd('icon', e.target.value)}
            style={{ color: draft.accent }}
          >
            {ICON_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <div className="device-card-icon" style={{ color: device.accent }}>
            <Icon size={14} />
          </div>
        )}
        {editing ? (
          <input
            className="settings-input device-name-input"
            value={draft.name}
            onChange={e => upd('name', e.target.value)}
            placeholder="Device name"
            autoFocus
          />
        ) : (
          <span className="device-card-name">{device.name}</span>
        )}
        <div className="device-card-actions">
          {editing ? (
            <>
              <button className="device-row-btn device-row-save" onClick={save} title="Save"><Check size={11} /></button>
              <button className="device-row-btn" onClick={cancel} title="Cancel"><X size={11} /></button>
            </>
          ) : (
            <>
              <button className="device-row-btn" onClick={() => setEditing(true)} title="Edit"><Pencil size={10} /></button>
              <button className="device-row-btn device-row-delete" onClick={onDelete} title="Remove"><X size={11} /></button>
            </>
          )}
        </div>
      </div>

      {/* Bottom row: IP (always visible, editable when editing) */}
      <div className="device-card-bottom">
        {editing ? (
          <input
            className="settings-input mono device-ip-input"
            value={draft.ip}
            onChange={e => upd('ip', e.target.value)}
            placeholder="192.168.x.x"
          />
        ) : (
          <span className="device-card-ip mono">{device.ip}</span>
        )}

        {/* Color picker, SSH user, and MAC only in edit mode */}
        {editing && (
          <>
            <div className="device-color-row">
              {ACCENT_OPTS.map(c => (
                <button
                  key={c} type="button"
                  className={`color-swatch${draft.accent === c ? ' color-swatch-active' : ''}`}
                  style={{ background: c }}
                  onClick={() => upd('accent', c)}
                />
              ))}
            </div>
            <input
              className="settings-input mono"
              value={draft.sshUser || ''}
              onChange={e => upd('sshUser', e.target.value)}
              placeholder="SSH user — e.g. root, admin (optional)"
            />
            <input
              className="settings-input mono"
              value={draft.mac || ''}
              onChange={e => upd('mac', e.target.value)}
              placeholder="MAC for Wake-on-LAN — e.g. AA:BB:CC:DD:EE:FF (optional)"
            />
          </>
        )}
      </div>
    </div>
  )
}

// ── Add-device inline form ────────────────────────────────────────────────────
function AddDeviceForm({ onAdd, onCancel }) {
  const [name,    setName]    = useState('')
  const [ip,      setIp]      = useState('')
  const [mac,     setMac]     = useState('')
  const [sshUser, setSshUser] = useState('')
  const [icon,    setIcon]    = useState('server')
  const [accent,  setAccent]  = useState(ACCENT_OPTS[3])

  const submit = (e) => {
    e.preventDefault()
    if (!name.trim() || !ip.trim()) return
    onAdd({ id: slugId(name), name: name.trim(), ip: ip.trim(), icon, accent, mac: mac.trim(), sshUser: sshUser.trim() })
  }

  return (
    <form className="add-device-form" onSubmit={submit}>
      <div className="add-device-row1">
        <input className="settings-input" value={name} onChange={e => setName(e.target.value)}
          placeholder="Device name" autoFocus />
        <input className="settings-input mono" value={ip} onChange={e => setIp(e.target.value)}
          placeholder="192.168.x.x" />
      </div>
      <input className="settings-input mono" value={sshUser} onChange={e => setSshUser(e.target.value)}
        placeholder="SSH user — e.g. root, admin (optional)" />
      <input className="settings-input mono" value={mac} onChange={e => setMac(e.target.value)}
        placeholder="MAC for Wake-on-LAN — e.g. AA:BB:CC:DD:EE:FF (optional)" />
      <div className="add-device-row2">
        <select className="settings-input add-device-icon" value={icon} onChange={e => setIcon(e.target.value)}>
          {ICON_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="add-device-colors">
          {ACCENT_OPTS.map(c => (
            <button key={c} type="button"
              className={`color-swatch${accent === c ? ' color-swatch-active' : ''}`}
              style={{ background: c }}
              onClick={() => setAccent(c)} />
          ))}
        </div>
      </div>
      <div className="add-device-actions">
        <button type="button" className="modal-btn-cancel" onClick={onCancel}>Cancel</button>
        <button type="submit" className="modal-btn-save" disabled={!name.trim() || !ip.trim()}>Add</button>
      </div>
    </form>
  )
}

// ── Draw Things — status + LoRA settings (own fetch/save cycle, data/drawthings-settings.json) ──
function DrawThingsGroup({ open }) {
  const [status,  setStatus]  = useState(null) // { online, model, loras }
  const [dt,      setDt]      = useState({ loraEnabled: false, loraFile: '', loraWeight: 1.0 })
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  useEffect(() => {
    if (!open) return
    fetch('/api/drawthings/status').then(r => r.json()).then(setStatus).catch(() => setStatus({ online: false, model: null, loras: [] }))
    fetch('/api/drawthings-settings').then(r => r.json()).then(setDt).catch(() => {})
  }, [open])

  const save = async () => {
    setSaving(true)
    try {
      await fetch('/api/drawthings-settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dt),
      })
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch {}
    setSaving(false)
  }

  const loras = status?.loras || []

  return (
    <Group title="Draw Things" icon={<ImageIcon size={12} />}>
      <p className="settings-hint">
        {!status ? 'Checking…' : status.online
          ? `Connected — current model: ${status.model || 'unknown'}`
          : 'Draw Things isn’t reachable — check its entry in Services.'}
      </p>
      <div className="settings-field">
        <label className="settings-label">LoRA for generated images</label>
        <div className="profile-gender-btns">
          <button type="button" className={`profile-gender-btn${!dt.loraEnabled ? ' active' : ''}`}
            onClick={() => setDt(p => ({ ...p, loraEnabled: false }))}>Off</button>
          <button type="button" className={`profile-gender-btn${dt.loraEnabled ? ' active' : ''}`}
            onClick={() => setDt(p => ({ ...p, loraEnabled: true }))}>On</button>
        </div>
      </div>
      {dt.loraEnabled && (
        loras.length > 0 ? (
          <>
            <div className="settings-field">
              <label className="settings-label">LoRA</label>
              <select
                className="settings-input"
                value={dt.loraFile}
                onChange={e => setDt(p => ({ ...p, loraFile: e.target.value }))}
              >
                <option value="">— none —</option>
                {loras.map(l => <option key={l.file} value={l.file}>{l.name}</option>)}
              </select>
            </div>
            <Field label="Weight" value={String(dt.loraWeight)} mono
              onChange={v => setDt(p => ({ ...p, loraWeight: parseFloat(v) || 0 }))} placeholder="1.0" />
          </>
        ) : (
          <p className="settings-hint">No LoRAs found — install one in the Draw Things app first.</p>
        )
      )}
      <button className="pull-btn profile-save-btn" onClick={save} disabled={saving}>
        {saved ? '✓ Saved' : saving ? 'Saving…' : <><Save size={11}/> Save</>}
      </button>
    </Group>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
const POLL_OPTS = [
  { label: '10 seconds', value: 10_000 },
  { label: '30 seconds', value: 30_000 },
  { label: '1 minute',   value: 60_000 },
  { label: '5 minutes',  value: 300_000 },
]

// News → tracked repos are edited as text: one "owner/repo" or "Name=owner/repo" per line
function trackedToText(list = []) {
  return list.map(t => t.name && t.name !== t.repo.split('/').pop() ? `${t.name}=${t.repo}` : t.repo).join('\n')
}
function textToTracked(text) {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [name, repo] = l.includes('=') ? l.split('=').map(x => x.trim()) : ['', l]
    return { name, repo }
  })
}

const TABS = [
  { id: 'general',  label: 'General',  Icon: Zap     },
  { id: 'devices',  label: 'Devices',  Icon: Server  },
  { id: 'services', label: 'Services', Icon: Boxes   },
  { id: 'ai',       label: 'AI',       Icon: Bot     },
  { id: 'automate', label: 'Automate', Icon: Workflow },
  { id: 'security', label: 'Security', Icon: Lock    },
  { id: 'backup',   label: 'Backup',   Icon: Archive },
]

function loadTab() {
  try { return localStorage.getItem('settings-tab') || 'services' } catch { return 'services' }
}

export default function LeftPanel({ open, onClose, onDeviceChange, pollMs, onPollChange, serviceStatus }) {
  const [tab,          setTab]          = useState(loadTab)
  const [settings,     setSettings]     = useState(null)
  const [trackedText,  setTrackedText]  = useState('')  // News → tracked repos, one per line
  const [devices,      setDevices]      = useState([])
  const [svcConfig,    setSvcConfig]    = useState([])
  const [catalog,      setCatalog]      = useState({ templates: [], categories: [] })
  const [calendars,    setCalendars]    = useState([])
  const [dirty,        setDirty]        = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [result,       setResult]       = useState(null)
  const [addingDevice, setAddingDevice] = useState(false)
  const [restoreState, setRestoreState] = useState(null) // null | 'loading' | {ok, restored} | {error}

  useEffect(() => {
    if (!open) return
    fetch('/api/settings').then(r => r.json()).then(data => {
      setSettings(data)
      setDevices(data.devices || [])
      setTrackedText(trackedToText(data.news?.tracked))
    }).catch(() => {})
    fetch('/api/service-config').then(r => r.json()).then(setSvcConfig).catch(() => {})
    fetch('/api/service-templates').then(r => r.json()).then(setCatalog).catch(() => {})
    fetch('/api/config').then(r => r.json()).then(d => setCalendars(d.region?.calendars || [])).catch(() => {})
    setResult(null)
    setDirty(false)
  }, [open])

  const switchTab = (id) => {
    setTab(id)
    try { localStorage.setItem('settings-tab', id) } catch {}
  }

  const touch = () => { setDirty(true); setResult(null) }
  // Update one field of a settings section, e.g. set('weather', 'lat', '45.5')
  const set = (section, key, val) => {
    setSettings(prev => ({ ...prev, [section]: key ? { ...prev[section], [key]: val } : val }))
    touch()
  }
  const changeServices = (list) => { setSvcConfig(list); touch() }

  const updateDevice = (id, updated) => { setDevices(prev => prev.map(d => d.id === id ? updated : d)); touch() }
  const addDevice = (device) => { setDevices(prev => [...prev, device]); setAddingDevice(false); touch() }
  const deleteDevice = (id) => {
    const used = svcConfig.filter(s => s.device === id)
    if (used.length && !confirm(`${used.map(s => s.name).join(', ')} run${used.length === 1 ? 's' : ''} on this device. Remove it anyway? Those services will need a new host.`)) return
    setDevices(prev => prev.filter(d => d.id !== id))
    touch()
  }

  const handleSave = async () => {
    setSaving(true); setResult(null)
    const payload = { ...settings, devices, news: { ...settings.news, tracked: textToTracked(trackedText) } }
    try {
      const r1 = await fetch('/api/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const r2 = await fetch('/api/service-config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(svcConfig),
      })
      const d2 = await r2.json()
      if (!r1.ok || !r2.ok) throw new Error(d2.error || 'Failed to save')
      setSvcConfig(d2.services)
      setResult({ ok: true })
      setDirty(false)
      onDeviceChange?.()
    } catch (e) {
      setResult({ error: e.message })
    } finally {
      setSaving(false)
    }
  }

  const aiServices = svcConfig.filter(s => ['ollama', 'omlx', 'openai'].includes(s.template))

  return (
    <>
      <div className={`panel-backdrop${open ? ' panel-backdrop-visible' : ''}`} onClick={onClose} />
      <div className={`side-panel left-panel settings-panel${open ? ' panel-open' : ''}`}>
        <div className="side-panel-header">
          <div className="side-panel-title"><Settings size={15} /><span>Settings</span></div>
          <button className="icon-btn" onClick={onClose} title="Close"><X size={14} /></button>
        </div>

        <nav className="settings-tabs">
          {TABS.map(t => (
            <button key={t.id} type="button" className={`settings-tab${tab === t.id ? ' active' : ''}`} onClick={() => switchTab(t.id)}>
              <t.Icon size={12} /><span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="side-panel-body">

          {tab === 'general' && settings && (
            <>
              <Group title="Dashboard" icon={<Zap size={12} />}>
                <div className="settings-field">
                  <label className="settings-label">Refresh interval</label>
                  <select className="settings-input" value={pollMs} onChange={e => onPollChange(parseInt(e.target.value))}>
                    {POLL_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <p className="settings-hint">Applies immediately and is saved in this browser.</p>
              </Group>
              <Group title="Layout" icon={<PanelsTopLeft size={12} />}>
                <LayoutSettings layout={settings.layout} onChange={l => set('layout', null, l)} />
              </Group>
              <Group title="Region" icon={<Globe size={12} />}>
                <div className="svc-cfg-grid even">
                  <Field label="Language & format" value={settings.region.locale} onChange={v => set('region', 'locale', v)}
                    placeholder={`Browser (${navigator.language})`} mono hint="e.g. en-US, fr-CA, de-DE" />
                  <Field label="Steam store country" value={settings.region.steamCountry} onChange={v => set('region', 'steamCountry', v.toUpperCase())}
                    placeholder="US" mono hint="Prices and currency, e.g. CA, GB, FR" />
                </div>
                <div className="settings-field">
                  <label className="settings-label">Holiday calendar</label>
                  <select className="settings-input" value={settings.region.holidays} onChange={e => set('region', 'holidays', e.target.value)}>
                    <option value="">None</option>
                    {calendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </Group>
              <Group title="Agenda" icon={<CalendarDays size={12} />}>
                <label className="svc-cfg-toggle">
                  <input type="checkbox" checked={settings.agenda.releases} onChange={e => set('agenda', 'releases', e.target.checked)} />
                  Show upcoming episodes and movies from Sonarr &amp; Radarr
                </label>
              </Group>
              <Group title="News" icon={<Newspaper size={12} />}>
                <label className="svc-cfg-toggle">
                  <input type="checkbox" checked={settings.news.emulation} onChange={e => set('news', 'emulation', e.target.checked)} />
                  Emulation news (emulation.gametechwiki.com)
                </label>
                <div className="settings-field">
                  <label className="settings-label">Tracked releases</label>
                  <textarea
                    className="settings-input mono"
                    rows={4}
                    value={trackedText}
                    onChange={e => { setTrackedText(e.target.value); touch() }}
                    placeholder={'owner/repo — one per line\nlibretro/RetroArch\nRPCS3=RPCS3/rpcs3'}
                    spellCheck={false}
                  />
                  <span className="settings-field-hint">GitHub repos whose latest release shows in the News tab. Prefix a label with “Name=”.</span>
                </div>
              </Group>
              <Group title="Weather" icon={<CloudSun size={12} />}>
                <p className="settings-hint">Uses Open-Meteo (free, no API key). Find your coordinates at latlong.net.</p>
                <div className="svc-cfg-grid even">
                  <Field label="Latitude"  value={settings.weather.lat} onChange={v => set('weather', 'lat', v)} placeholder="45.5017" mono />
                  <Field label="Longitude" value={settings.weather.lon} onChange={v => set('weather', 'lon', v)} placeholder="-73.5673" mono />
                </div>
              </Group>
            </>
          )}

          {tab === 'devices' && settings && (
            <>
              <Group title="Machines" icon={<Server size={12} />}>
                <p className="settings-hint">Edit name, IP, icon, color, SSH user, or MAC for Wake-on-LAN. Services on a device follow its IP.</p>
                <div className="device-card-list">
                  {devices.map(d => (
                    <DeviceCard
                      key={d.id}
                      device={d}
                      onChange={updated => updateDevice(d.id, updated)}
                      onDelete={() => deleteDevice(d.id)}
                    />
                  ))}
                </div>
                {addingDevice ? (
                  <AddDeviceForm onAdd={addDevice} onCancel={() => setAddingDevice(false)} />
                ) : (
                  <button className="add-device-btn-sm" onClick={() => setAddingDevice(true)}>
                    <Plus size={11} /> Add device
                  </button>
                )}
              </Group>
              <Group title="Monitoring" icon={<Cpu size={12} />}>
                <p className="settings-hint">CPU, memory, disks and Docker stats come from Glances running on each machine.</p>
                <Field label="Glances port" value={String(settings.glancesPort)} onChange={v => set('glancesPort', null, v.replace(/\D/g, ''))} placeholder="61208" mono />
              </Group>
            </>
          )}

          {tab === 'services' && (
            <ServicesSettings
              services={svcConfig}
              onChange={changeServices}
              templates={catalog.templates}
              categories={catalog.categories}
              devices={devices}
              status={serviceStatus}
            />
          )}

          {tab === 'ai' && (
            <>
              <Group title="Chat backend" icon={<Bot size={12} />}>
                <p className="settings-hint">
                  The assistant uses the first reachable OpenAI-compatible service (oMLX, LM Studio…), then falls back to Ollama, in the order listed in Services.
                </p>
                {aiServices.length ? (
                  <div className="ai-svc-list">
                    {aiServices.map(s => (
                      <div key={s.id} className="ai-svc-row">
                        <span className="svc-cfg-dot" style={{ background: s.color, opacity: serviceStatus?.[s.id]?.online ? 1 : 0.35 }} />
                        <span>{s.name}</span>
                        <span className="svc-cfg-loc mono">{s.enabled === false ? 'disabled' : serviceStatus?.[s.id]?.online ? 'online' : 'offline'}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="settings-hint">No AI service yet.</p>
                )}
                <button className="add-device-btn-sm" onClick={() => switchTab('services')}>
                  <Boxes size={11} /> Manage in Services
                </button>
              </Group>
              <DrawThingsGroup open={open && tab === 'ai'} />
            </>
          )}

          {tab === 'automate' && <AutomationsSettings devices={devices} services={svcConfig} />}

          {tab === 'security' && <SecuritySettings />}

          {tab === 'backup' && (
            <Group title="Backup & Restore" icon={<Archive size={12} />}>
              <p className="settings-hint">Exports settings, services, todos, events, games, bookmarks and scratch pad to a zip. Import to restore.</p>
              <div className="backup-row">
                <a className="backup-btn" href="/api/backup" download>
                  <Download size={12} /> Export backup
                </a>
                <label className="backup-btn backup-import-btn">
                  <Upload size={12} /> Import backup
                  <input
                    type="file" accept=".zip" style={{ display: 'none' }}
                    onChange={async e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      e.target.value = ''
                      setRestoreState('loading')
                      try {
                        const res = await fetch('/api/restore', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/zip' },
                          body: await file.arrayBuffer(),
                        })
                        const d = await res.json()
                        setRestoreState(res.ok ? { ok: true, restored: d.restored } : { error: d.error })
                        if (res.ok) onDeviceChange?.()
                      } catch (err) {
                        setRestoreState({ error: err.message })
                      }
                    }}
                  />
                </label>
              </div>
              {restoreState === 'loading' && <p className="backup-status">Restoring…</p>}
              {restoreState?.ok    && <p className="backup-status ok">✓ Restored: {restoreState.restored.join(', ')}</p>}
              {restoreState?.error && <p className="backup-status error">✗ {restoreState.error}</p>}
              <p className="settings-hint">To share your setup without secrets, use Services → Export template instead.</p>
            </Group>
          )}
          {tab === 'backup' && (
            <BackupsSettings services={svcConfig} />
          )}

        </div>

        <div className="side-panel-footer">
          {result?.ok    && <div className="settings-result ok">✓ Saved.</div>}
          {result?.error && <div className="settings-result error">✗ {result.error}</div>}
          <button className="settings-save-btn" onClick={handleSave} disabled={saving || !dirty || !settings}>
            <Save size={13} />{saving ? 'Saving…' : dirty ? 'Save Changes' : 'No changes'}
          </button>
        </div>
      </div>
    </>
  )
}
