import { Router } from 'express'
import { readJSON, writeJSON, getDevices, getSettings, proxyGet, uid } from './lib.js'
import { getServices } from './services.js'
import { notify } from './notify.js'
import { getLatestHealth, wakeDevice } from './system.js'
import { containerAction } from './containers.js'
import { runAllBackups } from './backups.js'

const router = Router()

// ── Automations — data/automations.json ──────────────────────────────────────
// rule: { id, name, enabled, trigger, action }
//   trigger { type: 'schedule', days: [0-6] (0 = Sunday), time: 'HH:MM' }
//           { type: 'down', target: serviceId | 'device_<id>', minutes }
//           { type: 'disk', device, percent, mount }  — mount '' = any disk (from Glances)
//           { type: 'temp', device, celsius }         — hottest CPU sensor (from Glances)
//   action  { type: 'wake', device }
//           { type: 'notify' }   — Gotify push with what happened
//           { type: 'container', device, container, action: start|stop|restart }
//           { type: 'backup' }   — run all service backups now
// A 'down' rule fires once per outage (keyed by when it started), so a service
// that won't come back isn't restarted in a loop. Disk and temperature rules
// fire once per episode and re-arm when the value drops back a few points.
const FILE = 'automations.json'
const LOG_MAX = 200

let data = { rules: [], log: [], fired: {}, ...readJSON(FILE, {}) }
const save = () => writeJSON(FILE, data)
// After a Burrow backup is restored
export function reloadAutomations() { data = { rules: [], log: [], fired: {}, ...readJSON(FILE, {}) } }

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const ACTIONS = new Set(['start', 'stop', 'restart'])

function cleanRule(r) {
  const t = r.trigger || {}, a = r.action || {}
  const rule = { id: String(r.id || uid()), name: String(r.name || '').trim(), enabled: r.enabled !== false }
  if (t.type === 'schedule') {
    const days = [...new Set((t.days || []).map(Number).filter(d => d >= 0 && d <= 6))].sort()
    if (!days.length) throw new Error('Pick at least one day')
    if (!TIME_RE.test(t.time)) throw new Error('Time must be HH:MM')
    rule.trigger = { type: 'schedule', days, time: t.time }
  } else if (t.type === 'down') {
    if (!t.target) throw new Error('Pick what to watch')
    rule.trigger = { type: 'down', target: String(t.target), minutes: Math.min(1440, Math.max(1, parseInt(t.minutes) || 5)) }
  } else if (t.type === 'disk') {
    if (!t.device) throw new Error('Pick a device')
    rule.trigger = { type: 'disk', device: String(t.device), percent: Math.min(99, Math.max(50, parseInt(t.percent) || 90)), mount: String(t.mount || '').trim() }
  } else if (t.type === 'temp') {
    if (!t.device) throw new Error('Pick a device')
    rule.trigger = { type: 'temp', device: String(t.device), celsius: Math.min(110, Math.max(40, parseInt(t.celsius) || 85)) }
  } else throw new Error('Unknown trigger')

  if (a.type === 'wake') {
    if (!a.device) throw new Error('Pick a device to wake')
    rule.action = { type: 'wake', device: String(a.device) }
  } else if (a.type === 'container') {
    if (!a.device || !a.container) throw new Error('Pick a device and container')
    if (!ACTIONS.has(a.action)) throw new Error('Unknown container action')
    rule.action = { type: 'container', device: String(a.device), container: String(a.container), action: a.action }
  } else if (a.type === 'backup') {
    rule.action = { type: 'backup' }
  } else if (a.type === 'notify') {
    rule.action = { type: 'notify' }
  } else throw new Error('Unknown action')
  return rule
}

function log(rule, ok, message) {
  data.log.unshift({ at: Date.now(), ruleId: rule.id, name: rule.name, ok, message })
  data.log.length = Math.min(data.log.length, LOG_MAX)
}

async function perform(rule, reason) {
  const a = rule.action
  try {
    if (a.type === 'wake') {
      const d = await wakeDevice(a.device)
      log(rule, true, `${reason}: woke ${d.name}`)
    } else if (a.type === 'container') {
      const device = getDevices().find(d => d.id === a.device)
      if (!device) throw new Error('Device no longer exists')
      const r = await containerAction(device, a.container, a.action)
      if (r.authRequired) throw new Error(`SSH to ${device.name} needs a password`)
      if (r.error) throw new Error(r.error)
      log(rule, true, `${reason}: ${a.action} ${a.container} on ${device.name}`)
    } else if (a.type === 'notify') {
      await notify(rule.name || 'Burrow', reason)
      log(rule, true, `${reason}: notified`)
    } else if (a.type === 'backup') {
      const results = await runAllBackups()
      const failed = results.filter(r => !r.ok).length
      log(rule, failed === 0, `${reason}: ${results.length - failed}/${results.length} backups succeeded`)
    }
  } catch (e) {
    log(rule, false, `${reason}: ${e.message}`)
  }
  save()
}

