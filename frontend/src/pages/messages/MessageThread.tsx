import { useRef } from 'react'
import {
  Send, ArrowLeft, AlertCircle, Mic,
  Paperclip, X, Search, ChevronDown, ChevronUp, CornerUpLeft, Check, CheckCheck, SmilePlus,
} from 'lucide-react'

import { API_BASE } from '@/lib/api'
import { formatContactLabel } from '@/lib/utils'
import LinkPreviewCard from '@/components/messages/LinkPreviewCard'
import AudioWaveform from '@/components/messages/AudioWaveform'
import ReactionPills from '@/components/messages/ReactionPills'
import VideoThumbnail from '@/components/messages/VideoThumbnail'
import { type MessageMenuState } from '@/components/messages/MessageMenu'
import { ContactAvatar, GroupAvatar } from '@/components/messages/ContactAvatar'
import { type LightboxData } from '@/components/Lightbox'
import { cleanPayloadText } from '@/hooks/messages'
import { MessagesThreadSkeleton } from '@/components/Skeleton'

import type { Conversation, Message } from './types'
import {
  formatTime, formatTimestamp,
  isIMessage, isGroupChat, shouldShowTimestamp,
  resolveSenderName, renderTextWithLinks, highlightSearchText,
  extractFirstUrl,
} from './utils'

const contactLabel = formatContactLabel

interface MessageThreadProps {
  selected: Conversation
  messages: Message[]
  msgsLoading: boolean
  loadingMore: boolean
  contactLookup: Record<string, string>
  sseConnected: boolean
  deliveryMarkers: Record<string, string>

  // Scroll
  scrollContainerRef: React.RefObject<HTMLDivElement>
  handleScroll: () => void
  showScrollBtn: boolean
  scrollToBottom: (behavior?: ScrollBehavior) => void

  // Search
  showMessageSearch: boolean
  setShowMessageSearch: (fn: boolean | ((prev: boolean) => boolean)) => void
  messageSearch: string
  setMessageSearch: (q: string) => void
  searchMatches: number[]
  activeMatchIndex: number
  setActiveMatchIndex: (n: number) => void
  jumpToNextMatch: () => void
  jumpToPrevMatch: () => void
  searchInputRef: React.RefObject<HTMLInputElement>

  // Compose
  inputRef: React.RefObject<HTMLTextAreaElement>
  fileInputRef: React.RefObject<HTMLInputElement>
  hasDraft: boolean
  sending: boolean
  attachmentFile: File | null
  attachmentPreview: string | null
  replyTo: Message | null
  setReplyTo: (msg: Message | null) => void
  clearAttachment: () => void
  handleDraftChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSend: () => void
  handlePaste: (e: React.ClipboardEvent) => void
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  retryMessage: (msg: Message) => void
  dismissFailedMessage: (guid: string) => void

  // Drag-and-drop
  dragOver: boolean
  handleDragOver: (e: React.DragEvent) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent) => void

  // Overlays
  setLightbox: (data: LightboxData) => void
  setMessageMenu: (state: MessageMenuState | null) => void

  // Actions
  onBack: () => void
}

