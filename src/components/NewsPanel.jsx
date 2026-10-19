import { useState, useEffect } from 'react'
import { Newspaper, RefreshCw, ExternalLink, Tag } from 'lucide-react'
import { loc } from '../locale.js'

function fmtDate(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(loc(), { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtGroupDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(loc(), { weekday: 'long', month: 'long', day: 'numeric' })
}

function NewsSegments({ segments }) {
  return segments.map((seg, i) =>
    seg.type === 'link'
      ? <a key={i} href={seg.url} target="_blank" rel="noopener noreferrer" className="news-link">{seg.label}</a>
      : <span key={i} className="news-text">{seg.content}</span>
  )
}

// Derive GitHub repo root from a release URL
function repoRoot(url) {
  const m = url?.match(/^(https?:\/\/github\.com\/[^/]+\/[^/]+)/)
  return m ? m[1] : url
}

// First link label looks like a version if it starts with v+digit or just a digit
function isVersion(label) {
  return /^v?\d/.test(label || '')
}

function resolveNewsItem(item) {
  const links = item.segments.filter(s => s.type === 'link')

  if (!links.length) {
    // Plain text only
    const text = item.segments.map(s => s.content || '').join('').replace(/\(.*?\)/, '').replace(/[–—-]/, '').trim()
    return { name: text, nameUrl: null, version: null, versionUrl: null }
  }

  if (!isVersion(links[0].label)) {
    // Normal case: first link = name, second = version
    return {
      name:       links[0].label,
      nameUrl:    links[0].url,
      version:    links[1]?.label || null,
      versionUrl: links[1]?.url  || null,
    }
  }

  // First link is a version — name is plain text before the first link segment
  let nameText = ''
  for (const seg of item.segments) {
    if (seg.type === 'link') break
    nameText += seg.content
  }
  nameText = nameText.replace(/\s*[–—-]\s*$/, '').trim()

  return {
    name:       nameText || links[0].label,
    nameUrl:    repoRoot(links[0].url),
    version:    links[0].label,
    versionUrl: links[0].url,
  }
}

function ReleaseCard({ r }) {
  return (
    <a href={r.url} target="_blank" rel="noopener noreferrer" className="release-card">
      <span className="release-card-name">{r.name}</span>
      {r.version
        ? <span className="release-card-version"><Tag size={9} />{r.version}</span>
        : <span className="release-card-err">unavailable</span>
      }
      {r.date && <span className="release-card-date">{fmtDate(r.date)}</span>}
    </a>
  )
}

export default function NewsPanel() {
  const [items,      setItems]      = useState([])
  const [releases,   setReleases]   = useState([])
  const [emulation,  setEmulation]  = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [cachedAt,   setCachedAt]   = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = async (bust = false) => {
    bust ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/news')
      const d   = await res.json()
      setItems(d.items || [])
      setReleases(d.releases || [])
      setEmulation(!!d.emulation)
      setCachedAt(d.cachedAt)
      if (d.wikiError) setError(d.wikiError)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  const grouped = items.reduce((acc, item) => {
    const key = item.date || 'Unknown'
    if (!acc.find(g => g.date === key)) acc.push({ date: key, items: [] })
    acc.find(g => g.date === key).items.push(item)
    return acc
  }, [])

  const ago = cachedAt ? (() => {
    const mins = Math.round((Date.now() - new Date(cachedAt)) / 60000)
    return mins < 2 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`
  })() : null

  return (
    <div className="glass-card news-panel">
      <div className="panel-header">
        <Newspaper size={14} />
        <span>{emulation ? 'Emulation News' : 'Releases'}</span>
        {ago && <span className="news-cache-label">updated {ago}</span>}
        <button className="icon-btn news-refresh" onClick={() => load(true)} disabled={refreshing} title="Force refresh">
          <RefreshCw size={12} className={refreshing ? 'spin' : ''} />
        </button>
      </div>

      {/* Tracked project releases */}
      {releases.length > 0 && (
        <div className="releases-section">
          <div className="releases-grid">
            {releases.map(r => <ReleaseCard key={r.name} r={r} />)}
          </div>
        </div>
      )}

      {!loading && !emulation && releases.length === 0 && (
        <p className="news-empty">Nothing tracked yet — add GitHub projects or turn on emulation news in Settings → General → News.</p>
      )}

      {/* Wiki news feed */}
      {emulation && <>
      <div className="news-divider-label">Latest from the wiki</div>

      {loading && <p className="news-empty">Loading…</p>}
      {error   && <p className="news-error">✗ {error}</p>}
      {!loading && !error && items.length === 0 && <p className="news-empty">No news items found.</p>}

      {!loading && grouped.length > 0 && (
        <div className="news-groups">
          {grouped.map(group => (
            <div key={group.date} className="news-group">
              <div className="news-group-date">{fmtGroupDate(group.date)}</div>
              <div className="news-group-items">
                {group.items.map((item, i) => {
                  const { name, nameUrl, version, versionUrl } = resolveNewsItem(item)
                  return (
                    <div key={i} className="news-item">
                      <div className="news-item-name">
                        {nameUrl
                          ? <a href={nameUrl} target="_blank" rel="noopener noreferrer" className="news-name-link">{name}</a>
                          : <span className="news-name-text">{name}</span>
                        }
                      </div>
                      {version && (
                        <a href={versionUrl} target="_blank" rel="noopener noreferrer" className="news-version-chip">
                          {version}<ExternalLink size={9} />
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="news-footer">
        <a href="https://emulation.gametechwiki.com/index.php/Template:News" target="_blank" rel="noopener noreferrer" className="news-source-link">
          <ExternalLink size={10} /> emulation.gametechwiki.com
        </a>
      </div>
      </>}
    </div>
  )
}