// ── Readings from Glances (disk and temperature rules) ───────────────────────
async function glances(device, endpoint) {
  const port = getSettings().glancesPort
  for (const v of ['4', '3']) {
    try { return await proxyGet(`http://${device.ip}:${port}/api/${v}/${endpoint}`, {}, 5000) } catch {}
  }
  return null
}

const PSEUDO_FS = new Set(['tmpfs', 'devtmpfs', 'squashfs', 'overlay', 'iso9660'])

// Fullest disk (or the one at `mount`) → { mount, percent } | null
export async function fullestDisk(device, mount = '') {
  const fs = await glances(device, 'fs')
  const disks = (Array.isArray(fs) ? fs : [])
    .filter(d => d.size > 1e9 && !PSEUDO_FS.has(d.fs_type) && (!mount || d.mnt_point === mount))
    .map(d => ({ mount: d.mnt_point, percent: Math.round(d.percent ?? (d.used / d.size) * 100) }))
  return disks.sort((a, b) => b.percent - a.percent)[0] || null
}

// Hottest CPU sensor → { label, celsius } | null
export async function hottestCpu(device) {
  const sensors = await glances(device, 'sensors')
  const cpu = (Array.isArray(sensors) ? sensors : [])
    .filter(s => s.type === 'temperature_core' || (String(s.type).startsWith('temperature') && /cpu|core|package|tctl|tdie/i.test(s.label)))
    .filter(s => typeof s.value === 'number')
  const top = cpu.sort((a, b) => b.value - a.value)[0]
  return top ? { label: top.label, celsius: Math.round(top.value) } : null
}

const nameOf = target => target.startsWith('device_')
  ? getDevices().find(d => `device_${d.id}` === target)?.name || target
  : getServices().find(s => s.id === target)?.name || target

// Over the threshold → fire once; back under by `rearm` → ready to fire again
function episode(rule, over, under, reason) {
  if (over && data.fired[rule.id] !== 'over') {
    data.fired[rule.id] = 'over'
    perform(rule, reason)
  } else if (under && data.fired[rule.id] === 'over') {
    delete data.fired[rule.id]
    save()
  }
}

async function checkMetrics(rule, health) {
  const t = rule.trigger
  const device = getDevices().find(d => d.id === t.device)
  if (!device?.ip || health[`device_${device.id}`]?.online === false) return
  if (t.type === 'disk') {
    const d = await fullestDisk(device, t.mount)
    if (d) episode(rule, d.percent >= t.percent, d.percent < t.percent - 3, `${device.name}: ${d.mount} is ${d.percent}% full`)
  } else if (t.type === 'temp') {
    const c = await hottestCpu(device)
    if (c) episode(rule, c.celsius >= t.celsius, c.celsius < t.celsius - 5, `${device.name}: CPU at ${c.celsius} °C`)
  }
}

// ── Engine: checks every 30 s (Glances readings every 2 min) ─────────────────
let ticks = 0
function tick() {
  const now = new Date()
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const minuteKey = `${now.toDateString()} ${hhmm}`
  const health = getLatestHealth() || {}
  const readMetrics = ticks++ % 4 === 0

  for (const rule of data.rules.filter(r => r.enabled)) {
    const t = rule.trigger
    if (t.type === 'schedule') {
      if (t.time === hhmm && t.days.includes(now.getDay()) && data.fired[rule.id] !== minuteKey) {
        data.fired[rule.id] = minuteKey
        perform(rule, `Scheduled ${hhmm}`)
      }
    } else if (t.type === 'down') {
      const h = health[t.target]
      if (!h || h.online) continue
      const downFor = Date.now() - new Date(h.since).getTime()
      if (downFor >= t.minutes * 60_000 && data.fired[rule.id] !== h.since) {
        data.fired[rule.id] = h.since
        perform(rule, `${nameOf(t.target)} down for ${Math.round(downFor / 60_000)} min`)
      }
    } else if (readMetrics && (t.type === 'disk' || t.type === 'temp')) {
      checkMetrics(rule, health).catch(e => console.error(`[automations] ${rule.name}: ${e.message}`))
    }
  }
}
setInterval(tick, 30_000).unref()

// ── Routes (under /automations — gated by sign-in, see auth.js) ──────────────
router.get('/automations', (_req, res) => res.json({ rules: data.rules, log: data.log.slice(0, 50) }))

router.put('/automations', (req, res) => {
  try {
    data.rules = (req.body?.rules || []).map(cleanRule)
    save()
    res.json({ ok: true, rules: data.rules })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

router.post('/automations/:id/run', async (req, res) => {
  const rule = data.rules.find(r => r.id === req.params.id)
  if (!rule) return res.status(404).json({ error: 'Unknown rule' })
  // Disk and temperature rules say what they read right now, so a test run is useful
  let reason = 'Run manually'
  const t = rule.trigger, device = getDevices().find(d => d.id === t.device)
  if (device && t.type === 'disk') { const d = await fullestDisk(device, t.mount); if (d) reason += ` — ${device.name}: ${d.mount} is ${d.percent}% full` }
  if (device && t.type === 'temp') { const c = await hottestCpu(device); if (c) reason += ` — ${device.name}: CPU at ${c.celsius} °C` }
  await perform(rule, reason)
  res.json(data.log[0])
})

export default router
