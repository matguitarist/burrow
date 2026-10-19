export default function StatGauge({ value = 0, label, color, size = 68 }) {
  const r    = (size / 2) - 8
  const circ = 2 * Math.PI * r
  const pct  = Math.min(Math.max(value, 0), 100)
  const gap  = circ * (1 - pct / 100)

  return (
    <div className="stat-gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circ}
          strokeDashoffset={gap}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)',
            filter: `drop-shadow(0 0 5px ${color}99)`,
          }}
        />
      </svg>
      <div className="gauge-center">
        <span className="gauge-pct">{Math.round(pct)}%</span>
        <span className="gauge-lbl">{label}</span>
      </div>
    </div>
  )
}
