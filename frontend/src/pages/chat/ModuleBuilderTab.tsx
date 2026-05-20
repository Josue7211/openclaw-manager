/**
 * Module builder tab -- side-by-side chat + preview layout.
 *
 * Users describe modules in natural language on the left. The builder generates
 * installable module source using the primitives API. The generated code previews
 * in a sandboxed iframe on the right. Approve installs to dashboard,
 * reject discards, edit sends a follow-up message.
 */

import { useState, useMemo, useRef, useCallback, useEffect, lazy, Suspense } from 'react'
import { PaperPlaneTilt, Robot } from '@phosphor-icons/react'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
import { api } from '@/lib/api'
import { saveGeneratedModule } from '@/lib/generated-module-store'
import type { GenerationState } from '@/lib/generated-module-types'
import { CHAT_PRIMARY_MODEL_STORAGE_KEY } from '@/lib/model-favorites'
import {
  createModuleProposal,
  listModuleProposals,
  type StoredModuleProposal,
  updateModuleProposalStatus,
} from '@/lib/module-proposal-store'
import {
  createFallbackProposal,
  isInstallableModuleProposal,
  proposalToGeneratedModule,
  type ModuleProposal,
} from '@/lib/module-proposals'
import { extractOpenUiLangFromResponse } from '@/lib/openui'
import { validateModuleProposal } from '@/lib/module-proposal-validator'
import { ModulePreview } from './ModulePreview'
import { ModuleApprovalBar } from './ModuleApprovalBar'
import { ModuleProposalPreview } from './ModuleProposalPreview'
import { RecentModuleProposals } from './RecentModuleProposals'
import {
  buildModuleBuilderSystemPrompt,
  extractCodeFromResponse,
  extractModuleProposal,
  extractModuleMetadata,
} from './module-builder-prompt'
import { buildLiveAppContext } from '@/features/chat/liveAppContext'

const MarkdownBubble = lazy(() => import('@/components/MarkdownBubble'))

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BuilderMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  timestamp: string
}

interface BuilderHistoryMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  timestamp: string
}

interface BuilderHistoryResponse {
  messages?: BuilderHistoryMessage[]
  error?: string
}

const MODULE_BUILDER_REPLY_TIMEOUT_MS = 45_000
const MODULE_BUILDER_REPLY_POLL_MS = 1_000

function historyTimestampMs(timestamp: string): number {
  const parsed = Date.parse(timestamp)
  return Number.isFinite(parsed) ? parsed : 0
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => globalThis.setTimeout(resolve, ms))
}

function buildInlineModuleBuilderRequest(userText: string): string {
  return [
    'You are the OpenUI module builder for clawctrl.',
    'Return only one ```json code fence containing a valid ModuleProposal object, or an array of ModuleProposal objects when the user asks for multiple modules.',
    'When useful, include openUiLang with a valid OpenUI Lang snippet using positional arguments, for example: root = StatCard("Tasks", "7").',
    'Use only these primitives: StatCard, ProgressGauge, MarkdownDisplay, LineChart, BarChart, ListView, DataTable, FormWidget, KanbanBoard, TimerCountdown, ImageGallery.',
    'Keep capabilities read-only.',
    'Keep actions limited to navigate, refresh, or open.',
    'Treat only widget + dashboard as installable in the current runtime.',
    'Treat page, module, or panel proposals as installable generated app pages in the current runtime.',
    'If the user asks for a whole page, full page, app page, or module instead of a widget, set targetType to page and installTarget to app-shell.',
    'Do not output prose outside the json code fence.',
    `User request: ${userText}`,
  ].join('\n')
}

async function fetchBuilderHistory(): Promise<BuilderHistoryMessage[]> {
  const response = await api.get<BuilderHistoryResponse>('/api/chat/history')
  if (response.error) {
    throw new Error(response.error)
  }
  return Array.isArray(response.messages) ? response.messages : []
}

function selectBuilderAssistantReply(
  messages: BuilderHistoryMessage[],
  sendStartedAt: number,
  baselineAssistantIds: Set<string>
): BuilderHistoryMessage | null {
  return (
    messages
      .filter(message => {
        if (message.role !== 'assistant') return false
        if (!message.text.trim()) return false
        if (baselineAssistantIds.has(message.id)) return false
        return historyTimestampMs(message.timestamp) >= sendStartedAt
      })
      .sort((a, b) => historyTimestampMs(a.timestamp) - historyTimestampMs(b.timestamp))
      .at(0) || null
  )
}

