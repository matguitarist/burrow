import { Router } from 'express'
import dgram from 'node:dgram'
import { findSshKey, sshExec, savePassword } from './ssh.js'
import { getSettings, getDevices, getDeviceIp, pingWithFallback, proxyGet } from './lib.js'
import { getServices, serviceLink, checkService, resolveAiBackend } from './services.js'
import { getTemplate } from './service-templates.js'
import { HOLIDAY_CALENDARS } from './holidays.js'
import { record, uptimeSummary, flushUptime } from './uptime.js'

const router = Router()

// ── Wake-on-LAN ───────────────────────────────────────────────────────────────
function sendMagicPacket(mac) {
  return new Promise((resolve, reject) => {
    const hex = mac.replace(/[^a-fA-F0-9]/g, '')
    if (hex.length !== 12) return reject(new Error('Invalid MAC — expected 12 hex chars, e.g. AABBCCDDEEFF'))
    const bytes = hex.match(/.{2}/g).map(b => parseInt(b, 16))
    const buf = Buffer.alloc(102)
    buf.fill(0xff, 0, 6)
    for (let i = 1; i <= 16; i++) bytes.forEach((b, j) => { buf[i * 6 + j] = b })
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    sock.bind(() => {
      sock.setBroadcast(true)
      sock.send(buf, 0, buf.length, 9, '255.255.255.255', err => {
        sock.close()
        err ? reject(err) : resolve()
      })
    })
  })
}

// ── Dashboard process stats — CPU sampled over 300ms ─────────────────────────
function sampleProcessCpu() {
  return new Promise(resolve => {
    const c0 = process.cpuUsage()
    const t0 = process.hrtime.bigint()
    setTimeout(() => {
      const delta   = process.cpuUsage(c0)           // µs since c0
      const elapsed = Number(process.hrtime.bigint() - t0) / 1000  // ns → µs
      resolve(elapsed > 0 ? Math.round((delta.user + delta.system) / elapsed * 100) : 0)
    }, 300)
  })
}

// ── Windows drive labels (Glances/psutil has no volume-label field) ─────────
// Fetched over SSH via PowerShell since it's the only place that data lives.
// Cached so a 10s dashboard poll doesn't open a new SSH connection every tick;
// failures (e.g. no SSH server on the box) are cached briefly too so a down
// host doesn't get hammered with connection attempts. Drive names virtually
// never change, so a successful lookup is cached for hours, not minutes.
const diskLabelCache = {}
const DISK_LABEL_TTL_OK   = 6  * 60 * 60 * 1000
const DISK_LABEL_TTL_FAIL = 60 * 1000

async function fetchWindowsDiskLabels(device, password) {
  const cmd = 'powershell -NoProfile -Command "Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter,FileSystemLabel | ConvertTo-Json -Compress"'
  const r = await sshExec(device, cmd, { password, timeout: 15_000 })
  if (r.authRequired) return { data: {}, authRequired: true }
  try {
    const parsed = JSON.parse(r.stdout)
    const map = {}
    for (const row of Array.isArray(parsed) ? parsed : [parsed]) {
      if (row?.DriveLetter) map[row.DriveLetter] = row.FileSystemLabel || ''
    }
    return { data: map }
  } catch { return { data: {} } }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Frontend config — devices + enabled services with their clickable links
router.get('/config', async (_req, res) => {
  const devices = getDevices()
  const aiBackend = await resolveAiBackend()
  res.json({
    devices: devices.map(d => ({ ...d, wol: !!d.mac })),
    services: getServices()
      .filter(s => s.enabled !== false)
      .map(s => {
        const t = getTemplate(s.template)
        return {
          id: s.id, template: s.template, name: s.name, color: s.color,
          category: t.category, machine: s.device || null, cloud: !!t.cloud,
          url: serviceLink(s),
        }
      }),
    // Which AI service the chat is actually using right now (first reachable one)
    ai: { backend: aiBackend.label, online: aiBackend.online, link: aiBackend.link, device: aiBackend.device || null },
    // Empty locale = use the browser's own
    region: { ...getSettings().region, calendars: HOLIDAY_CALENDARS },
    layout: getSettings().layout,
  })
})

// ── Service health — checked in the background ───────────────────────────────
// Every 30 s, whether or not a page is open, so uptime history has no gaps and
// /api/services answers instantly with the latest results.
const CHECK_INTERVAL = 30_000
let latestHealth = null
let checking = null

async function runChecks() {
  const devices = getDevices()
  const gl  = getSettings().glancesPort
  const watched = getServices().filter(s => s.enabled !== false && !getTemplate(s.template).cloud)

  const checks = await Promise.allSettled([
    ...watched.map(s => checkService(s).then(r => ({ id: s.id, ...r }))),
    // Per-device liveness: try Glances API, fall back to plain port-80 ping
    ...devices.map(dev =>
      pingWithFallback(`http://${dev.ip}:${gl}/api/4/now`, `http://${dev.ip}:${gl}/api/3/now`)
        .then(r => ({ id: `device_${dev.id}`, ...r }))
    ),
  ])
  const result = {}
  for (const check of checks) {
    if (check.status === 'fulfilled') {
      const { id, online } = check.value
      result[id] = record(id, online)
    }
  }
  latestHealth = result
  return result
}

function checkNow() {
  checking ??= runChecks().finally(() => { checking = null })
  return checking
}

setTimeout(checkNow, 1000)
setInterval(checkNow, CHECK_INTERVAL).unref()
// Save history on the way out — SIGTERM (Mac app, Docker) and Ctrl-C don't
// fire 'exit' unless handled
process.on('exit', flushUptime)
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => process.exit(0))

