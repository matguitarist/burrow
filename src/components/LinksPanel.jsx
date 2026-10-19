import { useState } from 'react'
import { Link2, Plus, Trash2, Pencil, Check, X } from 'lucide-react'

function faviconUrl(rawUrl) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(rawUrl).hostname}&sz=32` }
  catch { return null }
}

function LinkIcon({ icon, size = 20 }) {
  if (icon && icon.startsWith('http')) {
    return <img src={icon} alt="" style={{ width: size, height: size, objectFit: 'contain', borderRadius: 3 }} onError={e => { e.currentTarget.style.display = 'none' }} />
  }
  return <span className="link-card-icon">{icon}</span>
}

const COLOR_OPTS = [
  '#818cf8','#34d399','#60a5fa','#f472b6','#fb923c',
  '#a78bfa','#4ade80','#f59e0b','#22d3ee','#f87171',
]

function LinkCard({ link, onDelete, onEdit }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(link)

  const save = async () => {
    await onEdit(link.id, draft)
    setEditing(false)
  }
  const cancel = () => { setDraft(link); setEditing(false) }

  if (editing) {
    return (
      <div className="link-card link-card-editing">
        <div className="link-edit-row">
          <input
            className="link-edit-icon"
            value={draft.icon}
            onChange={e => setDraft(p => ({ ...p, icon: e.target.value }))}
            maxLength={4}
            title="Emoji icon"
          />
          <input
            className="link-edit-name"
            value={draft.name}
            onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
            placeholder="Name"
            autoFocus
          />
        </div>
        <input
          className="link-edit-url"
          value={draft.url}
          onChange={e => setDraft(p => ({ ...p, url: e.target.value }))}
          placeholder="https://..."
        />
        <div className="link-color-row">
          {COLOR_OPTS.map(c => (
            <button
              key={c} type="button"
              className={`color-swatch${draft.color === c ? ' color-swatch-active' : ''}`}
              style={{ background: c }}
              onClick={() => setDraft(p => ({ ...p, color: c }))}
            />
          ))}
        </div>
        <div className="link-edit-actions">
          <button className="link-edit-btn link-edit-cancel" onClick={cancel}><X size={11} /></button>
          <button className="link-edit-btn link-edit-save" onClick={save} disabled={!draft.name.trim() || !draft.url.trim()}><Check size={11} /></button>
        </div>
      </div>
    )
  }

  return (
    <div className="link-card" style={{ '--link-color': link.color }}>
      <a href={link.url} target="_blank" rel="noopener noreferrer" className="link-card-anchor">
        <LinkIcon icon={link.icon} size={20} />
        <span className="link-card-name">{link.name}</span>
      </a>
      <div className="link-card-overlay">
        <button className="icon-btn link-card-edit" onClick={() => setEditing(true)} title="Edit"><Pencil size={10} /></button>
        <button className="icon-btn link-card-del"  onClick={() => onDelete(link.id)} title="Remove"><Trash2 size={10} /></button>
      </div>
    </div>
  )
}

function AddLinkForm({ onAdd, onCancel }) {
  const [name,  setName]  = useState('')
  const [url,   setUrl]   = useState('')
  const [icon,  setIcon]  = useState('🔗')
  const [color, setColor] = useState(COLOR_OPTS[0])

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim() || !url.trim()) return
    await onAdd({ name: name.trim(), url: url.trim(), icon, color })
  }

  return (
    <form className="add-link-form" onSubmit={submit}>
      <div className="link-edit-row">
        <input
          className="link-edit-icon"
          value={icon}
          onChange={e => setIcon(e.target.value)}
          maxLength={4}
          title="Emoji icon"
        />
        <input
          className="link-edit-name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Link name"
          autoFocus
        />
      </div>
      <input
        className="link-edit-url"
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="https://..."
      />
      <div className="link-color-row">
        {COLOR_OPTS.map(c => (
          <button key={c} type="button"
            className={`color-swatch${color === c ? ' color-swatch-active' : ''}`}
            style={{ background: c }}
            onClick={() => setColor(c)} />
        ))}
      </div>
      <div className="link-edit-actions">
        <button type="button" className="link-edit-btn link-edit-cancel" onClick={onCancel}><X size={11} /> Cancel</button>
        <button type="submit" className="link-edit-btn link-edit-save" disabled={!name.trim() || !url.trim()}><Check size={11} /> Add</button>
      </div>
    </form>
  )
}

export default function LinksPanel({ links = [], onUpdate }) {
  const [adding, setAdding] = useState(false)

  const addLink = async (data) => {
    await fetch('/api/links', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    })
    setAdding(false)
    onUpdate?.()
  }

  const deleteLink = async (id) => {
    await fetch(`/api/links/${id}`, { method: 'DELETE' })
    onUpdate?.()
  }

  const editLink = async (id, data) => {
    await fetch(`/api/links/${id}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    })
    onUpdate?.()
  }

  return (
    <div className="glass-card links-panel">
      <div className="panel-header">
        <Link2 size={14} />
        <span>Quick Links</span>
        {links.length > 0 && <span className="pill">{links.length}</span>}
        <span style={{ marginLeft: 'auto' }} />
        <button className="icon-btn" onClick={() => setAdding(a => !a)} title="Add link">
          <Plus size={13} />
        </button>
      </div>

      {adding && (
        <div className="links-add-form-wrap">
          <AddLinkForm onAdd={addLink} onCancel={() => setAdding(false)} />
        </div>
      )}

      {links.length === 0 && !adding ? (
        <p className="links-empty">No links yet — add bookmarks to your favourite services.</p>
      ) : (
        <div className="links-grid">
          {links.map(link => (
            <LinkCard
              key={link.id}
              link={link}
              onDelete={deleteLink}
              onEdit={editLink}
            />
          ))}
        </div>
      )}
    </div>
  )
}
