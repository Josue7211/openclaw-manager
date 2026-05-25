import { describe, expect, it } from 'vitest'
import { buildDocumentInfo, formatDocumentInfoValue } from '@/features/notes/documentInfo'
import type { VaultNote } from '../types'

function note(overrides: Partial<VaultNote> = {}): VaultNote {
  return {
    _id: 'Projects/plan.md',
    type: 'note',
    title: 'Plan',
    content: '# Plan\n\nAlpha beta [[Target]] #strategy',
    folder: 'Projects',
    tags: ['strategy'],
    links: ['Target'],
    aliases: ['Roadmap'],
    properties: { status: 'draft', owner: ['local', 'private'] },
    created_at: 10,
    updated_at: 20,
    ...overrides,
  }
}

describe('documentInfo', () => {
  it('summarizes note ownership, metadata, and stats', () => {
    const info = buildDocumentInfo(note())

    expect(info.fullPath).toBe('Projects/Plan')
    expect(info.tags).toEqual(['strategy'])
    expect(info.aliases).toEqual(['Roadmap'])
    expect(info.properties).toContainEqual({ key: 'owner', value: 'local, private', kind: 'list' })
    expect(buildDocumentInfo(note({ properties: { done: 'true', estimate: '3', due: '2026-05-21' } })).properties).toEqual([
      { key: 'done', value: 'true', kind: 'checkbox' },
      { key: 'estimate', value: '3', kind: 'number' },
      { key: 'due', value: '2026-05-21', kind: 'date' },
    ])
    expect(info.stats).toEqual(expect.objectContaining({ words: 5, links: 1, tags: 1 }))
  })

  it('does not calculate document stats for attachments', () => {
    const info = buildDocumentInfo(note({ type: 'attachment', content: '', title: 'diagram.png' }))

    expect(info.stats).toBeNull()
    expect(formatDocumentInfoValue(['a', 'b'])).toBe('a, b')
  })
})
