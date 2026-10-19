import { useState, useEffect } from 'react'
import { ExternalLink, Server, Globe, History } from 'lucide-react'
import { loc } from '../locale.js'

function fmtDuration(since) {
  if (!since) return null
  const ms = Date.now() - new Date(since).getTime()
  if (ms < 0) return null
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0)  return `${d}d ${h % 24}h`
  if (h > 0)  return `${h}h ${m % 60}m`
  if (m > 0)  return `${m}m`
  return 'just now'
}

// "1h 12m" between two ISO times (end defaults to now)
function fmtSpan(start, end) {
  const ms = (end ? new Date(end) : new Date()) - new Date(start)
  const m = Math.max(1, Math.round(ms / 60000)), h = Math.floor(m / 60), d = Math.floor(h / 24)
  return d > 0 ? `${d}d ${h % 24}h` : h > 0 ? `${h}h ${m % 60}m` : `${m}m`
}

const barColor = pct => pct >= 99.9 ? '#34d399' : pct >= 99 ? '#a3e635' : pct >= 95 ? '#fbbf24' : '#f87171'

// Last 7 days, one segment per day (oldest first)
function UptimeBar({ uptime }) {
  if (!uptime) return null
  return (
    <div className="svc-uptime" title={`${uptime.uptime7d}% over 7 days · ${uptime.uptime24h}% last 24h`}>
      <div className="svc-uptime-bar">
        {uptime.days.map(d => (
          <span key={d.date} style={{ background: barColor(d.uptime) }} title={`${d.date}: ${d.uptime}%`} />
        ))}
      </div>
      <span className="svc-uptime-pct">{uptime.uptime7d}%</span>
    </div>
  )
}

function ServiceCard({ svc, status, url, uptime }) {
  const online   = status?.online === true
  const duration = fmtDuration(status?.since)

  return (
    <div className={`svc-card${online ? ' svc-online' : ' svc-offline'}`}>
      <span className="svc-dot" style={{ background: online ? svc.color : 'rgba(255,255,255,0.15)' }} />
      <div className="svc-body">
        <div className="svc-name-row">
          <span className="svc-name">{svc.name}</span>
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="svc-link" title="Open">
              <ExternalLink size={10} />
            </a>
          )}
        </div>
        <span className="svc-status">
          {online
            ? (duration ? `up ${duration}` : 'online')
            : (duration ? `down ${duration}` : 'offline')}
        </span>
        <UptimeBar uptime={uptime} />
      </div>
    </div>
  )
}

const OTHER_GROUP = { id: '__other', name: 'Other hosts', accent: '#94a3b8', Icon: Globe }

// Outages across all services and devices, newest first
function IncidentLog({ uptime, nameOf }) {
  const all = Object.entries(uptime)
    .flatMap(([id, u]) => u.incidents.map(i => ({ ...i, id })))
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, 12)
  return (
    <div className="glass-card incident-log">
      <div className="panel-header"><History size={14} /><span>Recent incidents</span></div>
      {all.length === 0
        ? <p className="panel-empty">No outages recorded in the last 30 days.</p>
        : all.map(i => (
          <div key={i.id + i.start} className={`incident-row${i.end ? '' : ' incident-open'}`}>
            <span className="incident-dot" />
            <span className="incident-name">{nameOf(i.id)}</span>
            <span className="incident-when">
              {new Date(i.start).toLocaleString(loc(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="incident-dur">{i.end ? fmtSpan(i.start, i.end) : `ongoing · ${fmtSpan(i.start)}`}</span>
          </div>
        ))}
    </div>
  )
}

export default function ServicesTab({ services, serviceList, machines }) {
  const [uptime, setUptime] = useState({})
  useEffect(() => {
    const load = () => fetch('/api/uptime').then(r => r.json()).then(setUptime).catch(() => {})
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [])

  const nameOf = id => id.startsWith('device_')
    ? machines.find(m => `device_${m.id}` === id)?.name ?? id
    : serviceList.find(s => s.id === id)?.name ?? id

  // Cloud accounts (Steam) have no health check, so they don't count here
  const watched     = serviceList.filter(s => !s.cloud)
  const onlineCount = watched.filter(s => services[s.id]?.online).length
  const totalCount  = watched.length

  // Services on a known device group under it; custom hosts go in "Other hosts"
  const machineIds = new Set(machines.map(m => m.id))
  const byMachine = {}
  for (const svc of watched) {
    const key = machineIds.has(svc.machine) ? svc.machine : OTHER_GROUP.id
    ;(byMachine[key] ??= []).push(svc)
  }

  const sortedMachines = [...machines, OTHER_GROUP].filter(m => byMachine[m.id]?.length > 0)

  return (
    <div className="services-tab">
      <div className="glass-card services-summary-card">
        <div className="services-summary-row">
          <div className="services-summary-stat">
            <span className="services-summary-num" style={{ color: onlineCount === totalCount ? '#34d399' : onlineCount > 0 ? '#fbbf24' : '#f87171' }}>
              {onlineCount}
            </span>
            <span className="services-summary-label">online</span>
          </div>
          <div className="services-summary-divider" />
          <div className="services-summary-stat">
            <span className="services-summary-num" style={{ color: '#f87171' }}>
              {totalCount - onlineCount}
            </span>
            <span className="services-summary-label">offline</span>
          </div>
          <div className="services-summary-divider" />
          <div className="services-summary-stat">
            <span className="services-summary-num">{totalCount}</span>
            <span className="services-summary-label">total</span>
          </div>
        </div>

        <div className="services-health-bar">
          <div
            className="services-health-fill"
            style={{ width: `${totalCount > 0 ? (onlineCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      </div>

      {sortedMachines.map(machine => {
        const svcs       = byMachine[machine.id] || []
        const machOnline = svcs.filter(s => services[s.id]?.online).length

        return (
          <div key={machine.id} className="services-machine-group">
            <div className="services-machine-header">
              {machine.Icon ? <machine.Icon size={11} style={{ color: machine.accent }} /> : <Server size={11} style={{ color: machine.accent }} />}
              <span className="services-machine-name" style={{ color: machine.accent }}>
                {machine.name}
              </span>
              <span className="services-machine-count">
                {machOnline}/{svcs.length}
              </span>
            </div>
            <div className="services-cards-grid">
              {svcs.map(svc => (
                <ServiceCard
                  key={svc.id}
                  svc={svc}
                  status={services[svc.id]}
                  url={svc.url}
                  uptime={uptime[svc.id]}
                />
              ))}
            </div>
          </div>
        )
      })}
      <IncidentLog uptime={uptime} nameOf={nameOf} />
    </div>
  )
}
