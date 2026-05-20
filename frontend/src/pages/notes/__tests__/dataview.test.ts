import { describe, expect, it } from 'vitest'
import { parseDataviewQuery, renderDataviewBlocks } from '../dataview'
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

const notes = [
  note({
    _id: 'Projects/roadmap.md',
    title: 'Roadmap',
    folder: 'Projects',
    tags: ['strategy'],
    properties: { status: 'active' },
    content: '- [x] Ship\n- [ ] Polish',
    updated_at: 20,
  }),
  note({
    _id: 'Archive/old.md',
    title: 'Old',
    folder: 'Archive',
    tags: ['archive'],
    properties: { status: 'done' },
    updated_at: 10,
  }),
]

describe('dataview query blocks', () => {
  it('parses table fields, filters, sort, and limit', () => {
    expect(parseDataviewQuery('TABLE title, status, tasks FROM tag:strategy SORT updated asc LIMIT 5'))
      .toEqual(expect.objectContaining({
        mode: 'table',
        fields: ['title', 'status', 'tasks'],
        filter: 'tag:strategy',
        sortKey: 'updated',
        sortDir: 'asc',
        limit: 5,
      }))
  })

  it('renders local table results from vault notes', () => {
    const markdown = [
      'Before',
      '```dataview',
      'TABLE title, status, tasks FROM tag:strategy LIMIT 10',
      '```',
      'After',
    ].join('\n')

    expect(renderDataviewBlocks(markdown, notes)).toContain('| [[Projects/roadmap.md\\|Roadmap]] | active | 1/2 |')
    expect(renderDataviewBlocks(markdown, notes)).not.toContain('Archive/old.md')
  })

  it('renders local list results and excludes the current note', () => {
    const markdown = [
      '```dataview',
      'LIST FROM folder:Projects',
      '```',
    ].join('\n')

    expect(renderDataviewBlocks(markdown, notes, 'Projects/roadmap.md')).toBe('> No matching local notes.')
  })
})
