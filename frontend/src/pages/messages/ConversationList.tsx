import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChatText, ArrowsClockwise, MagnifyingGlass, Check, NotePencil, BellSlash, PushPin } from '@phosphor-icons/react'
import { formatContactLabel } from '@/lib/utils'
import { ContactAvatar, GroupAvatar } from '@/components/messages/ContactAvatar'
import { cleanPayloadText } from '@/hooks/messages'
import { MessagesConversationSkeleton } from '@/components/Skeleton'
import { isDemoMode, DEMO_CONVERSATIONS } from '@/lib/demo-data'
import { DemoBadge } from '@/components/DemoModeBanner'
import type { Conversation, Message, ServiceFilter, ConvContextMenu } from './types'
import { timeAgo, isIMessage, isGroupChat } from './utils'

const contactLabel = formatContactLabel

interface ConversationListProps {
  pageTitle: string
  panelWidth: number
  isDragging: boolean
  selected: Conversation | null
  composeMode: boolean

  // Conversation data
  conversations: Conversation[]
  filteredConversations: Conversation[]
  loading: boolean
  loadingMoreConvs: boolean
  convListRef: React.RefObject<HTMLDivElement | null>

  // Filters
  searchQuery: string
  setSearchQuery: (q: string) => void
  serviceFilter: ServiceFilter
  setServiceFilter: (f: ServiceFilter) => void
  showJunk: boolean
  setShowJunk: (fn: (prev: boolean) => boolean) => void

  // Selection
  selectMode: boolean
  setSelectMode: (v: boolean) => void
  selectedConvs: Set<string>
  setSelectedConvs: (fn: (prev: Set<string>) => Set<string>) => void
  focusedConvIndex: number
  setFocusedConvIndex: (fn: number | ((prev: number) => number)) => void

  // Muted/pinned
  mutedConvs: string[]
  pinnedConvs: string[]

  // Actions
  onSelectConversation: (conv: Conversation) => void
  onStartCompose: () => void
  onRefresh: () => void
  onConvListScroll: () => void
  onContextMenu: (ctx: ConvContextMenu) => void
  onBatchMarkRead: () => void
  onBatchMarkUnread: () => void
  onBatchDelete: () => void

  // Messages (for refresh)
  fetchMessages: (conv: Conversation) => void
}

