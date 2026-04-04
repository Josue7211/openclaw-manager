import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseOpenClawModels = vi.fn()

vi.mock('@/hooks/useOpenClawModels', () => ({
  useOpenClawModels: () => mockUseOpenClawModels(),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import ModelsTab from '../ModelsTab'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWithQC(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(createElement(QueryClientProvider, { client: qc }, ui))
}

const mockModel1 = {
  id: 'claude-sonnet-4-6',
  name: 'Claude Sonnet 4.6',
  provider: 'anthropic',
  max_tokens: 200000,
  input_cost_per_token: 0.000003,
  output_cost_per_token: 0.000015,
}

const mockModel2 = {
  id: 'gpt-4',
  name: 'GPT-4',
  provider: 'openai',
  max_tokens: 128000,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModelsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without throwing when healthy with model data', () => {
    mockUseOpenClawModels.mockReturnValue({
      models: { models: [mockModel1, mockModel2] },
      loading: false,
      error: null,
    })

    renderWithQC(<ModelsTab healthy={true} />)

    expect(screen.getByText('Claude Sonnet 4.6')).toBeInTheDocument()
    expect(screen.getByText('GPT-4')).toBeInTheDocument()
  })

  it('shows provider badges', () => {
    mockUseOpenClawModels.mockReturnValue({
      models: { models: [mockModel1, mockModel2] },
      loading: false,
      error: null,
    })

    renderWithQC(<ModelsTab healthy={true} />)

    expect(screen.getByText('anthropic')).toBeInTheDocument()
    expect(screen.getByText('openai')).toBeInTheDocument()
  })

  it('shows max_tokens display', () => {
    mockUseOpenClawModels.mockReturnValue({
      models: { models: [mockModel1] },
      loading: false,
      error: null,
    })

    renderWithQC(<ModelsTab healthy={true} />)

    expect(screen.getByText('200,000 max tokens')).toBeInTheDocument()
  })

  it('shows cost info for models with pricing', () => {
    mockUseOpenClawModels.mockReturnValue({
      models: { models: [mockModel1] },
      loading: false,
      error: null,
    })

    renderWithQC(<ModelsTab healthy={true} />)

    // input_cost_per_token: 0.000003 => $0.00000300
    expect(screen.getByText(/Input: \$0\.00000300\/token/)).toBeInTheDocument()
    // output_cost_per_token: 0.000015 => $0.00001500
    expect(screen.getByText(/Output: \$0\.00001500\/token/)).toBeInTheDocument()
  })

  it('shows "OpenClaw is not configured" when healthy is false', () => {
    renderWithQC(<ModelsTab healthy={false} />)

    expect(screen.getByText('OpenClaw is not configured.')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    mockUseOpenClawModels.mockReturnValue({
      models: undefined,
      loading: true,
      error: null,
    })

    renderWithQC(<ModelsTab healthy={true} />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows "No models available" when models list is empty', () => {
    mockUseOpenClawModels.mockReturnValue({
      models: { models: [] },
      loading: false,
      error: null,
    })

    renderWithQC(<ModelsTab healthy={true} />)

    expect(screen.getByText('No models available')).toBeInTheDocument()
  })

  it('handles LiteLLM format with data key instead of models key', () => {
    // LiteLLM returns { data: [...] } instead of { models: [...] }
    mockUseOpenClawModels.mockReturnValue({
      models: { data: [mockModel1], models: undefined },
      loading: false,
      error: null,
    })

    renderWithQC(<ModelsTab healthy={true} />)

    // Should still render the model from the data key
    expect(screen.getByText('Claude Sonnet 4.6')).toBeInTheDocument()
    expect(screen.getByText('anthropic')).toBeInTheDocument()
  })

  it('shows "Unknown" provider when provider is missing', () => {
    const modelNoProvider = { id: 'custom-model', name: 'Custom Model' }
    mockUseOpenClawModels.mockReturnValue({
      models: { models: [modelNoProvider] },
      loading: false,
      error: null,
    })

    renderWithQC(<ModelsTab healthy={true} />)

    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('falls back to model id when name is missing', () => {
    const modelNoName = { id: 'raw-model-id', provider: 'test' }
    mockUseOpenClawModels.mockReturnValue({
      models: { models: [modelNoName] },
      loading: false,
      error: null,
    })

    renderWithQC(<ModelsTab healthy={true} />)

    expect(screen.getByText('raw-model-id')).toBeInTheDocument()
  })

  it('shows "No models available" when models response is null', () => {
    mockUseOpenClawModels.mockReturnValue({
      models: null,
      loading: false,
      error: null,
    })

    renderWithQC(<ModelsTab healthy={true} />)

    expect(screen.getByText('No models available')).toBeInTheDocument()
  })
})
