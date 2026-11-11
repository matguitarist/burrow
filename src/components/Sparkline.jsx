// max: fixed top of the scale (e.g. 100 for percentages); defaults to the data's own peak
export default function Sparkline({ data = [], color = '#818cf8', width = 100, height = 30, max: scaleMax }) {
  if (!data || data.length < 2) {
    return <div style={{ width, height, background: 'rgb(var(--ov) / 0.03)', borderRadius: 4 }} />
  }

  const max = scaleMax ?? Math.max(...data, 1)
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - 3 - ((v / max) * (height - 6))
    return [x.toFixed(1), y.toFixed(1)]
  })

  const linePoints = pts.map(p => p.join(',')).join(' ')
  const areaPoints = [`0,${height}`, ...pts.map(p => p.join(',')), `${width},${height}`].join(' ')
  const gradId = `sg-${color.replace(/[^a-z0-9]/gi, '')}`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradId})`} />
      <polyline points={linePoints} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
