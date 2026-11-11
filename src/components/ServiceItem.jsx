import { ExternalLink } from 'lucide-react'

function fmtUptime(since, online) {
  if (!since) return null
  const ms = Date.now() - new Date(since).getTime()
  if (ms < 90_000) return null   // skip first ~90s — avoid showing "0m"
  const m = Math.floor(ms / 60_000) % 60
  const h = Math.floor(ms / 3_600_000) % 24
  const d = Math.floor(ms / 86_400_000)
  if (!online) {
    if (h > 0) return `↓ ${h}h ${m}m`
    return `↓ ${m}m`
  }
  if (d > 0) return `↑ ${d}d ${h}h`
  if (h > 0) return `↑ ${h}h ${m}m`
  return `↑ ${m}m`
}

export default function ServiceItem({ service }) {
  const online  = service.status?.online
  const state   = online === true ? 'online' : online === false ? 'offline' : 'unknown'
  // Uptime is noise when everything is fine: show it only when down, or up for less than a day
  const recent  = service.since && Date.now() - new Date(service.since).getTime() < 86_400_000
  const uptime  = state === 'offline' || (state === 'online' && recent) ? fmtUptime(service.since, online) : null

  return (
    <div className={`service-row ${state}`}>
      <span className={`dot dot-${state}`} />
      <span className="svc-name">{service.name}</span>
      {uptime && <span className={`svc-uptime ${state}`}>{uptime}</span>}
      {service.extra && <span className="svc-extra">{service.extra}</span>}
      {service.url && (
        <a href={service.url} target="_blank" rel="noopener noreferrer" className="svc-link"
          title={`Open ${service.name}`} aria-label={`Open ${service.name}`}>
          <ExternalLink size={12} />
        </a>
      )}
    </div>
  )
}
