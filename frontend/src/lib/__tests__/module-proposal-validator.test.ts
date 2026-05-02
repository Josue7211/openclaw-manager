import { describe, it, expect } from 'vitest'
import { validateModuleProposal } from '../module-proposal-validator'

describe('validateModuleProposal', () => {
  it('accepts a minimal installable widget proposal', () => {
    const result = validateModuleProposal({
      id: 'proposal-1',
      version: 1,
      title: 'Test',
      description: 'Test',
      userIntent: 'Show data',
      targetType: 'widget',
      installTarget: 'dashboard',
      category: 'status',
      capabilities: ['read.todos'],
      dataRequirements: [],
      actions: [],
      layout: { w: 3, h: 2 },
      tree: { primitive: 'MarkdownDisplay', props: { content: 'hello' } },
      createdAt: new Date().toISOString(),
    })

    expect(result.ok).toBe(true)
    expect(result.normalized?.layout.w).toBeGreaterThanOrEqual(2)
  })

  it('rejects backend contracts with missing summary', () => {
    const result = validateModuleProposal({
      id: 'proposal-2',
      version: 1,
      title: 'Contracted Module',
      description: 'Test',
      userIntent: 'Need backend support',
      targetType: 'page',
      installTarget: 'app-shell',
      category: 'system',
      capabilities: [],
      dataRequirements: [],
      actions: [],
      layout: { w: 4, h: 3 },
      tree: { primitive: 'MarkdownDisplay', props: { content: 'hello' } },
      backendContract: { requested: true },
      createdAt: new Date().toISOString(),
    })

    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('backendContract.summary')
  })
})
