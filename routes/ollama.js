import { Router } from 'express'
import { proxyGet, readJSON, writeJSON, uid, expandRecurring, getDevices } from './lib.js'
import { holidays as holidaysFor } from './holidays.js'
import { resolveAiBackend, getServices } from './services.js'
import { getLatestHealth, wakeDevice } from './system.js'
import { containerAction } from './containers.js'
import { upcomingReleases } from './releases.js'
import { getSeerrBase, seerrConfigured, seerrGet, seerrPost, fetchMediaTitle } from './media.js'
import { fetchEmulationNews, fetchTrackedReleases, emulationNewsEnabled, trackedSources } from './news.js'
import { steamStoreFetch, steamFetchGameDetails } from './games.js'
import { generateImage, imageDataUrl } from './drawthings.js'
import { mcpClient } from './mcp.js'

// MCP servers injected by oMLX — call any tool not handled natively by routing here
// One client per server; singletons are kept alive across requests
const DDG_CLIENT = mcpClient('uvx', ['duckduckgo-mcp-server'])

const router = Router()

// Build fetch headers — adds Authorization only when talking to the custom
// OpenAI-compat backend (Ollama's native API doesn't take one).
function aiHeaders(backend, extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra }
  if (backend.openai && backend.apiKey) h['Authorization'] = `Bearer ${backend.apiKey}`
  return h
}

