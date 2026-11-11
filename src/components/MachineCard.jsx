import { useState } from 'react'
import { Server, Monitor, Cpu, Activity, Power, HardDrive, ArrowDown, ArrowUp, Thermometer, Clock, Laptop, Terminal, Box, ChevronDown, ChevronRight } from 'lucide-react'
import ServiceItem from './ServiceItem.jsx'
import ContainerList, { isRunning } from './ContainerList.jsx'
import Sparkline from './Sparkline.jsx'

// One resource as a thin bar. Color only says something when it should: high, then critical.
function Meter({ label, value, detail }) {
  const pct = Math.min(Math.max(Math.round(value), 0), 100)
  const level = pct >= 90 ? 'crit' : pct >= 75 ? 'high' : ''
  return (
    <div className={`meter ${level}`} title={detail || undefined}>
      <span className="meter-label">{label}</span>
      <span className="meter-track"><span className="meter-fill" style={{ width: `${pct}%` }} /></span>
      <span className="meter-value">{pct}%</span>
    </div>
  )
}

const ICONS = { server: Server, monitor: Monitor, cpu: Cpu, laptop: Laptop, mac: Laptop }

function fmtBytes(bytes) {
  if (!bytes) return '—'
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

function fmtSize(bytes) {
  if (!bytes) return ''
  const gb = bytes / 1024 ** 3
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`
}

function fmtNet(bps) {
  if (!bps && bps !== 0) return '—'
  if (bps < 1024)             return `${bps} B/s`
  if (bps < 1024 * 1024)     return `${(bps / 1024).toFixed(0)} KB/s`
  return `${(bps / 1024 / 1024).toFixed(1)} MB/s`
}

function fmtUptime(raw) {
  if (!raw || typeof raw !== 'string') return null
  // Glances returns e.g. "3 days, 4:12:07" or "0 day, 1:05:22"
  const dayMatch = raw.match(/(\d+)\s+days?/)
  const timeMatch = raw.match(/(\d+):(\d+):\d+/)
  const days = dayMatch ? parseInt(dayMatch[1]) : 0
  const hrs  = timeMatch ? parseInt(timeMatch[1]) : 0
  if (days > 0)  return `up ${days}d ${hrs}h`
  if (hrs > 0)   return `up ${hrs}h ${timeMatch ? timeMatch[2] : 0}m`
  return `up ${timeMatch ? timeMatch[2] : 0}m`
}

function getNetStats(network) {
  if (!network || network.error) return null
  const ifaces = Array.isArray(network) ? network : [network]
  const main = ifaces.find(n =>
    n.is_up && !['lo', 'lo0'].includes(n.interface_name) &&
    !n.interface_name.startsWith('docker') && !n.interface_name.startsWith('br-') &&
    !n.interface_name.startsWith('veth')
  ) || ifaces.find(n => n.is_up) || ifaces[0]
  if (!main) return null
  return {
    rx: main.bytes_recv_rate_per_sec ?? main.rx ?? 0,
    tx: main.bytes_sent_rate_per_sec ?? main.tx ?? 0,
  }
}

function getCpuTemp(sensors) {
  if (!sensors || sensors.error) return null
  const arr = Array.isArray(sensors) ? sensors : []
  const core = arr.find(s => s.type === 'temperature_core' || /cpu|core|package/i.test(s.label))
  return core?.value ?? null
}

function fmtDiskPct(fs) {
  if (!fs) return null
  const arr = Array.isArray(fs) ? fs : [fs]
  const main = arr.find(d => d.mnt_point === '/' || d.device_name?.includes('sda') || d.key === 'total') || arr[0]
  if (!main) return null
  return Math.round((main.used / main.size) * 100)
}

export default function MachineCard({ machine, services, glances, cpuHistory, docker, models, running, pingStatus, noStats, onOpenTerminal, onChanged }) {
  const Icon = ICONS[machine.icon] || Server
  const { cpu, mem, fs, network, sensors, uptime } = glances
  const hasGlances  = !!(cpu && !cpu.error)
  const diskPct     = fmtDiskPct(fs)
  const netStats    = getNetStats(network)
  const cpuTemp     = getCpuTemp(sensors)
  const uptimeStr   = fmtUptime(typeof uptime === 'string' ? uptime : uptime?.seconds != null
    ? (() => { const s = uptime.seconds; const d = Math.floor(s/86400); const h = Math.floor((s%86400)/3600); const m = Math.floor((s%3600)/60); return d > 0 ? `${d} days, ${h}:${String(m).padStart(2,'0')}:00` : `${h}:${String(m).padStart(2,'0')}:00` })()
    : null)
  const isAnyOnline = services.some(s => s.status?.online) || pingStatus?.online === true

  const [wolState,       setWolState]       = useState(null)
  const [wolMsg,         setWolMsg]         = useState('')
  const [dockerExpanded, setDockerExpanded] = useState(false)

  const sshTarget = machine.sshUser ? `${machine.sshUser}@${machine.ip}` : machine.ip
  const sshCmd    = `ssh ${sshTarget}`

  const handleWoL = async () => {
    setWolState('sending'); setWolMsg('')
    try {
      const res  = await fetch(`/api/wol/${machine.id}`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) { setWolState('ok'); setWolMsg('Magic packet sent') }
      else         { setWolState('error'); setWolMsg(data.error || 'Failed') }
    } catch { setWolState('error'); setWolMsg('Network error') }
    setTimeout(() => { setWolState(null); setWolMsg('') }, 3500)
  }

  // Unknown until the first status poll answers: don't flash "Offline"
  const known   = pingStatus != null || services.some(svc => svc.status)
  const offline = !isAnyOnline && pingStatus?.online === false
  const tempHot = cpuTemp != null && cpuTemp >= 80

  return (
    <div className={`glass-card machine-card${offline ? ' is-offline' : ''}`}>
      {/* Header: identity on the left, state on the right. Actions show on hover. */}
      <div className="machine-header">
        <div className="machine-icon-wrap" style={{ color: machine.accent }}>
          <Icon size={17} />
        </div>
        <div className="machine-info">
          <h2 className="machine-name">{machine.name}</h2>
          <span className="machine-meta">{machine.ip}</span>
        </div>
        <div className="machine-actions">
          <button className="ssh-btn" onClick={onOpenTerminal} title={`Open terminal — ${sshCmd}`} aria-label="Open terminal">
            <Terminal size={13} />
          </button>
          {!!machine.mac && !offline && (
            <button className={`wol-btn wol-${wolState || 'idle'}`} onClick={handleWoL}
              disabled={wolState === 'sending'} title={wolMsg || 'Wake on LAN'} aria-label="Wake on LAN">
              <Power size={13} />
            </button>
          )}
        </div>
        <span className={`state-pill ${isAnyOnline ? 'ok' : known ? 'down' : ''}`}>
          <span className="state-dot" />{isAnyOnline ? 'Online' : known ? 'Offline' : 'Checking…'}
        </span>
      </div>

      {/* System stats */}
      {hasGlances ? (
        <div className="machine-stats">
          <Meter label="CPU"  value={cpu.total ?? 0} />
          <Meter label="RAM"  value={mem?.percent ?? 0} detail={mem ? `${fmtBytes(mem.used)} of ${fmtBytes(mem.total)}` : null} />
          {diskPct != null && <Meter label="Disk" value={diskPct} />}
          {cpuHistory.length > 1 && (
            <div className="machine-spark" title="CPU, last 30 samples">
              <Sparkline data={cpuHistory} color="var(--accent)" width={300} height={30} max={100} />
            </div>
          )}
          {(cpuTemp != null || netStats || uptimeStr) && (
            <div className="machine-foot">
              <span className="machine-foot-group">
                {uptimeStr && <span><Clock size={11} />{uptimeStr.replace(/^up /, '')}</span>}
                {cpuTemp != null && (
                  <span className={tempHot ? 'hot' : ''}><Thermometer size={11} />{cpuTemp.toFixed(0)}°C</span>
                )}
              </span>
              {netStats && (
                <span><ArrowDown size={11} />{fmtNet(netStats.rx)}<ArrowUp size={11} />{fmtNet(netStats.tx)}</span>
              )}
            </div>
          )}
        </div>
      ) : offline ? (
        machine.mac && (
          <button className={`wake-btn wol-${wolState || 'idle'}`} onClick={handleWoL} disabled={wolState === 'sending'}>
            <Power size={13} />
            {wolState === 'sending' ? 'Waking…' : wolState === 'ok' ? 'Magic packet sent' : wolState === 'error' ? (wolMsg || 'Couldn’t wake it') : 'Wake'}
          </button>
        )
      ) : !noStats && cpu !== undefined && !hasGlances ? (
        <p className="glances-hint" title="pip install glances[web] && glances -w">
          <Activity size={13} />
          No system stats. Run Glances on this machine to see CPU, memory and disk.
        </p>
      ) : null}

      {/* Services */}
      {services.length > 0 && <div className="services-section">
        {services.map(svc => <ServiceItem key={svc.id} service={svc} />)}
      </div>}

      {/* Docker containers */}
      {docker && docker.length > 0 && (
        <div className="card-docker-section">
          <button
            className="card-docker-toggle"
            onClick={() => setDockerExpanded(e => !e)}
          >
            <Box size={10} />
            <span>{docker.length} container{docker.length !== 1 ? 's' : ''}</span>
            <span className="docker-running-count">
              {docker.filter(isRunning).length} running
            </span>
            {dockerExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </button>
          {dockerExpanded && <ContainerList device={machine} containers={docker} onChanged={onChanged} />}
        </div>
      )}

      {/* Ollama models */}
      {models && models.length > 0 && (
        <div className="card-models-section">
          <div className="card-models-label">
            <HardDrive size={10} />
            <span>{models.length} model{models.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="card-models-list">
            {models.map(m => {
              const [base, tag] = m.name.split(':')
              const shortName  = base.split('/').pop()
              const isActive   = (running || []).some(r => r.name === m.name)
              return (
                <div key={m.name} className="card-model-row">
                  <span className={`card-model-dot${isActive ? ' card-model-active' : ''}`} />
                  <span className="card-model-name">{shortName}</span>
                  {tag && tag !== 'latest' && <span className="card-model-tag">{tag}</span>}
                  {m.size > 0 && <span className="card-model-size">{fmtSize(m.size)}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
