import type { ModelInfo, ModelsResponse as HarnessModelsResponse } from '@/pages/harness/types'
import type { ModelOption } from '@/pages/chat/types'

export const CHAT_FAVORITE_MODELS_STORAGE_KEY = 'chat-favorite-models'
export const CHAT_FAVORITE_MODELS_VERSION_STORAGE_KEY = 'chat-favorite-models-version'
export const CHAT_PRIMARY_MODEL_STORAGE_KEY = 'harness-chat-primary-model'
export const HARNESS_HEARTBEAT_MODEL_STORAGE_KEY = 'harness-heartbeat-model'
export const CHAT_FAVORITE_MODELS_VERSION = 6
export const CHAT_DEFAULT_MODEL = 'openai/gpt-5.5'
export const CHAT_DEFAULT_FAVORITE_MODELS: string[] = [
  CHAT_DEFAULT_MODEL,
  'openai/gpt-5.4',
  'openai/gpt-5.4-mini',
  'openai-codex/gpt-5.3-codex',
  'openai-codex/gpt-5.3-codex-spark',
]

export function getHarnessModelList(models?: HarnessModelsResponse | null): ModelInfo[] {
  return models?.models ?? models?.data ?? []
}

function sanitizeFavoriteId(value: string): string {
  return value.trim()
}

export function sanitizeFavoriteModelIds(favoriteIds: string[]): string[] {
  const uniqueIds: string[] = []
  for (const favoriteId of favoriteIds) {
    const sanitized = sanitizeFavoriteId(favoriteId)
    if (!sanitized || uniqueIds.includes(sanitized)) continue
    uniqueIds.push(sanitized)
  }
  return uniqueIds
}

function formatMissingModelName(modelId: string): string {
  const slug = modelId.split('/').at(-1) ?? modelId
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\bgpt\b/gi, 'GPT')
    .replace(/\bcodex\b/gi, 'Codex')
    .replace(/\bmini\b/gi, 'Mini')
    .replace(/\bmax\b/gi, 'Max')
    .replace(/\bqwen\b/gi, 'Qwen')
    .replace(/\s+/g, ' ')
    .trim()
}

function makeMissingFavoriteModel(modelId: string): ModelOption {
  return {
    id: modelId,
    name: formatMissingModelName(modelId),
    provider: modelId.split('/')[0] ?? 'unknown',
    local: false,
  }
}

function modelSlug(modelId: string): string {
  return modelId.split('/').at(-1) ?? modelId
}

function findFavoriteModel(models: ModelOption[], favoriteId: string): ModelOption | undefined {
  const exact = models.find((candidate) => candidate.id === favoriteId)
  if (exact) return exact

  const favoriteSlug = modelSlug(favoriteId)
  return models.find((candidate) => modelSlug(candidate.id) === favoriteSlug)
}

function dedupeModelsById(models: ModelOption[]): ModelOption[] {
  const uniqueModels: ModelOption[] = []
  for (const model of models) {
    if (uniqueModels.some((candidate) => candidate.id === model.id)) continue
    uniqueModels.push(model)
  }
  return uniqueModels
}

export function getChatFavoriteModels(
  models: ModelOption[],
  favoriteIds: string[],
  currentModel: string,
): ModelOption[] {
  const uniqueFavoriteIds = sanitizeFavoriteModelIds(favoriteIds)
  if (uniqueFavoriteIds.length === 0) {
    const current = models.find((candidate) => candidate.id === currentModel)
    return current ? [current] : models.slice(0, 1)
  }

  const favorites = dedupeModelsById(uniqueFavoriteIds
    .map((favoriteId) => findFavoriteModel(models, favoriteId) ?? makeMissingFavoriteModel(favoriteId))
  )

  const current = models.find((candidate) => candidate.id === currentModel)
  if (current && !favorites.some((candidate) => candidate.id === current.id)) {
    return [current, ...favorites]
  }

  return favorites
}

export function normalizeFavoriteModelIds(
  favoriteIds: string[],
  models: Array<{ id: string }>,
): string[] {
  const validIds = new Set(models.map((model) => model.id))
  return sanitizeFavoriteModelIds(favoriteIds).filter((favoriteId) => validIds.has(favoriteId))
}

export function mergeDefaultFavoriteModelIds(
  favoriteIds: string[],
  defaultIds: string[],
  _models: Array<{ id: string }>,
): string[] {
  return sanitizeFavoriteModelIds([...defaultIds, ...favoriteIds])
}

export function isFavoriteModel(modelId: string, favoriteIds: string[]): boolean {
  return favoriteIds.includes(modelId)
}

export function resolvePreferredModelId(
  preferredId: string,
  models: Array<{ id: string }>,
): string {
  if (!preferredId) return ''
  const exact = models.find((model) => model.id === preferredId)
  if (exact) return exact.id

  const preferredSlug = modelSlug(preferredId)
  return models.find((model) => modelSlug(model.id) === preferredSlug)?.id ?? ''
}
