import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
import { useChatSocket, type WsMessage } from '@/lib/hooks/useChatSocket'
import { api, ApiError, getRequestApiKeyForPath, getRequestBaseForPath } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { notifyChatSessionsChanged } from '@/lib/chat-session-selection'
import { isDemoMode, DEMO_CHAT_MESSAGES } from '@/lib/demo-data'
import { type LightboxData } from '@/components/Lightbox'
import {
  CHAT_DEFAULT_MODEL,
  CHAT_DEFAULT_FAVORITE_MODELS,
  CHAT_FAVORITE_MODELS_STORAGE_KEY,
  CHAT_FAVORITE_MODELS_VERSION,
  CHAT_FAVORITE_MODELS_VERSION_STORAGE_KEY,
  CHAT_PRIMARY_MODEL_STORAGE_KEY,
  mergeDefaultFavoriteModelIds,
  getChatFavoriteModels,
  resolvePreferredModelId,
  sanitizeFavoriteModelIds,
} from '@/lib/model-favorites'
import { resolveModelId, resolveStoredModelId } from '@/lib/model-resolver'
import { buildModuleBuilderSystemPrompt } from './module-builder-prompt'
import { buildLiveAppContext } from '@/features/chat/liveAppContext'
import {
  CHAT_CONTEXT_FILE_LIMIT,
  CHAT_CONTEXT_FILE_MAX_CHARS,
  CHAT_IMAGE_LIMIT,
  LEGACY_CHAT_COMPOSER_DRAFT_STORAGE_KEYS,
  chatComposerDraftStorageKeys,
  type ChatComposerDraftStorageKeys,
} from './constants'
import { CHAT_FALLBACK_PROVIDER_OPTIONS } from './providers'
import { selectableChatProviderOptions } from '@/chat/t3-adapters/providerSnapshots'
import { optimisticAttachmentCacheKey } from './optimisticAttachmentCache'
import { hermesChatErrorMessage } from './hermesErrors'

import {
  type ChatContextFileAttachment,
  type ChatExecutionContext,
  type ChatMessage,
  type OptimisticMsg,
  type ModelsResponse,
  type ChatProviderId,
  cleanMessages,
  cleanText,
  isSlashCommand,
} from './types'

const MODULE_BUILDER_EXPLICIT_RE = /\b(openui|generative ui|module builder|dashboard card|dashboard widget|installable primitive|installable primitives)\b/i
const MODULE_BUILDER_ACTION_RE = /\b(build|make|create|generate|design|add|insert|place|install|put|show)\b/i
const MODULE_BUILDER_SURFACE_RE = /\b(module|modules|widget|widgets|card|panel|page|component|dashboard|ui|primitive|primitives)\b/i
const TRANSCRIPT_DUPLICATE_WINDOW_MS = 30_000
const CHAT_PROVIDER_STORAGE_KEY = 'chat-provider'
const CHAT_CONTEXT_FILE_EXTENSIONS = new Set([
  'c',
  'cpp',
  'cs',
  'css',
  'csv',
  'go',
  'h',
  'html',
  'java',
  'js',
  'json',
  'jsx',
  'kt',
  'lock',
  'log',
  'md',
  'mdx',
  'php',
  'py',
  'rb',
  'rs',
  'scss',
  'sh',
  'sql',
  'svelte',
  'toml',
  'ts',
  'tsx',
  'txt',
  'vue',
  'xml',
  'yaml',
  'yml',
])
const GENERATED_CONTEXT_PATH_SEGMENTS = new Set([
  '.cache',
  '.git',
  '.next',
  '.output',
  '.turbo',
  '.vite',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'target',
])
const LOW_SIGNAL_CONTEXT_PATH_SEGMENTS = new Set([
  'vendor',
])
const HIGH_SIGNAL_CONTEXT_EXTENSIONS = new Set([
  'css',
  'go',
  'html',
  'js',
  'json',
  'jsx',
  'md',
  'mdx',
  'py',
  'rs',
  'scss',
  'svelte',
  'toml',
  'ts',
  'tsx',
  'vue',
  'yaml',
  'yml',
])
const LOW_SIGNAL_CONTEXT_EXTENSIONS = new Set([
  'csv',
  'lock',
  'log',
  'txt',
])

function fileExtension(name: string): string {
  const trimmed = name.trim().toLowerCase()
  const index = trimmed.lastIndexOf('.')
  return index >= 0 ? trimmed.slice(index + 1) : trimmed
}

function isContextTextFile(file: File): boolean {
  if (file.type.startsWith('text/')) return true
  if (['application/json', 'application/xml', 'application/x-yaml', 'image/svg+xml'].includes(file.type)) return true
  return CHAT_CONTEXT_FILE_EXTENSIONS.has(fileExtension(file.name))
}

function shouldHandleClipboardAttachmentPaste(event: ClipboardEvent): boolean {
  const target = event.target
  if (!(target instanceof Element)) return true
  if (target.closest('[data-chat-composer="true"]')) return true
  if (target === document.body || target === document.documentElement) return true
  return !target.closest('input,textarea,select,[contenteditable="true"]')
}

function contextFilePath(file: File): string {
  const withRelativePath = file as File & { webkitRelativePath?: string }
  return withRelativePath.webkitRelativePath?.trim() || file.name
}

function normalizeContextFilePath(path: string | undefined, fallbackName: string): string {
  const normalized = (path?.trim() || fallbackName.trim())
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
  const withoutLeadingDot = normalized.replace(/^\.\/+/, '')
  return withoutLeadingDot || fallbackName.trim()
}

function contextFilePathSegments(file: File): string[] {
  return normalizeContextFilePath(contextFilePath(file), file.name)
    .split('/')
    .map(segment => segment.trim().toLowerCase())
    .filter(Boolean)
}

function isGeneratedContextPath(file: File): boolean {
  return contextFilePathSegments(file).some(segment => GENERATED_CONTEXT_PATH_SEGMENTS.has(segment))
}

function contextFileSelectionRank(file: File): number {
  const path = normalizeContextFilePath(contextFilePath(file), file.name).toLowerCase()
  const extension = fileExtension(file.name)
  const segments = contextFilePathSegments(file)
  let rank = 20

  if (segments.includes('src') || segments.includes('app') || segments.includes('components')) rank -= 8
  if (/(^|\/)(readme|package|tsconfig|vite\.config|tauri\.conf|cargo|dockerfile|compose)[^/]*$/i.test(path)) rank -= 5
  if (HIGH_SIGNAL_CONTEXT_EXTENSIONS.has(extension)) rank -= 3
  if (LOW_SIGNAL_CONTEXT_EXTENSIONS.has(extension)) rank += 8
  if (segments.some(segment => LOW_SIGNAL_CONTEXT_PATH_SEGMENTS.has(segment))) rank += 10

  return rank
}

function prioritizeContextFiles(files: File[]): File[] {
  return files
    .filter(file => !isGeneratedContextPath(file))
    .map((file, index) => ({ file, index, rank: contextFileSelectionRank(file) }))
    .sort((a, b) => (
      a.rank - b.rank
      || normalizeContextFilePath(contextFilePath(a.file), a.file.name).localeCompare(normalizeContextFilePath(contextFilePath(b.file), b.file.name))
      || a.index - b.index
    ))
    .map(item => item.file)
}

function contextFileIdentity(file: File): string {
  return `${normalizeContextFilePath(contextFilePath(file), file.name)}:${file.size}`
}

function contextFileAttachmentIdentity(file: ChatContextFileAttachment): string {
  return `${normalizeContextFilePath(file.path, file.name)}:${file.size ?? 'unknown'}`
}

function filterNewContextFiles(files: File[], existing: ChatContextFileAttachment[]): File[] {
  const seen = new Set(existing.map(contextFileAttachmentIdentity))
  return files.filter((file) => {
    const identity = contextFileIdentity(file)
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  })
}

function dedupeContextFileAttachments(files: ChatContextFileAttachment[]): ChatContextFileAttachment[] {
  const seen = new Set<string>()
  return files.filter((file) => {
    const identity = contextFileAttachmentIdentity(file)
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  })
}

function safeSessionStorageGetItem(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSessionStorageRemoveItem(key: string) {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // Ignore storage access failures.
  }
}

function safeSessionStorageSetItem(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    safeSessionStorageRemoveItem(key)
  }
}

function safeLocalStorageGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeLocalStorageSetItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Ignore storage access failures.
  }
}

function saveContextFileDraft(files: ChatContextFileAttachment[], draftStorageKeys: ChatComposerDraftStorageKeys) {
  try {
    if (files.length === 0) {
      safeSessionStorageRemoveItem(draftStorageKeys.contextFiles)
      return
    }
    safeSessionStorageSetItem(draftStorageKeys.contextFiles, JSON.stringify(files))
  } catch {
    safeSessionStorageRemoveItem(draftStorageKeys.contextFiles)
  }
}

