import { Router } from 'express'
import { getSettings, getDevices, ping, pingWithFallback, proxyGet, readJSON, writeJSON } from './lib.js'
import { SERVICE_TEMPLATES, CATEGORIES, getTemplate } from './service-templates.js'

const router = Router()

// ── Service instances — data/services.json ────────────────────────────────────
// Each instance: { id, template, name, color, enabled, device, host, port, https,
//                  webPath, apiUrl, apiKey, user, pass, ...template extras }
// `device` links to a Settings → Devices entry (its IP is used); otherwise `host`.
// `apiUrl` optionally overrides the URL the *server* uses (e.g. http://127.0.0.1:7860
// when the service only binds to loopback on the machine the dashboard runs on),
// while browser links keep using the LAN address.
const FILE = 'services.json'
let services = []  // loaded at the bottom, once every helper is defined

export function getServices() { return services }

export function saveServices(list) {
  services = list.map(normalize)
  writeJSON(FILE, services)
  aiBackendCache = null
  return services
}

// Re-read after a backup restore replaces the file
export function reloadServices() {
  services = readJSON(FILE, []).map(normalize)
  aiBackendCache = null
}

// First enabled instance of a template — what the integrations talk to
export function getService(templateId) {
  return services.find(s => s.template === templateId && s.enabled !== false) || null
}

