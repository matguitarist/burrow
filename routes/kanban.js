import { Router } from 'express'
import { readJSON, writeJSON, uid } from './lib.js'

const router = Router()

// Fresh objects per call — reusing a shared constant here would get mutated
// in place by the first write and pollute every request for the process's
// whole lifetime (readJSON's fallback is used by reference when the file
// is missing).
const defaultProjects  = () => [{ id: 'default', name: 'Board' }]
const defaultBoardShape = () => ({
  columns: [
    { id: 'todo',  title: 'To Do' },
    { id: 'doing', title: 'In Progress' },
    { id: 'done',  title: 'Done' },
  ],
  cardOrder: { todo: [], doing: [], done: [] },
  cards: {},
})

// Guards against a hand-edited or partially-written file leaving refs dangling
function normalizeBoard(board) {
  if (!board || typeof board !== 'object') board = defaultBoardShape()
  if (!Array.isArray(board.columns)) board.columns = []
  if (!board.cardOrder || typeof board.cardOrder !== 'object') board.cardOrder = {}
  if (!board.cards || typeof board.cards !== 'object') board.cards = {}
  for (const col of board.columns) {
    if (!Array.isArray(board.cardOrder[col.id])) board.cardOrder[col.id] = []
    board.cardOrder[col.id] = board.cardOrder[col.id].filter(id => board.cards[id])
  }
  return board
}

function loadData() {
  const raw = readJSON('kanban.json', null)

  // Migrate the pre-projects single-board file shape into one project
  if (raw && Array.isArray(raw.columns) && !raw.projects) {
    const data = { projects: defaultProjects(), boards: { default: normalizeBoard(raw) } }
    writeJSON('kanban.json', data)
    return data
  }

  const data = raw || { projects: defaultProjects(), boards: { default: defaultBoardShape() } }
  if (!Array.isArray(data.projects) || data.projects.length === 0) data.projects = defaultProjects()
  if (!data.boards || typeof data.boards !== 'object') data.boards = {}
  for (const p of data.projects) data.boards[p.id] = normalizeBoard(data.boards[p.id])
  return data
}

const save = (data) => writeJSON('kanban.json', data)

// ── Projects ──────────────────────────────────────────────────────────────────
router.get('/kanban/projects', (_req, res) => res.json(loadData().projects))

router.post('/kanban/projects', (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'name required' })
  const data    = loadData()
  const project = { id: uid(), name: name.trim() }
  data.projects.push(project)
  data.boards[project.id] = defaultBoardShape()
  save(data)
  res.json(project)
})

router.put('/kanban/projects/:id', (req, res) => {
  const data    = loadData()
  const project = data.projects.find(p => p.id === req.params.id)
  if (!project) return res.status(404).json({ error: 'not found' })
  if (req.body.name?.trim()) project.name = req.body.name.trim()
  save(data)
  res.json(project)
})

router.delete('/kanban/projects/:id', (req, res) => {
  const data = loadData()
  if (data.projects.length <= 1) return res.status(400).json({ error: 'at least one project is required' })
  const idx = data.projects.findIndex(p => p.id === req.params.id)
  if (idx < 0) return res.status(404).json({ error: 'not found' })
  data.projects.splice(idx, 1)
  delete data.boards[req.params.id]
  save(data)
  res.json({ ok: true })
})

// ── Board (scoped to a project) ─────────────────────────────────────────────────
router.param('projectId', (req, res, next, projectId) => {
  const data  = loadData()
  const board = data.boards[projectId]
  if (!board) return res.status(404).json({ error: 'project not found' })
  req.kanbanData  = data
  req.kanbanBoard = board
  next()
})

router.get('/kanban/:projectId', (req, res) => res.json(req.kanbanBoard))

// ── Columns ───────────────────────────────────────────────────────────────────
router.post('/kanban/:projectId/columns', (req, res) => {
  const { title } = req.body
  if (!title?.trim()) return res.status(400).json({ error: 'title required' })
  const board  = req.kanbanBoard
  const column = { id: uid(), title: title.trim() }
  board.columns.push(column)
  board.cardOrder[column.id] = []
  save(req.kanbanData)
  res.json(column)
})

