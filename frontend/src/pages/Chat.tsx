



import { lazy, Suspense, useState } from 'react'
import { ChatText, Robot } from '@phosphor-icons/react'
import { PageHeader } from '@/components/PageHeader'
import { DemoBadge } from '@/components/DemoModeBanner'
import { GenericPageSkeleton } from '@/components/Skeleton'

const Lightbox = lazy(() => import('@/components/Lightbox'))
const BjornTab = lazy(() => import('./chat/BjornTab'))

import ChatThread from './chat/ChatThread'
import ChatInput from './chat/ChatInput'
import { NotConfiguredBanner } from './chat/NotConfiguredBanner'
import { HistoryErrorBanner } from './chat/HistoryErrorBanner'
import { useChatState } from './chat/useChatState'

export default function ChatPage() {
  const [activeTab, setActiveTab] = useState<'chat' | 'bjorn'>('chat')

  const {
    _demo,
    messages,
    input, setInput,
    images, setImages, imagesRef,
    sending,
    connected,
    mounted,
    lightbox, setLightbox,
    atBottom, setAtBottom,
    optimistic,
    isTyping,
    systemMsg,
    notConfigured,
    historyError,
    model, setModel,
    modelsData,
    wsConnected,
    historyIsError,
    bottomRef, scrollRef,
    optimisticImageCacheRef,
    draftTimerRef,
    send,
    retry,
    retryHistoryLoad,
    handleFileChange,
    onDrop,
  } = useChatState()

  return (
    <div style={{ position: 'absolute', inset: 0, margin: '-20px -28px', display: 'flex', flexDirection: 'column', padding: '20px 28px' }}>

      {/* Header bar: title + tab switcher + model selector + connection status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <PageHeader defaultTitle="Chat" />
          {_demo && <DemoBadge />}

          {/* Tab switcher */}
          <div style={tabContainerStyle}>
            <button
              onClick={() => setActiveTab('chat')}
              aria-label="Chat tab"
              aria-pressed={activeTab === 'chat'}
              style={{
                ...tabBtnStyle,
                background: activeTab === 'chat' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'chat' ? 'var(--text-on-accent)' : 'var(--text-secondary)',
              }}
            >
              <ChatText size={14} />
              Chat
            </button>
            <button
              onClick={() => setActiveTab('bjorn')}
              aria-label="Bjorn tab"
              aria-pressed={activeTab === 'bjorn'}
              style={{
                ...tabBtnStyle,
                background: activeTab === 'bjorn' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'bjorn' ? 'var(--text-on-accent)' : 'var(--text-secondary)',
              }}
            >
              <Robot size={14} />
              Bjorn
            </button>
          </div>
        </div>

        {activeTab === 'chat' && (
          <ChatInput.Header
            model={model} setModel={setModel} models={modelsData?.models ?? []}
            connected={connected} wsConnected={wsConnected}
            historyIsError={historyIsError} isDemo={_demo}
          />
        )}
      </div>

      {/* Chat tab content */}
      {activeTab === 'chat' && (
        <>
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
            onFileChange={handleFileChange}
            draftTimerRef={draftTimerRef}
          />
        </>
      )}

      {/* Bjorn tab content */}
      {activeTab === 'bjorn' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Suspense fallback={<GenericPageSkeleton />}>
            <BjornTab />
          </Suspense>
        </div>
      )}

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes fadeOutCheck { 0% { opacity: 1; } 100% { opacity: 0; } }
        .md-bubble p:last-child { margin-bottom: 0 !important; }
      `}</style>

      <Suspense fallback={null}>
        <Lightbox data={lightbox} onClose={() => setLightbox(null)} />
      </Suspense>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab switcher styles
// ---------------------------------------------------------------------------

const tabContainerStyle: React.CSSProperties = {
  display: 'inline-flex',
  gap: '2px',
  background: 'var(--hover-bg)',
  borderRadius: '8px',
  padding: '2px',
}

const tabBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  padding: '6px 14px',
  borderRadius: '6px',
  border: 'none',
  fontSize: '13px',
  fontWeight: 500,
  fontFamily: 'inherit',
  cursor: 'pointer',
  transition: 'all 0.2s var(--ease-spring)',
}
