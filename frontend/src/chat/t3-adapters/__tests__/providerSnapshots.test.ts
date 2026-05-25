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
  it('defaults to Hermes Agent only when the backend does not advertise local providers', () => {
    const snapshots = normalizeChatProviderSnapshots({
      providers: [{ id: 'hermes', name: 'Hermes Agent', ready: true, selectable: true }],
      models,
    })

    expect(snapshots.map(provider => provider.instanceId)).toEqual(['hermes'])
    expect(selectableChatProviderOptions({
      providers: [{ id: 'hermes', name: 'Hermes Agent', ready: true, selectable: true }],
      models,
    })).toEqual([
      expect.objectContaining({ id: 'hermes', name: 'Hermes Agent', modelBacked: true, local: false }),
    ])
  })

  it('ignores legacy local provider entries while keeping Hermes models', () => {
    const providers = [
      { id: 'hermes', name: 'Hermes Agent', ready: true, selectable: true },
      { id: 'claudeAgent', name: 'Claude Code', ready: true, selectable: true },
      { id: 'codex-cli', name: 'Codex CLI', ready: true, selectable: true },
    ]

    const snapshots = normalizeChatProviderSnapshots({ providers, models })
    const hermes = snapshots.find(provider => provider.instanceId === 'hermes')

    expect(snapshots.map(provider => provider.instanceId)).toEqual(['hermes'])
    expect(hermes?.driver).toBe('hermes')
    expect(hermes?.models.map(model => model.slug)).toEqual(['gpt-5.5', 'o3'])

    expect(selectableChatProviderOptions({ providers, models })).toEqual([
      expect.objectContaining({ id: 'hermes', modelBacked: true, local: false }),
    ])
  })

  it('keeps unavailable Hermes visible with readiness detail', () => {
    const providers = [
      { id: 'hermes', name: 'Hermes Agent', ready: false, selectable: true, detail: 'Hermes missing' },
      { id: 'claudeAgent', name: 'Claude Code', ready: false, selectable: false, detail: 'Claude missing' },
      { id: 'codex-cli', name: 'Codex CLI', ready: true, selectable: true },
      { id: 'openclaw', name: 'OpenClaw', ready: true, selectable: true },
    ]

    const snapshots = normalizeChatProviderSnapshots({ providers, models })

    expect(snapshots.map(provider => provider.instanceId)).toEqual(['hermes'])
    expect(snapshots.find(provider => provider.instanceId === 'hermes')).toMatchObject({
      enabled: false,
      availability: 'unavailable',
      unavailableReason: 'Hermes missing',
    })
    expect(selectableChatProviderOptions({ providers, models })).toEqual([
      expect.objectContaining({ id: 'hermes', available: false, unavailableReason: 'Hermes missing' }),
    ])
  })

  it('normalizes legacy readiness details before exposing Hermes status', () => {
    expect(selectableChatProviderOptions({
      providers: [
        { id: 'hermes', name: 'Hermes Agent', ready: false, selectable: true, detail: 'harness_not_configured' },
      ],
      models,
    })).toEqual([
      expect.objectContaining({
        id: 'hermes',
        available: false,
        unavailableReason: 'Hermes Agent is not configured. Open Settings > Connections to connect it.',
      }),
    ])

    expect(selectableChatProviderOptions({
      providers: [
        { id: 'hermes', name: 'Hermes Agent', ready: false, selectable: true, detail: 'Claude Code is not installed' },
      ],
      models,
    })).toEqual([
      expect.objectContaining({
        id: 'hermes',
        available: false,
        unavailableReason: 'Hermes Agent is the active agent right now.',
      }),
    ])
  })
})
