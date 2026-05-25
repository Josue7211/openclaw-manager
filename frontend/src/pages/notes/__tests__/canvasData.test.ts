import { describe, expect, it } from 'vitest'
import {
  addCanvasNode,
  buildCanvasLinks,
  buildInitialCanvasData,
  CANVAS_NOTE_ID,
  hydrateCanvasData,
  isCanvasBoardNote,
  parseCanvasData,
  serializeCanvasNote,
} from '../canvasData'
import type { VaultNote } from '../types'

function note(overrides: Partial<VaultNote>): VaultNote {
  return {
    _id: overrides._id || 'Inbox/note.md',
    type: 'note',
    title: overrides.title || 'Note',
    content: overrides.content || '',
    folder: overrides.folder || 'Inbox',
    tags: overrides.tags || [],
    links: overrides.links || [],
    created_at: overrides.created_at || 1,
    updated_at: overrides.updated_at || 1,
    ...overrides,
  }
}

describe('canvasData', () => {
  it('serializes canvas layout into a Markdown-owned board note', () => {
    const content = serializeCanvasNote({
      version: 1,
      nodes: [{ id: 'Inbox/a.md', x: 10.2, y: 20.8, width: 220, height: 128 }],
    })

    expect(content).toContain('type: canvas')
    expect(content).toContain('```clawctrl-canvas')
    expect(parseCanvasData(content).nodes[0]).toEqual({
      id: 'Inbox/a.md',
      x: 10,
      y: 21,
      width: 220,
      height: 128,
    })
  })

  it('detects the local board note and excludes it from initial cards', () => {
    const notes = [
      note({ _id: CANVAS_NOTE_ID, title: 'Knowledge canvas', folder: 'Canvas' }),
      note({ _id: 'Inbox/a.md', title: 'A', updated_at: 3 }),
      note({ _id: 'Trash/b.md', title: 'B', folder: 'Trash', trashed_at: 3 }),
    ]

    expect(isCanvasBoardNote(notes[0])).toBe(true)
    expect(buildInitialCanvasData(notes).nodes.map((node) => node.id)).toEqual(['Inbox/a.md'])
  })

  it('hydrates stale boards from current notes and creates links from wikilinks', () => {
    const notes = [
      note({ _id: 'Inbox/a.md', title: 'Alpha', links: ['Beta'] }),
      note({ _id: 'Inbox/b.md', title: 'Beta' }),
    ]
    const data = hydrateCanvasData({ version: 1, nodes: [{ id: 'missing.md', x: 0, y: 0, width: 1, height: 1 }] }, notes)
    const withBeta = addCanvasNode(data, 'Inbox/b.md')

    expect(data.nodes.map((node) => node.id)).toEqual(['Inbox/a.md', 'Inbox/b.md'])
    expect(addCanvasNode(withBeta, 'Inbox/b.md').nodes.length).toBe(2)
    expect(buildCanvasLinks(withBeta, notes)).toEqual([{ source: 'Inbox/a.md', target: 'Inbox/b.md' }])
  })
})
