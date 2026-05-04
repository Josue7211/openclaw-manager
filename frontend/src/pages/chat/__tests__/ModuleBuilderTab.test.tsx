import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/api', () => ({
  api: { post: vi.fn(), get: vi.fn() },
  ApiError: class extends Error { serviceLabel = '' },
}))

vi.mock('@/lib/generated-module-store', () => ({
  saveGeneratedModule: vi.fn(),
}))

vi.mock('@/lib/module-proposal-store', () => ({
  createModuleProposal: vi.fn(),
  listModuleProposals: vi.fn(async () => []),
  updateModuleProposalStatus: vi.fn(),
}))

vi.mock('@/lib/generated-module-static-analysis', () => ({
  analyzeCode: vi.fn(() => ({ safe: true, violations: [] })),
}))

vi.mock('@/lib/generated-module-sandbox', () => ({
  buildSandboxHTML: vi.fn(() => '<html><body>sandbox</body></html>'),
  getThemeVarsCSS: vi.fn(() => ''),
}))

vi.mock('@/lib/sanitize', () => ({
  sanitizeHtml: (html: string) => html,
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
  Sparkle: (props: Record<string, unknown>) => <svg data-testid="icon-sparkle" {...props} />,
  ArrowsOutCardinal: (props: Record<string, unknown>) => <svg data-testid="icon-layout" {...props} />,
  Database: (props: Record<string, unknown>) => <svg data-testid="icon-database" {...props} />,
  Lightning: (props: Record<string, unknown>) => <svg data-testid="icon-lightning" {...props} />,
  ShieldCheck: (props: Record<string, unknown>) => <svg data-testid="icon-shield" {...props} />,
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
  buildModuleBuilderSystemPrompt,
  extractCodeFromResponse,
  extractModuleMetadata,
} from '../module-builder-prompt'

import ModuleBuilderTab from '../ModuleBuilderTab'
import { ModuleApprovalBar } from '../ModuleApprovalBar'
import { api } from '@/lib/api'
import { createModuleProposal, listModuleProposals } from '@/lib/module-proposal-store'

// ---------------------------------------------------------------------------
// Tests: module-builder-prompt.ts
// ---------------------------------------------------------------------------

describe('module-builder-prompt', () => {
  describe('buildModuleBuilderSystemPrompt', () => {
    it('returns a string containing ModuleProposal', () => {
      const prompt = buildModuleBuilderSystemPrompt()
      expect(prompt).toContain('ModuleProposal')
    })

    it('returns a string containing module builder identity', () => {
      const prompt = buildModuleBuilderSystemPrompt()
      expect(prompt).toContain('module builder')
      expect(prompt).toContain('module builder')
    })

    it('includes configSchema references for all 11 primitives', () => {
      const prompt = buildModuleBuilderSystemPrompt()
      const primitiveNames = [
        'StatCard', 'ProgressGauge', 'MarkdownDisplay',
        'LineChart', 'BarChart', 'ListView', 'DataTable',
        'FormWidget', 'KanbanBoard', 'TimerCountdown', 'ImageGallery',
      ]
      for (const name of primitiveNames) {
        expect(prompt).toContain(name)
      }
    })

    it('includes broad proposal target contract', () => {
      const prompt = buildModuleBuilderSystemPrompt()
      expect(prompt).toContain("targetType: 'widget' | 'module' | 'panel' | 'page'")
      expect(prompt).toContain("installTarget: 'dashboard' | 'module-studio' | 'category' | 'app-shell'")
    })

    it('includes proposal safety constraints', () => {
      const prompt = buildModuleBuilderSystemPrompt()
      expect(prompt).toContain('MUST NOT output executable code')
      expect(prompt).toContain('MUST NOT invent backend endpoints')
      expect(prompt).toContain('read-only')
      expect(prompt).toContain('OpenUI module proposal')
    })
  })

  describe('extractCodeFromResponse', () => {
    it('extracts code from ```javascript fence', () => {
      const text = 'Here is the code:\n```javascript\nfunction GeneratedWidget() { return null }\n```'
      const code = extractCodeFromResponse(text)
      expect(code).toBe('function GeneratedWidget() { return null }')
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
      expect(meta.name).toBe('Generated Module')
    })

    it('returns description from text before code fence', () => {
      const text = "Here's a **CPU Monitor** that displays live CPU usage.\n\n```javascript\ncode\n```"
      const meta = extractModuleMetadata(text)
      expect(meta.description.length).toBeGreaterThan(0)
    })
  })
})

// ---------------------------------------------------------------------------
// Tests: ModuleApprovalBar
// ---------------------------------------------------------------------------

describe('ModuleApprovalBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders 3 buttons', () => {
    render(
      <ModuleApprovalBar
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
      <ModuleApprovalBar
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
      <ModuleApprovalBar
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
      <ModuleApprovalBar
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
      <ModuleApprovalBar
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

describe('ModuleBuilderTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    vi.mocked(listModuleProposals).mockResolvedValue([])
    vi.mocked(createModuleProposal).mockResolvedValue({
      id: 'proposal-1',
      proposal: {} as never,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: 'test-user',
      userIntent: 'Show revenue.',
      title: 'Revenue Widget',
      description: 'Revenue snapshot.',
      category: 'finance',
      targetType: 'widget',
      installTarget: 'dashboard',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('reads the assistant reply from chat history after posting', async () => {
    const now = Date.now()
    const assistantTimestamp = new Date(now + 2_000).toISOString()

    vi.mocked(api.get)
      .mockResolvedValueOnce({ messages: [] })
      .mockResolvedValue({
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            text: '```json\n{"id":"revenue-widget","version":1,"title":"Revenue Widget","description":"Revenue snapshot.","userIntent":"Show revenue.","targetType":"widget","installTarget":"dashboard","category":"finance","capabilities":[],"dataRequirements":[],"actions":[],"layout":{"w":3,"h":2},"tree":{"primitive":"StatCard","props":{"title":"Revenue","value":"$42k","subtitle":"This week"}},"createdAt":"2026-04-18T10:00:01.000Z"}\n```',
            timestamp: assistantTimestamp,
          },
        ],
      })
    vi.mocked(api.post).mockResolvedValue({ ok: true })

    render(<ModuleBuilderTab />)

    fireEvent.change(screen.getByLabelText('Module description'), {
      target: { value: 'Build a revenue widget' },
    })
    fireEvent.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
        text: expect.stringContaining('User request: Build a revenue widget'),
        system_prompt: expect.stringContaining('ModuleProposal'),
      }))
    })

    expect(await screen.findByText(/Build a revenue widget/)).toBeInTheDocument()
    expect(await screen.findByText('Module Proposal')).toBeInTheDocument()
    expect((await screen.findAllByText(/Revenue snapshot/)).length).toBeGreaterThan(0)
    expect(api.get).toHaveBeenCalledWith('/api/chat/history')
  })

  it('shows a timeout error when chat accepts the request but no reply lands in history', async () => {
    vi.useFakeTimers()
    vi.mocked(api.get).mockResolvedValue({ messages: [] })
    vi.mocked(api.post).mockResolvedValue({ ok: true })

    render(<ModuleBuilderTab />)

    fireEvent.change(screen.getByLabelText('Module description'), {
      target: { value: 'Build a metrics widget' },
    })
    fireEvent.click(screen.getByLabelText('Send message'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(46_000)
    })

    expect(screen.getByText(/no assistant reply arrived in history before timeout/i)).toBeInTheDocument()
  }, 10_000)
})
