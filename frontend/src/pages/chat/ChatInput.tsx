import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ClipboardText,
  ClockCounterClockwise,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  PaperPlaneTilt,
  Square,
  X,
} from '@phosphor-icons/react'
import ProviderModelSelector from '@/vendor/t3/providers/ProviderModelSelector'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { CHAT_SLASH_COMMANDS } from './types'
import type { ChatContextFileAttachment, ChatProviderOption, ModelOption } from './types'
import {
  CHAT_CONTEXT_FILE_LIMIT,
  CHAT_IMAGE_LIMIT,
  type ChatComposerDraftStorageKeys,
} from './constants'

export interface ChatInputHistoryEntry {
  text: string
  images?: string[]
  contextFiles?: ChatContextFileAttachment[]
}

interface ChatInputProps {
  input: string
  setInput: (v: string) => void
  images: string[]
  setImages: React.Dispatch<React.SetStateAction<string[]>>
  imagesRef: React.RefObject<string[]>
  contextFiles: ChatContextFileAttachment[]
  setContextFiles: React.Dispatch<React.SetStateAction<ChatContextFileAttachment[]>>
  contextFilesRef: React.RefObject<ChatContextFileAttachment[]>
  pendingAttachmentReads?: number
  attachmentReadsBlockSend?: boolean
  pendingQueuedSend?: boolean
  onCancelQueuedSend?: () => void
  sending: boolean
  onSend: () => void
  onStop: () => void
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onContextFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDrop: (e: React.DragEvent) => void
  draftTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>
  contextBar?: ReactNode
  providerLabel?: string
  sendDisabledReason?: string | null
  sendDisabledActionLabel?: string
  onSendDisabledAction?: () => void
  onBrowseImages?: () => void
  onBrowseContextFiles?: () => void
  onBrowseContextFolder?: () => void
  promptHistory?: ChatInputHistoryEntry[]
  focusSignal?: number
  draftStorageKeys: ChatComposerDraftStorageKeys
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

function contextFilesClipboardText(files: ChatContextFileAttachment[]): string {
  return files.map(contextFileClipboardText).join('\n\n---\n\n')
}

function promptHistoryPreview(entry: ChatInputHistoryEntry): string {
  const text = entry.text.trim()
  if (text) return text.length > 96 ? `${text.slice(0, 93)}...` : text
  const imageCount = entry.images?.length ?? 0
  const fileCount = entry.contextFiles?.length ?? 0
  if (imageCount && fileCount) return `${imageCount} image${imageCount === 1 ? '' : 's'} and ${fileCount} file${fileCount === 1 ? '' : 's'}`
  if (imageCount) return `${imageCount} image${imageCount === 1 ? '' : 's'}`
  if (fileCount) return `${fileCount} file${fileCount === 1 ? '' : 's'}`
  return 'Empty prompt'
}

function promptHistoryMeta(entry: ChatInputHistoryEntry): string {
  const parts: string[] = []
  const imageCount = entry.images?.length ?? 0
  const fileCount = entry.contextFiles?.length ?? 0
  if (imageCount > 0) parts.push(`${imageCount} image${imageCount === 1 ? '' : 's'}`)
  if (fileCount > 0) parts.push(`${fileCount} file${fileCount === 1 ? '' : 's'}`)
  return parts.join(' + ')
}

function hermesOnlyProviderOptions(providers: ChatProviderOption[]): ChatProviderOption[] {
  const hermes = providers.find(candidate => candidate.id === 'hermes')
  const normalizedHermes = hermes
    ? {
        ...hermes,
        name: hermes.name.trim() && hermes.name.trim() !== 'Hermes'
          ? hermes.name
          : 'Hermes Agent',
        description: hermes.description?.trim() || 'Hermes Agent workspace chat',
      }
    : null
  return [
    normalizedHermes ?? {
      id: 'hermes',
      name: 'Hermes Agent',
      description: 'Hermes Agent workspace chat',
      local: false,
      modelBacked: true,
      available: true,
    },
  ]
}

function activeAgentDisplayLabel(label?: string): string | undefined {
  const trimmed = label?.trim()
  if (!trimmed) return undefined
  if (/^(?:hermes|harness|codex\s*lb|claude\s*code|codex\s*cli|openclaw)$/i.test(trimmed)) {
    return 'Hermes Agent'
  }
  return trimmed
}

function removeComposerDraftItem(key: string) {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // Ignore storage access failures.
  }
}

function replaceComposerDraftItem(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    removeComposerDraftItem(key)
  }
}

function replaceComposerDraftJson(key: string, value: unknown) {
  try {
    replaceComposerDraftItem(key, JSON.stringify(value))
  } catch {
    removeComposerDraftItem(key)
  }
}

function persistComposerSnapshot(
  text: string,
  images: string[],
  contextFiles: ChatContextFileAttachment[],
  draftStorageKeys: ChatComposerDraftStorageKeys,
) {
  replaceComposerDraftItem(draftStorageKeys.text, text)
  if (images.length > 0) replaceComposerDraftJson(draftStorageKeys.images, images)
  else removeComposerDraftItem(draftStorageKeys.images)
  if (contextFiles.length > 0) replaceComposerDraftJson(draftStorageKeys.contextFiles, contextFiles)
  else removeComposerDraftItem(draftStorageKeys.contextFiles)
}