function loadContextFileDraft(
  draftStorageKeys: ChatComposerDraftStorageKeys,
  options: { allowLegacyFallback: boolean },
): ChatContextFileAttachment[] {
  try {
    const saved = safeSessionStorageGetItem(draftStorageKeys.contextFiles)
      ?? (options.allowLegacyFallback
        ? safeSessionStorageGetItem(LEGACY_CHAT_COMPOSER_DRAFT_STORAGE_KEYS.contextFiles)
        : null)
    if (!saved) return []
    const parsed = JSON.parse(saved) as unknown
    if (!Array.isArray(parsed)) return []
    const files = parsed
      .filter((file): file is ChatContextFileAttachment => Boolean(
        file
        && typeof file === 'object'
        && 'id' in file
        && 'name' in file
        && 'content' in file
        && typeof file.id === 'string'
        && typeof file.name === 'string'
        && typeof file.content === 'string',
      ))
      .slice(0, CHAT_CONTEXT_FILE_LIMIT)
    const deduped = dedupeContextFileAttachments(files).slice(0, CHAT_CONTEXT_FILE_LIMIT)
    if (deduped.length !== files.length) saveContextFileDraft(deduped, draftStorageKeys)
    return deduped
  } catch {
    return []
  }
}

function scopedComposerDraftEnvironment(
  sessionEnvironmentId: string | null,
  context?: ChatRequestContext,
): string {
  return sessionEnvironmentId
    || context?.environmentId?.trim()
    || ''
}

function buildComposerDraftScope(input: {
  sessionKey: string | null
  sessionEnvironmentId: string | null
  context?: ChatRequestContext
}): string | null {
  const environment = scopedComposerDraftEnvironment(input.sessionEnvironmentId, input.context)
  if (input.sessionKey?.trim()) {
    return `session:${environment || 'default'}:${input.sessionKey.trim()}`
  }

  const projectIdentity = input.context?.projectId?.trim()
    || input.context?.workingDir?.trim()
    || input.context?.projectRoot?.trim()
    || input.context?.project?.trim()
  if (projectIdentity) {
    return `project:${environment || 'default'}:${projectIdentity}`
  }

  return environment ? `environment:${environment}` : null
}

function shouldUseModuleBuilderPrompt(text: string): boolean {
  return MODULE_BUILDER_EXPLICIT_RE.test(text)
    || (MODULE_BUILDER_ACTION_RE.test(text) && MODULE_BUILDER_SURFACE_RE.test(text))
}

function moduleBuilderSystemPromptForText(text: string): string | undefined {
  return shouldUseModuleBuilderPrompt(text) ? buildModuleBuilderSystemPrompt() : undefined
}

function chatHistoryPath(sessionKey: string | null, environmentId?: string | null): string {
  const environment = environmentId?.trim()
  if (!sessionKey) {
    return environment ? `/api/chat/history?environmentId=${encodeURIComponent(environment)}` : '/api/chat/history'
  }

  const params = new URLSearchParams({ limit: '500' })
  if (environment) params.set('environmentId', environment)
  return `/api/gateway/sessions/${encodeURIComponent(sessionKey)}/history?${params.toString()}`
}

function withSessionKey<T extends Record<string, unknown>>(
  payload: T,
  sessionKey: string | null,
  environmentId?: string | null,
): T & { sessionKey?: string; environmentId?: string } {
  const next = sessionKey ? { ...payload, sessionKey } : { ...payload }
  const environment = environmentId?.trim()
  const existingEnvironment = typeof next.environmentId === 'string' ? next.environmentId.trim() : ''
  return environment && !existingEnvironment
    ? { ...next, environmentId: environment }
    : next
}

function displayUserTextFromStoredPrompt(value: string): string {
  const text = value.trim()
  const match = text.match(/(?:^|\r?\n)(?:Current user request|User request):\s*([\s\S]+)$/)
  const requestText = match?.[1]?.trim() || text
  const stripped = requestText.split(/\r?\n\r?\nAttached context files:\r?\n\r?\n/)[0]?.trim()
  if (stripped) return stripped
  if (requestText.startsWith('Attached context files:')) return 'Attached context files'
  return requestText
}

function messageTimestampMs(message: ChatMessage): number | null {
  const value = new Date(message.timestamp).getTime()
  return Number.isFinite(value) ? value : null
}

function messageImageSignature(message: ChatMessage): string {
  return (message.images || []).join('\n')
}

function messageStableIds(message: ChatMessage): string[] {
  return [
    message.transcriptId,
    message.turnId,
    message.toolCallId ? `tool:${message.toolCallId}` : undefined,
    message.id,
  ].filter((value): value is string => Boolean(value?.trim()))
}

function isDuplicateTranscriptMessage(existing: ChatMessage, candidate: ChatMessage): boolean {
  const existingStableIds = new Set(messageStableIds(existing))
  if (messageStableIds(candidate).some((id) => existingStableIds.has(id))) return true
  if (existing.role !== candidate.role) return false
  if (existing.text !== candidate.text) return false
  if (messageImageSignature(existing) !== messageImageSignature(candidate)) return false

  const existingTime = messageTimestampMs(existing)
  const candidateTime = messageTimestampMs(candidate)
  if (existingTime === null || candidateTime === null) return false
  return Math.abs(existingTime - candidateTime) <= TRANSCRIPT_DUPLICATE_WINDOW_MS
}

function dedupeTranscriptMessages(messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = []
  for (const message of messages) {
    if (result.some((existing) => isDuplicateTranscriptMessage(existing, message))) continue
    result.push(message)
  }
  return result
}

interface ChatHistoryItem {
  id?: string
  itemId?: string
  messageId?: string
  transcriptId?: string
  turnId?: string
  callId?: string
  toolCallId?: string
  tool_call_id?: string
  toolName?: string
  tool_name?: string
  role?: string
  text?: string
  content?: string
  timestamp?: string | null
  images?: string[]
  contextFiles?: ChatContextFileAttachment[]
}

interface ChatHistoryResponse {
  messages?: ChatHistoryItem[]
  error?: string
}

interface ChatSendResponse {
  ok?: boolean
  sessionKey?: string | null
  environmentId?: string | null
  environment_id?: string | null
  env?: string | null
  reply?: string | null
  provider?: string | null
}

interface ChatProviderStatusResponse {
  providers?: ModelsResponse['providers']
}

type ChatRequestContext = ChatExecutionContext

function snapshotChatRequestContext(context?: ChatRequestContext): ChatRequestContext | undefined {
  if (!context) return undefined
  const snapshot: ChatRequestContext = {}
  const copyString = (key: keyof ChatRequestContext) => {
    const value = context[key]?.trim()
    if (value) snapshot[key] = value
  }
  copyString('projectId')
  copyString('project')
  copyString('projectRoot')
  copyString('workingDir')
  copyString('environmentId')
  copyString('branch')
  copyString('runtime')
  return Object.keys(snapshot).length > 0 ? snapshot : undefined
}

export function buildChatRequestPayload(input: {
  text: string
  images: string[]
  contextFiles?: ChatContextFileAttachment[]
  model: string
  provider: ChatProviderId
  providerIsModelBacked: boolean
  liveContext?: string
  systemPrompt?: string
}) {
  const payload: {
    text: string
    images: string[]
    contextFiles?: ChatContextFileAttachment[]
    provider: ChatProviderId
    model?: string
    liveContext?: string
    system_prompt?: string
  } = {
    text: input.text,
    images: input.images,
    provider: input.provider,
  }

  if (input.contextFiles?.length) {
    payload.contextFiles = input.contextFiles
  }

  if (input.liveContext !== undefined) {
    payload.liveContext = input.liveContext
  }

  if (input.systemPrompt) {
    payload.system_prompt = input.systemPrompt
  }

  if (input.providerIsModelBacked) {
    payload.model = resolveStoredModelId(input.model)
  }

  return payload
}

async function captureLiveContext(text: string, context?: ChatRequestContext): Promise<string> {
  return buildLiveAppContext(api.get, {
    requestText: text,
    route: typeof window === 'undefined' ? undefined : window.location.pathname,
    pageTitle: typeof document === 'undefined' ? undefined : document.title,
    context,
    apiPost: api.post,
  })
}

function normalizeHistoryMessages(items: ChatHistoryItem[] = []): ChatMessage[] {
  return dedupeTranscriptMessages(items.flatMap((item, index) => {
    if (item.role !== 'user' && item.role !== 'assistant' && item.role !== 'tool') return []
    const rawText = cleanText(String(item.text ?? item.content ?? ''))
    const text = item.role === 'user' ? displayUserTextFromStoredPrompt(rawText) : rawText
    if (!text && item.role !== 'tool') return []
    const toolCallId = item.toolCallId || item.tool_call_id || item.callId
    const transcriptId = item.transcriptId || item.itemId || item.messageId
    const id = item.id || transcriptId || (toolCallId ? `tool-${toolCallId}` : undefined) || `${item.role}-${item.timestamp ?? 'no-time'}-${index}`
    return [{
      id,
      role: item.role,
      text,
      timestamp: item.timestamp || new Date(0).toISOString(),
      images: item.images,
      contextFiles: item.contextFiles,
      transcriptId,
      turnId: item.turnId,
      toolCallId,
      toolName: item.toolName || item.tool_name,
    }]
  }))
}

