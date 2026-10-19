import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Terminal as TerminalIcon, X, Eye, EyeOff, Loader } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export default function TerminalModal({ device, onClose }) {
  const [status,   setStatus]   = useState('form')   // form | connecting | connected | error | closed
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [hasKey,   setHasKey]   = useState(null)     // null=loading, true, false
  const [errMsg,   setErrMsg]   = useState('')

  const termDivRef = useRef(null)
  const xtermRef   = useRef(null)
  const fitRef     = useRef(null)
  const wsRef      = useRef(null)
  const bufRef     = useRef([])

  // Reset when device changes
  useEffect(() => {
    if (!device) return
    setStatus('form')
    setErrMsg('')
    setPassword('')
    setUsername(device.sshUser || '')
    bufRef.current = []

    fetch('/api/terminal/has-key')
      .then(r => r.json())
      .then(d => setHasKey(d.hasKey))
      .catch(() => setHasKey(false))

    return () => {
      wsRef.current?.close()
      xtermRef.current?.dispose()
      xtermRef.current = null
    }
  }, [device])

  // Init xterm.js once status becomes 'connected'
  useEffect(() => {
    if (status !== 'connected' || !termDivRef.current) return

    const term = new Terminal({
      theme: {
        background:          '#0a0a14',
        foreground:          '#e2e8f0',
        cursor:              '#818cf8',
        cursorAccent:        '#0a0a14',
        selectionBackground: 'rgba(129,140,248,0.25)',
        black:   '#1e1e2e', red:     '#f87171', green:  '#34d399', yellow: '#fbbf24',
        blue:    '#60a5fa', magenta: '#c084fc', cyan:   '#22d3ee', white:  '#e2e8f0',
        brightBlack:   '#45475a', brightRed:   '#f38ba8', brightGreen: '#a6e3a1',
        brightYellow:  '#f9e2af', brightBlue:  '#89b4fa', brightMagenta:'#cba6f7',
        brightCyan:    '#89dceb', brightWhite: '#cdd6f4',
      },
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', 'Courier New', monospace",
      fontSize:   13,
      lineHeight: 1.35,
      cursorBlink: true,
      scrollback:  5000,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(termDivRef.current)

    requestAnimationFrame(() => {
      fit.fit()
      // Flush buffered output that arrived before xterm was ready
      for (const chunk of bufRef.current) term.write(chunk)
      bufRef.current = []
      // Tell server our actual size
      const ws = wsRef.current
      if (ws?.readyState === 1) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
    })

    xtermRef.current = term
    fitRef.current   = fit

    // Keystrokes → server
    term.onData(data => {
      wsRef.current?.send(JSON.stringify({ type: 'data', data }))
    })

    // Auto-resize on container size change
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
        wsRef.current?.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      } catch {}
    })
    ro.observe(termDivRef.current)

    return () => {
      ro.disconnect()
      term.dispose()
      xtermRef.current = null
      fitRef.current   = null
    }
  }, [status])

  const connect = () => {
    setStatus('connecting')
    setErrMsg('')
    bufRef.current = []

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${location.host}/ws/terminal?device=${device.id}`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', username, password }))
    }

    ws.onmessage = evt => {
      const msg = JSON.parse(evt.data)
      if (msg.type === 'output') {
        if (xtermRef.current) xtermRef.current.write(msg.data)
        else bufRef.current.push(msg.data)
      } else if (msg.type === 'ready') {
        setStatus('connected')
      } else if (msg.type === 'error') {
        setErrMsg(msg.message)
        setStatus('error')
      } else if (msg.type === 'closed') {
        setStatus('closed')
      }
    }

    ws.onerror  = () => { setErrMsg('WebSocket connection failed'); setStatus('error') }
    ws.onclose  = () => { if (status === 'connecting') { setErrMsg('Connection closed unexpectedly'); setStatus('error') } }
  }

  const handleClose = () => {
    wsRef.current?.close()
    xtermRef.current?.dispose()
    xtermRef.current = null
    onClose()
  }

  const reconnect = () => {
    wsRef.current?.close()
    xtermRef.current?.dispose()
    xtermRef.current = null
    bufRef.current = []
    setStatus('form')
    setErrMsg('')
  }

  if (!device) return null

  const keyHint = hasKey === true

  return createPortal(
    <div className="term-backdrop" onClick={handleClose}>
      <div className="term-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="term-header">
          <div className="term-header-left">
            <TerminalIcon size={14} style={{ color: '#818cf8' }} />
            <span className="term-title">{device.name}</span>
            <span className="term-ip">{username ? `${username}@${device.ip}` : device.ip}</span>
            {status === 'connected'   && <span className="term-badge term-badge-ok">Connected</span>}
            {status === 'connecting'  && <span className="term-badge term-badge-wait">Connecting…</span>}
            {status === 'closed'      && <span className="term-badge term-badge-off">Closed</span>}
          </div>
          <button className="icon-btn" onClick={handleClose} title="Close">
            <X size={14} />
          </button>
        </div>

        {/* Connect form */}
        {(status === 'form' || status === 'error') && (
          <div className="term-form">
            {status === 'error' && (
              <div className="term-error-msg">
                <span>✗ {errMsg}</span>
              </div>
            )}

            <div className="term-fields">
              <div className="term-field">
                <label>Username</label>
                <input
                  className="term-input"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="root"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && connect()}
                />
              </div>
              <div className="term-field">
                <label>
                  Password
                  {keyHint && <span className="term-key-hint">SSH key found — leave blank to use it</span>}
                </label>
                <div className="term-pw-wrap">
                  <input
                    className="term-input"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={keyHint ? 'Optional — leave blank for key auth' : 'Password'}
                    onKeyDown={e => e.key === 'Enter' && connect()}
                  />
                  <button className="term-eye" type="button" onClick={() => setShowPw(s => !s)}>
                    {showPw ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="term-form-actions">
              <button className="term-btn-cancel" onClick={handleClose}>Cancel</button>
              <button
                className="term-btn-connect"
                onClick={connect}
                disabled={!username.trim() && !device.sshUser}
              >
                Connect
              </button>
            </div>
          </div>
        )}

        {/* Connecting spinner */}
        {status === 'connecting' && (
          <div className="term-connecting">
            <Loader size={20} className="spin" style={{ color: '#818cf8' }} />
            <span>Connecting to {device.ip}…</span>
          </div>
        )}

        {/* Terminal */}
        <div
          className="term-xterm-wrap"
          ref={termDivRef}
          style={{ display: status === 'connected' ? 'block' : 'none' }}
        />

        {/* Closed / disconnected */}
        {status === 'closed' && (
          <div className="term-connecting">
            <span style={{ color: 'var(--muted)' }}>Session ended.</span>
            <button className="term-btn-connect" onClick={reconnect} style={{ marginTop: 12 }}>
              Reconnect
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
