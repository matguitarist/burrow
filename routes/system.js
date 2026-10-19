import { Router } from 'express'
import { homedir } from 'node:os'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import dgram from 'node:dgram'
import { Client as SshClient } from 'ssh2'
import { getSettings, getDevices, getDeviceIp, pingWithFallback, proxyGet, readJSON, writeJSON } from './lib.js'
import { getServices, serviceLink, checkService, resolveAiBackend } from './services.js'
import { getTemplate } from './service-templates.js'
import { HOLIDAY_CALENDARS } from './holidays.js'

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

// ── Uptime tracking ───────────────────────────────────────────────────────────
const uptimeStore = {}
function trackUptime(id, online) {
  const prev = uptimeStore[id]
  if (!prev || prev.online !== online) {
    uptimeStore[id] = { online, since: new Date().toISOString() }
  }
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

// ── SSH key auto-detection ────────────────────────────────────────────────────
export function findSshKey() {
  const candidates = [
    join(homedir(), '.ssh', 'id_ed25519'),
    join(homedir(), '.ssh', 'id_rsa'),
    join(homedir(), '.ssh', 'id_ecdsa'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      try { return readFileSync(p) } catch {}
    }
  }
  return null
}

// ── Windows drive labels (Glances/psutil has no volume-label field) ─────────
// Fetched over SSH via PowerShell since it's the only place that data lives.
// Cached so a 10s dashboard poll doesn't open a new SSH connection every tick;
// failures (e.g. no SSH server on the box) are cached briefly too so a down
// host doesn't get hammered with connection attempts. Drive names virtually
// never change, so a successful lookup is cached for hours, not minutes.
//
// Auth: try the auto-detected SSH key first (same as the terminal feature).
// If that fails outright (no key, or the box doesn't accept it), the frontend
// prompts the user for a password once. It's saved to data/ssh-passwords.json
// (same trust model as the service credentials in data/services.json) so it
// survives a server restart instead of re-prompting every time; it's cleared
// automatically the moment it stops working.
const diskLabelCache = {}
const sshPasswords   = readJSON('ssh-passwords.json', {})
const saveSshPasswords = () => writeJSON('ssh-passwords.json', sshPasswords)
const DISK_LABEL_TTL_OK   = 6  * 60 * 60 * 1000
const DISK_LABEL_TTL_FAIL = 60 * 1000

function fetchWindowsDiskLabels(device, password) {
  return new Promise(resolve => {
    const conn = new SshClient()
    let settled = false
    const finish = result => {
      if (settled) return
      settled = true
      try { conn.end() } catch {}
      resolve(result)
    }

    conn.on('ready', () => {
      const cmd = 'powershell -NoProfile -Command "Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter,FileSystemLabel | ConvertTo-Json -Compress"'
      conn.exec(cmd, (err, stream) => {
        if (err) return finish({ data: {} })
        let out = ''
        stream.on('data', d => { out += d.toString('utf8') })
        stream.stderr.on('data', () => {})
        stream.on('close', () => {
          try {
            const parsed = JSON.parse(out)
            const rows = Array.isArray(parsed) ? parsed : [parsed]
            const map = {}
            for (const r of rows) {
              if (r?.DriveLetter) map[r.DriveLetter] = r.FileSystemLabel || ''
            }
            finish({ data: map })
          } catch { finish({ data: {} }) }
        })
      })
    })
    conn.on('error', err => finish({ data: {}, authRequired: err?.level === 'client-authentication' }))

    const key = !password && findSshKey()
    conn.connect({
      host:         device.ip,
      port:         device.sshPort || 22,
      username:     device.sshUser || 'root',
      readyTimeout: 5_000,
      ...(password ? { password } : key ? { privateKey: key } : {}),
    })
  })
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
  })
})

// Service health + uptime
router.get('/services', async (_req, res) => {
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
      trackUptime(id, online)
      result[id] = { online, since: uptimeStore[id]?.since }
    }
  }
  res.json(result)
})

// Wake-on-LAN
router.post('/wol/:machine', async (req, res) => {
  const device = getDevices().find(d => d.id === req.params.machine)
  const mac    = device?.mac
  if (!mac) return res.status(400).json({ error: 'No MAC address set for this device — add it in Settings → Devices.' })
  try {
    await sendMagicPacket(mac)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Glances — by device id (Settings → Devices)
router.get('/glances/:machine/:endpoint', async (req, res) => {
  const { machine, endpoint } = req.params
  const ip = getDeviceIp(machine)
  if (!ip) return res.status(400).json({ error: `Unknown machine: ${machine}` })
  const port = getSettings().glancesPort
  for (const v of ['4', '3']) {
    try {
      return res.json(await proxyGet(`http://${ip}:${port}/api/${v}/${endpoint}`))
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

  const { data, authRequired } = await fetchWindowsDiskLabels(device, sshPasswords[device.id])
  if (authRequired) {
    if (sshPasswords[device.id]) { delete sshPasswords[device.id]; saveSshPasswords() }  // stored password no longer works
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

  sshPasswords[device.id]   = password
  saveSshPasswords()
  diskLabelCache[device.id] = { data, expires: Date.now() + DISK_LABEL_TTL_OK }
  res.json(data)
})

export default router
