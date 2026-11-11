import { useState, useEffect } from 'react'
import { PanelLeft, Brain, LayoutGrid, NotebookPen, StickyNote, Settings } from 'lucide-react'
import BottomDock from './BottomDock.jsx'
import ScratchPad from './ScratchPad.jsx'

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
  onSettings, settingsOpen,
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
    `${online} of ${total} services up`,
    queue ? `${queue} downloading` : null,
    proc ? `Server: CPU ${proc.cpu}% · RSS ${Math.round((proc.rss || 0) / 1048576)} MB` : null,
  ].filter(Boolean).join('\n')

  return (
    <aside className={`sidebar${rail ? ' rail' : ''}`} aria-label="Sidebar">
      <div className="sn-brand">
        <div className="sn-logo" aria-hidden>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 18a9 9 0 0 1 18 0" /><path d="M7 18a5 5 0 0 1 10 0" /><path d="M2 18h20" />
          </svg>
        </div>
        <span className="sn-brand-name">Burrow</span>
        {!narrow && (
          <button type="button" className="sn-toggle" onClick={toggle}
            title={collapsed ? 'Show sidebar (⌃⌘S)' : 'Hide sidebar (⌃⌘S)'} aria-label="Toggle sidebar">
            <PanelLeft size={15} />
          </button>
        )}
      </div>

      <nav className="sn-scroll">
        <div className="sn-section">
          {tabs.map(t => (
            <Item key={t.id} icon={t.Icon} label={t.label} count={badges[t.id]} rail={rail}
              active={current === t.id} onClick={() => onTab(t.id)} />
          ))}
        </div>

        <div className="sn-section">
          <div className="sn-heading">Tools</div>
          <Item icon={Brain}       label="Assistant"   active={aiOpen}    onClick={onAI}    rail={rail} />
          <Item icon={LayoutGrid}  label="Board"       active={boardOpen} onClick={onBoard} rail={rail} />
          <Item icon={NotebookPen} label="Notes & agenda" count={activeTodos} active={notesOpen} onClick={onNotes} rail={rail} />
          <Item icon={StickyNote}  label="Scratch pad" active={padOpen}   onClick={() => setPadOpen(true)} rail={rail} />
        </div>

        <BottomDock variant="sidebar" links={links} onLinksUpdate={onLinksUpdate} rail={rail} />
      </nav>

      <div className="sn-footer">
        <div className="sn-status" title={statusTip}>
          <span className={`sn-status-dot ${total === 0 ? 'unknown' : allUp ? 'ok' : 'warn'}`} />
          <span className="sn-label">
            {total === 0 ? 'Checking…' : allUp ? 'All services up' : `${online} of ${total} up`}
            {queue > 0 && <span className="sn-status-sub"> · {queue} queued</span>}
          </span>
        </div>
        <Item icon={Settings} label="Settings" active={settingsOpen} onClick={onSettings} rail={rail} />
      </div>

      {padOpen && <ScratchPad onClose={() => setPadOpen(false)} />}
    </aside>
  )
}
