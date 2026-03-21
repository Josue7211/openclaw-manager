import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — must be declared before the import of the component under test
// ---------------------------------------------------------------------------

vi.mock('@/lib/bjorn-static-analysis', () => ({
  analyzeCode: vi.fn(),
}))

vi.mock('@/lib/bjorn-sandbox', () => ({
  buildSandboxHTML: vi.fn(() => '<html><body>sandbox</body></html>'),
  getThemeVarsCSS: vi.fn(() => ''),
}))

vi.mock('@/lib/api', () => ({
  api: { post: vi.fn() },
}))

// Phosphor icons — simple stubs
vi.mock('@phosphor-icons/react', () => ({
  Robot: (props: Record<string, unknown>) => <svg data-testid="icon-robot" {...props} />,
  Warning: (props: Record<string, unknown>) => <svg data-testid="icon-warning" {...props} />,
  SpinnerGap: (props: Record<string, unknown>) => <svg data-testid="icon-spinner" {...props} />,
  Eye: (props: Record<string, unknown>) => <svg data-testid="icon-eye" {...props} />,
}))

import { analyzeCode } from '@/lib/bjorn-static-analysis'
import { BjornPreview } from '../BjornPreview'

const mockAnalyzeCode = analyzeCode as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BjornPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /* ── Empty state ──────────────────────────────────────────────────── */

  it('renders empty state when source is empty string', () => {
    mockAnalyzeCode.mockReturnValue({ safe: true, violations: [] })
    render(<BjornPreview source="" generationState="idle" />)
    expect(screen.getByText(/describe a module/i)).toBeInTheDocument()
  })

  /* ── Loading state ────────────────────────────────────────────────── */

  it('renders loading skeleton when generationState is generating', () => {
    mockAnalyzeCode.mockReturnValue({ safe: true, violations: [] })
    render(<BjornPreview source="" generationState="generating" />)
    expect(screen.getByText(/generating module/i)).toBeInTheDocument()
  })

  /* ── Violation state ──────────────────────────────────────────────── */

  it('renders violation list when source contains dangerous code', () => {
    mockAnalyzeCode.mockReturnValue({
      safe: false,
      violations: [
        { pattern: '\\bfetch\\s*\\(', line: 3, snippet: 'fetch("http://evil.com")' },
      ],
    })
    render(<BjornPreview source='fetch("http://evil.com")' generationState="previewing" />)
    expect(screen.getByText(/static analysis found 1 issue/i)).toBeInTheDocument()
    expect(screen.getByText(/fetch/i)).toBeInTheDocument()
  })

  /* ── Iframe render (safe code) ────────────────────────────────────── */

  it('renders iframe when source is safe', () => {
    mockAnalyzeCode.mockReturnValue({ safe: true, violations: [] })
    render(<BjornPreview source="function BjornWidget() {}" generationState="previewing" />)
    const iframe = screen.getByTitle('Module Preview')
    expect(iframe).toBeInTheDocument()
  })

  it('iframe has sandbox="allow-scripts" attribute', () => {
    mockAnalyzeCode.mockReturnValue({ safe: true, violations: [] })
    render(<BjornPreview source="function BjornWidget() {}" generationState="previewing" />)
    const iframe = screen.getByTitle('Module Preview')
    expect(iframe).toHaveAttribute('sandbox', 'allow-scripts')
  })

  it('iframe does NOT have allow-same-origin in sandbox attribute', () => {
    mockAnalyzeCode.mockReturnValue({ safe: true, violations: [] })
    render(<BjornPreview source="function BjornWidget() {}" generationState="previewing" />)
    const iframe = screen.getByTitle('Module Preview')
    const sandbox = iframe.getAttribute('sandbox') ?? ''
    expect(sandbox).not.toContain('allow-same-origin')
  })

  it('iframe uses srcdoc attribute', () => {
    mockAnalyzeCode.mockReturnValue({ safe: true, violations: [] })
    render(<BjornPreview source="function BjornWidget() {}" generationState="previewing" />)
    const iframe = screen.getByTitle('Module Preview')
    expect(iframe).toHaveAttribute('srcdoc')
  })
})
