import { useEffect, useRef, type ReactNode } from 'react'
import { PaperPlaneTilt, Image as ImageIcon, Square, X } from '@phosphor-icons/react'
import ProviderModelSelector from '@/vendor/t3/providers/ProviderModelSelector'
import type { ChatProviderOption, ModelOption } from './types'
import { CHAT_IMAGE_LIMIT } from './constants'

interface ChatInputProps {
  input: string
  setInput: (v: string) => void
  images: string[]
  setImages: React.Dispatch<React.SetStateAction<string[]>>
  imagesRef: React.RefObject<string[]>
  sending: boolean
  onSend: () => void
  onStop: () => void
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDrop: (e: React.DragEvent) => void
  draftTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>
  contextBar?: ReactNode
  providerLabel?: string
}

/** Top bar: model selector + connection status */
function ChatInputHeader({
  model, setModel, models, provider, setProvider, providers, agentLabel,
  connected, wsConnected, historyIsError, isDemo,
}: {
  model: string; setModel: (v: string) => void; models: ModelOption[]
  provider: string; setProvider: (v: string) => void; providers: ChatProviderOption[]
  agentLabel?: string
  connected: boolean; wsConnected: boolean; historyIsError: boolean; isDemo: boolean
}) {
  return (
    <div className="chat-input-header-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
      {agentLabel && (
        <div
          className="chat-input-agent-label"
          aria-label="Active agent"
          style={{
            background: 'var(--hover-bg)',
            border: '1px solid var(--border)',
            borderRadius: '999px',
            color: 'var(--text-muted)',
            height: '30px',
            fontSize: '11px',
            fontFamily: 'monospace',
            padding: '0 10px',
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {agentLabel}
        </div>
      )}
      <ProviderModelSelector
        provider={provider}
        providers={providers}
        onProviderChange={setProvider}
        model={model}
        models={models}
        onModelChange={setModel}
      />

      <div aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: '6px', height: 30 }}>
        <div style={{
          width: '7px', height: '7px', borderRadius: '50%',
          background: connected ? 'var(--secondary)' : 'var(--red)',
          boxShadow: connected ? '0 0 6px var(--secondary)' : 'none',
        }} />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {isDemo
            ? 'demo'
            : connected
              ? (wsConnected ? 'live' : 'polling')
              : historyIsError ? 'chat unavailable' : 'reconnecting\u2026'}
        </span>
      </div>
    </div>
  )
}

/** Bottom bar: image previews + text input */
function ChatInputBox({
  input, setInput, images, setImages, imagesRef, sending,
  onSend, onStop, onFileChange, onDrop, draftTimerRef, contextBar, providerLabel,
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
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() }
  }

  const canSend = !!input.trim() || images.length > 0
  const imageLimitReached = images.length >= CHAT_IMAGE_LIMIT

  return (
    <div
      className="chat-input-dropzone"
      data-testid="chat-input-dropzone"
      onDrop={onDrop}
      onDragOver={e => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      style={{ flexShrink: 0 }}
    >
      {/* Image previews */}
      {images.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: '8px' }}>
          <div aria-live="polite" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {images.length}/{CHAT_IMAGE_LIMIT} images attached
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {images.map((url, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={url} alt={`Attached image ${i + 1}`} style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '10px', border: '1px solid var(--border)' }} />
                <button
                  onClick={() => setImages(prev => {
                    const next = prev.filter((_, j) => j !== i)
                    imagesRef.current = next
                    try {
                      if (next.length === 0) sessionStorage.removeItem('chat-draft-images')
                      else sessionStorage.setItem('chat-draft-images', JSON.stringify(next))
                    } catch { /* ignore */ }
                    return next
                  })}
                  aria-label={`Remove image ${i + 1}`}
                  style={{ position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--red)', border: 'none', color: 'var(--text-on-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="chat-input-shell" style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px',
        padding: '10px 12px', display: 'flex', alignItems: 'flex-end', gap: '8px',
      }}>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFileChange} style={{ display: 'none' }} />
        <button className="chat-input-attach" onClick={() => fileRef.current?.click()} title={imageLimitReached ? 'Image limit reached' : 'Attach image'} aria-label={imageLimitReached ? 'Attach image unavailable, image limit reached' : 'Attach image'}
          disabled={imageLimitReached}
          style={{ flexShrink: 0, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: imageLimitReached ? 'not-allowed' : 'pointer', padding: '4px', display: 'flex', alignItems: 'center', transition: 'color 0.15s', opacity: imageLimitReached ? 0.45 : 1 }}
          onMouseEnter={e => {
            if (!imageLimitReached) e.currentTarget.style.color = 'var(--accent)'
          }}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <ImageIcon size={18} />
        </button>

        <textarea
          className="chat-input-textarea"
          ref={textareaRef}
          value={input}
          onChange={e => {
            const v = e.target.value
            setInput(v)
            if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
            draftTimerRef.current = setTimeout(() => sessionStorage.setItem('chat-draft', v), 300)
          }}
          onKeyDown={onKeyDown}
          placeholder={`Ask ${providerLabel || 'Hermes'} anything (paste or drag images)`}
          aria-label="Chat message"
          rows={1}
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '13px', lineHeight: 1.6, resize: 'none', fontFamily: 'inherit', maxHeight: '160px', overflowY: 'auto' }}
        />

        {sending ? (
          <button
            className="chat-input-stop"
            onClick={onStop}
            aria-label="Stop response"
            title="Stop response"
            style={{
              flexShrink: 0,
              background: 'var(--red-a8, rgba(239, 68, 68, 0.12))',
              border: '1px solid var(--red-500, rgba(239, 68, 68, 0.35))',
              borderRadius: '10px',
              color: 'var(--red-500, #ef4444)',
              padding: '7px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.25s var(--ease-spring)',
            }}
          >
            <Square size={13} weight="fill" />
            <span className="chat-input-stop-label">Stop</span>
          </button>
        ) : (
          <button className="chat-input-send" onClick={onSend} disabled={!canSend} aria-label="Send message" title="Send"
            style={{
              flexShrink: 0,
              width: '34px',
              height: '34px',
              background: canSend ? 'var(--bg-elevated)' : 'transparent',
              border: `1px solid ${canSend ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: '50%',
              color: canSend ? 'var(--accent-bright)' : 'var(--text-muted)',
              cursor: canSend ? 'pointer' : 'not-allowed',
              display: 'grid',
              placeItems: 'center',
              opacity: canSend ? 1 : 0.55,
              transition: 'border-color 0.15s, color 0.15s, background 0.15s, opacity 0.15s',
            }}
          >
            <PaperPlaneTilt size={15} weight={canSend ? 'fill' : 'regular'} style={{ marginLeft: '-1px' }} />
          </button>
        )}
      </div>
      {contextBar && (
        <div className="chat-input-context" style={{ marginTop: 8 }}>
          {contextBar}
        </div>
      )}
    </div>
  )
}

/** Combined export — default renders the bottom input, .Header renders the top bar */
export default Object.assign(ChatInputBox, { Header: ChatInputHeader })