/** Top bar: model selector + connection status */
function ChatInputHeader({
  model, setModel, models, provider, setProvider, providers, agentLabel,
  connected, wsConnected, historyIsError, isDemo,
}: {
  model: string; setModel: (v: string) => void; models: ModelOption[]
  provider: string; setProvider: (v: string) => void; providers: ChatProviderOption[]
  agentLabel?: string
  connected: boolean; wsConnected: boolean; historyIsError: boolean; isDemo: boolean
}) {
  const hermesProviders = hermesOnlyProviderOptions(providers)
  const activeProvider = hermesProviders.some(candidate => candidate.id === provider) ? provider : 'hermes'
  const activeAgentLabel = activeAgentDisplayLabel(agentLabel)
  const setHermesProvider = (nextProvider: string) => {
    if (nextProvider === 'hermes') setProvider(nextProvider)
  }

  return (
    <div className="chat-input-header-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
      {activeAgentLabel && (
        <div
          className="chat-input-agent-label"
          aria-label="Active agent"
          style={{
            background: 'var(--hover-bg)',
            border: '1px solid var(--border)',
            borderRadius: '999px',
            color: 'var(--text-muted)',
            height: '30px',
            fontSize: '11px',
            fontFamily: 'monospace',
            padding: '0 10px',
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {activeAgentLabel}
        </div>
      )}
      <ProviderModelSelector
        provider={activeProvider}
        providers={hermesProviders}
        onProviderChange={setHermesProvider}
        model={model}
        models={models}
        onModelChange={setModel}
      />

      <div aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: '6px', height: 30 }}>
        <div style={{
          width: '7px', height: '7px', borderRadius: '50%',
          background: connected ? 'var(--secondary)' : 'var(--red)',
          boxShadow: connected ? '0 0 6px var(--secondary)' : 'none',
        }} />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {isDemo
            ? 'demo'
            : connected
              ? (wsConnected ? 'live' : 'polling')
              : historyIsError ? 'chat unavailable' : 'reconnecting\u2026'}
        </span>
      </div>
    </div>
  )
}