// Latest check results (id → { online, since }) — null until the first run
export function getLatestHealth() { return latestHealth }

router.get('/services', async (_req, res) => {
  res.json(latestHealth ?? await checkNow())
})

// Uptime % (24h / 7 days), per-day bars and recent incidents per check id
router.get('/uptime', (_req, res) => {
  const ids = [
    ...getServices().filter(s => s.enabled !== false && !getTemplate(s.template).cloud).map(s => s.id),
    ...getDevices().map(d => `device_${d.id}`),
  ]
  res.json(uptimeSummary(ids))
})

// Wake-on-LAN
// Throws with a user-facing message (also used by the chat assistant)
export async function wakeDevice(id) {
  const device = getDevices().find(d => d.id === id)
  if (!device) throw new Error(`Unknown device: ${id}`)
  if (!device.mac) throw new Error(`No MAC address set for ${device.name} — add it in Settings → Devices.`)
  await sendMagicPacket(device.mac)
  return device
}

router.post('/wol/:machine', async (req, res) => {
  try {
    await wakeDevice(req.params.machine)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Glances — by device id (Settings → Devices)
router.get('/glances/:machine/:endpoint', async (req, res) => {
  const { machine, endpoint } = req.params
  const ip = getDeviceIp(machine)
  if (!ip) return res.status(400).json({ error: `Unknown machine: ${machine}` })
  // Known to be off: answer now instead of waiting for two timeouts on every poll.
  // The background check notices when it's back, within CHECK_INTERVAL.
  if (latestHealth?.[`device_${machine}`]?.online === false) return res.status(503).json({ error: 'Device is offline' })
  const port = getSettings().glancesPort
  // Glances 4 renamed the `docker` plugin to `containers`
  const attempts = endpoint === 'containers' ? [['4', 'containers'], ['3', 'docker']] : [['4', endpoint], ['3', endpoint]]
  for (const [v, ep] of attempts) {
    try {
      return res.json(await proxyGet(`http://${ip}:${port}/api/${v}/${ep}`))
    } catch {}
  }
  res.status(503).json({ error: 'Glances not available' })
})

// Dashboard process stats — CPU sampled over 300ms, memory from process.memoryUsage()
router.get('/system', async (_req, res) => {
  try {
    const cpu = await sampleProcessCpu()
    const mem = process.memoryUsage()
    res.json({
      process: {
        cpu,
        rss:       mem.rss,        // total physical memory of the process
        heapUsed:  mem.heapUsed,   // JS objects on V8 heap
        heapTotal: mem.heapTotal,  // V8 heap capacity allocated
        external:  mem.external,   // C++ objects referenced from JS
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/terminal/has-key', (_req, res) => {
  res.json({ hasKey: !!findSshKey() })
})

// Windows volume labels (e.g. { C: 'Windows', E: 'Games' }) — see fetchWindowsDiskLabels above
router.get('/disk-labels/:machine', async (req, res) => {
  const device = getDevices().find(d => d.id === req.params.machine)
  if (!device?.ip) return res.json({})

  const cached = diskLabelCache[device.id]
  if (cached && cached.expires > Date.now()) {
    if (cached.authRequired) return res.status(401).json({ error: 'auth-required' })
    return res.json(cached.data)
  }

  const { data, authRequired } = await fetchWindowsDiskLabels(device)
  if (authRequired) {
    diskLabelCache[device.id] = { authRequired: true, expires: Date.now() + DISK_LABEL_TTL_FAIL }
    return res.status(401).json({ error: 'auth-required' })
  }
  const ok = Object.keys(data).length > 0
  diskLabelCache[device.id] = { data, expires: Date.now() + (ok ? DISK_LABEL_TTL_OK : DISK_LABEL_TTL_FAIL) }
  res.json(data)
})

// Submit an SSH password for Windows drive-label lookup (prompted once by the frontend)
router.post('/disk-labels/:machine', async (req, res) => {
  const device = getDevices().find(d => d.id === req.params.machine)
  if (!device?.ip) return res.status(400).json({ error: 'Unknown machine' })
  const { password } = req.body || {}
  if (!password) return res.status(400).json({ error: 'Password required' })

  const { data, authRequired } = await fetchWindowsDiskLabels(device, password)
  if (authRequired) return res.status(401).json({ error: 'Incorrect password' })

  savePassword(device.id, password)
  diskLabelCache[device.id] = { data, expires: Date.now() + DISK_LABEL_TTL_OK }
  res.json(data)
})

export default router