const STRING_FIELDS = ['id', 'template', 'name', 'color', 'device', 'host', 'webPath', 'apiUrl', 'apiKey', 'user', 'pass']
function normalize(s) {
  const t = getTemplate(s.template)
  const out = { ...s }
  for (const k of STRING_FIELDS) out[k] = String(s[k] ?? '').trim()
  out.template = t.id
  out.name     = out.name  || t.name
  out.color    = out.color || t.color
  out.enabled  = s.enabled !== false
  out.https    = !!s.https
  out.port     = parseInt(s.port) || null
  out.host     = out.host.replace(/^https?:\/\//i, '').split('/')[0]
  if (out.host.includes(':')) { const [h, p] = out.host.split(':'); out.host = h; out.port ||= parseInt(p) || null }
  out.apiUrl   = out.apiUrl.replace(/\/+$/, '')
  return out
}

// ── URL helpers ───────────────────────────────────────────────────────────────
export function serviceHost(s) {
  if (!s) return ''
  if (s.device) {
    const d = getDevices().find(d => d.id === s.device)
    if (d?.ip) return d.ip
  }
  return s.host || ''
}

export function serviceOrigin(s) {
  const host = serviceHost(s)
  if (!host) return ''
  const proto = s.https ? 'https' : 'http'
  const defPort = s.https ? 443 : 80
  return `${proto}://${host}${s.port && s.port !== defPort ? `:${s.port}` : ''}`
}

// URL the server uses for API calls
export function serviceBase(s) {
  return s?.apiUrl || serviceOrigin(s)
}

// URL the browser opens
export function serviceLink(s) {
  const t = getTemplate(s.template)
  if (t.cloud) return null
  const origin = serviceOrigin(s)
  if (!origin) return null
  return origin + (s.webPath || t.webPath || '')
}

// ── Health ────────────────────────────────────────────────────────────────────
export async function checkService(s) {
  const t    = getTemplate(s.template)
  const base = serviceBase(s)
  if (!base) return { online: false, status: null }
  if (t.id === 'unraid') {
    // Unraid often redirects port 80 → HTTPS with a self-signed cert Node rejects
    return pingWithFallback(base, `http://${serviceHost(s)}:${getSettings().glancesPort}`)
  }
  if (t.ai === 'openai') return ping(`${base}${t.apiPath}/models`)
  return ping(base)
}

// Settings → "Test" button: reachability + credential check where the template supports it
async function testService(s) {
  const t    = getTemplate(s.template)
  const base = serviceBase(s)

  if (t.id === 'steam') {
    if (!s.apiKey || !s.steamId) return { ok: false, message: 'Steam64 ID and API key are both required' }
    try {
      const d = await proxyGet(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${s.apiKey}&steamids=${s.steamId}`, {}, 8000)
      const p = d.response?.players?.[0]
      return p ? { ok: true, message: `Signed in as ${p.personaname}` } : { ok: false, message: 'Key works, but no player found for that Steam64 ID' }
    } catch (e) { return { ok: false, message: e.message.includes('403') ? 'API key rejected' : e.message } }
  }

  if (t.id === 'itad') {
    if (!s.apiKey) return { ok: false, message: 'API key required' }
    try {
      const r = await fetch(`https://api.isthereanydeal.com/games/lookup/v1?key=${encodeURIComponent(s.apiKey)}&appid=220`, { signal: AbortSignal.timeout(8000) })
      if (r.status === 401 || r.status === 403) return { ok: false, message: 'API key rejected' }
      return r.ok ? { ok: true, message: 'Connected' } : { ok: false, message: `IsThereAnyDeal returned HTTP ${r.status}` }
    } catch (e) { return { ok: false, message: `Unreachable — ${e.name === 'TimeoutError' ? 'timed out' : e.message}` } }
  }

  if (t.cloud) return { ok: false, message: 'No connection test for this service' }
  if (!base) return { ok: false, message: 'Set a device or host first' }

  if (t.id === 'qbittorrent' && s.user) {
    try {
      const r = await fetch(`${base}/api/v2/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `username=${encodeURIComponent(s.user)}&password=${encodeURIComponent(s.pass)}`,
        signal: AbortSignal.timeout(5000),
      })
      const body = await r.text()
      return body.trim() === 'Ok.' ? { ok: true, message: 'Logged in' } : { ok: false, message: `Login failed (${body.trim() || r.status})` }
    } catch (e) { return { ok: false, message: `Unreachable — ${e.cause?.code || e.message}` } }
  }

  let url = base + (t.test?.path || '')
  const headers = {}
  if (t.test && s.apiKey) {
    if (t.test.header) headers[t.test.header] = s.apiKey
    if (t.test.bearer) headers.Authorization = `Bearer ${s.apiKey}`
    if (t.test.query)  url += (url.includes('?') ? '&' : '?') + `${t.test.query}=${encodeURIComponent(s.apiKey)}`
  }
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(5000) })
    if (r.status === 401 || r.status === 403) {
      return { ok: false, status: r.status, message: t.fields?.length ? 'Reachable, but the credentials were rejected' : `Reachable (HTTP ${r.status})` }
    }
    if (t.test && !r.ok) return { ok: false, status: r.status, message: `Reachable, but returned HTTP ${r.status}` }
    const needsKey = t.fields?.some(f => f.key === 'apiKey') && !s.apiKey && t.id !== 'openai'
    return { ok: true, status: r.status, message: needsKey ? 'Reachable — add the API key to enable the integration' : t.test ? 'Connected' : `Reachable (HTTP ${r.status})` }
  } catch (e) {
    return { ok: false, message: `Unreachable — ${e.cause?.code || e.name === 'TimeoutError' ? 'timed out' : e.message}` }
  }
}

// ── AI backend resolution ─────────────────────────────────────────────────────
// Tries every enabled OpenAI-compatible service (oMLX, LM Studio…) in list order,
// then Ollama. Cached briefly so a chat request or a /services poll doesn't
// re-probe the network every time; probes use a short timeout so a dead backend
// fails fast instead of stalling the request that needs the answer.
let aiBackendCache = null
const AI_BACKEND_TTL = 10_000

export async function resolveAiBackend() {
  if (aiBackendCache && aiBackendCache.expires > Date.now()) return aiBackendCache.value

  const enabled = services.filter(s => s.enabled !== false && serviceBase(s))
  const candidates = [
    ...enabled.filter(s => getTemplate(s.template).ai === 'openai').map(s => ({
      base: serviceBase(s) + getTemplate(s.template).apiPath, openai: true, probe: '/models',
      headers: s.apiKey ? { Authorization: `Bearer ${s.apiKey}` } : {}, apiKey: s.apiKey, label: s.name, link: serviceLink(s), device: s.device,
    })),
    ...enabled.filter(s => s.template === 'ollama').map(s => ({
      base: serviceBase(s), openai: false, probe: '/api/tags', headers: {}, apiKey: '', label: s.name, link: serviceLink(s), device: s.device,
    })),
  ]

  let resolved = null
  for (const c of candidates) {
    try {
      await proxyGet(`${c.base}${c.probe}`, c.headers, 2500)
      resolved = { ...c, online: true }
      break
    } catch {}
  }
  if (!resolved) {
    resolved = candidates[0]
      ? { ...candidates[0], online: false }
      : { base: '', openai: false, headers: {}, apiKey: '', label: 'No AI service', link: null, online: false }
  }

  aiBackendCache = { value: resolved, expires: Date.now() + AI_BACKEND_TTL }
  return resolved
}

// ── Load ──────────────────────────────────────────────────────────────────────
services = readJSON(FILE, []).map(normalize)

// ── Routes ────────────────────────────────────────────────────────────────────
// Templates are sent without the server-only test recipe
router.get('/service-templates', (_req, res) => {
  res.json({
    categories: CATEGORIES,
    templates: SERVICE_TEMPLATES.map(({ test, ...t }) => ({ ...t, testable: !!test || ['qbittorrent', 'steam'].includes(t.id) })),
  })
})

router.get('/service-config', (_req, res) => res.json(services))

router.put('/service-config', (req, res) => {
  const list = req.body
  if (!Array.isArray(list)) return res.status(400).json({ error: 'Expected an array of services' })
  const ids = new Set()
  for (const s of list) {
    if (!s?.id || !s?.template) return res.status(400).json({ error: 'Every service needs an id and a template' })
    if (ids.has(s.id)) return res.status(400).json({ error: `Duplicate service id: ${s.id}` })
    ids.add(s.id)
  }
  res.json({ ok: true, services: saveServices(list) })
})

router.post('/service-config/test', async (req, res) => {
  if (!req.body?.template) return res.status(400).json({ error: 'template required' })
  res.json(await testService(normalize(req.body)))
})

export default router
