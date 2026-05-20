import { describe, expect, it } from 'vitest'
import { buildVaultDataRows, buildVaultTaskRows, setTaskLineDone } from '../dataMode'
import type { VaultNote } from '../types'

function note(overrides: Partial<VaultNote>): VaultNote {
  return {
    _id: 'note.md',
    type: 'note',
    title: 'Note',
    content: '',
    folder: '',
    tags: [],
    links: [],
    aliases: [],
    properties: {},
    created_at: 1,
    updated_at: 1,
    ...overrides,
  }
}

describe('vault data mode rows', () => {
  it('summarizes tasks, properties, and trash state', () => {
    const rows = buildVaultDataRows([
      note({
        _id: 'Projects/roadmap.md',
        title: 'Roadmap',
        content: '- [x] Ship\n- [ ] Polish',
        folder: 'Trash/Projects',
        tags: ['strategy'],
        properties: { status: 'active' },
        updated_at: 20,
      }),
    ])

    expect(rows).toEqual([
      expect.objectContaining({
        id: 'Projects/roadmap.md',
        tasksDone: 1,
        tasksTotal: 2,
        trashed: true,
        properties: { status: 'active' },
      }),
    ])
  })

  it('filters rows with notes query syntax and sorts newest first', () => {
    const rows = buildVaultDataRows([
      note({ _id: 'old.md', title: 'Old', folder: 'Archive', tags: ['archive'], updated_at: 1 }),
      note({ _id: 'new.md', title: 'New', folder: 'Projects', tags: ['strategy'], updated_at: 2 }),
    ], 'tag:strategy')

    expect(rows.map((row) => row.id)).toEqual(['new.md'])
  })

  it('builds an actionable task ledger from matching notes', () => {
    const rows = buildVaultTaskRows([
      note({
        _id: 'Projects/roadmap.md',
        title: 'Roadmap',
        content: '- [x] Ship\nNotes\n- [ ] Polish #next',
        folder: 'Projects',
        tags: ['strategy'],
        updated_at: 20,
      }),
      note({
        _id: 'Archive/old.md',
        title: 'Old',
        content: '- [ ] Ignore',
        folder: 'Archive',
        tags: ['archive'],
        updated_at: 30,
      }),
    ], 'tag:strategy')

    expect(rows).toEqual([
      expect.objectContaining({
        id: 'Projects/roadmap.md:3',
        noteId: 'Projects/roadmap.md',
        text: 'Polish #next',
        line: 3,
        done: false,
      }),
      expect.objectContaining({
        id: 'Projects/roadmap.md:1',
        text: 'Ship',
        done: true,
      }),
    ])
  })

  it('toggles a task line without touching neighboring markdown', () => {
    const content = '# Plan\n- [ ] Ship\n- [x] Keep'

    expect(setTaskLineDone(content, 2, true)).toBe('# Plan\n- [x] Ship\n- [x] Keep')
    expect(setTaskLineDone(content, 3, false)).toBe('# Plan\n- [ ] Ship\n- [ ] Keep')
    expect(setTaskLineDone(content, 1, true)).toBeNull()
  })
})
