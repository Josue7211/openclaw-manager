export const CHAT_IMAGE_LIMIT = 10
export const CHAT_CONTEXT_FILE_LIMIT = 8
export const CHAT_CONTEXT_FILE_MAX_CHARS = 20_000
export const CHAT_DRAFT_STORAGE_KEY = 'chat-draft'
export const CHAT_DRAFT_IMAGES_STORAGE_KEY = 'chat-draft-images'
export const CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY = 'chat-draft-context-files'

export interface ChatComposerDraftStorageKeys {
  text: string
  images: string
  contextFiles: string
}

export const LEGACY_CHAT_COMPOSER_DRAFT_STORAGE_KEYS: ChatComposerDraftStorageKeys = {
  text: CHAT_DRAFT_STORAGE_KEY,
  images: CHAT_DRAFT_IMAGES_STORAGE_KEY,
  contextFiles: CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY,
}

export function chatComposerDraftStorageKeys(scope?: string | null): ChatComposerDraftStorageKeys {
  const normalizedScope = scope?.trim()
  if (!normalizedScope) return LEGACY_CHAT_COMPOSER_DRAFT_STORAGE_KEYS

  const suffix = encodeURIComponent(normalizedScope)
  return {
    text: `${CHAT_DRAFT_STORAGE_KEY}:${suffix}`,
    images: `${CHAT_DRAFT_IMAGES_STORAGE_KEY}:${suffix}`,
    contextFiles: `${CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY}:${suffix}`,
  }
}
