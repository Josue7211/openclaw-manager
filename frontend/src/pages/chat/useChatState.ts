import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
import { useChatSocket, type WsMessage } from '@/lib/hooks/useChatSocket'
import { api, ApiError, getRequestApiKeyForPath, getRequestBaseForPath } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
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
import { buildModuleBuilderSystemPrompt } from './module-builder-prompt'

import { type ChatMessage, type OptimisticMsg, type ModelsResponse, cleanMessages, cleanText, isSlashCommand } from './types'

const MODULE_BUILDER_RE = /\b(openui|generative ui|module|modules|widget|widgets|dashboard card|dashboard widget|installable|primitive|primitives)\b/i

function shouldUseModuleBuilderPrompt(text: string): boolean {
  return MODULE_BUILDER_RE.test(text)
}

function chatHistoryPath(sessionKey: string | null): string {
  return sessionKey
    ? `/api/gateway/sessions/${encodeURIComponent(sessionKey)}/history?limit=500`
    : '/api/chat/history'
}

function withSessionKey<T extends Record<string, unknown>>(payload: T, sessionKey: string | null): T & { sessionKey?: string } {
  return sessionKey ? { ...payload, sessionKey } : payload
}

interface ChatHistoryItem {
  id?: string
  role?: string
  text?: string
  content?: string
  timestamp?: string | null
  images?: string[]
}

interface ChatHistoryResponse {
  messages?: ChatHistoryItem[]
  error?: string
}

interface ChatSendResponse {
  ok?: boolean
  sessionKey?: string | null
}

function normalizeHistoryMessages(items: ChatHistoryItem[] = []): ChatMessage[] {
  return items.flatMap((item, index) => {
    if (item.role !== 'user' && item.role !== 'assistant') return []
    const text = cleanText(String(item.text ?? item.content ?? ''))
    if (!text) return []
    return [{
      id: item.id || `${item.role}-${item.timestamp ?? 'no-time'}-${index}`,
      role: item.role,
      text,
      timestamp: item.timestamp || new Date(0).toISOString(),
      images: item.images,
    }]
  })
}

