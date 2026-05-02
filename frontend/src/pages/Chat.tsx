



import { lazy, Suspense, useEffect, useState } from 'react'
import { DemoBadge } from '@/components/DemoModeBanner'
import { useGatewaySessions } from '@/hooks/sessions/useGatewaySessions'
import { CaretLeft, CaretRight, ChatCircle } from '@phosphor-icons/react'

const Lightbox = lazy(() => import('@/components/Lightbox'))

import ChatThread from './chat/ChatThread'
import ChatInput from './chat/ChatInput'
import { NotConfiguredBanner } from './chat/NotConfiguredBanner'
import { HistoryErrorBanner } from './chat/HistoryErrorBanner'
import { useChatState } from './chat/useChatState'
import { SessionList } from './sessions/SessionList'

const CHAT_SELECTED_SESSION_KEY = 'chat-selected-session-key'
const CHAT_SIDEBAR_COLLAPSED_KEY = 'chat-sidebar-collapsed'

function loadSelectedSessionKey(): string | null {
  try {
    return localStorage.getItem(CHAT_SELECTED_SESSION_KEY)
  } catch {
    return null
  }
}

function saveSelectedSessionKey(key: string | null) {
  try {
    if (key) localStorage.setItem(CHAT_SELECTED_SESSION_KEY, key)
    else localStorage.removeItem(CHAT_SELECTED_SESSION_KEY)
  } catch {
    // ignore storage access failures
  }
}

function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(CHAT_SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function saveSidebarCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(CHAT_SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // ignore storage access failures
  }
}

