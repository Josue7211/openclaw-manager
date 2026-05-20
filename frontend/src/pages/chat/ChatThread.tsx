import { useCallback, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { BracketsCurly, CaretDown, ChatCircle, CheckCircle, ClipboardText, WarningCircle, Wrench } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { type LightboxData } from '@/components/Lightbox'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { formatTime } from '@/lib/utils'
import { addWidgetToPage, getDashboardState, setActivePage } from '@/lib/dashboard-store'
import { saveGeneratedModule } from '@/lib/generated-module-store'
import { createGeneratedCustomModule } from '@/lib/sidebar-config'
import {
  createFallbackProposal,
  extractProposalsFromResponse,
  isInstallableModuleProposal,
  proposalToGeneratedModule,
  type ModuleProposal,
} from '@/lib/module-proposals'
import { extractFencedOpenUiLangFromResponse } from '@/lib/openui'
import { validateModuleProposal } from '@/lib/module-proposal-validator'
import { ModuleProposalPreview } from './ModuleProposalPreview'
import { ModulePreview } from './ModulePreview'
import type { ChatMessage, OptimisticMsg } from './types'

const MarkdownBubble = lazy(() => import('@/components/MarkdownBubble'))

type ToolCardStatus = 'running' | 'done' | 'error'

interface ToolCard {
  id: string
  name: string
  status: ToolCardStatus
  summary?: string
  detail?: string
}

const TOOL_FENCE_RE = /```(tool_call|tool-call|tool_result|tool-result|tool_error|tool-error|tool)\s*\n([\s\S]*?)```/gi
const TOOL_XML_RE = /<tool_(call|result|error)(?:\s+name=["']?([^"'>\s]+)["']?)?[^>]*>([\s\S]*?)<\/tool_\1>/gi
const CLAUDE_TOOL_LINE_RE = /^(?:[⏺●])\s*([A-Za-z][\w.-]*)\s*(?:\((.*)\))?\s*$/gm
const CLAUDE_RESULT_LINE_RE = /^(?:[⎿↳])\s*(.+)$/gm

function compactToolDetail(value: unknown): string {
  if (value == null) return ''
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return text.replace(/\s+/g, ' ').trim().slice(0, 220)
}

function parseToolPayload(raw: string): { name?: string; summary?: string; detail?: string } {
  const text = raw.trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    const name = parsed.name || parsed.tool || parsed.toolName || parsed.function?.name
    const args = parsed.arguments || parsed.args || parsed.input || parsed.parameters || parsed.function?.arguments
    const result = parsed.result || parsed.output || parsed.error || parsed.content
    return {
      name: typeof name === 'string' ? name : undefined,
      summary: compactToolDetail(result || args),
      detail: compactToolDetail(args || result || parsed),
    }
  } catch {
    const [firstLine, ...rest] = text.split('\n')
    const inline = firstLine.match(/^([A-Za-z][\w.-]*)\s*[:(]?\s*(.*?)\)?$/)
    return {
      name: inline?.[1],
      summary: inline?.[2] || rest.join(' ').trim() || firstLine,
      detail: rest.join('\n').trim() || text,
    }
  }
}

