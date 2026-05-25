import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { NotConfiguredBanner } from '../NotConfiguredBanner'

function LocationProbe() {
  const location = useLocation()
  return <div aria-label="Current location">{location.pathname}{location.search}</div>
}

function renderBanner() {
  return render(
    <MemoryRouter initialEntries={['/chat']}>
      <NotConfiguredBanner />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('NotConfiguredBanner', () => {
  it('shows Hermes Agent recovery actions and env fallback', () => {
    renderBanner()

    expect(screen.getByText('Hermes Agent not configured')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connections' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hermes Agent' })).toBeInTheDocument()
    expect(screen.getByText(/Settings > Connections/)).toBeInTheDocument()
    expect(screen.getByText(/HERMES_WS=ws:\/\/your-hermes-host:18789/)).toBeInTheDocument()
    expect(screen.getByText(/HERMES_PASSWORD=your-password/)).toBeInTheDocument()
    expect(screen.getByText(/HERMES_API_URL=http:\/\/your-hermes-host:3001/)).toBeInTheDocument()
    expect(screen.getByText(/HERMES_API_KEY=your-api-key/)).toBeInTheDocument()
    expect(screen.queryByText(/Claude|Codex|OpenClaw|Agent Zero/i)).not.toBeInTheDocument()
  })

  it('navigates directly to the matching settings sections', () => {
    renderBanner()

    fireEvent.click(screen.getByRole('button', { name: 'Connections' }))
    expect(screen.getByLabelText('Current location')).toHaveTextContent('/settings?section=connections')

    fireEvent.click(screen.getByRole('button', { name: 'Hermes Agent' }))
    expect(screen.getByLabelText('Current location')).toHaveTextContent('/settings?section=hermes-agent')
  })
})
