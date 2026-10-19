import { Router } from 'express'
import { getSettings } from './lib.js'

const router = Router()

// ── Emulation news ────────────────────────────────────────────────────────────
const NEWS_WIKI_API = 'https://emulation.gametechwiki.com/api.php?action=parse&page=Template:News&prop=wikitext&format=json'
const BASE_WIKI     = 'https://emulation.gametechwiki.com/index.php/'
let _newsCache = null
let _newsCacheAt = 0

function parseWikiNewsItem(line) {
  let raw = line.replace(/^\*+\s*/, '').trim()
  if (!raw) return null
  raw = raw.replace(/'''(.*?)'''/g, '$1').replace(/''(.*?)''/g, '$1')

  const segments = []
  const tokenRe  = /(\[\[[^\]]+\]\]|\[[^\]]+\]|[^\[]+)/g
  let m
  while ((m = tokenRe.exec(raw)) !== null) {
    const token = m[1]
    if (token.startsWith('[[')) {
      const inner = token.slice(2, -2)
      const pipe  = inner.indexOf('|')
      const page  = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim()
      const label = (pipe >= 0 ? inner.slice(pipe + 1) : inner).trim()
      segments.push({ type: 'link', label, url: BASE_WIKI + page.replace(/ /g, '_') })
    } else if (token.startsWith('[')) {
      const inner = token.slice(1, -1)
      const sp    = inner.indexOf(' ')
      const url   = sp >= 0 ? inner.slice(0, sp) : inner
      const label = sp >= 0 ? inner.slice(sp + 1).trim() : url.split('/').pop()
      segments.push({ type: 'link', label, url })
    } else if (token.trim()) {
      segments.push({ type: 'text', content: token })
    }
  }

  let date = null
  for (const seg of segments) {
    if (seg.type !== 'text') continue
    const dm = seg.content.match(/\((\d{4}-\d{2}-\d{2})\)/)
    if (dm) { date = dm[1]; break }
  }

  return { segments, date }
}

export async function fetchEmulationNews() {
  if (_newsCache && Date.now() - _newsCacheAt < 30 * 60 * 1000) return _newsCache
  const res      = await fetch(NEWS_WIKI_API, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Wiki API ${res.status}`)
  const json     = await res.json()
  const wikitext = json.parse?.wikitext?.['*'] || ''
  const items    = wikitext.split('\n').filter(l => l.startsWith('*')).map(parseWikiNewsItem).filter(i => i && i.date)
  _newsCache   = items
  _newsCacheAt = Date.now()
  return items
}

// ── Tracked project releases ──────────────────────────────────────────────────
// Settings → General → News: GitHub repos as { name, repo }. The special repo
// "arrm" tracks ARRM, which publishes versions on its wiki, not GitHub.
const ARRM_URL = 'http://jujuvincebros.fr/wiki/arrm/doku.php?id=arrm_relooked_en:changelog-en_relooked'

export function trackedSources() {
  return getSettings().news.tracked
    .map(({ name, repo }) => repo.toLowerCase() === 'arrm'
      ? { name: name || 'ARRM', special: 'arrm', url: ARRM_URL }
      : { name, repo, url: `https://github.com/${repo}/releases` })
    .filter(s => s.special || /^[\w.-]+\/[\w.-]+$/.test(s.repo))
}

export function emulationNewsEnabled() {
  return getSettings().news.emulation
}

let _releasesCache = null
let _releasesCacheAt = 0
let _releasesCacheKey = ''

async function fetchGithubLatest(repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    signal:  AbortSignal.timeout(8000),
    headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'burrow' },
  })
  if (!res.ok) throw new Error(`GitHub ${res.status}`)
  const d = await res.json()
  return {
    version: d.name || d.tag_name,
    date:    d.published_at?.slice(0, 10) || null,
    url:     d.html_url,
  }
}

async function fetchARRMLatest() {
  const res = await fetch(ARRM_URL, {
    signal:  AbortSignal.timeout(10000),
    headers: { 'User-Agent': 'burrow' },
  })
  if (!res.ok) throw new Error(`ARRM ${res.status}`)
  const html = await res.text()
  const m    = html.match(/(\d+\.\d+\.\d+\.\d+)/)
  return { version: m ? m[1] : 'Unknown', date: null, url: ARRM_URL }
}

export async function fetchTrackedReleases() {
  const sources = trackedSources()
  const key = JSON.stringify(getSettings().news.tracked)
  if (_releasesCache && key === _releasesCacheKey && Date.now() - _releasesCacheAt < 30 * 60 * 1000) return _releasesCache
  const results = await Promise.allSettled(
    sources.map(s => (s.special === 'arrm' ? fetchARRMLatest() : fetchGithubLatest(s.repo)).then(r => ({ name: s.name, url: s.url, ...r })))
  )
  const releases = results.map((r, i) => r.status === 'fulfilled'
    ? r.value
    : { name: sources[i].name, url: sources[i].url, version: null, date: null, error: r.reason.message })
  _releasesCache    = releases
  _releasesCacheAt  = Date.now()
  _releasesCacheKey = key
  return releases
}

// ── Routes ────────────────────────────────────────────────────────────────────
router.get('/news', async (_req, res) => {
  const emulation = emulationNewsEnabled()
  const [wikiResult, releasesResult] = await Promise.allSettled([
    emulation ? fetchEmulationNews() : Promise.resolve([]),
    fetchTrackedReleases(),
  ])
  res.json({
    ok:       true,
    emulation,
    items:    wikiResult.status    === 'fulfilled' ? wikiResult.value.slice(0, 10)    : [],
    releases: releasesResult.status === 'fulfilled' ? releasesResult.value             : [],
    wikiError:    wikiResult.status    === 'rejected' ? wikiResult.reason.message     : null,
    cachedAt: new Date(Math.max(_newsCacheAt, _releasesCacheAt) || Date.now()).toISOString(),
  })
})

export default router
