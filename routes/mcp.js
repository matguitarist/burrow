import { spawn } from 'node:child_process'

// Minimal MCP stdio client (JSON-RPC 2.0 over newline-delimited stdin/stdout)
class McpClient {
  constructor(command, args) {
    this._command = command
    this._args    = args
    this._proc    = null
    this._buf     = ''
    this._pending = new Map()
    this._id      = 1
    this._ready   = false
    this._initProm = null
  }

  _write(obj) {
    try { this._proc?.stdin?.write(JSON.stringify(obj) + '\n') } catch {}
  }

  _onData(chunk) {
    this._buf += chunk.toString()
    let nl
    while ((nl = this._buf.indexOf('\n')) !== -1) {
      const line = this._buf.slice(0, nl).trim()
      this._buf  = this._buf.slice(nl + 1)
      if (!line) continue
      try {
        const msg = JSON.parse(line)
        if (msg.id !== undefined) {
          const p = this._pending.get(msg.id)
          if (p) {
            this._pending.delete(msg.id)
            msg.error
              ? p.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)))
              : p.resolve(msg.result)
          }
        }
      } catch {}
    }
  }

  _reset() {
    this._proc     = null
    this._ready    = false
    this._initProm = null
    this._buf      = ''
    this._pending.forEach(p => p.reject(new Error('MCP process closed')))
    this._pending.clear()
  }

  connect() {
    if (this._ready)    return Promise.resolve()
    if (this._initProm) return this._initProm

    this._initProm = new Promise((resolve, reject) => {
      let done = false
      const finish = err => { if (!done) { done = true; err ? reject(err) : resolve() } }
      const timer = setTimeout(() => { this._proc?.kill(); finish(new Error('MCP init timeout')) }, 15_000)

      try {
        this._proc = spawn(this._command, this._args, {
          stdio: ['pipe', 'pipe', 'ignore'],
          env:   process.env,
        })
      } catch (e) { clearTimeout(timer); finish(e); return }

      this._proc.stdout.on('data', d => this._onData(d))
      this._proc.on('error', err => { this._reset(); clearTimeout(timer); finish(err) })
      this._proc.on('close', () => this._reset())

      const id = this._id++
      this._pending.set(id, {
        resolve: () => {
          // Send initialized notification required by MCP spec
          this._write({ jsonrpc: '2.0', method: 'notifications/initialized' })
          this._ready = true
          clearTimeout(timer); finish()
        },
        reject: err => { clearTimeout(timer); finish(err) },
      })
      this._write({
        jsonrpc: '2.0', id, method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities:    {},
          clientInfo:      { name: 'burrow', version: '1.0' },
        },
      })
    })
    return this._initProm
  }

  async call(toolName, args) {
    await this.connect()
    return new Promise((resolve, reject) => {
      const id    = this._id++
      const timer = setTimeout(() => {
        this._pending.delete(id)
        reject(new Error(`MCP "${toolName}" timed out`))
      }, 30_000)
      this._pending.set(id, {
        resolve: result => {
          clearTimeout(timer)
          // MCP tool results are an array of typed content blocks
          const text = (result?.content ?? [])
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n')
          resolve(text || JSON.stringify(result))
        },
        reject: err => { clearTimeout(timer); reject(err) },
      })
      this._write({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: toolName, arguments: args } })
    })
  }
}

// One persistent client per server (keyed by command + args)
const _pool = new Map()
export function mcpClient(command, args) {
  const key = [command, ...args].join('\0')
  if (!_pool.has(key)) _pool.set(key, new McpClient(command, args))
  return _pool.get(key)
}
