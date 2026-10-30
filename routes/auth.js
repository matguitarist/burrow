import { Router } from 'express'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { readJSON, writeJSON } from './lib.js'

const router = Router()

// ── Sign-in ──────────────────────────────────────────────────────────────────
// data/auth.json: { password: { salt, hash } | null, mode, sessions: [...] }
// Until a password is set Burrow stays open, so upgrading can't lock you out.
//   mode 'control': viewing is open; changes and secrets need sign-in
//   mode 'all':     everything needs sign-in
// Requests from this machine itself (the Mac app, its dashboard window) are
// trusted — unless they come through a proxy or from another site's page.
const FILE = 'auth.json'
const COOKIE = 'burrow_session'
const REMEMBER_MS = 365 * 86400_000
const SESSION_MS  = 12 * 3600_000

let state = { password: null, mode: 'control', sessions: [], ...readJSON(FILE, {}) }
const save = () => writeJSON(FILE, state)

const sha = s => createHash('sha256').update(s).digest('hex')

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') }
}

function checkPassword(password) {
  if (!state.password || typeof password !== 'string') return false
  const expected = Buffer.from(state.password.hash, 'hex')
  const actual = scryptSync(password, state.password.salt, 64)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// ── Request classification ───────────────────────────────────────────────────
const PROXY_HEADERS = ['x-forwarded-for', 'x-real-ip', 'forwarded', 'cf-connecting-ip']
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const isDev = process.env.NODE_ENV !== 'production'

function originHost(req) {
  try { return new URL(req.headers.origin).host } catch { return null }
}

// A page on another site posting to Burrow (CSRF). Same-origin and no-Origin
// (native apps, curl) are fine; so is the Vite dev server in development.
function crossSite(req) {
  if (!req.headers.origin) return false
  const host = originHost(req)
  if (host === req.headers.host) return false
  if (isDev && host?.endsWith(':5173')) return false
  return true
}

function isLocal(req) {
  const ip = req.socket.remoteAddress || ''
  const loopback = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
  if (!loopback || PROXY_HEADERS.some(h => req.headers[h])) return false
  if (!req.headers.origin) return true
  try { return LOCAL_HOSTS.has(new URL(req.headers.origin).hostname) } catch { return false }
}

function readCookie(req) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))
  return m ? decodeURIComponent(m[1]) : null
}

function sessionFor(req) {
  const raw = readCookie(req)
  if (!raw) return null
  const [id, token] = raw.split('.')
  const s = state.sessions.find(x => x.id === id)
  if (!s || s.expires < Date.now() || s.tokenHash !== sha(token || '')) return null
  // Touch at most once a minute to avoid rewriting the file on every request
  if (Date.now() - s.lastSeen > 60_000) {
    s.lastSeen = Date.now()
    if (!s.remember) s.expires = Date.now() + SESSION_MS
    save()
  }
  return s
}

// Reads that expose secrets or remote output — gated even in 'control' mode
const SENSITIVE_GET = [/^\/service-config/, /^\/backup$/, /^\/backups/, /^\/containers\/[^/]+\/[^/]+\/logs/, /^\/auth\/sessions/, /^\/automations/]
const OPEN = [/^\/auth\/(status|login|logout)$/, /^\/server\/ping$/]

export function authorized(req) {
  if (!state.password) return true
  return isLocal(req) || !!sessionFor(req)
}

// Express middleware for /api
export function authGate(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD' && crossSite(req)) {
    return res.status(403).json({ error: 'Cross-site request blocked' })
  }
  if (OPEN.some(r => r.test(req.path)) || authorized(req)) return next()
  const needsLogin = state.mode === 'all'
    || !['GET', 'HEAD'].includes(req.method)
    || SENSITIVE_GET.some(r => r.test(req.path))
  if (needsLogin) return res.status(401).json({ error: 'login-required' })
  next()
}

// For the terminal WebSocket upgrade
export function wsAuthorized(req) {
  return !crossSite(req) && authorized(req)
}