export function useChatState(
  sessionKey: string | null = null,
  options: { onSessionKey?: (key: string) => void } = {},
) {
  const queryClient = useQueryClient()
  const _demo = isDemoMode()
  const [messages, setMessages]   = useState<ChatMessage[]>(_demo ? DEMO_CHAT_MESSAGES : [])
  const [input, setInput]         = useState('')
  const [images, setImages]       = useState<string[]>([])
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
  const [primaryModel, setPrimaryModel] = useLocalStorageState(CHAT_PRIMARY_MODEL_STORAGE_KEY, '')
  const [favoriteModelIds, setFavoriteModelIds] = useLocalStorageState<string[]>(CHAT_FAVORITE_MODELS_STORAGE_KEY, [])
  const [favoriteModelsVersion, setFavoriteModelsVersion] = useLocalStorageState<number>(CHAT_FAVORITE_MODELS_VERSION_STORAGE_KEY, 0)
  const lastPostedModelRef = useRef('')
  // System prompt is now server-side only (security: prevents prompt injection from frontend)

  // Fetch available models from the configured harness backend
  const { data: modelsData } = useQuery<ModelsResponse>({
    queryKey: queryKeys.chatModels,
    queryFn: () => api.get<ModelsResponse>('/api/chat/models'),
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
      void api.patch('/api/harness/runtime-config', { favoriteModels: mergedFavorites }).catch(() => {})
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

    const defaultModel = resolvePreferredModelId(CHAT_DEFAULT_MODEL, modelsData.models)
    if (!defaultModel) return

    setModelLocal(defaultModel)
    setPrimaryModel(defaultModel)
    void api.patch<{ appliedChatModel?: boolean }>('/api/harness/runtime-config', {
      chatPrimaryModel: defaultModel,
    }).then((result) => {
      if (result?.appliedChatModel) {
        lastPostedModelRef.current = defaultModel
        return
      }
      return api.post('/api/chat/model', { model: defaultModel }).then(() => {
        lastPostedModelRef.current = defaultModel
      })
    }).catch(() => {
      lastPostedModelRef.current = ''
    })
  }, [favoriteModelsVersion, modelsData, setModelLocal, setPrimaryModel])

  const visibleModels = modelsData?.models?.length
    ? getChatFavoriteModels(modelsData.models, favoriteModelIds, model)
    : []

  // Keep the local picker on a valid model without blindly forcing server-side changes.
  // Server model changes are posted in a separate effect so we don't create drift loops.
  useEffect(() => {
    if (!modelsData?.models?.length) return

    const availableIds = modelsData.models.map(m => m.id)
    const isExactMatch = availableIds.includes(model)

    const preferredModel = resolvePreferredModelId(primaryModel, modelsData.models)
    const serverModel = resolvePreferredModelId(modelsData.currentModel, modelsData.models)
    const nextModel = isExactMatch
      ? model
      : preferredModel || serverModel || availableIds[0]

    if (!nextModel) return

    if (model !== nextModel) {
      setModelLocal(nextModel)
    }
  }, [modelsData, model, primaryModel, setModelLocal])

  useEffect(() => {
    if (!modelsData?.models?.length || !model) return
    if (!modelsData.models.some(candidate => candidate.id === model)) return

    if (modelsData.currentModel === model) {
      lastPostedModelRef.current = model
      return
    }

    if (lastPostedModelRef.current === model) return

    let cancelled = false
    api.post('/api/chat/model', { model })
      .then(() => {
        if (!cancelled) lastPostedModelRef.current = model
      })
      .catch(err => {
        if (!cancelled) {
          console.error('Failed to sync chat model:', err)
          lastPostedModelRef.current = ''
        }
      })

    return () => {
      cancelled = true
    }
  }, [model, modelsData])

  // When user switches model, call the API to actually change it
  const setModel = useCallback((newModel: string) => {
    setModelLocal(newModel)
    setPrimaryModel(newModel)
    lastPostedModelRef.current = newModel
    if (!_demo) {
      api.patch<{ appliedChatModel?: boolean }>('/api/harness/runtime-config', {
        chatPrimaryModel: newModel,
      }).then((result) => {
        if (result?.appliedChatModel) {
          return
        }
        return api.post('/api/chat/model', { model: newModel })
      }).catch(err => {
        console.error('Failed to set model:', err)
        lastPostedModelRef.current = ''
      })
    }
  }, [_demo, setModelLocal, setPrimaryModel])
  const sendingRef                = useRef(false)
  const failCountRef              = useRef(0)
  const lastUserMsgTimeRef        = useRef<number>(0)
  const bottomRef                 = useRef<HTMLDivElement>(null)
  const scrollRef                 = useRef<HTMLDivElement>(null)
  const pendingReadsRef           = useRef<number>(0)
  const pendingSendRef            = useRef<boolean>(false)
  const pendingTextRef            = useRef<string>('')
  const imagesRef                 = useRef<string[]>([])
  const draftTimerRef             = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeSendIdRef           = useRef<string | null>(null)
  const activeSendControllerRef   = useRef<AbortController | null>(null)
  const activeOptimisticIdRef     = useRef<string | null>(null)
  const abortRequestedRef         = useRef(false)

  useEffect(() => {
    if (_demo) return
    setMessages([])
    setOptimistic([])
    setIsTyping(false)
    setSystemMsg(null)
    setHistoryError(null)
    setMounted(false)
  }, [_demo, sessionKey])

  // ── Keep imagesRef in sync with committed images state ──
  useEffect(() => { imagesRef.current = images }, [images])

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
    const draft = sessionStorage.getItem('chat-draft')
    if (draft) setInput(draft)
    try {
      const saved = sessionStorage.getItem('chat-draft-images')
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        if (Array.isArray(parsed) && parsed.length > 0) { imagesRef.current = parsed; setImages(() => parsed) }
      }
    } catch { /* ignore */ }
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    }
  }, [])

  // ── WebSocket + polling fallback ──
  const optimisticImageCacheRef = useRef<Map<string, string[]>>(new Map())
  const backoffRef = useRef(5000)

  // Helper: reconcile an array of incoming messages into state
  const reconcileMessages = useCallback((incoming: ChatMessage[], mode: 'append' | 'replace' = 'append') => {
    if (mode === 'replace') {
      setMessages(incoming)
    } else {
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id))
        const newMsgs = incoming.filter(m => !existingIds.has(m.id))
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
    const cleaned = cleanMessages([msg as ChatMessage])
    const sessionStart = sessionKey ? null : localStorage.getItem('session-start')
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
  }, [mounted, reconcileMessages, sessionKey])

  const { connected: wsConnected, usingFallback } = useChatSocket({
    onMessage: onWsMessage,
    onStatusChange: (status) => {
      if (status) {
        setConnected(true)
        setHistoryError(null)
      }
    },
    enabled: !_demo,
    sessionKey,
  })

  // -- Polling fallback: only active when WebSocket is unavailable --
  const { data: historyData, dataUpdatedAt, isError: historyIsError, error: historyQueryError } = useQuery<ChatHistoryResponse>({
    queryKey: sessionKey ? ['chat', 'history', sessionKey] : queryKeys.chatHistory,
    queryFn: () => api.get<ChatHistoryResponse>(chatHistoryPath(sessionKey)),
    enabled: !_demo,
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
        setHistoryError(label)
      }
    }
  }, [historyIsError, historyQueryError, notConfigured, wsConnected])

  // ── Reconcile incoming history (initial load + polling fallback) ──
  useEffect(() => {
    if (!historyData) return
    if (!mounted) setMounted(true)

    if (
      historyData.error === 'harness_not_configured'
      || historyData.error === 'hermes_not_configured'
      || historyData.error === 'openclaw_not_configured'
    ) {
      setNotConfigured(true)
      setConnected(false)
      return
    }

    let incoming = normalizeHistoryMessages(historyData.messages)
    const sessionStart = sessionKey ? null : localStorage.getItem('session-start')
    if (sessionStart) {
      const startTime = parseInt(sessionStart, 10)
      incoming = incoming.filter(m => new Date(m.timestamp).getTime() >= startTime)
    }

    setConnected(true)
    failCountRef.current = 0
    setNotConfigured(false)
    setHistoryError(null)

    reconcileMessages(incoming, 'replace')
  }, [historyData, dataUpdatedAt, reconcileMessages, sessionKey])

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
      imagesRef.current = [...imagesRef.current, b64]
      pendingReadsRef.current -= 1
      const isLast = pendingReadsRef.current === 0
      const currentImgs = [...imagesRef.current]

      try {
        const total = currentImgs.reduce((sum, s) => sum + s.length, 0)
        if (total <= 4 * 1024 * 1024) sessionStorage.setItem('chat-draft-images', JSON.stringify(currentImgs))
      } catch { /* ignore */ }

      if (isLast && pendingSendRef.current) {
        pendingSendRef.current = false
        const textToSend = pendingTextRef.current
        imagesRef.current = []
        setImages(currentImgs)
        setTimeout(() => _doSend(textToSend, currentImgs), 0)
      } else {
        setImages(currentImgs)
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
      throw new Error(text || `HTTP ${res.status}`)
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
    if ((!text && currentImages.length === 0 && pendingReadsRef.current === 0) || sendingRef.current) return

    // ── Demo mode: add messages locally ──
    if (_demo) {
      const userMsg: ChatMessage = { id: `demo-u-${Date.now()}`, role: 'user', text, timestamp: new Date().toISOString() }
      setMessages(prev => [...prev, userMsg])
      setInput('')
      setIsTyping(true)
      setTimeout(() => {
        const reply: ChatMessage = {
          id: `demo-a-${Date.now()}`,
          role: 'assistant',
          text: 'This is demo mode \u2014 connect a harness backend in **Settings > Connections** to chat with a real AI agent. Your messages will be sent to your self-hosted AI gateway.',
          timestamp: new Date().toISOString(),
        }
        setMessages(prev => [...prev, reply])
        setIsTyping(false)
      }, 1500)
      return
    }

    // ── Intercept slash commands ──
    if (isSlashCommand(text)) {
      setInput('')
      sessionStorage.removeItem('chat-draft')
      localStorage.setItem('session-start', Date.now().toString())
      setSystemMsg('\u2500\u2500 Starting fresh session\u2026 \u2500\u2500')
      setMessages([])
      setOptimistic([])
      api.post('/api/chat', withSessionKey({ text, images: [], model }, sessionKey)).catch((err) => {
        console.error('Slash command failed:', err)
        setSystemMsg('Failed to send command \u2014 try again')
        setTimeout(() => setSystemMsg(null), 4000)
      })
      setTimeout(() => {
        setSystemMsg('\u2500\u2500 Session reset \u2500\u2500')
        setTimeout(() => setSystemMsg(null), 3000)
      }, 2500)
      return
    }

    // If images are still being read from disk/clipboard, queue the send
    if (pendingReadsRef.current > 0) {
      pendingSendRef.current = true
      pendingTextRef.current = text
      setInput('')
      sessionStorage.removeItem('chat-draft')
      return
    }

    imagesRef.current = []
    _doSend(text, currentImages)
  }

  const _doSend = (text: string, imgs: string[]) => {
    const msgId = `opt-${Date.now()}-${Math.random()}`
    const controller = new AbortController()
    const sendId = `${msgId}-${Math.random().toString(36).slice(2, 6)}`
    activeSendIdRef.current = sendId
    activeSendControllerRef.current = controller
    activeOptimisticIdRef.current = msgId
    abortRequestedRef.current = false
    sendingRef.current = true
    setSending(true)
    setInput('')
    sessionStorage.removeItem('chat-draft')
    sessionStorage.removeItem('chat-draft-images')
    setImages([])
    pendingSendRef.current = false

    setOptimistic(prev => [...prev, { id: msgId, text, status: 'sending', images: imgs }])
    if (imgs.length > 0) {
      optimisticImageCacheRef.current.set(text, imgs)
      setTimeout(() => optimisticImageCacheRef.current.delete(text), 60000)
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

    const builderMode = shouldUseModuleBuilderPrompt(text)
    const payload = builderMode
      ? {
          text,
          images: imgs,
          model,
          system_prompt: buildModuleBuilderSystemPrompt(),
        }
      : { text, images: imgs, model }

    postChatRequest(withSessionKey(payload, sessionKey), controller.signal)
      .then((response: ChatSendResponse | undefined) => {
        if (controller.signal.aborted || abortRequestedRef.current) return
        const nextSessionKey = response?.sessionKey?.trim()
        if (nextSessionKey && !sessionKey) {
          options.onSessionKey?.(nextSessionKey)
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.gatewaySessions })
        sendingRef.current = false
        setSending(false)
        finalizeSendAccepted()
      })
      .catch((err) => {
        if (controller.signal.aborted || abortRequestedRef.current) return
        sendingRef.current = false
        setSending(false)
        setOptimistic(prev => prev.map(m => m.id === msgId ? { ...m, status: 'error' } : m))
        console.error('Chat send failed:', err)
      })
      .finally(() => {
        if (activeSendControllerRef.current === controller) {
          activeSendControllerRef.current = null
        }
      })
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
      setOptimistic(prev => prev.map(m => m.id === optimisticId ? { ...m, status: 'sent' } : m))
    }
    api.post('/api/chat/abort', { sessionKey: sessionKey || 'main' }).catch(err => {
      console.error('Chat abort failed:', err)
    })
  }, [sessionKey])

  const retry = async (msg: OptimisticMsg) => {
    setOptimistic(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'sending' } : m))
    try {
      await api.post('/api/chat', withSessionKey({ text: msg.text, images: msg.images || [], model }, sessionKey))
      queryClient.invalidateQueries({ queryKey: queryKeys.gatewaySessions })
      setOptimistic(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'sent' } : m))
      setTimeout(() => setOptimistic(prev => prev.filter(m => m.id !== msg.id)), 2000)
    } catch {
      setOptimistic(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'error' } : m))
    }
  }

  const retryHistoryLoad = () => {
    setHistoryError(null)
    api.get<ChatHistoryResponse>(chatHistoryPath(sessionKey))
      .then(d => {
        const sessionStart = sessionKey ? null : localStorage.getItem('session-start')
        const startTime = sessionStart ? parseInt(sessionStart, 10) : 0
        let msgs = normalizeHistoryMessages(d.messages)
        if (startTime > 0) msgs = msgs.filter(m => new Date(m.timestamp).getTime() >= startTime)
        setMessages(msgs)
      })
      .catch(err => setHistoryError(err instanceof Error ? err.message : 'Failed to load chat history'))
  }

  return {
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
  }
}