router.put('/kanban/:projectId/columns/reorder', (req, res) => {
  const { ids } = req.body
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' })
  const board = req.kanbanBoard
  const reordered = ids.map(id => board.columns.find(c => c.id === id)).filter(Boolean)
  for (const col of board.columns) if (!ids.includes(col.id)) reordered.push(col)
  board.columns = reordered
  save(req.kanbanData)
  res.json(board)
})

router.put('/kanban/:projectId/columns/:id', (req, res) => {
  const board = req.kanbanBoard
  const col   = board.columns.find(c => c.id === req.params.id)
  if (!col) return res.status(404).json({ error: 'not found' })
  if (req.body.title?.trim()) col.title = req.body.title.trim()
  save(req.kanbanData)
  res.json(col)
})

router.delete('/kanban/:projectId/columns/:id', (req, res) => {
  const board = req.kanbanBoard
  const idx   = board.columns.findIndex(c => c.id === req.params.id)
  if (idx < 0) return res.status(404).json({ error: 'not found' })
  const [removed] = board.columns.splice(idx, 1)
  for (const cardId of board.cardOrder[removed.id] || []) delete board.cards[cardId]
  delete board.cardOrder[removed.id]
  save(req.kanbanData)
  res.json({ ok: true })
})

// ── Cards ─────────────────────────────────────────────────────────────────────
router.post('/kanban/:projectId/cards', (req, res) => {
  const { columnId, title, description, color } = req.body
  if (!title?.trim()) return res.status(400).json({ error: 'title required' })
  const board = req.kanbanBoard
  if (!board.cardOrder[columnId]) return res.status(404).json({ error: 'column not found' })
  const card = {
    id: uid(),
    title: title.trim(),
    description: description?.trim() || '',
    color: color || null,
    createdAt: new Date().toISOString(),
  }
  board.cards[card.id] = card
  board.cardOrder[columnId].push(card.id)
  save(req.kanbanData)
  res.json(card)
})

router.put('/kanban/:projectId/cards/:id', (req, res) => {
  const board = req.kanbanBoard
  const card  = board.cards[req.params.id]
  if (!card) return res.status(404).json({ error: 'not found' })
  const { title, description, color } = req.body
  if (title !== undefined)       card.title       = title.trim()
  if (description !== undefined) card.description = description.trim()
  if (color !== undefined)       card.color       = color || null
  save(req.kanbanData)
  res.json(card)
})

router.delete('/kanban/:projectId/cards/:id', (req, res) => {
  const board = req.kanbanBoard
  const id    = req.params.id
  if (!board.cards[id]) return res.status(404).json({ error: 'not found' })
  delete board.cards[id]
  for (const colId of Object.keys(board.cardOrder)) {
    board.cardOrder[colId] = board.cardOrder[colId].filter(cid => cid !== id)
  }
  save(req.kanbanData)
  res.json({ ok: true })
})

// Move (and/or reorder) a card — used by drag-and-drop
router.put('/kanban/:projectId/move', (req, res) => {
  const { cardId, toColumnId, toIndex } = req.body
  if (!cardId || !toColumnId) return res.status(400).json({ error: 'cardId and toColumnId required' })
  const board = req.kanbanBoard
  if (!board.cards[cardId])         return res.status(404).json({ error: 'card not found' })
  if (!board.cardOrder[toColumnId]) return res.status(404).json({ error: 'column not found' })

  let fromColumnId = null, fromIndex = -1
  for (const [colId, ids] of Object.entries(board.cardOrder)) {
    const i = ids.indexOf(cardId)
    if (i !== -1) { fromColumnId = colId; fromIndex = i; break }
  }
  for (const colId of Object.keys(board.cardOrder)) {
    board.cardOrder[colId] = board.cardOrder[colId].filter(id => id !== cardId)
  }

  // Removing the card from its own column shifts every later index down by
  // one, so a same-column reorder past its original spot needs correcting.
  let index = toIndex ?? board.cardOrder[toColumnId].length
  if (fromColumnId === toColumnId && fromIndex !== -1 && fromIndex < index) index -= 1

  const list = board.cardOrder[toColumnId]
  index = Math.max(0, Math.min(index, list.length))
  list.splice(index, 0, cardId)
  save(req.kanbanData)
  res.json(board)
})

export default router