export default function MessageThread({
  selected,
  messages,
  msgsLoading,
  loadingMore,
  contactLookup,
  sseConnected,
  deliveryMarkers,
  scrollContainerRef,
  handleScroll,
  showScrollBtn,
  scrollToBottom,
  showMessageSearch,
  setShowMessageSearch,
  messageSearch,
  setMessageSearch,
  searchMatches,
  activeMatchIndex,
  setActiveMatchIndex,
  jumpToNextMatch,
  jumpToPrevMatch,
  searchInputRef,
  inputRef,
  fileInputRef,
  hasDraft,
  sending,
  attachmentFile,
  attachmentPreview,
  replyTo,
  setReplyTo,
  clearAttachment,
  handleDraftChange,
  handleSend,
  handlePaste,
  handleFileSelect,
  retryMessage,
  dismissFailedMessage,
  dragOver,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  setLightbox,
  setMessageMenu,
  onBack,
}: MessageThreadProps) {
  const isNearBottomRef = useRef(true)
  const imsg = isIMessage(selected)
  const isGroup = isGroupChat(selected)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
      {/* Thread header */}
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
        {isGroup
          ? <GroupAvatar conv={selected} size={34} />
          : <ContactAvatar
              address={selected.chatId || selected.participants?.[0]?.address || ''}
              name={selected.displayName}
              isImsg={imsg}
              size={34}
            />
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>{contactLabel(selected)}</div>
          <div style={{
            fontSize: '10px',
            color: imsg ? 'var(--apple-cyan)' : 'var(--apple-green)',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {imsg ? 'iMessage' : 'SMS'}
            {isGroup && (
              <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>
                {selected.participants.length} people
              </span>
            )}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              marginLeft: '8px', fontSize: '9px',
              color: sseConnected ? 'var(--apple-green)' : 'var(--apple-yellow)',
            }}>
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: sseConnected ? 'var(--apple-green)' : 'var(--apple-yellow)',
                boxShadow: sseConnected ? '0 0 4px rgba(52,199,89,0.5)' : '0 0 4px rgba(255,204,0,0.5)',
                display: 'inline-block', flexShrink: 0,
                animation: sseConnected ? undefined : 'pulse 1.5s ease-in-out infinite',
              }} />
              {!sseConnected && 'Reconnecting...'}
            </span>
          </div>
        </div>
        {isGroup && (
          <div style={{ display: 'flex', gap: '0', marginLeft: 'auto' }}>
            {selected.participants.slice(0, 6).map((p, i) => (
              <div key={p.address} style={{ marginLeft: i === 0 ? 0 : '-6px', zIndex: 6 - i }}>
                <ContactAvatar address={p.address} name={
                  (() => {
                    const digits = p.address.replace(/\D/g, '')
                    const normalized = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
                    return contactLookup[normalized] || contactLookup[p.address.toLowerCase()] || null
                  })()
                } size={26} />
              </div>
            ))}
            {selected.participants.length > 6 && (
              <div style={{
                marginLeft: '-6px', width: '26px', height: '26px', borderRadius: '50%',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600,
              }}>+{selected.participants.length - 6}</div>
            )}
          </div>
        )}
        <button
          onClick={() => {
            setShowMessageSearch((s: boolean) => {
              if (s) { setMessageSearch(''); setActiveMatchIndex(0) }
              else { setTimeout(() => searchInputRef.current?.focus(), 50) }
              return !s
            })
          }}
          aria-label="Search messages"
          style={{
            background: showMessageSearch ? 'var(--accent-a12)' : 'transparent',
            border: '1px solid var(--border)', borderRadius: '8px',
            color: showMessageSearch ? 'var(--accent-bright)' : 'var(--text-secondary)',
            padding: '6px 8px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginLeft: isGroup ? '0' : 'auto',
            transition: 'all 0.15s',
          }}
        >
          <Search size={14} />
        </button>
      </div>

      {/* Message search bar */}
      {showMessageSearch && (
        <div style={{
          padding: '8px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'rgba(167, 139, 250, 0.03)',
          animation: 'searchSlideDown 0.2s var(--ease-spring)', overflow: 'hidden',
        }}>
          <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search in conversation..."
            value={messageSearch}
            onChange={e => setMessageSearch(e.target.value)}
            aria-label="Search in conversation"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (e.shiftKey) jumpToPrevMatch()
                else jumpToNextMatch()
              }
            }}
            style={{
              flex: 1, padding: '6px 10px', fontSize: '12px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: '8px', color: 'var(--text-primary)', outline: 'none',
              fontFamily: 'inherit',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          />
          {messageSearch && (
            <span style={{
              fontSize: '11px', color: 'var(--text-muted)',
              fontFamily: "'JetBrains Mono', monospace",
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {searchMatches.length > 0
                ? `${activeMatchIndex + 1} of ${searchMatches.length}`
                : '0 results'}
            </span>
          )}
          <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
            <button onClick={jumpToPrevMatch} disabled={searchMatches.length === 0}
              aria-label="Previous match"
              style={{
                background: 'transparent', border: 'none', cursor: searchMatches.length > 0 ? 'pointer' : 'default',
                color: searchMatches.length > 0 ? 'var(--text-secondary)' : 'var(--text-muted)',
                display: 'flex', padding: '4px', borderRadius: '4px',
                opacity: searchMatches.length > 0 ? 1 : 0.4,
              }}
            >
              <ChevronUp size={14} />
            </button>
            <button onClick={jumpToNextMatch} disabled={searchMatches.length === 0}
              aria-label="Next match"
              style={{
                background: 'transparent', border: 'none', cursor: searchMatches.length > 0 ? 'pointer' : 'default',
                color: searchMatches.length > 0 ? 'var(--text-secondary)' : 'var(--text-muted)',
                display: 'flex', padding: '4px', borderRadius: '4px',
                opacity: searchMatches.length > 0 ? 1 : 0.4,
              }}
            >
              <ChevronDown size={14} />
            </button>
          </div>
          <button onClick={() => { setShowMessageSearch(false); setMessageSearch(''); setActiveMatchIndex(0) }}
            aria-label="Close search"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex', padding: '4px', borderRadius: '4px',
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-live="polite"
        style={{
          flex: 1, overflowY: msgsLoading ? 'hidden' : 'auto', padding: '16px 20px',
          position: 'relative',
        }}
      >
        {/* Drag-and-drop overlay */}
        {dragOver && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 50,
            background: 'var(--accent-a10)',
            backdropFilter: 'blur(4px)',
            border: '2px dashed var(--accent-a40)',
            borderRadius: '12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: '8px',
            pointerEvents: 'none',
          }}>
            <Paperclip size={32} style={{ color: 'var(--accent-bright)', opacity: 0.7 }} />
            <span style={{
              fontSize: '14px', fontWeight: 600, color: 'var(--accent-bright)',
              opacity: 0.9,
            }}>
              Drop to attach
            </span>
          </div>
        )}
        {loadingMore && (
          <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-muted)', fontSize: '11px' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" style={{ animation: 'spin 1s linear infinite', verticalAlign: 'middle', marginRight: '6px' }}>
              <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="19 19" strokeLinecap="round" />
            </svg>
            Loading older messages...
          </div>
        )}
        {msgsLoading && <MessagesThreadSkeleton />}
        {!msgsLoading && messages.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px 0' }}>
          {messages.map((msg, idx) => {
          const fromMe = !!msg.isFromMe
          const prevMsg = messages[idx - 1]
          const nextMsg = messages[idx + 1]
          const prevSameSender = prevMsg && !!prevMsg.isFromMe === fromMe &&
            (fromMe || prevMsg.handle?.address === msg.handle?.address)
          const nextSameSender = nextMsg && !!nextMsg.isFromMe === fromMe &&
            (fromMe || nextMsg.handle?.address === msg.handle?.address)
          const isStickerMsg = msg.attachments?.some(a => a.isSticker) === true
          const showTime = shouldShowTimestamp(messages, idx)
          const showSenderName = isGroup && !fromMe && !prevSameSender
          const showMsgAvatar = isGroup && !fromMe && !nextSameSender

          const br = fromMe
            ? { topLeft: '18px', topRight: prevSameSender && !showTime ? '4px' : '18px', bottomLeft: '18px', bottomRight: nextSameSender ? '4px' : '18px' }
            : { topLeft: prevSameSender && !showTime ? '4px' : '18px', topRight: '18px', bottomLeft: nextSameSender ? '4px' : '18px', bottomRight: '18px' }

          const replyTarget = msg.threadOriginatorGuid
            ? messages.find(m => m.guid === msg.threadOriginatorGuid) ?? null
            : null
          const firstUrl = msg.text ? extractFirstUrl(msg.text) : null
          let cleanText = cleanPayloadText(msg.text)
          // If there's a link preview, remove redundant bare domain/path lines
          // that iMessage creates when it splits a URL across lines
          if (firstUrl && cleanText) {
            try {
              const urlObj = new URL(firstUrl)
              const domain = urlObj.hostname.replace(/^www\./, '')
              // Remove lines that are just the domain or a URL path fragment
              cleanText = cleanText.split('\n').filter(line => {
                const t = line.trim()
                if (!t) return true
                if (t === domain || t === `www.${domain}`) return false
                if (t.startsWith('/') && firstUrl.includes(t)) return false
                return true
              }).join('\n').trim()
            } catch { /* ignore */ }
          }

          if (msg.groupTitle || msg.groupActionType) {
            return (
              <div key={msg.guid}>
                <div style={{
                  textAlign: 'center', padding: '8px 0',
                  fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic',
                }}>
                  {msg.groupTitle ? `Named the conversation "${msg.groupTitle}"` : 'Group updated'}
                </div>
              </div>
            )
          }

          return (
            <div key={msg.guid} data-msg-guid={msg.guid}>
            <div style={{ animation: msg.guid.startsWith('temp-') ? 'msgSlideUp 0.2s var(--ease-spring)' : undefined }}>
              {showTime && (
                <div style={{ textAlign: 'center', padding: '14px 0 10px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                  {formatTimestamp(msg.dateCreated)}
                </div>
              )}

              {showSenderName && (
                <div style={{
                  fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)',
                  paddingLeft: isGroup ? '42px' : '0', marginBottom: '2px', marginTop: '6px',
                }}>
                  {resolveSenderName(msg.handle, contactLookup)}
                </div>
              )}

              <div className="msg-row" style={{
                display: 'flex', justifyContent: fromMe ? 'flex-end' : 'flex-start',
                alignItems: 'center', gap: '4px',
                marginTop: prevSameSender && !showTime ? '1px' : '4px',
              }}>
                {/* Action hints — left of sent messages */}
                {fromMe && !msg.guid.startsWith('temp-') && (
                  <div className="reply-hint" style={{ display: 'flex', gap: '2px', flexShrink: 0, transition: 'opacity 0.15s' }}>
                    <button onClick={() => {
                        const rect = document.querySelector(`[data-msg-guid="${msg.guid}"]`)?.getBoundingClientRect()
                        if (rect) setMessageMenu({ msgGuid: msg.guid, msg, x: rect.left + rect.width / 2, y: rect.top, fromMe })
                      }}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', display: 'flex', padding: '4px',
                        borderRadius: '50%', transition: 'all 0.15s var(--ease-spring)',
                      }}
                      title="React"
                      aria-label="React"
                    >
                      <SmilePlus size={14} />
                    </button>
                    <button onClick={() => { setReplyTo(msg); inputRef.current?.focus() }}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', display: 'flex', padding: '4px',
                        borderRadius: '50%', transition: 'all 0.15s var(--ease-spring)',
                      }}
                      title="Reply"
                      aria-label="Reply"
                    >
                      <CornerUpLeft size={14} />
                    </button>
                  </div>
                )}

                {isGroup && !fromMe && (
                  <div style={{ width: '28px', flexShrink: 0 }}>
                    {showMsgAvatar && (
                      <ContactAvatar address={msg.handle?.address || ''} name={resolveSenderName(msg.handle, contactLookup)} size={28} />
                    )}
                  </div>
                )}

                <div data-msg-guid={msg.guid} style={{
                  maxWidth: '70%', display: 'flex', flexDirection: 'column',
                  opacity: msg.guid.startsWith('temp-') ? 0.7 : msg._failed ? 0.6 : 1,
                  transition: 'opacity 0.2s',
                }}>
                  {/* Reply context */}
                  {replyTarget && (
                    <>
                      <div style={{
                        fontSize: '11px',
                        color: fromMe ? 'rgba(255,255,255,0.55)' : 'var(--text-muted)',
                        padding: '0 12px', display: 'flex', alignItems: 'center', gap: '4px',
                        marginBottom: '1px',
                      }}>
                        <CornerUpLeft size={10} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {replyTarget.isFromMe ? 'You' : resolveSenderName(replyTarget.handle, contactLookup)}
                        </span>
                      </div>
                      <div style={{
                        fontSize: '11px', padding: '5px 10px', marginBottom: '2px',
                        borderRadius: '10px',
                        background: fromMe ? 'var(--border-hover)' : 'rgba(120,120,140,0.1)',
                        border: fromMe ? '1px solid var(--border-hover)' : '1px solid var(--border)',
                        color: fromMe ? 'rgba(255,255,255,0.65)' : 'var(--text-secondary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        alignSelf: fromMe ? 'flex-end' : 'flex-start',
                      }}>
                        {cleanPayloadText(replyTarget.text) || (replyTarget.attachments?.length ? 'Attachment' : 'Message')}
                      </div>
                    </>
                  )}

                  <div
                    onContextMenu={e => {
                      e.preventDefault()
                      const rect = e.currentTarget.getBoundingClientRect()
                      setMessageMenu({ msgGuid: msg.guid, msg, x: rect.left + rect.width / 2, y: rect.top, fromMe })
                    }}
                    style={{
                      padding: isStickerMsg ? '0' :
                        msg.attachments?.some(a => a.mimeType?.startsWith('image/') || a.mimeType?.startsWith('video/'))
                        ? '3px' : '8px 14px',
                      borderRadius: `${br.topLeft} ${br.topRight} ${br.bottomRight} ${br.bottomLeft}`,
                      background: isStickerMsg ? 'transparent' : fromMe
                        ? (imsg ? 'linear-gradient(135deg, var(--apple-cyan), var(--apple-blue))' : 'linear-gradient(135deg, var(--apple-green), #30b04e)')
                        : 'var(--bg-elevated)',
                      color: fromMe ? 'var(--text-on-color)' : 'var(--text-primary)',
                      fontSize: '13px', lineHeight: 1.45, wordBreak: 'break-word',
                      border: isStickerMsg ? 'none' : fromMe ? 'none' : '1px solid var(--border)',
                      cursor: 'default', overflow: 'hidden',
                    }}
                    title={formatTime(msg.dateCreated)}
                  >
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: cleanText ? '6px' : 0 }}>
                        {msg.attachments.map((att) => {
                          const mime = att.mimeType || ''
                          const src = `${API_BASE}/api/messages/attachment?guid=${encodeURIComponent(att.guid)}${att.uti ? `&uti=${encodeURIComponent(att.uti)}` : ''}`

                          if (msg.isAudioMessage || mime.startsWith('audio/') || att.transferName?.endsWith('.caf')) {
                            return <AudioWaveform key={att.guid} src={src} fromMe={fromMe} guid={att.guid} />
                          }

                          if (mime.startsWith('image/') || att.isSticker) {
                            return (
                              <img key={att.guid} src={src} alt={att.transferName || 'image'}
                                style={{
                                  maxWidth: att.isSticker ? '160px' : 'min(280px, 50vw)',
                                  maxHeight: att.isSticker ? '160px' : '420px',
                                  width: 'auto', height: 'auto',
                                  objectFit: 'contain',
                                  borderRadius: att.isSticker ? '4px' : `${br.topLeft} ${br.topRight} ${br.bottomRight} ${br.bottomLeft}`,
                                  display: 'block', cursor: 'zoom-in',
                                }}
                                loading="lazy"
                                onClick={e => { e.stopPropagation(); setLightbox({ src, type: 'image' }) }}
                                onLoad={() => { if (isNearBottomRef.current) scrollToBottom('instant') }}
                                onMouseEnter={e => { if (att.isSticker) e.currentTarget.style.animation = 'stickerWobble 0.5s ease' }}
                                onAnimationEnd={e => { e.currentTarget.style.animation = '' }}
                              />
                            )
                          }

                          if (mime.startsWith('video/')) {
                            return (
                              <VideoThumbnail key={att.guid} src={src} br={br}
                                onClick={() => setLightbox({ src, type: 'video' })} />
                            )
                          }

                          if (mime === 'application/pdf') {
                            return (
                              <a key={att.guid} href={src} target="_blank" rel="noreferrer"
                                onClick={e => e.stopPropagation()} style={{
                                  display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
                                  background: fromMe ? 'rgba(255,255,255,0.12)' : 'var(--bg-white-04)',
                                  borderRadius: '10px', textDecoration: 'none',
                                  border: fromMe ? '1px solid var(--bg-white-15)' : '1px solid var(--border)',
                                }}>
                                <div style={{
                                  width: '32px', height: '32px', borderRadius: '6px',
                                  background: 'var(--apple-red)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '10px', fontWeight: 700, color: 'var(--text-on-color)', flexShrink: 0,
                                }}>PDF</div>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{
                                    fontSize: '12px', fontWeight: 600,
                                    color: fromMe ? 'rgba(255,255,255,0.9)' : 'var(--text-primary)',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}>{att.transferName || 'Document.pdf'}</div>
                                  <div style={{ fontSize: '10px', color: fromMe ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)' }}>
                                    PDF Document
                                  </div>
                                </div>
                              </a>
                            )
                          }

                          return (
                            <a key={att.guid} href={src} target="_blank" rel="noreferrer"
                              onClick={e => e.stopPropagation()} style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                fontSize: '12px', color: fromMe ? 'rgba(255,255,255,0.8)' : 'var(--accent)',
                                textDecoration: 'none', padding: '4px 8px',
                              }}>
                              <Paperclip size={12} />
                              {att.transferName || 'Attachment'}
                            </a>
                          )
                        })}
                      </div>
                    )}

                    {msg.isAudioMessage && (!msg.attachments || msg.attachments.length === 0) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px' }}>
                        <Mic size={14} />
                        <span style={{ fontSize: '12px', fontStyle: 'italic' }}>Audio Message</span>
                      </div>
                    )}

                    {cleanText ? (
                      <div style={{
                        padding: msg.attachments?.some(a =>
                          a.mimeType?.startsWith('image/') || a.mimeType?.startsWith('video/')
                        ) ? '4px 10px 6px' : '0',
                      }}>
                        {(() => {
                          const nodes = renderTextWithLinks(cleanText, fromMe)
                          if (!messageSearch.trim()) return nodes
                          const isActive = searchMatches.length > 0 && searchMatches[activeMatchIndex] === idx
                          return highlightSearchText(nodes, messageSearch, isActive)
                        })()}
                      </div>
                    ) : !msg.attachments?.length && !msg.isAudioMessage ? (
                      <span style={{ fontSize: '12px', fontStyle: 'italic', opacity: 0.6 }}>
                        {msg.itemType === 2 ? 'Sticker' : msg.balloonBundleId ? 'iMessage App' : '\u200B'}
                      </span>
                    ) : null}

                    {firstUrl && !msg.attachments?.some(a => a.mimeType?.startsWith('image/')) && (
                      <LinkPreviewCard url={firstUrl} fromMe={fromMe} />
                    )}
                  </div>

                  {msg.reactions && msg.reactions.length > 0 && (
                    <ReactionPills reactions={msg.reactions} fromMe={fromMe} />
                  )}
                </div>

                {/* Action hints — right of received messages */}
                {!fromMe && !msg.guid.startsWith('temp-') && (
                  <div className="reply-hint" style={{ display: 'flex', gap: '2px', flexShrink: 0, transition: 'opacity 0.15s' }}>
                    <button onClick={() => { setReplyTo(msg); inputRef.current?.focus() }}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', display: 'flex', padding: '4px',
                        borderRadius: '50%', transition: 'all 0.15s var(--ease-spring)',
                      }}
                      title="Reply"
                      aria-label="Reply"
                    >
                      <CornerUpLeft size={14} />
                    </button>
                    <button onClick={() => {
                        const rect = document.querySelector(`[data-msg-guid="${msg.guid}"]`)?.getBoundingClientRect()
                        if (rect) setMessageMenu({ msgGuid: msg.guid, msg, x: rect.left + rect.width / 2, y: rect.top, fromMe })
                      }}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', display: 'flex', padding: '4px',
                        borderRadius: '50%', transition: 'all 0.15s var(--ease-spring)',
                      }}
                      title="React"
                      aria-label="React"
                    >
                      <SmilePlus size={14} />
                    </button>
                  </div>
                )}
              </div>

              {fromMe && msg._failed && (
                <div style={{
                  textAlign: 'right', fontSize: '10px', color: 'var(--apple-red-dark)',
                  padding: '2px 4px 0', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  <AlertCircle size={11} />
                  <span>Failed to send</span>
                  <button
                    onClick={() => retryMessage(msg)}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'var(--apple-blue)', fontSize: '10px', fontWeight: 500,
                      padding: '0 2px', fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => dismissFailedMessage(msg.guid)}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', display: 'flex', padding: '0 1px',
                    }}
                    title="Dismiss"
                  >
                    <X size={11} />
                  </button>
                </div>
              )}
              {fromMe && msg.guid.startsWith('temp-') && !msg._failed && (
                <div style={{
                  textAlign: 'right', fontSize: '10px', color: 'var(--text-muted)',
                  padding: '2px 4px 0', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" style={{ animation: 'spin 1s linear infinite' }}>
                    <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="14 14" strokeLinecap="round" />
                  </svg>
                  Sending...
                </div>
              )}
              {deliveryMarkers[msg.guid] && fromMe && !msg.guid.startsWith('temp-') && (
                <div style={{
                  textAlign: 'right', fontSize: '10px',
                  color: deliveryMarkers[msg.guid].startsWith('Read')
                    ? 'var(--apple-blue)'
                    : 'var(--text-muted)',
                  padding: '2px 4px 0',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: deliveryMarkers[msg.guid].startsWith('Read') ? 500 : 400,
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px',
                }}>
                  {deliveryMarkers[msg.guid].startsWith('Read') || deliveryMarkers[msg.guid] === 'Delivered'
                    ? <CheckCheck size={12} />
                    : <Check size={12} />}
                  {deliveryMarkers[msg.guid]}
                </div>
              )}
            </div>
            </div>
          )
        })}
        </div>
        )}
        <div style={{ height: '1px', flexShrink: 0 }} />
      </div>

      {/* Scroll FAB */}
      {showScrollBtn && messages.length > 0 && (
        <button onClick={() => scrollToBottom('smooth')} aria-label="Scroll to bottom" style={{
          position: 'absolute', bottom: replyTo ? '130px' : '80px', right: '20px',
          width: '36px', height: '36px', borderRadius: '50%',
          background: 'var(--bg-popover)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid var(--border)', color: 'var(--text-secondary)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 10,
          animation: 'scrollBtnIn 0.2s var(--ease-spring)',
        }}>
          <ChevronDown size={18} />
        </button>
      )}

      {/* Reply composer */}
      {replyTo && (
        <div style={{
          padding: '8px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '10px',
          background: 'rgba(167,139,250,0.04)',
          animation: 'replySlideDown 0.2s var(--ease-spring)', overflow: 'hidden',
        }}>
          <CornerUpLeft size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)' }}>
              Replying to {replyTo.isFromMe ? 'yourself' : resolveSenderName(replyTo.handle, contactLookup)}
            </div>
            <div style={{
              fontSize: '12px', color: 'var(--text-secondary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {cleanPayloadText(replyTo.text) || (replyTo.attachments?.length ? 'Attachment' : 'Message')}
            </div>
          </div>
          <button onClick={() => setReplyTo(null)} aria-label="Cancel reply" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', display: 'flex', padding: '4px', borderRadius: '50%',
          }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Attachment preview */}
      {attachmentPreview && (
        <div style={{
          padding: '8px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '10px',
          animation: 'replySlideDown 0.2s var(--ease-spring)',
        }}>
          {attachmentFile?.type.startsWith('image/') ? (
            <img src={attachmentPreview} alt="" style={{
              width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover',
            }} />
          ) : (
            <div style={{
              width: '48px', height: '48px', borderRadius: '8px',
              background: 'var(--bg-elevated)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Paperclip size={18} style={{ color: 'var(--text-muted)' }} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {attachmentFile?.name}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {attachmentFile ? `${(attachmentFile.size / 1024).toFixed(0)} KB` : ''}
            </div>
          </div>
          <button onClick={clearAttachment} aria-label="Remove attachment" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', display: 'flex', padding: '4px',
          }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: '12px 20px',
        borderTop: (replyTo || attachmentPreview) ? 'none' : '1px solid var(--border)',
        display: 'flex', gap: '10px', alignItems: 'flex-end',
      }}>
        <input ref={fileInputRef} type="file" accept="image/*,video/*,.pdf,.gif"
          onChange={handleFileSelect} style={{ display: 'none' }} />
        <button onClick={() => fileInputRef.current?.click()} aria-label="Attach file" style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', display: 'flex', padding: '6px',
          flexShrink: 0, borderRadius: '50%', transition: 'color 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <Paperclip size={18} />
        </button>
        <textarea
          ref={inputRef}
          defaultValue=""
          onChange={handleDraftChange}
          onPaste={handlePaste}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder={imsg ? 'iMessage' : 'Text Message'}
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
          onClick={handleSend}
          disabled={(!hasDraft && !attachmentFile) || sending}
          aria-label="Send message"
          style={{
            width: '36px', height: '36px', borderRadius: '50%', border: 'none',
            background: (hasDraft || attachmentFile)
              ? (imsg ? 'linear-gradient(135deg, var(--apple-cyan), var(--apple-blue))' : 'linear-gradient(135deg, var(--apple-green), #30b04e)')
              : 'var(--bg-elevated)',
            color: (hasDraft || attachmentFile) ? 'var(--text-on-color)' : 'var(--text-muted)',
            cursor: (hasDraft || attachmentFile) ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'all 0.2s var(--ease-spring)',
            transform: hasDraft ? 'scale(1)' : 'scale(0.9)',
          }}
        >
          <Send size={16} style={{ marginLeft: '-1px' }} />
        </button>
      </div>
    </div>
  )
}
