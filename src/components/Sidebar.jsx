import { useState, useEffect, lazy, Suspense } from 'react'
import { PanelLeft, Brain, LayoutGrid, NotebookPen, StickyNote, Settings } from 'lucide-react'
import BottomDock from './BottomDock.jsx'
const ScratchPad = lazy(() => import('./ScratchPad.jsx'))
import BurrowMark from './BurrowMark.jsx'
import { t } from '../i18n.js'

const NARROW = '(max-width: 1100px)'

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches)
  useEffect(() => {
    const mq = window.matchMedia(NARROW)
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}

function loadCollapsed() {
  try { return localStorage.getItem('sidebar-collapsed') === '1' } catch { return false }
}

function Item({ icon: Icon, label, count, active, onClick, rail }) {
  return (
    <button type="button" className={`sn-item${active ? ' active' : ''}`} onClick={onClick}
      title={rail ? label : undefined} aria-current={active ? 'page' : undefined}>
      <Icon size={16} />
      <span className="sn-label">{label}</span>
      {count > 0 && <span className="sn-count">{count > 99 ? '99+' : count}</span>}
    </button>
  )
}

// Desktop navigation: pages, tools, links, and a quiet status line.
// Collapses to an icon rail (⌃⌘S, or automatically on narrow windows).
export default function Sidebar({
  tabs, current, onTab, badges,
  onAI, aiOpen, onBoard, boardOpen, onNotes, notesOpen, activeTodos,
  onSettings, settingsOpen, servicesUp = 0, servicesTotal = 0, machinesUp = 0, machinesTotal = 0,
  links, onLinksUpdate,
  online, total, queue, system,
}) {
  const narrow = useNarrow()
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const [padOpen, setPadOpen] = useState(false)
  const rail = collapsed || narrow

  const toggle = () => setCollapsed(c => {
    try { localStorage.setItem('sidebar-collapsed', c ? '0' : '1') } catch {}
    return !c
  })

  useEffect(() => {
    const onKey = e => {
      if (e.ctrlKey && e.metaKey && e.key.toLowerCase() === 's') { e.preventDefault(); toggle() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const allUp = total > 0 && online === total
  const proc = system?.process
  const statusTip = [
    servicesTotal ? t('{n} of {total} services up', { n: servicesUp, total: servicesTotal }) : null,
    machinesTotal ? t('{n} of {total} machines up', { n: machinesUp, total: machinesTotal }) : null,
    queue ? t('{n} downloading', { n: queue }) : null,
    proc ? t('Server: CPU {cpu}% · RSS {rss} MB', { cpu: proc.cpu, rss: Math.round((proc.rss || 0) / 1048576) }) : null,
  ].filter(Boolean).join('\n')

  return (
    <aside className={`sidebar${rail ? ' rail' : ''}`} aria-label={t('Sidebar')}>
      <div className="sn-brand">
        <div className="sn-logo" aria-hidden>
          <BurrowMark />
        </div>
        <span className="sn-brand-name">Burrow</span>
        {!narrow && (
          <button type="button" className="sn-toggle" onClick={toggle}
            title={collapsed ? t('Show sidebar (⌃⌘S)') : t('Hide sidebar (⌃⌘S)')} aria-label={t('Toggle sidebar')}>
            <PanelLeft size={15} />
          </button>
        )}
      </div>

      <nav className="sn-scroll">
        <div className="sn-section">
          {tabs.map(tab => (
            <Item key={tab.id} icon={tab.Icon} label={tab.label} count={badges[tab.id]} rail={rail}
              active={current === tab.id} onClick={() => onTab(tab.id)} />
          ))}
        </div>

        <div className="sn-section">
          <div className="sn-heading">{t('Tools')}</div>
          <Item icon={Brain}       label={t('Assistant')} active={aiOpen}    onClick={onAI}    rail={rail} />
          <Item icon={LayoutGrid}  label={t('Board')} active={boardOpen} onClick={onBoard} rail={rail} />
          <Item icon={NotebookPen} label={t('Notes & agenda')} count={activeTodos} active={notesOpen} onClick={onNotes} rail={rail} />
          <Item icon={StickyNote}  label={t('Scratch pad')} active={padOpen}   onClick={() => setPadOpen(true)} rail={rail} />
        </div>

        <BottomDock variant="sidebar" links={links} onLinksUpdate={onLinksUpdate} rail={rail} />
      </nav>

      <div className="sn-footer">
        <div className="sn-status" title={statusTip}>
          <span className={`sn-status-dot ${total === 0 ? 'unknown' : allUp ? 'ok' : 'warn'}`} />
          <span className="sn-label">
            {total === 0 ? t('Checking…') : allUp ? t('Everything is up') : t('{n} down', { n: total - online })}
            {queue > 0 && <span className="sn-status-sub"> · {t('{n} queued', { n: queue })}</span>}
          </span>
        </div>
        <Item icon={Settings} label={t('Settings')} active={settingsOpen} onClick={onSettings} rail={rail} />
      </div>

      {padOpen && <Suspense fallback={null}><ScratchPad onClose={() => setPadOpen(false)} /></Suspense>}
    </aside>
  )
}
