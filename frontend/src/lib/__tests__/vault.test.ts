import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: apiMock,
}))

async function loadVault() {
  vi.resetModules()
  return import('../vault')
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  apiMock.get.mockResolvedValue({ data: { notes: [], folders: [] } })
})

describe('vault folders', () => {
  it('normalizes folder paths without lowercasing Obsidian-style names', async () => {
    const { normalizeFolderPath } = await loadVault()

    expect(normalizeFolderPath(' Projects / Daily Notes ')).toBe('Projects/Daily Notes')
    expect(normalizeFolderPath('Bad:Name/Next*Part')).toBe('BadName/NextPart')
  })

  it('creates a folder through the backend folder route and caches it', async () => {
    apiMock.put.mockResolvedValue({
      data: {
        folder: {
          _id: 'cc:folder:Projects/Daily Notes',
          _rev: '1-folder',
          type: 'folder',
          path: 'Projects/Daily Notes',
          name: 'Daily Notes',
          created_at: 10,
          updated_at: 20,
        },
      },
    })
    const { createFolder, getAllFolders } = await loadVault()

    const folder = await createFolder(' Projects / Daily Notes ')
    const folders = await getAllFolders()

    expect(apiMock.put).toHaveBeenCalledWith(
      '/api/vault/folder?path=Projects%2FDaily%20Notes',
      expect.objectContaining({
        _id: 'cc:folder:Projects/Daily Notes',
        type: 'folder',
        path: 'Projects/Daily Notes',
        name: 'Daily Notes',
      }),
    )
    expect(folder).toEqual(expect.objectContaining({ _rev: '1-folder', path: 'Projects/Daily Notes' }))
    expect(folders).toEqual([expect.objectContaining({ path: 'Projects/Daily Notes' })])
  })

  it('loads folder marker docs from the backend', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        folders: [
          {
            _id: 'cc:folder:Archive',
            _rev: '1-archive',
            type: 'folder',
            path: 'Archive',
            name: 'Archive',
            created_at: 1,
            updated_at: 2,
          },
        ],
      },
    })
    const { getAllFolders } = await loadVault()

    await expect(getAllFolders()).resolves.toEqual([
      expect.objectContaining({ _id: 'cc:folder:Archive', path: 'Archive' }),
    ])
  })
})
