import { useState, useEffect } from 'react'
import { Workflow, Plus, Play, Trash2, Check, ChevronDown, ChevronRight, Loader2, History } from 'lucide-react'
import { Group, Field } from './fields.jsx'
import { loc } from '../../locale.js'

const DAY_LETTERS = Array.from({ length: 7 }, (_, i) =>
  new Date(2000, 0, 2 + i).toLocaleDateString(loc(), { weekday: 'short' }))   // Sunday first

async function api(path = '', init) {
  const res = await fetch(`/api/automations${path}`, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

function describeDays(days) {
  const s = days.join(',')
  if (s === '0,1,2,3,4,5,6') return 'Every day'
  if (s === '1,2,3,4,5') return 'Weekdays'
  if (s === '0,6') return 'Weekends'
  return days.map(d => DAY_LETTERS[d]).join(', ')
}

// One-line summary: "Weekdays at 07:00 → Wake Mat's Desktop"
function describe(rule, nameOf, deviceName) {
  const t = rule.trigger, a = rule.action
  const when = t.type === 'schedule' ? `${describeDays(t.days)} at ${t.time}`
    : t.type === 'disk' ? `When ${t.mount || 'a disk'} on ${deviceName(t.device)} is ${t.percent}% full`
    : t.type === 'temp' ? `When ${deviceName(t.device)}'s CPU reaches ${t.celsius} °C`
    : `When ${nameOf(t.target)} is down for ${t.minutes} min`
  const what = a.type === 'wake' ? `Wake ${deviceName(a.device)}`
    : a.type === 'backup' ? 'Run service backups'
    : a.type === 'notify' ? 'Send a notification'
    : `${a.action[0].toUpperCase() + a.action.slice(1)} ${a.container} on ${deviceName(a.device)}`
  return `${when} → ${what}`
}

const TRIGGER_DEFAULTS = {
  schedule: () => ({ type: 'schedule', days: [1, 2, 3, 4, 5], time: '07:00' }),
  down:     targets => ({ type: 'down', target: targets[0]?.id || '', minutes: 10 }),
  disk:     (_, devices) => ({ type: 'disk', device: devices[0]?.id || '', percent: 90, mount: '' }),
  temp:     (_, devices) => ({ type: 'temp', device: devices[0]?.id || '', celsius: 85 }),
}

function RuleEditor({ rule, devices, targets, onChange }) {
  const [containers, setContainers] = useState([])
  const t = rule.trigger, a = rule.action
  const set = (part, patch) => onChange({ ...rule, [part]: { ...rule[part], ...patch } })

  // Container names for the chosen device, from Glances
  useEffect(() => {
    if (a.type !== 'container' || !a.device) return
    fetch(`/api/glances/${a.device}/containers`).then(r => r.json())
      .then(list => setContainers(Array.isArray(list) ? list.map(c => c.name).sort() : [])).catch(() => setContainers([]))
  }, [a.type, a.device])

  return (
    <>
      <Field label="Name (optional)" value={rule.name} onChange={v => onChange({ ...rule, name: v })} />
      <div className="settings-field">
        <label className="settings-label">When</label>
        <select className="settings-input" value={t.type}
          onChange={e => onChange({ ...rule, trigger: TRIGGER_DEFAULTS[e.target.value](targets, devices) })}>
          <option value="schedule">On a schedule</option>
          <option value="down">A service or device is down</option>
          <option value="disk">A disk is getting full</option>
          <option value="temp">A CPU is running hot</option>
        </select>
      </div>
      {(t.type === 'disk' || t.type === 'temp') ? (
        <div className="svc-cfg-grid">
          <div className="settings-field">
            <label className="settings-label">Device</label>
            <select className="settings-input" value={t.device} onChange={e => set('trigger', { device: e.target.value })}>
              {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          {t.type === 'disk'
            ? <Field label="At (%)" value={String(t.percent)} onChange={v => set('trigger', { percent: v.replace(/\D/g, '') })} mono />
            : <Field label="At (°C)" value={String(t.celsius)} onChange={v => set('trigger', { celsius: v.replace(/\D/g, '') })} mono />}
          {t.type === 'disk' && (
            <Field label="Mount point (optional)" value={t.mount || ''} onChange={v => set('trigger', { mount: v })} mono
              hint="Empty watches every disk, e.g. /mnt/user for one" />
          )}
        </div>
      ) : t.type === 'schedule' ? (
        <>
          <div className="day-picker">
            {DAY_LETTERS.map((d, i) => (
              <button key={i} type="button" className={`day-chip${t.days.includes(i) ? ' active' : ''}`}
                onClick={() => set('trigger', { days: t.days.includes(i) ? t.days.filter(x => x !== i) : [...t.days, i].sort() })}>
                {d}
              </button>
            ))}
          </div>
          <Field label="Time" type="time" value={t.time} onChange={v => set('trigger', { time: v })} mono />
        </>
      ) : (
        <div className="svc-cfg-grid">
          <div className="settings-field">
            <label className="settings-label">Watch</label>
            <select className="settings-input" value={t.target} onChange={e => set('trigger', { target: e.target.value })}>
              {targets.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <Field label="For (min)" value={String(t.minutes)} onChange={v => set('trigger', { minutes: v.replace(/\D/g, '') })} mono />
        </div>
      )}

      <div className="settings-field">
        <label className="settings-label">Do</label>
        <select className="settings-input" value={a.type}
          onChange={e => onChange({ ...rule, action: e.target.value === 'wake' ? { type: 'wake', device: devices.find(d => d.mac)?.id || '' }
            : e.target.value === 'backup' ? { type: 'backup' } : e.target.value === 'notify' ? { type: 'notify' } : { type: 'container', device: devices[0]?.id || '', container: '', action: 'restart' } })}>
          <option value="wake">Wake a device</option>
          <option value="container">Start / stop / restart a container</option>
          <option value="backup">Run service backups</option>
          <option value="notify">Send a notification (Gotify)</option>
        </select>
      </div>
      {a.type === 'notify' && (
        <p className="settings-hint">Sends the rule's name and what happened, e.g. “Unraid: /mnt/user is 91% full”. Needs Gotify's App Token in Services.</p>
      )}
      {a.type === 'wake' && (
        <select className="settings-input" value={a.device} onChange={e => set('action', { device: e.target.value })}>
          {devices.filter(d => d.mac).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      )}
      {a.type === 'container' && (
        <div className="svc-cfg-grid even">
          <select className="settings-input" value={a.device} onChange={e => set('action', { device: e.target.value, container: '' })}>
            {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select className="settings-input" value={a.action} onChange={e => set('action', { action: e.target.value })}>
            <option value="restart">Restart</option><option value="start">Start</option><option value="stop">Stop</option>
          </select>
          <select className="settings-input automation-container" value={a.container} onChange={e => set('action', { container: e.target.value })}>
            <option value="">Choose a container…</option>
            {containers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}
    </>
  )
}

export default function AutomationsSettings({ devices, services }) {
  const [rules,   setRules]   = useState(null)
  const [log,     setLog]     = useState([])
  const [openId,  setOpenId]  = useState(null)
  const [drafts,  setDrafts]  = useState({})
  const [running, setRunning] = useState(null)
  const [error,   setError]   = useState(null)

  const load = () => api().then(d => { setRules(d.rules); setLog(d.log) }).catch(e => setError(e.message))
  useEffect(() => { load() }, [])
  if (!rules) return error ? <div className="settings-result error">✗ {error}</div> : null

  const targets = [
    ...services.filter(s => s.enabled !== false && s.template !== 'steam').map(s => ({ id: s.id, name: s.name })),
    ...devices.map(d => ({ id: `device_${d.id}`, name: d.name })),
  ]
  const nameOf = id => targets.find(t => t.id === id)?.name || id
  const deviceName = id => devices.find(d => d.id === id)?.name || id

  const saveAll = async list => {
    setError(null)
    try { const d = await api('', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: list }) }); setRules(d.rules); return true }
    catch (e) { setError(e.message); return false }
  }

  const addRule = () => {
    const rule = { id: `r${Date.now().toString(36)}`, name: '', enabled: true,
      trigger: { type: 'schedule', days: [1, 2, 3, 4, 5], time: '07:00' },
      action: { type: 'wake', device: devices.find(d => d.mac)?.id || '' } }
    setDrafts(d => ({ ...d, [rule.id]: rule }))
    setOpenId(rule.id)
  }

  const shown = [...rules, ...Object.values(drafts).filter(d => !rules.some(r => r.id === d.id))]

  const commit = async id => {
    const draft = drafts[id]
    const list = rules.some(r => r.id === id) ? rules.map(r => r.id === id ? draft : r) : [...rules, draft]
    if (await saveAll(list)) { setDrafts(d => { const n = { ...d }; delete n[id]; return n }); setOpenId(null) }
  }

  const run = async id => {
    setRunning(id)
    try { await api(`/${id}/run`, { method: 'POST' }) } catch (e) { setError(e.message) }
    setRunning(null)
    load()
  }

  return (
    <>
      <Group title="Automations" icon={<Workflow size={12} />}>
        <p className="settings-hint">Run actions on a schedule, when something has been down for a while, or when a disk fills up or a CPU runs hot. Each rule fires once per outage or episode.</p>
        {shown.map(r => {
          const draft = drafts[r.id], rule = draft || r, open = openId === r.id, saved = rules.some(x => x.id === r.id)
          return (
            <div key={r.id} className={`svc-cfg${open ? ' open' : ''}${rule.enabled ? '' : ' disabled'}`}>
              <button type="button" className="svc-cfg-row" onClick={() => setOpenId(open ? null : r.id)}>
                <Workflow size={12} />
                <span className="svc-cfg-name automation-summary">{rule.name || describe(rule, nameOf, deviceName)}</span>
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              {open && (
                <div className="svc-cfg-body">
                  {rule.name && <p className="settings-hint">{describe(rule, nameOf, deviceName)}</p>}
                  <RuleEditor rule={rule} devices={devices} targets={targets} onChange={next => setDrafts(d => ({ ...d, [r.id]: next }))} />
                  <label className="svc-cfg-toggle">
                    <input type="checkbox" checked={rule.enabled} onChange={e => setDrafts(d => ({ ...d, [r.id]: { ...rule, enabled: e.target.checked } }))} />
                    Enabled
                  </label>
                  <div className="svc-cfg-actions">
                    {draft && <button type="button" className="svc-cfg-btn" onClick={() => commit(r.id)}><Check size={11} /> Save</button>}
                    {saved && !draft && (
                      <button type="button" className="svc-cfg-btn" onClick={() => run(r.id)} disabled={running === r.id}>
                        {running === r.id ? <Loader2 size={11} className="spin" /> : <Play size={11} />} Run now
                      </button>
                    )}
                    <button type="button" className="svc-cfg-btn danger"
                      onClick={() => saved ? (confirm('Delete this automation?') && saveAll(rules.filter(x => x.id !== r.id))) : setDrafts(d => { const n = { ...d }; delete n[r.id]; return n })}>
                      <Trash2 size={11} /> {saved ? 'Delete' : 'Discard'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <button className="add-device-btn-sm" onClick={addRule}><Plus size={11} /> Add automation</button>
        {error && <div className="settings-result error">✗ {error}</div>}
      </Group>

      <Group title="Activity" icon={<History size={12} />}>
        {log.length === 0
          ? <p className="settings-hint">Nothing has run yet.</p>
          : log.slice(0, 20).map((l, i) => (
            <div key={i} className="automation-log-row">
              <span className={`incident-dot`} style={{ background: l.ok ? 'var(--green)' : 'var(--red)' }} />
              <span className="automation-log-msg">{l.message}</span>
              <span className="settings-hint">{new Date(l.at).toLocaleString(loc(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
      </Group>
    </>
  )
}