export default function ConversationList({
  pageTitle,
  panelWidth,
  isDragging,
  selected,
  composeMode,
  conversations,
  filteredConversations,
  loading,
  loadingMoreConvs,
  convListRef,
  searchQuery,
  setSearchQuery,
  serviceFilter,
  setServiceFilter,
  showJunk,
  setShowJunk,
  selectMode,
  setSelectMode,
  selectedConvs,
  setSelectedConvs,
  focusedConvIndex,
  setFocusedConvIndex,
  mutedConvs,
  pinnedConvs,
  onSelectConversation,
  onStartCompose,
  onRefresh,
  onConvListScroll,
  onContextMenu,
  onBatchMarkRead,
  onBatchMarkUnread,
  onBatchDelete,
  fetchMessages,
}: ConversationListProps) {

  const convVirtualizer = useVirtualizer({
    count: filteredConversations.length,
    getScrollElement: () => convListRef.current,
    estimateSize: () => 72,
    overscan: 5,
  })

  return (
    <div style={{
      width: (selected || composeMode) ? `${panelWidth}px` : '100%',
      maxWidth: (selected || composeMode) ? '600px' : undefined,
      minWidth: (selected || composeMode) ? '72px' : undefined,
      borderRight: (selected || composeMode) ? '1px solid var(--border)' : 'none',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0,
      overflow: 'hidden',
      transition: isDragging ? 'none' : 'width 0.25s var(--ease-spring)',
    }}>
      {/* Header — hide title first as panel narrows, buttons only at medium, empty spacer at avatar-only */}
      <div style={{
        padding: '0 6px 0 22px',
        height: '57px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '10px',
        flexShrink: 0,
      }}>
        {(() => {
          const title = pageTitle
          const charsVisible = panelWidth >= 260 ? title.length
            : panelWidth <= 80 ? 0
            : Math.round(((panelWidth - 80) / 180) * title.length)
          const visibleText = title.slice(0, charsVisible)
          const isDeleting = charsVisible < title.length && charsVisible > 0
          const iconSize = 24
          const badgeOpacity = panelWidth >= 340 ? 1 : panelWidth <= 310 ? 0 : (panelWidth - 310) / 30
          // Buttons fade in after title is mostly visible
          const btnOpacity = panelWidth >= 320 ? 1 : panelWidth <= 280 ? 0 : (panelWidth - 280) / 40
          return (
            <>
              <ChatText size={iconSize} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              {charsVisible > 0 && (
                <h1 style={{
                  margin: 0, fontSize: '20px', fontWeight: 700,
                  whiteSpace: 'nowrap', overflow: 'hidden',
                  display: 'flex', alignItems: 'center',
                }}>
                  {visibleText}
                  {isDeleting && (
                    <span className="type-cursor" style={{
                      display: 'inline-block', width: '2px', height: '20px',
                      background: 'var(--accent)', marginLeft: '1px',
                      borderRadius: '1px',
                    }} />
                  )}
                </h1>
              )}
              {badgeOpacity > 0 && !loading && (
                <span className="badge badge-blue" style={{
                  marginLeft: '2px', opacity: badgeOpacity,
                }}>{conversations.length}</span>
              )}
              {btnOpacity > 0 && (
                <div style={{ display: 'flex', gap: '6px', opacity: btnOpacity, flexShrink: 0, marginLeft: '8px' }}>
                  <button
                    onClick={() => {
                      if (selectMode) { setSelectMode(false); setSelectedConvs(() => new Set()) }
                      else setSelectMode(true)
                    }}
                    style={{
                      background: selectMode ? 'var(--blue-a25)' : 'transparent',
                      border: '1px solid var(--border)', borderRadius: '8px',
                      color: selectMode ? 'var(--apple-blue)' : 'var(--text-secondary)',
                      padding: '7px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
                    }}
                  >
                    {selectMode ? 'Done' : 'Edit'}
                  </button>
                  <button
                    onClick={() => { onRefresh(); if (selected) fetchMessages(selected) }}
                    aria-label="Refresh"
                    style={{
                      background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px',
                      color: 'var(--text-secondary)', padding: '7px 10px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center',
                    }}
                  >
                    <ArrowsClockwise size={14} />
                  </button>
                  <button
                    onClick={onStartCompose}
                    aria-label="New Message"
                    style={{
                      background: composeMode ? 'var(--blue-a25)' : 'transparent',
                      border: '1px solid var(--border)', borderRadius: '8px',
                      color: composeMode ? 'var(--apple-blue)' : 'var(--text-secondary)',
                      padding: '7px 10px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center',
                    }}
                  >
                    <NotePencil size={14} />
                  </button>
                </div>
              )}
            </>
          )
        })()}
      </div>

      {(() => {
        const searchOpacity = panelWidth >= 300 ? 1 : panelWidth <= 240 ? 0 : (panelWidth - 240) / 60
        const searchHeight = panelWidth >= 300 ? 46 : panelWidth <= 240 ? 0 : ((panelWidth - 240) / 60) * 46
        const filtersHeight = panelWidth >= 300 ? 42 : panelWidth <= 240 ? 0 : ((panelWidth - 240) / 60) * 42
        return (
          <>
            <div style={{
              height: `${searchHeight}px`, opacity: searchOpacity, overflow: 'hidden',
              transition: isDragging ? 'none' : 'height 0.25s ease, opacity 0.2s ease',
            }}>
              <div style={{ padding: '10px 14px 6px', position: 'relative' }}>
                <MagnifyingGlass size={13} style={{
                  position: 'absolute', left: '26px', top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-muted)', pointerEvents: 'none',
                }} />
                <input
                  type="text" placeholder="MagnifyingGlass" value={searchQuery}
                  aria-label="MagnifyingGlass conversations"
                  onChange={e => setSearchQuery(e.target.value)}
                  tabIndex={searchOpacity === 0 ? -1 : 0}
                  style={{
                    width: '100%', padding: '8px 12px 8px 34px', fontSize: '13px',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    borderRadius: '10px', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                />
              </div>
            </div>

            <div style={{
              height: `${filtersHeight}px`, opacity: searchOpacity, overflow: 'hidden',
              transition: isDragging ? 'none' : 'height 0.25s ease, opacity 0.2s ease',
            }}>
              <div style={{ display: 'flex', gap: '4px', padding: '6px 14px 8px', borderBottom: '1px solid var(--border)' }}>
                {(['all', 'iMessage', 'SMS'] as ServiceFilter[]).map(f => {
                  const act = serviceFilter === f && !showJunk
                  const count = f === 'all' ? conversations.length
                    : conversations.filter(c => f === 'iMessage' ? isIMessage(c) : !isIMessage(c)).length
                  return (
                    <button key={f} onClick={() => { setServiceFilter(f); if (showJunk) setShowJunk(() => false) }} style={{
                      flex: 1, padding: '6px 8px', fontSize: '11px',
                      fontWeight: act ? 600 : 450,
                      color: act ? 'var(--text-on-color)' : 'var(--text-secondary)',
                      background: act
                        ? (f === 'iMessage' ? 'var(--blue-a25)' : f === 'SMS' ? 'var(--green-a15)' : 'var(--accent-a15)')
                        : 'transparent',
                      border: act ? 'none' : '1px solid var(--border)',
                      borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                      {f === 'all' ? 'All' : f}{!showJunk && <span style={{ opacity: 0.6, fontSize: '10px', marginLeft: '4px' }}>{count}</span>}
                    </button>
                  )
                })}
                <button onClick={() => setShowJunk(j => !j)} style={{
                  flex: 1, padding: '6px 8px', fontSize: '11px',
                  fontWeight: showJunk ? 600 : 450,
                  color: showJunk ? 'var(--text-on-color)' : 'var(--text-muted)',
                  background: showJunk ? 'var(--red-a15)' : 'transparent',
                  border: showJunk ? 'none' : '1px solid var(--border)',
                  borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  Junk
                </button>
              </div>
            </div>
          </>
        )
      })()}

      <div
        ref={convListRef}
        onScroll={onConvListScroll}
        tabIndex={0}
        onKeyDown={e => {
          const target = e.target as HTMLElement
          const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
          if (e.key === 'ArrowDown' || (!isInput && e.key === 'j')) {
            e.preventDefault()
            setFocusedConvIndex(prev => {
              const next = Math.min((prev as number) + 1, filteredConversations.length - 1)
              convVirtualizer.scrollToIndex(next, { align: 'auto' })
              return next
            })
          } else if (e.key === 'ArrowUp' || (!isInput && e.key === 'k')) {
            e.preventDefault()
            setFocusedConvIndex(prev => {
              const next = Math.max((prev as number) - 1, 0)
              convVirtualizer.scrollToIndex(next, { align: 'auto' })
              return next
            })
          } else if (e.key === 'Enter' && focusedConvIndex >= 0 && focusedConvIndex < filteredConversations.length) {
            e.preventDefault()
            onSelectConversation(filteredConversations[focusedConvIndex])
          }
        }}
        className="hidden-scrollbar"
        role="list"
        style={{ flex: 1, overflowY: 'auto', padding: '4px 0', outline: 'none' }}
      >
        {loading && !isDemoMode() && <MessagesConversationSkeleton />}
        {!loading && conversations.length === 0 && !searchQuery && !isDemoMode() && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '48px 16px', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', gap: '12px',
          }}>
            <ChatText size={32} style={{ opacity: 0.3 }} />
            <div>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '4px' }}>No conversations yet</div>
              <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>Messages will appear here once available</div>
            </div>
          </div>
        )}
        {!loading && conversations.length === 0 && !searchQuery && isDemoMode() && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px 0' }}>
            <div style={{ padding: '6px 12px', marginBottom: '4px' }}>
              <DemoBadge />
            </div>
            {DEMO_CONVERSATIONS.map(conv => (
              <div
                key={conv.guid}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px', borderRadius: '10px',
                  background: 'var(--bg-white-03)',
                  border: '1px solid var(--border)',
                  cursor: 'default', opacity: 0.7,
                }}
              >
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  background: 'var(--accent-a15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '14px', color: 'var(--accent)', fontWeight: 600, flexShrink: 0,
                }}>
                  {(conv.displayName || '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conv.displayName}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conv.lastMessage}
                  </div>
                </div>
              </div>
            ))}
            <div style={{ padding: '12px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center' }}>
              Connect BlueBubbles in Settings to see real messages
            </div>
          </div>
        )}
        {!loading && filteredConversations.length === 0 && searchQuery && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '32px 16px', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', gap: '8px',
          }}>
            <MagnifyingGlass size={20} style={{ opacity: 0.4 }} />
            <span>No conversations match your search</span>
          </div>
        )}
        {!loading && filteredConversations.length > 0 && (
          <div style={{ height: `${convVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
            {convVirtualizer.getVirtualItems().map(virtualRow => {
              const convIdx = virtualRow.index
              const conv = filteredConversations[convIdx]
              const active = selected?.guid === conv.guid
              const isGroup = isGroupChat(conv)
              const isSel = selectedConvs.has(conv.guid)
              const isFocused = focusedConvIndex === convIdx
              const isPinned = pinnedConvs.includes(conv.guid)
              const prevConv = convIdx > 0 ? filteredConversations[convIdx - 1] : null
              const isPinnedDivider = !isPinned && prevConv && pinnedConvs.includes(prevConv.guid)
              return (
                <button
                  key={conv.guid}
                  role="listitem"
                  ref={convVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  onClick={() => {
                    if (selectMode) {
                      setSelectedConvs(prev => {
                        const next = new Set(prev)
                        if (next.has(conv.guid)) next.delete(conv.guid)
                        else next.add(conv.guid)
                        return next
                      })
                    } else {
                      onSelectConversation(conv)
                    }
                  }}
                  onContextMenu={e => {
                    e.preventDefault()
                    onContextMenu({ x: e.clientX, y: e.clientY, convGuid: conv.guid, isUnread: !!conv.isUnread, isMuted: mutedConvs.includes(conv.guid), isPinned: pinnedConvs.includes(conv.guid) })
                  }}
                  style={{
                    position: 'absolute', top: 0, left: 0, width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: isPinnedDivider ? '10px 6px 6px 14px' : '6px 6px 6px 14px',
                    justifyContent: 'flex-start',
                    background: isFocused ? 'var(--accent-a10)' : isSel ? 'var(--blue-a08)' : 'transparent',
                    border: 'none', borderRadius: '10px', cursor: 'pointer',
                    textAlign: 'left', transition: 'background 0.15s', marginBottom: '2px',
                    outline: isFocused ? '1px solid var(--accent-a40)' : 'none',
                    outlineOffset: '-1px',
                    borderTop: isPinnedDivider ? '1px solid var(--active-bg)' : 'none',
                  }}
                  onMouseEnter={e => { if (!isSel && !isFocused) e.currentTarget.style.background = 'var(--bg-white-04)' }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isFocused ? 'var(--accent-a10)' : 'transparent' }}
                >
                  {(() => {
                    // Progressive fade: starts immediately from avatar-only (72px)
                    // Name appears 72→160, preview 120→200, timestamp 100→180
                    const textOpacity = panelWidth >= 160 ? 1 : panelWidth <= 72 ? 0 : (panelWidth - 72) / 88
                    const previewOpacity = panelWidth >= 200 ? 1 : panelWidth <= 120 ? 0 : (panelWidth - 120) / 80
                    const timeOpacity = panelWidth >= 180 ? 1 : panelWidth <= 100 ? 0 : (panelWidth - 100) / 80
                    const avatarSize = 44
                    return (
                      <>
                        {selectMode && textOpacity > 0 && (
                          <div style={{
                            width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                            border: isSel ? 'none' : '2px solid var(--text-muted)',
                            background: isSel ? 'var(--apple-blue)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            opacity: textOpacity,
                          }}>
                            {isSel && <Check size={13} color="var(--text-on-color)" />}
                          </div>
                        )}

                        {!selectMode && conv.isUnread && (
                          <div style={{
                            position: 'absolute',
                            top: '2px', right: '2px',
                            width: '8px', height: '8px', borderRadius: '50%', background: 'var(--apple-blue)',
                          }} />
                        )}

                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          {isGroup
                            ? <GroupAvatar conv={conv} size={avatarSize} />
                            : <ContactAvatar
                                address={conv.chatId || conv.participants?.[0]?.address || ''}
                                name={conv.displayName}
                                isImsg={isIMessage(conv)}
                                size={avatarSize}
                              />
                          }
                        </div>
                        {textOpacity > 0 && (
                          <div style={{ flex: 1, minWidth: 0, opacity: textOpacity }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                              <span style={{
                                fontSize: '13px', fontWeight: conv.isUnread ? 700 : 600,
                                color: active ? 'var(--text-on-color)' : 'var(--text-primary)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                display: 'flex', alignItems: 'center', gap: '4px',
                              }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contactLabel(conv)}</span>
                                {pinnedConvs.includes(conv.guid) && <PushPin size={11} style={{ flexShrink: 0, opacity: 0.5 }} />}
                                {mutedConvs.includes(conv.guid) && <BellSlash size={11} style={{ flexShrink: 0, opacity: 0.5 }} />}
                              </span>
                              {timeOpacity > 0 && (
                                <span style={{
                                  fontSize: '10px', color: conv.isUnread ? 'var(--apple-blue)' : 'var(--text-muted)',
                                  fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, opacity: timeOpacity,
                                }}>
                                  {timeAgo(conv.lastDate)}
                                </span>
                              )}
                            </div>
                            {previewOpacity > 0 && (
                              <div style={{
                                fontSize: '12px',
                                color: conv.isUnread ? 'var(--text-primary)' : 'var(--text-secondary)',
                                fontWeight: conv.isUnread ? 500 : 400,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                marginTop: '3px', opacity: previewOpacity,
                              }}>
                                {conv.lastFromMe ? 'You: ' : ''}{cleanPayloadText(conv.lastMessage)}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )
                  })()}
                </button>
              )
            })}
          </div>
        )}
        {loadingMoreConvs && (
          <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
            Loading more...
          </div>
        )}
      </div>

      {selectMode && selectedConvs.size > 0 && panelWidth >= 180 && (
        <div style={{
          padding: '10px 14px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: '8px',
          animation: 'replySlideDown 0.2s var(--ease-spring)',
        }}>
          <button onClick={onBatchMarkRead} style={{
            flex: 1, padding: '8px', fontSize: '12px', fontWeight: 600,
            background: 'var(--blue-a08)', border: '1px solid var(--blue-a25)',
            borderRadius: '8px', color: 'var(--apple-cyan)', cursor: 'pointer',
          }}>
            Mark Read ({selectedConvs.size})
          </button>
          <button onClick={onBatchMarkUnread} style={{
            flex: 1, padding: '8px', fontSize: '12px', fontWeight: 600,
            background: 'var(--accent-a12)', border: '1px solid var(--accent-a15)',
            borderRadius: '8px', color: 'var(--accent-bright)', cursor: 'pointer',
          }}>
            Mark Unread ({selectedConvs.size})
          </button>
          <button onClick={onBatchDelete} style={{
            flex: 1, padding: '8px', fontSize: '12px', fontWeight: 600,
            background: 'var(--red-500-a12)', border: '1px solid var(--red-500-a20)',
            borderRadius: '8px', color: 'var(--red)', cursor: 'pointer',
          }}>
            Delete ({selectedConvs.size})
          </button>
        </div>
      )}
    </div>
  )
}
