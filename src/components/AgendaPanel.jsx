import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, Plus, X, RotateCcw, Clock, AlignLeft, RefreshCw, Pencil, Check, Palette } from 'lucide-react'
import { loc, monthName, weekdayInitials } from '../locale.js'


const EVENT_COLORS = [
  { id: 'blue',    hex: '#38bdf8', label: 'Recycling / Blue' },
  { id: 'green',   hex: '#22c55e', label: 'Trash / Green' },
  { id: 'emerald', hex: '#2dd4bf', label: 'Compost / Mint' },
  { id: 'indigo',  hex: '#818cf8', label: 'Default / Indigo' },
  { id: 'purple',  hex: '#a855f7', label: 'Personal / Purple' },
  { id: 'amber',   hex: '#f59e0b', label: 'Maintenance / Amber' },
  { id: 'orange',  hex: '#f97316', label: 'Task / Orange' },
  { id: 'red',     hex: '#ef4444', label: 'Urgent / Red' },
  { id: 'pink',    hex: '#ec4899', label: 'Social / Pink' },
  { id: 'slate',   hex: '#94a3b8', label: 'Muted / Gray' },
]

const REPEAT_OPTS = [
  { value: 'none',     label: 'No repeat' },
  { value: 'weekly',   label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly (every 2 weeks)' },
  { value: 'monthly',  label: 'Monthly' },
  { value: 'annually', label: 'Annually' },
]

const REPEAT_LABELS = { weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly', annually: 'Annually' }

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmtDate(dateStr) {
  const [y, m, day] = dateStr.split('-').map(Number)
  return new Date(y, m-1, day).toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'short' })
}
// "Today" / "Tomorrow" in the active locale
function relDay(n) {
  const s = new Intl.RelativeTimeFormat(loc(), { numeric: 'auto' }).format(n, 'day')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function fmtDayLong(dateStr) {
  const [y, m, day] = dateStr.split('-').map(Number)
  const d = new Date(y, m-1, day)
  const label = d.toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}
function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0)
  return Math.round((new Date(dateStr + 'T00:00:00') - today) / 86400000)
}
function templateId(id) {
  return id.replace(/(_\d{4}-\d{2}-\d{2})$/, '')
}

