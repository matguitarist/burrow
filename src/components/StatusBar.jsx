import { Cpu, MemoryStick, Activity, Download } from 'lucide-react'

function MiniBar({ pct, color }) {
  return (
    <div className="sb-bar-track">
      <div className="sb-bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  )
}

function fmtMB(bytes) {
  if (!bytes) return '0 MB'
  const mb = bytes / 1048576
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  return `${mb.toFixed(1)} MB`
}

function cpuColor(pct) {
  if (pct >= 60) return '#f87171'
  if (pct >= 30) return '#fbbf24'
  return '#34d399'
}
function ramColor(pct) {
  if (pct >= 80) return '#f87171'
  if (pct >= 50) return '#fbbf24'
  return '#60a5fa'
}

export default function StatusBar({ system, servicesOnline, servicesTotal, queueTotal }) {
  const proc = system?.process ?? null

  const heapPct = proc ? Math.round(proc.heapUsed / proc.heapTotal * 100) : 0

  return (
    <div className="status-bar">

      {/* Node process CPU */}
      <div className="sb-stat">
        <Cpu size={11} className="sb-icon" />
        <span className="sb-label">Node</span>
        {proc !== null ? (
          <>
            <MiniBar pct={proc.cpu} color={cpuColor(proc.cpu)} />
            <span className="sb-val" style={{ color: cpuColor(proc.cpu) }}>{proc.cpu}%</span>
          </>
        ) : (
          <span className="sb-val sb-dim">—</span>
        )}
      </div>

      <div className="sb-divider" />

      {/* RSS (physical RAM used by the process) */}
      <div className="sb-stat">
        <MemoryStick size={11} className="sb-icon" />
        <span className="sb-label">RSS</span>
        {proc ? (
          <span className="sb-val" style={{ color: '#60a5fa' }}>{fmtMB(proc.rss)}</span>
        ) : (
          <span className="sb-val sb-dim">—</span>
        )}
      </div>

      <div className="sb-divider" />

      {/* JS Heap */}
      <div className="sb-stat">
        <span className="sb-label">Heap</span>
        {proc ? (
          <>
            <MiniBar pct={heapPct} color={ramColor(heapPct)} />
            <span className="sb-val" style={{ color: ramColor(heapPct) }}>
              {fmtMB(proc.heapUsed)}
              <span className="sb-dim"> / {fmtMB(proc.heapTotal)}</span>
            </span>
          </>
        ) : (
          <span className="sb-val sb-dim">—</span>
        )}
      </div>

      <div className="sb-divider" />

      {/* Services */}
      <div className="sb-stat">
        <Activity size={11} className="sb-icon" />
        <span className="sb-val" style={{ color: servicesOnline === servicesTotal ? '#34d399' : '#fbbf24' }}>
          {servicesOnline}<span className="sb-dim">/{servicesTotal}</span>
        </span>
        <span className="sb-label">online</span>
      </div>

      <div className="sb-divider" />

      {/* Queue */}
      <div className="sb-stat">
        <Download size={11} className="sb-icon" />
        <span className="sb-val" style={{ color: queueTotal > 0 ? '#818cf8' : 'var(--muted)' }}>
          {queueTotal}
        </span>
        <span className="sb-label">queued</span>
      </div>

    </div>
  )
}
