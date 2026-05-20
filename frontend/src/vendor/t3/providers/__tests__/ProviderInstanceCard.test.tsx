import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ProviderInstanceCard, {
  deriveProviderModelsForDisplay,
  providerConfigurationRows,
} from '../ProviderInstanceCard'
import { deriveProviderInstanceEntries } from '../providerInstances'
import {
  claudeProviderSnapshot,
  codexCliProviderSnapshot,
  hermesProviderSnapshot,
} from '@/chat/t3-adapters/providerSnapshots'

describe('T3 copied ProviderInstanceCard adapter', () => {
  it('derives display models with server models before persisted custom models', () => {
    const models = deriveProviderModelsForDisplay({
      liveModels: [
        { slug: 'gpt-5.5', name: 'GPT 5.5', isCustom: false, capabilities: null },
        { slug: 'claude-custom', name: 'Claude Custom Live', isCustom: true, capabilities: null },
      ],
      customModels: ['claude-custom', 'local-only'],
    })

    expect(models).toEqual([
      expect.objectContaining({ slug: 'gpt-5.5', name: 'GPT 5.5', isCustom: false }),
      expect.objectContaining({ slug: 'claude-custom', name: 'Claude Custom Live', isCustom: true }),
      expect.objectContaining({ slug: 'local-only', name: 'local-only', isCustom: true }),
    ])
  })

  it('renders provider status, setup, picker visibility, and models from the T3 card layer', () => {
    const [entry] = deriveProviderInstanceEntries([
      hermesProviderSnapshot([
        { id: 'gpt-5.5', name: 'GPT 5.5', provider: 'codex-lb', local: false },
      ], {
        ready: true,
        detail: 'Hermes/Codex LB configured',
      }),
    ])

    render(<ProviderInstanceCard entry={entry!} customModels={['local-custom']} />)

    expect(screen.getByLabelText('Hermes provider status')).toHaveAttribute('data-provider-instance-card', 'hermes')
    expect(screen.getByText('Hermes/Codex LB configured')).toBeInTheDocument()
    expect(screen.getByText('Codex LB runtime config')).toBeInTheDocument()
    expect(screen.getByText('Shown in chat')).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('Configuration')).toBeInTheDocument()
    expect(screen.getByText('Hermes / Codex LB')).toBeInTheDocument()
    expect(screen.getByText('HERMES_API_URL or HARNESS_API_URL')).toBeInTheDocument()
    expect(screen.getByText('GPT 5.5')).toBeInTheDocument()
    expect(screen.getByText('local-custom custom')).toBeInTheDocument()
  })

  it('exposes direct provider setup/config knobs from the T3 settings card layer', () => {
    const [, claudeEntry, codexEntry] = deriveProviderInstanceEntries([
      hermesProviderSnapshot(),
      claudeProviderSnapshot({ ready: true, detail: 'Claude Code command found: claude' }),
      codexCliProviderSnapshot({ ready: true, detail: 'Codex CLI command found: codex' }),
    ])

    expect(providerConfigurationRows(claudeEntry!)).toEqual([
      { label: 'Binary', value: 'CLAWCONTROL_CLAUDE_COMMAND or claude' },
      { label: 'Home', value: 'CLAWCONTROL_CLAUDE_HOME or default HOME' },
      { label: 'Runtime', value: 'CLAWCONTROL_NODE_COMMAND or node' },
      { label: 'Mode', value: 'one-shot --print, no session persistence' },
    ])
    expect(providerConfigurationRows(codexEntry!)).toEqual([
      { label: 'Binary', value: 'CLAWCONTROL_CODEX_COMMAND or codex' },
      { label: 'Mode', value: 'codex exec one-shot' },
      { label: 'Sandbox', value: 'read-only, ephemeral' },
      { label: 'Output', value: '--output-last-message file, stdout fallback' },
    ])
  })
})