export function useChatState(
  sessionKey: string | null = null,
  options: {
    onSessionKey?: (key: string, meta?: { environmentId?: string | null }) => void
    blank?: boolean
    context?: ChatRequestContext
    sessionEnvironmentId?: string | null
    newChat?: boolean
    attachmentInputLocked?: boolean
  } = {},
) {
  const queryClient = useQueryClient()
  const _demo = isDemoMode()
  const blank = Boolean(options.blank)
  const sessionEnvironmentId = options.sessionEnvironmentId?.trim() || null
  const composerDraftScope = useMemo(() => buildComposerDraftScope({
    sessionKey,
    sessionEnvironmentId,
    context: options.context,
  }), [
    sessionKey,
    sessionEnvironmentId,
    options.context?.branch,
    options.context?.environmentId,
    options.context?.project,
    options.context?.projectId,
    options.context?.projectRoot,
    options.context?.runtime,
    options.context?.workingDir,
  ])
  const draftStorageKeys = useMemo(
    () => chatComposerDraftStorageKeys(composerDraftScope),
    [composerDraftScope],
  )
  const allowLegacyDraftFallback = !composerDraftScope
  const [messages, setMessages]   = useState<ChatMessage[]>(_demo ? DEMO_CHAT_MESSAGES : [])
  const [input, setInput]         = useState('')
  const [images, setImages]       = useState<string[]>([])
  const [contextFiles, setContextFiles] = useState<ChatContextFileAttachment[]>([])
  const [pendingAttachmentReads, setPendingAttachmentReads] = useState(0)
  const [pendingQueuedSend, setPendingQueuedSend] = useState(false)
  const [sending, setSending]     = useState(false)
  const [connected, setConnected] = useState(_demo)
  const [mounted, setMounted]     = useState(_demo)
  const [lightbox, setLightbox]   = useState<LightboxData>(null)
  const [atBottom, setAtBottomState] = useState(true)
  const atBottomRef              = useRef(true)
  const setAtBottom = useCallback((value: boolean) => {
    atBottomRef.current = value
    setAtBottomState(value)
  }, [])
  const setAtBottomRefOnly = useCallback((value: boolean) => {
    atBottomRef.current = value
  }, [])
  const [optimistic, setOptimistic] = useState<OptimisticMsg[]>([])
  const [isTyping, setIsTyping]   = useState(false)
  const [systemMsg, setSystemMsg] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [model, setModelLocal] = useLocalStorageState('chat-model', '')
  const [provider, setProviderLocal] = useLocalStorageState<ChatProviderId>(CHAT_PROVIDER_STORAGE_KEY, 'hermes')
  const [primaryModel, setPrimaryModel] = useLocalStorageState(CHAT_PRIMARY_MODEL_STORAGE_KEY, '')
  const [favoriteModelIds, setFavoriteModelIds] = useLocalStorageState<string[]>(CHAT_FAVORITE_MODELS_STORAGE_KEY, [])
  const [favoriteModelsVersion, setFavoriteModelsVersion] = useLocalStorageState<number>(CHAT_FAVORITE_MODELS_VERSION_STORAGE_KEY, 0)
  const lastPostedModelRef = useRef('')
  const showAttachmentStatus = useCallback((message: string, timeoutMs = 3500) => {
    setSystemMsg(message)
    setTimeout(() => {
      setSystemMsg(current => current === message ? null : current)
    }, timeoutMs)
  }, [])
  // System prompt is now server-side only (security: prevents prompt injection from frontend)

  // Fetch available models from the configured Hermes Agent backend.
  const { data: modelsData } = useQuery<ModelsResponse>({
    queryKey: queryKeys.chatModels,
    queryFn: () => api.get<ModelsResponse>('/api/chat/models'),
    enabled: !_demo,
    staleTime: 30_000,
  })
  const { data: providerStatusData } = useQuery<ChatProviderStatusResponse>({
    queryKey: queryKeys.chatProviderStatus,
    queryFn: () => api.get<ChatProviderStatusResponse>('/api/chat/providers/status'),
    enabled: !_demo,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!modelsData?.models?.length) return
    if (favoriteModelsVersion < CHAT_FAVORITE_MODELS_VERSION) {
      const mergedFavorites = mergeDefaultFavoriteModelIds(
        favoriteModelIds,
        CHAT_DEFAULT_FAVORITE_MODELS,
        modelsData.models,
      )
      setFavoriteModelIds(mergedFavorites)
      setFavoriteModelsVersion(CHAT_FAVORITE_MODELS_VERSION)
      void api.patch('/api/hermes/runtime-config', { favoriteModels: mergedFavorites }).catch(() => {})
      return
    }
    const sanitizedFavorites = sanitizeFavoriteModelIds(favoriteModelIds)
    if (sanitizedFavorites.length !== favoriteModelIds.length) {
      setFavoriteModelIds(sanitizedFavorites)
    }
  }, [favoriteModelIds, favoriteModelsVersion, modelsData, setFavoriteModelIds, setFavoriteModelsVersion])

  useEffect(() => {
    if (!modelsData?.models?.length) return
    if (favoriteModelsVersion >= CHAT_FAVORITE_MODELS_VERSION) return

    const defaultModel = resolveStoredModelId(CHAT_DEFAULT_MODEL, modelsData.models)
    const defaultWireModel = resolveModelId(defaultModel, modelsData.models)
    if (!defaultModel || !defaultWireModel) return

    setModelLocal(defaultModel)
    setPrimaryModel(defaultModel)
    void api.patch<{ appliedChatModel?: boolean }>('/api/hermes/runtime-config', {
      chatPrimaryModel: defaultModel,
    }).then((result) => {
      if (result?.appliedChatModel) {
        lastPostedModelRef.current = defaultModel
        return
      }
      return api.post('/api/chat/model', { model: defaultWireModel }).then(() => {
        lastPostedModelRef.current = defaultModel
      })
    }).catch(() => {
      lastPostedModelRef.current = ''
    })
  }, [favoriteModelsVersion, modelsData, setModelLocal, setPrimaryModel])

  const visibleModels = modelsData?.models?.length
    ? getChatFavoriteModels(modelsData.models, favoriteModelIds, model)
    : []
  const providerWireOptions = providerStatusData?.providers?.length
    ? providerStatusData.providers
    : modelsData?.providers
  const providers = modelsData || providerStatusData
    ? selectableChatProviderOptions({
        providers: providerWireOptions,
        models: modelsData?.models ?? [],
      })
    : CHAT_FALLBACK_PROVIDER_OPTIONS
  const runtimeProvidersReady = Boolean(modelsData || providerStatusData)
  const providerIsSelectable = providers.some((candidate) => (
    candidate.id === provider && candidate.available !== false
  ))
  const firstSelectableProvider = providers.find((candidate) => candidate.available !== false)?.id ?? 'hermes'
  const resolvedProvider = providerIsSelectable ? provider : firstSelectableProvider
  const providerIsModelBacked = providers.find((candidate) => candidate.id === resolvedProvider)?.modelBacked ?? true

  const sessionEnvironmentFromResponse = useCallback((response: ChatSendResponse | undefined): string | null => {
    return response?.environmentId?.trim()
      || response?.environment_id?.trim()
      || response?.env?.trim()
      || null
  }, [])

  const providerFallbackMessage = useCallback((requestedProviderId: string, fallbackProviderId: string) => {
    const requestedProvider = providers.find((candidate) => candidate.id === requestedProviderId)
    const fallbackProvider = providers.find((candidate) => candidate.id === fallbackProviderId)
    if (!requestedProvider) {
      return `${fallbackProvider?.name || 'Hermes Agent'} is the active agent right now.`
    }
    const requestedLabel = requestedProvider?.name || requestedProviderId || 'Selected provider'
    const fallbackLabel = fallbackProvider?.name || fallbackProviderId || 'the active agent'
    const reason = requestedProvider?.unavailableReason?.trim()
    return reason
      ? `${requestedLabel} is unavailable: ${reason}. Switched to ${fallbackLabel}.`
      : `${requestedLabel} is unavailable. Switched to ${fallbackLabel}.`
  }, [providers])

  useEffect(() => {
    if (!runtimeProvidersReady) return
    if (provider !== resolvedProvider) {
      showAttachmentStatus(providerFallbackMessage(provider, resolvedProvider), 5000)
      setProviderLocal(resolvedProvider)
    }
  }, [provider, providerFallbackMessage, resolvedProvider, runtimeProvidersReady, setProviderLocal, showAttachmentStatus])

  // Keep the local picker on a valid model without blindly forcing server-side changes.
  // Server model changes are posted in a separate effect so we don't create drift loops.
  useEffect(() => {
    if (!providerIsModelBacked || !modelsData?.models?.length) return

    const availableIds = modelsData.models.map(m => m.id)
    const resolvedModel = resolveModelId(model, modelsData.models)
    const isExactMatch = Boolean(resolvedModel && availableIds.includes(resolvedModel))

    const preferredModel = resolveStoredModelId(primaryModel, modelsData.models)
    const serverModel = resolveStoredModelId(modelsData.currentModel, modelsData.models)
    const nextModel = isExactMatch
      ? resolveStoredModelId(model, modelsData.models)
      : preferredModel || serverModel || availableIds[0]

    if (!nextModel) return

    if (model !== nextModel) {
      setModelLocal(nextModel)
    }
  }, [modelsData, model, primaryModel, providerIsModelBacked, setModelLocal])

  useEffect(() => {
    if (!providerIsModelBacked || !modelsData?.models?.length || !model) return
    const wireModel = resolveModelId(model, modelsData.models)
    if (!wireModel || !modelsData.models.some(candidate => candidate.id === wireModel)) return

    if (resolveModelId(modelsData.currentModel, modelsData.models) === wireModel) {
      lastPostedModelRef.current = model
      return
    }

    if (lastPostedModelRef.current === model) return

    let cancelled = false
    api.post('/api/chat/model', { model: wireModel })
      .then(() => {
        if (!cancelled) lastPostedModelRef.current = model
      })
      .catch(err => {
        if (!cancelled) {
          console.error('Failed to sync chat model:', err)
          lastPostedModelRef.current = ''
          showAttachmentStatus('Model change did not reach Hermes Agent. Check Hermes settings and try again.', 5000)
        }
      })

    return () => {
      cancelled = true
    }
  }, [model, modelsData, providerIsModelBacked, showAttachmentStatus])

  // When user switches model, call the API to actually change it
  const setModel = useCallback((newModel: string) => {
    const previousModel = model
    const previousPrimaryModel = primaryModel
    const storedModel = resolveStoredModelId(newModel, modelsData?.models ?? [])
    const wireModel = resolveModelId(storedModel, modelsData?.models ?? []) || storedModel
    if (!storedModel || !wireModel) return
    setModelLocal(storedModel)
    setPrimaryModel(storedModel)
    lastPostedModelRef.current = storedModel
    if (!_demo && providerIsModelBacked) {
      api.patch<{ appliedChatModel?: boolean }>('/api/hermes/runtime-config', {
        chatPrimaryModel: storedModel,
      }).then((result) => {
        if (result?.appliedChatModel) {
          return
        }
        return api.post('/api/chat/model', { model: wireModel })
      }).catch(err => {
        console.error('Failed to set model:', err)
        lastPostedModelRef.current = ''
        setModelLocal(previousModel)
        setPrimaryModel(previousPrimaryModel)
        showAttachmentStatus('Model change failed. The previous model was restored.', 5000)
      })
    }
  }, [_demo, model, modelsData?.models, primaryModel, providerIsModelBacked, setModelLocal, setPrimaryModel, showAttachmentStatus])
  const setProvider = useCallback((newProvider: string) => {
    const requestedProvider = providers.find((candidate) => candidate.id === newProvider)
    const next = requestedProvider?.available !== false && requestedProvider
      ? newProvider as ChatProviderId
      : firstSelectableProvider as ChatProviderId
    if (newProvider !== next) {
      showAttachmentStatus(providerFallbackMessage(newProvider, next), 5000)
    }
    setProviderLocal(next)
  }, [firstSelectableProvider, providerFallbackMessage, providers, setProviderLocal, showAttachmentStatus])
  const sendingRef                = useRef(false)
  const failCountRef              = useRef(0)
  const lastUserMsgTimeRef        = useRef<number>(0)
  const bottomRef                 = useRef<HTMLDivElement>(null)
  const scrollRef                 = useRef<HTMLDivElement>(null)
  const pendingReadsRef           = useRef<number>(0)
  const pendingImageReadsRef      = useRef<number>(0)
  const pendingContextFileReadsRef = useRef<number>(0)
  const pendingContextFileIdentitiesRef = useRef<Set<string>>(new Set())
  const pendingAttachmentReadFailedRef = useRef<boolean>(false)
  const pendingSendRef            = useRef<boolean>(false)
  const attachmentInputLockedRef  = useRef<boolean>(Boolean(options.attachmentInputLocked))
  const pendingTextRef            = useRef<string>('')
  const imagesRef                 = useRef<string[]>([])
  const contextFilesRef           = useRef<ChatContextFileAttachment[]>([])
  const draftTimerRef             = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeSendIdRef           = useRef<string | null>(null)
  const activeSendControllerRef   = useRef<AbortController | null>(null)
  const activeOptimisticIdRef     = useRef<string | null>(null)
  const abortRequestedRef         = useRef(false)

  const syncPendingAttachmentReads = useCallback(() => {
    setPendingAttachmentReads(pendingReadsRef.current)
  }, [])

  useEffect(() => {
    attachmentInputLockedRef.current = Boolean(options.attachmentInputLocked)
  }, [options.attachmentInputLocked])

  const cancelQueuedSend = useCallback(() => {
    const queuedText = pendingTextRef.current
    pendingSendRef.current = false
    pendingTextRef.current = ''
    setPendingQueuedSend(false)
    if (queuedText) {
      setInput(queuedText)
      safeSessionStorageSetItem(draftStorageKeys.text, queuedText)
    }
  }, [draftStorageKeys.text])

  useEffect(() => {
    if (_demo) return
    setMessages([])
    setOptimistic([])
    setIsTyping(false)
    setSystemMsg(null)
    setHistoryError(null)
    setMounted(blank)
  }, [_demo, blank, sessionEnvironmentId, sessionKey])

  // ── Keep imagesRef in sync with committed images state ──
  useEffect(() => { imagesRef.current = images }, [images])
  useEffect(() => { contextFilesRef.current = contextFiles }, [contextFiles])

  // ── Auto-scroll (only when already at bottom) ──
  useEffect(() => {
    if (!atBottomRef.current) return
    const el = scrollRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'auto' })
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' })
    }
  }, [messages, optimistic, isTyping])

  // ── Load chat draft from localStorage on mount ──
  useEffect(() => {
    if (options.newChat) {
      safeSessionStorageRemoveItem(draftStorageKeys.text)
      safeSessionStorageRemoveItem(draftStorageKeys.images)
      safeSessionStorageRemoveItem(draftStorageKeys.contextFiles)
      if (allowLegacyDraftFallback) {
        safeSessionStorageRemoveItem(LEGACY_CHAT_COMPOSER_DRAFT_STORAGE_KEYS.text)
        safeSessionStorageRemoveItem(LEGACY_CHAT_COMPOSER_DRAFT_STORAGE_KEYS.images)
        safeSessionStorageRemoveItem(LEGACY_CHAT_COMPOSER_DRAFT_STORAGE_KEYS.contextFiles)
      }
      setInput('')
      imagesRef.current = []
      contextFilesRef.current = []
      setImages([])
      setContextFiles([])
    } else {
      const draft = safeSessionStorageGetItem(draftStorageKeys.text)
        ?? (allowLegacyDraftFallback ? safeSessionStorageGetItem(LEGACY_CHAT_COMPOSER_DRAFT_STORAGE_KEYS.text) : null)
      setInput(draft ?? '')
      try {
        const saved = safeSessionStorageGetItem(draftStorageKeys.images)
          ?? (allowLegacyDraftFallback ? safeSessionStorageGetItem(LEGACY_CHAT_COMPOSER_DRAFT_STORAGE_KEYS.images) : null)
        if (saved) {
          const parsed = JSON.parse(saved) as string[]
          if (Array.isArray(parsed) && parsed.length > 0) {
            imagesRef.current = parsed
            setImages(() => parsed)
          } else {
            imagesRef.current = []
            setImages([])
          }
        } else {
          imagesRef.current = []
          setImages([])
        }
      } catch {
        imagesRef.current = []
        setImages([])
        safeSessionStorageRemoveItem(draftStorageKeys.images)
      }
      const savedContextFiles = loadContextFileDraft(draftStorageKeys, { allowLegacyFallback: allowLegacyDraftFallback })
      if (savedContextFiles.length > 0) {
        contextFilesRef.current = savedContextFiles
        setContextFiles(savedContextFiles)
      } else {
        contextFilesRef.current = []
        setContextFiles([])
      }
    }
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    }
  }, [
    allowLegacyDraftFallback,
    draftStorageKeys.contextFiles,
    draftStorageKeys.images,
    draftStorageKeys.text,
    options.newChat,
  ])

  // ── WebSocket + polling fallback ──
  const optimisticImageCacheRef = useRef<Map<string, string[]>>(new Map())
  const optimisticContextFileCacheRef = useRef<Map<string, ChatContextFileAttachment[]>>(new Map())
  const optimisticAttachmentOccurrenceRef = useRef<Map<string, number>>(new Map())
  const backoffRef = useRef(5000)

  // Helper: reconcile an array of incoming messages into state
  const reconcileMessages = useCallback((incoming: ChatMessage[], mode: 'append' | 'replace' = 'append') => {
    if (mode === 'replace') {
      setMessages(prev => {
        const localMessages = prev.filter(message => message.localOnly)
        return dedupeTranscriptMessages([...incoming, ...localMessages])
      })
    } else {
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id))
        const newMsgs = incoming.filter(m => !existingIds.has(m.id) && !prev.some(existing => isDuplicateTranscriptMessage(existing, m)))
        if (newMsgs.length === 0) return prev
        return [...prev, ...newMsgs]
      })
    }

    // Remove optimistic bubbles that now appear in real history
    const removeOptimistic = () => {
      setOptimistic(prev => {
        if (prev.length === 0) return prev
        const filtered = prev.filter(opt => {
          const historyMsg = incoming.find(m => m.role === 'user' && m.text === opt.text)
          if (!historyMsg) return true
          if ((opt.images?.length ?? 0) > 0 && (!historyMsg.images || historyMsg.images.length === 0)) return true
          return false
        })
        return filtered.length === prev.length ? prev : filtered
      })
    }
    removeOptimistic()
    setTimeout(removeOptimistic, 1500)

    // Clear typing indicator when assistant replies after our last user message
    if (lastUserMsgTimeRef.current > 0) {
      const lastAssistant = [...incoming].reverse().find(m => m.role === 'assistant')
      if (lastAssistant && new Date(lastAssistant.timestamp).getTime() > lastUserMsgTimeRef.current) {
        setIsTyping(false)
      }
    }
  }, [])

  // -- WebSocket: receive individual new messages in real time --
  const onWsMessage = useCallback((msg: WsMessage) => {
    if (blank) return
    const cleaned = cleanMessages([msg as ChatMessage])
    const sessionStart = sessionKey ? null : safeLocalStorageGetItem('session-start')
    let filtered = cleaned
    if (sessionStart) {
      const startTime = parseInt(sessionStart, 10)
      filtered = cleaned.filter(m => new Date(m.timestamp).getTime() >= startTime)
    }
    if (filtered.length === 0) return

    if (!mounted) setMounted(true)
    setConnected(true)
    failCountRef.current = 0
    setNotConfigured(false)
    setHistoryError(null)

    reconcileMessages(filtered)
  }, [blank, mounted, reconcileMessages, sessionKey])

  const { connected: wsConnected, usingFallback } = useChatSocket({
    onMessage: onWsMessage,
    onStatusChange: (status) => {
      if (status) {
        setConnected(true)
        setHistoryError(null)
      }
    },
    enabled: !_demo && !blank,
    sessionKey,
    environmentId: sessionEnvironmentId,
  })

  // -- Polling fallback: only active when WebSocket is unavailable --
  const { data: historyData, dataUpdatedAt, isError: historyIsError, error: historyQueryError } = useQuery<ChatHistoryResponse>({
    queryKey: sessionKey
      ? ['chat', 'history', sessionKey, sessionEnvironmentId ?? '']
      : (sessionEnvironmentId ? ['chat', 'history', '', sessionEnvironmentId] : queryKeys.chatHistory),
    queryFn: () => api.get<ChatHistoryResponse>(chatHistoryPath(sessionKey, sessionEnvironmentId)),
    enabled: !_demo && !blank,
    refetchInterval: (query) => {
      if (wsConnected && !usingFallback) return false
      return query.state.error ? Math.min((backoffRef.current *= 2), 30000) : ((backoffRef.current = 5000), 5000)
    },
  })

  // Surface network-level failures as a user-visible error
  useEffect(() => {
    if (historyIsError && !notConfigured) {
      if (!wsConnected) {
        setConnected(false)
        const label = historyQueryError instanceof ApiError
          ? historyQueryError.serviceLabel
          : 'The chat server is unavailable right now'
        setHistoryError(hermesChatErrorMessage(label))
      }
    }
  }, [historyIsError, historyQueryError, notConfigured, wsConnected])

  // ── Reconcile incoming history (initial load + polling fallback) ──
  useEffect(() => {
    if (blank) return
    if (!historyData) return
    if (!mounted) setMounted(true)

    if (
      historyData.error === 'harness_not_configured'
      || historyData.error === 'hermes_not_configured'
    ) {
      setNotConfigured(true)
      setConnected(false)
      return
    }

    let incoming = normalizeHistoryMessages(historyData.messages)
    const sessionStart = sessionKey ? null : safeLocalStorageGetItem('session-start')
    if (sessionStart) {
      const startTime = parseInt(sessionStart, 10)
      incoming = incoming.filter(m => new Date(m.timestamp).getTime() >= startTime)
    }

    setConnected(true)
    failCountRef.current = 0
    setNotConfigured(false)
    setHistoryError(null)

    reconcileMessages(incoming, 'replace')
  }, [blank, historyData, dataUpdatedAt, reconcileMessages, sessionKey])

  // ── Paste image ──
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (!shouldHandleClipboardAttachmentPaste(e)) return
      if (pendingSendRef.current) return
      if (attachmentInputLockedRef.current) return
      Array.from(e.clipboardData?.items || []).forEach(item => {
        const file = item.getAsFile()
        if (!file) return
        if (item.type.startsWith('image/')) {
          readImageFile(file)
          return
        }
        if (isContextTextFile(file)) {
          readContextFile(file)
        }
      })
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [])

  const showImageLimitNotice = useCallback(() => {
    showAttachmentStatus(`You can attach up to ${CHAT_IMAGE_LIMIT} images at once.`)
  }, [showAttachmentStatus])

  const showContextFileLimitNotice = useCallback(() => {
    showAttachmentStatus(`You can attach up to ${CHAT_CONTEXT_FILE_LIMIT} context files at once.`)
  }, [showAttachmentStatus])

  const showDuplicateContextFileNotice = useCallback((count = 1) => {
    showAttachmentStatus(`Skipped ${count} duplicate context file${count === 1 ? '' : 's'}.`)
  }, [showAttachmentStatus])

  const showGeneratedContextFileNotice = useCallback((count = 1) => {
    showAttachmentStatus(`Skipped ${count} generated or dependency context file${count === 1 ? '' : 's'}.`)
  }, [showAttachmentStatus])

  const showUnsupportedFileNotice = useCallback(() => {
    showAttachmentStatus('Only text-like files can be attached as chat context.')
  }, [showAttachmentStatus])

  const showAttachmentReadFailureNotice = useCallback(() => {
    showAttachmentStatus('Attachment failed to load. Check the files and send again.', 4500)
  }, [showAttachmentStatus])

  const remainingImageSlots = useCallback(() => (
    Math.max(0, CHAT_IMAGE_LIMIT - imagesRef.current.length - pendingImageReadsRef.current)
  ), [])

  const remainingContextFileSlots = useCallback(() => (
    Math.max(0, CHAT_CONTEXT_FILE_LIMIT - contextFilesRef.current.length - pendingContextFileReadsRef.current)
  ), [])

  const appendDemoChatTurn = useCallback((
    text: string,
    imgs: string[] = [],
    files: ChatContextFileAttachment[] = [],
  ) => {
    const userMsg: ChatMessage = {
      id: `demo-u-${Date.now()}`,
      role: 'user',
      text,
      images: imgs.length > 0 ? [...imgs] : undefined,
      contextFiles: files.length > 0 ? [...files] : undefined,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    imagesRef.current = []
    contextFilesRef.current = []
    setImages([])
    setContextFiles([])
    safeSessionStorageRemoveItem(draftStorageKeys.text)
    safeSessionStorageRemoveItem(draftStorageKeys.images)
    safeSessionStorageRemoveItem(draftStorageKeys.contextFiles)
    setIsTyping(true)
    setTimeout(() => {
      const reply: ChatMessage = {
        id: `demo-a-${Date.now()}`,
        role: 'assistant',
        text: 'This is demo mode \u2014 connect Hermes Agent in **Settings > Connections** to chat with a real AI agent. Your messages will be sent to your self-hosted agent gateway.',
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, reply])
      setIsTyping(false)
    }, 1500)
  }, [draftStorageKeys.contextFiles, draftStorageKeys.images, draftStorageKeys.text])

  const flushQueuedSendIfReady = useCallback(() => {
    if (pendingReadsRef.current !== 0 || !pendingSendRef.current) return
    if (pendingAttachmentReadFailedRef.current) {
      const queuedText = pendingTextRef.current
      pendingSendRef.current = false
      pendingTextRef.current = ''
      pendingAttachmentReadFailedRef.current = false
      setPendingQueuedSend(false)
      if (queuedText) {
        setInput(queuedText)
        safeSessionStorageSetItem(draftStorageKeys.text, queuedText)
      }
      showAttachmentReadFailureNotice()
      return
    }
    pendingSendRef.current = false
    setPendingQueuedSend(false)
    const textToSend = pendingTextRef.current
    const imageSnapshot = [...imagesRef.current]
    const fileSnapshot = [...contextFilesRef.current]
    imagesRef.current = []
    contextFilesRef.current = []
    setImages(imageSnapshot)
    setContextFiles(fileSnapshot)
    if (!textToSend.trim() && imageSnapshot.length === 0 && fileSnapshot.length === 0) {
      pendingTextRef.current = ''
      return
    }
    setTimeout(() => {
      if (_demo) {
        appendDemoChatTurn(textToSend, imageSnapshot, fileSnapshot)
      } else {
        _doSend(textToSend, imageSnapshot, fileSnapshot)
      }
    }, 0)
  }, [_demo, appendDemoChatTurn, draftStorageKeys.text, showAttachmentReadFailureNotice])

  const readImageFile = (file: File) => {
    if (remainingImageSlots() <= 0) {
      showImageLimitNotice()
      return
    }
    pendingReadsRef.current += 1
    pendingImageReadsRef.current += 1
    syncPendingAttachmentReads()
    const finishImageRead = () => {
      pendingReadsRef.current = Math.max(0, pendingReadsRef.current - 1)
      pendingImageReadsRef.current = Math.max(0, pendingImageReadsRef.current - 1)
      syncPendingAttachmentReads()
    }
    const reader = new FileReader()
    reader.onload = e => {
      const b64 = e.target?.result as string
      imagesRef.current = [...imagesRef.current, b64].slice(0, CHAT_IMAGE_LIMIT)
      finishImageRead()
      const currentImgs = [...imagesRef.current]

      try {
        const total = currentImgs.reduce((sum, s) => sum + s.length, 0)
        if (total <= 4 * 1024 * 1024) {
          safeSessionStorageSetItem(draftStorageKeys.images, JSON.stringify(currentImgs))
        } else {
          safeSessionStorageRemoveItem(draftStorageKeys.images)
        }
      } catch { /* ignore */ }

      setImages(currentImgs)
      flushQueuedSendIfReady()
    }
    reader.onerror = () => {
      pendingAttachmentReadFailedRef.current = true
      finishImageRead()
      if (pendingSendRef.current) {
        flushQueuedSendIfReady()
      } else {
        if (pendingReadsRef.current === 0) pendingAttachmentReadFailedRef.current = false
        showAttachmentReadFailureNotice()
      }
    }
    reader.readAsDataURL(file)
  }

  const readContextFile = (file: File) => {
    if (!isContextTextFile(file)) {
      showUnsupportedFileNotice()
      return
    }
    const identity = contextFileIdentity(file)
    if (
      pendingContextFileIdentitiesRef.current.has(identity)
      || contextFilesRef.current.some(existing => contextFileAttachmentIdentity(existing) === identity)
    ) {
      showDuplicateContextFileNotice()
      return
    }
    if (remainingContextFileSlots() <= 0) {
      showContextFileLimitNotice()
      return
    }
    pendingReadsRef.current += 1
    pendingContextFileReadsRef.current += 1
    pendingContextFileIdentitiesRef.current.add(identity)
    syncPendingAttachmentReads()
    const finishContextFileRead = () => {
      pendingReadsRef.current = Math.max(0, pendingReadsRef.current - 1)
      pendingContextFileReadsRef.current = Math.max(0, pendingContextFileReadsRef.current - 1)
      pendingContextFileIdentitiesRef.current.delete(identity)
      syncPendingAttachmentReads()
    }
    const reader = new FileReader()
    reader.onload = e => {
      const raw = String(e.target?.result ?? '')
      const content = raw.slice(0, CHAT_CONTEXT_FILE_MAX_CHARS)
      const attachment: ChatContextFileAttachment = {
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        path: normalizeContextFilePath(contextFilePath(file), file.name),
        mimeType: file.type || undefined,
        size: file.size,
        content,
        truncated: raw.length > content.length,
      }
      if (contextFilesRef.current.some(existing => contextFileAttachmentIdentity(existing) === identity)) {
        finishContextFileRead()
        flushQueuedSendIfReady()
        return
      }
      contextFilesRef.current = [...contextFilesRef.current, attachment].slice(0, CHAT_CONTEXT_FILE_LIMIT)
      saveContextFileDraft(contextFilesRef.current, draftStorageKeys)
      finishContextFileRead()
      setContextFiles([...contextFilesRef.current])
      flushQueuedSendIfReady()
    }
    reader.onerror = () => {
      pendingAttachmentReadFailedRef.current = true
      finishContextFileRead()
      if (pendingSendRef.current) {
        flushQueuedSendIfReady()
      } else {
        if (pendingReadsRef.current === 0) pendingAttachmentReadFailedRef.current = false
        showAttachmentReadFailureNotice()
      }
    }
    reader.readAsText(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(file => file.type.startsWith('image/'))
    const selected = files.slice(0, remainingImageSlots())
    selected.forEach(readImageFile)
    if (selected.length < files.length) showImageLimitNotice()
    e.target.value = ''
  }

  const handleContextFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const allFiles = Array.from(e.target.files || [])
    const files = allFiles.filter(isContextTextFile)
    const prioritizedFiles = prioritizeContextFiles(files)
    const generatedCount = files.length - prioritizedFiles.length
    const newFiles = filterNewContextFiles(prioritizedFiles, contextFilesRef.current)
    const duplicateCount = prioritizedFiles.length - newFiles.length
    const selected = newFiles.slice(0, remainingContextFileSlots())
    selected.forEach(readContextFile)
    if (selected.length < newFiles.length) showContextFileLimitNotice()
    else if (duplicateCount > 0) showDuplicateContextFileNotice(duplicateCount)
    else if (generatedCount > 0) showGeneratedContextFileNotice(generatedCount)
    if (files.length < allFiles.length) showUnsupportedFileNotice()
    e.target.value = ''
  }

  const appendContextFileAttachments = useCallback((attachments: ChatContextFileAttachment[]) => {
    const cleanAttachments = attachments
      .filter((file): file is ChatContextFileAttachment => Boolean(
        file
        && typeof file.id === 'string'
        && typeof file.name === 'string'
        && typeof file.content === 'string',
      ))
      .map((file) => ({
        ...file,
        path: normalizeContextFilePath(file.path, file.name),
        content: file.content.slice(0, CHAT_CONTEXT_FILE_MAX_CHARS),
        truncated: Boolean(file.truncated) || file.content.length > CHAT_CONTEXT_FILE_MAX_CHARS,
      }))
    const existing = contextFilesRef.current
    const existingIds = new Set(existing.map(contextFileAttachmentIdentity))
    let duplicateCount = 0
    const newAttachments = cleanAttachments.filter((file) => {
      const identity = contextFileAttachmentIdentity(file)
      if (existingIds.has(identity)) {
        duplicateCount += 1
        return false
      }
      existingIds.add(identity)
      return true
    })
    const selected = newAttachments.slice(0, remainingContextFileSlots())
    if (selected.length === 0) {
      if (newAttachments.length > 0) showContextFileLimitNotice()
      else if (duplicateCount > 0) showDuplicateContextFileNotice(duplicateCount)
      return
    }

    contextFilesRef.current = [...existing, ...selected].slice(0, CHAT_CONTEXT_FILE_LIMIT)
    saveContextFileDraft(contextFilesRef.current, draftStorageKeys)
    setContextFiles([...contextFilesRef.current])
    if (selected.length < newAttachments.length) showContextFileLimitNotice()
    else if (duplicateCount > 0) showDuplicateContextFileNotice(duplicateCount)
  }, [draftStorageKeys, remainingContextFileSlots, showContextFileLimitNotice, showDuplicateContextFileNotice])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    const files = Array.from(e.dataTransfer.files)
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    const textFiles = files.filter(f => !f.type.startsWith('image/') && isContextTextFile(f))
    const unsupportedFiles = files.length - imageFiles.length - textFiles.length
    const selectedImages = imageFiles.slice(0, remainingImageSlots())
    const prioritizedTextFiles = prioritizeContextFiles(textFiles)
    const generatedTextFileCount = textFiles.length - prioritizedTextFiles.length
    const newTextFiles = filterNewContextFiles(prioritizedTextFiles, contextFilesRef.current)
    const duplicateTextFileCount = prioritizedTextFiles.length - newTextFiles.length
    const selectedTextFiles = newTextFiles.slice(0, remainingContextFileSlots())
    selectedImages.forEach(readImageFile)
    selectedTextFiles.forEach(readContextFile)
    if (selectedImages.length < imageFiles.length) showImageLimitNotice()
    if (selectedTextFiles.length < newTextFiles.length) showContextFileLimitNotice()
    else if (duplicateTextFileCount > 0) showDuplicateContextFileNotice(duplicateTextFileCount)
    else if (generatedTextFileCount > 0) showGeneratedContextFileNotice(generatedTextFileCount)
    if (unsupportedFiles > 0) showUnsupportedFileNotice()
  }, [remainingContextFileSlots, remainingImageSlots, showContextFileLimitNotice, showImageLimitNotice, showDuplicateContextFileNotice, showGeneratedContextFileNotice, showUnsupportedFileNotice])

  const postChatRequest = useCallback(async (payload: unknown, signal: AbortSignal) => {
    const path = '/api/chat'
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const apiKey = getRequestApiKeyForPath(path)
    if (apiKey) headers['X-API-Key'] = apiKey

    const res = await fetch(`${getRequestBaseForPath(path)}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      let message = text
      try {
        const parsed = JSON.parse(text) as { error?: unknown; provider?: unknown }
        const errorText = typeof parsed.error === 'string' ? parsed.error : ''
        const providerText = typeof parsed.provider === 'string' ? parsed.provider : ''
        message = errorText && providerText
          ? `${providerText}: ${errorText}`
          : errorText || text
      } catch { /* keep raw response text */ }
      throw new Error(hermesChatErrorMessage(message || `HTTP ${res.status}`))
    }

    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      return res.json().catch(() => undefined)
    }
    return undefined
  }, [])

  // ── Send ──
  const send = () => {
    const text = input.trim()
    const currentImages = imagesRef.current
    const currentContextFiles = contextFilesRef.current
    if ((!text && currentImages.length === 0 && currentContextFiles.length === 0 && pendingReadsRef.current === 0) || sendingRef.current) return

    // ── Intercept slash commands ──
    if (isSlashCommand(text)) {
      const slashCommand = text.toLowerCase()
      setInput('')
      imagesRef.current = []
      contextFilesRef.current = []
      pendingSendRef.current = false
      setPendingQueuedSend(false)
      setImages([])
      setContextFiles([])
      safeSessionStorageRemoveItem(draftStorageKeys.text)
      safeSessionStorageRemoveItem(draftStorageKeys.images)
      safeSessionStorageRemoveItem(draftStorageKeys.contextFiles)
      setMessages([])
      setOptimistic([])

      if (slashCommand === '/clear') {
        setSystemMsg('\u2500\u2500 Chat view cleared \u2500\u2500')
        setTimeout(() => setSystemMsg(null), 3000)
        return
      }

      safeLocalStorageSetItem('session-start', Date.now().toString())
      setSystemMsg('\u2500\u2500 Starting fresh session\u2026 \u2500\u2500')
      if (providerIsModelBacked) {
        const sendModel = resolveModelId(model, modelsData?.models ?? []) || resolveStoredModelId(model, modelsData?.models ?? [])
        const payload = buildChatRequestPayload({
          text,
          images: [],
          model: sendModel,
          provider: resolvedProvider,
          providerIsModelBacked,
        })
        api.post('/api/chat', withSessionKey({ ...payload, newChat: options.newChat && !sessionKey, ...options.context }, sessionKey, sessionEnvironmentId)).catch((err) => {
          console.error('Slash command failed:', err)
          setSystemMsg(hermesChatErrorMessage(err))
          setTimeout(() => setSystemMsg(null), 4000)
        })
      }
      setTimeout(() => {
        setSystemMsg('\u2500\u2500 Session reset \u2500\u2500')
        setTimeout(() => setSystemMsg(null), 3000)
      }, 2500)
      return
    }

    // If attachments are still being read from disk/clipboard, queue the send
    if (pendingReadsRef.current > 0) {
      pendingSendRef.current = true
      setPendingQueuedSend(true)
      pendingTextRef.current = text
      setInput('')
      safeSessionStorageRemoveItem(draftStorageKeys.text)
      return
    }

    // ── Demo mode: add messages locally ──
    if (_demo) {
      appendDemoChatTurn(text, currentImages, currentContextFiles)
      return
    }

    imagesRef.current = []
    contextFilesRef.current = []
    _doSend(text, currentImages, currentContextFiles)
  }

  const _doSend = (
    text: string,
    imgs: string[],
    files: ChatContextFileAttachment[] = [],
    sendOptions: { clearComposer?: boolean } = {},
  ) => {
    const clearComposer = sendOptions.clearComposer ?? true
    const msgId = `opt-${Date.now()}-${Math.random()}`
    const controller = new AbortController()
    const sendId = `${msgId}-${Math.random().toString(36).slice(2, 6)}`
    activeSendIdRef.current = sendId
    activeSendControllerRef.current = controller
    activeOptimisticIdRef.current = msgId
    abortRequestedRef.current = false
    sendingRef.current = true
    setSending(true)
    const sendProvider = resolvedProvider
    const sendModel = resolveModelId(model, modelsData?.models ?? []) || resolveStoredModelId(model, modelsData?.models ?? [])
    const sendProviderIsModelBacked = providerIsModelBacked
    const sendContext = snapshotChatRequestContext(options.context)
    if (clearComposer) {
      setInput('')
      safeSessionStorageRemoveItem(draftStorageKeys.text)
      safeSessionStorageRemoveItem(draftStorageKeys.images)
      safeSessionStorageRemoveItem(draftStorageKeys.contextFiles)
      setImages([])
      setContextFiles([])
    }
    pendingSendRef.current = false
    setPendingQueuedSend(false)

    setOptimistic(prev => [...prev, {
      id: msgId,
      text,
      status: 'sending',
      images: imgs,
      contextFiles: files,
      provider: sendProvider,
      model: sendModel,
      providerIsModelBacked: sendProviderIsModelBacked,
      context: sendContext,
    }])
    const attachmentOccurrence = (optimisticAttachmentOccurrenceRef.current.get(text) ?? 0) + 1
    optimisticAttachmentOccurrenceRef.current.set(text, attachmentOccurrence)
    const sequencedAttachmentKey = optimisticAttachmentCacheKey(text, attachmentOccurrence)
    optimisticImageCacheRef.current.set(sequencedAttachmentKey, imgs)
    optimisticContextFileCacheRef.current.set(sequencedAttachmentKey, files)
    setTimeout(() => {
      optimisticImageCacheRef.current.delete(sequencedAttachmentKey)
      optimisticContextFileCacheRef.current.delete(sequencedAttachmentKey)
      if (optimisticImageCacheRef.current.get(text) === imgs) {
        optimisticImageCacheRef.current.delete(text)
      }
      if (optimisticContextFileCacheRef.current.get(text) === files) {
        optimisticContextFileCacheRef.current.delete(text)
      }
    }, 60000)
    if (imgs.length > 0) {
      optimisticImageCacheRef.current.set(text, imgs)
    }
    if (files.length > 0) {
      optimisticContextFileCacheRef.current.set(text, files)
    }

    const finalizeSendAccepted = () => {
      if (activeSendIdRef.current !== sendId) return
      if (abortRequestedRef.current) return

      setOptimistic(prev => prev.map(m => m.id === msgId ? { ...m, status: 'sent' } : m))
      setIsTyping(true)
      lastUserMsgTimeRef.current = Date.now()

      setTimeout(() => {
        if (activeSendIdRef.current !== sendId) return
        setOptimistic(prev => prev.map(m => m.id === msgId ? { ...m, status: 'permanent' } : m))
      }, 2500)

      setTimeout(() => {
        if (activeSendIdRef.current !== sendId) return
        setOptimistic(prev => prev.filter(m => m.id !== msgId))
      }, 30000)

      setTimeout(() => {
        if (activeSendIdRef.current !== sendId) return
        setIsTyping(false)
      }, 60000)
    }

    const systemPrompt = moduleBuilderSystemPromptForText(text)
    const liveContextPromise = captureLiveContext(text, sendContext).catch((err) => {
      console.warn('Failed to capture live app context:', err)
      showAttachmentStatus('Live app context could not be attached. Sending without current screen context.', 5000)
      return ''
    })

    liveContextPromise.then((liveContext) => {
      const payload = buildChatRequestPayload({
        text,
        images: imgs,
        contextFiles: files,
        model: sendModel,
        provider: sendProvider,
        providerIsModelBacked: sendProviderIsModelBacked,
        systemPrompt,
        liveContext,
      })

      return postChatRequest(withSessionKey({ ...payload, newChat: options.newChat && !sessionKey, ...sendContext }, sessionKey, sessionEnvironmentId), controller.signal)
    })
      .then((response: ChatSendResponse | undefined) => {
        if (controller.signal.aborted || abortRequestedRef.current) return
        const nextSessionKey = response?.sessionKey?.trim()
        const nextEnvironmentId = sessionEnvironmentFromResponse(response)
        if (nextSessionKey && nextSessionKey !== sessionKey) {
          if (nextEnvironmentId) {
            options.onSessionKey?.(nextSessionKey, { environmentId: nextEnvironmentId })
          } else {
            options.onSessionKey?.(nextSessionKey)
          }
        }
        if (nextSessionKey) {
          notifyChatSessionsChanged({ sessionKey: nextSessionKey, environmentId: nextEnvironmentId })
          queryClient.invalidateQueries({ queryKey: ['chat', 'history', nextSessionKey, nextEnvironmentId ?? sessionEnvironmentId ?? ''] })
        }
        const directReply = response?.reply?.trim()
        if (directReply) {
          const timestamp = new Date().toISOString()
          setMessages(prev => [...prev, {
            id: `direct-user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            role: 'user',
            text,
            images: imgs.length > 0 ? imgs : undefined,
            contextFiles: files.length > 0 ? files : undefined,
            timestamp,
            localOnly: !nextSessionKey,
          }, {
            id: `direct-assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            role: 'assistant',
            text: directReply,
            timestamp: new Date().toISOString(),
            localOnly: !nextSessionKey,
          }])
          setOptimistic(prev => prev.filter(m => m.id !== msgId))
          setIsTyping(false)
          setConnected(true)
        } else {
          finalizeSendAccepted()
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.gatewaySessions })
        sendingRef.current = false
        setSending(false)
      })
      .catch((err) => {
        if (controller.signal.aborted || abortRequestedRef.current) return
        sendingRef.current = false
        setSending(false)
        const message = hermesChatErrorMessage(err)
        setOptimistic(prev => prev.map(m => m.id === msgId ? { ...m, status: 'error', error: message } : m))
        setSystemMsg(message)
        setTimeout(() => {
          setSystemMsg(current => current === message ? null : current)
        }, 6000)
        console.error('Chat send failed:', err)
      })
      .finally(() => {
        if (activeSendControllerRef.current === controller) {
          activeSendControllerRef.current = null
        }
      })
  }

  const sendMessage = (
    text: string,
    imgs: string[] = [],
    files: ChatContextFileAttachment[] = [],
  ): boolean => {
    const trimmed = text.trim()
    if ((!trimmed && imgs.length === 0 && files.length === 0) || sendingRef.current) return false
    if (isSlashCommand(trimmed)) return false

    if (_demo) {
      appendDemoChatTurn(trimmed, imgs, files)
      return true
    }

    _doSend(trimmed, imgs, files, { clearComposer: false })
    return true
  }

  const stop = useCallback(() => {
    abortRequestedRef.current = true
    activeSendControllerRef.current?.abort()
    activeSendControllerRef.current = null
    sendingRef.current = false
    setSending(false)
    setIsTyping(false)
    const optimisticId = activeOptimisticIdRef.current
    if (optimisticId) {
      setOptimistic(prev => prev.map(m => m.id === optimisticId ? { ...m, status: 'cancelled' } : m))
    }
    if (providerIsModelBacked) {
      api.post('/api/chat/abort', {
        sessionKey: sessionKey || 'main',
        ...(sessionEnvironmentId ? { environmentId: sessionEnvironmentId } : {}),
      }).catch(err => {
        console.error('Chat abort failed:', err)
        showAttachmentStatus('Stop requested, but Hermes Agent did not confirm cancellation.', 5000)
      })
    }
  }, [providerIsModelBacked, sessionEnvironmentId, sessionKey, showAttachmentStatus])

  const retry = async (msg: OptimisticMsg) => {
    if (sendingRef.current) return

    const controller = new AbortController()
    const sendId = `retry-${msg.id}-${Math.random().toString(36).slice(2, 6)}`
    activeSendIdRef.current = sendId
    activeSendControllerRef.current = controller
    activeOptimisticIdRef.current = msg.id
    abortRequestedRef.current = false
    sendingRef.current = true
    setSending(true)
    setIsTyping(false)
    setOptimistic(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'sending', error: undefined } : m))
    const retryContext = snapshotChatRequestContext(msg.context) ?? snapshotChatRequestContext(options.context)
    try {
      const liveContext = await captureLiveContext(msg.text, retryContext).catch((err) => {
        console.warn('Failed to capture live app context:', err)
        showAttachmentStatus('Live app context could not be attached. Sending without current screen context.', 5000)
        return ''
      })
      if (controller.signal.aborted || abortRequestedRef.current || activeSendIdRef.current !== sendId) return
      const retryProvider = msg.provider || resolvedProvider
      const retryModel = resolveModelId(msg.model || model, modelsData?.models ?? [])
        || resolveStoredModelId(msg.model || model, modelsData?.models ?? [])
      const retryProviderIsModelBacked = msg.providerIsModelBacked ?? providerIsModelBacked
      const payload = buildChatRequestPayload({
        text: msg.text,
        images: msg.images || [],
        contextFiles: msg.contextFiles || [],
        model: retryModel,
        provider: retryProvider,
        providerIsModelBacked: retryProviderIsModelBacked,
        systemPrompt: moduleBuilderSystemPromptForText(msg.text),
        liveContext,
      })
      const response = await postChatRequest(
        withSessionKey({ ...payload, newChat: options.newChat && !sessionKey, ...retryContext }, sessionKey, sessionEnvironmentId),
        controller.signal,
      ) as ChatSendResponse | undefined
      if (controller.signal.aborted || abortRequestedRef.current || activeSendIdRef.current !== sendId) return
      const nextSessionKey = response?.sessionKey?.trim()
      const nextEnvironmentId = sessionEnvironmentFromResponse(response)
      if (nextSessionKey && nextSessionKey !== sessionKey) {
        if (nextEnvironmentId) {
          options.onSessionKey?.(nextSessionKey, { environmentId: nextEnvironmentId })
        } else {
          options.onSessionKey?.(nextSessionKey)
        }
      }
      if (nextSessionKey) {
        notifyChatSessionsChanged({ sessionKey: nextSessionKey, environmentId: nextEnvironmentId })
        queryClient.invalidateQueries({ queryKey: ['chat', 'history', nextSessionKey, nextEnvironmentId ?? sessionEnvironmentId ?? ''] })
      }
      const directReply = response?.reply?.trim()
      if (directReply) {
        const timestamp = new Date().toISOString()
        setMessages(prev => [...prev, {
          id: `direct-retry-user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: 'user',
          text: msg.text,
          images: msg.images?.length ? msg.images : undefined,
          contextFiles: msg.contextFiles?.length ? msg.contextFiles : undefined,
          timestamp,
          localOnly: !nextSessionKey,
        }, {
          id: `direct-retry-assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: 'assistant',
          text: directReply,
          timestamp: new Date().toISOString(),
          localOnly: !nextSessionKey,
        }])
        setOptimistic(prev => prev.filter(m => m.id !== msg.id))
        setIsTyping(false)
        setConnected(true)
      } else {
        setOptimistic(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'sent' } : m))
        setTimeout(() => setOptimistic(prev => prev.filter(m => m.id !== msg.id)), 2000)
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.gatewaySessions })
    } catch (err) {
      if (controller.signal.aborted || abortRequestedRef.current) {
        setOptimistic(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'cancelled' } : m))
        return
      }
      const message = hermesChatErrorMessage(err)
      setOptimistic(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'error', error: message } : m))
      setSystemMsg(message)
      setTimeout(() => {
        setSystemMsg(current => current === message ? null : current)
      }, 6000)
    } finally {
      if (activeSendIdRef.current === sendId) {
        activeSendIdRef.current = null
      }
      if (activeSendControllerRef.current === controller) {
        activeSendControllerRef.current = null
      }
      if (activeOptimisticIdRef.current === msg.id) {
        activeOptimisticIdRef.current = null
      }
      if (sendingRef.current && activeSendIdRef.current === null) {
        sendingRef.current = false
        setSending(false)
      }
    }
  }

  const retryHistoryLoad = () => {
    if (blank) {
      setMessages([])
      setMounted(true)
      return
    }
    setHistoryError(null)
    api.get<ChatHistoryResponse>(chatHistoryPath(sessionKey, sessionEnvironmentId))
      .then(d => {
        if (
          d.error === 'harness_not_configured'
          || d.error === 'hermes_not_configured'
        ) {
          setMounted(true)
          setNotConfigured(true)
          setConnected(false)
          setMessages([])
          return
        }
        const sessionStart = sessionKey ? null : safeLocalStorageGetItem('session-start')
        const startTime = sessionStart ? parseInt(sessionStart, 10) : 0
        let msgs = normalizeHistoryMessages(d.messages)
        if (startTime > 0) msgs = msgs.filter(m => new Date(m.timestamp).getTime() >= startTime)
        setMounted(true)
        setConnected(true)
        failCountRef.current = 0
        setNotConfigured(false)
        setHistoryError(null)
        setMessages(msgs)
      })
      .catch(err => setHistoryError(hermesChatErrorMessage(err)))
  }

  return {
    _demo,
    messages,
    input, setInput,
    images, setImages, imagesRef,
    contextFiles, setContextFiles, contextFilesRef,
    pendingAttachmentReads,
    pendingQueuedSend,
    cancelQueuedSend,
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
    provider: resolvedProvider, setProvider,
    providers,
    modelsData,
    visibleModels,
    wsConnected,
    historyIsError,
    bottomRef, scrollRef,
    optimisticImageCacheRef,
    optimisticContextFileCacheRef,
    draftTimerRef,
    draftStorageKeys,
    send,
    sendMessage,
    stop,
    retry,
    retryHistoryLoad,
    handleFileChange,
    handleContextFileChange,
    appendContextFileAttachments,
    showAttachmentStatus,
    onDrop,
  }
}
