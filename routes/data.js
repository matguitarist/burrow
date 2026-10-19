import { Router } from 'express'
import express from 'express'
import AdmZip from 'adm-zip'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { readJSON, writeJSON, uid, expandRecurring, ymd, DATA, reloadSettings } from './lib.js'
import { holidays as holidaysFor } from './holidays.js'
import { upcomingReleases } from './releases.js'
import { getDrawThingsStatus } from './drawthings.js'
import { reloadServices } from './services.js'

const router = Router()

// ── Scratch pad ───────────────────────────────────────────────────────────────
router.get('/scratchpad', (_req, res) => {
  try { res.json({ text: readFileSync(`${DATA}/scratchpad.txt`, 'utf8') }) }
  catch { res.json({ text: '' }) }
})
router.put('/scratchpad', (req, res) => {
  writeFileSync(`${DATA}/scratchpad.txt`, req.body.text ?? '')
  res.json({ ok: true })
})

// ── Quick links — CRUD (data/links.json) ─────────────────────────────────────
router.get('/links', (_req, res) => res.json(readJSON('links.json', [])))

router.post('/links', (req, res) => {
  const { name, url, icon, color } = req.body
  if (!name?.trim() || !url?.trim()) return res.status(400).json({ error: 'name and url required' })
  const links = readJSON('links.json', [])
  const link  = { id: uid(), name: name.trim(), url: url.trim(), icon: icon || '🔗', color: color || '#818cf8', createdAt: new Date().toISOString() }
  links.push(link)
  writeJSON('links.json', links)
  res.json(link)
})

router.put('/links/reorder', (req, res) => {
  const { ids } = req.body
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' })
  const links = readJSON('links.json', [])
  const reordered = ids.map(id => links.find(l => l.id === id)).filter(Boolean)
  writeJSON('links.json', reordered)
  res.json({ ok: true })
})

router.put('/links/:id', (req, res) => {
  const links = readJSON('links.json', [])
  const idx   = links.findIndex(l => l.id === req.params.id)
  if (idx < 0) return res.status(404).json({ error: 'not found' })
  links[idx] = { ...links[idx], ...req.body }
  writeJSON('links.json', links)
  res.json(links[idx])
})

router.delete('/links/:id', (req, res) => {
  let links = readJSON('links.json', [])
  if (!links.find(l => l.id === req.params.id)) return res.status(404).json({ error: 'not found' })
  links = links.filter(l => l.id !== req.params.id)
  writeJSON('links.json', links)
  res.json({ ok: true })
})

// ── User profile ──────────────────────────────────────────────────────────────
router.get('/profile', (_req, res) => res.json(readJSON('profile.json', {})))
router.post('/profile', (req, res) => {
  const { name, language, style, instructions, timezone, agentName, agentGender } = req.body || {}
  const profile = { name: name || '', language: language || '', style: style || '', instructions: instructions || '', timezone: timezone || '', agentName: agentName || '', agentGender: agentGender || '' }
  writeJSON('profile.json', profile)
  res.json({ ok: true })
})

// ── Draw Things — live status + LoRA settings ────────────────────────────────
router.get('/drawthings/status', async (_req, res) => res.json(await getDrawThingsStatus()))

router.get('/drawthings-settings', (_req, res) =>
  res.json(readJSON('drawthings-settings.json', { loraEnabled: false, loraFile: '', loraWeight: 1.0 })))

router.post('/drawthings-settings', (req, res) => {
  const { loraEnabled, loraFile, loraWeight } = req.body || {}
  const settings = {
    loraEnabled: !!loraEnabled,
    loraFile:    loraFile || '',
    loraWeight:  typeof loraWeight === 'number' && !isNaN(loraWeight) ? loraWeight : 1.0,
  }
  writeJSON('drawthings-settings.json', settings)
  res.json(settings)
})

// ── Todos ─────────────────────────────────────────────────────────────────────
router.get('/todos', (_req, res) => res.json(readJSON('todos.json', [])))

router.post('/todos', (req, res) => {
  const { text } = req.body
  if (!text?.trim()) return res.status(400).json({ error: 'text required' })
  const todos = readJSON('todos.json', [])
  const todo = { id: uid(), text: text.trim(), done: false, createdAt: new Date().toISOString() }
  todos.unshift(todo)
  writeJSON('todos.json', todos)
  res.json(todo)
})

router.put('/todos/:id', (req, res) => {
  const todos = readJSON('todos.json', [])
  const idx = todos.findIndex(t => t.id === req.params.id)
  if (idx < 0) return res.status(404).json({ error: 'not found' })
  todos[idx] = { ...todos[idx], ...req.body }
  writeJSON('todos.json', todos)
  res.json(todos[idx])
})

router.delete('/todos/:id', (req, res) => {
  const todos = readJSON('todos.json', [])
  writeJSON('todos.json', todos.filter(t => t.id !== req.params.id))
  res.json({ ok: true })
})

