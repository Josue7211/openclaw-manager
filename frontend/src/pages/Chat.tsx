



import { lazy, Suspense } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { DemoBadge } from '@/components/DemoModeBanner'

const Lightbox = lazy(() => import('@/components/Lightbox'))

import ChatThread from './chat/ChatThread'
import ChatInput from './chat/ChatInput'
import { NotConfiguredBanner } from './chat/NotConfiguredBanner'
import { HistoryErrorBanner } from './chat/HistoryErrorBanner'
import { useChatState } from './chat/useChatState'

export default function ChatPage() {
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

      {/* Header bar: title + model selector + connection status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <PageHeader defaultTitle="Chat" />
          {_demo && <DemoBadge />}
        </div>

        <ChatInput.Header
          model={model} setModel={setModel} models={modelsData?.models ?? []}
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

