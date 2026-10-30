import { useState, useEffect } from 'react'
import { Activity, CalendarDays, Tag, CircleCheck } from 'lucide-react'
import { IncidentLog } from './ServicesTab.jsx'
import { loc } from '../locale.js'

// Compact health summary: counts plus whatever is down right now
function HealthWidget({ health, serviceList, machines }) {
  const watched = serviceList.filter(s => !s.cloud)
  const items = [
    ...watched.map(s => ({ id: s.id, name: s.name, color: s.color, h: health[s.id] })),
    ...machines.map(m => ({ id: `device_${m.id}`, name: m.name, color: m.accent, h: health[`device_${m.id}`] })),
  ].filter(i => i.h)
  const down = items.filter(i => !i.h.online)
  const svcUp = watched.filter(s => health[s.id]?.online).length

  return (
    <div className="glass-card home-health">
      <div className="panel-header"><Activity size={14} /><span>Health</span></div>
      <div className="home-health-stats">
        <div><span className="home-big" style={{ color: svcUp === watched.length ? '#34d399' : '#fbbf24' }}>{items.length ? `${svcUp}/${watched.length}` : '–'}</span><span className="home-small">services up</span></div>
        <div><span className="home-big" style={{ color: down.length ? '#f87171' : '#34d399' }}>{items.length ? down.length : '–'}</span><span className="home-small">down</span></div>
      </div>
      {items.length === 0
        ? <p className="home-small">Checking…</p>
        : down.length === 0
        ? <p className="home-ok"><CircleCheck size={13} /> Everything is up</p>
        : <div className="home-down-list">
            {down.map(i => (
              <div key={i.id} className="home-down-row">
                <span className="incident-dot" style={{ background: '#f87171' }} />
                <span>{i.name}</span>
                <span className="home-small">since {new Date(i.h.since).toLocaleString(loc(), { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>}
    </div>
  )
}

// Your events and Sonarr/Radarr releases for the next 7 days
function UpcomingWidget({ events }) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const end = new Date(today); end.setDate(end.getDate() + 7)
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const list = events
    .filter(e => e.date >= iso(today) && e.date < iso(end))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
    .slice(0, 12)
  const dayLabel = date => new Date(date + 'T00:00').toLocaleDateString(loc(), { weekday: 'short', day: 'numeric' })

  return (
    <div className="glass-card">
      <div className="panel-header"><CalendarDays size={14} /><span>Next 7 days</span></div>
      {list.length === 0
        ? <p className="panel-empty">Nothing planned this week.</p>
        : <div className="home-list">
            {list.map(e => (
              <div key={e.id} className="home-list-row">
                <span className="home-list-when">{dayLabel(e.date)}{e.time ? ` ${e.time}` : ''}</span>
                <span className="ev-dot" style={{ background: e.color || (e.type === 'holiday' ? '#f87171' : '#818cf8') }} />
                <span className="home-list-title" title={e.notes || undefined}>{e.title}</span>
                {e.flag && <span className="ev-flag">{e.flag}</span>}
              </div>
            ))}
          </div>}
    </div>
  )
}

function DealsWidget({ games, onOpenGame }) {
  const deals = games.filter(g => g.onSale).sort((a, b) => (b.discountPct || 0) - (a.discountPct || 0)).slice(0, 8)
  return (
    <div className="glass-card">
      <div className="panel-header"><Tag size={14} /><span>On sale</span></div>
      {deals.length === 0
        ? <p className="panel-empty">No wishlist games on sale right now.</p>
        : <div className="home-list">
            {deals.map(g => (
              <button key={g.appid} type="button" className="home-list-row home-list-btn" onClick={() => onOpenGame(g.appid)}>
                <span className="games-sale">-{g.discountPct}%</span>
                <span className="home-list-title">{g.title}</span>
                <span className="home-small">{g.price}</span>
              </button>
            ))}
          </div>}
    </div>
  )
}

function IncidentsWidget({ nameOf }) {
  const [uptime, setUptime] = useState({})
  useEffect(() => {
    fetch('/api/uptime').then(r => r.json()).then(setUptime).catch(() => {})
  }, [])
  return <IncidentLog uptime={uptime} nameOf={nameOf} />
}

// Widgets that span both columns
const WIDE = new Set(['machines', 'news', 'recent', 'ondeck'])

// widgets: ids in order. render: { id: () => element } for panels that live
// elsewhere in the app (machines, now playing, downloads, requests, news).
export default function HomeTab({ widgets, render, health, serviceList, machines, events, games, onOpenGame }) {
  const nameOf = id => id.startsWith('device_')
    ? machines.find(m => `device_${m.id}` === id)?.name ?? id
    : serviceList.find(s => s.id === id)?.name ?? id

  const widget = id => {
    switch (id) {
      case 'health':    return <HealthWidget health={health} serviceList={serviceList} machines={machines} />
      case 'upcoming':  return <UpcomingWidget events={events} />
      case 'deals':     return <DealsWidget games={games} onOpenGame={onOpenGame} />
      case 'incidents': return <IncidentsWidget nameOf={nameOf} />
      default:          return render[id]?.() ?? null
    }
  }

  return (
    <div className="home-grid">
      {widgets.map(id => (
        <div key={id} className={`home-cell${WIDE.has(id) ? ' home-wide' : ''}`}>{widget(id)}</div>
      ))}
    </div>
  )
}