// ── Event modal ───────────────────────────────────────────────────────────────
function EventModal({ open, initialEvent, defaultDate, defaultTitle, onClose, onSave }) {
  const [title,     setTitle]     = useState('')
  const [date,      setDate]      = useState(todayStr())
  const [time,      setTime]      = useState('')
  const [repeat,    setRepeat]    = useState('none')
  const [notes,     setNotes]     = useState('')
  const [color,     setColor]     = useState('#818cf8')
  const [editScope, setEditScope] = useState('all')

  useEffect(() => {
    if (!open) return
    if (initialEvent) {
      setTitle(initialEvent.title || '')
      setDate(initialEvent.date || todayStr())
      setTime(initialEvent.time || '')
      setRepeat(initialEvent.repeat || 'none')
      setNotes(initialEvent.notes || '')
      setColor(initialEvent.color || '#818cf8')
      setEditScope('all')
    } else {
      setTitle(defaultTitle || '')
      setDate(defaultDate || todayStr())
      setTime('')
      setRepeat('none')
      setNotes('')
      setColor('#818cf8')
    }
  }, [open, initialEvent, defaultDate, defaultTitle])

  const handleSave = (e) => {
    e.preventDefault()
    if (!title.trim() || !date) return
    const data = {
      title:  title.trim(),
      date,
      time:   time   || null,
      repeat: repeat !== 'none' ? repeat : null,
      notes:  notes.trim() || null,
      color:  color  || '#818cf8',
    }
    const scope = initialEvent
      ? (initialEvent.repeat ? editScope : null)
      : null
    onSave(data, scope)
    onClose()
  }

  const isEdit      = !!initialEvent
  const isRecurring = isEdit && !!initialEvent.repeat

  if (!open) return null

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-title">
            <CalendarDays size={15} style={{ color: 'var(--teal)' }} />
            <span>{isEdit ? 'Edit Reminder' : 'New Reminder'}</span>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={14} /></button>
        </div>

        <form onSubmit={handleSave} className="modal-body">
          {isRecurring && (
            <div className="modal-field modal-scope-wrap">
              <span className="modal-label">Edit</span>
              <div className="modal-scope-btns">
                <button type="button" className={`modal-scope-btn${editScope === 'one' ? ' modal-scope-active' : ''}`} onClick={() => setEditScope('one')}>This occurrence</button>
                <button type="button" className={`modal-scope-btn${editScope === 'all' ? ' modal-scope-active' : ''}`} onClick={() => setEditScope('all')}>All in series</button>
              </div>
            </div>
          )}

          <div className="modal-field">
            <label className="modal-label">Title</label>
            <input autoFocus className="ev-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="What's happening?" />
          </div>

          <div className="modal-row">
            <div className="modal-field" style={{ flex: 1 }}>
              <label className="modal-label">Date</label>
              <input type="date" className="ev-input" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="modal-field" style={{ width: 110 }}>
              <label className="modal-label"><Clock size={10} style={{ display: 'inline', marginRight: 3 }} />Time</label>
              <input type="time" className="ev-input" value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>

          {!(isRecurring && editScope === 'one') && (
            <div className="modal-field">
              <label className="modal-label"><RefreshCw size={10} style={{ display: 'inline', marginRight: 3 }} />Repeat</label>
              <select className="ev-input ev-select" value={repeat} onChange={e => setRepeat(e.target.value)}>
                {REPEAT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}

          <div className="modal-field">
            <div className="modal-color-header">
              <label className="modal-label"><Palette size={10} style={{ display: 'inline', marginRight: 3 }} />Color Tag</label>
              <span className="ev-color-preview-name" style={{ color }}>
                {EVENT_COLORS.find(c => c.hex.toLowerCase() === color.toLowerCase())?.label || 'Custom Color'}
              </span>
            </div>
            <div className="ev-color-swatches">
              {EVENT_COLORS.map(c => {
                const isSelected = color.toLowerCase() === c.hex.toLowerCase()
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`ev-color-swatch${isSelected ? ' selected' : ''}`}
                    style={{ backgroundColor: c.hex }}
                    onClick={() => setColor(c.hex)}
                    title={c.label}
                  >
                    {isSelected && <Check size={12} strokeWidth={3} color="#fff" />}
                  </button>
                )
              })}

              <label
                className={`ev-color-swatch ev-color-custom${!EVENT_COLORS.some(c => c.hex.toLowerCase() === color.toLowerCase()) ? ' selected' : ''}`}
                title="Custom color picker"
                style={!EVENT_COLORS.some(c => c.hex.toLowerCase() === color.toLowerCase()) ? { backgroundColor: color } : {}}
              >
                <input
                  type="color"
                  className="ev-color-native-input"
                  value={color.startsWith('#') && color.length === 7 ? color : '#818cf8'}
                  onChange={e => setColor(e.target.value)}
                />
                {!EVENT_COLORS.some(c => c.hex.toLowerCase() === color.toLowerCase()) ? (
                  <Check size={12} strokeWidth={3} color="#fff" />
                ) : (
                  <span className="ev-color-rainbow-icon">🎨</span>
                )}
              </label>
            </div>
          </div>

          <div className="modal-field">
            <label className="modal-label"><AlignLeft size={10} style={{ display: 'inline', marginRight: 3 }} />Notes</label>
            <textarea className="ev-input modal-textarea" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add a note, link, or description…" rows={3} />
          </div>

          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-btn-save" disabled={!title.trim()}>{isEdit ? 'Save Changes' : 'Save Reminder'}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

// ── Day popup ─────────────────────────────────────────────────────────────────
function DayPopup({ date, events, onClose, onAdd, onEdit, onDelete }) {
  const dayEvents = events.filter(e => e.date === date)

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog day-popup" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-title">
            <CalendarDays size={15} style={{ color: 'var(--teal)' }} />
            <span>{fmtDayLong(date)}</span>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="day-popup-body">
          {dayEvents.length === 0 ? (
            <p className="panel-empty day-popup-empty">No events this day</p>
          ) : (
            <div className="day-popup-list">
              {dayEvents.map(ev => (
                <div
                  key={ev.id}
                  className={`day-popup-row ${ev.type === 'holiday' ? 'ev-holiday' : 'ev-user'}`}
                  style={ev.color ? { borderLeftColor: ev.color } : {}}
                >
                  <span
                    className={`ev-dot ${ev.type === 'holiday' ? 'ev-dot-hol' : 'ev-dot-usr'}`}
                    style={ev.color ? { background: ev.color, boxShadow: `0 0 6px ${ev.color}88` } : {}}
                  />
                  <div className="day-popup-row-info">
                    <span className="day-popup-row-title">
                      {ev.title}
                      {ev.repeat && <span className="ev-recur-badge" title={REPEAT_LABELS[ev.repeat]}><RotateCcw size={9} /></span>}
                    </span>
                    {ev.time  && <span className="ev-time">{ev.time}</span>}
                    {ev.notes && <span className="day-popup-notes">{ev.notes}</span>}
                  </div>
                  {ev.flag && <span className="ev-flag">{ev.flag}</span>}
                  {ev.type === 'user' && (
                    <div className="ev-actions">
                      <button className="ev-edit" onClick={() => { onClose(); onEdit(ev) }} title="Edit"><Pencil size={9} /></button>
                      <button className="ev-del" onClick={() => onDelete(ev.id)} title="Delete"><X size={10} /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <button className="add-event-btn day-popup-add-btn" onClick={() => { onClose(); onAdd(date) }}>
            <Plus size={12} /> Add reminder
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Mini calendar ─────────────────────────────────────────────────────────────
function MiniCalendar({ year, month, events, onPrev, onNext, onDateClick, selectedDate }) {
  const firstDow = new Date(year, month, 1).getDay()
  const offset   = firstDow
  const daysInMo = new Date(year, month + 1, 0).getDate()
  const today    = new Date()
  const isThisMo = today.getFullYear() === year && today.getMonth() === month

  const byDay = {}
  const prefix = `${year}-${String(month+1).padStart(2,'0')}-`
  for (const e of events) {
    if (e.date.startsWith(prefix)) {
      const d = parseInt(e.date.slice(8))
      if (!byDay[d]) byDay[d] = []
      byDay[d].push(e)
    }
  }

  const cells = [...Array(offset).fill(null), ...Array.from({length: daysInMo}, (_,i) => i+1)]

  return (
    <div className="mini-cal">
      <div className="cal-nav">
        <button className="cal-nav-btn" onClick={onPrev}>‹</button>
        <span className="cal-month-label">{monthName(month)} {year}</span>
        <button className="cal-nav-btn" onClick={onNext}>›</button>
      </div>
      <div className="cal-grid">
        {weekdayInitials().map((d, i) => <div key={i} className="cal-header-cell">{d}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={`x-${i}`} />
          const isToday    = isThisMo && today.getDate() === day
          const dateStr    = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
          const isSelected = selectedDate === dateStr
          const dayEvents  = byDay[day] || []
          const hasHoliday = dayEvents.some(e => e.type === 'holiday')
          // Your events and Sonarr/Radarr releases, each in its own colour
          const userEvents = dayEvents.filter(e => e.type !== 'holiday')
          return (
            <div
              key={day}
              className={['cal-cell', isToday ? 'cal-today' : '', hasHoliday ? 'cal-has-hol' : '', isSelected ? 'cal-selected' : ''].filter(Boolean).join(' ')}
              onClick={() => onDateClick(dateStr)}
              title="Click to see events"
            >
              <span className="cal-day-num">{day}</span>
              <div className="cal-dots">
                {hasHoliday && <span className="cdot cdot-hol" />}
                {userEvents.slice(0, 3).map((e, idx) => (
                  <span
                    key={e.id || idx}
                    className="cdot"
                    style={{ background: e.color || '#818cf8', boxShadow: `0 0 3px ${e.color || '#818cf8'}88` }}
                    title={e.title}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Upcoming list ─────────────────────────────────────────────────────────────
// Same-day releases collapse into one row so a busy TV night doesn't push your
// own events out of the list
function groupReleases(events) {
  const out = [], byDate = {}
  for (const e of events) {
    if (e.type !== 'release') { out.push(e); continue }
    const g = byDate[e.date]
    if (!g) { byDate[e.date] = { ...e, items: [e] }; out.push(byDate[e.date]); continue }
    g.items.push(e)
    g.id = `releases-${e.date}`
    g.title = `${g.items.length} releases`
    g.notes = g.items.map(i => i.title).join(' · ')
    g.time = null
    if (g.items.some(i => i.source !== g.items[0].source)) { g.flag = '🎞️'; g.color = '#94a3b8' }
  }
  return out
}

function UpcomingList({ events, onDelete, onEdit }) {
  const today = todayStr()
  const upcoming = groupReleases([...events]
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time||'').localeCompare(b.time||'')))
    .slice(0, 5)

  if (upcoming.length === 0) {
    return <p className="panel-empty" style={{ padding: '8px 0' }}>No upcoming events</p>
  }

  return (
    <div className="upcoming-list">
      {upcoming.map(ev => {
        const days  = daysUntil(ev.date)
        const label = days === 0 ? relDay(0) : days === 1 ? relDay(1) : fmtDate(ev.date)
        const isNear = days >= 0 && days <= 3
        return (
          <div
            key={ev.id}
            className={['upcoming-row', ev.type === 'holiday' ? 'ev-holiday' : 'ev-user', isNear && days > 0 ? 'ev-near' : ''].filter(Boolean).join(' ')}
            style={ev.color ? { borderLeftColor: ev.color } : {}}
          >
            <div className="ev-meta">
              <span className="ev-label">{label}</span>
              {ev.time && <span className="ev-time">{ev.time}</span>}
            </div>
            <span
              className={`ev-dot ${ev.type === 'holiday' ? 'ev-dot-hol' : 'ev-dot-usr'}`}
              style={ev.color ? { background: ev.color, boxShadow: `0 0 6px ${ev.color}88` } : {}}
            />
            <span className="ev-title" title={ev.notes || undefined}>
              {ev.title}
              {ev.repeat && <span className="ev-recur-badge" title={REPEAT_LABELS[ev.repeat]}><RotateCcw size={9} /></span>}
            </span>
            {ev.flag && <span className="ev-flag">{ev.flag}</span>}
            {ev.type === 'user' && (
              <div className="ev-actions">
                <button className="ev-edit" onClick={() => onEdit(ev)} title="Edit"><Pencil size={9} /></button>
                <button className="ev-del" onClick={() => onDelete(ev.id)} title="Delete"><X size={10} /></button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function AgendaPanel({ events, onAdd, onDelete, onEdit, onEditOccurrence, externalNewTitle, onExternalNewConsumed, onExternalNewSaved }) {
  const now = new Date()
  const [year,            setYear]            = useState(now.getFullYear())
  const [month,           setMonth]           = useState(now.getMonth())
  const [modalOpen,       setModalOpen]       = useState(false)
  const [editingEvent,    setEditingEvent]    = useState(null)
  const [modalDate,       setModalDate]       = useState(null)
  const [modalTitle,      setModalTitle]      = useState(null)
  const [modalFromTodo,   setModalFromTodo]   = useState(false)
  const [dayPopupDate,    setDayPopupDate]    = useState(null)

  useEffect(() => {
    if (!externalNewTitle) return
    setEditingEvent(null)
    setModalDate(null)
    setModalTitle(externalNewTitle)
    setModalFromTodo(true)
    setModalOpen(true)
    onExternalNewConsumed?.()
  }, [externalNewTitle])

  const navigate = (dir) => {
    let m = month + dir, y = year
    if (m < 0)  { m = 11; y-- }
    if (m > 11) { m = 0;  y++ }
    setMonth(m); setYear(y)
  }

  const openNew = (date = null) => {
    setEditingEvent(null)
    setModalDate(date)
    setModalTitle(null)
    setModalFromTodo(false)
    setModalOpen(true)
  }

  const openEdit = (ev) => {
    setEditingEvent(ev)
    setModalDate(null)
    setModalOpen(true)
  }

  const handleClose = () => {
    setModalOpen(false)
    setEditingEvent(null)
    setModalDate(null)
    setModalTitle(null)
    setModalFromTodo(false)
  }

  const handleSave = (data, scope) => {
    if (!editingEvent) {
      onAdd(data)
      if (modalFromTodo) onExternalNewSaved?.()
    } else if (scope === 'one') {
      onEditOccurrence(templateId(editingEvent.id), editingEvent.date, data)
    } else {
      onEdit(templateId(editingEvent.id), data)
    }
  }

  const handleDateClick = (dateStr) => {
    setDayPopupDate(dateStr)
  }

  return (
    <div className="glass-card agenda-panel">
      <div className="panel-header">
        <div className="panel-icon" style={{ background: 'rgba(45,212,191,0.12)', borderColor: 'rgba(45,212,191,0.25)' }}>
          <CalendarDays size={16} style={{ color: 'var(--teal)' }} />
        </div>
        <h3 className="panel-title">Agenda</h3>
        <button
          className="cal-today-btn"
          onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}
          disabled={year === now.getFullYear() && month === now.getMonth()}
          title="Go to today"
        >
          Today
        </button>
      </div>

      <div className="agenda-body">
        <MiniCalendar
          year={year} month={month} events={events}
          onPrev={() => navigate(-1)} onNext={() => navigate(1)}
          onDateClick={handleDateClick}
          selectedDate={dayPopupDate}
        />
        <div className="agenda-right">
          <UpcomingList events={events} onDelete={onDelete} onEdit={openEdit} />
          <button className="add-event-btn" onClick={() => openNew()}>
            <Plus size={12} /> Add reminder
          </button>
        </div>
      </div>

      {dayPopupDate && (
        <DayPopup
          date={dayPopupDate}
          events={events}
          onClose={() => setDayPopupDate(null)}
          onAdd={(date) => { setDayPopupDate(null); openNew(date) }}
          onEdit={(ev)  => { setDayPopupDate(null); openEdit(ev) }}
          onDelete={(id) => { onDelete(id) }}
        />
      )}

      <EventModal
        open={modalOpen}
        initialEvent={editingEvent}
        defaultDate={modalDate}
        defaultTitle={modalTitle}
        onClose={handleClose}
        onSave={handleSave}
      />
    </div>
  )
}
