import { Router } from 'express'
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { DATA, readJSON, writeJSON, getDevices, ymd, uid } from './lib.js'
import { getServices, serviceBase } from './services.js'
import { sshExec } from './ssh.js'

const router = Router()

// ── Config backups of your services ──────────────────────────────────────────
// data/backups.json holds the schedule and jobs; archives go in
// data/backups/<jobId>/. Two methods:
//   arr   — Radarr/Sonarr/Prowlarr/Lidarr/Readarr: trigger the app's own backup
//           through its API and download the zip
//   files — any app whose config lives in a folder on a device (Seerr, Tautulli
//           in Unraid appdata…): tar the chosen files over SSH; restore stops the
//           container, unpacks, starts it again
const FILE = 'backups.json'
const DIR = join(DATA, 'backups')
mkdirSync(DIR, { recursive: true })

const ARR_API = { radarr: 'v3', sonarr: 'v3', prowlarr: 'v1', lidarr: 'v1', readarr: 'v1' }

// Sensible starting points when adding a job (Unraid appdata layout)
const FILE_DEFAULTS = {
  seerr:      { folder: '/mnt/user/appdata/seerr',      files: ['settings.json', 'db'],             container: 'Seerr' },
  jellyseerr: { folder: '/mnt/user/appdata/jellyseerr', files: ['settings.json', 'db'],             container: 'jellyseerr' },
  tautulli:   { folder: '/mnt/user/appdata/tautulli',   files: ['config.ini', 'tautulli.db'],       container: 'tautulli' },
  kavita:     { folder: '/mnt/user/appdata/kavita',     files: ['config'],                          container: 'Kavita' },
  gotify:     { folder: '/mnt/user/appdata/gotify',     files: ['data'],                            container: 'gotify' },
  homeassistant: { folder: '/mnt/user/appdata/homeassistant', files: ['.'],                         container: 'homeassistant' },
}

let config = { hour: 3, keepDays: 30, jobs: [], status: {}, lastRun: null, ...readJSON(FILE, {}) }
const save = () => writeJSON(FILE, config)

// ── Validation — values end up in a shell command, so be strict ─────────────
const SAFE_PATH = /^\/[\w./ -]*$/                 // absolute, no quotes or $`;
const SAFE_FILE = /^(\.|[\w.-][\w. -]*)$/          // a name inside the folder (or "." for all)
const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/  // docker container name

function cleanJob(j) {
  const job = {
    id: String(j.id || uid()),
    serviceId: String(j.serviceId || ''),
    method: j.method === 'files' ? 'files' : 'arr',
    enabled: j.enabled !== false,
  }
  if (job.method === 'files') {
    job.device = String(j.device || '')
    job.folder = String(j.folder || '').replace(/\/+$/, '')
    job.files = (Array.isArray(j.files) ? j.files : String(j.files || '').split(',')).map(f => String(f).trim()).filter(Boolean)
    job.container = String(j.container || '').trim()
    if (!SAFE_PATH.test(job.folder) || job.folder.includes('..')) throw new Error(`Folder must be an absolute path: ${job.folder || '(empty)'}`)
    if (!job.files.length) throw new Error('List at least one file or folder to back up')
    for (const f of job.files) if (!SAFE_FILE.test(f) || f.includes('..')) throw new Error(`Invalid file name: ${f}`)
    if (job.container && !SAFE_NAME.test(job.container)) throw new Error(`Invalid container name: ${job.container}`)
  }
  return job
}

const q = s => `'${s}'`   // validated values contain no single quotes

// ── Methods ──────────────────────────────────────────────────────────────────
async function arrBackup(job) {
  const s = getServices().find(x => x.id === job.serviceId)
  const ver = ARR_API[s?.template]
  if (!ver) throw new Error('Not an *arr service')
  if (!s.apiKey) throw new Error(`${s.name} has no API key — add it in Settings → Services`)
  const base = `${serviceBase(s)}/api/${ver}`
  const headers = { 'X-Api-Key': s.apiKey, 'Content-Type': 'application/json' }
  const call = async (path, init = {}) => {
    const r = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(15_000), ...init })
    if (!r.ok) throw new Error(`${s.name}: HTTP ${r.status}`)
    return r.json()
  }

  const started = Date.now()
  const cmd = await call('/command', { method: 'POST', body: JSON.stringify({ name: 'Backup' }) })
  for (let i = 0; i < 90; i++) {   // up to ~3 min
    const st = await call(`/command/${cmd.id}`)
    if (st.status === 'completed') break
    if (['failed', 'aborted', 'cancelled'].includes(st.status)) throw new Error(`${s.name} backup ${st.status}`)
    await new Promise(r => setTimeout(r, 2000))
  }
  const list = await call('/system/backup')
  const latest = list.filter(b => b.type === 'manual').sort((a, b) => new Date(b.time) - new Date(a.time))[0]
  if (!latest || new Date(latest.time).getTime() < started - 60_000) throw new Error(`${s.name} didn't produce a new backup`)

  const r = await fetch(`${serviceBase(s)}${latest.path}`, { headers: { 'X-Api-Key': s.apiKey }, signal: AbortSignal.timeout(120_000) })
  if (!r.ok) throw new Error(`Download failed: HTTP ${r.status}`)
  return { buffer: Buffer.from(await r.arrayBuffer()), name: latest.name }
}

