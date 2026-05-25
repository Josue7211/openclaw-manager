import type { ModelInfo, ModelsResponse as HarnessModelsResponse } from '@/features/harness/types'
import type { ModelOption } from '@/features/chat/types'
import {
  CANONICAL_GPT_55_MODEL_ID,
  canonicalizeModelId,
  modelIdentifiersMatch,
  resolveModelId,
} from './model-resolver'

export const CHAT_FAVORITE_MODELS_STORAGE_KEY = 'chat-favorite-models'
export const CHAT_FAVORITE_MODELS_VERSION_STORAGE_KEY = 'chat-favorite-models-version'
export const CHAT_PRIMARY_MODEL_STORAGE_KEY = 'harness-chat-primary-model'
export const HARNESS_HEARTBEAT_MODEL_STORAGE_KEY = 'harness-heartbeat-model'
export const CHAT_FAVORITE_MODELS_VERSION = 7
export const CHAT_DEFAULT_MODEL = CANONICAL_GPT_55_MODEL_ID
export const CHAT_DEFAULT_FAVORITE_MODELS: string[] = [
  CHAT_DEFAULT_MODEL,
  'openai/gpt-5.4',
]

export function getHarnessModelList(models?: HarnessModelsResponse | null): ModelInfo[] {
  return models?.models ?? models?.data ?? []
}

function sanitizeFavoriteId(value: string): string {
  return canonicalizeModelId(value)
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
  const resolvedFavoriteId = resolveModelId(favoriteId, models)
  const exact = models.find((candidate) => candidate.id === resolvedFavoriteId)
  if (exact) return exact

  const favoriteSlug = modelSlug(resolvedFavoriteId || favoriteId)
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
    const resolvedCurrentModel = resolveModelId(currentModel, models)
    const current = models.find((candidate) => candidate.id === resolvedCurrentModel)
    return current ? [current] : models.slice(0, 1)
  }

  const favorites = dedupeModelsById(uniqueFavoriteIds
    .map((favoriteId) => findFavoriteModel(models, favoriteId) ?? makeMissingFavoriteModel(favoriteId))
  )

  const resolvedCurrentModel = resolveModelId(currentModel, models)
  const current = models.find((candidate) => candidate.id === resolvedCurrentModel)
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
  return sanitizeFavoriteModelIds(favoriteIds).filter((favoriteId) => {
    const resolvedFavoriteId = resolveModelId(favoriteId, models)
    return resolvedFavoriteId ? validIds.has(resolvedFavoriteId) : false
  })
}

export function mergeDefaultFavoriteModelIds(
  favoriteIds: string[],
  defaultIds: string[],
  _models: Array<{ id: string }>,
): string[] {
  return sanitizeFavoriteModelIds([...defaultIds, ...favoriteIds])
}

export function isFavoriteModel(modelId: string, favoriteIds: string[]): boolean {
  return favoriteIds.some((favoriteId) => modelIdentifiersMatch(favoriteId, modelId))
}

export function resolvePreferredModelId(
  preferredId: string,
  models: Array<{ id: string }>,
): string {
  return resolveModelId(preferredId, models)
}
