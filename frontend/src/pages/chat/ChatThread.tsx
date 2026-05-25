import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense, type ReactNode } from 'react'
import { BracketsCurly, CaretDown, ChatCircle, CheckCircle, ClipboardText, FileText, Sparkle, UserCircle, WarningCircle, Wrench } from '@phosphor-icons/react'
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
import type { ChatContextFileAttachment, ChatMessage, OptimisticMsg } from './types'
import { withOptimisticAttachmentFallbacks } from './optimisticAttachmentCache'
import { hermesChatErrorMessage } from './hermesErrors'

const MarkdownBubble = lazy(() => import('@/components/MarkdownBubble'))

type ToolCardStatus = 'running' | 'done' | 'error'

interface ToolCard {
  id: string
  name: string
  status: ToolCardStatus
  summary?: string
  detail?: string
}

export interface ChatTranscriptContext {
  projectName?: string | null
  projectPath?: string | null
  environmentId?: string | null
  runtime?: string | null
  branch?: string | null
}

const TOOL_FENCE_RE = /```(tool_call|tool-call|tool_result|tool-result|tool_error|tool-error|tool)\s*\n([\s\S]*?)```/gi
const TOOL_XML_RE = /<tool_(call|result|error)(?:\s+name=["']?([^"'>\s]+)["']?)?[^>]*>([\s\S]*?)<\/tool_\1>/gi
const CLAUDE_TOOL_LINE_RE = /^(?:[⏺●])\s*([A-Za-z][\w.-]*)\s*(?:\((.*)\))?\s*$/gm
const CLAUDE_RESULT_LINE_RE = /^(?:[⎿↳])\s*(.+)$/gm

function stripGlobalPattern(text: string, pattern: RegExp): string {
  pattern.lastIndex = 0
  return text.replace(pattern, '')
}

