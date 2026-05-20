import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVault } from '../useVault'
import type { VaultNote } from '@/features/notes/types'

const vaultMock = vi.hoisted(() => ({
  getAllNotes: vi.fn(),
  getAllFolders: vi.fn(),
  createNote: vi.fn(),
  createFolder: vi.fn(),
  putNote: vi.fn(),
  moveNote: vi.fn(),
  deleteFolder: vi.fn(),
  deleteNote: vi.fn(),
  emptyTrash: vi.fn(),
  trashNote: vi.fn(),
  trashFolder: vi.fn(),
  restoreTrashedNote: vi.fn(),
  restoreTrashedFolder: vi.fn(),
  startSync: vi.fn(),
  stopSync: vi.fn(),
}))

vi.mock('@/lib/vault', () => vaultMock)

function note(overrides: Partial<VaultNote> = {}): VaultNote {
  return {
    _id: 'Inbox/project-brief.md',
    type: 'note',
    title: 'Project Brief',
    content: '# Brief',
    folder: 'Inbox',
    tags: [],
    links: [],
    created_at: 1,
    updated_at: 2,
    ...overrides,
  }
}

describe('useVault notes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vaultMock.getAllNotes.mockResolvedValue([note()])
    vaultMock.getAllFolders.mockResolvedValue([])
    vaultMock.startSync.mockImplementation(() => {})
    vaultMock.stopSync.mockImplementation(() => {})
  })

  it('moves a note to Trash optimistically before backend refresh completes', async () => {
    let resolveTrash!: () => void
    vaultMock.trashNote.mockReturnValue(new Promise<void>((resolve) => {
      resolveTrash = resolve
    }))
    const { result } = renderHook(() => useVault())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.notes[0]?.folder).toBe('Inbox')
    })

    await act(async () => {
      void result.current.trashNote('Inbox/project-brief.md')
    })

    expect(result.current.notes[0]).toEqual(expect.objectContaining({
      folder: 'Trash/Inbox',
      trash_origin_path: 'Inbox',
      trashed_at: expect.any(Number),
    }))

    vaultMock.getAllNotes.mockResolvedValue([note({
      folder: 'Trash/Inbox',
      trashed_at: 3,
      trash_origin_path: 'Inbox',
    })])

    await act(async () => {
      resolveTrash()
    })

    await waitFor(() => {
      expect(result.current.notes[0]).toEqual(expect.objectContaining({
        folder: 'Trash/Inbox',
        trash_origin_path: 'Inbox',
      }))
    })
  })

  it('does not strip live folders whose names only start with Trash', async () => {
    let resolveTrash!: () => void
    vaultMock.getAllNotes.mockResolvedValue([note({
      _id: 'Trashy/project-brief.md',
      folder: 'Trashy',
    })])
    vaultMock.trashNote.mockReturnValue(new Promise<void>((resolve) => {
      resolveTrash = resolve
    }))
    const { result } = renderHook(() => useVault())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.notes[0]?.folder).toBe('Trashy')
    })

    await act(async () => {
      void result.current.trashNote('Trashy/project-brief.md')
    })

    expect(result.current.notes[0]).toEqual(expect.objectContaining({
      folder: 'Trash/Trashy',
      trash_origin_path: 'Trashy',
      trashed_at: expect.any(Number),
    }))

    vaultMock.getAllNotes.mockResolvedValue([note({
      _id: 'Trashy/project-brief.md',
      folder: 'Trash/Trashy',
      trashed_at: 4,
      trash_origin_path: 'Trashy',
    })])

    await act(async () => {
      resolveTrash()
    })

    await waitFor(() => {
      expect(result.current.notes[0]).toEqual(expect.objectContaining({
        folder: 'Trash/Trashy',
        trash_origin_path: 'Trashy',
      }))
    })
  })
})
