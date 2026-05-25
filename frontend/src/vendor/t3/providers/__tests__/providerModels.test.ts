import { describe, expect, it } from 'vitest'
import {
  getDefaultServerModel,
} from '../providerModels'
import type { ServerProvider } from '../providerTypes'

const baseProvider = {
  enabled: true,
  installed: true,
  version: null,
  status: 'ready',
  auth: { status: 'not-required' },
  checkedAt: new Date(0).toISOString(),
  models: [],
} satisfies Partial<ServerProvider>

describe('T3 copied provider model helpers adapted for Hermes Agent', () => {
  it('keeps Hermes model-backed fallback behavior when Hermes has not reported models yet', () => {
    const providers: ServerProvider[] = [{
      ...baseProvider,
      instanceId: 'hermes',
      driver: 'hermes',
      displayName: 'Hermes',
    }]

    expect(getDefaultServerModel(providers, 'hermes')).toBe('openai/gpt-5.5')
  })
})