export default function ChatPage() {
  const { sessions } = useGatewaySessions()
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(loadSelectedSessionKey)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed)
  const selectedSession = sessions.find((session) => session.key === selectedSessionKey) ?? null
  const chatTitle = String(selectedSession?.label || 'New chat')
  const chatSubtitle = selectedSession
    ? `${selectedSession.messageCount || 0} messages`
    : 'Choose a chat or send a new message'

  useEffect(() => {
    if (sessions.length === 0) return
    if (selectedSessionKey && sessions.some((session) => session.key === selectedSessionKey)) return

    const nextKey = sessions[0]?.key as string | undefined
    if (nextKey) {
      setSelectedSessionKey(nextKey)
      saveSelectedSessionKey(nextKey)
    }
  }, [selectedSessionKey, sessions])

  const handleSelectSession = (key: string) => {
    setSelectedSessionKey(key)
    saveSelectedSessionKey(key)
  }

  const setCollapsed = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed)
    saveSidebarCollapsed(collapsed)
  }

  const {
    _demo,
    messages,
    input, setInput,
    images, setImages, imagesRef,
    sending,
    connected,
    mounted,
    lightbox, setLightbox,
    atBottom, setAtBottom, setAtBottomRefOnly,
    optimistic,
    isTyping,
    systemMsg,
    notConfigured,
    historyError,
    model, setModel,
    modelsData,
    visibleModels,
    wsConnected,
    historyIsError,
    bottomRef, scrollRef,
    optimisticImageCacheRef,
    draftTimerRef,
    send,
    stop,
    retry,
    retryHistoryLoad,
    handleFileChange,
    onDrop,
  } = useChatState(selectedSessionKey)

  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('textarea,input,select,[contenteditable="true"]')) return

      let deltaY = event.deltaY
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) deltaY *= 32
      if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) deltaY *= scroller.clientHeight
      if (deltaY === 0) return

      event.preventDefault()
      event.stopImmediatePropagation()

      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      const step = Math.sign(deltaY) * Math.min(Math.abs(deltaY), 180)
      scroller.scrollTop = Math.max(0, Math.min(max, scroller.scrollTop + step))
      setAtBottomRefOnly(max - scroller.scrollTop < 80)
    }

    document.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => {
      document.removeEventListener('wheel', onWheel, { capture: true })
    }
  }, [scrollRef, setAtBottomRefOnly])

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      overflow: 'hidden',
      overscrollBehavior: 'contain',
      margin: '-20px -28px',
    }}>
      <aside style={{
        width: sidebarCollapsed ? 56 : 252,
        minWidth: sidebarCollapsed ? 56 : 232,
        maxWidth: sidebarCollapsed ? 56 : 280,
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.18s var(--ease-spring), min-width 0.18s var(--ease-spring)',
      }}>
        {sidebarCollapsed ? (
          <ChatSessionRail
            sessions={sessions}
            selectedId={selectedSessionKey}
            onSelect={handleSelectSession}
            onExpand={() => setCollapsed(false)}
          />
        ) : (
          <SessionList
            selectedId={selectedSessionKey}
            onSelect={handleSelectSession}
            onDeleteSelected={(key) => {
              if (selectedSessionKey === key) {
                setSelectedSessionKey(null)
                saveSelectedSessionKey(null)
              }
            }}
            title="Chats"
            headerAction={
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse chat list"
                title="Collapse chat list"
                className="hover-bg"
                style={{
                  width: 28,
                  height: 28,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <CaretLeft size={15} />
              </button>
            }
          />
        )}
      </aside>

      <main style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        padding: '20px 28px',
      }}>
        {/* Header bar: title + model selector + connection status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, marginBottom: 10, gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <h1 style={{
                margin: 0,
                fontSize: 18,
                lineHeight: 1.2,
                fontWeight: 700,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {chatTitle}
              </h1>
            </div>
            <div style={{
              marginTop: 3,
              fontSize: 12,
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {chatSubtitle}
            </div>
            {_demo && <DemoBadge />}
          </div>

          <ChatInput.Header
            model={model} setModel={setModel} models={visibleModels.length > 0 ? visibleModels : (modelsData?.models ?? [])}
            agentLabel={modelsData?.agentLabel}
            connected={connected} wsConnected={wsConnected}
            historyIsError={historyIsError} isDemo={_demo}
          />
        </div>

        {notConfigured && <NotConfiguredBanner />}

        {historyError && (
          <HistoryErrorBanner error={historyError} onRetry={retryHistoryLoad} />
        )}

        {/* Message thread */}
        <ChatThread
          messages={messages}
          optimistic={optimistic}
          isTyping={isTyping}
          mounted={mounted}
          atBottom={atBottom}
          systemMsg={systemMsg}
          lightbox={lightbox}
          setLightbox={setLightbox}
          setAtBottom={setAtBottom}
          setAtBottomRefOnly={setAtBottomRefOnly}
          scrollRef={scrollRef}
          bottomRef={bottomRef}
          optimisticImageCacheRef={optimisticImageCacheRef}
          onDrop={onDrop}
          retry={retry}
        />

        {/* Chat input at bottom */}
        <ChatInput
          input={input}
          setInput={setInput}
          images={images}
          setImages={setImages}
          imagesRef={imagesRef}
          sending={sending}
          onSend={send}
          onStop={stop}
          onFileChange={handleFileChange}
          draftTimerRef={draftTimerRef}
        />

        <style>{`
          @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
          @keyframes fadeOutCheck { 0% { opacity: 1; } 100% { opacity: 0; } }
          .md-bubble p:last-child { margin-bottom: 0 !important; }
        `}</style>
      </main>

      <Suspense fallback={null}>
        <Lightbox data={lightbox} onClose={() => setLightbox(null)} />
      </Suspense>
    </div>
  )
}

function ChatSessionRail({
  sessions,
  selectedId,
  onSelect,
  onExpand,
}: {
  sessions: Array<{ key: string; label: string; messageCount: number }>
  selectedId: string | null
  onSelect: (key: string) => void
  onExpand: () => void
}) {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '10px 8px',
      gap: 8,
    }}>
      <button
        type="button"
        onClick={onExpand}
        aria-label="Expand chat list"
        title="Expand chat list"
        className="hover-bg"
        style={{
          width: 36,
          height: 32,
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--bg-card)',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0,
          flexShrink: 0,
        }}
      >
        <CaretRight size={15} />
      </button>

      <div style={{
        width: '100%',
        height: 1,
        background: 'var(--border)',
        margin: '2px 0',
        flexShrink: 0,
      }} />

      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        width: '100%',
      }}>
        {sessions.slice(0, 30).map((session) => {
          const selected = session.key === selectedId
          const label = session.label || 'Untitled chat'
          return (
            <button
              key={session.key}
              type="button"
              onClick={() => onSelect(session.key)}
              aria-label={label}
              title={label}
              className="hover-bg"
              style={{
                width: 36,
                height: 36,
                border: `1px solid ${selected ? 'var(--accent)55' : 'var(--border)'}`,
                borderRadius: 8,
                background: selected ? 'var(--active-bg)' : 'var(--bg-card)',
                color: selected ? 'var(--accent)' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
                flexShrink: 0,
              }}
            >
              <ChatCircle size={18} weight={selected ? 'fill' : 'regular'} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
