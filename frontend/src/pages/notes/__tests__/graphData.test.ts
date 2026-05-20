import { describe, expect, it } from 'vitest'
import { buildGraphData, filterGraphNotes, graphMatchedIds } from '../graphData'
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
    created_at: 1,
    updated_at: 1,
    ...overrides,
  }
}

const notes = [
  note({
    _id: 'Projects/roadmap.md',
    title: 'Roadmap',
    content: 'Launch plan',
    folder: 'Projects',
    tags: ['strategy'],
    links: ['Brief'],
  }),
  note({
    _id: 'Projects/brief.md',
    title: 'Project Brief',
    aliases: ['Brief'],
    folder: 'Projects',
    tags: ['planning'],
    links: [],
  }),
  note({
    _id: 'Archive/orphan.md',
    title: 'Orphan',
    folder: 'Archive',
    tags: ['archive'],
    links: [],
  }),
]

describe('graph data helpers', () => {
  it('builds links through aliases and stores cluster labels', () => {
    const graph = buildGraphData(notes)

    expect(graph.links).toEqual([{ source: 'Projects/roadmap.md', target: 'Projects/brief.md' }])
    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'Projects/roadmap.md', links: 1, cluster: 'strategy' }),
      expect.objectContaining({ id: 'Projects/brief.md', links: 1, cluster: 'planning' }),
    ]))
  })

  it('matches graph filters by tag, folder, and content', () => {
    expect([...graphMatchedIds(notes, 'launch tag:strategy')]).toEqual(['Projects/roadmap.md'])
    expect(filterGraphNotes(notes, 'folder:Projects', { focusMatches: true }).map((item) => item._id))
      .toEqual(['Projects/roadmap.md', 'Projects/brief.md'])
  })

  it('can hide orphan nodes', () => {
    expect(filterGraphNotes(notes, '', { hideOrphans: true }).map((item) => item._id))
      .toEqual(['Projects/roadmap.md', 'Projects/brief.md'])
  })
})