// ── Brute-force protection: per-IP backoff after 5 failures ──────────────────
const attempts = new Map()   // ip → { fails, until }
function locked(ip) {
  const a = attempts.get(ip)
  return a && a.until > Date.now() ? Math.ceil((a.until - Date.now()) / 1000) : 0
}
function failed(ip) {
  const a = attempts.get(ip) || { fails: 0, until: 0 }
  a.fails++
  if (a.fails >= 5) a.until = Date.now() + Math.min(60_000 * 2 ** (a.fails - 5), 15 * 60_000)
  attempts.set(ip, a)
}

function setCookie(res, value, maxAgeMs) {
  const parts = [`${COOKIE}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax']
  if (maxAgeMs != null) parts.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`)
  res.setHeader('Set-Cookie', parts.join('; '))
}

function deviceName(ua = '') {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Device'
  // The native iPad app sends "BurrowApp/<version> (iPad)"
  const browser = /^BurrowApp\//.test(ua) ? 'Burrow app' : /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  return `${browser} on ${os}`
}

// ── Routes ───────────────────────────────────────────────────────────────────
router.get('/auth/status', (req, res) => {
  const session = state.password ? sessionFor(req) : null
  res.json({
    passwordSet: !!state.password,
    mode: state.mode,
    local: isLocal(req),
    signedIn: !!session,
    // What this client can do without signing in again
    canControl: authorized(req),
  })
})

router.post('/auth/login', (req, res) => {
  const ip = req.socket.remoteAddress || '?'
  const wait = locked(ip)
  if (wait) return res.status(429).json({ error: `Too many attempts — try again in ${wait}s` })
  if (!state.password) return res.status(400).json({ error: 'No password is set' })
  if (!checkPassword(req.body?.password)) {
    failed(ip)
    return res.status(401).json({ error: 'Wrong password' })
  }
  attempts.delete(ip)

  const remember = req.body?.remember !== false
  const id = randomBytes(9).toString('hex'), token = randomBytes(32).toString('hex')
  state.sessions.push({
    id, tokenHash: sha(token), remember,
    name: deviceName(req.headers['user-agent']), ip,
    created: Date.now(), lastSeen: Date.now(),
    expires: Date.now() + (remember ? REMEMBER_MS : SESSION_MS),
  })
  // Drop expired sessions while we're here
  state.sessions = state.sessions.filter(s => s.expires > Date.now())
  save()
  setCookie(res, `${id}.${token}`, remember ? REMEMBER_MS : null)
  res.json({ ok: true })
})

router.post('/auth/logout', (req, res) => {
  const id = (readCookie(req) || '').split('.')[0]
  if (id) { state.sessions = state.sessions.filter(s => s.id !== id); save() }
  setCookie(res, '', 0)
  res.json({ ok: true })
})

// Set, change or remove the password, and the protection level. Goes through
// authGate, so once a password exists only a signed-in or local client gets here;
// changing it also needs the current password unless you're on this machine.
router.post('/auth/password', (req, res) => {
  const { current, password, mode } = req.body || {}
  if (state.password && !isLocal(req) && !checkPassword(current)) {
    return res.status(401).json({ error: 'Current password is wrong' })
  }
  if (password === null) {
    state = { ...state, password: null, sessions: [] }   // sign-in turned off
  } else if (password !== undefined) {
    if (typeof password !== 'string' || password.length < 6) return res.status(400).json({ error: 'Use at least 6 characters' })
    const keep = sessionFor(req)?.id
    state.password = hashPassword(password)
    state.sessions = state.sessions.filter(s => s.id === keep)   // sign out everywhere else
  }
  if (mode !== undefined) {
    if (!['control', 'all'].includes(mode)) return res.status(400).json({ error: 'Unknown mode' })
    state.mode = mode
  }
  save()
  res.json({ ok: true, passwordSet: !!state.password, mode: state.mode })
})

router.get('/auth/sessions', (req, res) => {
  const current = sessionFor(req)?.id
  res.json(state.sessions
    .filter(s => s.expires > Date.now())
    .map(({ id, name, ip, created, lastSeen, remember }) => ({ id, name, ip, created, lastSeen, remember, current: id === current })))
})

router.delete('/auth/sessions/:id', (req, res) => {
  state.sessions = state.sessions.filter(s => s.id !== req.params.id)
  save()
  res.json({ ok: true })
})

export default router
