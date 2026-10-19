import { Router } from 'express'
import { proxyGet } from './lib.js'
import { getService, serviceBase } from './services.js'

const router = Router()

// ── Gotify — notification proxy ───────────────────────────────────────────────
router.get('/gotify/messages', async (req, res) => {
  const g = getService('gotify')
  const url = serviceBase(g), token = g?.apiKey
  if (!url || !token) return res.json({ configured: false, messages: [] })
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50)
    const data  = await proxyGet(`${url}/message?token=${token}&limit=${limit}`, {}, 8000)
    res.json({ configured: true, messages: (data.messages || []).reverse() })
  } catch (e) {
    res.status(503).json({ configured: true, messages: [], error: e.message })
  }
})

export default router
