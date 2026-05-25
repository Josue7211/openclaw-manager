import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildTree, resolveFolderDropAction, resolveNoteDropAction } from '../FileTree'
import FileTree from '../FileTree'
import type { VaultFolder, VaultNote } from '../types'

function note(overrides: Partial<VaultNote> = {}): VaultNote {
  return {
    _id: 'HOMEWORK/commands.md',
    type: 'note',
    title: 'commands',
    content: '',
    folder: 'HOMEWORK',
    tags: [],
    links: [],
    created_at: 1,
    updated_at: 2,
    ...overrides,
  }
}

function folder(path: string): VaultFolder {
  return {
    _id: `cc:folder:${path}`,
    type: 'folder',
    path,
    name: path.split('/').pop() || path,
    created_at: 1,
    updated_at: 2,
  }
}

describe('buildTree', () => {
  it('deduplicates normalized folder paths and keeps Trash visible', () => {
    const tree = buildTree(
      [note(), note({ _id: 'SCATTER/idea.md', title: 'idea', folder: 'SCATTER' })],
      [folder('HOMEWORK'), folder(' HOMEWORK / '), folder('SCATTER')],
      { includeTrash: true },
    )

    expect(tree.children.map(child => child.path)).toEqual(['HOMEWORK', 'SCATTER', 'Trash'])
    expect(tree.children.find(child => child.path === 'HOMEWORK')?.notes).toHaveLength(1)
  })

  it('deduplicates case variants that render as repeated folders', () => {
    const tree = buildTree(
      [
        note({ _id: 'HOMEWORK/commands.md', title: 'commands', folder: 'HOMEWORK' }),
        note({ _id: 'Homework/costs.md', title: 'costs', folder: 'Home\u200Bwork' }),
      ],
      [folder('HOMEWORK'), folder('Home\u200Bwork')],
      { includeTrash: true },
    )

    expect(tree.children.map(child => child.path)).toEqual(['HOMEWORK', 'Trash'])
    expect(tree.children.find(child => child.path === 'HOMEWORK')?.notes.map(item => item.title).sort()).toEqual([
      'commands',
      'costs',
    ])
  })

  it('uses note folder metadata before falling back to the note id path', () => {
    const tree = buildTree(
      [
        note({ _id: 'old-path/brief.md', title: 'brief', folder: 'Projects' }),
        note({ _id: 'Inbox/capture.md', title: 'capture', folder: '' }),
      ],
      [],
    )

    expect(tree.children.map(child => child.path)).toEqual(['Inbox', 'Projects'])
  })
})