// Notes + calendar actions (run from the actions block or native tool calls)
function executeTool(name, args) {
  switch (name) {
    case 'list_todos': {
      const all    = readJSON('todos.json', [])
      const filter = args.filter || 'active'
      const list   = filter === 'all'  ? all
                   : filter === 'done' ? all.filter(t =>  t.done)
                   :                     all.filter(t => !t.done)
      return list.map(t => ({ id: t.id, text: t.text, done: t.done }))
    }
    case 'add_todo': {
      const todos = readJSON('todos.json', [])
      const todo  = { id: uid(), text: args.text.trim(), done: false, createdAt: new Date().toISOString() }
      todos.unshift(todo)
      writeJSON('todos.json', todos)
      return { ok: true, id: todo.id, text: todo.text }
    }
    case 'complete_todo': {
      const todos = readJSON('todos.json', [])
      const idx   = todos.findIndex(t => t.id === args.id)
      if (idx < 0) return { error: 'not found' }
      todos[idx] = { ...todos[idx], done: args.done }
      writeJSON('todos.json', todos)
      return { ok: true }
    }
    case 'delete_todo': {
      const todos = readJSON('todos.json', [])
      writeJSON('todos.json', todos.filter(t => t.id !== args.id))
      return { ok: true }
    }
    case 'list_events': {
      const days     = Math.min(args.days || 30, 365)
      const today    = new Date(); today.setHours(0,0,0,0)
      const cutoff   = new Date(today.getTime() + days * 86400000)
      const todayStr = today.toISOString().slice(0,10)
      const cutStr   = cutoff.toISOString().slice(0,10)
      const y        = today.getFullYear()
      const holidays = holidaysFor(y, 2)
      const user     = readJSON('events.json', [])
      const expanded = user.flatMap(e => expandRecurring(e, cutoff))
      return [...holidays, ...expanded]
        .filter(e => e.date >= todayStr && e.date <= cutStr)
        .sort((a,b) => a.date.localeCompare(b.date))
        .map(e => ({ id: e.id, title: e.title, date: e.date, time: e.time || null, notes: e.notes || null, type: e.type }))
    }
    case 'add_event': {
      const events = readJSON('events.json', [])
      const event  = { id: uid(), title: args.title.trim(), date: args.date, time: args.time || null, notes: args.notes || null, repeat: null, type: 'user', createdAt: new Date().toISOString() }
      events.push(event)
      writeJSON('events.json', events)
      return { ok: true, id: event.id, title: event.title, date: event.date }
    }
    case 'delete_event': {
      const events = readJSON('events.json', [])
      writeJSON('events.json', events.filter(e => e.id !== args.id && !args.id.startsWith(e.id + '_')))
      return { ok: true }
    }
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// Strips <think>…</think> blocks, ChatML special tokens (<|im_start|> etc.),
// and the "..." filler qwen3 emits right after </think>.
// All state is kept in closure so it works correctly across chunk boundaries.
function makeThinkFilter() {
  let depth      = 0
  let afterClose = false   // true until real content begins after </think>

  return function filter(chunk) {
    // Split on think tags, <|…|> ChatML tokens, and bare EOS tokens like <eos> </s> <end>
    const parts = chunk.split(/(<think>|<\/think>|<\|[^|]*?\|>|<\/?(?:eos|s|end|eot|endoftext|end_of_turn)>)/)
    let out = ''
    for (let p of parts) {
      if (p === '<think>') {
        depth++
        afterClose = false
      } else if (p === '</think>') {
        depth      = Math.max(0, depth - 1)
        afterClose = depth === 0   // arm the filler-stripper
      } else if (/^<\|[^|]*?\|>$/.test(p) || /^<\/?(?:eos|s|end|eot|endoftext|end_of_turn)>$/i.test(p)) {
        // discard ChatML / role / EOS special tokens
      } else if (depth === 0) {
        if (afterClose) {
          // Strip leading whitespace, "..." dots, and lone "|" remnants
          p = p.replace(/^[\s\n.|]+/, '')
          if (p) afterClose = false
        }
        out += p
      }
    }
    return out
  }
}

// Parse ```actions [...] ``` block — no end-anchor so trailing model text is tolerated
function parseActionBlock(text) {
  const m = text.match(/```actions?\s*\n([\s\S]*?)\n```/)
  if (!m) return null
  try { return JSON.parse(m[1]) } catch { return null }
}
// Remove the action block and everything after it (model sometimes appends noise)
function stripActionBlock(text) {
  return text.replace(/\n?```actions?[\s\S]*$/, '').trimEnd()
}

// ── OpenAI-compat tool definitions (used in OpenAI mode instead of action blocks) ──
const OPENAI_TOOLS = [
  { type: 'function', function: {
    name: 'add_todo', description: 'Add a new note or todo item.',
    parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  }},
  { type: 'function', function: {
    name: 'complete_todo', description: 'Mark a todo as done or undone.',
    parameters: { type: 'object', properties: {
      id:   { type: 'string' },
      done: { type: 'boolean', description: 'true = mark done, false = reopen' },
    }, required: ['id', 'done'] },
  }},
  { type: 'function', function: {
    name: 'delete_todo', description: 'Permanently delete a note or todo by ID.',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  }},
  { type: 'function', function: {
    name: 'add_event', description: 'Add a calendar event or reminder.',
    parameters: { type: 'object', properties: {
      title: { type: 'string' },
      date:  { type: 'string', description: 'YYYY-MM-DD' },
      time:  { type: 'string', description: 'HH:MM (24h), optional' },
      notes: { type: 'string', description: 'Optional notes' },
    }, required: ['title', 'date'] },
  }},
  { type: 'function', function: {
    name: 'delete_event', description: 'Delete a calendar event by ID.',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  }},
  { type: 'function', function: {
    name: 'request_media',
    description: 'Request a movie or TV show via Seerr. Submit immediately when the user asks — never refuse based on availability.',
    parameters: { type: 'object', properties: {
      query:     { type: 'string', description: 'Exact title to search' },
      mediaType: { type: 'string', enum: ['movie', 'tv'] },
    }, required: ['query', 'mediaType'] },
  }},
  { type: 'function', function: {
    name: 'wishlist_game',
    description: 'Add a game to the Steam wishlist. Only when explicitly asked to add — not for info requests.',
    parameters: { type: 'object', properties: {
      query: { type: 'string', description: 'Exact game name to search on Steam' },
    }, required: ['query'] },
  }},
]

// Device by id or (case-insensitive) name, as the model may use either
function findDevice(ref) {
  const r = String(ref || '').toLowerCase()
  return getDevices().find(d => d.id.toLowerCase() === r || d.name.toLowerCase() === r)
    || getDevices().find(d => d.name.toLowerCase().includes(r))
}

// Live homelab state for the system prompt: service/device health, downloads,
// upcoming releases and containers. Pulled from Burrow's own endpoints so the
// assistant sees exactly what the dashboard shows.
async function homelabContext() {
  const local = path => proxyGet(`http://127.0.0.1:${process.env.PORT || 3001}/api${path}`, {}, 4000)
  const health = getLatestHealth() || {}
  const fmtSince = since => since ? ` since ${new Date(since).toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' })}` : ''

  const serviceLines = getServices().filter(s => s.enabled !== false && health[s.id])
    .map(s => `- ${s.name}: ${health[s.id].online ? 'up' : 'DOWN'}${fmtSince(health[s.id].since)}`)
  const devices = getDevices()
  const deviceLines = devices
    .map(d => `- ${d.name} (id:${d.id}, ${d.ip})${health[`device_${d.id}`] ? `: ${health[`device_${d.id}`].online ? 'up' : 'DOWN'}` : ''}${d.mac ? ', can be woken' : ''}`)

  const [radarr, sonarr, qbit, releases, ...containers] = await Promise.allSettled([
    local('/radarr/queue'), local('/sonarr/queue'), local('/qbittorrent/queue'),
    upcomingReleases(14),
    ...devices.map(d => local(`/glances/${d.id}/containers`)),
  ])
  const val = r => r.status === 'fulfilled' ? r.value : null
  const downloads = [
    ...(val(radarr)?.records || []).map(r => `- ${r.title} (movie) ${r.progress}%`),
    ...(val(sonarr)?.records || []).map(r => `- ${r.title} ${r.episode || ''} ${r.progress}%`),
    ...(val(qbit)?.records   || []).map(r => `- ${r.title} (torrent) ${r.progress}%`),
  ]
  const releaseLines = (val(releases) || [])
    .filter(r => r.date >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 25)
    .map(r => `- ${r.date}${r.time ? ' ' + r.time : ''}: ${r.title}${r.notes ? ` (${r.notes})` : ''}`)
  const containerLines = devices.flatMap((d, i) => {
    const list = val(containers[i])
    return Array.isArray(list) && list.length
      ? [`- ${d.name}: ${list.map(c => `${c.name} (${c.status})`).join(', ')}`]
      : []
  })

  return [
    `SERVICES:\n${serviceLines.join('\n') || '(none)'}`,
    `DEVICES:\n${deviceLines.join('\n') || '(none)'}`,
    `DOWNLOADS IN PROGRESS:\n${downloads.join('\n') || '(none)'}`,
    `UPCOMING RELEASES (Sonarr/Radarr, next 14 days):\n${releaseLines.join('\n') || '(none)'}`,
    `DOCKER CONTAINERS:\n${containerLines.join('\n') || '(none)'}`,
  ].join('\n\n')
}

// Shared action executor — used by both Ollama (action-block) and OpenAI (native tool calls)
// Returns { mutated, notes, results } where results[i] is a string describing the outcome
// of actions[i] — used as tool result content in OpenAI follow-up requests.
async function executeActions(actions, emit) {
  const mutated = new Set()
  const notes   = []
  const results = []

  for (const action of actions) {
    let actionResult = 'done'
    try {
      if (action.type === 'request_media') {
        if (!seerrConfigured()) {
          const msg = 'Error: Seerr not configured — add it in Settings → Services'
          notes.push('✗ ' + msg.slice(7))
          actionResult = msg
        } else {
          let srch
          try {
            srch = await seerrGet(`/api/v1/search?query=${encodeURIComponent(action.query)}&page=1`)
          } catch (e) {
            const msg = `Seerr search failed (${getSeerrBase()}): ${e.message}`
            notes.push('✗ ' + msg); actionResult = 'Error: ' + msg
            results.push(actionResult); continue
          }
          const all = srch.results || []
          if (all.length === 0) {
            actionResult = `Not found: "${action.query}"`
            notes.push(`✗ Nothing found for "${action.query}"`)
          } else if (all.length > 1) {
            emit({ t: 'choices', items: all.slice(0, 5).map(r => ({
              id: r.id, mediaType: r.mediaType,
              title: r.title || r.name || 'Unknown',
              year:  (r.releaseDate || r.firstAirDate || '').slice(0, 4),
            })) })
            actionResult = 'Multiple matches found — presenting choices to the user'
          } else {
            const match = all[0]
            const body  = { mediaType: match.mediaType, mediaId: match.id }
            if (match.mediaType === 'tv') {
              try {
                const tv = await seerrGet(`/api/v1/tv/${match.id}`)
                const seasons = (tv.seasons || []).filter(s => s.seasonNumber > 0).map(s => s.seasonNumber)
                if (seasons.length) body.seasons = seasons
              } catch { body.seasons = [1] }
            }
            try {
              await seerrPost('/api/v1/request', body)
              const label = match.title || match.name || action.query
              notes.push(`✓ Requested: ${label}`)
              actionResult = `Successfully requested: "${label}"`
              mutated.add('seerr')
            } catch (e) {
              const label = match.title || match.name || action.query
              const hint  = e.message.includes('409') ? ' (already requested)' : ': ' + e.message
              notes.push(`✗ ${label}${hint}`)
              actionResult = `Failed to request "${label}"${hint}`
            }
          }
        }

      } else if (action.type === 'wishlist_game') {
        let srch
        try {
          srch = await steamStoreFetch(`/api/storesearch/?term=${encodeURIComponent(action.query)}&l=english&cc=CA`)
        } catch (e) {
          const msg = `Steam search failed: ${e.message}`
          notes.push('✗ ' + msg); actionResult = 'Error: ' + msg
          results.push(actionResult); continue
        }
        const hits = (srch.items || []).filter(i => i.type === 'app')
        if (hits.length === 0) {
          const q     = action.query.toLowerCase()
          const local = readJSON('games.json', []).find(g => g.title?.toLowerCase().includes(q) || q.includes(g.title?.toLowerCase()))
          const msg = local ? `"${local.title}" is already in your wishlist` : `No games found for "${action.query}"`
          notes.push((local ? '↩ ' : '✗ ') + msg)
          actionResult = msg
        } else if (hits.length > 1) {
          emit({ t: 'game_choices', items: hits.slice(0, 5).map(i => ({
            appid: i.id, title: i.name,
            price: i.price?.final_formatted || 'Free',
            onSale: (i.price?.discount_percent || 0) > 0,
            tinyImage: i.tiny_image || '',
          })) })
          actionResult = 'Multiple game matches found — presenting choices to the user'
        } else {
          const match = hits[0]
          const saved = readJSON('games.json', [])
          if (saved.find(g => g.appid === match.id)) {
            const msg = `"${match.name}" is already in your wishlist`
            notes.push('↩ ' + msg); actionResult = msg
          } else {
            try {
              const details = await steamFetchGameDetails(match.id)
              saved.unshift({ ...details, status: 'want', addedAt: new Date().toISOString() })
              writeJSON('games.json', saved)
              notes.push(`✓ Added to wishlist: ${match.name}`)
              actionResult = `Successfully added "${match.name}" to wishlist`
              mutated.add('games')
            } catch (e) {
              const msg = `Failed to add "${match.name}": ${e.message}`
              notes.push('✗ ' + msg); actionResult = 'Error: ' + msg
            }
          }
        }

      } else if (action.type === 'generate_image') {
        const prompt = (action.prompt || '').trim()
        if (!prompt) {
          actionResult = 'Error: no prompt provided'
        } else {
          try {
            const url = await generateImage(prompt, action.negativePrompt || '')
            emit({ t: 'image', url, prompt })
            notes.push(`✓ Generated image: "${prompt}"`)
            actionResult = `Successfully generated an image for "${prompt}" — it is already shown to the user in the chat. Do not describe, restate, or link the image yourself.`
          } catch (e) {
            const msg = `Image generation failed: ${e.message} — Draw Things may not be running (check Settings → Services).`
            notes.push('✗ ' + msg)
            actionResult = 'Error: ' + msg
          }
        }

      } else if (action.type === 'wake_device') {
        const device = findDevice(action.device)
        if (!device) throw new Error(`No device called "${action.device}"`)
        await wakeDevice(device.id)
        notes.push(`⏻ Wake-on-LAN sent to ${device.name}`)
        actionResult = `Magic packet sent to ${device.name}. It may take a minute to come online.`

      } else if (action.type === 'container_action') {
        const device = findDevice(action.device)
        if (!device) throw new Error(`No device called "${action.device}"`)
        emit({ t: 'tool', label: `${action.action === 'stop' ? 'Stopping' : action.action === 'start' ? 'Starting' : 'Restarting'} ${action.container}…` })
        const r = await containerAction(device, action.container, action.action)
        if (r.authRequired) throw new Error(`SSH to ${device.name} needs a password — use a container's controls on the Servers tab once to save it`)
        if (r.error) throw new Error(r.error)
        notes.push(`✓ ${action.container}: ${action.action} done`)
        actionResult = `${action.container} on ${device.name}: ${action.action} succeeded.`

      } else {
        const r = executeTool(action.type, action)
        if (r?.error?.startsWith?.('Unknown tool:')) {
          actionResult = `Tool "${action.type}" is not available. Do not call this tool again. Answer the user directly using the context already provided.`
        } else {
          if (['add_todo','complete_todo','delete_todo'].includes(action.type)) mutated.add('todos')
          if (['add_event','delete_event'].includes(action.type))               mutated.add('events')
          actionResult = JSON.stringify(r)
        }
      }
    } catch (e) {
      notes.push(`✗ Error: ${e.message}`)
      actionResult = `error: ${e.message}`
    }
    results.push(actionResult)
  }

  return { mutated, notes, results }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Model list — Ollama: GET /api/tags  |  OpenAI-compat: GET /v1/models
router.get('/ollama/models', async (_req, res) => {
  try {
    const backend = await resolveAiBackend()
    if (backend.openai) {
      const data = await proxyGet(`${backend.base}/models`, aiHeaders(backend))
      // Normalize to Ollama shape so the frontend needs no changes
      const models = (data.data || []).map(m => ({ name: m.id, model: m.id }))
      res.json({ models })
    } else {
      res.json(await proxyGet(`${backend.base}/api/tags`, aiHeaders(backend)))
    }
  } catch (e) { res.status(503).json({ error: e.message }) }
})

// Running models — Ollama: GET /api/ps  |  OpenAI-compat: no equivalent
router.get('/ollama/running', async (_req, res) => {
  try {
    const backend = await resolveAiBackend()
    if (backend.openai) {
      res.json({ models: [] })
    } else {
      res.json(await proxyGet(`${backend.base}/api/ps`, aiHeaders(backend)))
    }
  } catch (e) { res.status(503).json({ error: e.message }) }
})

// Ollama — chat with context-injected notes + calendar (no native tool API)
router.post('/ollama/chat', async (req, res) => {
  const { model, messages, persona } = req.body
  if (!model || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'model and messages are required' })
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')

  res.setHeader('Cache-Control', 'no-cache')

  const backend    = await resolveAiBackend()
  const ollamaBase = backend.base
  const emit       = obj => { try { res.write(JSON.stringify(obj) + '\n') } catch {} }
  const clientGone = new AbortController()
  req.on('close', () => clientGone.abort())

  try {
    // Resolve timezone + current datetime first (used throughout)
    const profile = readJSON('profile.json', {})
    // Persona overrides (sent per-chat from the frontend)
    if (persona) {
      if (persona.agentName)    profile.agentName    = persona.agentName
      if (persona.agentGender)  profile.agentGender  = persona.agentGender
      if (persona.style)        profile.style        = persona.style
      if (persona.language)     profile.language     = persona.language
      if (persona.instructions) profile.instructions = persona.instructions
    }
    const tz      = profile.timezone || 'UTC'
    const now     = new Date()
    const today   = now.toLocaleDateString('en-CA', { timeZone: tz })
    const localDT = now.toLocaleString('en-US', {
      timeZone: tz, weekday: 'long', year: 'numeric', month: 'long',
      day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    })

    // Build context from current data
    const todos      = readJSON('todos.json', [])
    const rawEvents  = readJSON('events.json', [])
    const cutoff     = new Date(today); cutoff.setDate(cutoff.getDate() + 60)
    const upcoming   = rawEvents
      .flatMap(e => expandRecurring(e, cutoff))
      .filter(e => e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 25)

    const todoLines = todos.length
      ? todos.map(t => `- [${t.done ? 'x' : ' '}] (id:${t.id}) ${t.text}`).join('\n')
      : '(none)'
    const eventLines = upcoming.length
      ? upcoming.map(e => `- ${e.date}${e.time ? ' ' + e.time : ''} (id:${e.id}) ${e.title}${e.notes ? ' — ' + e.notes : ''}`).join('\n')
      : '(none)'

    // Fetch Seerr recent requests for context (titles from cache or fetched in parallel)
    const SEERR_STATUS = { 1: 'pending', 2: 'approved', 3: 'declined', 4: 'available', 5: 'partial' }
    // Game wishlist context (include live discount % from last price sync)
    const games     = readJSON('games.json', [])
    const gamesLines = games.length
      ? games.map(g => {
          let priceStr = ''
          if (g.comingSoon) {
            priceStr = ` — Coming Soon${g.releaseDate && !/coming soon/i.test(g.releaseDate) ? ' · ' + g.releaseDate : ''}`
          } else if (g.discountPct > 0) {
            priceStr = ` — ${g.price} (${g.discountPct}% OFF, was ${g.origPrice})`
          } else if (g.price) {
            priceStr = ` — ${g.price}`
          }
          return `- [${g.status}] ${g.title}${priceStr}`
        }).join('\n')
      : '(none)'

    // Emulation news context (from cached data — no extra latency)
    let emulationNewsLines = '(none)'
    let trackedReleasesLines = '(none)'
    try {
      const [wikiRes, relRes] = await Promise.allSettled([
        emulationNewsEnabled() ? fetchEmulationNews() : Promise.resolve([]),
        fetchTrackedReleases(),
      ])
      if (wikiRes.status === 'fulfilled') {
        const items = wikiRes.value.slice(0, 6)
        emulationNewsLines = items.length
          ? items.map(n => `- ${n.date}: ${n.segments.map(s => s.label || s.content || '').join(' ').trim()}`).join('\n')
          : '(none)'
      }
      if (relRes.status === 'fulfilled') {
        trackedReleasesLines = relRes.value
          .map(r => `- ${r.name}: ${r.version || 'unknown'}${r.date ? ` (${r.date})` : ''}`)
          .join('\n') || '(none)'
      }
    } catch {}

    const trackedNames = trackedSources().map(s => s.name).join(', ')
    const newsContext = [
      emulationNewsEnabled() ? `EMULATION NEWS (recent wiki updates):\n${emulationNewsLines}\n` : '',
      trackedNames ? `TRACKED PROJECT RELEASES (${trackedNames}):\n${trackedReleasesLines}\n` : '',
    ].join('\n')

    let seerrLines = seerrConfigured() ? '' : '(Seerr not configured — add it in Settings → Services)'
    try {
      if (seerrConfigured()) {
        const seerrData = await seerrGet('/api/v1/request?take=10&sort=added&filter=all')
        const reqs = seerrData.results || []
        if (reqs.length === 0) {
          seerrLines = '(no requests yet)'
        } else {
          const enriched = await Promise.all(
            reqs.map(async r => {
              const tmdbId = r.media?.tmdbId
              const { title, year } = tmdbId
                ? await fetchMediaTitle(r.type, tmdbId)
                : { title: 'Unknown', year: '' }
              return { ...r, title, year }
            })
          )
          seerrLines = enriched.map(r => {
            const status = SEERR_STATUS[r.status] || 'unknown'
            const type   = r.type === 'movie' ? 'movie' : 'TV'
            return `- [${status}] ${r.title}${r.year ? ` (${r.year})` : ''} — ${type}`
          }).join('\n')
        }
      }
    } catch { seerrLines = '(Seerr unreachable)' }

    const profileLines = [
      profile.name         && `Name: ${profile.name}`,
      profile.language     && `Respond in: ${profile.language}`,
      profile.style        && `Response style: ${profile.style}`,
      profile.instructions && `Instructions: ${profile.instructions}`,
    ].filter(Boolean).join('\n')

    const openai = backend.openai
    const homelab = await homelabContext().catch(() => '(unavailable)')

    const systemMsg = {
      role: 'system',
      content: `You are ${profile.agentName || 'a home dashboard assistant'}, a helpful AI assistant built into a personal home server dashboard.${ profile.agentGender === 'female' ? ' Use she/her pronouns when referring to yourself.' : profile.agentGender === 'male' ? ' Use he/him pronouns when referring to yourself.' : '' } The current date and time is ${localDT}. Your training data has a knowledge cutoff and does NOT reflect recent events — treat any fact that could have changed (sports results, news, prices, releases, standings, winners) as potentially outdated.${profileLines ? `\n\nUSER PROFILE:\n${profileLines}` : ''}
${openai ? `
WEB SEARCH — MANDATORY: You have a real-time DuckDuckGo search tool. Use it immediately for any time-sensitive question. NEVER guess, NEVER say you lack access, NEVER ask the user to clarify which games — just search.
Search immediately when the user asks about:
- Sports results, standings, playoffs, championships, drafts
- Current news, weather, forecasts
- Prices, sales, discounts, release dates (especially Steam games)
- Anything that may have changed since your training cutoff
GAME DEALS RULE: If the user mentions deals, sales, or discounts → search for the current Steam price/discount of EVERY game in the GAME WISHLIST below. Do NOT ask "which games?" — the list is already there.
` : ''}
NOTES / TODOS:
${todoLines}

HOMELAB (live — use this to answer questions about services, devices, downloads, upcoming episodes/movies and containers):
${homelab}

UPCOMING EVENTS (next 60 days):
${eventLines}

MEDIA REQUESTS (Seerr — recent):
${seerrLines}

GAME WISHLIST (user's Steam wishlist) — search for EACH of these when asked about deals/prices/sales. Do NOT ask the user which games to check; this list IS the answer:
${gamesLines}
← These are the exact game titles to search. Use them as-is in your duckduckgo_search queries.

${newsContext}
You can read and modify notes/events, request movies or TV shows via Seerr, manage a Steam game wishlist, and generate images with Draw Things (running locally).${newsContext ? ' You also have access to the news and tracked project release versions above.' : ''}
CRITICAL RULE — GAME DEALS: If the user asks about deals, prices, or sales → immediately call duckduckgo_search for each game in the GAME WISHLIST. Example query: "Elden Ring Steam current price sale". Do this for EVERY game on the list. Never say "which games?" — never ask for clarification — just search.
CRITICAL RULE — IMAGE GENERATION: You already have a real, working image generator — the generate_image action below runs immediately on your own hardware and the result is shown right in this chat. When the user asks you to draw/make/create/generate/show a picture or image of something, you MUST emit a generate_image action in this response. Do NOT just write out a prompt and tell the user to "use an image generation tool" or ask if they want you to generate it — that tool is you, right now, in this same reply. Never claim you can't generate images.
CRITICAL RULE — IMAGE VISION: Some of the messages above may include an actual image attached as real visual input (not just a text prompt) — a photo of pixels you can genuinely see, the same way you read text. If one is attached, look at it and answer questions about its actual visible content — colors, objects, count, layout, composition — directly and specifically. Do NOT say "I can't see images," "I don't retain images," or "I can only describe the prompt I used" — that is false whenever an image is actually attached; you are a vision-capable model and the pixels are right there in this request. Only say you can't see an image if none is actually attached to this conversation.
To apply changes, add an actions block at the very end of your response (nothing after it):
\`\`\`actions
[{"type":"add_todo","text":"..."}, {"type":"complete_todo","id":"...","done":true}, {"type":"delete_todo","id":"..."}, {"type":"add_event","title":"...","date":"YYYY-MM-DD","time":"HH:MM or null","notes":"... or null"}, {"type":"delete_event","id":"..."}, {"type":"request_media","query":"exact title","mediaType":"movie or tv"}, {"type":"wishlist_game","query":"exact game name"}, {"type":"generate_image","prompt":"detailed visual description","negativePrompt":"optional, or omit"}, {"type":"wake_device","device":"device id or name"}, {"type":"container_action","device":"device id or name","container":"exact container name","action":"start|stop|restart"}]
\`\`\`
Include only the action types you need. Omit the block entirely when making no changes. Convert all dates to YYYY-MM-DD format. For request_media: ALWAYS submit the request immediately when the user asks — never refuse based on release dates or availability. Seerr manages that. Just pick the right mediaType (movie or tv) and use the exact title the user gave. For wishlist_game: only use this when the user explicitly asks to add a game to their wishlist — never when they're just asking about a game's release date, price, or status. If the game is already in the wishlist (visible in GAME WISHLIST context above), answer from that data and do not emit wishlist_game. For generate_image: use whenever the user asks you to draw, create, generate, make, or show a picture/image of something — expand their request into a detailed, vivid visual prompt (subject, style, composition, lighting) rather than passing their raw words through. The image is displayed directly in the chat — do not describe what it looks like afterward, just a short acknowledgement. For wake_device and container_action: only when the user explicitly asks to wake a machine or to start/stop/restart a container — never on your own initiative, even if something is down (suggest it instead). Use the exact container and device names from HOMELAB.`,
    }

    const filterThink = makeThinkFilter()
    // Strip frontend-only fields (choices, gameChoices, error) and drop messages
    // with empty content (e.g. aborted assistant responses) before sending to the LLM.
    // A message carrying a previously generated image (see `image` field, set by the
    // generate_image action) gets that image re-embedded as vision input, so the
    // model can actually answer follow-up questions about it — Draw Things only
    // returns pixels once; without this the model never sees them again.
    const cleanMsgs = messages
      .filter(m => m.role && (m.content !== '' || m.image))
      .map(m => {
        if (!m.image) return { role: m.role, content: m.content ?? '' }
        try {
          const dataUrl = imageDataUrl(m.image)
          const text    = m.content || '(generated image)'
          return openai
            ? { role: m.role, content: [
                { type: 'text', text },
                { type: 'image_url', image_url: { url: dataUrl } },
              ] }
            : { role: m.role, content: text, images: [dataUrl.split(',')[1]] }
        } catch {
          return { role: m.role, content: m.content ?? '' }  // image file gone — degrade to text-only
        }
      })

    // ── Steam deal context from local cache ──────────────────────────────────
    // Use pre-synced price data from games.json (refreshed by dashboard or daily cron).
    // This avoids slow live API calls at chat time — just read what's already stored.
    let steamContext = ''
    const lastUserText = cleanMsgs.at(-1)?.role === 'user' ? cleanMsgs.at(-1).content : ''
    const isDealQuery  = games.length > 0 &&
      /\b(deal|sale|discount|price|cheap|\d+\s*%|percent|off)\b/i.test(lastUserText)

    if (isDealQuery) {
      const meta      = readJSON('steam_meta.json', {})
      const freshness = meta.lastPriceRefresh
        ? `prices last synced ${new Date(meta.lastPriceRefresh).toLocaleDateString('en-CA', { timeZone: tz })}`
        : 'prices not yet synced — use the Games panel refresh button first'
      const priced = games.filter(g => !g.comingSoon && g.price)
      if (priced.length > 0) {
        const lines = priced.map(g =>
          g.discountPct > 0
            ? `${g.title}: ${g.price} (${g.discountPct}% OFF — was ${g.origPrice})`
            : `${g.title}: ${g.price} — no discount`
        )
        steamContext = `STEAM WISHLIST PRICES (${freshness}):\n${lines.join('\n')}\n\nList every game at 50% off or more, sorted by discount percentage (highest first). Mention the sync date.`
      }
    }

    // Prepend deal data directly to the last user message so the model answers from real numbers
    const msgsForLLM = steamContext
      ? cleanMsgs.map((m, i) =>
          i === cleanMsgs.length - 1 && m.role === 'user'
            ? { ...m, content: `${steamContext}\n\n---\nUser: ${m.content}` }
            : m)
      : cleanMsgs

    const msgs = [systemMsg, ...msgsForLLM]

    const stream = await fetch(
      openai ? `${ollamaBase}/chat/completions` : `${ollamaBase}/api/chat`,
      {
        method:  'POST',
        headers: aiHeaders(backend),
        body:    JSON.stringify(openai
          ? { model, messages: msgs, stream: true }
          : { model, messages: msgs, stream: true, think: false }),
        signal:  AbortSignal.timeout(180_000),
      }
    )

    if (!stream.ok) {
      const txt = await stream.text().catch(() => '')
      emit({ t: 'error', message: txt || `AI error ${stream.status}` })
      return
    }

    const reader     = stream.body.getReader()
    const decoder    = new TextDecoder()
    let buf          = ''
    let accum        = ''
    const toolCalls  = {}  // index → { id, name, arguments } — OpenAI tool call chunks

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === 'data: [DONE]') continue
          const raw = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed
          let d; try { d = JSON.parse(raw) } catch { continue }
          if (openai) {
            const ch = d.choices?.[0]; if (!ch) continue
            const chunk = ch.delta?.content ?? ''
            if (chunk) { const v = filterThink(chunk); if (v) { accum += v; emit({ t: 'text', content: v }) } }
            for (const tc of ch.delta?.tool_calls ?? []) {
              if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: '', name: '', arguments: '' }
              if (tc.id)                toolCalls[tc.index].id        += tc.id
              if (tc.function?.name)    toolCalls[tc.index].name      += tc.function.name
              if (tc.function?.arguments) toolCalls[tc.index].arguments += tc.function.arguments
            }
          } else {
            const chunk = d.message?.content ?? ''
            if (chunk) { const v = filterThink(chunk); if (v) { accum += v; emit({ t: 'text', content: v }) } }
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {})
    }

    // ── OpenAI tool-call loop (handles both our tools and MCP pass-through) ──
    // oMLX injects MCP tool definitions and passes tool_calls back to us to execute.
    // We route known tool names to executeActions; everything else goes to the MCP client.
    let finalText = accum
    if (openai && Object.keys(toolCalls).length > 0) {
      emit({ t: 'tool', label: 'Applying changes…' })
      const allMutated = new Set()
      const allNotes   = []
      let convo        = [...msgs]
      let active       = { ...toolCalls }
      const OUR_TOOLS  = new Set(['add_todo','complete_todo','delete_todo','add_event','delete_event','request_media','wishlist_game','generate_image','wake_device','container_action'])

      for (let round = 0; round < 4; round++) {
        const calls = Object.values(active); if (!calls.length) break
        const roundMsgs = []

        for (const tc of calls) {
          let args = {}; try { args = JSON.parse(tc.arguments || '{}') } catch {}
          let result

          if (OUR_TOOLS.has(tc.name)) {
            const { mutated, notes, results } = await executeActions([{ type: tc.name, ...args }], emit)
            mutated.forEach(k => allMutated.add(k)); allNotes.push(...notes)
            result = results[0] ?? (notes.length ? notes.join('; ') : 'done')
          } else {
            try   { result = await DDG_CLIENT.call(tc.name, args) }
            catch (e) { result = `Error calling "${tc.name}": ${e.message}` }
          }

          roundMsgs.push({ role: 'tool', tool_call_id: tc.id, content: result })
        }

        convo = [...convo,
          { role: 'assistant', content: null, tool_calls: calls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments } })) },
          ...roundMsgs,
        ]

        // Follow-up: no tools on last round to force a text response
        const isLast   = round === 3
        const patchSys = { ...convo[0], content: convo[0].content.replace(/ To apply changes, add an actions block.*$/s, ' Tool calls have been executed. Answer the user concisely.') }
        const fu = await fetch(`${ollamaBase}/chat/completions`, {
          method: 'POST', headers: aiHeaders(backend),
          body:   JSON.stringify({ model, messages: [patchSys, ...convo.slice(1)], stream: true }),
          signal: AbortSignal.timeout(120_000),
        })
        if (!fu.ok) break

        const r2 = fu.body.getReader(); const dec = new TextDecoder()
        const filterFu = makeThinkFilter()
        let buf2 = '', fuText = ''; const nextCalls = {}
        try {
          while (true) {
            const { done, value } = await r2.read(); if (done) break
            buf2 += dec.decode(value, { stream: true })
            const lines2 = buf2.split('\n'); buf2 = lines2.pop() ?? ''
            for (const ln of lines2) {
              const tr = ln.trim(); if (!tr || tr === 'data: [DONE]') continue
              const raw2 = tr.startsWith('data: ') ? tr.slice(6) : tr
              let d2; try { d2 = JSON.parse(raw2) } catch { continue }
              const ch2 = d2.choices?.[0]; if (!ch2) continue
              const text = ch2.delta?.content ?? ''
              if (text) { const vf = filterFu(text); if (vf) { fuText += vf; emit({ t: 'text', content: vf }) } }
              for (const tc of ch2.delta?.tool_calls ?? []) {
                if (!nextCalls[tc.index]) nextCalls[tc.index] = { id: '', name: '', arguments: '' }
                if (tc.id)               nextCalls[tc.index].id        += tc.id
                if (tc.function?.name)   nextCalls[tc.index].name      += tc.function.name
                if (tc.function?.arguments) nextCalls[tc.index].arguments += tc.function.arguments
              }
            }
          }
        } finally { r2.cancel().catch(() => {}) }

        finalText = fuText
        if (fuText || isLast || !Object.keys(nextCalls).length) break
        active = nextCalls
      }

      // Unlike the transient 'tool' label (shown only while streaming), 'note' is
      // picked up by the frontend and persisted on the final message — same as the
      // action-block path below, and same reason: kept out of `content` so it never
      // re-enters the model's own context on the next turn.
      if (allNotes.length) emit({ t: 'note', text: allNotes.join(' · ') })
      if (allMutated.size) emit({ t: 'refresh', data: [...allMutated] })
    }

    // Action-block path — parse from whichever text was final (first stream or follow-up)
    const actions = parseActionBlock(finalText)
    if (actions?.length) {
      emit({ t: 'tool', label: 'Applying changes…' })
      const { mutated, notes } = await executeActions(actions, emit)
      // note is kept out of `content` on purpose — it's UI-only feedback. Baking it into
      // the message text would echo back into the model's own context on the next turn,
      // and small models tend to mimic that exact "✓ ..." phrasing instead of re-running
      // the actual action (confirmed: a 2nd image request would just restate the note).
      emit({ t: 'replace', content: stripActionBlock(finalText), note: notes.length ? notes.join(' · ') : null })
      if (mutated.size) emit({ t: 'refresh', data: [...mutated] })
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      console.error('[chat]', e.message)
      if (!res.headersSent) res.status(503).json({ error: e.message })
      else emit({ t: 'error', message: e.message })
    }
  } finally {
    res.end()
  }
})

