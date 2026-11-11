import { useState, useEffect, useRef } from 'react'
import { Globe2, RefreshCw, Menu, LayoutList, Brain, Power, RotateCw, LayoutGrid, Search } from 'lucide-react'
import { loc } from '../locale.js'

function fmtDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const diff = Math.round((d - today) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return d.toLocaleDateString(loc(), { weekday: 'short' })
}

export default function Header({ lastUpdated, onRefresh, online, total, onLeftOpen, onRightOpen, leftOpen, rightOpen, activeTodos, onOllamaOpen, ollamaOpen, onKanbanOpen, kanbanOpen, onCommand, variant = 'phone', title, subtitle }) {
  const [now,          setNow]          = useState(new Date())
  const [spinning,     setSpinning]     = useState(false)
  const [restarting,   setRestarting]   = useState(false)
  const [weather,        setWeather]        = useState(null)
  const [forecastOpen,   setForecastOpen]   = useState(false)
  const [weatherRefresh, setWeatherRefresh] = useState(false)
  const popupRef = useRef(null)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const loadWeather = () =>
    fetch('/api/weather').then(r => r.json()).then(d => { if (d.configured) setWeather(d) }).catch(() => {})

  useEffect(() => {
    loadWeather()
    const id = setInterval(loadWeather, 30 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const handleWeatherRefresh = async () => {
    setWeatherRefresh(true)
    await fetch('/api/weather/refresh', { method: 'POST' }).catch(() => {})
    await loadWeather()
    setWeatherRefresh(false)
  }

  useEffect(() => {
    if (!forecastOpen) return
    const handler = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setForecastOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [forecastOpen])

  const handleRefresh = async () => {
    setSpinning(true)
    await onRefresh()
    setSpinning(false)
  }

  const handleRestart = async () => {
    if (!confirm('Restart the server?')) return
    setRestarting(true)
    try { await fetch('/api/server/restart', { method: 'POST' }) } catch {}
    const poll = setInterval(async () => {
      try {
        await fetch('/api/config')
        clearInterval(poll)
        window.location.reload()
      } catch {}
    }, 1500)
  }

  const timeStr = now.toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' })
  const dateStr = now.toLocaleDateString(loc(), { weekday: 'short', month: 'short', day: 'numeric' })

  const today = weather?.forecast?.[0]

  const weatherEl = weather && (
          <div className="weather-wrap" ref={popupRef}>
            <button
              className={`header-weather-btn${forecastOpen ? ' active' : ''}`}
              onClick={() => setForecastOpen(o => !o)}
              title="Click for forecast"
            >
              <span className="weather-icon">{weather.icon}</span>
              <span className="weather-temp">{weather.temp}{weather.unit}</span>
            </button>

            {forecastOpen && (
              <div className="weather-popup">
                <div className="wpc-header">
                  <span className="wpc-title">Weather</span>
                  <button
                    className="wpc-refresh-btn"
                    onClick={handleWeatherRefresh}
                    disabled={weatherRefresh}
                    title="Refresh weather"
                  >
                    <RotateCw size={12} className={weatherRefresh ? 'spin' : ''} />
                  </button>
                </div>
                <div className="wpc-today">
                  <div className="wpc-today-icon">{weather.icon}</div>
                  <div className="wpc-today-info">
                    <span className="wpc-label">{weather.label}</span>
                    <span className="wpc-temp-big">{weather.temp}{weather.unit}</span>
                    {today && (
                      <span className="wpc-range">
                        {today.minTemp}° – {today.maxTemp}°
                        {today.precipPct > 0 && <> · {today.precipPct}% rain</>}
                      </span>
                    )}
                    <span className="wpc-meta">
                      Wind {weather.wind} km/h · Humidity {weather.humidity}%
                    </span>
                  </div>
                </div>

                {weather.forecast?.length > 1 && (
                  <div className="wpc-forecast">
                    {weather.forecast.slice(1).map(day => (
                      <div key={day.date} className="wpc-day">
                        <span className="wpc-day-name">{fmtDay(day.date)}</span>
                        <span className="wpc-day-icon">{day.icon}</span>
                        <span className="wpc-day-range">
                          <span className="wpc-day-hi">{day.maxTemp}°</span>
                          <span className="wpc-day-lo">{day.minTemp}°</span>
                        </span>
                        {day.precipPct > 0 && (
                          <span className="wpc-day-rain">{day.precipPct}%</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )

  // Desktop: a slim toolbar over the content. The page title says where you are;
  // navigation and tools live in the sidebar.
  if (variant === 'toolbar') return (
    <header className="toolbar">
      <div className="toolbar-title">
        <h1>{title}</h1>
        {subtitle && <span className="toolbar-subtitle">{subtitle}</span>}
      </div>
      <div className="toolbar-right">
        <button className="toolbar-search" onClick={onCommand} title="Search and actions (⌘K)">
          <Search size={14} />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </button>
        {weatherEl}
        <div className="toolbar-clock" title={now.toLocaleDateString(loc(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}>
          <span className="clock-time">{timeStr}</span>
          <span className="clock-date">{dateStr}</span>
        </div>
      </div>
    </header>
  )

  return (
    <header className="header">
      <div className="header-left">
        <button
          className={`header-hamburger${leftOpen ? ' active' : ''}`}
          onClick={onLeftOpen}
          title="Settings"
        >
          <Menu size={16} />
        </button>
        <div className="logo">
          <Globe2 size={20} />
        </div>
        <div>
          <h1 className="header-title">Burrow</h1>
        </div>
      </div>

      <div className="header-clock">
        <span className="clock-time">{timeStr}</span>
        <span className="clock-date">{dateStr}</span>
      </div>

      <div className="header-right">
        <button className="ollama-header-btn cmdk-trigger" onClick={onCommand} title="Search and actions (⌘K)">
          <Search size={15} />
          <kbd>⌘K</kbd>
        </button>

        <button
          className={`ollama-header-btn${ollamaOpen ? ' active' : ''}`}
          onClick={onOllamaOpen}
          title="AI Assistant"
        >
          <Brain size={15} />
          <span>AI</span>
        </button>

        <button
          className={`ollama-header-btn header-board-btn${kanbanOpen ? ' active' : ''}`}
          onClick={onKanbanOpen}
          title="Kanban Board"
        >
          <LayoutGrid size={15} />
          <span>Board</span>
        </button>

        {weatherEl}

        <div className="header-actions">
          <button className="icon-btn" onClick={handleRefresh} disabled={spinning}
            title={lastUpdated ? `Refresh data (updated ${lastUpdated.toLocaleTimeString(loc())})` : 'Refresh data'}>
            <RefreshCw size={14} className={spinning ? 'spin' : ''} />
          </button>
          <button className={`icon-btn${restarting ? ' header-restarting' : ''}`} onClick={handleRestart} disabled={restarting} title="Restart server">
            <Power size={14} />
          </button>
          <button
            className={`panel-toggle-btn${rightOpen ? ' active' : ''}`}
            onClick={onRightOpen}
            title="To-Do & Agenda"
          >
            <LayoutList size={15} />
            {activeTodos > 0 && (
              <span className="panel-badge">{activeTodos > 9 ? '9+' : activeTodos}</span>
            )}
          </button>
        </div>
      </div>
    </header>
  )
}
