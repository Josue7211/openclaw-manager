import { describe, expect, it } from 'vitest'

import { getChatFavoriteModels, normalizeFavoriteModelIds, sanitizeFavoriteModelIds } from '../model-favorites'

describe('model-favorites', () => {
  const models = [
    { id: 'llama-desktop/qwen', name: 'Qwen', provider: 'llama-desktop', local: true },
    { id: 'openai-codex/gpt-5.3-codex', name: 'GPT 5.3 Codex', provider: 'openai-codex', local: false },
    { id: 'openai/gpt-5', name: 'GPT-5', provider: 'openai', local: false },
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
      getChatFavoriteModels(models, ['openai-codex/gpt-5.4-mini'], 'openai-codex/gpt-5.3-codex'),
    ).toEqual([
      models[1],
      { id: 'openai-codex/gpt-5.4-mini', name: 'GPT 5.4 Mini', provider: 'openai-codex', local: false },
    ])
  })

  it('sanitizes favorites without dropping unknown model ids', () => {
    expect(sanitizeFavoriteModelIds([' openai-codex/gpt-5.4-mini ', '', 'openai-codex/gpt-5.4-mini'])).toEqual([
      'openai-codex/gpt-5.4-mini',
    ])
  })
})
