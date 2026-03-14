import { useCallback, useRef, useState } from 'react'
import { API_BASE, api } from '@/lib/api'

interface Message {
  guid: string
  text: string
  dateCreated: number
  isFromMe: boolean
  handle?: { address: string; service: string }
  attachments?: { guid: string; mimeType: string; transferName: string; isSticker?: boolean; uti?: string }[]
  threadOriginatorGuid?: string | null
  _failed?: boolean
  _failedText?: string
  _failedChatGuid?: string
  _failedReplyGuid?: string | null
  [key: string]: unknown
}

interface Conversation {
  guid: string
  [key: string]: unknown
}

interface UseMessageComposeParams {
  selected: Conversation | null
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  fileInputRef: React.RefObject<HTMLInputElement | null>
  pendingScrollRef: React.MutableRefObject<'instant' | 'smooth' | null>
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  fetchMessages: (conv: Conversation, silent?: boolean) => Promise<void>
}

export function useMessageCompose({
  selected,
  inputRef,
  fileInputRef,
  pendingScrollRef,
  setMessages,
  fetchMessages,
}: UseMessageComposeParams) {
  const draftRef = useRef('')
  const [hasDraft, setHasDraft] = useState(false)
  const [sending, setSending] = useState(false)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)

  const clearAttachment = useCallback(() => {
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview)
    setAttachmentFile(null)
    setAttachmentPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [attachmentPreview, fileInputRef])

  const adjustTextarea = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`
  }, [inputRef])

  const handleDraftChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    draftRef.current = e.target.value
    const hasText = e.target.value.trim().length > 0
    setHasDraft(prev => prev !== hasText ? hasText : prev)
    adjustTextarea()
  }, [adjustTextarea])

  const handleSend = useCallback(async () => {
    const text = draftRef.current.trim()
    const file = attachmentFile
    if ((!text && !file) || !selected || sending) return
    const replyGuid = replyTo?.guid || null
    draftRef.current = ''
    if (inputRef.current) { inputRef.current.value = ''; inputRef.current.style.height = 'auto' }
    setHasDraft(false)
    setReplyTo(null)
    // Clear attachment inline (don't call clearAttachment to avoid stale closure on attachmentPreview)
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview)
    setAttachmentFile(null)
    setAttachmentPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''

    setSending(true)
    pendingScrollRef.current = 'smooth'

    const optimistic: Message = {
      guid: `temp-${Date.now()}`,
      text: text || (file ? `Sending ${file.name}...` : ''),
      dateCreated: Date.now(),
      isFromMe: true,
      threadOriginatorGuid: replyGuid,
    }
    setMessages(prev => [...prev, optimistic])

    try {
      if (file) {
        const formData = new FormData()
        formData.append('chatGuid', selected.guid)
        formData.append('attachment', file)
        if (text) formData.append('message', text)
        if (replyGuid) formData.append('selectedMessageGuid', replyGuid)
        await fetch(`${API_BASE}/api/messages/send-attachment`, { method: 'POST', body: formData })
      } else {
        await api.post('/api/messages', {
          chatGuid: selected.guid,
          text,
          ...(replyGuid ? { selectedMessageGuid: replyGuid } : {}),
        })
      }
      setTimeout(() => fetchMessages(selected, true), 2000)
    } catch {
      setMessages(prev => prev.map(m =>
        m.guid === optimistic.guid
          ? { ...m, _failed: true, _failedText: text, _failedChatGuid: selected.guid, _failedReplyGuid: replyGuid }
          : m
      ))
    } finally {
      setSending(false)
    }
  }, [selected, sending, fetchMessages, replyTo, attachmentFile, attachmentPreview, inputRef, fileInputRef, pendingScrollRef, setMessages])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (const item of items) {
      if (item.type.startsWith('image/') || item.type.startsWith('video/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          setAttachmentPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file) })
          setAttachmentFile(file)
        }
        return
      }
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAttachmentPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file) })
      setAttachmentFile(file)
    }
  }, [])

  /** Attach a File directly (used by drag-and-drop) */
  const attachFile = useCallback((file: File) => {
    setAttachmentPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file) })
    setAttachmentFile(file)
  }, [])

  const retryMessage = useCallback(async (failedMsg: Message) => {
    if (!failedMsg._failedText || !failedMsg._failedChatGuid) return
    const text = failedMsg._failedText
    const chatGuid = failedMsg._failedChatGuid
    const replyGuid = failedMsg._failedReplyGuid || null

    // Mark as sending again
    const newGuid = `temp-${Date.now()}`
    setMessages(prev => prev.map(m =>
      m.guid === failedMsg.guid
        ? { ...m, _failed: false, guid: newGuid }
        : m
    ))

    try {
      await api.post('/api/messages', {
        chatGuid,
        text,
        ...(replyGuid ? { selectedMessageGuid: replyGuid } : {}),
      })
      if (selected) setTimeout(() => fetchMessages(selected, true), 2000)
    } catch {
      setMessages(prev => prev.map(m =>
        m.guid === newGuid
          ? { ...m, _failed: true, guid: failedMsg.guid }
          : m
      ))
    }
  }, [selected, fetchMessages, setMessages])

  const dismissFailedMessage = useCallback((guid: string) => {
    setMessages(prev => prev.filter(m => m.guid !== guid))
  }, [setMessages])

  /** Reset compose state when switching conversations */
  const resetCompose = useCallback(() => {
    setReplyTo(null)
    setAttachmentFile(null)
    setAttachmentPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    draftRef.current = ''
    setHasDraft(false)
    if (inputRef.current) { inputRef.current.value = ''; inputRef.current.style.height = 'auto' }
  }, [inputRef])

  return {
    draftRef,
    hasDraft,
    sending,
    attachmentFile,
    attachmentPreview,
    replyTo,
    setReplyTo,
    clearAttachment,
    adjustTextarea,
    handleDraftChange,
    handleSend,
    handlePaste,
    handleFileSelect,
    attachFile,
    retryMessage,
    dismissFailedMessage,
    resetCompose,
  }
}