async function filesBackup(job) {
  const device = getDevices().find(d => d.id === job.device)
  if (!device) throw new Error('Device not found')
  const r = await sshExec(device, `tar czf - -C ${q(job.folder)} ${job.files.map(q).join(' ')}`, { binary: true, timeout: 180_000 })
  if (r.authRequired) throw new Error(`SSH to ${device.name} needs a password — use a container's controls on the Servers tab once to save it`)
  if (r.code !== 0) throw new Error(r.stderr.trim() || `tar exited with ${r.code}`)
  return { buffer: r.stdout, name: `${job.serviceId}.tar.gz` }
}

// ── Run, prune, restore ──────────────────────────────────────────────────────
const jobDir = job => join(DIR, job.id)

export async function runJob(job) {
  const startedAt = Date.now()
  try {
    const { buffer, name } = job.method === 'files' ? await filesBackup(job) : await arrBackup(job)
    mkdirSync(jobDir(job), { recursive: true })
    const now = new Date()
    const stamp = `${ymd(now)}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
    const file = `${stamp}_${basename(name)}`
    writeFileSync(join(jobDir(job), file), buffer)
    config.status[job.id] = { at: startedAt, ok: true, file, size: buffer.length }
    prune(job)
  } catch (e) {
    config.status[job.id] = { at: startedAt, ok: false, error: e.message }
  }
  save()
  return config.status[job.id]
}

function listFiles(job) {
  if (!existsSync(jobDir(job))) return []
  return readdirSync(jobDir(job))
    .map(f => ({ file: f, ...(({ size, mtimeMs }) => ({ size, at: mtimeMs }))(statSync(join(jobDir(job), f))) }))
    .sort((a, b) => b.at - a.at)
}

// Drop archives older than keepDays, but always keep the newest 3
function prune(job) {
  const cutoff = Date.now() - config.keepDays * 86400_000
  listFiles(job).slice(3).filter(f => f.at < cutoff).forEach(f => unlinkSync(join(jobDir(job), f.file)))
}

async function restoreFiles(job, file) {
  const device = getDevices().find(d => d.id === job.device)
  if (!device) throw new Error('Device not found')
  const input = readFileSync(join(jobDir(job), file))
  const c = job.container
  // Stop the app so it doesn't overwrite restored files, then always restart it
  const cmd = c
    ? `docker stop ${q(c)} >/dev/null && tar xzf - -C ${q(job.folder)}; rc=$?; docker start ${q(c)} >/dev/null; exit $rc`
    : `tar xzf - -C ${q(job.folder)}`
  const r = await sshExec(device, cmd, { input, timeout: 180_000 })
  if (r.authRequired) throw new Error(`SSH to ${device.name} needs a password`)
  if (r.code !== 0) throw new Error(r.stderr.trim() || `Restore failed (${r.code})`)
}

// ── Nightly schedule ─────────────────────────────────────────────────────────
async function runAll() {
  for (const job of config.jobs.filter(j => j.enabled)) await runJob(job)
}

setInterval(() => {
  const now = new Date()
  if (now.getHours() === config.hour && config.lastRun !== ymd(now) && config.jobs.length) {
    config.lastRun = ymd(now)
    save()
    runAll()
  }
}, 60_000).unref()

// ── Routes (all under /backups — gated by sign-in, see auth.js) ──────────────
const findJob = id => config.jobs.find(j => j.id === id)
const safeFile = f => basename(f) === f && !f.startsWith('.')

router.get('/backups', (_req, res) => {
  res.json({
    hour: config.hour, keepDays: config.keepDays, lastRun: config.lastRun,
    jobs: config.jobs.map(j => ({ ...j, status: config.status[j.id] || null, archives: listFiles(j) })),
  })
})

// Suggested jobs for services that don't have one yet
router.get('/backups/suggestions', (_req, res) => {
  const taken = new Set(config.jobs.map(j => j.serviceId))
  const out = []
  for (const s of getServices()) {
    if (taken.has(s.id)) continue
    if (ARR_API[s.template]) out.push({ serviceId: s.id, name: s.name, method: 'arr', ready: !!s.apiKey })
    else if (FILE_DEFAULTS[s.template]) out.push({ serviceId: s.id, name: s.name, method: 'files', device: s.device, ...FILE_DEFAULTS[s.template] })
  }
  res.json(out)
})

router.put('/backups', (req, res) => {
  try {
    const { hour, keepDays, jobs } = req.body || {}
    if (hour != null) config.hour = Math.min(23, Math.max(0, parseInt(hour) || 0))
    if (keepDays != null) config.keepDays = Math.min(365, Math.max(1, parseInt(keepDays) || 30))
    if (jobs) config.jobs = jobs.map(cleanJob)
    save()
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

router.post('/backups/:id/run', async (req, res) => {
  const job = findJob(req.params.id)
  if (!job) return res.status(404).json({ error: 'Unknown job' })
  res.json(await runJob(job))
})

router.get('/backups/:id/files/:file', (req, res) => {
  const job = findJob(req.params.id)
  if (!job || !safeFile(req.params.file)) return res.status(404).end()
  const path = join(jobDir(job), req.params.file)
  if (!existsSync(path)) return res.status(404).end()
  res.download(path)
})

router.post('/backups/:id/files/:file/restore', async (req, res) => {
  const job = findJob(req.params.id)
  if (!job || !safeFile(req.params.file)) return res.status(404).json({ error: 'Not found' })
  if (job.method !== 'files') {
    const name = getServices().find(s => s.id === job.serviceId)?.name || 'this app'
    return res.status(400).json({ error: `Restore ${name} from its own UI (System → Backup → Restore) using the downloaded zip` })
  }
  try {
    await restoreFiles(job, req.params.file)
    res.json({ ok: true })
  } catch (e) { res.status(502).json({ error: e.message }) }
})

export default router
