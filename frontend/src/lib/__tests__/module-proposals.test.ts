import { describe, it, expect } from 'vitest'
import {
  compileOpenUiProposalSource,
  isInstallableModuleProposal,
  type ModuleProposal,
} from '../module-proposals'
import { extractOpenUiLangFromResponse } from '../openui'

function makeProposal(
  overrides: Partial<ModuleProposal> = {},
): ModuleProposal {
  return {
    id: 'proposal-1',
    version: 1,
    title: 'Test Proposal',
    description: 'Test proposal',
    userIntent: 'Test intent',
    targetType: 'widget',
    installTarget: 'dashboard',
    category: 'status',
    capabilities: [],
    dataRequirements: [],
    actions: [],
    layout: { w: 3, h: 2 },
    tree: { primitive: 'MarkdownDisplay', props: { content: 'hello' } },
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('module-proposals', () => {
  it('treats dashboard widgets as installable', () => {
    expect(isInstallableModuleProposal(makeProposal())).toBe(true)
  })

  it('treats non-widget targets as preview-only', () => {
    expect(isInstallableModuleProposal(makeProposal({ targetType: 'page' }))).toBe(false)
  })

  it('treats non-dashboard install targets as preview-only', () => {
    expect(isInstallableModuleProposal(makeProposal({ installTarget: 'module-studio' }))).toBe(false)
  })

  it('treats backend contract proposals as preview-only', () => {
    expect(
      isInstallableModuleProposal(
        makeProposal({
          backendContract: { requested: true, summary: 'Add a query for live stats' },
        }),
      ),
    ).toBe(false)
  })

  it('compiles installable source against generated-module runtime globals, not bare window.React', () => {
    const source = compileOpenUiProposalSource(makeProposal())
    expect(source).toContain('window.__generatedModuleAPI')
    expect(source).not.toContain('window.React')
  })

  it('compiles OpenUI Lang proposals through the runtime OpenUiSnippet bridge', () => {
    const source = compileOpenUiProposalSource(
      makeProposal({ openUiLang: 'root = StatCard("Tasks", "7")' }),
    )
    expect(source).toContain('OpenUiSnippet')
    expect(source).toContain('StatCard')
  })

  it('extracts fenced OpenUI Lang from assistant responses', () => {
    expect(
      extractOpenUiLangFromResponse('```openui\nroot = MarkdownDisplay("Hello")\n```'),
    ).toBe('root = MarkdownDisplay("Hello")')
  })
})
