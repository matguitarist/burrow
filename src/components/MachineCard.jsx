import { useState } from 'react'
import { Server, Monitor, Cpu, Activity, Power, HardDrive, ArrowDown, ArrowUp, Thermometer, Clock, Laptop, Terminal, Box, ChevronDown, ChevronRight } from 'lucide-react'
import ServiceItem from './ServiceItem.jsx'
import ContainerList, { isRunning } from './ContainerList.jsx'
import StatGauge from './StatGauge.jsx'
import Sparkline from './Sparkline.jsx'

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

  return (
    <div className="glass-card machine-card">
      <div className="card-accent-line" style={{ background: machine.accent }} />

      {/* Header */}
      <div className="machine-header">
        <div className="machine-icon-wrap"
          style={{ color: machine.accent, borderColor: `${machine.accent}30`, background: `${machine.accent}12` }}>
          <Icon size={18} />
        </div>
        <div className="machine-info">
          <h2 className="machine-name">{machine.name}</h2>
          <span className="machine-ip">{machine.ip}</span>
          {uptimeStr && <span className="machine-uptime"><Clock size={9} />{uptimeStr}</span>}
        </div>
        <div className="machine-header-right">
          <button
            className="ssh-btn"
            onClick={onOpenTerminal}
            title={`Open terminal — ${sshCmd}`}
          >
            <Terminal size={11} />
          </button>
          {!!machine.mac && (
            <button
              className={`wol-btn wol-${wolState || 'idle'} ${!isAnyOnline ? 'wol-highlighted' : ''}`}
              onClick={handleWoL}
              disabled={wolState === 'sending'}
              title={wolMsg || (isAnyOnline ? 'Wake on LAN' : 'Machine is offline — Wake on LAN')}
            >
              <Power size={11} />
              {wolState === 'ok'      && <span>Sent</span>}
              {wolState === 'error'   && <span>Error</span>}
              {wolState === 'sending' && <span>…</span>}
            </button>
          )}
          <span className={`dot dot-${isAnyOnline ? 'online' : 'offline'}`} style={{ width: 10, height: 10 }} />
        </div>
      </div>

      {/* System stats */}
      {hasGlances ? (
        <div className="stats-box">
          <div className="gauges-row">
            <StatGauge value={cpu.total ?? 0}   label="CPU"  color={machine.accent} />
            <StatGauge value={mem?.percent ?? 0} label="RAM"  color="#818cf8" />
            {diskPct != null && <StatGauge value={diskPct} label="Disk" color="#f59e0b" />}
          </div>
          <div className="spark-row">
            <span className="spark-label"><Activity size={9} /> CPU (30 samples)</span>
            <Sparkline data={cpuHistory} color={machine.accent} width={160} height={28} />
          </div>
          <div className="stats-meta-row">
            {mem && <span className="mem-line">{fmtBytes(mem.used)} / {fmtBytes(mem.total)} RAM</span>}
            {cpuTemp != null && (
              <span className="temp-pill">
                <Thermometer size={9} />
                {cpuTemp.toFixed(0)}°C
              </span>
            )}
          </div>
          {netStats && (
            <div className="net-row">
              <span className="net-stat"><ArrowDown size={9} style={{ color: '#34d399' }} />{fmtNet(netStats.rx)}</span>
              <span className="net-stat"><ArrowUp   size={9} style={{ color: '#f472b6' }} />{fmtNet(netStats.tx)}</span>
            </div>
          )}
        </div>
      ) : pingStatus?.online === false ? (
        <p className="panel-empty">{machine.mac ? 'Offline — use the power button to wake it' : 'Offline'}</p>
      ) : !noStats && cpu !== undefined && !hasGlances ? (
        <div className="glances-hint">
          <Activity size={13} style={{ opacity: 0.5 }} />
          <span>Enable system stats — install Glances:</span>
          <code>pip install glances[web] &amp;&amp; glances -w</code>
        </div>
      ) : null}

      {/* Services */}
      <div className="services-section">
        {services.map(svc => <ServiceItem key={svc.id} service={svc} />)}
      </div>

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
