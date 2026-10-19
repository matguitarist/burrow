import { HardDrive } from 'lucide-react'

const SKIP_MOUNTS = [
  '/boot', '/proc', '/sys', '/dev', '/run', '/snap', '/tmp',
  'overlay', 'shm', 'tmpfs', 'devtmpfs', 'devfs', 'autofs', 'overlay2', 'aufs', 'squashfs', 'nsfs',
  // macOS: synthetic APFS system volumes (Data/VM/Preboot/Update/etc.) — not real storage
  '/System/Volumes', '/private/var/vm', '/private/var/folders',
  // Unraid: per-container docker overlay/bind mounts — one per container, not useful here
  '/var/lib/docker',
]

function skipMount(d) {
  const mnt = d.mnt_point || ''
  const type = d.fs_type || ''
  return (
    SKIP_MOUNTS.some(s => mnt === s || mnt.startsWith(s + '/')) ||
    SKIP_MOUNTS.includes(type) ||
    /recovery/i.test(mnt) ||  // macOS Recovery volume — hidden system partition, reports bogus size/used
    d.size < 100 * 1024 * 1024  // skip anything under 100 MB (virtual/bind mounts)
  )
}

function fmtSize(bytes) {
  if (!bytes) return '—'
  const tb = bytes / 1024 ** 4
  const gb = bytes / 1024 ** 3
  if (tb >= 1) return `${tb.toFixed(1)} TB`
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`
}

function diskColor(pct) {
  if (pct >= 90) return '#f87171'
  if (pct >= 75) return '#fbbf24'
  return null  // will use machine accent
}

// Windows drives report as "C:\" with no volume name (Glances/psutil has no
// label field) — pull the real label from the SSH+PowerShell lookup by drive letter.
function driveLetterOf(mnt) {
  const m = /^([a-z]):\\?$/i.exec(mnt || '')
  return m ? m[1].toUpperCase() : null
}

function DiskRow({ partition, accent, labels }) {
  // Trust size + free (they already reconcile with the shared APFS container
  // pool on macOS) and derive "used" from them. The raw "used" field only
  // counts this one volume — on macOS it excludes space held by sibling
  // volumes (Preboot/VM/Update/Recovery) that share the same container and
  // aren't actually available either, which understates how full the disk is.
  const size  = partition.size || 0
  const free  = partition.free != null ? partition.free : Math.max(size - (partition.used || 0), 0)
  const used  = Math.max(size - free, 0)
  const pct   = size > 0 ? Math.round((used / size) * 100) : 0
  const color = diskColor(pct) || accent

  const letter    = driveLetterOf(partition.mnt_point)
  const diskLabel = letter ? labels?.[letter] : null
  const label     = letter
    ? `${letter}:${diskLabel ? ` ${diskLabel}` : ''}`
    : (partition.mnt_point || partition.device_name || '?')

  return (
    <div className="disk-row">
      <div className="disk-row-top">
        <span className="disk-mnt">{label}</span>
        <span className="disk-pct" style={{ color }}>{pct}%</span>
      </div>
      <div className="disk-track">
        <div className="disk-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="disk-row-bot">
        <span className="disk-used">{fmtSize(used)} used</span>
        <span className="disk-free">{fmtSize(free)} free · {fmtSize(size)}</span>
      </div>
    </div>
  )
}

function DeviceCard({ machine, fs, labels }) {
  const noData      = !fs || fs.error
  const partitions  = noData ? [] : (Array.isArray(fs) ? fs : [fs]).filter(d => !skipMount(d))
  const totalFree   = partitions.reduce((s, d) => s + (d.free != null ? d.free : Math.max((d.size || 0) - (d.used || 0), 0)), 0)
  const totalSize   = partitions.reduce((s, d) => s + (d.size || 0), 0)
  const totalUsed   = Math.max(totalSize - totalFree, 0)
  const overallPct  = totalSize > 0 ? Math.round((totalUsed / totalSize) * 100) : null

  return (
    <div className="glass-card storage-device-card">
      <div className="storage-device-header">
        <div className="storage-device-icon" style={{ color: machine.accent, background: `${machine.accent}18`, borderColor: `${machine.accent}30` }}>
          <HardDrive size={14} />
        </div>
        <span className="storage-device-name">{machine.name}</span>
        {overallPct != null && (
          <span className="storage-device-total" style={{ color: diskColor(overallPct) || machine.accent }}>
            {overallPct}% used
          </span>
        )}
      </div>

      {noData && <p className="panel-empty">Glances not available</p>}

      {!noData && partitions.length === 0 && <p className="panel-empty">No mounted volumes found</p>}

      {partitions.length > 0 && (
        <div className="disk-list">
          {partitions.map((p, i) => (
            <DiskRow key={p.device_name || p.mnt_point || i} partition={p} accent={machine.accent} labels={labels} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function StorageTab({ machines, glances, diskLabels = {} }) {
  return (
    <div className="storage-grid">
      {machines.map(m => (
        <DeviceCard key={m.id} machine={m} fs={glances[m.id]?.fs} labels={diskLabels[m.id]} />
      ))}
    </div>
  )
}
