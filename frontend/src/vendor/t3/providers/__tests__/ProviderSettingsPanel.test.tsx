import { render, screen } from '@testing-library/react'
import { within } from '@testing-library/dom'
import { describe, expect, it } from 'vitest'
import ProviderSettingsPanel from '../ProviderSettingsPanel'
import {
  claudeProviderSnapshot,
  codexCliProviderSnapshot,
  hermesProviderSnapshot,
} from '@/chat/t3-adapters/providerSnapshots'

describe('T3 copied ProviderSettingsPanel adapter', () => {
  it('shows Hermes, Claude Code, and Codex CLI readiness without OpenClaw', () => {
    render(
      <ProviderSettingsPanel
        providers={[
          hermesProviderSnapshot([
            { id: 'gpt-5.5', name: 'GPT 5.5', provider: 'codex-lb', local: false },
          ], {
            ready: true,
            detail: 'Hermes/Codex LB configured',
          }),
          claudeProviderSnapshot({
            ready: true,
            detail: 'Claude Code command found: claude',
          }),
          codexCliProviderSnapshot({
            ready: false,
            detail: 'Codex CLI command not found: codex',
          }),
        ]}
      />,
    )

    expect(screen.getByText('Chat Providers')).toBeInTheDocument()
    expect(screen.getByLabelText('Hermes provider status')).toBeInTheDocument()
    expect(screen.getByLabelText('Claude Code provider status')).toBeInTheDocument()
    expect(screen.getByLabelText('Codex CLI provider status')).toBeInTheDocument()
    expect(screen.queryByText('OpenClaw')).not.toBeInTheDocument()
    expect(screen.getByText('Hermes/Codex LB configured')).toBeInTheDocument()
    expect(screen.getByText('Claude Code command found: claude')).toBeInTheDocument()
    expect(screen.getByText('Codex CLI command not found: codex')).toBeInTheDocument()
    expect(screen.getAllByText('Ready')).toHaveLength(2)
    expect(screen.getByText('Needs setup')).toBeInTheDocument()
    expect(screen.getAllByText('Shown in chat')).toHaveLength(2)
    expect(screen.getByText('Hidden from chat')).toBeInTheDocument()
    expect(within(screen.getByLabelText('Hermes provider status')).getByText('1 available')).toBeInTheDocument()
    expect(within(screen.getByLabelText('Claude Code provider status')).getByText('Direct local provider, no model selection')).toBeInTheDocument()
  })
})