describe('FileTree', () => {
  function renderFileTree(overrides: Partial<React.ComponentProps<typeof FileTree>> = {}) {
    const props: React.ComponentProps<typeof FileTree> = {
      notes: [note()],
      folders: [folder('HOMEWORK'), folder(' HomeWork / ')],
      pinnedNoteIds: new Set(),
      recentNoteIds: [],
      selectedId: null,
      onSelect: vi.fn(),
      onCreate: vi.fn(),
      onCreateFolder: vi.fn(),
      onDelete: vi.fn(),
      onDeleteFolder: vi.fn(),
      onRestoreFolder: vi.fn(),
      onRename: vi.fn(),
      onRenameFolder: vi.fn(),
      onDuplicate: vi.fn(),
      onMove: vi.fn(),
      onMoveToFolder: vi.fn(),
      onRestoreNoteToFolder: vi.fn(),
      onCreateDailyNote: vi.fn(),
      onCreateTemplate: vi.fn(),
      onCopyMarkdown: vi.fn(),
      onExportMarkdown: vi.fn(),
      onTogglePin: vi.fn(),
      searchQuery: '',
      onSearchChange: vi.fn(),
      ...overrides,
    }

    return { props, ...render(React.createElement(FileTree, props)) }
  }

  it('renders one normalized folder entry and a reachable Trash control', () => {
    renderFileTree()

    expect(screen.getAllByText('HOMEWORK')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Show Trash' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand HOMEWORK' })).toBeInTheDocument()
  })

  it('expands ancestor folders for the selected note', () => {
    renderFileTree({
      notes: [
        note({
          _id: 'Projects/Alpha/brief.md',
          title: 'brief',
          folder: 'Projects/Alpha',
        }),
      ],
      folders: [folder('Projects'), folder('Projects/Alpha')],
      selectedId: 'Projects/Alpha/brief.md',
    })

    expect(screen.getByRole('button', { name: 'Collapse Projects' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collapse Alpha' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'brief' })).toBeInTheDocument()
  })

  it('opens notes in a workspace side pane from the note context menu', () => {
    const onOpenInSidePane = vi.fn()
    renderFileTree({ onOpenInSidePane })

    fireEvent.click(screen.getByRole('button', { name: 'Expand HOMEWORK' }))
    fireEvent.contextMenu(screen.getByRole('button', { name: 'commands' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open in side pane' }))

    expect(onOpenInSidePane).toHaveBeenCalledWith('HOMEWORK/commands.md')
  })

  it('renders nested tags with inherited parent counts', () => {
    const { props } = renderFileTree({
      notes: [
        note({ _id: 'a.md', title: 'a', tags: ['project/alpha'] }),
        note({ _id: 'b.md', title: 'b', tags: ['project/beta'] }),
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Filter notes by tag #project (2)' }))

    expect(props.onSearchChange).toHaveBeenCalledWith('#project')
    expect(screen.getByRole('button', { name: 'Filter notes by tag #project/alpha (1)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filter notes by tag #project/beta (1)' })).toBeInTheDocument()
  })

  it('exposes tag rename actions for direct tags', () => {
    const onRenameTag = vi.fn()
    renderFileTree({
      notes: [
        note({ _id: 'a.md', title: 'a', tags: ['project/alpha'] }),
        note({ _id: 'b.md', title: 'b', tags: ['project/beta'] }),
      ],
      onRenameTag,
    })

    expect(screen.queryByRole('button', { name: 'Rename tag project' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Rename tag project/alpha' }))

    expect(onRenameTag).toHaveBeenCalledWith('project/alpha')
  })

  it('ranks and highlights matching note titles during sidebar search', () => {
    const { container } = renderFileTree({
      notes: [
        note({ _id: 'HOMEWORK/body.md', title: 'body', content: 'Roadmap reference', updated_at: 20 }),
        note({ _id: 'HOMEWORK/roadmap.md', title: 'Roadmap', content: '', updated_at: 1 }),
      ],
      searchQuery: 'roadmap',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Expand HOMEWORK' }))

    const buttons = screen.getAllByRole('button')
    const roadmapIndex = buttons.findIndex(button => button.textContent === 'Roadmap')
    const bodyIndex = buttons.findIndex(button => button.textContent?.startsWith('body'))
    expect(roadmapIndex).toBeGreaterThan(-1)
    expect(bodyIndex).toBeGreaterThan(-1)
    expect(roadmapIndex).toBeLessThan(bodyIndex)
    expect(container.querySelector('mark')?.textContent).toBe('Roadmap')
    expect(screen.getByTitle('Roadmap reference')).toBeInTheDocument()
  })

  it('keeps Trash out of the main folder tree and expands it from the bottom control', () => {
    renderFileTree({
      notes: [
        note(),
        note({
          _id: 'Trash/HOMEWORK/old.md',
          title: 'old',
          folder: 'Trash/HOMEWORK',
          trashed_at: 10,
          trash_origin_path: 'HOMEWORK',
        }),
      ],
      folders: [folder('HOMEWORK'), folder('Trash/HOMEWORK')],
    })

    expect(screen.queryByRole('button', { name: 'Expand Trash' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show Trash' }))

    expect(screen.getByRole('button', { name: 'Collapse Trash' })).toBeInTheDocument()
  })

  it('routes note drops on the Trash control through the delete action', () => {
    const onDelete = vi.fn()
    renderFileTree({ onDelete })

    fireEvent.drop(screen.getByRole('button', { name: 'Show Trash' }), {
      dataTransfer: {
        types: ['application/x-clawcontrol-note'],
        getData: (type: string) => (type === 'application/x-clawcontrol-note' ? 'HOMEWORK/commands.md' : ''),
      },
    })

    expect(onDelete).toHaveBeenCalledWith('HOMEWORK/commands.md')
  })
})

describe('resolveNoteDropAction', () => {
  it('treats Trash as a protected action target, not a normal folder move', () => {
    const notes = [
      note({ _id: 'Projects/brief.md', title: 'brief', folder: 'Projects' }),
      note({ _id: 'Archive/old.md', title: 'old', folder: 'Trash/Archive', trashed_at: 5 }),
      note({
        _id: 'Projects/stale.md',
        title: 'stale',
        folder: 'Projects',
        trash_origin_path: 'Projects',
        trashed_at: 8,
      }),
    ]

    expect(resolveNoteDropAction(notes, 'Projects/brief.md', 'Trash')).toEqual({
      type: 'trash',
      id: 'Projects/brief.md',
    })
    expect(resolveNoteDropAction(notes, 'Archive/old.md', 'Projects')).toEqual({
      type: 'restore',
      id: 'Archive/old.md',
      folder: 'Projects',
    })
    expect(resolveNoteDropAction(notes, 'Archive/old.md', 'Trash')).toEqual({ type: 'ignore' })
    expect(resolveNoteDropAction(notes, 'Projects/stale.md', 'Archive')).toEqual({
      type: 'restore',
      id: 'Projects/stale.md',
      folder: 'Archive',
    })
  })
})

describe('resolveFolderDropAction', () => {
  it('only treats dropping a live folder on Trash as a trash action', () => {
    expect(resolveFolderDropAction('Projects', 'Trash')).toEqual({ type: 'trash', path: 'Projects' })
    expect(resolveFolderDropAction(' Projects / Active ', ' Trash / ')).toEqual({
      type: 'trash',
      path: 'Projects/Active',
    })
    expect(resolveFolderDropAction('Trash/Projects', 'Archive')).toEqual({ type: 'ignore' })
    expect(resolveFolderDropAction('Projects', 'Archive')).toEqual({ type: 'ignore' })
    expect(resolveFolderDropAction('Trash/Projects', 'Trash')).toEqual({ type: 'ignore' })
  })
})