export function assistantDisplayText(text: string): string {
  return stripGlobalPattern(
    stripGlobalPattern(
      stripGlobalPattern(
        stripGlobalPattern(text, TOOL_FENCE_RE),
        TOOL_XML_RE,
      ),
      CLAUDE_TOOL_LINE_RE,
    ),
    CLAUDE_RESULT_LINE_RE,
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function compactToolDetail(value: unknown): string {
  if (value == null) return ''
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return text.replace(/\s+/g, ' ').trim().slice(0, 220)
}

function copyTextWithContextFiles(text: string, files?: ChatContextFileAttachment[], imageCount = 0): string {
  const trimmedText = text.trim()
  const contextLines = transcriptAttachmentLines(files, imageCount)
  if (contextLines.length === 0) return text
  const contextText = contextLines.join('\n')
  return trimmedText ? `${trimmedText}\n\n${contextText}` : contextText
}

function contextFileDisplayLabel(file: ChatContextFileAttachment): string {
  const path = file.path?.trim()
  const label = path && path !== file.name ? path : file.name
  return `${label}${file.truncated ? ' (trimmed)' : ''}`
}

function contextFileClipboardText(file: ChatContextFileAttachment): string {
  const label = contextFileDisplayLabel(file)
  const content = file.content?.trim()
  if (!content) return label || file.path || file.name
  return `File: ${label}\n\n${content}`
}

function markdownFenceForContent(content: string): string {
  const longestBacktickRun = content.match(/`+/g)?.reduce((longest, run) => Math.max(longest, run.length), 0) ?? 0
  return '`'.repeat(Math.max(3, longestBacktickRun + 1))
}

function markdownLanguageForContextFile(label: string): string {
  const fileName = label
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.trim()
    .toLowerCase() ?? ''
  if (!fileName) return ''
  if (fileName === 'dockerfile') return 'dockerfile'
  if (fileName === 'makefile') return 'makefile'
  if (fileName === 'cargo.lock') return 'toml'
  const extension = fileName.includes('.') ? fileName.split('.').pop() ?? '' : ''
  const language = ({
    cjs: 'javascript',
    cljs: 'clojure',
    cs: 'csharp',
    css: 'css',
    csv: 'csv',
    cts: 'typescript',
    go: 'go',
    h: 'c',
    html: 'html',
    java: 'java',
    js: 'javascript',
    json: 'json',
    jsx: 'jsx',
    kt: 'kotlin',
    lock: 'text',
    log: 'text',
    lua: 'lua',
    md: 'markdown',
    mdx: 'mdx',
    mjs: 'javascript',
    mts: 'typescript',
    php: 'php',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    scss: 'scss',
    sh: 'bash',
    sql: 'sql',
    svelte: 'svelte',
    toml: 'toml',
    ts: 'typescript',
    tsx: 'tsx',
    txt: 'text',
    vue: 'vue',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    zsh: 'bash',
  } as Record<string, string>)[extension] ?? ''
  return /^[A-Za-z0-9_+#.-]+$/.test(language) ? language : ''
}

function isVisibleTranscriptMessage(msg: ChatMessage): boolean {
  return (
    (msg.role as string) !== 'system'
    && !msg.text.includes('ACTIVATION RULE')
    && !msg.text.startsWith('HEARTBEAT')
    && !msg.text.includes('000Server not running')
    && !msg.text.includes('Read HEARTBEAT.md')
    && !msg.text.includes('HEARTBEAT_OK')
  )
}

function transcriptMessageLabel(message: ChatMessage): string {
  if (message.role === 'tool') {
    return message.toolName ? `Tool: ${message.toolName}` : 'Tool'
  }
  return message.role === 'assistant' ? 'Assistant' : 'User'
}

function transcriptToolCardBody(card: ToolCard): string {
  const lines = [
    card.summary?.trim(),
    card.detail && card.detail !== card.summary ? card.detail.trim() : '',
  ].filter(Boolean)
  return lines.length > 0 ? lines.join('\n\n') : card.status
}

function contextFileContentLines(files: ChatContextFileAttachment[]): string[] {
  const filesWithContent = files
    .map((file) => ({
      label: (file.path || file.name).trim(),
      content: file.content?.trim() ?? '',
      truncated: Boolean(file.truncated),
    }))
    .filter((file) => file.label && file.content)
  if (filesWithContent.length === 0) return []

  const lines = ['', 'Attached context file contents:']
  for (const file of filesWithContent) {
    const fence = markdownFenceForContent(file.content)
    const language = markdownLanguageForContextFile(file.label)
    lines.push(
      '',
      `File: ${file.label}${file.truncated ? ' (trimmed)' : ''}`,
      `${fence}${language}`,
      file.content,
      fence,
    )
  }
  return lines
}

function transcriptAttachmentLines(files?: ChatContextFileAttachment[], imageCount = 0): string[] {
  const lines: string[] = []
  if (files?.length) {
    lines.push('Attached context files:')
    for (const file of files) {
      const label = (file.path || file.name).trim()
      if (label) lines.push(`- ${label}${file.truncated ? ' (trimmed)' : ''}`)
    }
    lines.push(...contextFileContentLines(files))
  }
  if (imageCount > 0) {
    if (lines.length > 0) lines.push('')
    lines.push(`Attached images: ${imageCount}`)
  }
  return lines
}

function transcriptBlock(label: string, text: string, options: {
  timestamp?: string
  status?: string
  files?: ChatContextFileAttachment[]
  imageCount?: number
} = {}): string {
  const metadata = [
    options.timestamp?.trim(),
    options.status ? `status: ${options.status}` : '',
  ].filter(Boolean).join(' | ')
  const lines = [`### ${label}${metadata ? ` (${metadata})` : ''}`, '']
  const body = text.trim()
  if (body) lines.push(body)
  const attachmentLines = transcriptAttachmentLines(options.files, options.imageCount)
  if (attachmentLines.length > 0) {
    if (body) lines.push('')
    lines.push(...attachmentLines)
  }
  return lines.join('\n').trim()
}

export function buildChatTranscript({
  messages,
  optimistic,
  systemMsg,
  context,
}: {
  messages: ChatMessage[]
  optimistic: OptimisticMsg[]
  systemMsg?: string | null
  context?: ChatTranscriptContext | null
}): string {
  const blocks: string[] = []
  const contextLines = [
    context?.projectName?.trim() ? `Project: ${context.projectName.trim()}` : '',
    context?.projectPath?.trim() ? `Path: ${context.projectPath.trim()}` : '',
    context?.environmentId?.trim() ? `Environment: ${context.environmentId.trim()}` : '',
    context?.runtime?.trim() ? `Runtime: ${context.runtime.trim()}` : '',
    context?.branch?.trim() ? `Branch: ${context.branch.trim()}` : '',
  ].filter(Boolean)
  if (contextLines.length > 0) {
    blocks.push(transcriptBlock('Context', contextLines.join('\n')))
  }

  const systemText = systemMsg?.trim()
  if (systemText) {
    blocks.push(transcriptBlock('System', systemText))
  }

  for (const message of messages.filter(isVisibleTranscriptMessage)) {
    if (message.role === 'assistant') {
      const displayText = assistantDisplayText(message.text)
      if (displayText) {
        blocks.push(transcriptBlock('Assistant', displayText, {
          timestamp: message.timestamp,
          files: message.contextFiles,
          imageCount: message.images?.length ?? 0,
        }))
      }
      for (const card of extractToolCards(message.text)) {
        blocks.push(transcriptBlock(`Tool: ${card.name}`, transcriptToolCardBody(card), {
          timestamp: message.timestamp,
          status: card.status,
        }))
      }
      continue
    }
    blocks.push(transcriptBlock(transcriptMessageLabel(message), message.text, {
      timestamp: message.timestamp,
      files: message.contextFiles,
      imageCount: message.images?.length ?? 0,
    }))
  }

  for (const message of optimistic) {
    blocks.push(transcriptBlock('User', message.text, {
      status: message.status,
      files: message.contextFiles,
      imageCount: message.images?.length ?? 0,
    }))
  }

  return blocks.filter(Boolean).join('\n\n---\n\n')
}

function optimisticMessageAsUserMessage(message: OptimisticMsg): ChatMessage {
  return {
    id: message.id,
    role: 'user',
    text: message.text,
    timestamp: new Date().toISOString(),
    images: message.images,
    contextFiles: message.contextFiles,
    localOnly: true,
  }
}

function actionPreviewLabel(text: string, fallback = 'message'): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return fallback
  return normalized.length > 56 ? `${normalized.slice(0, 53)}...` : normalized
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
        title: 'Hermes UI Module',
        description: 'Hermes Agent UI module generated from assistant output.',
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

function ChatToolCards({
  text,
  copyIdPrefix,
  copiedId = '',
  erroredId = '',
  onCopyToolCard,
}: {
  text: string
  copyIdPrefix?: string
  copiedId?: string
  erroredId?: string
  onCopyToolCard?: (card: ToolCard, copyId: string) => void
}) {
  const cards = useMemo(() => extractToolCards(text), [text])
  const [expandedCards, setExpandedCards] = useState<Set<string>>(() => new Set())
  if (cards.length === 0) return null

  const toggleToolDetails = (id: string) => {
    setExpandedCards((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div aria-label="Tool activity" style={{ marginTop: 8, width: 'min(680px, 100%)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {cards.map((card) => {
        const copyId = `${copyIdPrefix || 'tool-card'}:${card.id}`
        const hasDetail = Boolean(card.detail && card.detail !== card.summary)
        const expanded = expandedCards.has(card.id)
        return (
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
              {onCopyToolCard && (
                <ChatMessageCopyButton
                  label={`tool result ${card.name}`}
                  copied={copiedId === copyId}
                  errored={erroredId === copyId}
                  onCopy={() => onCopyToolCard(card, copyId)}
                />
              )}
              {hasDetail && (
                <button
                  type="button"
                  onClick={() => toggleToolDetails(card.id)}
                  aria-expanded={expanded}
                  aria-label={`${expanded ? 'Hide' : 'Show'} details for tool result ${card.name}`}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 999,
                    background: expanded ? 'var(--hover-bg)' : 'transparent',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    font: 'inherit',
                    fontSize: 11,
                    minHeight: 20,
                    padding: '0 7px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {expanded ? 'Hide details' : 'Details'}
                </button>
              )}
            </div>
            {card.summary && (
              <div style={{ marginTop: 4, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {card.summary}
              </div>
            )}
            {hasDetail && expanded && (
              <div role="region" aria-label={`Tool result details ${card.name}`}>
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
              </div>
            )}
          </div>
        </div>
        )
      })}
    </div>
  )
}

function ChatContextFileChips({
  files,
  align = 'flex-start',
  copyIdPrefix,
  copiedId = '',
  erroredId = '',
  onCopyFile,
}: {
  files?: ChatContextFileAttachment[]
  align?: 'flex-start' | 'flex-end'
  copyIdPrefix?: string
  copiedId?: string
  erroredId?: string
  onCopyFile?: (file: ChatContextFileAttachment, index: number, copyId: string) => void
}) {
  const [previewFileId, setPreviewFileId] = useState<string | null>(null)
  const previewEntry = (files ?? [])
    .map((file, index) => ({ file, index, key: file.id || `${file.name}-${index}` }))
    .find((entry) => entry.key === previewFileId) ?? null
  const previewFile = previewEntry?.file ?? null
  const previewCopyId = previewEntry
    ? `${copyIdPrefix || 'attached-file'}:${previewEntry.file.id || previewEntry.index}`
    : ''

  useEffect(() => {
    if (!previewFileId) return
    const closePreviewOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewFileId(null)
    }
    window.addEventListener('keydown', closePreviewOnEscape)
    return () => window.removeEventListener('keydown', closePreviewOnEscape)
  }, [previewFileId])

  if (!files?.length) return null

  return (
    <div style={{ display: 'grid', gap: 6, justifyItems: align === 'flex-end' ? 'end' : 'start', maxWidth: '100%' }}>
      <div
        aria-label="Attached context files"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          justifyContent: align,
          maxWidth: '100%',
        }}
      >
        {files.map((file, index) => {
          const key = file.id || `${file.name}-${index}`
          const copyId = `${copyIdPrefix || 'attached-file'}:${file.id || index}`
          const previewOpen = previewFileId === key
          return (
          <span
            key={key}
            title={file.path || file.name}
            style={{
              maxWidth: 260,
              minHeight: 28,
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: previewOpen ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-card))' : 'var(--bg-card)',
              color: 'var(--text-muted)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 5px 0 8px',
              fontSize: 11,
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            <FileText size={13} />
            <button
              type="button"
              aria-label={`${previewOpen ? 'Hide' : 'Preview'} attached file ${file.name}`}
              onClick={() => setPreviewFileId(previewOpen ? null : key)}
              style={{
                minWidth: 0,
                border: 0,
                background: 'transparent',
                color: 'inherit',
                padding: 0,
                font: 'inherit',
                cursor: 'pointer',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {contextFileDisplayLabel(file)}
            </button>
            {onCopyFile && (
              <ChatMessageCopyButton
                label={`attached file ${file.name}`}
                copied={copiedId === copyId}
                errored={erroredId === copyId}
                onCopy={() => onCopyFile(file, index, copyId)}
              />
            )}
          </span>
          )
        })}
      </div>
      {previewFile && (
        <div
          role="region"
          aria-label={`Attached file preview ${previewFile.name}`}
          style={{
            width: 'min(520px, 100%)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--bg-card)',
            color: 'var(--text-secondary)',
            padding: 10,
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 7,
          }}>
            <span style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--text-primary)',
              fontSize: 11,
              fontFamily: 'var(--font-mono, monospace)',
              fontWeight: 700,
            }}>
              {contextFileDisplayLabel(previewFile)}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {onCopyFile && previewEntry ? (
                <button
                  type="button"
                  onClick={() => onCopyFile(previewEntry.file, previewEntry.index, previewCopyId)}
                  aria-label={`${copiedId === previewCopyId ? 'Copied' : erroredId === previewCopyId ? 'Retry copy' : 'Copy'} preview file ${previewFile.name}`}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    background: copiedId === previewCopyId
                      ? 'color-mix(in srgb, var(--accent) 16%, transparent)'
                      : 'transparent',
                    color: erroredId === previewCopyId
                      ? 'var(--red)'
                      : copiedId === previewCopyId
                        ? 'var(--accent)'
                        : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 11,
                    padding: '2px 7px',
                  }}
                >
                  {copiedId === previewCopyId ? 'Copied' : erroredId === previewCopyId ? 'Retry copy' : 'Copy'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setPreviewFileId(null)}
                aria-label={`Close attached file preview ${previewFile.name}`}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  fontSize: 11,
                  padding: '2px 7px',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </span>
          </div>
          <pre style={{
            maxHeight: 220,
            overflow: 'auto',
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 11,
            lineHeight: 1.45,
          }}>
            {previewFile.content || 'No preview content.'}
          </pre>
        </div>
      )}
    </div>
  )
}

function ChatToolEvent({
  message,
  copied,
  errored,
  onCopy,
}: {
  message: ChatMessage
  copied: boolean
  errored: boolean
  onCopy: () => void
}) {
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
          <ChatMessageCopyButton
            label="tool event"
            copied={copied}
            errored={errored}
            onCopy={onCopy}
          />
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

function ChatMessageAvatar({ role }: { role: 'assistant' | 'user' }) {
  const assistant = role === 'assistant'
  const Icon = assistant ? Sparkle : UserCircle

  return (
    <div
      aria-hidden="true"
      style={{
        flexShrink: 0,
        width: '26px',
        height: '26px',
        borderRadius: '50%',
        background: assistant ? 'var(--purple-a12)' : 'var(--tertiary)',
        border: `1px solid ${assistant ? 'var(--border-accent)' : 'var(--tertiary)'}`,
        color: assistant ? 'var(--accent-bright)' : 'var(--text-on-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={15} weight={assistant ? 'fill' : 'regular'} />
    </div>
  )
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
  label,
  copied,
  errored,
  onCopy,
}: {
  label: string
  copied: boolean
  errored: boolean
  onCopy: () => void
}) {
  const actionLabel = copied ? `Copied ${label}` : errored ? `Retry copy ${label}` : `Copy ${label}`
  return (
    <button
      type="button"
      aria-label={actionLabel}
      title={actionLabel}
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

function ChatMessageTextAction({
  label,
  ariaLabel,
  onClick,
}: {
  label: string
  ariaLabel?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel || label}
      onClick={onClick}
      className="hover-bg"
      style={{
        minHeight: 24,
        border: '1px solid var(--border)',
        borderRadius: 7,
        background: 'var(--bg-card)',
        color: 'var(--text-muted)',
        padding: '0 8px',
        font: 'inherit',
        fontSize: 10,
        cursor: 'pointer',
      }}
    >
      {label}
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
  optimisticContextFileCacheRef: React.RefObject<Map<string, ChatContextFileAttachment[]>>
  onDrop: (e: React.DragEvent) => void
  retry: (msg: OptimisticMsg) => void
  onUseMessageAsPrompt?: (msg: ChatMessage) => void
  onForkMessage?: (msg: ChatMessage) => void
  onRegenerateAssistant?: (assistantMessage: ChatMessage, previousUserMessage: ChatMessage | null) => void
  onContinueAssistant?: (assistantMessage: ChatMessage) => void
  transcriptContext?: ChatTranscriptContext | null
  emptyStateSlot?: ReactNode
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
  optimisticContextFileCacheRef,
  onDrop,
  retry,
  onUseMessageAsPrompt,
  onForkMessage,
  onRegenerateAssistant,
  onContinueAssistant,
  transcriptContext,
  emptyStateSlot,
  lightbox: _lightbox,
  setLightbox,
}: ChatThreadProps) {
  void _lightbox // used by parent for Lightbox component
  const buttonShellRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [copyAnnouncement, setCopyAnnouncement] = useState<{
    message: string
    tone: 'success' | 'error'
  } | null>(null)
  const {
    copyToClipboard,
    copiedContext,
    errorContext,
  } = useCopyToClipboard<{ id: string; label: string }>({
    onCopy: (context) => setCopyAnnouncement({
      message: `Copied ${context.label}.`,
      tone: 'success',
    }),
    onError: (error, context) => setCopyAnnouncement({
      message: `Could not copy ${context.label}: ${error.message}`,
      tone: 'error',
    }),
  })
  const visibleMessages = useMemo(() => messages.filter(isVisibleTranscriptMessage), [messages])
  const visibleMessagesWithAttachments = useMemo(() => withOptimisticAttachmentFallbacks(
    visibleMessages,
    optimisticImageCacheRef.current,
    optimisticContextFileCacheRef.current,
  ), [optimisticContextFileCacheRef, optimisticImageCacheRef, visibleMessages])
  const threadTranscript = useMemo(() => buildChatTranscript({
    messages: withOptimisticAttachmentFallbacks(
      messages,
      optimisticImageCacheRef.current,
      optimisticContextFileCacheRef.current,
    ),
    optimistic,
    systemMsg,
    context: transcriptContext,
  }), [messages, optimistic, optimisticContextFileCacheRef, optimisticImageCacheRef, systemMsg, transcriptContext])
  const latestAssistantMessageId = useMemo(() => {
    return [...visibleMessages].reverse().find(msg => msg.role === 'assistant' && msg.text.trim())?.id ?? null
  }, [visibleMessages])
  const copiedMessageId = copiedContext?.id ?? ''
  const copyErrorMessageId = errorContext?.id ?? ''
  const hasThreadContent = visibleMessages.length > 0 || optimistic.length > 0 || Boolean(systemMsg)

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
          {copyAnnouncement?.message ?? ''}
        </div>
        <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
          {(threadTranscript || copyAnnouncement) && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '0 2px 2px', minHeight: 26 }}>
              {copyAnnouncement ? (
                <span
                  role="status"
                  aria-label="Copy status"
                  style={{
                    maxWidth: 'min(520px, 78vw)',
                    minHeight: 24,
                    border: `1px solid ${copyAnnouncement.tone === 'error'
                      ? 'color-mix(in srgb, var(--red-500, #ef4444) 28%, var(--border))'
                      : 'color-mix(in srgb, var(--accent) 28%, var(--border))'}`,
                    borderRadius: 999,
                    background: copyAnnouncement.tone === 'error'
                      ? 'color-mix(in srgb, var(--red-500, #ef4444) 12%, var(--bg-card))'
                      : 'color-mix(in srgb, var(--accent) 12%, var(--bg-card))',
                    color: copyAnnouncement.tone === 'error'
                      ? 'var(--red-500, #ef4444)'
                      : 'var(--text-secondary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '0 9px',
                    fontSize: 12,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {copyAnnouncement.tone === 'error' ? <WarningCircle size={13} /> : <CheckCircle size={13} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{copyAnnouncement.message}</span>
                </span>
              ) : null}
              {threadTranscript ? (
                <ChatMessageCopyButton
                  label="thread transcript"
                  copied={copiedMessageId === 'thread:transcript'}
                  errored={copyErrorMessageId === 'thread:transcript'}
                  onCopy={() => copyToClipboard(threadTranscript, {
                    id: 'thread:transcript',
                    label: 'thread transcript',
                  })}
                />
              ) : null}
            </div>
          )}
        {!mounted && !hasThreadContent ? (
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
        ) : !hasThreadContent ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {emptyStateSlot ?? (
              <EmptyState icon={ChatCircle} title="No messages yet" description="Paste images, drag files, or start typing. Shift+Enter for newline." />
            )}
          </div>
        ) : null}

        {/* System message pill */}
        {systemMsg && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '8px 0', fontFamily: 'monospace' }}>
            {systemMsg}
          </div>
        )}

            {visibleMessagesWithAttachments.map((msg, messageIndex) => {
          if (msg.role === 'tool') {
            return (
              <ChatToolEvent
                key={msg.id}
                message={msg}
                copied={copiedMessageId === `tool:${msg.id}`}
                errored={copyErrorMessageId === `tool:${msg.id}`}
                onCopy={() => copyToClipboard(msg.text.trim() || 'Tool completed without output.', { id: `tool:${msg.id}`, label: 'tool event' })}
              />
            )
          }
          const displayText = msg.role === 'assistant' ? assistantDisplayText(msg.text) : msg.text
          const copyableText = msg.role === 'assistant' ? displayText : msg.text
          const displayImages = msg.images ?? []
          const displayContextFiles = msg.contextFiles
          const isStreamingLatestAssistant = msg.role === 'assistant' && isTyping && msg.id === latestAssistantMessageId
          const previousUserMessage = msg.role === 'assistant'
            ? [...visibleMessagesWithAttachments.slice(0, messageIndex)]
              .reverse()
              .find((candidate) => candidate.role === 'user') ?? null
            : null
          return (
          <div key={msg.id} style={{
            display: 'flex',
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            gap: '8px',
            alignItems: 'flex-end',
          }}>
            <ChatMessageAvatar role={msg.role} />

            {/* Content */}
            <div style={{ maxWidth: '74%', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {/* Images -- fall back to optimistic cache if history record arrived without attachments */}
              {displayImages.map((url, i) => (
                <img key={i} src={url} alt={`${msg.role === 'assistant' ? 'Assistant' : 'User'} attached image ${i + 1}`} loading="lazy" onClick={() => setLightbox({ src: url, type: 'image' })}
                  style={{ maxWidth: '240px', maxHeight: '180px', borderRadius: '10px', display: 'block', marginBottom: '4px', border: '1px solid var(--border)', objectFit: 'contain', cursor: 'zoom-in' }}
                />
              ))}
              <ChatContextFileChips
                files={displayContextFiles}
                align={msg.role === 'user' ? 'flex-end' : 'flex-start'}
                copyIdPrefix={`file:${msg.id}`}
                copiedId={copiedMessageId}
                erroredId={copyErrorMessageId}
                onCopyFile={(file, _index, copyId) => copyToClipboard(contextFileClipboardText(file), {
                  id: copyId,
                  label: `attached file ${file.name}`,
                })}
              />
              {/* Text bubble */}
              {displayText && (
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
                      <span style={{ whiteSpace: 'pre-wrap' }}>{displayText}</span>
                    ) : (
                      <Suspense fallback={<span style={{ whiteSpace: 'pre-wrap', opacity: 0.7 }}>{displayText}</span>}>
                        <MarkdownBubble>{displayText}</MarkdownBubble>
                      </Suspense>
                    )}
                  </div>
                </>
              )}
              {msg.role === 'assistant' && (
                <ChatToolCards
                  text={msg.text}
                  copyIdPrefix={`tool-card:${msg.id}`}
                  copiedId={copiedMessageId}
                  erroredId={copyErrorMessageId}
                  onCopyToolCard={(card, copyId) => copyToClipboard(transcriptToolCardBody(card), {
                    id: copyId,
                    label: `tool result ${card.name}`,
                  })}
                />
              )}
              {msg.role === 'assistant' && <ChatProposalActions text={msg.text} />}
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
                {copyableText.trim() && !isStreamingLatestAssistant && (
                  <ChatMessageCopyButton
                    label={`${msg.role} message`}
                    copied={copiedMessageId === `${msg.role}:${msg.id}`}
                    errored={copyErrorMessageId === `${msg.role}:${msg.id}`}
                    onCopy={() => copyToClipboard(copyTextWithContextFiles(copyableText, displayContextFiles, displayImages.length), { id: `${msg.role}:${msg.id}`, label: `${msg.role} message` })}
                  />
                )}
                {msg.role === 'user' && onUseMessageAsPrompt && (
                  <>
                    <ChatMessageTextAction
                      label="Edit"
                      ariaLabel={`Edit user message: ${actionPreviewLabel(copyableText, msg.id)}`}
                      onClick={() => onUseMessageAsPrompt(msg)}
                    />
                    <ChatMessageTextAction
                      label="Use as prompt"
                      ariaLabel={`Use user message as prompt: ${actionPreviewLabel(copyableText, msg.id)}`}
                      onClick={() => onUseMessageAsPrompt(msg)}
                    />
                  </>
                )}
                {msg.role === 'user' && onForkMessage && (
                  <ChatMessageTextAction
                    label="Fork"
                    ariaLabel={`Fork chat from user message: ${actionPreviewLabel(copyableText, msg.id)}`}
                    onClick={() => onForkMessage(msg)}
                  />
                )}
                {msg.role === 'assistant' && !isStreamingLatestAssistant && onRegenerateAssistant && previousUserMessage && (
                  <ChatMessageTextAction
                    label="Regenerate"
                    ariaLabel={`Regenerate assistant response: ${actionPreviewLabel(copyableText, msg.id)}`}
                    onClick={() => onRegenerateAssistant(msg, previousUserMessage)}
                  />
                )}
                {msg.role === 'assistant' && !isStreamingLatestAssistant && onForkMessage && previousUserMessage && (
                  <ChatMessageTextAction
                    label="Fork"
                    ariaLabel={`Fork chat from assistant response: ${actionPreviewLabel(copyableText, msg.id)}`}
                    onClick={() => onForkMessage(previousUserMessage)}
                  />
                )}
                {msg.role === 'assistant' && !isStreamingLatestAssistant && onContinueAssistant && copyableText.trim() && (
                  <ChatMessageTextAction
                    label="Continue"
                    ariaLabel={`Continue assistant response: ${actionPreviewLabel(copyableText, msg.id)}`}
                    onClick={() => onContinueAssistant(msg)}
                  />
                )}
              </div>
            </div>
          </div>
          )
        })}
        {optimistic.map((msg) => {
          const optimisticCopyId = `optimistic:${msg.id}`
          const optimisticCopyValue = copyTextWithContextFiles(msg.text, msg.contextFiles, msg.images?.length ?? 0)
          return (
          <div key={msg.id} style={{ display: 'flex', flexDirection: 'row-reverse', gap: '8px', alignItems: 'flex-end' }}>
            <ChatMessageAvatar role="user" />

            {/* Content */}
            <div style={{ maxWidth: '74%', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
              {/* Images */}
              {(msg.images || []).map((src, i) => (
                <img key={i} src={src} alt={`Sending attached image ${i + 1}`} loading="lazy"
                  style={{ maxWidth: '200px', maxHeight: '150px', borderRadius: '10px', marginBottom: '4px', display: 'block' }}
                />
              ))}
              <ChatContextFileChips
                files={msg.contextFiles}
                align="flex-end"
                copyIdPrefix={`file:${msg.id}`}
                copiedId={copiedMessageId}
                erroredId={copyErrorMessageId}
                onCopyFile={(file, _index, copyId) => copyToClipboard(contextFileClipboardText(file), {
                  id: copyId,
                  label: `attached file ${file.name}`,
                })}
              />
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingRight: '2px', marginTop: '2px' }}>
                  <ChatMessageCopyButton
                    label="sending message"
                    copied={copiedMessageId === optimisticCopyId}
                    errored={copyErrorMessageId === optimisticCopyId}
                    onCopy={() => copyToClipboard(optimisticCopyValue, {
                      id: optimisticCopyId,
                      label: 'sending message',
                    })}
                  />
                  <span style={{
                    display: 'inline-block', width: '10px', height: '10px',
                    border: '1.5px solid var(--text-muted)', borderTopColor: 'transparent',
                    borderRadius: '50%', animation: 'spin 0.6s linear infinite',
                  }} />
                </div>
              )}
              {msg.status === 'sent' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingRight: '2px', marginTop: '2px' }}>
                  <ChatMessageCopyButton
                    label="sent message"
                    copied={copiedMessageId === optimisticCopyId}
                    errored={copyErrorMessageId === optimisticCopyId}
                    onCopy={() => copyToClipboard(optimisticCopyValue, {
                      id: optimisticCopyId,
                      label: 'sent message',
                    })}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', animation: 'fadeOutCheck 2s ease forwards 0.5s' }}>&#x2713;</span>
                </div>
              )}
              {msg.status === 'permanent' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: '2px', marginTop: '2px' }}>
                  <ChatMessageCopyButton
                    label="message"
                    copied={copiedMessageId === optimisticCopyId}
                    errored={copyErrorMessageId === optimisticCopyId}
                    onCopy={() => copyToClipboard(optimisticCopyValue, {
                      id: optimisticCopyId,
                      label: 'message',
                    })}
                  />
                </div>
              )}
              {msg.status === 'error' && (
                <div style={{ display: 'grid', justifyItems: 'end', gap: 4, marginTop: '4px', maxWidth: 280 }}>
                  {msg.error && (
                    <div
                      role="alert"
                      style={{
                        maxWidth: '100%',
                        border: '1px solid color-mix(in srgb, var(--red, #ef4444) 35%, transparent)',
                        borderRadius: 8,
                        background: 'color-mix(in srgb, var(--red, #ef4444) 10%, transparent)',
                        color: 'var(--red)',
                        padding: '6px 8px',
                        fontSize: 11,
                        lineHeight: 1.35,
                        wordBreak: 'break-word',
                        textAlign: 'right',
                      }}
                    >
                      {hermesChatErrorMessage(msg.error)}
                    </div>
                  )}
                  <ChatMessageCopyButton
                    label="failed message"
                    copied={copiedMessageId === optimisticCopyId}
                    errored={copyErrorMessageId === optimisticCopyId}
                    onCopy={() => copyToClipboard(optimisticCopyValue, {
                      id: optimisticCopyId,
                      label: 'failed message',
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => retry(msg)}
                    aria-label="Retry failed message"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer',
                      justifyContent: 'flex-end',
                      border: 0,
                      background: 'transparent',
                      padding: 0,
                      font: 'inherit',
                    }}
                  >
                    <span style={{
                      width: '16px', height: '16px', borderRadius: '50%',
                      background: 'var(--red)', color: 'var(--text-on-color)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '10px', fontWeight: 700, flexShrink: 0,
                    }}>!</span>
                    <span style={{ fontSize: '11px', color: 'var(--red)', fontFamily: 'monospace' }}>Tap to retry</span>
                  </button>
                  {onUseMessageAsPrompt && (
                    <button
                      type="button"
                      onClick={() => onUseMessageAsPrompt(optimisticMessageAsUserMessage(msg))}
                      aria-label="Edit failed message"
                      style={{
                        border: 0,
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        font: 'inherit',
                        fontFamily: 'monospace',
                        fontSize: 11,
                        padding: 0,
                      }}
                    >
                      Edit message
                    </button>
                  )}
                </div>
              )}
              {msg.status === 'cancelled' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: '4px' }}>
                  <ChatMessageCopyButton
                    label="stopped message"
                    copied={copiedMessageId === optimisticCopyId}
                    errored={copyErrorMessageId === optimisticCopyId}
                    onCopy={() => copyToClipboard(optimisticCopyValue, {
                      id: optimisticCopyId,
                      label: 'stopped message',
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => retry(msg)}
                    style={{
                      border: 0,
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer',
                      justifyContent: 'flex-end',
                      padding: 0,
                      font: 'inherit',
                    }}
                  >
                    <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>Stopped · Retry</span>
                  </button>
                  {onUseMessageAsPrompt && (
                    <button
                      type="button"
                      onClick={() => onUseMessageAsPrompt(optimisticMessageAsUserMessage(msg))}
                      aria-label="Edit stopped message"
                      style={{
                        border: 0,
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        font: 'inherit',
                        fontFamily: 'monospace',
                        fontSize: 11,
                        padding: 0,
                      }}
                    >
                      Edit
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          )
        })}
        {isTyping && (
          <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', alignItems: 'flex-end' }}>
            <ChatMessageAvatar role="assistant" />
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
