import { useCallback, lazy, Suspense } from 'react'
import { CaretDown, ChatCircle } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { type LightboxData } from '@/components/Lightbox'
import { formatTime } from '@/lib/utils'
import type { ChatMessage, OptimisticMsg } from './types'

const MarkdownBubble = lazy(() => import('@/components/MarkdownBubble'))

interface ChatThreadProps {
  messages: ChatMessage[]
  optimistic: OptimisticMsg[]
  isTyping: boolean
  mounted: boolean
  atBottom: boolean
  systemMsg: string | null
  lightbox: LightboxData
  setLightbox: (data: LightboxData) => void
  setAtBottom: (v: boolean) => void
  scrollRef: React.RefObject<HTMLDivElement | null>
  bottomRef: React.RefObject<HTMLDivElement | null>
  optimisticImageCacheRef: React.RefObject<Map<string, string[]>>
  onDrop: (e: React.DragEvent) => void
  retry: (msg: OptimisticMsg) => void
}

export default function ChatThread({
  messages,
  optimistic,
  isTyping,
  mounted,
  atBottom,
  systemMsg,
  setAtBottom,
  scrollRef,
  bottomRef,
  optimisticImageCacheRef,
  onDrop,
  retry,
  lightbox: _lightbox,
  setLightbox,
}: ChatThreadProps) {
  void _lightbox // used by parent for Lightbox component

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
  }, [scrollRef, setAtBottom])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setAtBottom(true)
  }, [bottomRef, setAtBottom])

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px', marginBottom: '12px' }}
      >
        {!mounted ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '20px' }}>
            {[
              { dir: 'row' as const, w: '58%' },
              { dir: 'row-reverse' as const, w: '42%' },
              { dir: 'row' as const, w: '70%' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: item.dir, gap: '8px', alignItems: 'flex-end' }}>
                <div style={{
                  flexShrink: 0, width: '26px', height: '26px', borderRadius: '50%',
                  background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-panel) 50%, var(--bg-elevated) 75%)',
                  backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite',
                }} />
                <div style={{
                  width: item.w, height: '52px', borderRadius: '16px',
                  background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-panel) 50%, var(--bg-elevated) 75%)',
                  backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite',
                }} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyState icon={ChatCircle} title="No messages yet" description="Paste or drag images. Shift+Enter for newline." />
          </div>
        ) : null}

        {/* System message pill */}
        {systemMsg && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '8px 0', fontFamily: 'monospace' }}>
            {systemMsg}
          </div>
        )}

        {messages.filter(msg => (msg.role as string) !== 'system' && !msg.text.includes('ACTIVATION RULE') && !msg.text.startsWith('HEARTBEAT') && !msg.text.includes('000Server not running') && !msg.text.includes('Read HEARTBEAT.md') && !msg.text.includes('HEARTBEAT_OK')).map(msg => (
          <div key={msg.id} style={{
            display: 'flex',
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            gap: '8px',
            alignItems: 'flex-end',
          }}>
            {/* Avatar */}
            <div style={{
              flexShrink: 0,
              width: '26px', height: '26px', borderRadius: '50%',
              background: msg.role === 'user' ? 'var(--tertiary)' : 'var(--purple-a12)',
              border: `1px solid ${msg.role === 'user' ? 'var(--tertiary)' : 'var(--border-accent)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px',
            }}>
              {msg.role === 'assistant' ? '\u{1F9AC}' : '\u{1F98D}'}
            </div>

            {/* Content */}
            <div style={{ maxWidth: '74%', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {/* Images -- fall back to optimistic cache if history record arrived without attachments */}
              {(msg.images?.length ? msg.images : (optimisticImageCacheRef.current.get(msg.text) ?? [])).map((url, i) => (
                <img key={i} src={url} alt="attached" loading="lazy" onClick={() => setLightbox({ src: url, type: 'image' })}
                  style={{ maxWidth: '240px', maxHeight: '180px', borderRadius: '10px', display: 'block', marginBottom: '4px', border: '1px solid var(--border)', objectFit: 'contain', cursor: 'zoom-in' }}
                />
              ))}
              {/* Text bubble */}
              {msg.text && (
                <div style={{
                  padding: '9px 13px',
                  borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: msg.role === 'user' ? 'var(--tertiary)' : 'var(--bg-card)',
                  border: `1px solid ${msg.role === 'user' ? 'transparent' : 'var(--border)'}`,
                  fontSize: '13px', lineHeight: 1.65,
                  color: msg.role === 'user' ? 'var(--text-on-color)' : 'var(--text-primary)',
                  wordBreak: 'break-word',
                }}>
                  {msg.role === 'user' ? (
                    <span style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>
                  ) : (
                    <Suspense fallback={<span style={{ whiteSpace: 'pre-wrap', opacity: 0.7 }}>{msg.text}</span>}>
                      <MarkdownBubble>{msg.text}</MarkdownBubble>
                    </Suspense>
                  )}
                </div>
              )}
              {/* Timestamp */}
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', padding: '0 2px' }}>
                {formatTime(msg.timestamp)}
              </div>
            </div>
          </div>
        ))}
        {optimistic.map(msg => (
          <div key={msg.id} style={{ display: 'flex', flexDirection: 'row-reverse', gap: '8px', alignItems: 'flex-end' }}>
            {/* Avatar */}
            <div style={{
              flexShrink: 0, width: '26px', height: '26px', borderRadius: '50%',
              background: 'var(--tertiary)', border: '1px solid var(--tertiary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px',
            }}>{'\u{1F98D}'}</div>

            {/* Content */}
            <div style={{ maxWidth: '74%', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
              {/* Images */}
              {(msg.images || []).map((src, i) => (
                <img key={i} src={src} alt="attached" loading="lazy"
                  style={{ maxWidth: '200px', maxHeight: '150px', borderRadius: '10px', marginBottom: '4px', display: 'block' }}
                />
              ))}
              {/* Text bubble */}
              {msg.text && (
                <div style={{
                  padding: '9px 13px',
                  borderRadius: '14px 14px 4px 14px',
                  background: 'var(--tertiary)',
                  border: '1px solid transparent',
                  fontSize: '13px', lineHeight: 1.65,
                  color: 'var(--text-on-color)',
                  wordBreak: 'break-word',
                  opacity: msg.status === 'sending' ? 0.85 : 1,
                  transition: 'opacity 0.3s',
                }}>
                  <span style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>
                </div>
              )}
              {/* Status indicator below bubble -- iMessage style */}
              {msg.status === 'sending' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: '2px', marginTop: '2px' }}>
                  <span style={{
                    display: 'inline-block', width: '10px', height: '10px',
                    border: '1.5px solid var(--text-muted)', borderTopColor: 'transparent',
                    borderRadius: '50%', animation: 'spin 0.6s linear infinite',
                  }} />
                </div>
              )}
              {msg.status === 'sent' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: '2px', marginTop: '2px', animation: 'fadeOutCheck 2s ease forwards 0.5s' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>&#x2713;</span>
                </div>
              )}
              {msg.status === 'error' && (
                <div
                  onClick={() => retry(msg)}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', cursor: 'pointer', justifyContent: 'flex-end' }}
                >
                  <span style={{
                    width: '16px', height: '16px', borderRadius: '50%',
                    background: 'var(--red)', color: 'var(--text-on-color)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '10px', fontWeight: 700, flexShrink: 0,
                  }}>!</span>
                  <span style={{ fontSize: '11px', color: 'var(--red)', fontFamily: 'monospace' }}>Tap to retry</span>
                </div>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', alignItems: 'flex-end' }}>
            <div style={{
              flexShrink: 0, width: '26px', height: '26px', borderRadius: '50%',
              background: 'var(--purple-a12)', border: '1px solid var(--border-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px',
            }}>{'\u{1F9AC}'}</div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '12px 16px',
              background: 'var(--hover-bg)',
              border: '1px solid var(--border)',
              borderRadius: '18px 18px 18px 4px',
              width: 'fit-content',
              marginBottom: '8px',
            }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: '8px', height: '8px',
                  borderRadius: '50%',
                  background: 'var(--text-muted)',
                  display: 'inline-block',
                  animation: `typingBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom button */}
      {!atBottom && (
        <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
          <button onClick={scrollToBottom} style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            background: 'var(--hover-bg)', border: '1px solid var(--border)',
            borderRadius: '20px', padding: '5px 14px',
            color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer',
            boxShadow: '0 2px 8px var(--overlay-light)', transition: 'all 0.25s var(--ease-spring)',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
          >
            <CaretDown size={13} /> scroll to bottom
          </button>
        </div>
      )}
    </>
  )
}
