import type { ChatContextFileAttachment, ChatMessage } from './types'

const ATTACHMENT_OCCURRENCE_SEPARATOR = '\u0000attachment#'

export function optimisticAttachmentCacheKey(text: string, occurrence: number): string {
  return `${text}${ATTACHMENT_OCCURRENCE_SEPARATOR}${occurrence}`
}

function sequencedCachePrefix(text: string): string {
  return `${text}${ATTACHMENT_OCCURRENCE_SEPARATOR}`
}

function sequencedOccurrencesForText(
  text: string,
  imageCache: Map<string, string[]>,
  contextFileCache: Map<string, ChatContextFileAttachment[]>,
): number[] {
  const prefix = sequencedCachePrefix(text)
  const occurrences = new Set<number>()
  for (const key of [...imageCache.keys(), ...contextFileCache.keys()]) {
    if (!key.startsWith(prefix)) continue
    const occurrence = Number.parseInt(key.slice(prefix.length), 10)
    if (Number.isFinite(occurrence) && occurrence > 0) {
      occurrences.add(occurrence)
    }
  }
  return [...occurrences].sort((left, right) => left - right)
}

function cachedValueForOccurrence<T>(
  cache: Map<string, T>,
  text: string,
  occurrenceKey?: string,
  hasSequencedCache = false,
): { value: T | undefined; sequenced: boolean } {
  if (occurrenceKey) {
    return { value: cache.get(occurrenceKey), sequenced: true }
  }
  if (hasSequencedCache) return { value: undefined, sequenced: true }
  return { value: cache.get(text), sequenced: false }
}

export function withOptimisticAttachmentFallback(
  message: ChatMessage,
  imageCache: Map<string, string[]>,
  contextFileCache: Map<string, ChatContextFileAttachment[]>,
  occurrenceKey?: string,
  hasSequencedCache = Boolean(occurrenceKey),
): ChatMessage {
  if (message.role !== 'user') return message
  const cachedImages = cachedValueForOccurrence(imageCache, message.text, occurrenceKey, hasSequencedCache)
  const cachedContextFiles = cachedValueForOccurrence(contextFileCache, message.text, occurrenceKey, hasSequencedCache)
  const usingSequencedCache = cachedImages.sequenced || cachedContextFiles.sequenced
  const images = message.images?.length
    ? message.images
    : usingSequencedCache
      ? cachedImages.value
      : imageCache.get(message.text)
  const contextFiles = message.contextFiles?.length
    ? message.contextFiles
    : usingSequencedCache
      ? cachedContextFiles.value
      : contextFileCache.get(message.text)
  if (images === message.images && contextFiles === message.contextFiles) return message
  return {
    ...message,
    images,
    contextFiles,
  }
}

export function withOptimisticAttachmentFallbacks(
  messages: ChatMessage[],
  imageCache: Map<string, string[]>,
  contextFileCache: Map<string, ChatContextFileAttachment[]>,
): ChatMessage[] {
  const occurrences = new Map<string, number>()
  const userMessageCounts = new Map<string, number>()
  const sequencedOccurrences = new Map<string, number[]>()
  for (const message of messages) {
    if (message.role !== 'user') continue
    userMessageCounts.set(message.text, (userMessageCounts.get(message.text) ?? 0) + 1)
  }
  return messages.map((message) => {
    if (message.role !== 'user') return message
    const occurrence = (occurrences.get(message.text) ?? 0) + 1
    occurrences.set(message.text, occurrence)
    let sequence = sequencedOccurrences.get(message.text)
    if (!sequence) {
      sequence = sequencedOccurrencesForText(message.text, imageCache, contextFileCache)
      sequencedOccurrences.set(message.text, sequence)
    }
    const sequenceOffset = Math.max(0, (userMessageCounts.get(message.text) ?? 0) - sequence.length)
    const sequenceIndex = occurrence - sequenceOffset - 1
    const occurrenceKey = sequenceIndex >= 0 && sequenceIndex < sequence.length
      ? optimisticAttachmentCacheKey(message.text, sequence[sequenceIndex])
      : undefined
    return withOptimisticAttachmentFallback(message, imageCache, contextFileCache, occurrenceKey, sequence.length > 0)
  })
}
