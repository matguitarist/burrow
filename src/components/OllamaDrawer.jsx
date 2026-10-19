import { createPortal } from 'react-dom'
import ChatPanel from './ChatPanel.jsx'

// Always mounted — never unmounts ChatPanel so conversation state is preserved
export default function OllamaDrawer({ open, onClose, models, running, online, onDataChange }) {
  return createPortal(
    <div
      className={`ollama-modal-backdrop${open ? ' ollama-modal-visible' : ''}`}
      onClick={onClose}
    >
      <div className="ollama-modal" onClick={e => e.stopPropagation()}>
        <ChatPanel
          models={models}
          running={running}
          online={online}
          isDrawer
          onClose={onClose}
          onDataChange={onDataChange}
        />
      </div>
    </div>,
    document.body
  )
}