// ── Events / agenda ───────────────────────────────────────────────────────────
router.get('/events', (_req, res) => {
  const y        = new Date().getFullYear()
  const holidays = holidaysFor(y, 3)
  const user     = readJSON('events.json', [])
  const maxDate  = new Date(y + 2, 11, 31)
  const expanded = user.flatMap(e => expandRecurring(e, maxDate))
  res.json([...holidays, ...expanded])
})

// Sonarr/Radarr releases — separate from /events so a slow or down *arr
// never delays your own events
router.get('/releases', async (_req, res) => res.json(await upcomingReleases()))

router.post('/events', (req, res) => {
  const { title, date, time, repeat, notes, color } = req.body
  if (!title?.trim() || !date) return res.status(400).json({ error: 'title and date required' })
  const events = readJSON('events.json', [])
  const event = {
    id: uid(), title: title.trim(), date,
    time:   time   || null,
    repeat: repeat || null,
    notes:  notes?.trim() || null,
    color:  color  || null,
    type: 'user', createdAt: new Date().toISOString(),
  }
  events.push(event)
  writeJSON('events.json', events)
  res.json(event)
})

router.put('/events/:id', (req, res) => {
  const events = readJSON('events.json', [])
  const idx = events.findIndex(e => e.id === req.params.id)
  if (idx < 0) return res.status(404).json({ error: 'not found' })
  const { title, date, time, repeat, notes, color } = req.body
  events[idx] = {
    ...events[idx],
    title:  title?.trim()  || events[idx].title,
    date:   date           || events[idx].date,
    time:   time           || null,
    repeat: repeat         || null,
    notes:  notes?.trim()  || null,
    color:  color !== undefined ? color : (events[idx].color || null),
  }
  writeJSON('events.json', events)
  res.json(events[idx])
})

// Edit a single occurrence of a recurring event:
// adds `instanceDate` to the template's exceptions and creates a one-time replacement.
router.post('/events/:templateId/except', (req, res) => {
  const { instanceDate, title, date, time, notes, color } = req.body
  if (!instanceDate) return res.status(400).json({ error: 'instanceDate required' })
  const events = readJSON('events.json', [])
  const idx = events.findIndex(e => e.id === req.params.templateId)
  if (idx < 0) return res.status(404).json({ error: 'template not found' })
  events[idx] = {
    ...events[idx],
    exceptions: [...(events[idx].exceptions || []), instanceDate],
  }
  const replacement = {
    id: uid(),
    title: title?.trim() || events[idx].title,
    date:  date || instanceDate,
    time:  time || null,
    repeat: null,
    notes: notes?.trim() || null,
    color: color !== undefined ? color : (events[idx].color || null),
    type: 'user',
    createdAt: new Date().toISOString(),
  }
  events.push(replacement)
  writeJSON('events.json', events)
  res.json(replacement)
})

router.delete('/events/:id', (req, res) => {
  const events = readJSON('events.json', [])
  const id     = req.params.id
  // Handle both direct IDs and recurring instance IDs (templateId_YYYY-MM-DD)
  const filtered = events.filter(e => e.id !== id && !id.startsWith(e.id + '_'))
  writeJSON('events.json', filtered)
  res.json({ ok: true })
})

// ── Backup / Restore ──────────────────────────────────────────────────────────
const BACKUP_FILES = [
  'settings.json', 'services.json', 'todos.json', 'events.json', 'profile.json',
  'games.json', 'links.json', 'kanban.json', 'drawthings-settings.json', 'scratchpad.txt',
].map(label => ({ label, src: `${DATA}/${label}` }))

router.get('/backup', (_req, res) => {
  try {
    const zip  = new AdmZip()
    const date = new Date().toISOString().slice(0, 10)
    for (const f of BACKUP_FILES) {
      if (existsSync(f.src)) zip.addLocalFile(f.src, '', f.label)
    }
    const buf = zip.toBuffer()
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="burrow-backup-${date}.zip"`)
    res.setHeader('Content-Length', buf.length)
    res.send(buf)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/restore', express.raw({ type: 'application/zip', limit: '10mb' }), (req, res) => {
  try {
    const zip     = new AdmZip(req.body)
    const entries = zip.getEntries()
    const labels  = new Set(BACKUP_FILES.map(f => f.label))
    const restored = []

    for (const entry of entries) {
      const name = entry.entryName.replace(/^.*[\\/]/, '') // strip any path prefix
      if (!labels.has(name)) continue
      const dest = BACKUP_FILES.find(f => f.label === name)?.src
      if (!dest) continue
      writeFileSync(dest, entry.getData())
      restored.push(name)
    }

    if (restored.length === 0) return res.status(400).json({ error: 'No recognised files found in zip' })

    if (restored.includes('settings.json')) reloadSettings()
    if (restored.includes('services.json')) reloadServices()

    res.json({ ok: true, restored })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
