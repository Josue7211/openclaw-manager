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
  isCachedTitleOnlyNote: vi.fn((note: VaultNote) => note.content_status === 'cached_title_only'),
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

  it('retries title-only startup metadata before showing notes as loaded', async () => {
    vaultMock.getAllNotes
      .mockResolvedValueOnce([note({ content: '', content_status: 'cached_title_only' })])
      .mockResolvedValueOnce([note({ content: '# Hydrated body' })])

    const { result } = renderHook(() => useVault())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.notes[0]?.content).toBe('# Hydrated body')
    })
    expect(vaultMock.getAllNotes).toHaveBeenCalledTimes(2)
    expect(vaultMock.getAllNotes).toHaveBeenCalledWith({ force: true })
  })

  it('does not expose cache-only note titles as editable blank notes', async () => {
    vaultMock.getAllNotes.mockResolvedValue([note({ content: '', content_status: 'cached_title_only' })])

    const { result } = renderHook(() => useVault())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.notes).toEqual([])
      expect(result.current.unavailableNotes).toEqual([
        expect.objectContaining({ _id: 'Inbox/project-brief.md', content_status: 'cached_title_only' }),
      ])
      expect(result.current.error).toContain('Only cached note titles are available')
    })
    expect(vaultMock.getAllNotes).toHaveBeenCalledTimes(2)
  })

  it('keeps retrying cached title-only notes in the background until bodies hydrate', async () => {
    vi.useFakeTimers()
    try {
      vaultMock.getAllNotes
        .mockResolvedValueOnce([note({ content: '', content_status: 'cached_title_only' })])
        .mockResolvedValueOnce([note({ content: '', content_status: 'cached_title_only' })])
        .mockResolvedValueOnce([note({ content: '', content_status: 'cached_title_only' })])
        .mockResolvedValueOnce([note({ content: '', content_status: 'cached_title_only' })])
        .mockResolvedValueOnce([note({ content: '# Hydrated body' })])

      const { result } = renderHook(() => useVault())

      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(result.current.notes).toEqual([])
      expect(result.current.unavailableNotes).toEqual([
        expect.objectContaining({ _id: 'Inbox/project-brief.md', content_status: 'cached_title_only' }),
      ])
      expect(vaultMock.getAllNotes).toHaveBeenCalledTimes(2)

      await act(async () => {
        vi.advanceTimersByTime(1_500)
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(result.current.notes).toEqual([])
      expect(result.current.unavailableNotes).toEqual([
        expect.objectContaining({ _id: 'Inbox/project-brief.md', content_status: 'cached_title_only' }),
      ])
      expect(vaultMock.getAllNotes).toHaveBeenCalledTimes(4)

      await act(async () => {
        vi.advanceTimersByTime(3_000)
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(result.current.notes).toEqual([
        expect.objectContaining({ _id: 'Inbox/project-brief.md', content: '# Hydrated body' }),
      ])
      expect(result.current.unavailableNotes).toEqual([])
      expect(result.current.error).toBeNull()
      expect(vaultMock.getAllNotes).toHaveBeenCalledTimes(5)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps notes visible when folder metadata fails to load', async () => {
    vaultMock.getAllNotes.mockResolvedValue([note()])
    vaultMock.getAllFolders.mockRejectedValue(new Error('folders offline'))

    const { result } = renderHook(() => useVault())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.notes).toEqual([
        expect.objectContaining({ _id: 'Inbox/project-brief.md', content: '# Brief' }),
      ])
      expect(result.current.error).toContain('folders are temporarily unavailable')
    })
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
