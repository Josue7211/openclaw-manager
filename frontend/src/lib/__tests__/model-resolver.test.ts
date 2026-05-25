import { describe, expect, it } from 'vitest'

import {
  CANONICAL_GPT_55_MODEL_ID,
  canonicalizeModelId,
  modelIdentifiersMatch,
  resolveModelId,
  resolveStoredModelId,
} from '../model-resolver'

describe('model-resolver', () => {
  const models = [
    { id: 'openai/gpt-5.5', name: 'GPT 5.5', provider: 'openai' },
    { id: 'openai/gpt-5.4', name: 'GPT 5.4', provider: 'openai' },
  ]

  it('canonicalizes GPT 5.5 aliases to the provider-prefixed model id', () => {
    expect(canonicalizeModelId('GPT 5.5')).toBe(CANONICAL_GPT_55_MODEL_ID)
    expect(canonicalizeModelId('gpt-5.5')).toBe(CANONICAL_GPT_55_MODEL_ID)
    expect(canonicalizeModelId(' openai/gpt-5.5 ')).toBe(CANONICAL_GPT_55_MODEL_ID)
  })

  it('resolves display labels through live model names', () => {
    expect(resolveModelId('GPT 5.4', models)).toBe('openai/gpt-5.4')
  })

  it('resolves canonical GPT 5.5 to unprefixed live inventory when needed', () => {
    expect(resolveModelId('openai/gpt-5.5', [{ id: 'gpt-5.5', name: 'GPT 5.5' }])).toBe('gpt-5.5')
  })

  it('stores GPT 5.5 aliases canonically', () => {
    expect(resolveStoredModelId('GPT 5.5', models)).toBe(CANONICAL_GPT_55_MODEL_ID)
  })

  it('matches provider-prefixed and unprefixed aliases', () => {
    expect(modelIdentifiersMatch('openai/gpt-5.5', 'gpt-5.5')).toBe(true)
  })
})