async function waitForBuilderAssistantReply(
  sendStartedAt: number,
  baselineAssistantIds: Set<string>
): Promise<BuilderHistoryMessage> {
  const deadline = Date.now() + MODULE_BUILDER_REPLY_TIMEOUT_MS

  while (Date.now() <= deadline) {
    const history = await fetchBuilderHistory()
    const reply = selectBuilderAssistantReply(history, sendStartedAt, baselineAssistantIds)
    if (reply) return reply

    if (Date.now() + MODULE_BUILDER_REPLY_POLL_MS > deadline) break
    await delay(MODULE_BUILDER_REPLY_POLL_MS)
  }

  throw new Error('Request reached chat, but no assistant reply arrived in history before timeout.')
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ModuleBuilderTab() {
  const [messages, setMessages] = useState<BuilderMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [generatedSource, setGeneratedSource] = useState('')
  const [generatedProposal, setGeneratedProposal] = useState<ModuleProposal | null>(null)
  const [savedProposalId, setSavedProposalId] = useState<string | null>(null)
  const [recentProposals, setRecentProposals] = useState<StoredModuleProposal[]>([])
  const [generationState, setGenerationState] = useState<GenerationState>('idle')
  const [model] = useLocalStorageState('chat-model', '')
  const [primaryModel] = useLocalStorageState(CHAT_PRIMARY_MODEL_STORAGE_KEY, '')

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Build system prompt once
  const moduleBuilderSystemPrompt = useMemo(() => buildModuleBuilderSystemPrompt(), [])

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const refreshRecentProposals = useCallback(async () => {
    try {
      const proposals = await listModuleProposals()
      setRecentProposals(proposals)
    } catch {
      // Non-fatal: keep current in-memory preview usable even if history fails.
    }
  }, [])

  useEffect(() => {
    void refreshRecentProposals()
  }, [refreshRecentProposals])

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
    const selectedModel = primaryModel || model
    const builderRequestText = buildInlineModuleBuilderRequest(text)

    const userMsg: BuilderMessage = {
      id: `module-u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      text,
      timestamp: new Date().toISOString(),
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setSending(true)
    setSavedProposalId(null)
    setGenerationState('generating')

    try {
      const baselineHistory = await fetchBuilderHistory().catch(() => [])
      const baselineAssistantIds = new Set(
        baselineHistory
          .filter(message => message.role === 'assistant')
          .map(message => message.id)
      )
      const sendStartedAt = Date.now()

      await api.post<{ ok?: boolean; error?: string }>(
        '/api/chat',
        {
          text: builderRequestText,
          model: selectedModel,
          system_prompt: moduleBuilderSystemPrompt,
          liveContext: await buildLiveAppContext(api.get, {
            requestText: text,
            route: typeof window === 'undefined' ? undefined : window.location.pathname,
            pageTitle: typeof document === 'undefined' ? undefined : document.title,
            apiPost: api.post,
          }).catch(() => ''),
        }
      )

      const assistantReply = await waitForBuilderAssistantReply(sendStartedAt, baselineAssistantIds)
      const assistantText = assistantReply.text.trim()
      const assistantMsg: BuilderMessage = {
        id: assistantReply.id || `module-a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'assistant',
        text: assistantText,
        timestamp: assistantReply.timestamp || new Date().toISOString(),
      }
      setMessages(prev => [...prev, assistantMsg])

      const proposal = extractModuleProposal(assistantText)
      if (proposal) {
        const validation = validateModuleProposal(proposal)
        if (validation.ok && validation.normalized) {
          setGeneratedProposal(validation.normalized)
          setGeneratedSource(proposalToGeneratedModule(validation.normalized).source)
          try {
            const storedProposal = await createModuleProposal(validation.normalized, 'draft')
            setSavedProposalId(storedProposal.id)
            await refreshRecentProposals()
          } catch (persistErr) {
            setSavedProposalId(null)
            setMessages(prev => [
              ...prev,
              {
                id: `module-proposal-save-err-${Date.now()}`,
                role: 'system',
                text: `Proposal preview ready, but draft persistence failed: ${persistErr instanceof Error ? persistErr.message : 'Unknown error'}`,
                timestamp: new Date().toISOString(),
              },
            ])
          }
          setGenerationState('analyzing')
          setTimeout(() => setGenerationState('previewing'), 400)
          return
        }

        const errorMsg: BuilderMessage = {
          id: `module-proposal-err-${Date.now()}`,
          role: 'system',
          text: `Proposal rejected: ${validation.errors.join('; ')}`,
          timestamp: new Date().toISOString(),
        }
        setMessages(prev => [...prev, errorMsg])
      }

      // Fallback: raw OpenUI Lang response path
      const openUiLang = extractOpenUiLangFromResponse(assistantText)
      if (openUiLang) {
        const openUiProposal: ModuleProposal = {
          ...createFallbackProposal(assistantText),
          title: 'OpenUI Module',
          description: 'OpenUI Lang module generated from assistant output.',
          openUiLang,
          fallbackMessage: undefined,
        }
        setGeneratedProposal(openUiProposal)
        setGeneratedSource(proposalToGeneratedModule(openUiProposal).source)
        try {
          const storedProposal = await createModuleProposal(openUiProposal, 'draft')
          setSavedProposalId(storedProposal.id)
          await refreshRecentProposals()
        } catch {
          setSavedProposalId(null)
        }
        setGenerationState('analyzing')
        setTimeout(() => setGenerationState('previewing'), 400)
        return
      }

      // Fallback: old code-fence path
      const code = extractCodeFromResponse(assistantText)
      if (code) {
        const fallbackProposal = createFallbackProposal(assistantText)
        setGeneratedProposal(fallbackProposal)
        setGeneratedSource(code)
        try {
          const storedProposal = await createModuleProposal(fallbackProposal, 'draft')
          setSavedProposalId(storedProposal.id)
          await refreshRecentProposals()
        } catch {
          setSavedProposalId(null)
        }
        setGenerationState('analyzing')
        // Brief delay to show analyzing state before previewing
        setTimeout(() => setGenerationState('previewing'), 400)
      } else {
        setGenerationState('idle')
      }
    } catch (err) {
      const errorMsg: BuilderMessage = {
        id: `module-err-${Date.now()}`,
        role: 'system',
        text: `Failed to reach module builder: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMsg])
      setGenerationState('idle')
    } finally {
      setSending(false)
    }
  }, [input, sending, model, primaryModel, moduleBuilderSystemPrompt, refreshRecentProposals])

  // ── Approval flow ─────────────────────────────────────────────────
  const handleApprove = useCallback(async () => {
    if (!generatedSource) return

    const compiledModule = generatedProposal
      ? proposalToGeneratedModule(generatedProposal)
      : null

    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
    const meta = compiledModule
      ? { name: compiledModule.name, description: compiledModule.description }
      : lastAssistant
        ? extractModuleMetadata(lastAssistant.text)
        : { name: 'Generated Module', description: '' }

    try {
      const installable = generatedProposal ? isInstallableModuleProposal(generatedProposal) : false
      if (installable) {
        const savedModule = await saveGeneratedModule({
          name: meta.name,
          description: meta.description,
          icon: 'Cube',
          source: compiledModule?.source || generatedSource,
          configSchema: compiledModule?.configSchema || { fields: [] },
          defaultSize: compiledModule?.defaultSize || { w: 3, h: 3 },
        })

        if (savedProposalId) {
          await updateModuleProposalStatus(savedProposalId, 'installed', savedModule.id)
          await refreshRecentProposals()
        }

        setGenerationState('approved')
        setMessages(prev => [
          ...prev,
          {
            id: `module-sys-${Date.now()}`,
            role: 'system',
            text: 'Module approved and added to dashboard!',
            timestamp: new Date().toISOString(),
          },
        ])
        return
      }

      if (savedProposalId) {
        await updateModuleProposalStatus(savedProposalId, 'approved')
        await refreshRecentProposals()
      }

      setGenerationState('approved')
      setMessages(prev => [
        ...prev,
        {
          id: `module-sys-${Date.now()}`,
          role: 'system',
          text: 'Proposal approved. This target is preview-only in the current runtime, so it was not installed.',
          timestamp: new Date().toISOString(),
        },
      ])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: `module-err-${Date.now()}`,
          role: 'system',
          text: `Failed to save module: ${err instanceof Error ? err.message : 'Unknown error'}`,
          timestamp: new Date().toISOString(),
        },
      ])
    }
  }, [generatedProposal, generatedSource, messages, refreshRecentProposals, savedProposalId])

  const handleReject = useCallback(() => {
    if (savedProposalId) {
      void updateModuleProposalStatus(savedProposalId, 'rejected')
        .then(() => refreshRecentProposals())
        .catch(() => {})
    }
    setGeneratedSource('')
    setGeneratedProposal(null)
    setSavedProposalId(null)
    setGenerationState('rejected')
    setMessages(prev => [
      ...prev,
      {
        id: `module-sys-${Date.now()}`,
        role: 'system',
        text: 'Module rejected.',
        timestamp: new Date().toISOString(),
      },
    ])
  }, [refreshRecentProposals, savedProposalId])

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
  const showingFallback = !!generatedProposal?.fallbackMessage

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
                Module Builder
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', maxWidth: 320 }}>
                Describe a module, panel, page, or widget and the builder will generate a structured OpenUI proposal. Installable dashboard widgets can be added directly; other targets stay preview-only for now.
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
              placeholder="Describe a module..."
              aria-label="Module description"
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
          <ModuleProposalPreview proposal={generatedProposal} isFallback={showingFallback} />
          <RecentModuleProposals
            proposals={recentProposals}
            activeProposalId={savedProposalId}
          />
          <ModulePreview
            source={generatedSource}
            generationState={generationState}
            proposal={generatedProposal}
            isFallback={showingFallback}
          />
          <ModuleApprovalBar
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
