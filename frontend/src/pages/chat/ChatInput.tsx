import { useEffect, useRef } from 'react'
import { Send, Image as ImageIcon, X } from 'lucide-react'
import type { ModelOption } from './types'

interface ChatInputProps {
  input: string
  setInput: (v: string) => void
  images: string[]
  setImages: React.Dispatch<React.SetStateAction<string[]>>
  imagesRef: React.RefObject<string[]>
  sending: boolean
  onSend: () => void
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  draftTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>
}

/** Top bar: model selector + connection status */
function ChatInputHeader({
  model, setModel, models,
  connected, wsConnected, historyIsError, isDemo,
}: {
  model: string; setModel: (v: string) => void; models: ModelOption[]
  connected: boolean; wsConnected: boolean; historyIsError: boolean; isDemo: boolean
}) {
  const activeModel = models.find(m => m.id === model)
  const displayLabel = activeModel?.name ?? model ?? 'loading\u2026'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <select
        value={model}
        onChange={e => setModel(e.target.value)}
        aria-label="Select model"
        style={{
          background: 'var(--hover-bg)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          color: 'var(--text-secondary)',
          fontSize: '11px',
          fontFamily: 'monospace',
          padding: '4px 8px',
          cursor: 'pointer',
          outline: 'none',
          appearance: 'none',
          WebkitAppearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23666'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 8px center',
          paddingRight: '22px',
        }}
      >
        {models.length === 0 && (
          <option value={model} style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
            {displayLabel}
          </option>
        )}
        {models.map(m => (
          <option key={m.id} value={m.id} style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
            {m.name}
          </option>
        ))}
      </select>

      <div aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{
          width: '7px', height: '7px', borderRadius: '50%',
          background: connected ? 'var(--green)' : 'var(--red)',
          boxShadow: connected ? '0 0 6px var(--green)' : 'none',
        }} />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {isDemo
            ? 'demo'
            : connected
              ? (wsConnected ? 'live' : 'polling')
              : historyIsError ? 'OpenClaw unreachable' : 'reconnecting\u2026'}
        </span>
      </div>
    </div>
  )
}

/** Bottom bar: image previews + text input */
function ChatInputBox({
  input, setInput, images, setImages, imagesRef, sending,
  onSend, onFileChange, draftTimerRef,
}: ChatInputProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }, [input])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() }
  }

  return (
    <div style={{ flexShrink: 0 }}>
      {/* Image previews */}
      {images.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
          {images.map((url, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={url} alt="preview" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '10px', border: '1px solid var(--border)' }} />
              <button
                onClick={() => setImages(prev => {
                  const next = prev.filter((_, j) => j !== i)
                  imagesRef.current = next
                  try {
                    if (next.length === 0) localStorage.removeItem('chat-draft-images')
                    else localStorage.setItem('chat-draft-images', JSON.stringify(next))
                  } catch { /* ignore */ }
                  return next
                })}
                aria-label="Remove image"
                style={{ position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--red)', border: 'none', color: 'var(--text-on-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px',
        padding: '10px 12px', display: 'flex', alignItems: 'flex-end', gap: '8px',
      }}>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFileChange} style={{ display: 'none' }} />
        <button onClick={() => fileRef.current?.click()} title="Attach image" aria-label="Attach image"
          style={{ flexShrink: 0, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <ImageIcon size={18} />
        </button>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => {
            const v = e.target.value
            setInput(v)
            if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
            draftTimerRef.current = setTimeout(() => localStorage.setItem('chat-draft', v), 300)
          }}
          onKeyDown={onKeyDown}
          placeholder="Message Bjorn\u2026 (paste or drag images)"
          aria-label="Chat message"
          rows={1}
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '13px', lineHeight: 1.6, resize: 'none', fontFamily: 'inherit', maxHeight: '160px', overflowY: 'auto' }}
        />

        <button onClick={onSend} disabled={sending || (!input.trim() && images.length === 0)} aria-label="Send message"
          style={{
            flexShrink: 0,
            background: (sending || (!input.trim() && images.length === 0)) ? 'var(--hover-bg)' : 'var(--accent)',
            border: 'none', borderRadius: '10px',
            color: (sending || (!input.trim() && images.length === 0)) ? 'var(--text-muted)' : 'var(--text-on-color)',
            padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.25s var(--ease-spring)',
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  )
}

/** Combined export — default renders the bottom input, .Header renders the top bar */
export default Object.assign(ChatInputBox, { Header: ChatInputHeader })
