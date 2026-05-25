import { describe, expect, it } from 'vitest'

import {
  CHAT_DEFAULT_FAVORITE_MODELS,
  getChatFavoriteModels,
  mergeDefaultFavoriteModelIds,
  normalizeFavoriteModelIds,
  resolvePreferredModelId,
  sanitizeFavoriteModelIds,
} from '../model-favorites'

describe('model-favorites', () => {
  const models = [
    { id: 'openai/gpt-5.2', name: 'GPT 5.2', provider: 'openai', local: false },
    { id: 'openai/gpt-5.5', name: 'GPT 5.5', provider: 'openai', local: false },
    { id: 'openai/gpt-5', name: 'GPT-5', provider: 'openai', local: false },
    { id: 'openai/gpt-5.4', name: 'GPT 5.4', provider: 'openai', local: false },
  ]

  it('shows only current model when no favorites are selected', () => {
    expect(getChatFavoriteModels(models, [], 'GPT 5.5')).toEqual([
      models[1],
    ])
  })

  it('returns only favorite models and keeps current model visible', () => {
    expect(
      getChatFavoriteModels(models, ['openai/gpt-5'], 'openai/gpt-5.5').map((model) => model.id),
    ).toEqual(['openai/gpt-5.5', 'openai/gpt-5'])
  })

  it('drops favorite ids that no longer exist', () => {
    expect(normalizeFavoriteModelIds(['missing', 'openai/gpt-5'], models)).toEqual(['openai/gpt-5'])
  })

  it('preserves configured favorites that are missing from live inventory', () => {
    expect(
      getChatFavoriteModels(models, ['openai/gpt-5.1'], 'openai/gpt-5.5'),
    ).toEqual([
      models[1],
      { id: 'openai/gpt-5.1', name: 'GPT 5.1', provider: 'openai', local: false },
    ])
  })

  it('matches provider-prefixed favorites to unprefixed live model ids', () => {
    expect(
      getChatFavoriteModels([{ id: 'gpt-5.5', name: 'GPT 5.5', provider: 'hermes', local: false }], ['openai/gpt-5.5'], '').map((model) => model.id),
    ).toEqual(['gpt-5.5'])
  })

  it('keeps default favorites first when merging saved favorites', () => {
    expect(mergeDefaultFavoriteModelIds(['openai/gpt-5'], ['openai/gpt-5.5', 'openai/gpt-5'], models)).toEqual([
      'openai/gpt-5.5',
      'openai/gpt-5',
    ])
  })

  it('resolves provider-prefixed preferred models to live model ids', () => {
    expect(resolvePreferredModelId('GPT 5.5', models)).toBe('openai/gpt-5.5')
  })

  it('sanitizes favorites without dropping unknown model ids', () => {
    expect(sanitizeFavoriteModelIds([' openai/gpt-5.1 ', '', 'openai/gpt-5.1', 'GPT 5.5'])).toEqual([
      'openai/gpt-5.1',
      'openai/gpt-5.5',
    ])
  })

  it('keeps canonical GPT 5.5 in default favorites without gpt-5.3 codex defaults', () => {
    expect(CHAT_DEFAULT_FAVORITE_MODELS[0]).toBe('openai/gpt-5.5')
    expect(CHAT_DEFAULT_FAVORITE_MODELS).not.toContain('openai-codex/gpt-5.3-codex')
    expect(CHAT_DEFAULT_FAVORITE_MODELS).not.toContain('openai-codex/gpt-5.3-codex-spark')
  })
})
