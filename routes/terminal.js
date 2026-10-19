import { WebSocketServer } from 'ws'
import { Client as SshClient } from 'ssh2'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { getDevices } from './lib.js'

// Duplicate findSshKey here to avoid circular dependency with system.js
function findSshKey() {
  const candidates = [
    join(homedir(), '.ssh', 'id_ed25519'),
    join(homedir(), '.ssh', 'id_rsa'),
    join(homedir(), '.ssh', 'id_ecdsa'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      try { return readFileSync(p) } catch {}
    }
  }
  return null
}

export function setupTerminalWs(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/terminal' })

  wss.on('connection', (ws, req) => {
    const params   = new URL(req.url, 'http://x').searchParams
    const deviceId = params.get('device')
    const device   = getDevices().find(d => d.id === deviceId)

    const send = obj => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)) }

    if (!device) { send({ type: 'error', message: 'Unknown device' }); ws.close(); return }

    let conn = null
    let stream = null

    const startShell = (cols, rows) => {
      conn.shell({ term: 'xterm-256color', cols: cols || 220, rows: rows || 50 }, (err, sh) => {
        if (err) { send({ type: 'error', message: err.message }); conn.end(); return }
        stream = sh
        send({ type: 'ready' })

        sh.on('data',        data => send({ type: 'output', data: data.toString('utf8') }))
        sh.stderr.on('data', data => send({ type: 'output', data: data.toString('utf8') }))
        sh.on('close', () => { send({ type: 'closed' }); ws.close() })
      })
    }

    const doConnect = ({ username, password, cols, rows }) => {
      conn = new SshClient()

      conn.on('ready', () => startShell(cols, rows))
      conn.on('error', err => send({ type: 'error', message: err.message }))

      const autoKey = !password && findSshKey()
      conn.connect({
        host:         device.ip,
        port:         device.sshPort || 22,
        username:     username || device.sshUser || 'root',
        readyTimeout: 10_000,
        ...(autoKey    ? { privateKey: autoKey }  : {}),
        ...(password   ? { password }             : {}),
      })
    }

    // First message from client must be the auth packet
    ws.once('message', raw => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'auth') doConnect(msg)
      } catch { send({ type: 'error', message: 'Bad auth packet' }); ws.close() }
    })

    // Subsequent messages: keystrokes and resize
    ws.on('message', raw => {
      if (!stream) return
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'data')   stream.write(msg.data)
        if (msg.type === 'resize') stream.setWindow(msg.rows, msg.cols, 0, 0)
      } catch {}
    })

    ws.on('close', () => { conn?.end() })
  })
}
