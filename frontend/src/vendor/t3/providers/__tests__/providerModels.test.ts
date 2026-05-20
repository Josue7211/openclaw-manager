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

describe('T3 copied provider model helpers adapted for ClawControl direct providers', () => {
  it('does not invent a model for direct Claude Code or Codex CLI providers', () => {
    const providers: ServerProvider[] = [
      {
        ...baseProvider,
        instanceId: 'claudeAgent',
        driver: 'claudeAgent',
        displayName: 'Claude Code',
      },
      {
        ...baseProvider,
        instanceId: 'codex-cli',
        driver: 'codex-cli',
        displayName: 'Codex CLI',
      },
    ]

    expect(getDefaultServerModel(providers, 'claudeAgent')).toBe('')
    expect(getDefaultServerModel(providers, 'codex-cli')).toBe('')
  })

  it('keeps Hermes model-backed fallback behavior when Codex LB has not reported models yet', () => {
    const providers: ServerProvider[] = [{
      ...baseProvider,
      instanceId: 'hermes',
      driver: 'hermes',
      displayName: 'Hermes',
    }]

    expect(getDefaultServerModel(providers, 'hermes')).toBe('gpt-5.5')
  })
})
