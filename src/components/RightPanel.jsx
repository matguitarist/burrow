import { useState, useRef } from 'react'
import { X, CheckSquare, CalendarDays } from 'lucide-react'
import TodoPanel from './TodoPanel.jsx'
import AgendaPanel from './AgendaPanel.jsx'

export default function RightPanel({ open, onClose, todos, events, onAddTodo, onToggleTodo, onDeleteTodo, onAddEvent, onDeleteEvent, onEditEvent, onEditEventOccurrence }) {
  const [pendingTodo, setPendingTodo] = useState(null)
  const pendingTodoRef = useRef(null)

  const handleCreateEvent = (todo) => {
    pendingTodoRef.current = todo
    setPendingTodo(todo)
  }

  return (
    <>
      <div
        className={`panel-backdrop${open ? ' panel-backdrop-visible' : ''}`}
        onClick={onClose}
      />
      <div className={`side-panel right-panel${open ? ' panel-open' : ''}`}>
        <div className="side-panel-header">
          <div className="side-panel-title">
            <CheckSquare size={15} style={{ color: '#818cf8' }} />
            <CalendarDays size={15} style={{ color: '#2dd4bf' }} />
            <span>To-Do & Agenda</span>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>

        <div className="side-panel-body">
          <TodoPanel
            todos={todos}
            onAdd={onAddTodo}
            onToggle={onToggleTodo}
            onDelete={onDeleteTodo}
            onCreateEvent={handleCreateEvent}
          />
          <div className="rp-divider" />
          <AgendaPanel
            events={events}
            onAdd={onAddEvent}
            onDelete={onDeleteEvent}
            onEdit={onEditEvent}
            onEditOccurrence={onEditEventOccurrence}
            externalNewTitle={pendingTodo?.text}
            onExternalNewConsumed={() => setPendingTodo(null)}
            onExternalNewSaved={() => { onDeleteTodo(pendingTodoRef.current?.id); pendingTodoRef.current = null }}
          />
        </div>
      </div>
    </>
  )
}
