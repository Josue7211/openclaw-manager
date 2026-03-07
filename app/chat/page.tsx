'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Send, Image as ImageIcon, X, ChevronDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: string
  images?: string[]
}

type MsgStatus = 'sending' | 'sent' | 'permanent' | 'error'
interface OptimisticMsg {
  id: string
  text: string
  status: MsgStatus
  images?: string[]
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function ChatPage() {
  const [messages, setMessages]   = useState<ChatMessage[]>([])
  const [input, setInput]         = useState('')
  const [images, setImages]       = useState<string[]>([])
  const [sending, setSending]     = useState(false)
  const [connected, setConnected] = useState(false)
  const [mounted, setMounted]     = useState(false)
  const [lightbox, setLightbox]   = useState<string | null>(null)
  const [loupe, setLoupe]         = useState<{ x: number; y: number; zoom: number } | null>(null)
  const [atBottom, setAtBottom]   = useState(true)
  const [optimistic, setOptimistic] = useState<OptimisticMsg[]>([])
  const [isTyping, setIsTyping]   = useState(false)
  const lastUserMsgTimeRef        = useRef<number>(0)
  const bottomRef                 = useRef<HTMLDivElement>(null)
  const scrollRef                 = useRef<HTMLDivElement>(null)
  const fileRef                   = useRef<HTMLInputElement>(null)
  const textareaRef               = useRef<HTMLTextAreaElement>(null)
  const imgRef                    = useRef<HTMLImageElement>(null)
  const pendingReadsRef           = useRef<number>(0)   // count of in-progress FileReaders
  const pendingSendRef            = useRef<boolean>(false) // send was requested while reads pending
  const loupeRef                  = useRef<{ x: number; y: number; zoom: number } | null>(null)
  const minZoomRef                = useRef(0.5)

  const LOUPE_W = 720
  const LOUPE_H = 480

  // ── Auto-scroll (only when already at bottom) ──
  useEffect(() => {
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, optimistic, isTyping, atBottom])

  // ── Track scroll position ──
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
  }, [])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setAtBottom(true)
  }, [])

  // ── Auto-resize textarea ──
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }, [input])

  // ── Load chat draft from localStorage on mount ──
  useEffect(() => {
    const draft = localStorage.getItem('chat-draft')
    if (draft) setInput(draft)
    try {
      const saved = localStorage.getItem('chat-draft-images')
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        if (Array.isArray(parsed) && parsed.length > 0) setImages(parsed)
      }
    } catch { /* ignore */ }
  }, [])

  // ── Load history on mount ──
  useEffect(() => {
    fetch('/api/chat/history')
      .then(r => r.json())
      .then(d => { if (d.messages?.length) setMessages(d.messages) })
      .catch(() => {})
      .finally(() => setMounted(true))
  }, [])

  // ── Live polling ──
  const knownIdsRef = useRef<Set<string>>(new Set())
  const optimisticImageCacheRef = useRef<Map<string, string[]>>(new Map())

  const pollHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/history')
      const d = await res.json()
      const incoming: ChatMessage[] = d.messages || []

      setConnected(true)
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id))
        const newMsgs = incoming.filter(m => !existingIds.has(m.id))
        if (newMsgs.length === 0) return prev
        return [...prev, ...newMsgs]
      })
      // Remove optimistic messages whose text now appears in history — delayed 2s so
      // the history record has time to include its attachments before we swap it in.
      const incomingSnapshot = incoming
      setTimeout(() => {
        setOptimistic(prev => {
          if (prev.length === 0) return prev
          const filtered = prev.filter(opt => {
            const historyMsg = incomingSnapshot.find(m => m.role === 'user' && m.text === opt.text)
            if (!historyMsg) return true // keep — not in history yet
            // Keep if optimistic had images but history record doesn't yet
            if ((opt.images?.length ?? 0) > 0 && (!historyMsg.images || historyMsg.images.length === 0)) return true
            return false // safe to remove
          })
          return filtered.length === prev.length ? prev : filtered
        })
      }, 2000)
      // Clear typing indicator if assistant replied after user sent
      if (lastUserMsgTimeRef.current > 0) {
        const lastAssistant = [...incoming].reverse().find(m => m.role === 'assistant')
        if (lastAssistant && new Date(lastAssistant.timestamp).getTime() > lastUserMsgTimeRef.current) {
          setIsTyping(false)
        }
      }
    } catch {
      setConnected(false)
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(pollHistory, 2000)
    return () => clearInterval(interval)
  }, [pollHistory])

  // ── Lightbox: close on Escape ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setLightbox(null); setLoupe(null) } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Loupe: keep ref in sync so wheel handler can read latest zoom ──
  useEffect(() => { loupeRef.current = loupe }, [loupe])

  // ── Loupe: non-passive wheel listener on lightbox image ──
  useEffect(() => {
    if (!lightbox) return
    const el = imgRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (!loupeRef.current) return
      e.preventDefault()
      setLoupe(l => l ? { ...l, zoom: Math.max(minZoomRef.current, Math.min(12, l.zoom - e.deltaY * 0.008)) } : null)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [lightbox])

  // ── Paste image ──
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      Array.from(e.clipboardData?.items || []).forEach(item => {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) readImageFile(file)
        }
      })
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [])

  const readImageFile = (file: File) => {
    pendingReadsRef.current += 1
    const reader = new FileReader()
    reader.onload = e => {
      const b64 = e.target?.result as string
      setImages(prev => {
        const next = [...prev, b64]
        // Persist to localStorage if total size <= 4MB
        try {
          const total = next.reduce((sum, s) => sum + s.length, 0)
          if (total <= 4 * 1024 * 1024) {
            localStorage.setItem('chat-draft-images', JSON.stringify(next))
          }
        } catch { /* ignore quota errors */ }
        return next
      })
      pendingReadsRef.current -= 1
      // If send was requested while we were reading, fire it now
      if (pendingReadsRef.current === 0 && pendingSendRef.current) {
        pendingSendRef.current = false
        // Use setTimeout so React state (images) is flushed first
        setTimeout(() => sendNow(), 0)
      }
    }
    reader.onerror = () => { pendingReadsRef.current -= 1 }
    reader.readAsDataURL(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach(readImageFile)
    e.target.value = ''
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).forEach(readImageFile)
  }, [])

  // ── Send ──
  // sendNow: executes immediately (called when all FileReaders are done)
  const sendNow = () => {
    const text = input.trim()
    // read images from localStorage as fallback (state may not be flushed yet)
    let imgs = images
    if (imgs.length === 0) {
      try {
        const saved = localStorage.getItem('chat-draft-images')
        if (saved) imgs = JSON.parse(saved) as string[]
      } catch { /* ignore */ }
    }
    if (!text && imgs.length === 0) return
    _doSend(text, imgs)
  }

  const send = () => {
    const text = input.trim()
    if ((!text && images.length === 0 && pendingReadsRef.current === 0) || sending) return

    // If images are still being read from disk/clipboard, queue the send
    if (pendingReadsRef.current > 0) {
      pendingSendRef.current = true
      return
    }

    _doSend(text, images)
  }

  const _doSend = (text: string, imgs: string[]) => {
    const msgId = `opt-${Date.now()}-${Math.random()}`
    setSending(true)
    setInput('')
    localStorage.removeItem('chat-draft')
    localStorage.removeItem('chat-draft-images')
    setImages([])
    pendingSendRef.current = false

    // Add optimistic bubble immediately before any async work
    setOptimistic(prev => [...prev, { id: msgId, text, status: 'sending', images: imgs }])
    // Cache images so we can restore them if the history record arrives without attachments
    if (imgs.length > 0) {
      optimisticImageCacheRef.current.set(text, imgs)
      setTimeout(() => optimisticImageCacheRef.current.delete(text), 60000)
    }

    // Fire send — don't await; WS gateway has no clean ack
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, images: imgs }),
    }).catch(() => {})

    // Optimistically mark sent after 500ms fallback — no need to wait for real ack
    setTimeout(() => {
      setOptimistic(prev => prev.map(m => m.id === msgId ? { ...m, status: 'sent' } : m))
      setIsTyping(true)
      lastUserMsgTimeRef.current = Date.now()
      // After checkmark fades (0.5s delay + 2s animation), mark permanent; polling will remove it
      setTimeout(() => setOptimistic(prev => prev.map(m => m.id === msgId ? { ...m, status: 'permanent' } : m)), 2500)
      // Safety cleanup in case polling never removes it
      setTimeout(() => setOptimistic(prev => prev.filter(m => m.id !== msgId)), 30000)
      setTimeout(() => setIsTyping(false), 60000)
    }, 500)

    setSending(false)
  }

  const retry = async (msg: OptimisticMsg) => {
    setOptimistic(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'sending' } : m))
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msg.text, images: msg.images || [] }),
      })
      if (!res.ok) throw new Error('API error')
      setOptimistic(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'sent' } : m))
      setTimeout(() => setOptimistic(prev => prev.filter(m => m.id !== msg.id)), 2000)
    } catch {
      setOptimistic(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'error' } : m))
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header */}
      <div style={{ marginBottom: '16px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>Chat</h1>

        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: connected ? 'var(--green)' : 'var(--red)',
            boxShadow: connected ? '0 0 6px var(--green)' : 'none',
          }} />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {connected ? 'live' : 'reconnecting…'}
          </span>
        </div>
      </div>

      {/* Messages */}
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
                  width: item.w, height: '52px', borderRadius: '14px',
                  background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-panel) 50%, var(--bg-elevated) 75%)',
                  backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite',
                }} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '12px', paddingTop: '80px' }}>
            <span style={{ fontSize: '48px' }}>🦬</span>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '4px' }}>No messages yet</div>
              <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>Paste or drag images · Shift+Enter for newline</div>
            </div>
          </div>
        ) : null}

        {messages.map(msg => (
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
              background: msg.role === 'user' ? 'var(--accent-blue)' : 'rgba(155,132,236,0.12)',
              border: `1px solid ${msg.role === 'user' ? 'var(--accent-blue)' : 'rgba(155,132,236,0.25)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px',
            }}>
              {msg.role === 'assistant' ? '🦬' : '🦍'}
            </div>

            {/* Content */}
            <div style={{ maxWidth: '74%', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {/* Images — fall back to optimistic cache if history record arrived without attachments */}
              {(msg.images?.length ? msg.images : (optimisticImageCacheRef.current.get(msg.text) ?? [])).map((url, i) => (
                <img key={i} src={url} alt="attached" onClick={() => setLightbox(url)}
                  style={{ maxWidth: '240px', maxHeight: '180px', borderRadius: '10px', display: 'block', marginBottom: '4px', border: '1px solid var(--border)', objectFit: 'contain', cursor: 'zoom-in' }}
                />
              ))}
              {/* Text bubble */}
              {msg.text && (
                <div style={{
                  padding: '9px 13px',
                  borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: msg.role === 'user' ? 'var(--accent-blue)' : 'var(--bg-card)',
                  border: `1px solid ${msg.role === 'user' ? 'transparent' : 'var(--border)'}`,
                  fontSize: '13px', lineHeight: 1.65,
                  color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                  wordBreak: 'break-word',
                }}>
                  {msg.role === 'user' ? (
                    <span style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>
                  ) : (
                    <div className="md-bubble"><ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p style={{ margin: '0 0 8px', lineHeight: 1.65 }}>{children}</p>,
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        code: ({ inline, children, ...props }: any) => inline
                          ? <code style={{
                              fontFamily: 'JetBrains Mono, Fira Code, monospace',
                              fontSize: '12px',
                              background: 'rgba(155,132,236,0.12)',
                              color: 'var(--accent-bright)',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              border: '1px solid rgba(155,132,236,0.2)',
                            }} {...props}>{children}</code>
                          : <pre style={{
                              fontFamily: 'JetBrains Mono, Fira Code, monospace',
                              fontSize: '12px',
                              background: 'var(--bg-base)',
                              border: '1px solid var(--border)',
                              borderRadius: '8px',
                              padding: '12px 14px',
                              overflowX: 'auto',
                              margin: '8px 0',
                              lineHeight: 1.5,
                            }}><code {...props}>{children}</code></pre>,
                        pre: ({ children }) => <>{children}</>,
                        ul: ({ children }) => <ul style={{ margin: '4px 0 8px', paddingLeft: '20px' }}>{children}</ul>,
                        ol: ({ children }) => <ol style={{ margin: '4px 0 8px', paddingLeft: '20px' }}>{children}</ol>,
                        li: ({ children }) => <li style={{ marginBottom: '2px' }}>{children}</li>,
                        strong: ({ children }) => <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{children}</strong>,
                        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-bright)', textDecoration: 'underline' }}>{children}</a>,
                        blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid var(--accent)', paddingLeft: '12px', margin: '8px 0', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{children}</blockquote>,
                        h1: ({ children }) => <h1 style={{ fontSize: '16px', fontWeight: 700, margin: '8px 0 4px', color: 'var(--text-primary)' }}>{children}</h1>,
                        h2: ({ children }) => <h2 style={{ fontSize: '14px', fontWeight: 700, margin: '8px 0 4px', color: 'var(--text-primary)' }}>{children}</h2>,
                        h3: ({ children }) => <h3 style={{ fontSize: '13px', fontWeight: 600, margin: '6px 0 3px', color: 'var(--text-primary)' }}>{children}</h3>,
                        hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />,
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown></div>
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
              background: 'var(--accent-blue)', border: '1px solid var(--accent-blue)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px',
            }}>🦍</div>

            {/* Content */}
            <div style={{ maxWidth: '74%', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
              {/* Images */}
              {(msg.images || []).map((src, i) => (
                <img key={i} src={src} alt="attached"
                  style={{ maxWidth: '200px', maxHeight: '150px', borderRadius: '8px', marginBottom: '4px', display: 'block' }}
                />
              ))}
              {/* Text bubble */}
              {msg.text && (
                <div style={{
                  padding: '9px 13px',
                  borderRadius: '14px 14px 4px 14px',
                  background: 'var(--accent-blue)',
                  border: '1px solid transparent',
                  fontSize: '13px', lineHeight: 1.65,
                  color: '#fff',
                  wordBreak: 'break-word',
                  opacity: msg.status === 'sending' ? 0.85 : 1,
                  transition: 'opacity 0.3s',
                }}>
                  <span style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>
                </div>
              )}
              {/* Status indicator below bubble — iMessage style */}
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
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>✓</span>
                </div>
              )}
              {msg.status === 'error' && (
                <div
                  onClick={() => retry(msg)}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', cursor: 'pointer', justifyContent: 'flex-end' }}
                >
                  <span style={{
                    width: '16px', height: '16px', borderRadius: '50%',
                    background: 'var(--red)', color: '#fff',
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
              background: 'rgba(155,132,236,0.12)', border: '1px solid rgba(155,132,236,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px',
            }}>🦬</div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '12px 16px',
              background: 'var(--bg-elevated)',
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

      {/* Image previews */}
      {images.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px', flexShrink: 0 }}>
          {images.map((url, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={url} alt="preview" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }} />
              <button
                onClick={() => setImages(prev => {
                  const next = prev.filter((_, j) => j !== i)
                  try {
                    if (next.length === 0) localStorage.removeItem('chat-draft-images')
                    else localStorage.setItem('chat-draft-images', JSON.stringify(next))
                  } catch { /* ignore */ }
                  return next
                })}
                style={{ position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--red)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Scroll to bottom button */}
      {!atBottom && (
        <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
          <button onClick={scrollToBottom} style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: '20px', padding: '5px 14px',
            color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)', transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
          >
            <ChevronDown size={13} /> scroll to bottom
          </button>
        </div>
      )}

      {/* Input */}
      <div style={{
        flexShrink: 0,
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px',
        padding: '10px 12px', display: 'flex', alignItems: 'flex-end', gap: '8px',
      }}>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileChange} style={{ display: 'none' }} />
        <button onClick={() => fileRef.current?.click()} title="Attach image"
          style={{ flexShrink: 0, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <ImageIcon size={18} />
        </button>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => { setInput(e.target.value); localStorage.setItem('chat-draft', e.target.value) }}
          onKeyDown={onKeyDown}
          placeholder="Message Bjorn… (paste or drag images)"
          rows={1}
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '13px', lineHeight: 1.6, resize: 'none', fontFamily: 'inherit', maxHeight: '160px', overflowY: 'auto' }}
        />

        <button onClick={send} disabled={sending || (!input.trim() && images.length === 0)}
          style={{
            flexShrink: 0,
            background: (sending || (!input.trim() && images.length === 0)) ? 'var(--bg-elevated)' : 'var(--accent)',
            border: 'none', borderRadius: '8px',
            color: (sending || (!input.trim() && images.length === 0)) ? 'var(--text-muted)' : '#fff',
            padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.15s',
          }}
        >
          <Send size={15} />
        </button>
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeOutCheck { 0% { opacity: 1; } 100% { opacity: 0; } }
        .md-bubble p:last-child { margin-bottom: 0 !important; }
      `}</style>

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => { setLightbox(null); setLoupe(null) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          {/* Image + loupe container */}
          <div
            onClick={e => e.stopPropagation()}
            style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}
          >
            <img
              ref={imgRef}
              src={lightbox}
              alt="expanded"
              style={{
                maxWidth: '80vw', maxHeight: '80vh',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                objectFit: 'contain',
                boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
                display: 'block',
                cursor: loupe ? 'crosshair' : 'zoom-in',
                userSelect: 'none',
              }}
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect()
                const x = e.clientX - rect.left
                const y = e.clientY - rect.top
                setLoupe(l => l ? null : { x, y, zoom: 2.1 })
              }}
              onMouseMove={e => {
                if (!loupeRef.current) return
                const rect = e.currentTarget.getBoundingClientRect()
                setLoupe(l => l ? { ...l, x: e.clientX - rect.left, y: e.clientY - rect.top } : null)
              }}
            />

            {/* Loupe */}
            {loupe && imgRef.current && (() => {
              const iw = imgRef.current.clientWidth
              const ih = imgRef.current.clientHeight
              // keep 15% buffer so image always overfills the loupe — no blank edges
              minZoomRef.current = Math.max(LOUPE_W / iw, LOUPE_H / ih) / 0.85
              const lx = Math.max(LOUPE_W / 2, Math.min(iw - LOUPE_W / 2, loupe.x))
              const ly = Math.max(LOUPE_H / 2, Math.min(ih - LOUPE_H / 2, loupe.y))
              return (
                <div
                  style={{
                    position: 'absolute',
                    left: lx - LOUPE_W / 2,
                    top: ly - LOUPE_H / 2,
                    width: LOUPE_W,
                    height: LOUPE_H,
                    borderRadius: '10px',
                    border: '2px solid rgba(255,255,255,0.35)',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
                    backgroundImage: `url(${lightbox})`,
                    backgroundSize: `${iw * loupe.zoom}px ${ih * loupe.zoom}px`,
                    backgroundPosition: `${LOUPE_W / 2 - loupe.x * loupe.zoom}px ${LOUPE_H / 2 - loupe.y * loupe.zoom}px`,
                    backgroundRepeat: 'no-repeat',
                    pointerEvents: 'none',
                  }}
                />
              )
            })()}
          </div>

          {/* Close button */}
          <button
            onClick={() => { setLightbox(null); setLoupe(null) }}
            style={{
              position: 'fixed', top: '20px', right: '24px',
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '50%', width: '32px', height: '32px',
              color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
