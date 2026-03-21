import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/api', () => ({
  api: { post: vi.fn(), get: vi.fn() },
  ApiError: class extends Error { serviceLabel = '' },
}))

vi.mock('@/lib/bjorn-store', () => ({
  saveBjornModule: vi.fn(),
}))

vi.mock('@/lib/bjorn-static-analysis', () => ({
  analyzeCode: vi.fn(() => ({ safe: true, violations: [] })),
}))

vi.mock('@/lib/bjorn-sandbox', () => ({
  buildSandboxHTML: vi.fn(() => '<html><body>sandbox</body></html>'),
  getThemeVarsCSS: vi.fn(() => ''),
}))

vi.mock('@phosphor-icons/react', () => ({
  PaperPlaneTilt: (props: Record<string, unknown>) => <svg data-testid="icon-send" {...props} />,
  Robot: (props: Record<string, unknown>) => <svg data-testid="icon-robot" {...props} />,
  ChatCircle: (props: Record<string, unknown>) => <svg data-testid="icon-chat" {...props} />,
  ChatText: (props: Record<string, unknown>) => <svg data-testid="icon-chat-text" {...props} />,
  CheckCircle: (props: Record<string, unknown>) => <svg data-testid="icon-check" {...props} />,
  PencilSimple: (props: Record<string, unknown>) => <svg data-testid="icon-pencil" {...props} />,
  X: (props: Record<string, unknown>) => <svg data-testid="icon-x" {...props} />,
  Warning: (props: Record<string, unknown>) => <svg data-testid="icon-warning" {...props} />,
  SpinnerGap: (props: Record<string, unknown>) => <svg data-testid="icon-spinner" {...props} />,
  Eye: (props: Record<string, unknown>) => <svg data-testid="icon-eye" {...props} />,
}))

vi.mock('@/components/MarkdownBubble', () => ({
  default: ({ children }: { children: string }) => <span>{children}</span>,
}))

