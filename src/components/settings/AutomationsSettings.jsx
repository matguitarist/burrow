import { useState, useEffect } from 'react'
import { Workflow, Plus, Play, Trash2, Check, ChevronDown, ChevronRight, Loader2, History } from 'lucide-react'
import { Group, Field } from './fields.jsx'
import { loc } from '../../locale.js'
import { t } from '../../i18n.js'

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
  if (s === '0,1,2,3,4,5,6') return t('Every day')
  if (s === '1,2,3,4,5') return t('Weekdays')
  if (s === '0,6') return t('Weekends')
  return days.map(d => DAY_LETTERS[d]).join(', ')
}

// One-line summary: "Weekdays at 07:00 → Wake Mat's Desktop"
function describe(rule, nameOf, deviceName) {
  const tg = rule.trigger, a = rule.action
  const when = tg.type === 'schedule' ? t('{days} at {time}', { days: describeDays(tg.days), time: tg.time })
    : tg.type === 'disk' ? t('When {disk} on {device} is {percent}% full', { disk: tg.mount || t('a disk'), device: deviceName(tg.device), percent: tg.percent })
    : tg.type === 'temp' ? t("When {device}'s CPU reaches {celsius} °C", { device: deviceName(tg.device), celsius: tg.celsius })
    : t('When {name} is down for {minutes} min', { name: nameOf(tg.target), minutes: tg.minutes })
  const on = { container: a.container, device: deviceName(a.device) }
  const what = a.type === 'wake' ? t('Wake {device}', { device: deviceName(a.device) })
    : a.type === 'backup' ? t('Run service backups')
    : a.type === 'notify' ? t('Send a notification')
    : a.action === 'restart' ? t('Restart {container} on {device}', on)
    : a.action === 'start' ? t('Start {container} on {device}', on)
    : a.action === 'stop' ? t('Stop {container} on {device}', on)
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
  const tg = rule.trigger, a = rule.action
  const set = (part, patch) => onChange({ ...rule, [part]: { ...rule[part], ...patch } })

  // Container names for the chosen device, from Glances
  useEffect(() => {
    if (a.type !== 'container' || !a.device) return
    fetch(`/api/glances/${a.device}/containers`).then(r => r.json())
      .then(list => setContainers(Array.isArray(list) ? list.map(c => c.name).sort() : [])).catch(() => setContainers([]))
  }, [a.type, a.device])

  return (
    <>
      <Field label={t('Name (optional)')} value={rule.name} onChange={v => onChange({ ...rule, name: v })} />
      <div className="settings-field">
        <label className="settings-label">{t('When')}</label>
        <select className="settings-input" value={tg.type}
          onChange={e => onChange({ ...rule, trigger: TRIGGER_DEFAULTS[e.target.value](targets, devices) })}>
          <option value="schedule">{t('On a schedule')}</option>
          <option value="down">{t('A service or device is down')}</option>
          <option value="disk">{t('A disk is getting full')}</option>
          <option value="temp">{t('A CPU is running hot')}</option>
        </select>
      </div>
      {(tg.type === 'disk' || tg.type === 'temp') ? (
        <div className="svc-cfg-grid">
          <div className="settings-field">
            <label className="settings-label">{t('Device')}</label>
            <select className="settings-input" value={tg.device} onChange={e => set('trigger', { device: e.target.value })}>
              {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          {tg.type === 'disk'
            ? <Field label={t('At (%)')} value={String(tg.percent)} onChange={v => set('trigger', { percent: v.replace(/\D/g, '') })} mono />
            : <Field label={t('At (°C)')} value={String(tg.celsius)} onChange={v => set('trigger', { celsius: v.replace(/\D/g, '') })} mono />}
          {tg.type === 'disk' && (
            <Field label={t('Mount point (optional)')} value={tg.mount || ''} onChange={v => set('trigger', { mount: v })} mono
              hint={t('Empty watches every disk, e.g. /mnt/user for one')} />
          )}
        </div>
      ) : tg.type === 'schedule' ? (
        <>
          <div className="day-picker">
            {DAY_LETTERS.map((d, i) => (
              <button key={i} type="button" className={`day-chip${tg.days.includes(i) ? ' active' : ''}`}
                onClick={() => set('trigger', { days: tg.days.includes(i) ? tg.days.filter(x => x !== i) : [...tg.days, i].sort() })}>
                {d}
              </button>
            ))}
          </div>
          <Field label={t('Time')} type="time" value={tg.time} onChange={v => set('trigger', { time: v })} mono />
        </>
      ) : (
        <div className="svc-cfg-grid">
          <div className="settings-field">
            <label className="settings-label">{t('Watch')}</label>
            <select className="settings-input" value={tg.target} onChange={e => set('trigger', { target: e.target.value })}>
              {targets.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <Field label={t('For (min)')} value={String(tg.minutes)} onChange={v => set('trigger', { minutes: v.replace(/\D/g, '') })} mono />
        </div>
      )}

      <div className="settings-field">
        <label className="settings-label">{t('Do')}</label>
        <select className="settings-input" value={a.type}
          onChange={e => onChange({ ...rule, action: e.target.value === 'wake' ? { type: 'wake', device: devices.find(d => d.mac)?.id || '' }
            : e.target.value === 'backup' ? { type: 'backup' } : e.target.value === 'notify' ? { type: 'notify' } : { type: 'container', device: devices[0]?.id || '', container: '', action: 'restart' } })}>
          <option value="wake">{t('Wake a device')}</option>
          <option value="container">{t('Start / stop / restart a container')}</option>
          <option value="backup">{t('Run service backups')}</option>
          <option value="notify">{t('Send a notification (Gotify)')}</option>
        </select>
      </div>
      {a.type === 'notify' && (
        <p className="settings-hint">{t("Sends the rule's name and what happened, e.g. “Unraid: /mnt/user is 91% full”. Needs Gotify's App Token in Services.")}</p>
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
            <option value="restart">{t('Restart')}</option><option value="start">{t('Start')}</option><option value="stop">{t('Stop')}</option>
          </select>
          <select className="settings-input automation-container" value={a.container} onChange={e => set('action', { container: e.target.value })}>
            <option value="">{t('Choose a container…')}</option>
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
  const nameOf = id => targets.find(x => x.id === id)?.name || id
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
      <Group title={t('Automations')} icon={<Workflow size={12} />}>
        <p className="settings-hint">{t('Run actions on a schedule, when something has been down for a while, or when a disk fills up or a CPU runs hot. Each rule fires once per outage or episode.')}</p>
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
                    {t('Enabled')}
                  </label>
                  <div className="svc-cfg-actions">
                    {draft && <button type="button" className="svc-cfg-btn" onClick={() => commit(r.id)}><Check size={11} /> {t('Save')}</button>}
                    {saved && !draft && (
                      <button type="button" className="svc-cfg-btn" onClick={() => run(r.id)} disabled={running === r.id}>
                        {running === r.id ? <Loader2 size={11} className="spin" /> : <Play size={11} />} {t('Run now')}
                      </button>
                    )}
                    <button type="button" className="svc-cfg-btn danger"
                      onClick={() => saved ? (confirm(t('Delete this automation?')) && saveAll(rules.filter(x => x.id !== r.id))) : setDrafts(d => { const n = { ...d }; delete n[r.id]; return n })}>
                      <Trash2 size={11} /> {saved ? t('Delete') : t('Discard')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <button className="add-device-btn-sm" onClick={addRule}><Plus size={11} /> {t('Add automation')}</button>
        {error && <div className="settings-result error">✗ {error}</div>}
      </Group>

      <Group title={t('Activity')} icon={<History size={12} />}>
        {log.length === 0
          ? <p className="settings-hint">{t('Nothing has run yet.')}</p>
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
