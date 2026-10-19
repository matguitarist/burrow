import { useState, useEffect, useCallback, useRef } from 'react'
import { Gamepad2, Link2, Search, ExternalLink, Power, Terminal, RotateCw, Settings, NotebookPen, Brain, LayoutGrid, StickyNote, Clapperboard, MoreHorizontal } from 'lucide-react'
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
import CommandPalette from './components/CommandPalette.jsx'
import LoginModal from './components/LoginModal.jsx'
import { isRunning } from './components/ContainerList.jsx'
import HomeTab from './components/HomeTab.jsx'
import { orderedTabs, homeWidgets } from './layout.js'
import usePhone from './usePhone.js'

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
  const [cmdkOpen,     setCmdkOpen]     = useState(false)
  const [openGame,     setOpenGame]     = useState(null)   // appid to open in GamesPanel
  const [toast,        setToast]        = useState(null)
  const [chatPrefill,  setChatPrefill]  = useState(null)
  const [moreOpen,     setMoreOpen]     = useState(false)   // phone: overflow tabs sheet
  const phone = usePhone()
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

  // Tabs in the saved order; a hidden or unknown saved tab falls back to the first visible one
  const visibleTabs = orderedTabs(remoteConfig?.layout).filter(t => !t.hidden)
  const currentTab  = visibleTabs.some(t => t.id === activeTab) ? activeTab : visibleTabs[0]?.id
  const tabBadges   = { media: mediaCount, games: gamesWishlist.length, news: gotifyCount, links: links.length }
  // Phone: the bottom bar fits 4 tabs; the rest go in the "More" sheet
  const PHONE_TABS  = 4
  const barTabs     = phone && visibleTabs.length > PHONE_TABS + 1 ? visibleTabs.slice(0, PHONE_TABS) : visibleTabs
  const moreTabs    = visibleTabs.slice(barTabs.length)

  const renderMachines = () => (
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
  )

  const renderNowPlaying = () => tautulliActivity
    ? <TautulliPanel activity={tautulliActivity} history={tautulliHistory} query={mediaQuery} />
    : <NowPlayingPanel sessions={nowPlaying} query={mediaQuery} />

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

  // ── Command palette (⌘K) ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdkOpen(o => !o) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const showToast = (text, error = false) => {
    setToast({ text, error })
    setTimeout(() => setToast(t => (t?.text === text ? null : t)), 3500)
  }

  const openUrl = url => window.open(url, '_blank', 'noopener')

  const containerCommand = async (device, name, action) => {
    showToast(`${action === 'restart' ? 'Restarting' : action === 'stop' ? 'Stopping' : 'Starting'} ${name}…`)
    try {
      const res = await fetch(`/api/containers/${device.id}/${encodeURIComponent(name)}/${action}`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401) return showToast(`SSH to ${device.name} needs a password — use the container's controls on the Servers tab once`, true)
      if (!res.ok) return showToast(`${name}: ${data.error || 'failed'}`, true)
      showToast(`${name}: ${action} done`)
      fetchAll()
    } catch (e) { showToast(e.message, true) }
  }

  const commandItems = [
    ...serviceList.filter(s => s.url).map(s => ({
      id: `svc-${s.id}`, section: 'Services', label: `Open ${s.name}`, icon: ExternalLink, color: s.color,
      hint: services[s.id] ? (services[s.id].online ? 'up' : 'down') : null, keywords: [s.name, s.template],
      run: () => openUrl(s.url),
    })),
    ...links.map(l => ({
      id: `link-${l.id}`, section: 'Links', label: l.name, icon: Link2, color: l.color, hint: l.url.replace(/^https?:\/\//, ''),
      run: () => openUrl(l.url),
    })),
    ...visibleTabs.map(({ id, label, Icon }) => ({
      id: `tab-${id}`, section: 'Go to', label, icon: Icon, run: () => switchTab(id),
    })),
    { id: 'p-settings', section: 'Go to', label: 'Settings',        icon: Settings,    run: openLeft },
    { id: 'p-agenda',   section: 'Go to', label: 'Notes & agenda',  icon: NotebookPen, keywords: ['todo', 'calendar', 'events'], run: openRight },
    { id: 'p-chat',     section: 'Go to', label: 'AI assistant',    icon: Brain,       keywords: ['chat', 'ollama'], run: () => { setOllamaOpen(true); setKanbanOpen(false) } },
    { id: 'p-board',    section: 'Go to', label: 'Kanban board',    icon: LayoutGrid,  run: () => { setKanbanOpen(true); setOllamaOpen(false) } },
    ...enrichedMachines.flatMap(m => [
      ...(m.wol ? [{
        id: `wake-${m.id}`, section: 'Devices', label: `Wake ${m.name}`, icon: Power, color: m.accent, keywords: ['wol', 'wake on lan'],
        hint: services[`device_${m.id}`]?.online ? 'already up' : null,
        run: async () => {
          const res = await fetch(`/api/wol/${m.id}`, { method: 'POST' })
          showToast(res.ok ? `Wake-on-LAN sent to ${m.name}` : `Couldn't wake ${m.name}`, !res.ok)
        },
      }] : []),
      { id: `term-${m.id}`, section: 'Devices', label: `Terminal on ${m.name}`, icon: Terminal, color: m.accent, keywords: ['ssh'], run: () => setTermDevice(m) },
    ]),
    ...enrichedMachines.flatMap(m => (dockerData[m.id] || []).flatMap(c => isRunning(c)
      ? [{ id: `restart-${m.id}-${c.name}`, section: 'Containers', label: `Restart ${c.name}`, hint: m.name, icon: RotateCw, keywords: ['docker'],
           run: () => confirm(`Restart ${c.name} on ${m.name}?`) && containerCommand(m, c.name, 'restart') }]
      : [{ id: `start-${m.id}-${c.name}`, section: 'Containers', label: `Start ${c.name}`, hint: m.name, icon: Power, keywords: ['docker'],
           run: () => containerCommand(m, c.name, 'start') }])),
    ...gamesWishlist.filter(g => g.title).map(g => ({
      id: `game-${g.appid}`, section: 'Games', label: g.title, icon: Gamepad2, hint: g.onSale ? `-${g.discountPct}%` : g.price,
      run: () => { switchTab('games'); setOpenGame(g.appid) },
    })),
  ]

  const commandFallbacks = q => [
    { id: 'fb-media', section: 'Actions', label: `Search media for “${q}”`, icon: Clapperboard, run: () => { switchTab('media'); setMediaQuery(q) } },
    { id: 'fb-note',  section: 'Actions', label: `Add note: “${q}”`, icon: StickyNote, run: () => { addTodo(q); showToast('Note added') } },
    { id: 'fb-ask',   section: 'Actions', label: `Ask the assistant: “${q}”`, icon: Brain, run: () => { setOllamaOpen(true); setKanbanOpen(false); setChatPrefill(q) } },
  ]

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
          onCommand={() => setCmdkOpen(true)}
        />

        <nav className="tab-bar">
          {barTabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`tab-btn${currentTab === id ? ' tab-active' : ''}`}
              onClick={() => switchTab(id)}
            >
              <Icon size={13} />
              <span>{label}</span>
              {tabBadges[id] > 0 && <span className="tab-badge">{tabBadges[id]}</span>}
            </button>
          ))}
          {moreTabs.length > 0 && (
            <button
              className={`tab-btn${moreTabs.some(t => t.id === currentTab) ? ' tab-active' : ''}`}
              onClick={() => setMoreOpen(true)}
            >
              <MoreHorizontal size={13} />
              <span>{moreTabs.find(t => t.id === currentTab)?.label ?? 'More'}</span>
            </button>
          )}
        </nav>
      </div>

      <main className="main-content">
        {currentTab === 'home' && (
          <HomeTab
            widgets={homeWidgets(remoteConfig?.layout)}
            render={{
              machines:   renderMachines,
              nowplaying: renderNowPlaying,
              downloads:  () => <QueuePanel radarr={radarrQueue} sonarr={sonarrQueue} qbit={qbitQueue} query="" />,
              requests:   () => <SeerrPanel query="" />,
              news:       () => <NewsPanel />,
            }}
            health={services}
            serviceList={serviceList}
            machines={enrichedMachines}
            events={[...events, ...releases]}
            games={gamesWishlist}
            onOpenGame={appid => { switchTab('games'); setOpenGame(appid) }}
          />
        )}

        {currentTab === 'servers' && renderMachines()}

        {currentTab === 'storage' && (
          <StorageTab machines={enrichedMachines} glances={glances} diskLabels={diskLabels} />
        )}

        {currentTab === 'media' && (
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
            {renderNowPlaying()}
            <QueuePanel radarr={radarrQueue} sonarr={sonarrQueue} qbit={qbitQueue} query={mediaQuery} />
            <SeerrPanel query={mediaQuery} />
          </>
        )}

        {currentTab === 'games' && (
          <GamesPanel games={gamesWishlist} onUpdate={fetchGames} openAppid={openGame} onOpened={() => setOpenGame(null)} />
        )}

        {currentTab === 'news' && (
          <>
            <NewsPanel />
            <GotifyPanel onCount={setGotifyCount} />
          </>
        )}

        {currentTab === 'links' && (
          <LinksPanel links={links} onUpdate={fetchLinks} />
        )}

        {currentTab === 'services' && (
          <ServicesTab services={services} serviceList={serviceList} machines={enrichedMachines} />
        )}
      </main>

      <TerminalModal device={termDevice} onClose={() => setTermDevice(null)} />

      {moreOpen && (
        <div className="more-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="more-sheet" onClick={e => e.stopPropagation()}>
            <div className="more-grid">
              {moreTabs.map(({ id, label, Icon }) => (
                <button key={id} className={`more-item${currentTab === id ? ' active' : ''}`} onClick={() => { switchTab(id); setMoreOpen(false) }}>
                  <Icon size={18} /><span>{label}</span>
                  {tabBadges[id] > 0 && <span className="tab-badge">{tabBadges[id]}</span>}
                </button>
              ))}
            </div>
            <div className="more-grid more-shortcuts">
              <button className="more-item" onClick={() => { setMoreOpen(false); setCmdkOpen(true) }}><Search size={18} /><span>Search</span></button>
              <button className="more-item" onClick={() => { setMoreOpen(false); openRight() }}><NotebookPen size={18} /><span>Notes</span></button>
              <button className="more-item" onClick={() => { setMoreOpen(false); setKanbanOpen(true); setOllamaOpen(false) }}><LayoutGrid size={18} /><span>Board</span></button>
              <button className="more-item" onClick={() => { setMoreOpen(false); openLeft() }}><Settings size={18} /><span>Settings</span></button>
            </div>
          </div>
        </div>
      )}

      <LoginModal />

      <CommandPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} items={commandItems} fallbacks={commandFallbacks} />
      {toast && <div className={`toast${toast.error ? ' toast-error' : ''}`}>{toast.text}</div>}

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
        prefill={chatPrefill}
        onPrefillConsumed={() => setChatPrefill(null)}
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
