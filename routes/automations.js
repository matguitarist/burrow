import { Router } from 'express'
import { readJSON, writeJSON, getDevices, uid } from './lib.js'
import { getLatestHealth, wakeDevice } from './system.js'
import { containerAction } from './containers.js'
import { runAllBackups } from './backups.js'

const router = Router()

// ── Automations — data/automations.json ──────────────────────────────────────
// rule: { id, name, enabled, trigger, action }
//   trigger { type: 'schedule', days: [0-6] (0 = Sunday), time: 'HH:MM' }
//           { type: 'down', target: serviceId | 'device_<id>', minutes }
//   action  { type: 'wake', device }
//           { type: 'container', device, container, action: start|stop|restart }
//           { type: 'backup' }   — run all service backups now
// A 'down' rule fires once per outage (keyed by when it started), so a service
// that won't come back isn't restarted in a loop.
const FILE = 'automations.json'
const LOG_MAX = 200

let data = { rules: [], log: [], fired: {}, ...readJSON(FILE, {}) }
const save = () => writeJSON(FILE, data)

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

// ── Engine: checks every 30 s ────────────────────────────────────────────────
function tick() {
  const now = new Date()
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const minuteKey = `${now.toDateString()} ${hhmm}`
  const health = getLatestHealth() || {}

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
        perform(rule, `Down for ${Math.round(downFor / 60_000)} min`)
      }
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
  await perform(rule, 'Run manually')
  res.json(data.log[0])
})

export default router
