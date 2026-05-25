import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import GraphView from '../GraphView'
import type { VaultNote } from '../types'

vi.mock('react-force-graph-2d', () => ({
  default: vi.fn(() => <div data-testid="force-graph" />),
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(() => Promise.resolve({ data: { content: '' } })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

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

describe('GraphView', () => {
  const notes = [
    note({
      _id: 'Projects/source.md',
      title: 'Source',
      links: ['Target'],
    }),
    note({
      _id: 'Projects/target.md',
      title: 'Target',
      links: [],
    }),
  ]

  it('persists graph search and scope controls', async () => {
    localStorage.clear()

    render(<GraphView notes={notes} selectedId="Projects/source.md" onSelectNote={vi.fn()} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Filter graph nodes' }), {
      target: { value: 'folder:Projects' },
    })
    fireEvent.click(screen.getByLabelText('Focus'))
    fireEvent.click(screen.getByLabelText('Hide orphans'))
    fireEvent.click(screen.getByLabelText('Local'))
    fireEvent.change(screen.getByRole('combobox', { name: 'Group graph nodes' }), {
      target: { value: 'folder' },
    })

    await waitFor(() => {
      expect(localStorage.getItem('mc-notes-graph-search')).toBe('"folder:Projects"')
      expect(localStorage.getItem('mc-notes-graph-focus-matches')).toBe('true')
      expect(localStorage.getItem('mc-notes-graph-hide-orphans')).toBe('true')
      expect(localStorage.getItem('mc-notes-graph-local')).toBe('true')
      expect(localStorage.getItem('mc-notes-graph-group-mode')).toBe('"folder"')
      expect(Number(JSON.parse(localStorage.getItem('mc-notes-graph-settings-updated-at') || '0'))).toBeGreaterThan(0)
    })
  })
})
