import { useRef, useState } from 'react'
import {
  MessageSquare, Send, ArrowLeft, PenSquare,
} from 'lucide-react'

interface ComposePanelProps {
  onBack: () => void
  onSend: () => void
  composeTo: string
  setComposeTo: (v: string) => void
  composeSending: boolean
  composeDraftRef: React.MutableRefObject<string>
  composeHasDraft: boolean
  setComposeHasDraft: (v: boolean | ((prev: boolean) => boolean)) => void
}

export default function ComposePanel({
  onBack,
  onSend,
  composeTo,
  setComposeTo,
  composeSending,
  composeDraftRef,
  composeHasDraft,
  setComposeHasDraft,
}: ComposePanelProps) {
  const composeInputRef = useRef<HTMLTextAreaElement>(null)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
      <div style={{
        padding: '0 20px', height: '57px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <button
          onClick={onBack}
          aria-label="Back to conversations"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary)', display: 'flex', padding: '4px',
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <PenSquare size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>New Message</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
            Compose
          </div>
        </div>
      </div>
      <div style={{
        padding: '12px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>To:</span>
        <input
          type="text"
          value={composeTo}
          onChange={e => setComposeTo(e.target.value)}
          placeholder="Phone number or email"
          aria-label="Recipient phone number or email"
          autoFocus
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'inherit',
            padding: '4px 0',
          }}
        />
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          <MessageSquare size={32} style={{ opacity: 0.3, marginBottom: '12px' }} />
          <div>Start a new conversation</div>
        </div>
      </div>
      <div style={{
        padding: '12px 20px',
        borderTop: '1px solid var(--border)',
        display: 'flex', gap: '10px', alignItems: 'flex-end',
      }}>
        <textarea
          ref={composeInputRef}
          defaultValue=""
          onChange={e => {
            composeDraftRef.current = e.target.value
            const hasText = e.target.value.trim().length > 0
            setComposeHasDraft(prev => (prev as boolean) !== hasText ? hasText : (prev as boolean))
            const el = e.target
            el.style.height = 'auto'
            el.style.height = `${Math.min(el.scrollHeight, 100)}px`
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
          placeholder="Message"
          aria-label="Type a message"
          rows={1}
          style={{
            flex: 1, background: 'var(--bg-elevated)',
            border: '1px solid var(--border)', borderRadius: '20px',
            padding: '10px 16px', color: 'var(--text-primary)',
            fontSize: '13px', resize: 'none', outline: 'none',
            fontFamily: 'inherit', maxHeight: '100px', lineHeight: 1.4,
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        />
        <button
          onClick={onSend}
          disabled={!composeHasDraft || !composeTo.trim() || composeSending}
          aria-label="Send message"
          style={{
            width: '36px', height: '36px', borderRadius: '50%', border: 'none',
            background: (composeHasDraft && composeTo.trim())
              ? 'linear-gradient(135deg, var(--apple-cyan), var(--apple-blue))'
              : 'var(--bg-elevated)',
            color: (composeHasDraft && composeTo.trim()) ? 'var(--text-on-color)' : 'var(--text-muted)',
            cursor: (composeHasDraft && composeTo.trim()) ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'all 0.2s var(--ease-spring)',
            transform: composeHasDraft ? 'scale(1)' : 'scale(0.9)',
          }}
        >
          <Send size={16} style={{ marginLeft: '-1px' }} />
        </button>
      </div>
    </div>
  )
}
