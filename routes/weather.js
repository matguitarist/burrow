import { Router } from 'express'
import { getSettings, proxyGet } from './lib.js'

const router = Router()

// ── Weather — Open-Meteo proxy with 30-min cache ──────────────────────────────
let _weatherCache = null, _weatherCacheAt = 0

function wmoDescription(code) {
  const c = code ?? 0
  if (c === 0)  return { label: 'Clear sky',        icon: '☀️' }
  if (c === 1)  return { label: 'Mainly clear',     icon: '🌤️' }
  if (c === 2)  return { label: 'Partly cloudy',    icon: '⛅' }
  if (c === 3)  return { label: 'Overcast',         icon: '☁️' }
  if (c <= 48)  return { label: 'Foggy',            icon: '🌫️' }
  if (c <= 55)  return { label: 'Drizzle',          icon: '🌦️' }
  if (c <= 57)  return { label: 'Freezing drizzle', icon: '🌧️' }
  if (c <= 65)  return { label: 'Rain',             icon: '🌧️' }
  if (c <= 67)  return { label: 'Freezing rain',    icon: '🌧️' }
  if (c <= 75)  return { label: 'Snow',             icon: '❄️' }
  if (c === 77) return { label: 'Snow grains',      icon: '🌨️' }
  if (c <= 82)  return { label: 'Rain showers',     icon: '🌦️' }
  if (c <= 86)  return { label: 'Snow showers',     icon: '🌨️' }
  if (c <= 99)  return { label: 'Thunderstorm',     icon: '⛈️' }
  return { label: 'Unknown', icon: '🌡️' }
}

router.post('/weather/refresh', (_req, res) => {
  _weatherCache = null
  _weatherCacheAt = 0
  res.json({ ok: true })
})

router.get('/weather', async (_req, res) => {
  const { lat, lon } = getSettings().weather
  if (!lat || !lon) return res.json({ configured: false })
  if (_weatherCache && Date.now() - _weatherCacheAt < 30 * 60 * 1000) {
    return res.json({ ..._weatherCache, cached: true })
  }
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weathercode,windspeed_10m,relative_humidity_2m` +
      `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max` +
      `&timezone=auto&forecast_days=6`
    const data = await proxyGet(url, {}, 10000)
    const c = data.current
    const { label, icon } = wmoDescription(c.weathercode)
    const unit = data.current_units?.temperature_2m || '°C'
    const forecast = (data.daily?.time || []).map((date, i) => ({
      date,
      icon:      wmoDescription(data.daily.weathercode?.[i]).icon,
      label:     wmoDescription(data.daily.weathercode?.[i]).label,
      maxTemp:   Math.round(data.daily.temperature_2m_max?.[i] ?? 0),
      minTemp:   Math.round(data.daily.temperature_2m_min?.[i] ?? 0),
      precipPct: data.daily.precipitation_probability_max?.[i] ?? 0,
    }))
    _weatherCache = {
      configured: true,
      temp: Math.round(c.temperature_2m),
      unit,
      wind: Math.round(c.windspeed_10m),
      humidity: Math.round(c.relative_humidity_2m ?? 0),
      label, icon, forecast,
    }
    _weatherCacheAt = Date.now()
    res.json(_weatherCache)
  } catch (e) {
    if (_weatherCache) return res.json({ ..._weatherCache, cached: true })
    res.status(503).json({ configured: true, error: e.message })
  }
})

export default router
