import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { NotebookPen, X } from 'lucide-react'
import { t, tn } from '../i18n.js'

export default function ScratchPad({ onClose }) {
  const [text,   setText]   = useState('')
  const [status, setStatus] = useState('idle') // idle | saving | saved
  const timerRef = useRef(null)

  useEffect(() => {
    fetch('/api/scratchpad')
      .then(r => r.json())
      .then(d => setText(d.text || ''))
      .catch(() => {})
  }, [])

  const handleChange = (e) => {
    setText(e.target.value)
    setStatus('saving')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      await fetch('/api/scratchpad', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: e.target.value }),
      }).catch(() => {})
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 1500)
    }, 600)
  }

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <div className="scratch-backdrop" onClick={onClose}>
      <div className="scratch-modal" onClick={e => e.stopPropagation()}>
        <div className="scratch-header">
          <div className="scratch-title">
            <NotebookPen size={15} />
            <span>{t('Scratch Pad')}</span>
          </div>
          <div className="scratch-header-right">
            {status === 'saving' && <span className="scratch-status saving">{t('Saving…')}</span>}
            {status === 'saved'  && <span className="scratch-status saved">{t('Saved')}</span>}
            <button className="icon-btn" onClick={onClose} title={t('Close (Esc)')}>
              <X size={14} />
            </button>
          </div>
        </div>
        <textarea
          className="scratch-area"
          value={text}
          onChange={handleChange}
          placeholder={t('Jot down anything — IPs, ideas, commands, notes…')}
          autoFocus
          spellCheck={false}
        />
        <div className="scratch-footer">
          {text.length > 0 && <span className="scratch-count">{tn(text.length, '{n} char', '{n} chars')} · {tn(text.split('\n').length, '{n} line', '{n} lines')}</span>}
        </div>
      </div>
    </div>,
    document.body
  )
}
