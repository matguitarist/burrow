import http from 'node:http'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Settings and the data dir are set up in routes/lib.js (BURROW_DATA_DIR).
import dataRouter     from './routes/data.js'
import systemRouter   from './routes/system.js'
import weatherRouter  from './routes/weather.js'
import gotifyRouter   from './routes/gotify.js'
import settingsRouter from './routes/settings.js'
import servicesRouter from './routes/services.js'
import mediaRouter    from './routes/media.js'
import gamesRouter    from './routes/games.js'
import newsRouter     from './routes/news.js'
import ollamaRouter   from './routes/ollama.js'
import kanbanRouter   from './routes/kanban.js'
import containersRouter from './routes/containers.js'
import { scheduleDailyPriceRefresh } from './routes/games.js'
import { setupTerminalWs } from './routes/terminal.js'
import { getDevices, IMAGES_DIR } from './routes/lib.js'

const app = express()
app.use(cors())
app.use(express.json())

app.use('/api', dataRouter)
app.use('/api', systemRouter)
app.use('/api', weatherRouter)
app.use('/api', gotifyRouter)
app.use('/api', settingsRouter)
app.use('/api', servicesRouter)
app.use('/api', mediaRouter)
app.use('/api', gamesRouter)
app.use('/api', newsRouter)
app.use('/api', ollamaRouter)
app.use('/api', kanbanRouter)
app.use('/api', containersRouter)

// Generated images (Draw Things) — served as plain static files
app.use('/api/images', express.static(IMAGES_DIR))

// Static frontend (production build)
const distDir = join(__dirname, 'dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (_req, res) => res.sendFile(join(distDir, 'index.html')))
}

const httpServer = http.createServer(app)
setupTerminalWs(httpServer)

const PORT = parseInt(process.env.PORT || '3001')
httpServer.listen(PORT, () => {
  const devices = getDevices()
  console.log(`  Burrow → http://localhost:${PORT}${existsSync(distDir) ? '' : ' (API only — run npm run build for UI)'}`)
  devices.forEach(d => console.log(`  ${d.name.padEnd(14)}: ${d.ip}`))
  scheduleDailyPriceRefresh()
})