export function extractToolCards(text: string): ToolCard[] {
  const cards: ToolCard[] = []
  let match: RegExpExecArray | null

  TOOL_FENCE_RE.lastIndex = 0
  while ((match = TOOL_FENCE_RE.exec(text))) {
    const kind = match[1].toLowerCase()
    const payload = parseToolPayload(match[2])
    cards.push({
      id: `fence-${match.index}`,
      name: payload.name || 'tool',
      status: kind.includes('error') ? 'error' : kind.includes('result') ? 'done' : 'running',
      summary: payload.summary,
      detail: payload.detail,
    })
  }

  TOOL_XML_RE.lastIndex = 0
  while ((match = TOOL_XML_RE.exec(text))) {
    const kind = match[1].toLowerCase()
    const payload = parseToolPayload(match[3])
    cards.push({
      id: `xml-${match.index}`,
      name: match[2] || payload.name || 'tool',
      status: kind === 'error' ? 'error' : kind === 'result' ? 'done' : 'running',
      summary: payload.summary,
      detail: payload.detail,
    })
  }

  CLAUDE_TOOL_LINE_RE.lastIndex = 0
  while ((match = CLAUDE_TOOL_LINE_RE.exec(text))) {
    cards.push({
      id: `line-${match.index}`,
      name: match[1],
      status: 'running',
      summary: match[2]?.trim(),
      detail: match[2]?.trim(),
    })
  }

  CLAUDE_RESULT_LINE_RE.lastIndex = 0
  while ((match = CLAUDE_RESULT_LINE_RE.exec(text))) {
    cards.push({
      id: `result-${match.index}`,
      name: 'result',
      status: /error|failed|denied/i.test(match[1]) ? 'error' : 'done',
      summary: match[1].trim(),
    })
  }

  const seen = new Set<string>()
  return cards.filter((card) => {
    const key = `${card.name}:${card.status}:${card.summary || ''}:${card.detail || ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 6)
}

function ChatProposalActions({ text }: { text: string }) {
  const proposals = useMemo<ModuleProposal[]>(() => {
    const structured = extractProposalsFromResponse(text)
      .map(extracted => validateModuleProposal(extracted))
      .filter(validation => validation.ok && validation.normalized)
      .map(validation => validation.normalized!)

    if (structured.length > 0) return structured

    const openUiLang = extractFencedOpenUiLangFromResponse(text)
    if (!openUiLang) return []

    return [
      {
        ...createFallbackProposal(text),
        title: 'OpenUI Module',
        description: 'OpenUI Lang module generated from assistant output.',
        openUiLang,
        fallbackMessage: undefined,
      },
    ]
  }, [text])

  if (proposals.length === 0) return null

  return (
    <div style={{ marginTop: 10, width: 'min(680px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {proposals.map((proposal, index) => (
        <ChatSingleProposalAction key={`${proposal.id}-${index}`} proposal={proposal} />
      ))}
    </div>
  )
}

function ChatToolCards({ text }: { text: string }) {
  const cards = useMemo(() => extractToolCards(text), [text])
  if (cards.length === 0) return null

  return (
    <div aria-label="Tool activity" style={{ marginTop: 8, width: 'min(680px, 100%)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {cards.map((card) => (
        <div
          key={card.id}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: card.status === 'error'
              ? 'var(--red-a8, rgba(239, 68, 68, 0.12))'
              : 'var(--bg-card)',
            padding: '8px 10px',
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0, 1fr)',
            gap: 8,
            color: 'var(--text-secondary)',
            fontSize: 12,
          }}
        >
          <ToolStatusIcon status={card.status} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {card.name}
              </span>
              <span style={{
                border: '1px solid var(--border)',
                borderRadius: 999,
                padding: '1px 7px',
                color: card.status === 'error'
                  ? 'var(--red)'
                  : card.status === 'done'
                    ? 'var(--secondary)'
                    : 'var(--accent)',
                whiteSpace: 'nowrap',
              }}>
                {card.status === 'running' ? 'running' : card.status}
              </span>
            </div>
            {card.summary && (
              <div style={{ marginTop: 4, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {card.summary}
              </div>
            )}
            {card.detail && card.detail !== card.summary && (
              <pre style={{
                margin: '6px 0 0',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 11,
              }}>
                {card.detail}
              </pre>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function ChatToolEvent({ message }: { message: ChatMessage }) {
  const label = message.toolName || 'tool'
  const detail = message.text.trim() || 'Tool completed without output.'

  return (
    <div
      role="note"
      aria-label={`Tool event ${label}`}
      style={{
        alignSelf: 'flex-start',
        width: 'min(680px, 100%)',
        marginLeft: 34,
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--bg-card)',
        color: 'var(--text-secondary)',
        padding: '8px 10px',
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        gap: 8,
        fontSize: 12,
      }}
    >
      <Wrench size={15} color="var(--accent)" />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ color: 'var(--text-primary)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label}
          </span>
          <span style={{
            border: '1px solid var(--border)',
            borderRadius: 999,
            padding: '1px 7px',
            color: 'var(--secondary)',
            whiteSpace: 'nowrap',
          }}>
            event
          </span>
          {message.toolCallId && (
            <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {message.toolCallId}
            </span>
          )}
        </div>
        <pre style={{
          margin: '6px 0 0',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 11,
        }}>
          {detail}
        </pre>
      </div>
    </div>
  )
}

function ToolStatusIcon({ status }: { status: ToolCardStatus }) {
  const color = status === 'error'
    ? 'var(--red)'
    : status === 'done'
      ? 'var(--secondary)'
      : 'var(--accent)'
  const Icon = status === 'error' ? WarningCircle : status === 'done' ? CheckCircle : Wrench
  return <Icon size={16} color={color} weight={status === 'running' ? 'regular' : 'fill'} />
}

function ChatStreamingStatusCard() {
  return (
    <div
      role="status"
      aria-label="Assistant status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: 'fit-content',
        maxWidth: 'min(520px, 100%)',
        padding: '9px 12px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '14px 14px 14px 4px',
        color: 'var(--text-secondary)',
        fontSize: 12,
        marginBottom: 8,
      }}
    >
      <BracketsCurly size={15} color="var(--accent)" />
      <span>Assistant is working</span>
      <span aria-hidden="true" style={{ display: 'inline-flex', gap: 3 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'var(--text-muted)',
            animation: `typingBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </span>
    </div>
  )
}

function ChatMessageCopyButton({
  copied,
  errored,
  onCopy,
}: {
  copied: boolean
  errored: boolean
  onCopy: () => void
}) {
  const label = copied ? 'Copied assistant message' : errored ? 'Retry copy assistant message' : 'Copy assistant message'
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onCopy}
      className="hover-bg"
      style={{
        width: 24,
        height: 24,
        border: 'none',
        borderRadius: 7,
        background: copied ? 'color-mix(in srgb, var(--accent) 16%, var(--bg-card))' : 'var(--bg-card)',
        color: errored ? 'var(--red-500)' : copied ? 'var(--accent)' : 'var(--text-muted)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      <ClipboardText size={13} />
    </button>
  )
}

function ChatSingleProposalAction({ proposal }: { proposal: ModuleProposal }) {
  const [status, setStatus] = useState<'idle' | 'installing' | 'installed' | 'error'>('idle')
  const [error, setError] = useState('')
  const generated = useMemo(
    () => proposalToGeneratedModule(proposal),
    [proposal],
  )

  const installsAsPage = proposal.targetType === 'page' || proposal.targetType === 'module' || proposal.targetType === 'panel' || proposal.installTarget === 'app-shell' || proposal.installTarget === 'category' || proposal.installTarget === 'module-studio'
  const installLabel = installsAsPage ? 'Install as page' : 'Install to dashboard'

  const install = useCallback(async () => {
    if (!installsAsPage && !isInstallableModuleProposal(proposal)) {
      setStatus('error')
      setError('This proposal is preview-only because it asks for backend work or a non-dashboard target.')
      return
    }

    setStatus('installing')
    setError('')
    try {
      const saved = await saveGeneratedModule({
        name: generated.name,
        description: generated.description,
        icon: 'Cube',
        source: generated.source,
        configSchema: generated.configSchema,
        defaultSize: generated.defaultSize,
      })
      if (installsAsPage) {
        createGeneratedCustomModule(saved.name, saved.id, 'personal')
        setStatus('installed')
        return
      }
      const dashboard = getDashboardState()
      const pageId = dashboard.activePageId || dashboard.pages[0]?.id
      if (!pageId) throw new Error('No dashboard page exists.')
      const pluginId = `generated-${saved.id}`
      addWidgetToPage(pageId, pluginId, {
        i: `${pluginId}-${crypto.randomUUID().slice(0, 8)}`,
        x: 0,
        y: Infinity,
        w: saved.defaultSize.w,
        h: saved.defaultSize.h,
      })
      setActivePage(pageId)
      setStatus('installed')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Install failed.')
    }
  }, [generated, installsAsPage, proposal])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ModuleProposalPreview proposal={proposal} />
      <ModulePreview source={generated.source} proposal={proposal} generationState="previewing" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={install}
          disabled={status === 'installing' || status === 'installed'}
          style={{
            border: '1px solid var(--border)',
            background: status === 'installed' ? 'var(--secondary)' : 'var(--accent)',
            color: 'var(--text-on-color)',
            borderRadius: 8,
            padding: '7px 12px',
            fontSize: 12,
            cursor: status === 'idle' || status === 'error' ? 'pointer' : 'default',
          }}
        >
          {status === 'installing'
            ? 'Installing...'
            : status === 'installed'
              ? installsAsPage ? 'Installed as page' : 'Installed to dashboard'
              : installLabel}
        </button>
        {error && <span style={{ color: 'var(--red)', fontSize: 12 }}>{error}</span>}
      </div>
    </div>
  )
}

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
  setAtBottomRefOnly: (v: boolean) => void
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
  setAtBottomRefOnly,
  scrollRef,
  bottomRef,
  optimisticImageCacheRef,
  onDrop,
  retry,
  lightbox: _lightbox,
  setLightbox,
}: ChatThreadProps) {
  void _lightbox // used by parent for Lightbox component
  const buttonShellRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [copyAnnouncement, setCopyAnnouncement] = useState('')
  const {
    copyToClipboard,
    copiedContext,
    errorContext,
  } = useCopyToClipboard<{ id: string; label: string }>({
    onCopy: (context) => setCopyAnnouncement(`Copied ${context.label}`),
    onError: (error, context) => setCopyAnnouncement(`Could not copy ${context.label}: ${error.message}`),
  })
  const visibleMessages = useMemo(() => messages.filter(msg => (
    (msg.role as string) !== 'system'
    && !msg.text.includes('ACTIVATION RULE')
    && !msg.text.startsWith('HEARTBEAT')
    && !msg.text.includes('000Server not running')
    && !msg.text.includes('Read HEARTBEAT.md')
    && !msg.text.includes('HEARTBEAT_OK')
  )), [messages])
  const finalAssistantMessageId = useMemo(() => {
    if (isTyping) return null
    return [...visibleMessages].reverse().find(msg => msg.role === 'assistant' && msg.text.trim())?.id ?? null
  }, [isTyping, visibleMessages])
  const copiedMessageId = copiedContext?.id ?? ''
  const copyErrorMessageId = errorContext?.id ?? ''

  const setButtonVisible = useCallback((visible: boolean) => {
    if (buttonShellRef.current) {
      buttonShellRef.current.style.opacity = visible ? '1' : '0'
      buttonShellRef.current.style.visibility = visible ? 'visible' : 'hidden'
      buttonShellRef.current.style.transform = visible ? 'translateY(0)' : 'translateY(6px)'
    }
    if (buttonRef.current) {
      buttonRef.current.style.pointerEvents = visible ? 'auto' : 'none'
    }
  }, [])

  const updateBottomStateWithoutRender = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setAtBottomRefOnly(isAtBottom)
    setButtonVisible(!isAtBottom)
  }, [scrollRef, setAtBottomRefOnly, setButtonVisible])

  const onScroll = useCallback(() => {
    updateBottomStateWithoutRender()
  }, [updateBottomStateWithoutRender])

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    setButtonVisible(false)
    setAtBottom(true)
  }, [bottomRef, scrollRef, setAtBottom, setButtonVisible])

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', overflowAnchor: 'none', scrollBehavior: 'auto', marginBottom: '12px' }}
      >
        <div role="status" aria-live="polite" style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}>
          {copyAnnouncement}
        </div>
        <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
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

        {visibleMessages.map(msg => (
          msg.role === 'tool' ? (
            <ChatToolEvent key={msg.id} message={msg} />
          ) : (
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
                <>
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
                  {msg.role === 'assistant' && <ChatToolCards text={msg.text} />}
                  {msg.role === 'assistant' && <ChatProposalActions text={msg.text} />}
                </>
              )}
              {/* Timestamp and message actions */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                fontSize: '10px',
                color: 'var(--text-muted)',
                fontFamily: 'monospace',
                padding: '0 2px',
              }}>
                <span>{formatTime(msg.timestamp)}</span>
                {msg.role === 'assistant' && msg.id === finalAssistantMessageId && (
                  <ChatMessageCopyButton
                    copied={copiedMessageId === `assistant:${msg.id}`}
                    errored={copyErrorMessageId === `assistant:${msg.id}`}
                    onCopy={() => copyToClipboard(msg.text, { id: `assistant:${msg.id}`, label: 'assistant message' })}
                  />
                )}
              </div>
            </div>
          </div>
          )
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
            <ChatStreamingStatusCard />
          </div>
        )}
        <div ref={bottomRef} />
        </div>
      </div>

      {/* Scroll to bottom button */}
      <div ref={buttonShellRef} style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: '8px',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 3,
        opacity: atBottom ? 0 : 1,
        visibility: atBottom ? 'hidden' : 'visible',
        transform: atBottom ? 'translateY(6px)' : 'translateY(0)',
        transition: 'opacity 0.16s ease, transform 0.16s ease, visibility 0.16s ease',
      }}>
          <button ref={buttonRef} onClick={scrollToBottom} style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            background: 'var(--hover-bg)', border: '1px solid var(--border)',
            borderRadius: '20px', padding: '5px 14px',
            color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer',
            boxShadow: '0 2px 8px var(--overlay-light)', transition: 'all 0.25s var(--ease-spring)',
            pointerEvents: atBottom ? 'none' : 'auto',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
          >
            <CaretDown size={13} /> scroll to bottom
          </button>
        </div>
    </div>
  )
}
