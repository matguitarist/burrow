import { useState, useRef, useEffect } from 'react'
import { Brain, Send, Trash2, ChevronDown, Square, Zap, X, Download, Trash, Film, Tv, UserRound, Save, MapPin, Menu, Plus, MessageSquare, Pencil } from 'lucide-react'
import { loc } from '../locale.js'

function useCollapse(key, defaultOpen = true) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(key) !== '0' } catch { return defaultOpen }
  })
  const toggle = () => setOpen(o => {
    const next = !o
    try { localStorage.setItem(key, next ? '1' : '0') } catch {}
    return next
  })
  return [open, toggle]
}

function fmtModelName(name = '') {
  return name.split(':')[0].split('/').pop()
}

function inlineFormat(text) {
  const parts = []
  const re = /(`[^`]+`|\*\*([^*]+)\*\*|\*([^*]+)\*)/g
  let last = 0, m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[0].startsWith('`'))  parts.push(<code key={m.index} className="md-code">{m[0].slice(1,-1)}</code>)
    else if (m[0].startsWith('**')) parts.push(<strong key={m.index}>{m[2]}</strong>)
    else                            parts.push(<em key={m.index}>{m[3]}</em>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length ? parts : text
}

function Markdown({ text }) {
  if (!text) return null
  const blocks = []
  let rest = text, key = 0
  while (rest.length) {
    const fence = rest.indexOf('```')
    if (fence === -1) { blocks.push(<TextBlock key={key++} text={rest} />); break }
    if (fence > 0)    blocks.push(<TextBlock key={key++} text={rest.slice(0, fence)} />)
    const end = rest.indexOf('```', fence + 3)
    if (end === -1)   { blocks.push(<TextBlock key={key++} text={rest} />); break }
    const inner = rest.slice(fence + 3, end)
    const nl    = inner.indexOf('\n')
    const code  = nl >= 0 ? inner.slice(nl + 1) : inner
    const lang  = nl >= 0 ? inner.slice(0, nl).trim() : ''
    blocks.push(
      <div key={key++} className="md-fence">
        {lang && <span className="md-lang">{lang}</span>}
        <pre><code>{code.replace(/\n$/, '')}</code></pre>
      </div>
    )
    rest = rest.slice(end + 3)
  }
  return <>{blocks}</>
}

function TextBlock({ text }) {
  const lines = text.split('\n')
  const out = []
  let listBuf = [], listKey = 0
  const flushList = () => {
    if (listBuf.length) { out.push(<ul key={`ul${listKey++}`} className="md-ul">{listBuf}</ul>); listBuf = [] }
  }
  lines.forEach((line, i) => {
    if (/^#{1,3} /.test(line)) {
      flushList()
      const lvl = line.match(/^(#+)/)[1].length
      const txt = line.replace(/^#+\s/, '')
      out.push(lvl === 1
        ? <h3 key={i} className="md-h1">{inlineFormat(txt)}</h3>
        : lvl === 2
          ? <h4 key={i} className="md-h2">{inlineFormat(txt)}</h4>
          : <h5 key={i} className="md-h3">{inlineFormat(txt)}</h5>)
    } else if (/^[-*] /.test(line)) {
      listBuf.push(<li key={i}>{inlineFormat(line.slice(2))}</li>)
    } else if (/^\d+\. /.test(line)) {
      listBuf.push(<li key={i}>{inlineFormat(line.replace(/^\d+\.\s/, ''))}</li>)
    } else if (line.trim() === '') {
      flushList(); out.push(<div key={i} className="md-gap" />)
    } else {
      flushList(); out.push(<p key={i} className="md-p">{inlineFormat(line)}</p>)
    }
  })
  flushList()
  return <>{out}</>
}

const STYLE_OPTS = [
  { value: '',                        label: 'Default' },
  { value: 'brief and direct',        label: 'Brief & direct' },
  { value: 'detailed and thorough',   label: 'Detailed & thorough' },
  { value: 'casual and friendly',     label: 'Casual & friendly' },
  { value: 'formal and professional', label: 'Formal & professional' },
]

function CustomSelect({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const label = STYLE_OPTS.find(o => o.value === value)?.label ?? 'Default'
  return (
    <div className="csel" ref={ref}>
      <button type="button" className="csel-trigger pull-input" onClick={() => setOpen(o => !o)}>
        <span>{label}</span>
        <ChevronDown size={11} style={{ flexShrink: 0, transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div className="csel-menu">
          {STYLE_OPTS.map(o => (
            <button key={o.value} type="button"
              className={`csel-option${o.value === value ? ' csel-option-active' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false) }}
            >{o.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function ChoicesPicker({ items }) {
  const [results, setResults] = useState({})
  const pick = async (item) => {
    if (results[item.id]) return
    setResults(prev => ({ ...prev, [item.id]: 'loading' }))
    try {
      const res = await fetch('/api/seerr/request-direct', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId: item.id, mediaType: item.mediaType }),
      })
      const d = await res.json()
      setResults(prev => ({ ...prev, [item.id]: res.ok ? 'ok' : (d.already ? 'already' : 'error') }))
    } catch { setResults(prev => ({ ...prev, [item.id]: 'error' })) }
  }
  return (
    <div className="seerr-picker">
      <p className="seerr-picker-label">Multiple results — pick one:</p>
      {items.map(item => {
        const state = results[item.id], done = state && state !== 'loading'
        return (
          <button key={item.id} className={`seerr-pick-btn${done ? ' seerr-pick-done' : ''}`} onClick={() => pick(item)} disabled={!!state}>
            <span className="seerr-pick-icon">{item.mediaType === 'tv' ? <Tv size={11}/> : <Film size={11}/>}</span>
            <span className="seerr-pick-title">{item.title}{item.year ? ` (${item.year})` : ''}</span>
            <span className={`seerr-pick-state seerr-pick-${state || 'idle'}`}>
              {state === 'loading' ? '…' : state === 'ok' ? '✓ Requested' : state === 'already' ? '↩ Already requested' : state === 'error' ? '✗ Failed' : ''}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function GameChoicesPicker({ items, onAdded }) {
  const [results, setResults] = useState({})
  const pick = async (item) => {
    if (results[item.appid]) return
    setResults(prev => ({ ...prev, [item.appid]: 'loading' }))
    try {
      const res = await fetch('/api/games', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appid: item.appid }),
      })
      const d = await res.json()
      setResults(prev => ({ ...prev, [item.appid]: res.ok ? 'ok' : (d.already ? 'already' : 'error') }))
      if (res.ok) onAdded?.()
    } catch { setResults(prev => ({ ...prev, [item.appid]: 'error' })) }
  }
  return (
    <div className="seerr-picker">
      <p className="seerr-picker-label">Multiple results — pick one:</p>
      {items.map(item => {
        const state = results[item.appid], done = state && state !== 'loading'
        return (
          <button key={item.appid} className={`seerr-pick-btn${done ? ' seerr-pick-done' : ''}`} onClick={() => pick(item)} disabled={!!state}>
            {item.tinyImage && <img src={item.tinyImage} alt="" className="game-pick-img" />}
            <span className="seerr-pick-title">{item.title}{item.price ? ` — ${item.price}` : ''}</span>
            <span className={`seerr-pick-state seerr-pick-${state || 'idle'}`}>
              {state === 'loading' ? '…' : state === 'ok' ? '✓ Added' : state === 'already' ? '↩ Already added' : state === 'error' ? '✗ Failed' : ''}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function ChatMessage({ role, content, streaming, error, toolLabel, choices, gameChoices, image, note, onDataChange }) {
  const isUser   = role === 'user'
  const showTool = streaming && toolLabel && !content
  return (
    <div className={`chat-msg ${isUser ? 'chat-msg-user' : 'chat-msg-assistant'}${error ? ' chat-msg-error' : ''}`}>
      {!isUser && <div className="chat-avatar"><Brain size={11} /></div>}
      <div className="chat-bubble">
        {showTool ? (
          <p className="chat-tool-label"><Zap size={10} /> {toolLabel}</p>
        ) : isUser || error ? (
          <p className="chat-text">
            {content || (streaming ? '' : '…')}
            {streaming && <span className="chat-cursor" />}
          </p>
        ) : (
          <div className="chat-text chat-md">
            {image && <img src={image} alt="" className="chat-gen-image" />}
            {content ? <Markdown text={content} /> : streaming ? null : '…'}
            {streaming && <span className="chat-cursor" />}
            {!streaming && choices?.length > 0 && <ChoicesPicker items={choices} />}
            {!streaming && gameChoices?.length > 0 && <GameChoicesPicker items={gameChoices} onAdded={onDataChange} />}
            {!streaming && note && <p className="chat-note">{note}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Multi-chat & persona system ───────────────────────────────────────────────
const CHATS_KEY    = 'ollama-chats'
const PERSONAS_KEY = 'ollama-personas'

const DEFAULT_PERSONAS = [
  {
    id: 'livia',
    name: 'Livia',
    description: 'Gaming historian & enthusiast',
    emoji: '🎮',
    agentName: 'Livia',
    agentGender: 'female',
    style: 'casual and friendly',
    language: '',
    instructions: "You are Livia, a passionate gaming historian with encyclopedic knowledge of video game history, culture, and development — from Pong to modern AAA titles and indie gems. You love discussing retro games, genre evolution, and the stories behind iconic titles. Bring up interesting historical trivia naturally and with genuine enthusiasm.",
  },
  {
    id: 'james',
    name: 'James',
    description: 'Senior software engineer',
    emoji: '💻',
    agentName: 'James',
    agentGender: 'male',
    style: 'detailed and thorough',
    language: '',
    instructions: "You are James, a senior software engineer with deep expertise across multiple languages, system design, and engineering best practices. Give precise, well-structured answers with code examples when relevant. Think through problems methodically and don't shy away from complex technical discussions. Always consider trade-offs and edge cases.",
  },
]

function mkId()   { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5) }
function mkChat(personaId = null) {
  return { id: mkId(), title: 'New chat', messages: [], personaId, createdAt: Date.now(), updatedAt: Date.now() }
}
function shortTitle(text) { return text.length > 36 ? text.slice(0, 34) + '…' : text }
function fmtAge(ts) {
  const diff = Date.now() - ts
  if (diff < 60_000)     return 'just now'
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ts).toLocaleDateString(loc(), { month: 'short', day: 'numeric' })
}

const BLANK_PERSONA = { id: '', name: '', description: '', emoji: '🤖', agentName: '', agentGender: '', style: '', language: '', instructions: '' }

function PersonaModal({ initial, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(() => initial?.id ? { ...initial } : { ...BLANK_PERSONA })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const isNew = !initial?.id
  return (
    <div className="persona-modal-backdrop" onClick={onClose}>
      <div className="persona-modal" onClick={e => e.stopPropagation()}>
        <div className="persona-modal-head">
          <span className="persona-modal-title">{isNew ? 'New Persona' : 'Edit Persona'}</span>
          <button className="icon-btn" onClick={onClose}><X size={13}/></button>
        </div>
        <div className="persona-modal-body">
          <div className="persona-emoji-row">
            <input className="pull-input persona-emoji-inp" value={form.emoji} onChange={e => set('emoji', e.target.value)} placeholder="🤖" maxLength={4} />
            <input className="pull-input" style={{ flex: 1 }} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Name *" />
          </div>
          <input className="pull-input" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Short description (e.g. Gaming historian)" />
          <div className="profile-divider" />
          <p className="persona-section-label">AI Identity</p>
          <div className="profile-agent-row">
            <div className="profile-field" style={{ flex: 1 }}>
              <label className="profile-label">Agent name</label>
              <input className="pull-input" value={form.agentName} onChange={e => set('agentName', e.target.value)} placeholder="e.g. Livia, James…" />
            </div>
            <div className="profile-field" style={{ flexShrink: 0 }}>
              <label className="profile-label">Pronouns</label>
              <div className="profile-gender-btns">
                {[['female','♀ She'],['neutral','◈ They'],['male','♂ He']].map(([v,l]) => (
                  <button key={v} type="button"
                    className={`profile-gender-btn${form.agentGender === v ? ' active' : ''}`}
                    onClick={() => set('agentGender', form.agentGender === v ? '' : v)}
                  >{l}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="profile-field">
            <label className="profile-label">Response style</label>
            <CustomSelect value={form.style} onChange={v => set('style', v)} />
          </div>
          <div className="profile-field">
            <label className="profile-label">Language override</label>
            <input className="pull-input" value={form.language} onChange={e => set('language', e.target.value)} placeholder="Leave blank to use profile setting" />
          </div>
          <div className="profile-field">
            <label className="profile-label">Instructions / Personality</label>
            <textarea className="pull-input profile-textarea" rows={4}
              value={form.instructions} onChange={e => set('instructions', e.target.value)}
              placeholder="Describe this persona's personality, expertise, and behavior…"
            />
          </div>
        </div>
        <div className="persona-modal-foot">
          {!isNew && <button className="pull-btn persona-del-btn" onClick={() => onDelete(form.id)}><Trash size={11}/> Delete</button>}
          <button className="pull-btn profile-save-btn" disabled={!form.name.trim()}
            onClick={() => onSave({ ...form, id: form.id || mkId() })}
          ><Save size={11}/> Save</button>
        </div>
      </div>
    </div>
  )
}

// prefill: text to put in the input (from the command palette), then onPrefillConsumed()
export default function ChatPanel({ models = [], running = [], online, isDrawer = false, onClose, onDataChange, prefill, onPrefillConsumed }) {
  const [open, toggleOpen] = useCollapse('panel-chat', false)
  const [assistantDraft, setAssistantDraft] = useState(null)
  const [input,          setInput]          = useState('')
  const [streaming,      setStreaming]       = useState(false)
  const [selectedModel,  setSelectedModel]  = useState('')

  const [showPull,  setShowPull]  = useState(false)
  const [pullInput, setPullInput] = useState('')
  const [pullState, setPullState] = useState(null)
  const [isPulling, setIsPulling] = useState(false)
  const pullAbortRef = useRef(null)

  const [showProfile,   setShowProfile]   = useState(false)
  const [profile,       setProfile]       = useState({ name: '', language: '', style: '', instructions: '', timezone: '', agentName: '', agentGender: '' })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved,  setProfileSaved]  = useState(false)

  // Multi-chat & persona state
  const [sidebarOpen,   setSidebarOpen]   = useState(false)
  const [editingPersona, setEditingPersona] = useState(null)

  const [chats, setChats] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CHATS_KEY) || '[]')
      if (saved.length) return saved
      // migrate old single-chat storage
      const old = JSON.parse(localStorage.getItem('ollama-drawer-messages') || '[]')
      const chat = mkChat()
      if (old.length) {
        chat.messages = old
        chat.title = shortTitle(old.find(m => m.role === 'user')?.content || 'Previous chat')
      }
      return [chat]
    } catch { return [mkChat()] }
  })

  const [activeChatId, setActiveChatId] = useState(() => {
    try { return localStorage.getItem('ollama-active-chat') || null } catch { return null }
  })

  const [personas, setPersonas] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem(PERSONAS_KEY) || '[]')
      return s.length ? s : DEFAULT_PERSONAS
    } catch { return DEFAULT_PERSONAS }
  })

  const scrollRef      = useRef(null)
  const inputRef       = useRef(null)
  const abortRef       = useRef(null)
  const textareaRef    = useRef(null)
  const choicesRef     = useRef(null)
  const gameChoicesRef = useRef(null)
  const imageRef       = useRef(null)
  const noteRef        = useRef(null)

  // Derived
  const activeChat    = chats.find(c => c.id === activeChatId) ?? chats[0]
  const activeId      = activeChat?.id
  const messages      = activeChat?.messages ?? []
  const activePersona = personas.find(p => p.id === activeChat?.personaId) ?? null

  // Persistence
  useEffect(() => { try { localStorage.setItem(CHATS_KEY, JSON.stringify(chats)) } catch {} }, [chats])
  useEffect(() => { try { localStorage.setItem(PERSONAS_KEY, JSON.stringify(personas)) } catch {} }, [personas])
  useEffect(() => { if (activeId) try { localStorage.setItem('ollama-active-chat', activeId) } catch {} }, [activeId])
  useEffect(() => { try { localStorage.removeItem('ollama-drawer-messages') } catch {} }, [])

  // Chat helpers
  const patchChat = (id, fn) =>
    setChats(cs => cs.map(c => c.id === id ? { ...c, ...fn(c), updatedAt: Date.now() } : c))

  const newChat = () => {
    const chat = mkChat(activeChat?.personaId ?? null)
    setChats(cs => [chat, ...cs])
    setActiveChatId(chat.id)
    setSidebarOpen(false)
  }

  const switchChat = (id) => {
    if (streaming) return
    setActiveChatId(id)
    setAssistantDraft(null)
    setSidebarOpen(false)
  }

  const deleteChat = (id, e) => {
    e.stopPropagation()
    setChats(cs => {
      const next = cs.filter(c => c.id !== id)
      if (!next.length) {
        const fresh = mkChat()
        setActiveChatId(fresh.id)
        return [fresh]
      }
      if (id === activeChatId) setActiveChatId(next[0].id)
      return next
    })
  }

  const setActiveChatPersona = (personaId) => {
    patchChat(activeId, () => ({ personaId }))
    setSidebarOpen(false)
  }

  // Persona helpers
  const savePersona = (persona) => {
    setPersonas(ps => {
      const idx = ps.findIndex(p => p.id === persona.id)
      return idx >= 0 ? ps.map(p => p.id === persona.id ? persona : p) : [...ps, persona]
    })
    setEditingPersona(null)
  }

  const deletePersona = (id) => {
    setPersonas(ps => ps.filter(p => p.id !== id))
    setChats(cs => cs.map(c => c.personaId === id ? { ...c, personaId: null } : c))
    setEditingPersona(null)
  }

  // Profile load
  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(d => setProfile({
      name: d.name || '', language: d.language || '', style: d.style || '',
      instructions: d.instructions || '', timezone: d.timezone || '',
      agentName: d.agentName || '', agentGender: d.agentGender || '',
    })).catch(() => {})
  }, [])

  const saveProfile = async () => {
    setProfileSaving(true)
    try {
      await fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) })
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2000)
    } catch {}
    setProfileSaving(false)
  }

  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      const active = running[0]?.name
      setSelectedModel(active && models.some(m => m.name === active) ? active : models[0].name)
    }
  }, [models])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, assistantDraft])

  const handleInputChange = (e) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  const startPull = async () => {
    const model = pullInput.trim()
    if (!model || isPulling) return
    setIsPulling(true)
    setPullState({ status: 'Connecting…', pct: 0, done: false, error: null })
    pullAbortRef.current = new AbortController()
    try {
      const res = await fetch('/api/ollama/pull', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }), signal: pullAbortRef.current.signal,
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        setPullState({ status: '', pct: 0, done: false, error: e.error || `HTTP ${res.status}` })
        return
      }
      const reader = res.body.getReader(), decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const d = JSON.parse(line)
            const pct = d.total ? Math.round((d.completed / d.total) * 100) : 0
            const isDone = d.status === 'success'
            setPullState({ status: d.status || '', pct: isDone ? 100 : pct, done: isDone, error: null })
          } catch {}
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') setPullState(prev => ({ ...prev, error: e.message, done: false }))
    } finally { setIsPulling(false) }
  }

  const deleteModel = async (name) => {
    if (!window.confirm(`Delete model "${name}"?`)) return
    try {
      const res = await fetch('/api/ollama/model', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: name }),
      })
      if (!res.ok) alert('Delete failed')
      else if (selectedModel === name) setSelectedModel(models.find(m => m.name !== name)?.name ?? '')
    } catch {}
  }

  useEffect(() => {
    if (!prefill) return
    setInput(prefill)
    setTimeout(() => textareaRef.current?.focus(), 50)
    onPrefillConsumed?.()
  }, [prefill])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || streaming || !selectedModel || !online) return

    const chatId  = activeId
    const userMsg = { role: 'user', content: text }
    const context = [...messages, userMsg]

    if (messages.length === 0) {
      patchChat(chatId, () => ({ title: shortTitle(text), messages: context }))
    } else {
      patchChat(chatId, () => ({ messages: context }))
    }

    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setStreaming(true)
    setAssistantDraft({ content: '' })

    abortRef.current       = new AbortController()
    choicesRef.current     = null
    gameChoicesRef.current = null
    imageRef.current       = null
    noteRef.current        = null
    let accum = '', hasError = false

    try {
      const res = await fetch('/api/ollama/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, messages: context, persona: activePersona || null }),
        signal: abortRef.current.signal,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const reader = res.body.getReader(), decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const d = JSON.parse(line)
            if (d.t === 'tool') {
              setAssistantDraft(prev => ({ ...prev, content: prev?.content ?? '', toolLabel: d.label }))
            } else if (d.t === 'text' && d.content) {
              accum += d.content
              setAssistantDraft(prev => ({ ...prev, content: accum, toolLabel: null }))
            } else if (d.t === 'replace') {
              accum = d.content
              noteRef.current = d.note ?? null
              setAssistantDraft(prev => ({ ...prev, content: accum, toolLabel: null, note: noteRef.current }))
            } else if (d.t === 'choices') {
              choicesRef.current = d.items
            } else if (d.t === 'game_choices') {
              gameChoicesRef.current = d.items
            } else if (d.t === 'image') {
              imageRef.current = d.url
              setAssistantDraft(prev => ({ ...(prev ?? { content: accum }), image: d.url }))
            } else if (d.t === 'note') {
              noteRef.current = d.text
              setAssistantDraft(prev => ({ ...(prev ?? { content: accum }), note: d.text, toolLabel: null }))
            } else if (d.t === 'refresh') {
              onDataChange?.()
            } else if (d.t === 'error') {
              accum = d.message; hasError = true
            }
          } catch {}
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') { hasError = false }
      else { accum = e.message; hasError = true }
    }

    patchChat(chatId, c => ({
      messages: [...c.messages, { role: 'assistant', content: accum, error: hasError, choices: choicesRef.current, gameChoices: gameChoicesRef.current, image: imageRef.current, note: noteRef.current }],
    }))
    setAssistantDraft(null)
    setStreaming(false)
    inputRef.current?.focus()
  }

  const stopStream  = () => abortRef.current?.abort()
  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }

  const clearChat = () => {
    abortRef.current?.abort()
    patchChat(activeId, () => ({ messages: [], title: 'New chat' }))
    setAssistantDraft(null)
    setStreaming(false)
    inputRef.current?.focus()
  }

  const runningSet = new Set((running || []).map(r => r.name))
  const isEmpty    = messages.length === 0 && !assistantDraft
  const showBody   = isDrawer || open

  return (
    <div className={`${isDrawer ? 'chat-drawer-inner' : `glass-card chat-panel${open ? ' chat-panel-open' : ''}`}`}>

      {/* Sidebar overlay */}
      {isDrawer && sidebarOpen && (
        <div className="chat-sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      {isDrawer && (
        <div className={`chat-sidebar${sidebarOpen ? ' chat-sidebar-open' : ''}`}>

          <div className="sidebar-section-head">
            <span className="sidebar-section-label">Chats</span>
            <button className="icon-btn" onClick={newChat} title="New chat"><Plus size={12}/></button>
          </div>

          <div className="sidebar-chat-list">
            {chats.map(chat => (
              <div
                key={chat.id}
                className={`sidebar-chat-item${chat.id === activeId ? ' active' : ''}`}
                onClick={() => switchChat(chat.id)}
              >
                <MessageSquare size={11} className="sidebar-icon-dim" />
                <div className="sidebar-chat-meta">
                  <span className="sidebar-chat-name">{chat.title}</span>
                  <span className="sidebar-chat-age">{fmtAge(chat.updatedAt)}</span>
                </div>
                <button className="icon-btn sidebar-del-btn" onClick={e => deleteChat(chat.id, e)} title="Delete chat">
                  <Trash size={10}/>
                </button>
              </div>
            ))}
          </div>

          <div className="sidebar-section-head sidebar-section-head--personas">
            <span className="sidebar-section-label">Personas</span>
            <button className="icon-btn" onClick={() => setEditingPersona({})} title="New persona"><Plus size={12}/></button>
          </div>

          <div className="sidebar-persona-list">
            <div
              className={`sidebar-persona-item${!activeChat?.personaId ? ' active' : ''}`}
              onClick={() => setActiveChatPersona(null)}
            >
              <span className="sidebar-persona-emoji">🏠</span>
              <div className="sidebar-persona-meta">
                <span className="sidebar-persona-name">Default</span>
                <span className="sidebar-persona-desc">Profile settings</span>
              </div>
            </div>
            {personas.map(p => (
              <div
                key={p.id}
                className={`sidebar-persona-item${activeChat?.personaId === p.id ? ' active' : ''}`}
                onClick={() => setActiveChatPersona(p.id)}
              >
                <span className="sidebar-persona-emoji">{p.emoji || '🤖'}</span>
                <div className="sidebar-persona-meta">
                  <span className="sidebar-persona-name">{p.name}</span>
                  <span className="sidebar-persona-desc">{p.description}</span>
                </div>
                <button className="icon-btn sidebar-edit-btn"
                  onClick={e => { e.stopPropagation(); setEditingPersona(p) }} title="Edit persona">
                  <Pencil size={10}/>
                </button>
              </div>
            ))}
          </div>

        </div>
      )}

      {/* Persona create / edit modal */}
      {editingPersona !== null && (
        <PersonaModal
          initial={editingPersona}
          onSave={savePersona}
          onDelete={deletePersona}
          onClose={() => setEditingPersona(null)}
        />
      )}

      {/* Header */}
      <div className="chat-header">
        {isDrawer && (
          <button
            className={`icon-btn sidebar-toggle-btn${sidebarOpen ? ' active' : ''}`}
            onClick={() => setSidebarOpen(s => !s)}
            title="Chats & Personas"
          >
            <Menu size={14}/>
          </button>
        )}

        <div className="panel-icon" style={{ background: 'rgba(52,211,153,0.12)', borderColor: 'rgba(52,211,153,0.25)' }}>
          {activePersona
            ? <span style={{ fontSize: 13, lineHeight: 1 }}>{activePersona.emoji}</span>
            : <Brain size={15} style={{ color: 'var(--green)' }} />}
        </div>
        <h3 className="panel-title">
          {activePersona ? activePersona.name : 'AI Assistant'}
        </h3>

        {models.length > 0 ? (
          <div className="chat-model-wrap">
            <select className="chat-model-select" value={selectedModel} onChange={e => setSelectedModel(e.target.value)} disabled={streaming}>
              {models.map(m => (
                <option key={m.name} value={m.name}>
                  {fmtModelName(m.name)}{m.name.includes(':') && m.name.split(':')[1] !== 'latest' ? `:${m.name.split(':')[1]}` : ''}
                  {runningSet.has(m.name) ? ' ⚡' : ''}
                </option>
              ))}
            </select>
            <ChevronDown size={11} className="chat-chevron" />
          </div>
        ) : (
          <span className="pill" style={{ fontSize: 10, color: 'var(--muted)' }}>
            {online ? 'No models' : 'Offline'}
          </span>
        )}

        {!isEmpty && showBody && (
          <button className="icon-btn" onClick={clearChat} title="Clear conversation"><Trash2 size={13}/></button>
        )}
        {isDrawer && (
          <>
            <button className={`icon-btn${showProfile ? ' pull-btn-active' : ''}`}
              onClick={() => { setShowProfile(s => !s); setShowPull(false) }} title="User profile">
              <UserRound size={13}/>
            </button>
            <button className={`icon-btn${showPull ? ' pull-btn-active' : ''}`}
              onClick={() => { setShowPull(s => !s); setShowProfile(false); setPullState(null); setPullInput('') }}
              title="Pull / manage models">
              <Download size={13}/>
            </button>
          </>
        )}
        {isDrawer
          ? <button className="icon-btn panel-collapse-btn" onClick={onClose} title="Close"><X size={14}/></button>
          : <button className="icon-btn panel-collapse-btn" onClick={toggleOpen} title={open ? 'Collapse' : 'Expand'}>
              <ChevronDown size={13} className={open ? 'chevron-open' : 'chevron-closed'}/>
            </button>
        }
      </div>

      {/* Pull panel */}
      {isDrawer && showPull && (
        <div className="pull-panel">
          <div className="pull-input-row">
            <input className="pull-input" value={pullInput} onChange={e => setPullInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && startPull()}
              placeholder="Model name — e.g. llama3.2, mistral:7b" disabled={isPulling} />
            <button className="pull-btn" onClick={startPull} disabled={!pullInput.trim() || isPulling}>
              {isPulling ? 'Pulling…' : 'Pull'}
            </button>
          </div>
          {pullState && (
            <div className="pull-status-wrap">
              {pullState.error ? <p className="pull-error">{pullState.error}</p>
               : pullState.done ? <p className="pull-done">Model ready — select it from the dropdown above.</p>
               : <>
                   <p className="pull-status-text">{pullState.status}</p>
                   {pullState.pct > 0 && <div className="pull-bar-track"><div className="pull-bar-fill" style={{ width: `${pullState.pct}%` }} /></div>}
                   {pullState.pct > 0 && <span className="pull-pct">{pullState.pct}%</span>}
                 </>}
            </div>
          )}
          {models.length > 0 && (
            <div className="pull-model-list">
              <p className="pull-model-list-label">Installed models</p>
              {models.map(m => (
                <div key={m.name} className="pull-model-row">
                  <span className="pull-model-name">{m.name}</span>
                  <span className="pull-model-size">{m.size ? `${(m.size / 1e9).toFixed(1)} GB` : ''}</span>
                  <button className="icon-btn pull-del-btn" onClick={() => deleteModel(m.name)} title={`Delete ${m.name}`}>
                    <Trash size={11}/>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Profile panel */}
      {isDrawer && showProfile && (
        <div className="pull-panel profile-panel">
          <div className="profile-section-title">Agent</div>
          <div className="profile-agent-row">
            <div className="profile-field" style={{ flex: 1 }}>
              <label className="profile-label">Name</label>
              <input className="pull-input" value={profile.agentName} onChange={e => setProfile(p => ({ ...p, agentName: e.target.value }))} placeholder="e.g. Nova, ARIA, Max…" />
            </div>
            <div className="profile-field" style={{ flexShrink: 0 }}>
              <label className="profile-label">Persona</label>
              <div className="profile-gender-btns">
                {[['female','♀ She'],['neutral','◈ They'],['male','♂ He']].map(([v, l]) => (
                  <button key={v} type="button"
                    className={`profile-gender-btn${profile.agentGender === v ? ' active' : ''}`}
                    onClick={() => setProfile(p => ({ ...p, agentGender: p.agentGender === v ? '' : v }))}
                  >{l}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="profile-divider" />
          <div className="profile-section-title">About you</div>
          <div className="profile-field">
            <label className="profile-label">Your name</label>
            <input className="pull-input" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Alex" />
          </div>
          <div className="profile-field">
            <label className="profile-label">Respond in</label>
            <input className="pull-input" value={profile.language} onChange={e => setProfile(p => ({ ...p, language: e.target.value }))} placeholder="e.g. French, English, Spanish…" />
          </div>
          <div className="profile-field">
            <label className="profile-label">Timezone</label>
            <div className="profile-tz-row">
              <input className="pull-input" value={profile.timezone} onChange={e => setProfile(p => ({ ...p, timezone: e.target.value }))} placeholder="e.g. America/Toronto" />
              <button type="button" className="profile-tz-detect" title="Auto-detect from browser"
                onClick={() => { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; setProfile(p => ({ ...p, timezone: tz })) }}>
                <MapPin size={12}/> Detect
              </button>
            </div>
          </div>
          <div className="profile-field">
            <label className="profile-label">Response style</label>
            <CustomSelect value={profile.style} onChange={v => setProfile(p => ({ ...p, style: v }))} />
          </div>
          <div className="profile-field">
            <label className="profile-label">Custom instructions</label>
            <textarea className="pull-input profile-textarea" value={profile.instructions}
              onChange={e => setProfile(p => ({ ...p, instructions: e.target.value }))}
              placeholder="e.g. I prefer metric units. Always suggest alternatives. I'm a software developer." rows={3} />
          </div>
          <button className="pull-btn profile-save-btn" onClick={saveProfile} disabled={profileSaving}>
            {profileSaved ? '✓ Saved' : profileSaving ? 'Saving…' : <><Save size={11}/> Save profile</>}
          </button>
        </div>
      )}

      {/* Messages */}
      {showBody && (
        <div className="chat-messages" ref={scrollRef}>
          {isEmpty ? (
            <div className="chat-empty">
              {activePersona ? (
                <>
                  <span className="chat-empty-persona-emoji">{activePersona.emoji}</span>
                  <p style={{ fontWeight: 600, marginBottom: 2 }}>{activePersona.name}</p>
                  <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 8 }}>{activePersona.description}</p>
                </>
              ) : (
                <Brain size={26} style={{ color: 'rgba(52,211,153,0.25)', marginBottom: 10 }} />
              )}
              {!activePersona && <p>Running locally on Mac&nbsp;Mini</p>}
              {selectedModel && (
                <span className="chat-empty-model">
                  {runningSet.has(selectedModel) && <Zap size={9}/>}
                  {fmtModelName(selectedModel)}
                </span>
              )}
              <p className="chat-empty-hint">Enter to send · Shift+Enter for newline</p>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <ChatMessage key={i} role={msg.role} content={msg.content} error={msg.error}
                  choices={msg.choices} gameChoices={msg.gameChoices} image={msg.image} note={msg.note} onDataChange={onDataChange} />
              ))}
              {assistantDraft !== null && (
                <ChatMessage role="assistant" content={assistantDraft.content} streaming toolLabel={assistantDraft.toolLabel} image={assistantDraft.image} note={assistantDraft.note} />
              )}
            </>
          )}
        </div>
      )}

      {/* Input */}
      {showBody && (
        <div className="chat-input-row">
          <textarea
            ref={(el) => { textareaRef.current = el; inputRef.current = el }}
            className="chat-input"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={online ? `Message ${activePersona ? activePersona.name : 'AI'}…` : 'AI assistant is offline'}
            disabled={streaming || !online || !selectedModel}
            rows={1}
          />
          <button
            className={`chat-send-btn${streaming ? ' chat-send-stop' : ''}`}
            onClick={streaming ? stopStream : sendMessage}
            disabled={!streaming && (!input.trim() || !selectedModel || !online)}
            title={streaming ? 'Stop' : 'Send (Enter)'}
          >
            {streaming ? <Square size={12}/> : <Send size={14}/>}
          </button>
        </div>
      )}
    </div>
  )
}
