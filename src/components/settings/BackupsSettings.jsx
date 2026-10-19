import { useState, useEffect } from 'react'
import { DatabaseBackup, Play, Download, RotateCcw, Trash2, Plus, Loader2, ChevronDown, ChevronRight, Check, AlertTriangle } from 'lucide-react'
import { Group, Field } from './fields.jsx'
import { loc } from '../../locale.js'

const fmtSize = b => b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`
const fmtWhen = t => new Date(t).toLocaleString(loc(), { dateStyle: 'medium', timeStyle: 'short' })

async function api(path, init) {
  const res = await fetch(`/api/backups${path}`, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

function JobCard({ job, serviceName, onRun, onRemove, onSave, running }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(job)
  const [restoring, setRestoring] = useState(null)
  const [msg, setMsg] = useState(null)
  const st = job.status
  // Only the editable fields count as changes
  const editable = j => JSON.stringify([j.folder, j.files, j.container, j.enabled])
  const dirty = editable(draft) !== editable(job)

  const restore = async f => {
    if (!confirm(`Restore ${serviceName} from ${fmtWhen(f.at)}?\n\n${job.container ? `The ${job.container} container will be stopped, the files replaced, and started again.` : 'The current files will be replaced.'}`)) return
    setRestoring(f.file); setMsg(null)
    try { await api(`/${job.id}/files/${encodeURIComponent(f.file)}/restore`, { method: 'POST' }); setMsg({ ok: `Restored ${serviceName} from ${fmtWhen(f.at)}` }) }
    catch (e) { setMsg({ error: e.message }) }
    finally { setRestoring(null) }
  }

  return (
    <div className={`svc-cfg${open ? ' open' : ''}`}>
      <button type="button" className="svc-cfg-row" onClick={() => setOpen(o => !o)}>
        {running ? <Loader2 size={12} className="spin" /> : st?.ok ? <Check size={12} style={{ color: '#34d399' }} /> : st ? <AlertTriangle size={12} style={{ color: '#f87171' }} /> : <DatabaseBackup size={12} />}
        <span className="svc-cfg-name">{serviceName}</span>
        <span className="svc-cfg-loc">
          {running ? 'backing up…' : st?.ok ? `${fmtWhen(st.at)} · ${fmtSize(st.size)}` : st ? 'failed' : 'never run'}
        </span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <div className="svc-cfg-body">
          <p className="settings-hint">
            {job.method === 'arr'
              ? 'Uses the app’s own backup (System → Backup); restore from there with a downloaded zip.'
              : `Archives files from ${job.folder} over SSH. Restore stops ${job.container || 'nothing'}, replaces the files and starts it again.`}
          </p>
          {st && !st.ok && <div className="settings-result error">✗ {st.error}</div>}
          {job.method === 'files' && (
            <>
              <Field label="Folder" value={draft.folder} onChange={v => setDraft({ ...draft, folder: v })} mono />
              <Field label="Files and folders (comma-separated)" value={draft.files.join(', ')}
                onChange={v => setDraft({ ...draft, files: v.split(',').map(s => s.trim()) })} mono />
              <Field label="Container to stop during restore" value={draft.container} onChange={v => setDraft({ ...draft, container: v })} mono />
            </>
          )}
          <label className="svc-cfg-toggle">
            <input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} />
            Include in the nightly backup
          </label>
          <div className="svc-cfg-actions">
            <button type="button" className="svc-cfg-btn" onClick={onRun} disabled={running}><Play size={11} /> Back up now</button>
            {dirty && <button type="button" className="svc-cfg-btn" onClick={() => onSave(draft)}><Check size={11} /> Save</button>}
            <button type="button" className="svc-cfg-btn danger" onClick={onRemove}><Trash2 size={11} /> Remove</button>
          </div>
          {msg?.ok    && <div className="settings-result ok">✓ {msg.ok}</div>}
          {msg?.error && <div className="settings-result error">✗ {msg.error}</div>}
          {job.archives.length > 0 && <div className="settings-label">History</div>}
          <div className="backup-history">
            {job.archives.map(f => (
              <div key={f.file} className="backup-history-row">
                <span>{fmtWhen(f.at)}</span>
                <span className="settings-hint">{fmtSize(f.size)}</span>
                <a className="device-row-btn" href={`/api/backups/${job.id}/files/${encodeURIComponent(f.file)}`} download title="Download"><Download size={12} /></a>
                {job.method === 'files' && (
                  <button type="button" className="device-row-btn" onClick={() => restore(f)} disabled={!!restoring} title="Restore">
                    {restoring === f.file ? <Loader2 size={12} className="spin" /> : <RotateCcw size={12} />}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function BackupsSettings({ services }) {
  const [data,        setData]        = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [running,     setRunning]     = useState({})
  const [error,       setError]       = useState(null)

  const load = () => {
    api('').then(setData).catch(e => setError(e.message))
    api('/suggestions').then(setSuggestions).catch(() => {})
  }
  useEffect(load, [])

  if (!data) return error ? <div className="settings-result error">✗ {error}</div> : null

  const nameOf = id => services.find(s => s.id === id)?.name || id
  // Job list without the server-side extras, for PUT
  const plainJobs = data.jobs.map(({ status, archives, ...j }) => j)
  const saveJobs = async jobs => {
    setError(null)
    try { await api('', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobs }) }); load() }
    catch (e) { setError(e.message) }
  }
  const saveSchedule = async patch => {
    await api('', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    load()
  }
  const run = async id => {
    setRunning(r => ({ ...r, [id]: true }))
    try { await api(`/${id}/run`, { method: 'POST' }) } catch {}
    setRunning(r => { const n = { ...r }; delete n[id]; return n })
    load()
  }
  const add = s => saveJobs([...plainJobs, { id: s.serviceId, serviceId: s.serviceId, method: s.method, device: s.device, folder: s.folder, files: s.files, container: s.container }])

  return (
    <Group title="Service backups" icon={<DatabaseBackup size={12} />}>
      <p className="settings-hint">Nightly copies of each app’s configuration, kept on this server. Useful when an update or reset wipes an app’s settings.</p>
      <div className="svc-cfg-grid even">
        <div className="settings-field">
          <label className="settings-label">Run every night at</label>
          <select className="settings-input" value={data.hour} onChange={e => saveSchedule({ hour: e.target.value })}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
        </div>
        <div className="settings-field">
          <label className="settings-label">Keep backups for</label>
          <select className="settings-input" value={data.keepDays} onChange={e => saveSchedule({ keepDays: e.target.value })}>
            {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>{d} days</option>)}
          </select>
        </div>
      </div>

      {data.jobs.map(j => (
        <JobCard
          key={j.id}
          job={j}
          serviceName={nameOf(j.serviceId)}
          running={!!running[j.id]}
          onRun={() => run(j.id)}
          onRemove={() => confirm(`Stop backing up ${nameOf(j.serviceId)}? Existing backups stay on disk.`) && saveJobs(plainJobs.filter(x => x.id !== j.id))}
          onSave={draft => { const { status, archives, ...clean } = draft; saveJobs(plainJobs.map(x => x.id === j.id ? clean : x)) }}
        />
      ))}

      {suggestions.length > 0 && (
        <div className="settings-field">
          <label className="settings-label">Add a service</label>
          <div className="backup-suggestions">
            {suggestions.map(s => (
              <button key={s.serviceId} type="button" className="add-device-btn-sm" onClick={() => add(s)} disabled={s.method === 'arr' && !s.ready}
                title={s.method === 'arr' && !s.ready ? 'Add its API key in Services first' : s.method === 'files' ? `${s.folder}: ${s.files.join(', ')}` : 'Uses the app’s built-in backup'}>
                <Plus size={11} /> {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <div className="settings-result error">✗ {error}</div>}
    </Group>
  )
}
