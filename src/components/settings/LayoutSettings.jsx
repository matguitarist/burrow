import { ChevronUp, ChevronDown } from 'lucide-react'
import { orderedTabs, homeWidgets, WIDGETS } from '../../layout.js'

const move = (list, i, d) => {
  const j = i + d
  if (j < 0 || j >= list.length) return list
  const out = [...list]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

function Row({ label, Icon, checked, onToggle, onUp, onDown, disabled }) {
  return (
    <div className={`layout-row${checked ? '' : ' off'}`}>
      <label className="svc-cfg-toggle">
        <input type="checkbox" checked={checked} onChange={onToggle} disabled={disabled} />
        {Icon && <Icon size={12} />}
        {label}
      </label>
      <div className="layout-move">
        <button type="button" onClick={onUp} disabled={!onUp} title="Move up"><ChevronUp size={12} /></button>
        <button type="button" onClick={onDown} disabled={!onDown} title="Move down"><ChevronDown size={12} /></button>
      </div>
    </div>
  )
}

// layout: { order, hidden, home } — onChange(newLayout)
export default function LayoutSettings({ layout, onChange }) {
  const tabs = orderedTabs(layout)
  const order = tabs.map(t => t.id)
  const hidden = new Set(layout.hidden)
  const visibleCount = tabs.filter(t => !t.hidden).length

  const home = homeWidgets(layout)
  const unpicked = WIDGETS.filter(w => !home.includes(w.id))

  return (
    <>
      <div className="settings-field">
        <label className="settings-label">Tabs</label>
        <div className="layout-list">
          {tabs.map((t, i) => (
            <Row key={t.id} label={t.label} Icon={t.Icon}
              checked={!hidden.has(t.id)}
              // Keep at least one tab visible
              disabled={!hidden.has(t.id) && visibleCount === 1}
              onToggle={() => onChange({ ...layout, hidden: hidden.has(t.id) ? layout.hidden.filter(x => x !== t.id) : [...layout.hidden, t.id] })}
              onUp={i > 0 ? () => onChange({ ...layout, order: move(order, i, -1) }) : null}
              onDown={i < tabs.length - 1 ? () => onChange({ ...layout, order: move(order, i, 1) }) : null}
            />
          ))}
        </div>
      </div>

      <div className="settings-field">
        <label className="settings-label">Home widgets</label>
        <div className="layout-list">
          {home.map((id, i) => (
            <Row key={id} label={WIDGETS.find(w => w.id === id).label} checked
              disabled={home.length === 1}
              onToggle={() => onChange({ ...layout, home: home.filter(x => x !== id) })}
              onUp={i > 0 ? () => onChange({ ...layout, home: move(home, i, -1) }) : null}
              onDown={i < home.length - 1 ? () => onChange({ ...layout, home: move(home, i, 1) }) : null}
            />
          ))}
          {unpicked.map(w => (
            <Row key={w.id} label={w.label} checked={false}
              onToggle={() => onChange({ ...layout, home: [...home, w.id] })} />
          ))}
        </div>
      </div>
    </>
  )
}
