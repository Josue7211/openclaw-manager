/**
 * Bjorn builder tab -- side-by-side chat + preview layout.
 *
 * Users describe modules in natural language on the left. Bjorn generates
 * React component code using the primitives API. The generated code previews
 * in a sandboxed iframe on the right. Approve installs to dashboard,
 * reject discards, edit sends a follow-up message.
 */

import { useState, useMemo, useRef, useCallback, useEffect, lazy, Suspense } from 'react'
import { PaperPlaneTilt, Robot } from '@phosphor-icons/react'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
import { api } from '@/lib/api'
import { saveBjornModule } from '@/lib/bjorn-store'
import type { BjornGenerationState } from '@/lib/bjorn-types'
import { BjornPreview } from './BjornPreview'
import { BjornApprovalBar } from './BjornApprovalBar'
import {
  buildBjornSystemPrompt,
  extractCodeFromResponse,
  extractModuleMetadata,
} from './bjorn-prompt'

const MarkdownBubble = lazy(() => import('@/components/MarkdownBubble'))

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BjornMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  timestamp: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BjornTab() {
  const [messages, setMessages] = useState<BjornMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [generatedSource, setGeneratedSource] = useState('')
  const [generationState, setGenerationState] = useState<BjornGenerationState>('idle')
  const [model] = useLocalStorageState('chat-model', '')

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Build system prompt once
  const bjornSystemPrompt = useMemo(() => buildBjornSystemPrompt(), [])

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    const ta = inputRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }, [input])

  // ── Send message ──────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    const userMsg: BjornMessage = {
      id: `bjorn-u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      text,
      timestamp: new Date().toISOString(),
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setSending(true)
    setGenerationState('generating')

    try {
      const response = await api.post<{ text?: string; message?: string; error?: string }>(
        '/api/chat',
        { text, model, system_prompt: bjornSystemPrompt }
      )

      const assistantText = response.text || response.message || ''
      const assistantMsg: BjornMessage = {
        id: `bjorn-a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'assistant',
        text: assistantText,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, assistantMsg])

      // Try to extract code from the response
      const code = extractCodeFromResponse(assistantText)
      if (code) {
        setGeneratedSource(code)
        setGenerationState('analyzing')
        // Brief delay to show analyzing state before previewing
        setTimeout(() => setGenerationState('previewing'), 400)
      } else {
        setGenerationState('idle')
      }
    } catch (err) {
      const errorMsg: BjornMessage = {
        id: `bjorn-err-${Date.now()}`,
        role: 'system',
        text: `Failed to reach Bjorn: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMsg])
      setGenerationState('idle')
    } finally {
      setSending(false)
    }
  }, [input, sending, model, bjornSystemPrompt])

  // ── Approval flow ─────────────────────────────────────────────────
  const handleApprove = useCallback(async () => {
    if (!generatedSource) return

    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
    const meta = lastAssistant
      ? extractModuleMetadata(lastAssistant.text)
      : { name: 'Bjorn Module', description: '' }

    try {
      await saveBjornModule({
        name: meta.name,
        description: meta.description,
        icon: 'Cube',
        source: generatedSource,
        configSchema: { fields: [] },
        defaultSize: { w: 3, h: 3 },
      })

      setGenerationState('approved')
      setMessages(prev => [
        ...prev,
        {
          id: `bjorn-sys-${Date.now()}`,
          role: 'system',
          text: 'Module approved and added to dashboard!',
          timestamp: new Date().toISOString(),
        },
      ])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: `bjorn-err-${Date.now()}`,
          role: 'system',
          text: `Failed to save module: ${err instanceof Error ? err.message : 'Unknown error'}`,
          timestamp: new Date().toISOString(),
        },
      ])
    }
  }, [generatedSource, messages])

  const handleReject = useCallback(() => {
    setGeneratedSource('')
    setGenerationState('rejected')
    setMessages(prev => [
      ...prev,
      {
        id: `bjorn-sys-${Date.now()}`,
        role: 'system',
        text: 'Module rejected.',
        timestamp: new Date().toISOString(),
      },
    ])
  }, [])

  const handleEdit = useCallback(() => {
    setInput('Please update the module: ')
    setGenerationState('idle')
    inputRef.current?.focus()
  }, [])

  // ── Key handler ───────────────────────────────────────────────────
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  // ── Render ────────────────────────────────────────────────────────
  const showPreview = generatedSource || generationState === 'generating'

  return (
    <div style={rootStyle}>
      {/* Left: Chat panel */}
      <div style={chatPanelStyle}>
        {/* Messages */}
        <div ref={scrollRef} style={messageListStyle}>
          {messages.length === 0 && (
            <div style={emptyStyle}>
              <Robot size={36} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Bjorn Module Builder
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', maxWidth: 320 }}>
                Describe a dashboard widget and Bjorn will generate it using the primitives API. You can approve, reject, or request changes.
              </span>
            </div>
          )}

          {messages.map(msg => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                gap: '8px',
                alignItems: 'flex-end',
              }}
            >
              {msg.role !== 'system' && (
                <div
                  style={{
                    flexShrink: 0,
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background:
                      msg.role === 'user'
                        ? 'var(--tertiary)'
                        : 'var(--purple-a12)',
                    border: `1px solid ${msg.role === 'user' ? 'var(--tertiary)' : 'var(--border-accent)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                  }}
                >
                  {msg.role === 'assistant' ? '\u{1F9AC}' : '\u{1F98D}'}
                </div>
              )}

              <div
                style={{
                  maxWidth: msg.role === 'system' ? '100%' : '78%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  alignItems:
                    msg.role === 'user'
                      ? 'flex-end'
                      : msg.role === 'system'
                        ? 'center'
                        : 'flex-start',
                }}
              >
                {msg.role === 'system' ? (
                  <div style={systemMsgStyle}>{msg.text}</div>
                ) : (
                  <div
                    style={{
                      padding: '9px 13px',
                      borderRadius:
                        msg.role === 'user'
                          ? '14px 14px 4px 14px'
                          : '14px 14px 14px 4px',
                      background:
                        msg.role === 'user'
                          ? 'var(--tertiary)'
                          : 'var(--bg-card)',
                      border: `1px solid ${msg.role === 'user' ? 'transparent' : 'var(--border)'}`,
                      fontSize: '13px',
                      lineHeight: 1.65,
                      color:
                        msg.role === 'user'
                          ? 'var(--text-on-color)'
                          : 'var(--text-primary)',
                      wordBreak: 'break-word',
                    }}
                  >
                    {msg.role === 'user' ? (
                      <span style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>
                    ) : (
                      <Suspense fallback={<span style={{ whiteSpace: 'pre-wrap', opacity: 0.7 }}>{msg.text}</span>}>
                        <MarkdownBubble>{msg.text}</MarkdownBubble>
                      </Suspense>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {sending && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <div
                style={{
                  flexShrink: 0,
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: 'var(--purple-a12)',
                  border: '1px solid var(--border-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                }}
              >
                {'\u{1F9AC}'}
              </div>
              <div style={typingBubbleStyle}>
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--text-muted)',
                      display: 'inline-block',
                      animation: `typingBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div style={inputBarStyle}>
          <div style={inputWrapperStyle}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Describe a module for Bjorn..."
              aria-label="Bjorn module description"
              rows={1}
              style={textareaStyle}
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              aria-label="Send message"
              style={{
                ...sendBtnStyle,
                background: sending || !input.trim() ? 'var(--hover-bg)' : 'var(--accent)',
                color: sending || !input.trim() ? 'var(--text-muted)' : 'var(--text-on-color)',
              }}
            >
              <PaperPlaneTilt size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Right: Preview panel */}
      {showPreview && (
        <div style={previewPanelStyle}>
          <BjornPreview source={generatedSource} generationState={generationState} />
          <BjornApprovalBar
            onApprove={handleApprove}
            onReject={handleReject}
            onEdit={handleEdit}
            disabled={sending}
            generationState={generationState}
          />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const rootStyle: React.CSSProperties = {
  display: 'flex',
  gap: '16px',
  height: '100%',
  minHeight: 0,
}

const chatPanelStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
}

const messageListStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  paddingRight: '4px',
  marginBottom: '12px',
}

const emptyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
}

const systemMsgStyle: React.CSSProperties = {
  textAlign: 'center',
  color: 'var(--text-muted)',
  fontSize: '12px',
  padding: '6px 12px',
  fontFamily: 'monospace',
  background: 'var(--hover-bg)',
  borderRadius: '12px',
}

const typingBubbleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '12px 16px',
  background: 'var(--hover-bg)',
  border: '1px solid var(--border)',
  borderRadius: '18px 18px 18px 4px',
  width: 'fit-content',
}

const inputBarStyle: React.CSSProperties = {
  flexShrink: 0,
}

const inputWrapperStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '16px',
  padding: '10px 12px',
  display: 'flex',
  alignItems: 'flex-end',
  gap: '8px',
}

const textareaStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'transparent',
  border: 'none',
  color: 'var(--text-primary)',
  fontSize: '13px',
  lineHeight: 1.6,
  resize: 'none',
  fontFamily: 'inherit',
  maxHeight: '160px',
  overflowY: 'auto',
  outline: 'none',
}

const sendBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  border: 'none',
  borderRadius: '10px',
  padding: '7px 10px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  transition: 'all 0.25s var(--ease-spring)',
}

const previewPanelStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
}
