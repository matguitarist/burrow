import { Router } from 'express'
import { getSettings, updateSettings } from './lib.js'

const router = Router()

// ── Global settings (data/settings.json) ─────────────────────────────────────
// Per-service settings are under /service-config (services.js).
router.get('/settings', (_req, res) => res.json(getSettings()))

// Body: any subset of top-level sections (devices, glancesPort, weather, region,
// news); each section given replaces the stored one.
router.put('/settings', (req, res) => res.json(updateSettings(req.body)))

router.get('/server/ping', (_req, res) => {
  res.json({ app: 'burrow', ok: true })
})

router.post('/server/shutdown', (_req, res) => {
  res.json({ ok: true })
  setTimeout(() => process.exit(0), 200)
})

router.post('/server/restart', (_req, res) => {
  res.json({ ok: true })
  setTimeout(() => process.exit(0), 200)
})

export default router
