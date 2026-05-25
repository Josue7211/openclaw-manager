import { describe, expect, it } from 'vitest'
import { buildGraphData, filterGraphNotes, filterLocalGraphNotes, graphMatchedIds } from '../graphData'
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

  it('supports graph grouping by tag, folder, type, or no cluster', () => {
    expect(buildGraphData(notes, { groupMode: 'tag' }).nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'Projects/roadmap.md', cluster: 'strategy' }),
    ]))
    expect(buildGraphData(notes, { groupMode: 'folder' }).nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'Projects/roadmap.md', cluster: 'Projects' }),
    ]))
    expect(buildGraphData(notes, { groupMode: 'type' }).nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'Projects/roadmap.md', cluster: 'note' }),
    ]))
    expect(buildGraphData(notes, { groupMode: 'none' }).nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'Projects/roadmap.md', cluster: 'vault' }),
    ]))
  })

  it('builds graph links through Obsidian heading and block subpaths', () => {
    const graph = buildGraphData([
      note({
        _id: 'Projects/source.md',
        title: 'Source',
        links: ['Brief#Launch Plan', 'Project Brief#^block-a'],
      }),
      note({
        _id: 'Projects/brief.md',
        title: 'Project Brief',
        aliases: ['Brief'],
      }),
    ])

    expect(graph.links).toEqual([{ source: 'Projects/source.md', target: 'Projects/brief.md' }])
    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'Projects/source.md', links: 2 }),
      expect.objectContaining({ id: 'Projects/brief.md', links: 2 }),
    ]))
  })

  it('builds graph links from frontmatter property links', () => {
    const graph = buildGraphData([
      note({
        _id: 'Projects/source.md',
        title: 'Source',
        properties: {
          related: '[[Project Brief#Launch Plan]]',
          parent: 'Projects/roadmap.md',
        },
      }),
      note({
        _id: 'Projects/brief.md',
        title: 'Project Brief',
      }),
      note({
        _id: 'Projects/roadmap.md',
        title: 'Roadmap',
      }),
    ])

    expect(graph.links).toEqual([
      { source: 'Projects/source.md', target: 'Projects/brief.md' },
      { source: 'Projects/source.md', target: 'Projects/roadmap.md' },
    ])
    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'Projects/source.md', links: 2 }),
      expect.objectContaining({ id: 'Projects/brief.md', links: 1 }),
      expect.objectContaining({ id: 'Projects/roadmap.md', links: 1 }),
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

  it('builds a one-hop local graph around the selected note', () => {
    const localNotes = filterLocalGraphNotes([
      ...notes,
      note({
        _id: 'Projects/inbound.md',
        title: 'Inbound',
        links: ['Roadmap#Launch Plan'],
      }),
      note({
        _id: 'Projects/second-hop.md',
        title: 'Second hop',
        links: ['Inbound'],
      }),
    ], 'Projects/roadmap.md')

    expect(localNotes.map((item) => item._id)).toEqual([
      'Projects/roadmap.md',
      'Projects/brief.md',
      'Projects/inbound.md',
    ])
  })

  it('includes property links in one-hop local graph neighborhoods', () => {
    const localNotes = filterLocalGraphNotes([
      ...notes,
      note({
        _id: 'Projects/property-source.md',
        title: 'Property source',
        properties: { related: '[[Roadmap]]' },
      }),
      note({
        _id: 'Projects/property-target.md',
        title: 'Property target',
        properties: { related: '[[Project Brief]]' },
      }),
    ], 'Projects/roadmap.md')

    expect(localNotes.map((item) => item._id)).toEqual([
      'Projects/roadmap.md',
      'Projects/brief.md',
      'Projects/property-source.md',
    ])
  })
})
