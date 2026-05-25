import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { NotesCommandPalette, rankCommandActions, type CommandAction } from '../NotesCommandPalette'

const Icon = () => null

function action(overrides: Partial<CommandAction>): CommandAction {
  return {
    id: 'action',
    label: 'Action',
    icon: Icon,
    onRun: vi.fn(),
    ...overrides,
  }
}

describe('rankCommandActions', () => {
  it('uses rank to surface recent or pinned notes when no query is entered', () => {
    const ranked = rankCommandActions([
      action({ id: 'note:old', label: 'Old note', rank: 0 }),
      action({ id: 'note:recent', label: 'Recent note', rank: 30 }),
      action({ id: 'new-note', label: 'New note', rank: 20 }),
    ], '')

    expect(ranked.map(item => item.id)).toEqual(['note:recent', 'new-note', 'note:old'])
  })

  it('matches command aliases and keywords, not only visible labels', () => {
    const ranked = rankCommandActions([
      action({ id: 'graph', label: 'Open graph view', keywords: ['connections map'] }),
      action({ id: 'note', label: 'Meeting notes' }),
    ], 'connections')

    expect(ranked.map(item => item.id)).toEqual(['graph'])
  })

  it('supports fuzzy quick-switcher matching', () => {
    const ranked = rankCommandActions([
      action({ id: 'alpha', label: 'Project Alpha' }),
      action({ id: 'beta', label: 'Project Beta' }),
    ], 'pa')

    expect(ranked[0].id).toBe('alpha')
  })

  it('matches multi-word queries across labels and keywords', () => {
    const ranked = rankCommandActions([
      action({ id: 'rename-alpha', label: 'Rename tag #project/alpha', keywords: ['tag', 'alpha'] }),
      action({ id: 'open-alpha', label: 'Project Alpha' }),
    ], 'rename project alpha')

    expect(ranked.map(item => item.id)).toEqual(['rename-alpha'])
  })
})

describe('NotesCommandPalette', () => {
  function renderPalette(query = '') {
    const firstRun = vi.fn()
    const secondRun = vi.fn()
    const thirdRun = vi.fn()
    const onQueryChange = vi.fn()
    const onClose = vi.fn()
    const items = [
      action({ id: 'first', label: 'First command', category: 'Create', onRun: firstRun }),
      action({ id: 'second', label: 'Second command', category: 'Create', onRun: secondRun }),
      action({ id: 'third', label: 'Third command', category: 'Notes', onRun: thirdRun }),
    ]
    const view = render(createElement(NotesCommandPalette, {
      query,
      items,
      onQueryChange,
      onClose,
    }))
    return { firstRun, secondRun, thirdRun, onClose, onQueryChange, items, rerender: view.rerender, unmount: view.unmount }
  }

  it('runs the arrow-selected command on Enter', () => {
    const { secondRun, onClose } = renderPalette()

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })

    expect(secondRun).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
    expect(screen.getByRole('option', { name: /Second command/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('renders section headers without adding extra selectable rows', () => {
    renderPalette()

    expect(screen.getByText('Create')).toBeInTheDocument()
    expect(screen.getByText('Notes')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('supports ArrowUp wraparound and Home/End jumps', () => {
    renderPalette()

    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(screen.getByRole('option', { name: /Third command/i })).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(window, { key: 'Home' })
    expect(screen.getByRole('option', { name: /First command/i })).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(window, { key: 'End' })
    expect(screen.getByRole('option', { name: /Third command/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('resets the active row when the query changes', () => {
    const { onQueryChange, items, rerender } = renderPalette('command')

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: /Second command/i })).toHaveAttribute('aria-selected', 'true')

    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'third' },
    })
    rerender(createElement(NotesCommandPalette, {
      query: 'third',
      items,
      onQueryChange,
      onClose: vi.fn(),
    }))

    expect(onQueryChange).toHaveBeenCalledWith('third')
    expect(screen.getByRole('option', { name: /Third command/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('links the search input to the active command result for screen readers', () => {
    renderPalette()

    const input = screen.getByRole('combobox', { name: 'Search notes or run a command' })
    const listbox = screen.getByRole('listbox', { name: 'Command results' })
    const first = screen.getByRole('option', { name: /First command/i })
    expect(input).toHaveAttribute('aria-controls', listbox.id)
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', first.id)

    fireEvent.keyDown(window, { key: 'ArrowDown' })

    const second = screen.getByRole('option', { name: /Second command/i })
    expect(input).toHaveAttribute('aria-activedescendant', second.id)
    expect(second).toHaveAttribute('aria-selected', 'true')
  })

  it('returns focus to the previously active element when dismissed', async () => {
    const opener = document.createElement('button')
    opener.textContent = 'Open commands'
    document.body.appendChild(opener)
    opener.focus()
    const { onClose, unmount } = renderPalette()

    expect(screen.getByRole('combobox', { name: 'Search notes or run a command' })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
    unmount()
    await waitFor(() => expect(opener).toHaveFocus())
    opener.remove()
  })
})
