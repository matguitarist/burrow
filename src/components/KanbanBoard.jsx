import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Trash2, Pencil, Check, GripVertical, LayoutGrid } from 'lucide-react'

const CARD_COLORS = [
  '#818cf8', '#34d399', '#60a5fa', '#f472b6', '#fb923c',
  '#a78bfa', '#4ade80', '#f59e0b', '#22d3ee', '#f87171',
]

const ACTIVE_PROJECT_KEY = 'kanban-active-project'

const jsonFetch = (url, opts) =>
  fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts }).then(r => r.json())

function KanbanCard({ card, columnId, index, dragging, onDragStart, onDragEnd, onCardDragOver, onDelete, onEdit }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState({ title: card.title, description: card.description || '', color: card.color })

  const startEdit = () => { setDraft({ title: card.title, description: card.description || '', color: card.color }); setEditing(true) }
  const cancel    = () => setEditing(false)
  const save      = async () => {
    if (!draft.title.trim()) return
    await onEdit(card.id, { title: draft.title.trim(), description: draft.description.trim(), color: draft.color })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="kanban-card kanban-card-editing">
        <input
          className="kanban-card-title-input"
          value={draft.title}
          onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
          placeholder="Card title"
          autoFocus
        />
        <textarea
          className="kanban-card-desc-input"
          value={draft.description}
          onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
          placeholder="Description (optional)"
          rows={3}
        />
        <div className="link-color-row">
          {CARD_COLORS.map(c => (
            <button
              key={c} type="button"
              className={`color-swatch${draft.color === c ? ' color-swatch-active' : ''}`}
              style={{ background: c }}
              onClick={() => setDraft(d => ({ ...d, color: d.color === c ? null : c }))}
            />
          ))}
        </div>
        <div className="link-edit-actions">
          <button className="link-edit-btn link-edit-cancel" onClick={cancel}><X size={11} /></button>
          <button className="link-edit-btn link-edit-save" onClick={save} disabled={!draft.title.trim()}><Check size={11} /></button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`kanban-card${dragging ? ' kanban-card-dragging' : ''}`}
      style={card.color ? { '--card-color': card.color } : undefined}
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(card.id, columnId) }}
      onDragEnd={onDragEnd}
      onDragOver={e => { e.preventDefault(); onCardDragOver(columnId, index, e) }}
    >
      <div className="kanban-card-top">
        <GripVertical size={12} className="kanban-card-grip" />
        <span className="kanban-card-title">{card.title}</span>
        <div className="kanban-card-overlay">
          <button className="icon-btn kanban-mini-btn" onClick={startEdit} title="Edit"><Pencil size={10} /></button>
          <button className="icon-btn kanban-mini-btn" onClick={() => onDelete(card.id)} title="Delete"><Trash2 size={10} /></button>
        </div>
      </div>
      {card.description && <p className="kanban-card-desc">{card.description}</p>}
    </div>
  )
}

function AddCardForm({ onAdd, onCancel }) {
  const [title, setTitle] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    await onAdd(title.trim())
    setTitle('')
  }

  return (
    <form className="kanban-add-card-form" onSubmit={submit}>
      <textarea
        className="kanban-card-title-input"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Card title…"
        rows={2}
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) submit(e) }}
      />
      <div className="link-edit-actions">
        <button type="button" className="link-edit-btn link-edit-cancel" onClick={onCancel}><X size={11} /></button>
        <button type="submit" className="link-edit-btn link-edit-save" disabled={!title.trim()}><Check size={11} /> Add</button>
      </div>
    </form>
  )
}