vi.mock('@/lib/hooks/useLocalStorageState', () => ({
  useLocalStorageState: vi.fn(() => ['test-model', vi.fn()]),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  buildBjornSystemPrompt,
  extractCodeFromResponse,
  extractModuleMetadata,
} from '../bjorn-prompt'

import { BjornApprovalBar } from '../BjornApprovalBar'

// ---------------------------------------------------------------------------
// Tests: bjorn-prompt.ts
// ---------------------------------------------------------------------------

describe('bjorn-prompt', () => {
  describe('buildBjornSystemPrompt', () => {
    it('returns a string containing BjornWidget', () => {
      const prompt = buildBjornSystemPrompt()
      expect(prompt).toContain('BjornWidget')
    })

    it('returns a string containing Bjorn identity', () => {
      const prompt = buildBjornSystemPrompt()
      expect(prompt).toContain('Bjorn')
      expect(prompt).toContain('module builder')
    })

    it('includes configSchema references for all 11 primitives', () => {
      const prompt = buildBjornSystemPrompt()
      const primitiveNames = [
        'StatCard', 'ProgressGauge', 'MarkdownDisplay',
        'LineChart', 'BarChart', 'ListView', 'DataTable',
        'FormWidget', 'KanbanBoard', 'TimerCountdown', 'ImageGallery',
      ]
      for (const name of primitiveNames) {
        expect(prompt).toContain(name)
      }
    })

    it('includes WidgetProps interface definition', () => {
      const prompt = buildBjornSystemPrompt()
      expect(prompt).toContain('widgetId')
      expect(prompt).toContain('isEditMode')
    })

    it('includes dangerous API blocklist', () => {
      const prompt = buildBjornSystemPrompt()
      expect(prompt).toContain('fetch')
      expect(prompt).toContain('eval')
      expect(prompt).toContain('document.cookie')
    })
  })

  describe('extractCodeFromResponse', () => {
    it('extracts code from ```javascript fence', () => {
      const text = 'Here is the code:\n```javascript\nfunction BjornWidget() { return null }\n```'
      const code = extractCodeFromResponse(text)
      expect(code).toBe('function BjornWidget() { return null }')
    })

    it('extracts code from ```jsx fence', () => {
      const text = '```jsx\nconst x = 1\n```'
      const code = extractCodeFromResponse(text)
      expect(code).toBe('const x = 1')
    })

    it('extracts code from plain ``` fence', () => {
      const text = 'Code:\n```\nfoo()\n```'
      const code = extractCodeFromResponse(text)
      expect(code).toBe('foo()')
    })

    it('returns null when no code fence found', () => {
      const text = 'No code here, just a conversation.'
      const code = extractCodeFromResponse(text)
      expect(code).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(extractCodeFromResponse('')).toBeNull()
    })

    it('extracts only the first code fence', () => {
      const text = '```javascript\nfirst()\n```\n\n```javascript\nsecond()\n```'
      const code = extractCodeFromResponse(text)
      expect(code).toBe('first()')
    })
  })

  describe('extractModuleMetadata', () => {
    it('extracts name from "Here\'s a Weather module"', () => {
      const text = "Here's a **Weather Status** module that shows temperature.\n\n```javascript\ncode\n```"
      const meta = extractModuleMetadata(text)
      expect(meta.name).toBe('Weather Status')
    })

    it('extracts name from "I\'ve created a ..." pattern', () => {
      const text = "I've created a **Task Tracker** widget.\n\n```javascript\ncode\n```"
      const meta = extractModuleMetadata(text)
      expect(meta.name).toBe('Task Tracker')
    })

    it('falls back to default name when no pattern matches', () => {
      const text = 'Sure, let me help you with that.'
      const meta = extractModuleMetadata(text)
      expect(meta.name).toBe('Bjorn Module')
    })

    it('returns description from text before code fence', () => {
      const text = "Here's a **CPU Monitor** that displays live CPU usage.\n\n```javascript\ncode\n```"
      const meta = extractModuleMetadata(text)
      expect(meta.description.length).toBeGreaterThan(0)
    })
  })
})

// ---------------------------------------------------------------------------
// Tests: BjornApprovalBar
// ---------------------------------------------------------------------------

describe('BjornApprovalBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders 3 buttons', () => {
    render(
      <BjornApprovalBar
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
        disabled={false}
        generationState="previewing"
      />
    )
    expect(screen.getByLabelText('Approve module')).toBeInTheDocument()
    expect(screen.getByLabelText('Request changes')).toBeInTheDocument()
    expect(screen.getByLabelText('Reject module')).toBeInTheDocument()
  })

  it('buttons are disabled when generationState is idle', () => {
    render(
      <BjornApprovalBar
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
        disabled={false}
        generationState="idle"
      />
    )
    expect(screen.getByLabelText('Approve module')).toBeDisabled()
    expect(screen.getByLabelText('Request changes')).toBeDisabled()
    expect(screen.getByLabelText('Reject module')).toBeDisabled()
  })

  it('buttons are enabled when generationState is previewing', () => {
    render(
      <BjornApprovalBar
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
        disabled={false}
        generationState="previewing"
      />
    )
    expect(screen.getByLabelText('Approve module')).not.toBeDisabled()
    expect(screen.getByLabelText('Request changes')).not.toBeDisabled()
    expect(screen.getByLabelText('Reject module')).not.toBeDisabled()
  })

  it('buttons are disabled when disabled prop is true', () => {
    render(
      <BjornApprovalBar
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
        disabled={true}
        generationState="previewing"
      />
    )
    expect(screen.getByLabelText('Approve module')).toBeDisabled()
    expect(screen.getByLabelText('Request changes')).toBeDisabled()
    expect(screen.getByLabelText('Reject module')).toBeDisabled()
  })

  it('buttons are disabled when generationState is generating', () => {
    render(
      <BjornApprovalBar
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
        disabled={false}
        generationState="generating"
      />
    )
    expect(screen.getByLabelText('Approve module')).toBeDisabled()
  })
})
