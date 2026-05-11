import { describe, expect, it } from 'vitest'

import {
  getChatFavoriteModels,
  mergeDefaultFavoriteModelIds,
  normalizeFavoriteModelIds,
  resolvePreferredModelId,
  sanitizeFavoriteModelIds,
} from '../model-favorites'

describe('model-favorites', () => {
  const models = [
    { id: 'llama-desktop/qwen', name: 'Qwen', provider: 'llama-desktop', local: true },
    { id: 'openai-codex/gpt-5.3-codex', name: 'GPT 5.3 Codex', provider: 'openai-codex', local: false },
    { id: 'openai/gpt-5', name: 'GPT-5', provider: 'openai', local: false },
    { id: 'gpt-5.5', name: 'GPT 5.5', provider: 'hermes', local: false },
  ]

  it('shows only current model when no favorites are selected', () => {
    expect(getChatFavoriteModels(models, [], 'openai-codex/gpt-5.3-codex')).toEqual([
      models[1],
    ])
  })

  it('returns only favorite models and keeps current model visible', () => {
    expect(
      getChatFavoriteModels(models, ['openai/gpt-5'], 'openai-codex/gpt-5.3-codex').map((model) => model.id),
    ).toEqual(['openai-codex/gpt-5.3-codex', 'openai/gpt-5'])
  })

  it('drops favorite ids that no longer exist', () => {
    expect(normalizeFavoriteModelIds(['missing', 'openai/gpt-5'], models)).toEqual(['openai/gpt-5'])
  })

  it('preserves configured favorites that are missing from live inventory', () => {
    expect(
      getChatFavoriteModels(models, ['openai/gpt-5.4-mini'], 'openai-codex/gpt-5.3-codex'),
    ).toEqual([
      models[1],
      { id: 'openai/gpt-5.4-mini', name: 'GPT 5.4 Mini', provider: 'openai', local: false },
    ])
  })

  it('matches provider-prefixed favorites to unprefixed live model ids', () => {
    expect(
      getChatFavoriteModels(models, ['openai/gpt-5.5'], '').map((model) => model.id),
    ).toEqual(['gpt-5.5'])
  })

  it('keeps default favorites first when merging saved favorites', () => {
    expect(mergeDefaultFavoriteModelIds(['openai/gpt-5'], ['openai/gpt-5.5', 'openai/gpt-5'], models)).toEqual([
      'openai/gpt-5.5',
      'openai/gpt-5',
    ])
  })

  it('resolves provider-prefixed preferred models to live model ids', () => {
    expect(resolvePreferredModelId('openai/gpt-5.5', models)).toBe('gpt-5.5')
  })

  it('sanitizes favorites without dropping unknown model ids', () => {
    expect(sanitizeFavoriteModelIds([' openai/gpt-5.4-mini ', '', 'openai/gpt-5.4-mini'])).toEqual([
      'openai/gpt-5.4-mini',
    ])
  })
})
