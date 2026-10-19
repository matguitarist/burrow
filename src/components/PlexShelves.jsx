import { useState, useEffect } from 'react'
import { Sparkles, PlayCircle, BarChart3 } from 'lucide-react'
import { loc } from '../locale.js'

function useApi(url) {
  const [data, setData] = useState(null)
  useEffect(() => {
    fetch(url).then(r => r.json()).then(setData).catch(() => setData({ error: 'Unavailable' }))
  }, [url])
  return data
}

// Link straight to the item in Plex web (plexUrl is the service's /web link)
const itemLink = (plexUrl, machineId, ratingKey) => plexUrl && machineId
  ? `${plexUrl.replace(/\/$/, '')}/index.html#!/server/${machineId}/details?key=${encodeURIComponent(`/library/metadata/${ratingKey}`)}`
  : null

function Shelf({ title, Icon, url, plexUrl, empty, showProgress }) {
  const data = useApi(url)
  if (data?.configured === false) return null
  return (
    <div className="glass-card plex-shelf">
      <div className="panel-header"><Icon size={14} /><span>{title}</span></div>
      {!data ? <p className="panel-empty">Loading…</p>
        : data.error ? <p className="panel-empty">Plex is unreachable.</p>
        : data.items.length === 0 ? <p className="panel-empty">{empty}</p>
        : <div className="plex-strip">
            {data.items.map(i => {
              const link = itemLink(plexUrl, data.machineId, i.ratingKey)
              const Tag = link ? 'a' : 'div'
              return (
                <Tag key={i.ratingKey} className="plex-poster" {...(link ? { href: link, target: '_blank', rel: 'noreferrer' } : {})}
                  title={`${i.title}${i.subtitle ? ` — ${i.subtitle}` : ''}`}>
                  <div className="plex-poster-img">
                    {i.thumb && <img src={`/api/plex/thumb?path=${encodeURIComponent(i.thumb)}`} alt="" loading="lazy" />}
                    {showProgress && i.progress != null && <span className="plex-progress" style={{ width: `${i.progress}%` }} />}
                  </div>
                  <span className="plex-poster-title">{i.title}</span>
                  {i.subtitle && <span className="plex-poster-sub">{i.subtitle}</span>}
                </Tag>
              )
            })}
          </div>}
    </div>
  )
}

export function RecentlyAdded({ plexUrl }) {
  return <Shelf title="Recently added" Icon={Sparkles} url="/api/plex/recent" plexUrl={plexUrl} empty="Nothing new yet." />
}

export function ContinueWatching({ plexUrl }) {
  return <Shelf title="Continue watching" Icon={PlayCircle} url="/api/plex/ondeck" plexUrl={plexUrl} empty="Nothing in progress." showProgress />
}

// Last 30 days from Tautulli
export function WatchStats() {
  const data = useApi('/api/tautulli/stats')
  if (!data) return null
  const list = (label, rows, key) => rows.length > 0 && (
    <div className="watch-col">
      <span className="settings-label">{label}</span>
      {rows.map((r, i) => (
        <div key={i} className="watch-row"><span>{r[key]}</span><span className="home-small">{r.plays}</span></div>
      ))}
    </div>
  )
  return (
    <div className="glass-card">
      <div className="panel-header"><BarChart3 size={14} /><span>Last 30 days</span></div>
      {data.error ? <p className="panel-empty">{data.error}</p> : (
        <>
          <div className="home-health-stats">
            <div><span className="home-big">{(data.plays ?? 0).toLocaleString(loc())}</span><span className="home-small">plays</span></div>
            {data.duration && <div><span className="home-big watch-duration">{data.duration}</span><span className="home-small">watched</span></div>}
          </div>
          <div className="watch-cols">
            {list('Top movies', data.topMovies, 'title')}
            {list('Top shows', data.topShows, 'title')}
            {list('Top users', data.topUsers, 'name')}
          </div>
        </>
      )}
    </div>
  )
}
