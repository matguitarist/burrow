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
  const uptime  = fmtUptime(service.since, online)

  return (
    <div className="service-row">
      <span className={`dot dot-${state}`} />
      <span
        className="svc-name"
        style={{
          color: state === 'online'
            ? service.color || 'rgba(255,255,255,0.9)'
            : state === 'offline'
            ? 'rgba(255,255,255,0.3)'
            : 'rgba(255,255,255,0.5)',
        }}
      >
        {service.name}
      </span>
      {uptime && (
        <span className={`svc-uptime ${state}`}>{uptime}</span>
      )}
      {service.extra && <span className="svc-extra">{service.extra}</span>}
      {service.url && (
        <a href={service.url} target="_blank" rel="noopener noreferrer" className="svc-link">
          <ExternalLink size={11} />
        </a>
      )}
    </div>
  )
}