function KanbanColumn({
  column, cards, dragged, dropTarget,
  onCardDragStart, onCardDragEnd, onCardDragOver, onColumnDrop,
  onColumnDragStart, onColumnDragEnd, onColumnDragOver,
  onAddCard, onEditCard, onDeleteCard, onRenameColumn, onDeleteColumn,
}) {
  const [renaming, setRenaming] = useState(false)
  const [title,    setTitle]    = useState(column.title)
  const [adding,   setAdding]   = useState(false)

  const saveTitle = async () => {
    if (title.trim() && title.trim() !== column.title) await onRenameColumn(column.id, title.trim())
    setRenaming(false)
  }

  const showFooterDrop = dragged && dropTarget?.columnId === column.id && dropTarget.index >= cards.length

  return (
    <div
      className="kanban-column"
      draggable={!renaming}
      onDragStart={e => {
        // dragstart bubbles from the card/control that's the real drag source —
        // preventDefault() here would cancel that drag too, so just ignore it
        if (e.target.closest('.kanban-card') || e.target.closest('input,textarea,button')) return
        onColumnDragStart(column.id)
      }}
      onDragEnd={onColumnDragEnd}
      onDragOver={e => { e.preventDefault(); onColumnDragOver(column.id) }}
      onDrop={e => { e.preventDefault(); onColumnDrop(column.id) }}
    >
      <div className="kanban-column-header">
        {renaming ? (
          <input
            className="kanban-column-title-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitle(column.title); setRenaming(false) } }}
            autoFocus
          />
        ) : (
          <span className="kanban-column-title" onDoubleClick={() => setRenaming(true)}>{column.title}</span>
        )}
        <div className="kanban-column-count">
          <button className="icon-btn kanban-mini-btn" onClick={() => setAdding(a => !a)} title="Add card"><Plus size={13} /></button>
          <span className="pill kanban-column-pill">{cards.length}</span>
        </div>
        <div className="kanban-column-actions">
          <button className="icon-btn kanban-mini-btn" onClick={() => setRenaming(true)} title="Rename"><Pencil size={11} /></button>
          <button
            className="icon-btn kanban-mini-btn"
            onClick={() => { if (cards.length === 0 || confirm(`Delete "${column.title}" and its ${cards.length} card(s)?`)) onDeleteColumn(column.id) }}
            title="Delete column"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {adding && (
        <AddCardForm
          onAdd={async (title) => { await onAddCard(column.id, title); setAdding(false) }}
          onCancel={() => setAdding(false)}
        />
      )}

      <div className="kanban-column-body">
        {cards.map((card, i) => (
          <div key={card.id}>
            {dragged && dropTarget?.columnId === column.id && dropTarget.index === i && (
              <div className="kanban-drop-indicator" />
            )}
            <KanbanCard
              card={card}
              columnId={column.id}
              index={i}
              dragging={dragged?.id === card.id}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
              onCardDragOver={onCardDragOver}
              onDelete={onDeleteCard}
              onEdit={onEditCard}
            />
          </div>
        ))}
        {showFooterDrop && <div className="kanban-drop-indicator" />}
        <div className="kanban-column-footer-drop" onDragOver={e => { e.preventDefault(); onCardDragOver(column.id, cards.length, e, true) }} />
      </div>
    </div>
  )
}

function ProjectTab({ project, active, deletable, onSelect, onRename, onDelete }) {
  const [renaming, setRenaming] = useState(false)
  const [title,    setTitle]    = useState(project.name)

  const save = async () => {
    if (title.trim() && title.trim() !== project.name) await onRename(project.id, title.trim())
    setRenaming(false)
  }

  if (renaming) {
    return (
      <input
        className="kanban-project-tab-input"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setTitle(project.name); setRenaming(false) } }}
        autoFocus
      />
    )
  }

  return (
    <div className={`kanban-project-tab${active ? ' kanban-project-tab-active' : ''}`}>
      <button className="kanban-project-tab-btn" onClick={onSelect} onDoubleClick={() => setRenaming(true)}>
        {project.name}
      </button>
      <div className="kanban-project-tab-actions">
        <button className="icon-btn kanban-mini-btn" onClick={() => setRenaming(true)} title="Rename project"><Pencil size={10} /></button>
        {deletable && (
          <button
            className="icon-btn kanban-mini-btn"
            onClick={() => { if (confirm(`Delete project "${project.name}" and all its columns/cards?`)) onDelete(project.id) }}
            title="Delete project"
          >
            <Trash2 size={10} />
          </button>
        )}
      </div>
    </div>
  )
}

