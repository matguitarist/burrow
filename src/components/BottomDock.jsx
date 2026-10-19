import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { NotebookPen, Plus, Check, X, Settings, Trash2, GripVertical } from 'lucide-react'
import ScratchPad from './ScratchPad.jsx'

const COLOR_OPTS = [
  '#818cf8','#34d399','#60a5fa','#f472b6','#fb923c',
  '#a78bfa','#4ade80','#f59e0b','#22d3ee','#f87171',
]

function faviconUrl(rawUrl) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(rawUrl).hostname}&sz=32` }
  catch { return null }
}

function LinkIcon({ icon, size = 18 }) {
  if (icon && icon.startsWith('http')) {
    return <img src={icon} alt="" className="dock-favicon" style={{ width: size, height: size }}
      onError={e => { e.currentTarget.style.display = 'none' }} />
  }
  return <span className="dock-link-icon" style={{ fontSize: size }}>{icon}</span>
}

export default function BottomDock({ links = [], onLinksUpdate }) {
  const [padOpen,      setPadOpen]      = useState(false)
  const [adding,       setAdding]       = useState(false)
  const [managing,     setManaging]     = useState(false)
  const [name,         setName]         = useState('')
  const [url,          setUrl]          = useState('')
  const [icon,         setIcon]         = useState('')
  const [iconOverride, setIconOverride] = useState(false)
  const [color,        setColor]        = useState(COLOR_OPTS[0])

  // drag state
  const dragId     = useRef(null)
  const dragOverId = useRef(null)
  const [dragActive, setDragActive] = useState(false)

  const resetForm = () => {
    setName(''); setUrl(''); setIcon(''); setIconOverride(false)
    setColor(COLOR_OPTS[0]); setAdding(false)
  }

  const handleUrlChange = (val) => {
    setUrl(val)
    if (!iconOverride) setIcon(faviconUrl(val) || '')
  }

  const addLink = async (e) => {
    e.preventDefault()
    if (!name.trim() || !url.trim()) return
    await fetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), url: url.trim(), icon: icon || faviconUrl(url) || '🔗', color }),
    })
    resetForm()
    onLinksUpdate?.()
  }

  const deleteLink = async (id) => {
    await fetch(`/api/links/${id}`, { method: 'DELETE' })
    onLinksUpdate?.()
  }

  // drag-and-drop reorder
  const handleDragStart = (e, id) => {
    dragId.current = id
    setDragActive(true)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, id) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    dragOverId.current = id
  }

  const handleDrop = async (e, targetId) => {
    e.preventDefault()
    if (!dragId.current || dragId.current === targetId) return
    const ids = links.map(l => l.id)
    const from = ids.indexOf(dragId.current)
    const to   = ids.indexOf(targetId)
    const reordered = [...ids]
    reordered.splice(from, 1)
    reordered.splice(to, 0, dragId.current)
    dragId.current = null
    dragOverId.current = null
    setDragActive(false)
    await fetch('/api/links/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: reordered }),
    })
    onLinksUpdate?.()
  }

  const handleDragEnd = () => {
    dragId.current = null
    dragOverId.current = null
    setDragActive(false)
  }

  const previewIcon = icon || (url ? faviconUrl(url) : null) || '🔗'

  return (
    <>
      <div className="bottom-dock">
        {/* Scratch pad */}
        <button className="dock-btn dock-pad-btn" onClick={() => setPadOpen(true)} title="Scratch Pad">
          <NotebookPen size={16} />
        </button>

        {links.length > 0 && <div className="dock-divider" />}

        {/* Bookmarks */}
        {links.map(link => (
          <div
            key={link.id}
            className={`dock-link-wrap${dragId.current === link.id ? ' dock-dragging' : ''}${dragOverId.current === link.id && dragActive ? ' dock-drag-over' : ''}`}
            draggable
            onDragStart={e => handleDragStart(e, link.id)}
            onDragOver={e => handleDragOver(e, link.id)}
            onDrop={e => handleDrop(e, link.id)}
            onDragEnd={handleDragEnd}
          >
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="dock-btn dock-link-btn"
              style={{ '--link-color': link.color }}
            >
              <LinkIcon icon={link.icon} size={18} />
            </a>
            <span className="dock-link-label">{link.name}</span>
          </div>
        ))}

        <div className="dock-divider" />

        {/* Add bookmark */}
        <button
          className={`dock-btn dock-add-btn${adding ? ' active' : ''}`}
          onClick={() => { setAdding(a => !a); setManaging(false) }}
          title="Add bookmark"
        >
          <Plus size={14} />
        </button>

        {/* Manage bookmarks */}
        <button
          className={`dock-btn dock-manage-btn${managing ? ' active' : ''}`}
          onClick={() => { setManaging(m => !m); setAdding(false) }}
          title="Manage bookmarks"
        >
          <Settings size={14} />
        </button>

      </div>

      {adding && createPortal(
        <form className="dock-add-form" onSubmit={addLink}>
          <div className="dock-form-row">
            <div className="dock-form-icon-wrap" title="Auto-grabbed from URL · click to override with emoji">
              <LinkIcon icon={previewIcon} size={16} />
              <input
                className="dock-form-icon-input"
                value={iconOverride ? icon : ''}
                onChange={e => { setIcon(e.target.value); setIconOverride(true) }}
                maxLength={4}
                placeholder="…"
              />
            </div>
            <input className="dock-form-name" value={name} onChange={e => setName(e.target.value)} placeholder="Name" autoFocus />
          </div>
          <input className="dock-form-url" value={url} onChange={e => handleUrlChange(e.target.value)} placeholder="https://..." />
          <div className="dock-form-colors">
            {COLOR_OPTS.map(c => (
              <button key={c} type="button"
                className={`color-swatch${color === c ? ' color-swatch-active' : ''}`}
                style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
          <div className="dock-form-actions">
            <button type="button" className="dock-form-btn dock-form-cancel" onClick={resetForm}><X size={11} /> Cancel</button>
            <button type="submit" className="dock-form-btn dock-form-save" disabled={!name.trim() || !url.trim()}><Check size={11} /> Add</button>
          </div>
        </form>,
        document.body
      )}

      {managing && createPortal(
        <div className="dock-manage-popup">
          <div className="dock-manage-header">
            <span>Manage Bookmarks</span>
            <button className="icon-btn" onClick={() => setManaging(false)}><X size={13} /></button>
          </div>
          {links.length === 0 ? (
            <p className="dock-manage-empty">No bookmarks yet.</p>
          ) : (
            <ul className="dock-manage-list">
              {links.map(link => (
                <li
                  key={link.id}
                  className="dock-manage-row"
                  draggable
                  onDragStart={e => handleDragStart(e, link.id)}
                  onDragOver={e => handleDragOver(e, link.id)}
                  onDrop={e => handleDrop(e, link.id)}
                  onDragEnd={handleDragEnd}
                >
                  <GripVertical size={13} className="dock-manage-grip" />
                  <LinkIcon icon={link.icon} size={16} />
                  <div className="dock-manage-info">
                    <span className="dock-manage-name">{link.name}</span>
                    <span className="dock-manage-url">{link.url}</span>
                  </div>
                  <button className="icon-btn dock-manage-del" onClick={() => deleteLink(link.id)} title="Remove">
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>,
        document.body
      )}

      {padOpen && <ScratchPad onClose={() => setPadOpen(false)} />}
    </>
  )
}
