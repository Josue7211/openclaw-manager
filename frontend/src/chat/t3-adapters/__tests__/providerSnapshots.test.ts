import { describe, expect, it } from 'vitest'
import {
  normalizeChatProviderSnapshots,
  selectableChatProviderOptions,
} from '../providerSnapshots'

const models = [
  { id: 'gpt-5.5', name: 'GPT 5.5', provider: 'codex-lb', local: false },
  { id: 'o3', name: 'o3', provider: 'codex-lb', local: false },
]

describe('T3 chat provider snapshot adapter', () => {
  it('keeps Hermes model-backed and local providers direct without inherited models', () => {
    const providers = [
      { id: 'hermes', name: 'Hermes', ready: true, selectable: true },
      { id: 'claudeAgent', name: 'Claude Code', ready: true, selectable: true },
      { id: 'codex-cli', name: 'Codex CLI', ready: true, selectable: true },
    ]

    const snapshots = normalizeChatProviderSnapshots({ providers, models })
    const hermes = snapshots.find(provider => provider.instanceId === 'hermes')
    const claude = snapshots.find(provider => provider.instanceId === 'claudeAgent')
    const codexCli = snapshots.find(provider => provider.instanceId === 'codex-cli')

    expect(hermes?.driver).toBe('hermes')
    expect(hermes?.models.map(model => model.slug)).toEqual(['gpt-5.5', 'o3'])
    expect(claude?.driver).toBe('claudeAgent')
    expect(claude?.models).toEqual([])
    expect(codexCli?.driver).toBe('codex-cli')
    expect(codexCli?.models).toEqual([])

    expect(selectableChatProviderOptions({ providers, models })).toEqual([
      expect.objectContaining({ id: 'hermes', modelBacked: true, local: false }),
      expect.objectContaining({ id: 'claudeAgent', modelBacked: false, local: true }),
      expect.objectContaining({ id: 'codex-cli', modelBacked: false, local: true }),
    ])
  })

  it('hides unavailable local providers from chat while preserving their settings snapshots', () => {
    const providers = [
      { id: 'hermes', name: 'Hermes', ready: true, selectable: true },
      { id: 'claudeAgent', name: 'Claude Code', ready: false, selectable: false, detail: 'Claude missing' },
      { id: 'codex-cli', name: 'Codex CLI', ready: true, selectable: true },
      { id: 'openclaw', name: 'OpenClaw', ready: true, selectable: true },
    ]

    const snapshots = normalizeChatProviderSnapshots({ providers, models })

    expect(snapshots.map(provider => provider.instanceId)).toEqual(['hermes', 'claudeAgent', 'codex-cli'])
    expect(snapshots.find(provider => provider.instanceId === 'claudeAgent')).toMatchObject({
      enabled: false,
      availability: 'unavailable',
      unavailableReason: 'Claude missing',
    })
    expect(selectableChatProviderOptions({ providers, models }).map(provider => provider.id)).toEqual([
      'hermes',
      'codex-cli',
    ])
  })
})