/** Bottom bar: image previews + text input */
function ChatInputBox({
  input, setInput, images, setImages, imagesRef, contextFiles, setContextFiles, contextFilesRef, sending,
  onSend, onStop, onFileChange, onContextFileChange, onDrop, draftTimerRef, contextBar, providerLabel, sendDisabledReason,
  sendDisabledActionLabel, onSendDisabledAction, pendingAttachmentReads = 0, attachmentReadsBlockSend = false,
  pendingQueuedSend = false, onCancelQueuedSend,
  onBrowseImages, onBrowseContextFiles, onBrowseContextFolder,
  promptHistory = [],
  focusSignal = 0,
  draftStorageKeys,
}: ChatInputProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const contextFileRef = useRef<HTMLInputElement>(null)
  const contextFolderRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const historyMenuRef = useRef<HTMLDivElement>(null)
  const [activeSlashIndex, setActiveSlashIndex] = useState(0)
  const [draggingOver, setDraggingOver] = useState(false)
  const [dismissedSlashQuery, setDismissedSlashQuery] = useState('')
  const [historyCursor, setHistoryCursor] = useState<number | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const draftBeforeHistoryRef = useRef<ChatInputHistoryEntry | null>(null)
  const {
    copyToClipboard,
    copiedContext,
    errorContext,
  } = useCopyToClipboard<{ id: string; label: string }>()
  const [previewFileId, setPreviewFileId] = useState<string | null>(null)
  const copiedId = copiedContext?.id ?? ''
  const copyErrorId = errorContext?.id ?? ''
  const copyStatusLabel = copiedContext?.label
    ? `Copied ${copiedContext.label}.`
    : errorContext?.label
      ? `Could not copy ${errorContext.label}.`
      : ''
  const previewFile = contextFiles.find((file, index) => (file.id || `${file.name}-${index}`) === previewFileId) ?? null
  const previewFileCopyId = previewFile ? `composer-preview-file:${previewFile.id || previewFile.name}` : ''
  const previewFileCopied = Boolean(previewFileCopyId && copiedId === previewFileCopyId)
  const previewFileCopyErrored = Boolean(previewFileCopyId && copyErrorId === previewFileCopyId)
  const allContextFilesCopyId = 'composer-context-files:all'
  const allContextFilesCopied = copiedId === allContextFilesCopyId
  const allContextFilesCopyErrored = copyErrorId === allContextFilesCopyId

  useEffect(() => {
    if (!previewFileId) return
    const closePreviewOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewFileId(null)
    }
    window.addEventListener('keydown', closePreviewOnEscape)
    return () => window.removeEventListener('keydown', closePreviewOnEscape)
  }, [previewFileId])

  useEffect(() => {
    if (!historyOpen) return
    const closeHistoryOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHistoryOpen(false)
    }
    window.addEventListener('keydown', closeHistoryOnEscape)
    return () => window.removeEventListener('keydown', closeHistoryOnEscape)
  }, [historyOpen])

  useEffect(() => {
    if (!historyOpen) return
    requestAnimationFrame(() => {
      const items = Array.from(historyMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
      const target = items[Math.max(0, historyCursor ?? 0)] ?? items[0]
      target?.focus()
    })
  }, [historyCursor, historyOpen])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }, [input])

  useEffect(() => {
    if (!focusSignal) return
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.focus()
    const end = textarea.value.length
    textarea.setSelectionRange(end, end)
  }, [focusSignal])

  useEffect(() => {
    const input = contextFolderRef.current
    if (!input) return
    input.setAttribute('webkitdirectory', '')
    input.setAttribute('directory', '')
  }, [])

  useEffect(() => {
    if (!sending || previewFileId || historyOpen) return
    const stopOnEscape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape') return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('[role="dialog"],[role="menu"],[data-chat-provider-model-picker]')) return
      event.preventDefault()
      onStop()
    }
    window.addEventListener('keydown', stopOnEscape)
    return () => window.removeEventListener('keydown', stopOnEscape)
  }, [historyOpen, onStop, previewFileId, sending])

  const imageLimitReached = images.length >= CHAT_IMAGE_LIMIT
  const contextFileLimitReached = contextFiles.length >= CHAT_CONTEXT_FILE_LIMIT
  const hasPromptHistory = promptHistory.length > 0
  const slashQuery = input.trimStart().startsWith('/') && !input.includes('\n')
    ? input.trim().toLowerCase()
    : ''
  const slashCommands = slashQuery && slashQuery !== dismissedSlashQuery
    ? CHAT_SLASH_COMMANDS.filter(command => (
        command.command.startsWith(slashQuery)
        || command.label.toLowerCase().includes(slashQuery.slice(1))
      ))
    : []
  const activeSlashCommand = slashCommands[activeSlashIndex] ?? slashCommands[0]
  const exactSlashCommand = Boolean(
    slashQuery && CHAT_SLASH_COMMANDS.some(command => command.command === slashQuery),
  )
  const effectiveSendDisabledReason = exactSlashCommand ? null : sendDisabledReason
  const hasPendingAttachmentReads = pendingAttachmentReads > 0
  const attachmentReadsBlockingSend = attachmentReadsBlockSend && hasPendingAttachmentReads
  const hasComposerAttachments = images.length > 0 || contextFiles.length > 0
  const attachmentControlsDisabled = pendingQueuedSend || attachmentReadsBlockingSend
  const attachmentControlsDisabledTitle = pendingQueuedSend
    ? 'Queued send is waiting for attachments'
    : attachmentReadsBlockingSend
      ? 'Reading selected attachments'
      : ''
  const canSendContent = !!input.trim() || images.length > 0 || contextFiles.length > 0 || hasPendingAttachmentReads
  const canSend = canSendContent && !effectiveSendDisabledReason && !pendingQueuedSend && !attachmentReadsBlockingSend
  const sendTitle = effectiveSendDisabledReason
    || (pendingQueuedSend
      ? 'Queued; sending after attachments finish reading'
      : attachmentReadsBlockingSend
        ? 'Reading selected context before sending'
        : hasPendingAttachmentReads ? 'Send after attachments finish reading' : 'Send')
  const sendButtonLabel = canSend
    ? 'Send message'
    : effectiveSendDisabledReason
      ? `Send unavailable: ${effectiveSendDisabledReason}`
      : pendingQueuedSend
        ? 'Send queued until attachments finish reading'
        : attachmentReadsBlockingSend
          ? 'Send unavailable while attachments are reading'
          : 'Send message unavailable'
  const selectSlashCommand = (command: string) => {
    setInput(command)
    setDismissedSlashQuery('')
    replaceComposerDraftItem(draftStorageKeys.text, command)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }
  const persistContextFileDraft = (files: ChatContextFileAttachment[]) => {
    if (files.length === 0) {
      removeComposerDraftItem(draftStorageKeys.contextFiles)
      return
    }
    replaceComposerDraftJson(draftStorageKeys.contextFiles, files)
  }
  const clearComposerAttachments = () => {
    setImages([])
    imagesRef.current = []
    setContextFiles([])
    contextFilesRef.current = []
    setPreviewFileId(null)
    removeComposerDraftItem(draftStorageKeys.images)
    removeComposerDraftItem(draftStorageKeys.contextFiles)
  }
  const useNativeContextPicker = Boolean(window.__TAURI_INTERNALS__)
  const openImagePicker = () => {
    if (useNativeContextPicker && onBrowseImages) {
      onBrowseImages()
      return
    }
    fileRef.current?.click()
  }
  const openContextFilePicker = () => {
    if (useNativeContextPicker && onBrowseContextFiles) {
      onBrowseContextFiles()
      return
    }
    contextFileRef.current?.click()
  }
  const openContextFolderPicker = () => {
    if (useNativeContextPicker && onBrowseContextFolder) {
      onBrowseContextFolder()
      return
    }
    contextFolderRef.current?.click()
  }
  const restorePromptHistoryEntry = (entry: ChatInputHistoryEntry) => {
    const nextText = entry.text
    const nextImages = [...(entry.images ?? [])]
    const nextContextFiles = [...(entry.contextFiles ?? [])]
    setInput(nextText)
    setImages(nextImages)
    imagesRef.current = nextImages
    setContextFiles(nextContextFiles)
    contextFilesRef.current = nextContextFiles
    persistComposerSnapshot(nextText, nextImages, nextContextFiles, draftStorageKeys)
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      const end = textarea.value.length
      textarea.setSelectionRange(end, end)
    })
  }
  const restorePromptHistoryDraft = () => {
    const draft = draftBeforeHistoryRef.current ?? { text: input, images, contextFiles }
    draftBeforeHistoryRef.current = null
    setHistoryCursor(null)
    restorePromptHistoryEntry(draft)
  }
  const recallPromptHistory = (direction: 'older' | 'newer'): boolean => {
    if (promptHistory.length === 0) return false
    if (direction === 'newer') {
      if (historyCursor === null) return false
      if (historyCursor <= 0) {
        restorePromptHistoryDraft()
        return true
      }
      const nextCursor = historyCursor - 1
      setHistoryCursor(nextCursor)
      restorePromptHistoryEntry(promptHistory[nextCursor])
      return true
    }

    if (historyCursor === null && (input.trim() || images.length > 0 || contextFiles.length > 0)) return false
    const nextCursor = historyCursor === null
      ? 0
      : Math.min(promptHistory.length - 1, historyCursor + 1)
    if (historyCursor === null) {
      draftBeforeHistoryRef.current = {
        text: input,
        images: [...images],
        contextFiles: [...contextFiles],
      }
    }
    setHistoryCursor(nextCursor)
    restorePromptHistoryEntry(promptHistory[nextCursor])
    return true
  }
  const restorePromptHistoryFromMenu = (entry: ChatInputHistoryEntry, index: number) => {
    if (!draftBeforeHistoryRef.current) {
      draftBeforeHistoryRef.current = {
        text: input,
        images: [...images],
        contextFiles: [...contextFiles],
      }
    }
    setHistoryCursor(index)
    setHistoryOpen(false)
    restorePromptHistoryEntry(entry)
  }
  const closePromptHistoryMenu = () => {
    setHistoryOpen(false)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }
  const onPromptHistoryMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closePromptHistoryMenu()
      return
    }

    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = Array.from(historyMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    if (items.length === 0) return

    event.preventDefault()
    const currentIndex = items.findIndex(item => item === document.activeElement)
    if (event.key === 'Home') {
      items[0]?.focus()
      return
    }
    if (event.key === 'End') {
      items[items.length - 1]?.focus()
      return
    }
    const direction = event.key === 'ArrowDown' ? 1 : -1
    const fallbackIndex = direction > 0 ? -1 : 0
    const nextIndex = (currentIndex === -1 ? fallbackIndex : currentIndex) + direction
    items[(nextIndex + items.length) % items.length]?.focus()
  }

  useEffect(() => {
    if (!slashQuery && dismissedSlashQuery) setDismissedSlashQuery('')
    setActiveSlashIndex(current => (
      slashCommands.length === 0
        ? 0
        : Math.min(current, slashCommands.length - 1)
    ))
  }, [dismissedSlashQuery, slashCommands.length, slashQuery])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    if (slashCommands.length > 0) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setDismissedSlashQuery(slashQuery)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveSlashIndex(current => (current + 1) % slashCommands.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveSlashIndex(current => (current - 1 + slashCommands.length) % slashCommands.length)
        return
      }
      if (e.key === 'Tab' && activeSlashCommand) {
        e.preventDefault()
        selectSlashCommand(activeSlashCommand.command)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey && activeSlashCommand && slashQuery !== activeSlashCommand.command) {
        e.preventDefault()
        selectSlashCommand(activeSlashCommand.command)
        return
      }
    }
    if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (e.key === 'ArrowUp' && recallPromptHistory('older')) {
        e.preventDefault()
        return
      }
      if (e.key === 'ArrowDown' && recallPromptHistory('newer')) {
        e.preventDefault()
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (canSend) onSend()
    }
  }

  return (
    <div
      className="chat-input-dropzone"
      data-testid="chat-input-dropzone"
      data-chat-composer="true"
      data-dragging={draggingOver ? 'true' : 'false'}
      onDrop={e => {
        setDraggingOver(false)
        if (attachmentControlsDisabled) {
          e.preventDefault()
          return
        }
        onDrop(e)
      }}
      onDragEnter={e => {
        e.preventDefault()
        if (!attachmentControlsDisabled) setDraggingOver(true)
      }}
      onDragLeave={e => {
        const relatedTarget = e.relatedTarget as Node | null
        if (relatedTarget && e.currentTarget.contains(relatedTarget)) return
        setDraggingOver(false)
      }}
      onDragOver={e => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      style={{ flexShrink: 0 }}
    >
      {/* Image previews */}
      {(hasComposerAttachments || hasPendingAttachmentReads) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {images.length > 0 && (
                <div aria-live="polite" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {images.length}/{CHAT_IMAGE_LIMIT} images attached
                </div>
              )}
              {contextFiles.length > 0 && (
                <div aria-live="polite" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {contextFiles.length}/{CHAT_CONTEXT_FILE_LIMIT} context files attached
                </div>
              )}
              {hasPendingAttachmentReads && (
                <div role="status" aria-live="polite" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {pendingQueuedSend ? 'Queued send; reading ' : 'Reading '}
                  {pendingAttachmentReads} attachment{pendingAttachmentReads === 1 ? '' : 's'}...
                </div>
              )}
              {copyStatusLabel && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    color: copyErrorId ? 'var(--red)' : 'var(--text-muted)',
                    fontSize: 11,
                  }}
                >
                  {copyStatusLabel}
                </div>
              )}
            </div>
            {pendingQueuedSend && onCancelQueuedSend && (
              <button
                type="button"
                onClick={onCancelQueuedSend}
                aria-label="Cancel queued send"
                title="Cancel queued send"
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 7,
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  font: 'inherit',
                  fontSize: 11,
                  minHeight: 24,
                  padding: '0 8px',
                }}
              >
                Cancel send
              </button>
            )}
            {contextFiles.length > 1 && (
              <button
                type="button"
                onClick={() => copyToClipboard(contextFilesClipboardText(contextFiles), {
                  id: allContextFilesCopyId,
                  label: 'all attached context files',
                })}
                aria-label={`${allContextFilesCopied ? 'Copied' : allContextFilesCopyErrored ? 'Retry copy' : 'Copy'} all context files`}
                title={`${allContextFilesCopied ? 'Copied' : allContextFilesCopyErrored ? 'Retry copy' : 'Copy'} all context files`}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 7,
                  background: allContextFilesCopied
                    ? 'color-mix(in srgb, var(--secondary) 14%, transparent)'
                    : allContextFilesCopyErrored
                      ? 'color-mix(in srgb, var(--red) 14%, transparent)'
                      : 'transparent',
                  color: allContextFilesCopied
                    ? 'var(--secondary)'
                    : allContextFilesCopyErrored
                      ? 'var(--red)'
                      : 'var(--text-muted)',
                  cursor: 'pointer',
                  font: 'inherit',
                  fontSize: 11,
                  minHeight: 24,
                  padding: '0 8px',
                }}
              >
                {allContextFilesCopied ? 'Copied context' : 'Copy context'}
              </button>
            )}
            {hasComposerAttachments && (
              <button
                type="button"
                onClick={clearComposerAttachments}
                disabled={attachmentControlsDisabled}
                aria-label="Clear all attachments"
                title={attachmentControlsDisabled ? attachmentControlsDisabledTitle : 'Clear all attachments'}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 7,
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: attachmentControlsDisabled ? 'not-allowed' : 'pointer',
                  font: 'inherit',
                  fontSize: 11,
                  minHeight: 24,
                  padding: '0 8px',
                  opacity: attachmentControlsDisabled ? 0.55 : 1,
                }}
              >
                Clear
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {images.map((url, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={url} alt={`Attached image ${i + 1}`} style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '10px', border: '1px solid var(--border)' }} />
                <button
                  type="button"
                  disabled={attachmentControlsDisabled}
                  onClick={() => setImages(prev => {
                    const next = prev.filter((_, j) => j !== i)
                    imagesRef.current = next
                    if (next.length === 0) removeComposerDraftItem(draftStorageKeys.images)
                    else replaceComposerDraftJson(draftStorageKeys.images, next)
                    return next
                  })}
                  aria-label={`Remove image ${i + 1}`}
                  title={attachmentControlsDisabled ? attachmentControlsDisabledTitle : `Remove image ${i + 1}`}
                  style={{ position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--red)', border: 'none', color: 'var(--text-on-color)', cursor: attachmentControlsDisabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: attachmentControlsDisabled ? 0.55 : 1 }}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            {contextFiles.map((file, i) => {
              const key = file.id || `${file.name}-${i}`
              const copyId = `composer-file:${file.id || i}`
              const copied = copiedId === copyId
              const errored = copyErrorId === copyId
              const copyLabel = `${copied ? 'Copied' : errored ? 'Retry copy' : 'Copy'} attached file ${file.name}`
              const previewOpen = previewFileId === key
              return (
              <div
                key={key}
                title={file.path || file.name}
                style={{
                  maxWidth: 220,
                  minHeight: 32,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: previewOpen ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-card))' : 'var(--bg-card)',
                  color: 'var(--text-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '0 7px 0 9px',
                  fontSize: 12,
                }}
              >
                <FileText size={14} />
                <button
                  type="button"
                  aria-label={`${previewOpen ? 'Hide' : 'Preview'} attached file ${file.name}`}
                  onClick={() => setPreviewFileId(previewOpen ? null : key)}
                  style={{
                    minWidth: 0,
                    border: 0,
                    background: 'transparent',
                    color: 'inherit',
                    cursor: 'pointer',
                    font: 'inherit',
                    overflow: 'hidden',
                    padding: 0,
                    textAlign: 'left',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {contextFileDisplayLabel(file)}
                </button>
                <button
                  type="button"
                  onClick={() => copyToClipboard(contextFileClipboardText(file), {
                    id: copyId,
                    label: `attached file ${file.name}`,
                  })}
                  aria-label={copyLabel}
                  title={copyLabel}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    background: copied
                      ? 'color-mix(in srgb, var(--secondary) 18%, transparent)'
                      : errored
                        ? 'color-mix(in srgb, var(--red) 18%, transparent)'
                        : 'transparent',
                    border: 0,
                    color: copied ? 'var(--secondary)' : errored ? 'var(--red)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'grid',
                    placeItems: 'center',
                    padding: 0,
                  }}
                >
                  <ClipboardText size={11} />
                </button>
                <button
                  type="button"
                  disabled={attachmentControlsDisabled}
                  onClick={() => setContextFiles(prev => {
                    const next = prev.filter((_, j) => j !== i)
                    contextFilesRef.current = next
                    persistContextFileDraft(next)
                    if (previewFileId === key) setPreviewFileId(null)
                    return next
                  })}
                  aria-label={`Remove file ${file.name}`}
                  title={attachmentControlsDisabled ? attachmentControlsDisabledTitle : `Remove file ${file.name}`}
                  style={{ width: 18, height: 18, borderRadius: '50%', background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: attachmentControlsDisabled ? 'not-allowed' : 'pointer', display: 'grid', placeItems: 'center', padding: 0, opacity: attachmentControlsDisabled ? 0.55 : 1 }}
                >
                  <X size={10} />
                </button>
              </div>
              )
            })}
          </div>
          {previewFile && (
            <div
              role="region"
              aria-label={`Attached file preview ${previewFile.name}`}
              style={{
                width: 'min(620px, 100%)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: 'var(--bg-card)',
                color: 'var(--text-secondary)',
                padding: 10,
              }}
            >
              <div style={{
                alignItems: 'center',
                display: 'flex',
                gap: 8,
                justifyContent: 'space-between',
                marginBottom: 7,
              }}>
                <span style={{
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 11,
                  fontWeight: 700,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {contextFileDisplayLabel(previewFile)}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(contextFileClipboardText(previewFile), {
                      id: previewFileCopyId,
                      label: `preview file ${previewFile.name}`,
                    })}
                    aria-label={`${previewFileCopied ? 'Copied' : previewFileCopyErrored ? 'Retry copy' : 'Copy'} preview file ${previewFile.name}`}
                    style={{
                      background: previewFileCopied
                        ? 'color-mix(in srgb, var(--secondary) 14%, transparent)'
                        : previewFileCopyErrored
                          ? 'color-mix(in srgb, var(--red) 14%, transparent)'
                          : 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      color: previewFileCopied
                        ? 'var(--secondary)'
                        : previewFileCopyErrored
                          ? 'var(--red)'
                          : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: 11,
                      padding: '2px 7px',
                    }}
                  >
                    {previewFileCopied ? 'Copied' : previewFileCopyErrored ? 'Retry copy' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewFileId(null)}
                    aria-label={`Close attached file preview ${previewFile.name}`}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: 11,
                      padding: '2px 7px',
                    }}
                  >
                    Close
                  </button>
                </span>
              </div>
              <pre style={{
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 11,
                lineHeight: 1.45,
                margin: 0,
                maxHeight: 220,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {previewFile.content || 'No preview content.'}
              </pre>
            </div>
          )}
        </div>
      )}

      {slashCommands.length > 0 && (
        <div
          id="chat-slash-command-list"
          role="listbox"
          aria-label="Slash commands"
          style={{
            width: 'min(360px, 100%)',
            maxHeight: 220,
            overflowY: 'auto',
            marginBottom: 8,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'linear-gradient(var(--bg-panel-solid, #18181f), var(--bg-panel-solid, #18181f)), var(--bg-base, #0a0a0c)',
            backgroundClip: 'padding-box',
            opacity: 1,
            isolation: 'isolate',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            boxShadow: '0 14px 34px rgba(0, 0, 0, 0.34)',
            padding: 4,
            display: 'grid',
            gap: 3,
          }}
        >
          {slashCommands.map((item, index) => {
            const active = index === activeSlashIndex
            const optionId = `chat-slash-command-${item.command.slice(1)}`

            return (
              <button
                id={optionId}
                key={item.command}
                type="button"
                role="option"
                aria-selected={active}
                onMouseDown={event => event.preventDefault()}
                onMouseEnter={() => setActiveSlashIndex(index)}
                onClick={() => selectSlashCommand(item.command)}
                style={{
                  minHeight: 34,
                  border: 0,
                  borderRadius: 6,
                  background: active ? 'var(--hover-bg)' : 'transparent',
                  color: 'var(--text-primary)',
                  display: 'grid',
                  gridTemplateColumns: 'auto minmax(0, 1fr)',
                  alignItems: 'center',
                  columnGap: 9,
                  padding: '0 8px',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--accent)' }}>
                  {item.command}
                </span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{item.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.description}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {historyOpen && hasPromptHistory && (
        <div
          ref={historyMenuRef}
          id="chat-prompt-history-list"
          role="menu"
          aria-label="Prompt history"
          onKeyDown={onPromptHistoryMenuKeyDown}
          style={{
            width: 'min(420px, 100%)',
            maxHeight: 240,
            overflowY: 'auto',
            marginBottom: 8,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'linear-gradient(var(--bg-panel-solid, #18181f), var(--bg-panel-solid, #18181f)), var(--bg-base, #0a0a0c)',
            backgroundClip: 'padding-box',
            opacity: 1,
            isolation: 'isolate',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            boxShadow: '0 14px 34px rgba(0, 0, 0, 0.34)',
            padding: 4,
            display: 'grid',
            gap: 3,
          }}
        >
          {promptHistory.map((entry, index) => {
            const preview = promptHistoryPreview(entry)
            const meta = promptHistoryMeta(entry)

            return (
              <button
                key={`${preview}-${index}`}
                type="button"
                role="menuitem"
                onMouseDown={event => event.preventDefault()}
                onClick={() => restorePromptHistoryFromMenu(entry, index)}
                style={{
                  minHeight: 38,
                  border: 0,
                  borderRadius: 6,
                  background: historyCursor === index ? 'var(--hover-bg)' : 'transparent',
                  color: 'var(--text-primary)',
                  display: 'grid',
                  gap: 3,
                  padding: '6px 8px',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  fontSize: 12,
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {preview}
                </span>
                {meta && (
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {meta}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Input */}
      <div className="chat-input-shell" style={{
        background: draggingOver ? 'var(--active-bg, rgba(167, 139, 250, 0.12))' : 'var(--bg-card)',
        border: `1px solid ${draggingOver ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: '16px',
        padding: '10px 12px', display: 'flex', alignItems: 'flex-end', gap: '8px',
        boxShadow: draggingOver ? '0 0 0 3px var(--accent-a12, rgba(167, 139, 250, 0.12))' : 'none',
        transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
      }}>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFileChange} disabled={attachmentControlsDisabled} style={{ display: 'none' }} />
        <input ref={contextFileRef} type="file" multiple onChange={onContextFileChange} disabled={attachmentControlsDisabled} style={{ display: 'none' }} />
        <input ref={contextFolderRef} type="file" multiple onChange={onContextFileChange} disabled={attachmentControlsDisabled} style={{ display: 'none' }} />
        <button className="chat-input-attach" onClick={openImagePicker} title={attachmentControlsDisabled ? attachmentControlsDisabledTitle : imageLimitReached ? 'Image limit reached' : 'Attach image'} aria-label={attachmentControlsDisabled ? pendingQueuedSend ? 'Attach image unavailable while send is queued' : 'Attach image unavailable while attachments are reading' : imageLimitReached ? 'Attach image unavailable, image limit reached' : 'Attach image'}
          disabled={attachmentControlsDisabled || imageLimitReached}
          style={{ flexShrink: 0, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: attachmentControlsDisabled || imageLimitReached ? 'not-allowed' : 'pointer', padding: '4px', display: 'flex', alignItems: 'center', transition: 'color 0.15s', opacity: attachmentControlsDisabled || imageLimitReached ? 0.45 : 1 }}
          onMouseEnter={e => {
            if (!attachmentControlsDisabled && !imageLimitReached) e.currentTarget.style.color = 'var(--accent)'
          }}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <ImageIcon size={18} />
        </button>
        <button className="chat-input-attach-file" onClick={openContextFilePicker} title={attachmentControlsDisabled ? attachmentControlsDisabledTitle : contextFileLimitReached ? 'File context limit reached' : 'Attach file context'} aria-label={attachmentControlsDisabled ? pendingQueuedSend ? 'Attach file context unavailable while send is queued' : 'Attach file context unavailable while attachments are reading' : contextFileLimitReached ? 'Attach file context unavailable, file limit reached' : 'Attach file context'}
          disabled={attachmentControlsDisabled || contextFileLimitReached}
          style={{ flexShrink: 0, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: attachmentControlsDisabled || contextFileLimitReached ? 'not-allowed' : 'pointer', padding: '4px', display: 'flex', alignItems: 'center', transition: 'color 0.15s', opacity: attachmentControlsDisabled || contextFileLimitReached ? 0.45 : 1 }}
          onMouseEnter={e => {
            if (!attachmentControlsDisabled && !contextFileLimitReached) e.currentTarget.style.color = 'var(--accent)'
          }}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <FileText size={18} />
        </button>
        <button className="chat-input-attach-folder" onClick={openContextFolderPicker} title={attachmentControlsDisabled ? attachmentControlsDisabledTitle : contextFileLimitReached ? 'File context limit reached' : 'Attach folder context'} aria-label={attachmentControlsDisabled ? pendingQueuedSend ? 'Attach folder context unavailable while send is queued' : 'Attach folder context unavailable while attachments are reading' : contextFileLimitReached ? 'Attach folder context unavailable, file limit reached' : 'Attach folder context'}
          disabled={attachmentControlsDisabled || contextFileLimitReached}
          style={{ flexShrink: 0, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: attachmentControlsDisabled || contextFileLimitReached ? 'not-allowed' : 'pointer', padding: '4px', display: 'flex', alignItems: 'center', transition: 'color 0.15s', opacity: attachmentControlsDisabled || contextFileLimitReached ? 0.45 : 1 }}
          onMouseEnter={e => {
            if (!attachmentControlsDisabled && !contextFileLimitReached) e.currentTarget.style.color = 'var(--accent)'
          }}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <FolderOpen size={18} />
        </button>
        <button className="chat-input-history" onClick={() => setHistoryOpen(open => !open)} title={hasPromptHistory ? 'Prompt history' : 'No prompt history'} aria-label={historyOpen ? 'Hide prompt history' : 'Show prompt history'}
          aria-expanded={historyOpen}
          aria-controls={hasPromptHistory ? 'chat-prompt-history-list' : undefined}
          disabled={!hasPromptHistory || pendingQueuedSend}
          style={{ flexShrink: 0, background: 'transparent', border: 'none', color: historyOpen ? 'var(--accent)' : 'var(--text-muted)', cursor: !hasPromptHistory || pendingQueuedSend ? 'not-allowed' : 'pointer', padding: '4px', display: 'flex', alignItems: 'center', transition: 'color 0.15s', opacity: !hasPromptHistory || pendingQueuedSend ? 0.45 : 1 }}
          onMouseEnter={e => {
            if (hasPromptHistory && !pendingQueuedSend) e.currentTarget.style.color = 'var(--accent)'
          }}
          onMouseLeave={e => (e.currentTarget.style.color = historyOpen ? 'var(--accent)' : 'var(--text-muted)')}
        >
          <ClockCounterClockwise size={18} />
        </button>

        <textarea
          className="chat-input-textarea"
          ref={textareaRef}
          value={input}
          onChange={e => {
            if (pendingQueuedSend) return
            const v = e.target.value
            setHistoryCursor(null)
            draftBeforeHistoryRef.current = null
            setInput(v)
            setDismissedSlashQuery('')
            if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
            draftTimerRef.current = setTimeout(() => replaceComposerDraftItem(draftStorageKeys.text, v), 300)
          }}
          onKeyDown={onKeyDown}
          placeholder={pendingQueuedSend
            ? 'Queued send will run after attachments finish reading'
            : effectiveSendDisabledReason || `Ask ${providerLabel || 'Hermes Agent'} anything (paste images, drag files)`}
          aria-label="Chat message"
          aria-controls={slashCommands.length > 0 ? 'chat-slash-command-list' : undefined}
          aria-activedescendant={activeSlashCommand ? `chat-slash-command-${activeSlashCommand.command.slice(1)}` : undefined}
          readOnly={pendingQueuedSend}
          rows={1}
          style={{
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
            opacity: pendingQueuedSend ? 0.68 : 1,
            cursor: pendingQueuedSend ? 'default' : 'text',
          }}
        />

        {sending ? (
          <button
            className="chat-input-stop"
            onClick={onStop}
            aria-label="Stop response"
            title="Stop response"
            style={{
              flexShrink: 0,
              background: 'var(--red-a8, rgba(239, 68, 68, 0.12))',
              border: '1px solid var(--red-500, rgba(239, 68, 68, 0.35))',
              borderRadius: '10px',
              color: 'var(--red-500, #ef4444)',
              padding: '7px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.25s var(--ease-spring)',
            }}
          >
            <Square size={13} weight="fill" />
            <span className="chat-input-stop-label">Stop</span>
          </button>
        ) : (
          <button className="chat-input-send" onClick={onSend} disabled={!canSend} aria-label={sendButtonLabel} title={sendTitle}
            style={{
              flexShrink: 0,
              width: '34px',
              height: '34px',
              background: canSend ? 'var(--bg-elevated)' : 'transparent',
              border: `1px solid ${canSend ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: '50%',
              color: canSend ? 'var(--accent-bright)' : 'var(--text-muted)',
              cursor: canSend ? 'pointer' : 'not-allowed',
              display: 'grid',
              placeItems: 'center',
              opacity: canSend ? 1 : 0.55,
              transition: 'border-color 0.15s, color 0.15s, background 0.15s, opacity 0.15s',
            }}
          >
            <PaperPlaneTilt size={15} weight={canSend ? 'fill' : 'regular'} style={{ marginLeft: '-1px' }} />
          </button>
        )}
      </div>
      {effectiveSendDisabledReason && (
        <div
          role="status"
          aria-label="Send unavailable"
          aria-live="polite"
          data-chat-send-disabled-status
          style={{
            marginTop: 6,
            border: '1px solid color-mix(in srgb, var(--accent) 18%, var(--border))',
            borderRadius: 8,
            background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
            color: 'var(--text-secondary)',
            fontSize: 11,
            lineHeight: 1.4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
            padding: '7px 9px',
          }}
        >
          <span>{effectiveSendDisabledReason}</span>
          {onSendDisabledAction && sendDisabledActionLabel && (
            <button
              type="button"
              onClick={onSendDisabledAction}
              style={{
                minHeight: 26,
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700,
                padding: '0 9px',
              }}
            >
              {sendDisabledActionLabel}
            </button>
          )}
        </div>
      )}
      {contextBar && (
        <div className="chat-input-context" style={{ marginTop: 8 }}>
          {contextBar}
        </div>
      )}
    </div>
  )
}

/** Combined export — default renders the bottom input, .Header renders the top bar */
export default Object.assign(ChatInputBox, { Header: ChatInputHeader })
