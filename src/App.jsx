import { useState, useEffect, useCallback, useRef } from 'react'
import { Server, Tv, HardDrive, Activity, Gamepad2, Newspaper, Link2, Bell, Search } from 'lucide-react'
import Header from './components/Header.jsx'
import MachineCard from './components/MachineCard.jsx'
import OllamaDrawer from './components/OllamaDrawer.jsx'
import KanbanBoard from './components/KanbanBoard.jsx'
import NowPlayingPanel from './components/NowPlayingPanel.jsx'
import QueuePanel from './components/QueuePanel.jsx'
import StorageTab from './components/StorageTab.jsx'
import ServicesTab from './components/ServicesTab.jsx'
import TautulliPanel from './components/TautulliPanel.jsx'
import SeerrPanel from './components/SeerrPanel.jsx'
import GamesPanel from './components/GamesPanel.jsx'
import NewsPanel from './components/NewsPanel.jsx'
import GotifyPanel from './components/GotifyPanel.jsx'
import LinksPanel from './components/LinksPanel.jsx'
import TerminalModal from './components/TerminalModal.jsx'
import SshPasswordModal from './components/SshPasswordModal.jsx'
import BottomDock from './components/BottomDock.jsx'
import { setLocale } from './locale.js'
import StatusBar from './components/StatusBar.jsx'
import LeftPanel from './components/LeftPanel.jsx'
import RightPanel from './components/RightPanel.jsx'

const POLL_MS = 30_000

