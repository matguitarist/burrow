import { Router } from 'express'
import { getDevices } from './lib.js'
import { sshExec, savePassword } from './ssh.js'

const router = Router()

// ── Docker container controls over SSH ───────────────────────────────────────
// The container list itself comes from Glances; this runs `docker …` on the
// device. A 401 { error: 'auth-required' } means the UI should ask for the
// device's SSH password (POST /ssh-password/:device) and retry.
const ACTIONS = new Set(['start', 'stop', 'restart'])
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/   // docker's own container-name rule

function target(req, res) {
  const device = getDevices().find(d => d.id === req.params.device)
  if (!device?.ip) { res.status(404).json({ error: 'Unknown device' }); return null }
  if (!NAME_RE.test(req.params.name)) { res.status(400).json({ error: 'Invalid container name' }); return null }
  return device
}

// Resolves to { ok: true } | { authRequired: true } | { error, invalid? } — also used by the chat assistant
export async function containerAction(device, name, action) {
  if (!ACTIONS.has(action)) return { error: 'Unknown action', invalid: true }
  if (!NAME_RE.test(name)) return { error: 'Invalid container name', invalid: true }
  const r = await sshExec(device, `docker ${action} ${name}`, { timeout: 60_000 })
  if (r.authRequired) return { authRequired: true }
  if (r.code !== 0) return { error: (r.stderr || r.stdout).trim() || `docker ${action} failed` }
  return { ok: true }
}

router.post('/containers/:device/:name/:action', async (req, res) => {
  const device = target(req, res)
  if (!device) return
  const r = await containerAction(device, req.params.name, req.params.action)
  if (r.authRequired) return res.status(401).json({ error: 'auth-required' })
  if (r.error) return res.status(r.invalid ? 400 : 502).json({ error: r.error })
  res.json({ ok: true })
})

router.get('/containers/:device/:name/logs', async (req, res) => {
  const device = target(req, res)
  if (!device) return
  const tail = Math.min(Math.max(parseInt(req.query.tail) || 200, 10), 2000)

  // docker logs writes the container's stderr to ours — merge both
  const r = await sshExec(device, `docker logs --tail ${tail} --timestamps ${req.params.name} 2>&1`, { timeout: 20_000 })
  if (r.authRequired) return res.status(401).json({ error: 'auth-required' })
  if (r.code !== 0) return res.status(502).json({ error: (r.stderr || r.stdout).trim() || 'docker logs failed' })
  res.json({ logs: r.stdout })
})

// Save an SSH password for a device after checking that it works
router.post('/ssh-password/:device', async (req, res) => {
  const device = getDevices().find(d => d.id === req.params.device)
  if (!device?.ip) return res.status(404).json({ error: 'Unknown device' })
  const { password } = req.body || {}
  if (!password) return res.status(400).json({ error: 'Password required' })

  const r = await sshExec(device, 'echo ok', { password, timeout: 15_000 })
  if (r.authRequired) return res.status(401).json({ error: 'Incorrect password' })
  if (r.code !== 0) return res.status(502).json({ error: r.stderr.trim() || 'Could not connect' })
  savePassword(device.id, password)
  res.json({ ok: true })
})

export default router