// Ollama — pull model (streaming progress) — Ollama only
router.post('/ollama/pull', async (req, res) => {
  const { model } = req.body
  if (!model) return res.status(400).json({ error: 'model required' })
  const backend = await resolveAiBackend()
  if (backend.openai) return res.status(501).json({ error: 'Model pull is only supported with native Ollama.' })
  try {
    const upstream = await fetch(
      `${backend.base}/api/pull`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ model, stream: true }),
        signal:  AbortSignal.timeout(600_000), // 10 min — large models take time
      }
    )
    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({ error: txt || `Ollama returned ${upstream.status}` })
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')

    res.setHeader('Cache-Control', 'no-cache')
    const reader  = upstream.body.getReader()
    const decoder = new TextDecoder()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(decoder.decode(value, { stream: true }))
      }
    } finally {
      res.end()
    }
  } catch (e) {
    if (!res.headersSent) res.status(503).json({ error: e.message })
    else res.end()
  }
})

// Ollama — delete model — Ollama only
router.delete('/ollama/model', async (req, res) => {
  const { model } = req.body
  if (!model) return res.status(400).json({ error: 'model required' })
  const backend = await resolveAiBackend()
  if (backend.openai) return res.status(501).json({ error: 'Model deletion is only supported with native Ollama.' })
  try {
    const upstream = await fetch(
      `${backend.base}/api/delete`,
      { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) }
    )
    res.status(upstream.status).json(upstream.ok ? { ok: true } : { error: 'Delete failed' })
  } catch (e) {
    res.status(503).json({ error: e.message })
  }
})

export default router