async function get(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export default function App() {
  const [remoteConfig, setRemoteConfig] = useState(null)
  const [services,     setServices]     = useState({})
  const [glances,      setGlances]      = useState({})
  const [cpuHistory,   setCpuHistory]   = useState({})
  const [ollamaModels, setOllamaModels] = useState([])
  const [ollamaActive, setOllamaActive] = useState([])
  const [extras,       setExtras]       = useState({})
  const [nowPlaying,   setNowPlaying]   = useState([])
  const [radarrQueue,  setRadarrQueue]  = useState([])
  const [sonarrQueue,  setSonarrQueue]  = useState([])
  const [qbitQueue,      setQbitQueue]      = useState([])
  const [tautulliActivity, setTautulliActivity] = useState(null)
  const [tautulliHistory,  setTautulliHistory]  = useState(null)
  const [gamesWishlist,    setGamesWishlist]    = useState([])
  const [links,            setLinks]            = useState([])
  const [dockerData,       setDockerData]       = useState({})
  const [diskLabels,       setDiskLabels]       = useState({})
  const [systemStats,      setSystemStats]      = useState(null)
  const [todos,        setTodos]        = useState([])
  const [events,       setEvents]       = useState([])
  const [releases,     setReleases]     = useState([])
  const [lastUpdated,  setLastUpdated]  = useState(null)
  const [activeTab,    setActiveTab]    = useState(() => localStorage.getItem('active-tab') ?? 'servers')
  const [termDevice,   setTermDevice]   = useState(null)
  const [leftOpen,     setLeftOpen]     = useState(false)
  const [rightOpen,    setRightOpen]    = useState(false)
  const [ollamaOpen,   setOllamaOpen]   = useState(false)
  const [kanbanOpen,   setKanbanOpen]   = useState(false)
  const [mediaQuery,   setMediaQuery]   = useState('')
  const [pollMs,       setPollMs]       = useState(() => {
    const s = localStorage.getItem('poll-interval')
    return s ? parseInt(s) : POLL_MS
  })
  const [gotifyCount,  setGotifyCount]  = useState(0)
  const [sshPromptDevice, setSshPromptDevice] = useState(null)
  const prevServices = useRef({})
  const pollRef      = useRef(null)
  // Ref keeps the latest device list accessible inside fetchAll without re-creating it
  const devicesRef = useRef([])
  const servicesRef = useRef([])
  // Devices the user chose "Skip" on — don't re-prompt until page reload
  const sshDismissedRef = useRef(new Set())

  const fetchConfig = useCallback(() =>
    fetch('/api/config').then(r => r.json()).then(data => {
      setLocale(data.region?.locale)
      setRemoteConfig(data)
      devicesRef.current = data.devices ?? []
      servicesRef.current = data.services ?? []
    }).catch(() => {}), [])

  // Todos + events + games — fetched once on mount, refreshed after mutations
  const fetchTodos  = () => get('/api/todos').then(d => d && setTodos(d))
  const fetchEvents = () => get('/api/events').then(d => d && setEvents(d))
  const fetchReleases = () => get('/api/releases').then(d => d && setReleases(d))
  const fetchGames  = () => get('/api/games').then(d => d && setGamesWishlist(d))
  const fetchLinks  = () => get('/api/links').then(d => d && setLinks(d))

  const addTodo    = async (text) => { await fetch('/api/todos', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text}) }); fetchTodos() }
  const toggleTodo = async (id, done) => { await fetch(`/api/todos/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({done}) }); fetchTodos() }
  const deleteTodo = async (id) => { await fetch(`/api/todos/${id}`, { method:'DELETE' }); fetchTodos() }

  const addEvent             = async (ev) => { await fetch('/api/events', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(ev) }); fetchEvents() }
  const deleteEvent          = async (id) => { await fetch(`/api/events/${id}`, { method:'DELETE' }); fetchEvents() }
  const editEvent            = async (id, data) => { await fetch(`/api/events/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) }); fetchEvents() }
  const editEventOccurrence  = async (templateId, instanceDate, data) => { await fetch(`/api/events/${templateId}/except`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ instanceDate, ...data }) }); fetchEvents() }

  // Request notification permission once on load
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  const fetchAll = useCallback(async () => {
    const devices = devicesRef.current
    fetchReleases()  // cached server-side for 15 min, so this is cheap

    // Glances: 6 calls per device — cpu, mem, fs, network, sensors, uptime
    const glancesIds = devices.map(d => d.id)
    const results = await Promise.all([
      get('/api/services'),
      get('/api/ollama/models'),
      get('/api/ollama/running'),
      get('/api/radarr/stats'),
      get('/api/sonarr/stats'),
      get('/api/plex/sessions'),
      get('/api/plex/now-playing'),
      get('/api/radarr/queue'),
      get('/api/sonarr/queue'),
      get('/api/qbittorrent/queue'),
      get('/api/tautulli/activity'),
      get('/api/tautulli/history'),
      get('/api/system'),
      ...glancesIds.flatMap(id => [
        get(`/api/glances/${id}/cpu`),
        get(`/api/glances/${id}/mem`),
        get(`/api/glances/${id}/fs`),
        get(`/api/glances/${id}/network`),
        get(`/api/glances/${id}/sensors`),
        get(`/api/glances/${id}/uptime`),
        get(`/api/glances/${id}/containers`),
      ]),
    ])

    const [
      svcData, ollamaModelsData, ollamaRunningData,
      radarrData, sonarrData, plexData,
      nowPlayingData, radarrQueueData, sonarrQueueData, qbitQueueData,
      tautulliActivityData, tautulliHistoryData, systemData,
      ...glancesFlat
    ] = results

    // Down alerts — fire when a service transitions online → offline
    if (svcData) {
      const prev = prevServices.current
      for (const [id, state] of Object.entries(svcData)) {
        if (prev[id]?.online === true && state.online === false) {
          if (Notification.permission === 'granted') {
            const svc = servicesRef.current.find(s => s.id === id)
            new Notification(`⚠️ ${svc?.name ?? id} went offline`, { body: 'Check your home dashboard' })
          }
        }
      }
      prevServices.current = svcData
      setServices(svcData)
    }

    if (ollamaModelsData?.models)  setOllamaModels(ollamaModelsData.models)
    if (ollamaRunningData?.models) setOllamaActive(ollamaRunningData.models)
    if (nowPlayingData?.sessions)  setNowPlaying(nowPlayingData.sessions)
    if (radarrQueueData?.records)  setRadarrQueue(radarrQueueData.records)
    if (sonarrQueueData?.records)  setSonarrQueue(sonarrQueueData.records)
    if (qbitQueueData?.records)    setQbitQueue(qbitQueueData.records)
    if (tautulliActivityData && !tautulliActivityData.error) setTautulliActivity(tautulliActivityData)
    if (tautulliHistoryData  && !tautulliHistoryData.error)  setTautulliHistory(tautulliHistoryData)
    if (systemData           && !systemData.error)           setSystemStats(systemData)

    setExtras({
      radarr: radarrData && !radarrData.error ? radarrData : null,
      sonarr: sonarrData && !sonarrData.error ? sonarrData : null,
      plex:   plexData   && !plexData.error   ? plexData   : null,
    })

    // Build glances and cpuHistory keyed by device id (7 slots per device)
    const newGlances = {}
    const newDocker  = {}
    glancesIds.forEach((id, i) => {
      newGlances[id] = {
        cpu:     glancesFlat[i * 7]     ?? null,
        mem:     glancesFlat[i * 7 + 1] ?? null,
        fs:      glancesFlat[i * 7 + 2] ?? null,
        network: glancesFlat[i * 7 + 3] ?? null,
        sensors: glancesFlat[i * 7 + 4] ?? null,
        uptime:  glancesFlat[i * 7 + 5] ?? null,
      }
      const docker = glancesFlat[i * 7 + 6]
      if (docker && !docker.error && Array.isArray(docker)) newDocker[id] = docker
    })
    setGlances(newGlances)
    setDockerData(newDocker)

    // Windows drive labels (Glances has no volume-label field) — only worth
    // asking for on machines whose fs list actually has drive-letter mounts.
    // The backend caches the SSH+PowerShell lookup, so polling this every
    // tick is cheap after the first hit. A 401 means SSH key auth didn't
    // work — prompt the user for a password once (unless already skipped).
    const windowsIds = glancesIds.filter(id => {
      const fsData = newGlances[id]?.fs
      const list   = Array.isArray(fsData) ? fsData : (fsData ? [fsData] : [])
      return list.some(p => /^[a-z]:\\?$/i.test(p.device_name || ''))
    })
    if (windowsIds.length) {
      Promise.all(windowsIds.map(async id => {
        try {
          const res = await fetch(`/api/disk-labels/${id}`)
          if (res.status === 401) return [id, 'auth-required']
          if (!res.ok) return [id, null]
          return [id, await res.json()]
        } catch { return [id, null] }
      })).then(pairs => {
        setDiskLabels(prev => {
          const next = { ...prev }
          for (const [id, d] of pairs) if (d && d !== 'auth-required') next[id] = d
          return next
        })
        const needsAuth = pairs.find(([id, d]) => d === 'auth-required' && !sshDismissedRef.current.has(id))
        if (needsAuth) {
          setSshPromptDevice(prev => prev ?? devicesRef.current.find(dev => dev.id === needsAuth[0]) ?? null)
        }
      })
    }

    setCpuHistory(prev => {
      const next = { ...prev }
      glancesIds.forEach((id, i) => {
        const cpu = glancesFlat[i * 7]
        const arr = prev[id] ?? []
        next[id] = cpu && !cpu.error
          ? [...arr.slice(-29), cpu.total ?? cpu.user ?? 0]
          : arr
      })
      return next
    })

    setLastUpdated(new Date())
  }, [])

  // Fetch config first (populates devicesRef), then start polling.
  // Pause the interval while the browser tab is hidden; resume on focus.
  useEffect(() => {
    fetchTodos()
    fetchEvents()
    fetchReleases()
    fetchGames()
    fetchLinks()
    fetchConfig().then(fetchAll)
    pollRef.current = setInterval(fetchAll, pollMs)

    const handleVisibility = () => {
      if (document.hidden) {
        clearInterval(pollRef.current)
        pollRef.current = null
      } else {
        fetchAll()
        pollRef.current = setInterval(fetchAll, pollMs)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      clearInterval(pollRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [fetchAll, fetchConfig, pollMs])

  // All machines come from the server (Settings → Devices), no hardcoding
  const enrichedMachines = remoteConfig?.devices ?? []

  const serviceList = remoteConfig?.services ?? []

  const machineServices = (machineId) =>
    serviceList
      .filter(s => s.machine === machineId)
      .map(s => {
        let extra = null
        if (s.template === 'radarr' && extras.radarr) extra = `${extras.radarr.movieCount} movies`
        if (s.template === 'sonarr' && extras.sonarr) extra = `${extras.sonarr.seriesCount} series`
        if (s.template === 'plex'   && extras.plex)   extra = `${extras.plex.activeSessions} streams`
        // The AI service the chat is actually using shows the model count
        if (remoteConfig?.ai?.online && s.name === remoteConfig.ai.backend && ollamaModels.length) extra = `${ollamaModels.length} models`
        return {
          ...s,
          status: services[s.id] ?? null,
          since:  services[s.id]?.since ?? null,
          extra,
        }
      })

  const totalOnline  = Object.values(services).filter(s => s?.online).length
  const totalCount   = Object.keys(services).length
  const activeTodos  = todos.filter(t => !t.done).length
  const mediaCount   = nowPlaying.length + radarrQueue.length + sonarrQueue.length + qbitQueue.length

  const switchTab = (tab) => { setActiveTab(tab); localStorage.setItem('active-tab', tab) }

  const openLeft  = () => { setLeftOpen(true);  setRightOpen(false) }
  const openRight = () => { setRightOpen(true); setLeftOpen(false)  }

  const submitSshPassword = async (password) => {
    const device = sshPromptDevice
    if (!device) return false
    try {
      const res = await fetch(`/api/disk-labels/${device.id}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password }),
      })
      if (!res.ok) return false
      const data = await res.json()
      setDiskLabels(prev => ({ ...prev, [device.id]: data }))
      setSshPromptDevice(null)
      return true
    } catch {
      return false
    }
  }

  const skipSshPrompt = () => {
    if (sshPromptDevice) sshDismissedRef.current.add(sshPromptDevice.id)
    setSshPromptDevice(null)
  }

  return (
    <div className="app">
      <div className="aurora-bg" aria-hidden />

      <div className="app-top">
        <Header
          lastUpdated={lastUpdated}
          onRefresh={fetchAll}
          online={totalOnline}
          total={totalCount}
          onLeftOpen={openLeft}
          onRightOpen={openRight}
          leftOpen={leftOpen}
          rightOpen={rightOpen}
          activeTodos={activeTodos}
          onOllamaOpen={() => { setOllamaOpen(o => !o); setKanbanOpen(false) }}
          ollamaOpen={ollamaOpen}
          onKanbanOpen={() => { setKanbanOpen(o => !o); setOllamaOpen(false) }}
          kanbanOpen={kanbanOpen}
        />

        <nav className="tab-bar">
          <button
            className={`tab-btn${activeTab === 'servers' ? ' tab-active' : ''}`}
            onClick={() => switchTab('servers')}
          >
            <Server size={13} />
            <span>Servers</span>
          </button>
          <button
            className={`tab-btn${activeTab === 'storage' ? ' tab-active' : ''}`}
            onClick={() => switchTab('storage')}
          >
            <HardDrive size={13} />
            <span>Storage</span>
          </button>
          <button
            className={`tab-btn${activeTab === 'media' ? ' tab-active' : ''}`}
            onClick={() => switchTab('media')}
          >
            <Tv size={13} />
            <span>Media</span>
            {mediaCount > 0 && <span className="tab-badge">{mediaCount}</span>}
          </button>
          <button
            className={`tab-btn${activeTab === 'games' ? ' tab-active' : ''}`}
            onClick={() => switchTab('games')}
          >
            <Gamepad2 size={13} />
            <span>Games</span>
            {gamesWishlist.length > 0 && <span className="tab-badge">{gamesWishlist.length}</span>}
          </button>
          <button
            className={`tab-btn${activeTab === 'news' ? ' tab-active' : ''}`}
            onClick={() => switchTab('news')}
          >
            <Newspaper size={13} />
            <span>News</span>
            {gotifyCount > 0 && <span className="tab-badge">{gotifyCount}</span>}
          </button>
          <button
            className={`tab-btn${activeTab === 'links' ? ' tab-active' : ''}`}
            onClick={() => switchTab('links')}
          >
            <Link2 size={13} />
            <span>Links</span>
            {links.length > 0 && <span className="tab-badge">{links.length}</span>}
          </button>
          <button
            className={`tab-btn${activeTab === 'services' ? ' tab-active' : ''}`}
            onClick={() => switchTab('services')}
          >
            <Activity size={13} />
            <span>Services</span>
          </button>
        </nav>
      </div>

      <main className="main-content">
        {activeTab === 'servers' && (
          <div className="machines-grid">
            {enrichedMachines.map(machine => (
              <MachineCard
                key={machine.id}
                machine={machine}
                services={machineServices(machine.id)}
                glances={glances[machine.id] ?? {}}
                cpuHistory={cpuHistory[machine.id] ?? []}
                docker={dockerData[machine.id] ?? null}
                models={machine.id === remoteConfig?.ai?.device ? ollamaModels : undefined}
                running={machine.id === remoteConfig?.ai?.device ? ollamaActive : undefined}
                pingStatus={services[`device_${machine.id}`] ?? null}
                noStats={machineServices(machine.id).length === 0}
                onOpenTerminal={() => setTermDevice(machine)}
                onChanged={fetchAll}
              />
            ))}
          </div>
        )}

        {activeTab === 'storage' && (
          <StorageTab machines={enrichedMachines} glances={glances} diskLabels={diskLabels} />
        )}

        {activeTab === 'media' && (
          <>
            <div className="tab-search-row tab-search-row-full">
              <div className="tab-search-wrap">
                <span className="tab-search-icon"><Search size={14} /></span>
                <input
                  className="tab-search"
                  value={mediaQuery}
                  onChange={e => setMediaQuery(e.target.value)}
                  placeholder="Search streams, downloads, requests…"
                  autoFocus
                />
                {mediaQuery && (
                  <button className="tab-search-clear" onClick={() => setMediaQuery('')} title="Clear">✕</button>
                )}
              </div>
            </div>
            {tautulliActivity
              ? <TautulliPanel activity={tautulliActivity} history={tautulliHistory} query={mediaQuery} />
              : <NowPlayingPanel sessions={nowPlaying} query={mediaQuery} />
            }
            <QueuePanel radarr={radarrQueue} sonarr={sonarrQueue} qbit={qbitQueue} query={mediaQuery} />
            <SeerrPanel query={mediaQuery} />
          </>
        )}

        {activeTab === 'games' && (
          <GamesPanel games={gamesWishlist} onUpdate={fetchGames} />
        )}

        {activeTab === 'news' && (
          <>
            <NewsPanel />
            <GotifyPanel onCount={setGotifyCount} />
          </>
        )}

        {activeTab === 'links' && (
          <LinksPanel links={links} onUpdate={fetchLinks} />
        )}

        {activeTab === 'services' && (
          <ServicesTab services={services} serviceList={serviceList} machines={enrichedMachines} />
        )}
      </main>

      <TerminalModal device={termDevice} onClose={() => setTermDevice(null)} />

      <SshPasswordModal device={sshPromptDevice} onSubmit={submitSshPassword} onSkip={skipSshPrompt} />

      <BottomDock links={links} onLinksUpdate={fetchLinks} />

      <StatusBar
        system={systemStats}
        servicesOnline={totalOnline}
        servicesTotal={totalCount}
        queueTotal={radarrQueue.length + sonarrQueue.length + qbitQueue.length}
      />

      <OllamaDrawer
        open={ollamaOpen}
        onClose={() => setOllamaOpen(false)}
        models={ollamaModels}
        running={ollamaActive}
        online={remoteConfig?.ai?.online}
        onDataChange={() => { fetchTodos(); fetchEvents(); fetchGames() }}
      />

      <KanbanBoard
        open={kanbanOpen}
        onClose={() => setKanbanOpen(false)}
      />

      <LeftPanel
        open={leftOpen}
        onClose={() => setLeftOpen(false)}
        onDeviceChange={fetchConfig}
        serviceStatus={services}
        pollMs={pollMs}
        onPollChange={ms => { setPollMs(ms); localStorage.setItem('poll-interval', ms) }}
      />

      <RightPanel
        open={rightOpen}
        onClose={() => setRightOpen(false)}
        todos={todos}
        events={[...events, ...releases]}
        onAddTodo={addTodo}
        onToggleTodo={toggleTodo}
        onDeleteTodo={deleteTodo}
        onAddEvent={addEvent}
        onDeleteEvent={deleteEvent}
        onEditEvent={editEvent}
        onEditEventOccurrence={editEventOccurrence}
      />
    </div>
  )
}
