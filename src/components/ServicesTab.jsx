import { ExternalLink, Server, Globe } from 'lucide-react'

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

function ServiceCard({ svc, status, url }) {
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
      </div>
    </div>
  )
}

const OTHER_GROUP = { id: '__other', name: 'Other hosts', accent: '#94a3b8', Icon: Globe }

export default function ServicesTab({ services, serviceList, machines }) {
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
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
