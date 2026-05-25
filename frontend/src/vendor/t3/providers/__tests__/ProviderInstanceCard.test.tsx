import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ProviderInstanceCard, {
  deriveProviderModelsForDisplay,
} from '../ProviderInstanceCard'
import { deriveProviderInstanceEntries } from '../providerInstances'
import {
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
        detail: 'Hermes Agent configured',
      }),
    ])

    render(<ProviderInstanceCard entry={entry!} customModels={['local-custom']} />)

    expect(screen.getByLabelText('Hermes Agent status')).toHaveAttribute('data-provider-instance-card', 'hermes')
    expect(screen.getByText('Hermes Agent configured')).toBeInTheDocument()
    expect(screen.getByText('Hermes Agent runtime config')).toBeInTheDocument()
    expect(screen.getByText('Available in chat')).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('Configuration')).toBeInTheDocument()
    expect(screen.getAllByText('Hermes Agent').length).toBeGreaterThan(0)
    expect(screen.getByText('HERMES_API_URL')).toBeInTheDocument()
    expect(screen.getByText('GPT 5.5')).toBeInTheDocument()
    expect(screen.getByText('local-custom custom')).toBeInTheDocument()
  })

})
