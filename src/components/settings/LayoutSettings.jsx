import { ChevronUp, ChevronDown } from 'lucide-react'
import { orderedTabs, homeWidgets, WIDGETS } from '../../layout.js'
import { t } from '../../i18n.js'

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
        <button type="button" onClick={onUp} disabled={!onUp} title={t('Move up')}><ChevronUp size={12} /></button>
        <button type="button" onClick={onDown} disabled={!onDown} title={t('Move down')}><ChevronDown size={12} /></button>
      </div>
    </div>
  )
}

// layout: { order, hidden, home } — onChange(newLayout)
export default function LayoutSettings({ layout, onChange }) {
  const tabs = orderedTabs(layout)
  const order = tabs.map(x => x.id)
  const hidden = new Set(layout.hidden)
  const visibleCount = tabs.filter(x => !x.hidden).length

  const home = homeWidgets(layout)
  const unpicked = WIDGETS.filter(w => !home.includes(w.id))

  return (
    <>
      <div className="settings-field">
        <label className="settings-label">{t('Tabs')}</label>
        <div className="layout-list">
          {tabs.map((tb, i) => (
            <Row key={tb.id} label={tb.label} Icon={tb.Icon}
              checked={!hidden.has(tb.id)}
              // Keep at least one tab visible
              disabled={!hidden.has(tb.id) && visibleCount === 1}
              onToggle={() => onChange({ ...layout, hidden: hidden.has(tb.id) ? layout.hidden.filter(x => x !== tb.id) : [...layout.hidden, tb.id] })}
              onUp={i > 0 ? () => onChange({ ...layout, order: move(order, i, -1) }) : null}
              onDown={i < tabs.length - 1 ? () => onChange({ ...layout, order: move(order, i, 1) }) : null}
            />
          ))}
        </div>
      </div>

      <div className="settings-field">
        <label className="settings-label">{t('Home widgets')}</label>
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
