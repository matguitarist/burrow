import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, CornerDownLeft } from 'lucide-react'

// Lower is better; null = no match. Prefix > word start > substring > in-order
// letters, the last only when they sit close together ("sonr" → Sonarr, but
// not "son" → "Last Moon")
function score(text, q) {
  const t = text.toLowerCase()
  if (!q) return 0
  if (t.startsWith(q)) return 0
  const i = t.indexOf(q)
  if (i > 0 && /[\s\-—:(/]/.test(t[i - 1])) return 1
  if (i >= 0) return 2 + i / 100
  let pos = 0, first = -1
  for (const ch of q) {
    pos = t.indexOf(ch, pos)
    if (pos < 0) return null
    if (first < 0) first = pos
    pos++
  }
  return pos - first <= q.length + 2 ? 5 + first / 100 : null
}

const PER_SECTION = 8   // with a query, so one big section can't bury the rest

// items: { id, section, label, hint?, keywords?, icon?, run() }
// fallbacks(query): extra items for free text (e.g. "Search media for …")
export default function CommandPalette({ open, onClose, items, fallbacks }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef(null)

  useEffect(() => { if (open) { setQuery(''); setActive(0) } }, [open])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const ranked = items
      .map(it => {
        const scores = [score(it.label, q), ...(it.keywords || []).map(k => score(k, q) == null ? null : score(k, q) + 1)]
          .filter(s => s != null)
        return scores.length ? { it, s: Math.min(...scores) } : null
      })
      .filter(Boolean)
      .sort((a, b) => a.s - b.s)
      .slice(0, q ? 40 : 60)
    // Keep sections together, ordered by their best match
    const sectionRank = new Map()
    ranked.forEach((r, i) => { if (!sectionRank.has(r.it.section)) sectionRank.set(r.it.section, i) })
    const perSection = new Map()
    const grouped = ranked
      .map((r, i) => ({ ...r, i }))
      .sort((a, b) => sectionRank.get(a.it.section) - sectionRank.get(b.it.section) || a.i - b.i)
      .filter(r => {
        if (!q) return true
        const n = (perSection.get(r.it.section) || 0) + 1
        perSection.set(r.it.section, n)
        return n <= PER_SECTION
      })
      .map(r => r.it)
    return q ? [...grouped, ...fallbacks(query.trim())] : grouped
  }, [items, query, fallbacks])

  useEffect(() => { setActive(0) }, [query])
  useEffect(() => {
    listRef.current?.querySelector('.cmdk-item.active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const run = it => { onClose(); it.run() }

  const onKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[active]) run(results[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  let lastSection = null
  return createPortal(
    <div className="cmdk-backdrop" onClick={onClose}>
      <div className="cmdk" onClick={e => e.stopPropagation()}>
        <div className="cmdk-input-row">
          <Search size={15} />
          <input
            autoFocus
            className="cmdk-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search services, links, devices, games… or type an action"
            spellCheck={false}
          />
          <kbd className="cmdk-kbd">esc</kbd>
        </div>
        <div className="cmdk-list" ref={listRef}>
          {results.length === 0 && <p className="cmdk-empty">No matches</p>}
          {results.map((it, i) => {
            const header = it.section !== lastSection ? it.section : null
            lastSection = it.section
            const Icon = it.icon
            return (
              <div key={it.id}>
                {header && <div className="cmdk-section">{header}</div>}
                <button
                  type="button"
                  className={`cmdk-item${i === active ? ' active' : ''}`}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(it)}
                >
                  {Icon && <Icon size={14} className="cmdk-icon" style={it.color ? { color: it.color } : undefined} />}
                  <span className="cmdk-label">{it.label}</span>
                  {it.hint && <span className="cmdk-hint">{it.hint}</span>}
                  {i === active && <CornerDownLeft size={12} className="cmdk-enter" />}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body
  )
}
