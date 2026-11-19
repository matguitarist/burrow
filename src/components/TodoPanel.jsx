import { useState } from 'react'
import { CheckSquare, Square, Trash2, Plus, CalendarPlus } from 'lucide-react'
import { t } from '../i18n.js'

function TodoItem({ todo, onToggle, onDelete, onCreateEvent }) {
  return (
    <div className={`todo-item ${todo.done ? 'todo-done' : ''}`}>
      <button className="todo-check" onClick={() => onToggle(todo.id, !todo.done)}>
        {todo.done ? <CheckSquare size={15} /> : <Square size={15} />}
      </button>
      <span className="todo-text">{todo.text}</span>
      <button className="todo-to-event" onClick={() => onCreateEvent({ id: todo.id, text: todo.text })} title={t('Convert to calendar event')}>
        <CalendarPlus size={11} />
      </button>
      <button className="todo-del" onClick={() => onDelete(todo.id)}>
        <Trash2 size={11} />
      </button>
    </div>
  )
}

export default function TodoPanel({ todos, onAdd, onToggle, onDelete, onCreateEvent }) {
  const [input, setInput] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!input.trim()) return
    onAdd(input.trim())
    setInput('')
  }

  const active = todos.filter(x => !x.done)
  const done   = todos.filter(x =>  x.done)

  return (
    <div className="glass-card todo-panel">
      <div className="panel-header">
        <div className="panel-icon" style={{ background: 'rgba(129,140,248,0.12)', borderColor: 'rgba(129,140,248,0.25)' }}>
          <CheckSquare size={16} style={{ color: 'var(--accent)' }} />
        </div>
        <h3 className="panel-title">{t('To-Do')}</h3>
        {active.length > 0 && <span className="pill">{t('{n} left', { n: active.length })}</span>}
      </div>

      <form onSubmit={handleSubmit} className="todo-form">
        <input
          className="todo-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={t('Add a task…')}
        />
        <button type="submit" className="todo-add-btn" disabled={!input.trim()}>
          <Plus size={14} />
        </button>
      </form>

      <div className="todo-list">
        {active.map(x => (
          <TodoItem key={x.id} todo={x} onToggle={onToggle} onDelete={onDelete} onCreateEvent={onCreateEvent} />
        ))}

        {done.length > 0 && (
          <>
            <div className="todo-section-label">{t('Completed ({n})', { n: done.length })}</div>
            {done.map(x => (
              <TodoItem key={x.id} todo={x} onToggle={onToggle} onDelete={onDelete} onCreateEvent={onCreateEvent} />
            ))}
          </>
        )}

        {todos.length === 0 && (
          <p className="panel-empty">{t('Nothing to do. Enjoy your day!')}</p>
        )}
      </div>
    </div>
  )
}
