import { render, screen } from '@testing-library/react'
import { within } from '@testing-library/dom'
import { describe, expect, it } from 'vitest'
import ProviderSettingsPanel from '../ProviderSettingsPanel'
import {
  hermesProviderSnapshot,
} from '@/chat/t3-adapters/providerSnapshots'

describe('T3 copied ProviderSettingsPanel adapter', () => {
  it('shows Hermes Agent readiness without legacy local providers or OpenClaw', () => {
    render(
      <ProviderSettingsPanel
        providers={[
          hermesProviderSnapshot([
            { id: 'gpt-5.5', name: 'GPT 5.5', provider: 'codex-lb', local: false },
          ], {
            ready: true,
            detail: 'Hermes Agent configured',
          }),
        ]}
      />,
    )

    expect(screen.getByLabelText('Hermes Agent readiness')).toBeInTheDocument()
    expect(screen.getByText('1 configured')).toBeInTheDocument()
    expect(screen.getByLabelText('Hermes Agent status')).toBeInTheDocument()
    expect(screen.queryByLabelText('Legacy local agent provider status')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Legacy local CLI provider status')).not.toBeInTheDocument()
    expect(screen.queryByText('OpenClaw')).not.toBeInTheDocument()
    expect(screen.getByText('Hermes Agent configured')).toBeInTheDocument()
    expect(screen.getAllByText('Ready')).toHaveLength(1)
    expect(screen.getAllByText('Available in chat')).toHaveLength(1)
    expect(within(screen.getByLabelText('Hermes Agent status')).getByText('1 available')).toBeInTheDocument()
  })
})