export default function KanbanBoard({ open, onClose }) {
  const [projects,        setProjects]        = useState([])
  const [activeProjectId, setActiveProjectId] = useState(() => localStorage.getItem(ACTIVE_PROJECT_KEY) || null)
  const [board,           setBoard]           = useState({ columns: [], cardOrder: {}, cards: {} })
  const [loaded,          setLoaded]          = useState(false)

  const [addingProject, setAddingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColTitle,  setNewColTitle]  = useState('')

  const [draggedCard,   setDraggedCard]   = useState(null) // { id, fromColumnId }
  const [dropTarget,    setDropTarget]    = useState(null) // { columnId, index }
  const [draggedColumn, setDraggedColumn] = useState(null)
  const [columnOverId,  setColumnOverId]  = useState(null)

  const selectProject = (id) => {
    setActiveProjectId(id)
    localStorage.setItem(ACTIVE_PROJECT_KEY, id)
  }

  const loadProjects = () =>
    jsonFetch('/api/kanban/projects').then(list => {
      setProjects(list)
      if (!list.some(p => p.id === activeProjectId)) selectProject(list[0]?.id ?? null)
    })

  const loadBoard = () => {
    if (!activeProjectId) return
    jsonFetch(`/api/kanban/${activeProjectId}`).then(d => {
      // A stale project id lingering in localStorage 404s here; loadProjects()
      // (running concurrently) will correct activeProjectId momentarily, so
      // just ignore this response rather than setting board to an error body
      if (!d || !Array.isArray(d.columns)) return
      setBoard(d)
      setLoaded(true)
    })
  }

  useEffect(() => { loadProjects() }, [])
  useEffect(() => { loadBoard() }, [activeProjectId])

  // ── Project CRUD ─────────────────────────────────────────────────────────────
  const addProject = async (e) => {
    e.preventDefault()
    if (!newProjectName.trim()) return
    const project = await jsonFetch('/api/kanban/projects', { method: 'POST', body: JSON.stringify({ name: newProjectName.trim() }) })
    setNewProjectName('')
    setAddingProject(false)
    await loadProjects()
    selectProject(project.id)
  }
  const renameProject = async (id, name) => { await jsonFetch(`/api/kanban/projects/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }); loadProjects() }
  const deleteProject = async (id) => {
    await jsonFetch(`/api/kanban/projects/${id}`, { method: 'DELETE' })
    // loadProjects() re-validates activeProjectId against the fresh list and
    // falls back to the first remaining project if the deleted one was active
    loadProjects()
  }

  // ── Column CRUD ────────────────────────────────────────────────────────────
  const addColumn = async (e) => {
    e.preventDefault()
    if (!newColTitle.trim()) return
    await jsonFetch(`/api/kanban/${activeProjectId}/columns`, { method: 'POST', body: JSON.stringify({ title: newColTitle.trim() }) })
    setNewColTitle('')
    setAddingColumn(false)
    loadBoard()
  }
  const renameColumn = async (id, title) => { await jsonFetch(`/api/kanban/${activeProjectId}/columns/${id}`, { method: 'PUT', body: JSON.stringify({ title }) }); loadBoard() }
  const deleteColumn = async (id) => { await jsonFetch(`/api/kanban/${activeProjectId}/columns/${id}`, { method: 'DELETE' }); loadBoard() }

  // ── Card CRUD ──────────────────────────────────────────────────────────────
  const addCard   = async (columnId, title) => { await jsonFetch(`/api/kanban/${activeProjectId}/cards`, { method: 'POST', body: JSON.stringify({ columnId, title }) }); loadBoard() }
  const editCard   = async (id, data) => { await jsonFetch(`/api/kanban/${activeProjectId}/cards/${id}`, { method: 'PUT', body: JSON.stringify(data) }); loadBoard() }
  const deleteCard = async (id) => { await jsonFetch(`/api/kanban/${activeProjectId}/cards/${id}`, { method: 'DELETE' }); loadBoard() }

  // ── Card drag & drop ──────────────────────────────────────────────────────
  const onCardDragStart = (id, fromColumnId) => setDraggedCard({ id, fromColumnId })
  const onCardDragEnd   = () => { setDraggedCard(null); setDropTarget(null) }
  const onCardDragOver  = (columnId, index, e, isFooter) => {
    if (!draggedCard) return
    let idx = index
    if (!isFooter) {
      const rect = e.currentTarget.getBoundingClientRect()
      const before = e.clientY < rect.top + rect.height / 2
      idx = before ? index : index + 1
    }
    setDropTarget(prev => (prev?.columnId === columnId && prev.index === idx) ? prev : { columnId, index: idx })
  }
  const onColumnDrop = async (columnId) => {
    if (draggedColumn) {
      if (draggedColumn !== columnId) {
        const ids = board.columns.map(c => c.id)
        const from = ids.indexOf(draggedColumn)
        const to   = ids.indexOf(columnId)
        ids.splice(from, 1)
        ids.splice(to, 0, draggedColumn)
        setBoard(b => ({ ...b, columns: ids.map(id => b.columns.find(c => c.id === id)) }))
        await jsonFetch(`/api/kanban/${activeProjectId}/columns/reorder`, { method: 'PUT', body: JSON.stringify({ ids }) })
      }
      setDraggedColumn(null)
      setColumnOverId(null)
      return
    }
    if (!draggedCard) return
    const target = (dropTarget && dropTarget.columnId === columnId)
      ? dropTarget
      : { columnId, index: (board.cardOrder[columnId] || []).length }
    setDraggedCard(null)
    setDropTarget(null)
    await jsonFetch(`/api/kanban/${activeProjectId}/move`, {
      method: 'PUT',
      body: JSON.stringify({ cardId: draggedCard.id, toColumnId: target.columnId, toIndex: target.index }),
    })
    loadBoard()
  }

  // ── Column drag & drop (reorder) ─────────────────────────────────────────
  const onColumnDragStart = (id) => setDraggedColumn(id)
  const onColumnDragEnd   = () => { setDraggedColumn(null); setColumnOverId(null) }
  const onColumnDragOver  = (id) => { if (draggedColumn && draggedColumn !== id) setColumnOverId(id) }

  if (!open && !loaded) return null

  return createPortal(
    <div className={`kanban-modal-backdrop${open ? ' kanban-modal-visible' : ''}`} onClick={onClose}>
      <div className="kanban-modal" onClick={e => e.stopPropagation()}>
        <div className="kanban-modal-header">
          <div className="panel-icon"><LayoutGrid size={15} /></div>
          <span className="panel-title">Kanban Board</span>
          <button
            className="kanban-header-add-btn"
            onClick={() => setAddingColumn(true)}
            disabled={!activeProjectId}
            title="Add column"
          >
            <Plus size={13} /> Add column
          </button>
          <button className="icon-btn panel-collapse-btn" onClick={onClose} title="Close"><X size={14} /></button>
        </div>

        <div className="kanban-project-bar">
          {projects.map(p => (
            <ProjectTab
              key={p.id}
              project={p}
              active={p.id === activeProjectId}
              deletable={projects.length > 1}
              onSelect={() => selectProject(p.id)}
              onRename={renameProject}
              onDelete={deleteProject}
            />
          ))}
          {addingProject ? (
            <form className="kanban-project-add-form" onSubmit={addProject}>
              <input
                className="kanban-project-tab-input"
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                placeholder="Project name…"
                autoFocus
                onKeyDown={e => { if (e.key === 'Escape') setAddingProject(false) }}
              />
              <button type="submit" className="icon-btn kanban-mini-btn" disabled={!newProjectName.trim()} title="Create"><Check size={12} /></button>
              <button type="button" className="icon-btn kanban-mini-btn" onClick={() => setAddingProject(false)} title="Cancel"><X size={12} /></button>
            </form>
          ) : (
            <button className="kanban-project-tab-add" onClick={() => setAddingProject(true)} title="New project">
              <Plus size={13} />
            </button>
          )}
        </div>

        <div className="kanban-board-scroll">
          {board.columns.map(col => (
            <div
              key={col.id}
              className={draggedColumn && columnOverId === col.id ? 'kanban-column-wrap kanban-column-over' : 'kanban-column-wrap'}
            >
              <KanbanColumn
                column={col}
                cards={(board.cardOrder[col.id] || []).map(id => board.cards[id]).filter(Boolean)}
                dragged={draggedCard}
                dropTarget={dropTarget}
                onCardDragStart={onCardDragStart}
                onCardDragEnd={onCardDragEnd}
                onCardDragOver={onCardDragOver}
                onColumnDrop={onColumnDrop}
                onColumnDragStart={onColumnDragStart}
                onColumnDragEnd={onColumnDragEnd}
                onColumnDragOver={onColumnDragOver}
                onAddCard={addCard}
                onEditCard={editCard}
                onDeleteCard={deleteCard}
                onRenameColumn={renameColumn}
                onDeleteColumn={deleteColumn}
              />
            </div>
          ))}

          {addingColumn && (
            <div className="kanban-column-wrap">
              <div className="kanban-column kanban-add-column">
                <form onSubmit={addColumn} className="kanban-add-column-form">
                  <input
                    className="kanban-column-title-input"
                    value={newColTitle}
                    onChange={e => setNewColTitle(e.target.value)}
                    placeholder="Column name…"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Escape') setAddingColumn(false) }}
                  />
                  <div className="link-edit-actions">
                    <button type="button" className="link-edit-btn link-edit-cancel" onClick={() => setAddingColumn(false)}><X size={11} /></button>
                    <button type="submit" className="link-edit-btn link-edit-save" disabled={!newColTitle.trim()}><Check size={11} /></button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
