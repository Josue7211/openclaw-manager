import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
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

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
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
      '/api/vault/local/folder?path=Projects%2FDaily%20Notes',
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

  it('renders backend trashed folders inside the visible Trash tree', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        folders: [
          {
            _id: 'cc:folder:Projects',
            _rev: '2-folder-trash',
            type: 'folder',
            path: 'Projects',
            name: 'Projects',
            created_at: 1,
            updated_at: 20,
            trashed_at: 30,
            trash_origin_path: 'Projects',
          },
        ],
      },
    })
    const { getAllFolders } = await loadVault()

    await expect(getAllFolders()).resolves.toEqual([
      expect.objectContaining({
        _id: 'cc:folder:Projects',
        path: 'Trash/Projects',
        name: 'Projects',
        trash_origin_path: 'Projects',
        trashed_at: 30,
      }),
    ])
  })

  it('restores backend-shaped trashed folders from the visible Trash path', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        folders: [
          {
            _id: 'cc:folder:Projects',
            type: 'folder',
            path: 'Projects',
            name: 'Projects',
            created_at: 1,
            updated_at: 20,
            trashed_at: 30,
            trash_origin_path: 'Projects',
          },
        ],
      },
    })
    apiMock.post.mockResolvedValue({ data: { ok: true } })
    const { getAllFolders, restoreTrashedFolder } = await loadVault()

    expect(await getAllFolders()).toEqual([expect.objectContaining({ path: 'Trash/Projects' })])
    await restoreTrashedFolder('Trash/Projects')

    expect(apiMock.post).toHaveBeenCalledWith('/api/vault/local/folder/trash/restore', { path: 'Trash/Projects' })
    expect(await getAllFolders()).toEqual([expect.objectContaining({ path: 'Projects', trashed_at: null })])
  })

  it('trashes and restores folders through protected local folder trash routes', async () => {
    apiMock.put.mockResolvedValue({
      data: { folder: { path: 'Projects', name: 'Projects', created_at: 1, updated_at: 2 } },
    })
    apiMock.post.mockResolvedValue({ data: { ok: true } })
    const { createFolder, getAllFolders, restoreTrashedFolder, trashFolder } = await loadVault()

    await createFolder('Projects')
    await trashFolder('Projects')
    expect(await getAllFolders()).toEqual([
      expect.objectContaining({ path: 'Trash/Projects', trash_origin_path: 'Projects' }),
    ])

    await restoreTrashedFolder('Trash/Projects')
    expect(apiMock.post).toHaveBeenNthCalledWith(1, '/api/vault/local/folder/trash?path=Projects', {})
    expect(apiMock.post).toHaveBeenNthCalledWith(2, '/api/vault/local/folder/trash/restore', { path: 'Trash/Projects' })
    expect(await getAllFolders()).toEqual([expect.objectContaining({ path: 'Projects', trashed_at: null })])
  })

  it('trashes notes inside derived folders and marks them recoverable', async () => {
    apiMock.put.mockResolvedValue({})
    apiMock.post.mockResolvedValue({ data: { ok: true } })
    const { createNote, getAllNotes, trashFolder } = await loadVault()

    const created = await createNote('Project Brief', 'Projects')
    await trashFolder('Projects')

    expect(apiMock.post).toHaveBeenCalledWith('/api/vault/local/folder/trash?path=Projects', {})
    expect(await getAllNotes()).toEqual([
      expect.objectContaining({
        _id: created._id,
        folder: 'Trash/Projects',
        trash_origin_path: 'Projects',
        trashed_at: expect.any(Number),
      }),
    ])
  })
})

describe('vault notes', () => {
  it('creates unique note paths instead of overwriting repeated titles', async () => {
    apiMock.put.mockResolvedValue({})
    const { createNote, getAllNotes } = await loadVault()

    const first = await createNote('Untitled', 'Projects')
    const second = await createNote('Untitled', 'Projects')
    const notes = await getAllNotes()

    expect(first._id).toBe('Projects/untitled.md')
    expect(second._id).toBe('Projects/untitled-2.md')
    expect(notes.map(note => note._id).sort()).toEqual(['Projects/untitled-2.md', 'Projects/untitled.md'])
  })

  it('creates notes with initial content for templates and duplicates', async () => {
    apiMock.put.mockResolvedValue({})
    const { createNote, getAllNotes } = await loadVault()

    const note = await createNote('Daily 2026-05-08', 'Daily', '# May 8\n\n- [ ] Ship notes\n')
    const notes = await getAllNotes()

    expect(note).toEqual(
      expect.objectContaining({
        _id: 'Daily/daily-2026-05-08.md',
        content: '# May 8\n\n- [ ] Ship notes\n',
        folder: 'Daily',
      }),
    )
    expect(notes[0].content).toContain('Ship notes')
  })

  it('hydrates title-only document list entries before showing notes', async () => {
    apiMock.get.mockImplementation(async (path: string) => {
      if (path === '/api/vault/local/documents') {
        return {
          data: {
            notes: [
              {
                _id: 'Projects/roadmap.md',
                title: 'Roadmap',
                content: '',
                folder: 'Projects',
                tags: [],
                links: [],
                created_at: 1,
                updated_at: 2,
              },
            ],
            attachments: [],
          },
        }
      }
      if (path === '/api/vault/local/doc?id=Projects%2Froadmap.md') {
        return {
          data: {
            _id: 'Projects/roadmap.md',
            title: 'Roadmap',
            content: '# Roadmap\n\nLaunch plan',
            folder: 'Projects',
            tags: [],
            links: [],
            created_at: 1,
            updated_at: 2,
          },
        }
      }
      return { data: { folders: [] } }
    })
    const { getAllNotes } = await loadVault()

    const notes = await getAllNotes()

    expect(apiMock.get).toHaveBeenCalledWith('/api/vault/local/doc?id=Projects%2Froadmap.md')
    expect(notes).toEqual([
      expect.objectContaining({
        _id: 'Projects/roadmap.md',
        content: '# Roadmap\n\nLaunch plan',
      }),
    ])
  })

  it('reads Markdown body fields from local vault records so notes do not appear blank', async () => {
    apiMock.get.mockImplementation(async (path: string) => {
      if (path === '/api/vault/local/documents') {
        return {
          data: {
            notes: [
              {
                _id: 'Projects/roadmap.md',
                type: 'note',
                title: 'Roadmap',
                content_markdown: '# Roadmap\n\nStored in content_markdown.',
                folder: 'Projects',
                tags: [],
                links: [],
                aliases: [],
                created_at: 1,
                updated_at: 2,
              },
              {
                _id: 'Inbox/idea.md',
                type: 'note',
                title: 'Idea',
                markdown: '# Idea\n\nStored in markdown.',
                folder: 'Inbox',
                tags: [],
                links: [],
                aliases: [],
                created_at: 1,
                updated_at: 3,
              },
            ],
            attachments: [],
          },
        }
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    const { getAllNotes, isCachedTitleOnlyNote } = await loadVault()

    const notes = await getAllNotes()

    expect(notes.map(note => note.content)).toEqual([
      '# Idea\n\nStored in markdown.',
      '# Roadmap\n\nStored in content_markdown.',
    ])
    expect(notes.some(isCachedTitleOnlyNote)).toBe(false)
    expect(apiMock.get.mock.calls.some(([path]) => String(path).startsWith('/api/vault/local/doc?id='))).toBe(false)
  })

  it('hydrates cached title-only notes when the document list is temporarily unavailable', async () => {
    localStorage.setItem('mc-notes-meta', JSON.stringify([
      {
        _id: 'Inbox/project-brief.md',
        title: 'Project Brief',
        folder: 'Inbox',
        tags: [],
        links: [],
        created_at: 1,
        updated_at: 2,
      },
    ]))
    apiMock.get.mockImplementation(async (path: string) => {
      if (path === '/api/vault/local/documents') throw new Error('list offline')
      if (path === '/api/vault/local/doc?id=Inbox%2Fproject-brief.md') {
        return {
          data: {
            _id: 'Inbox/project-brief.md',
            title: 'Project Brief',
            content: '# Brief\n\nRecovered body',
            folder: 'Inbox',
            tags: [],
            links: [],
            created_at: 1,
            updated_at: 2,
          },
        }
      }
      return { data: { folders: [] } }
    })
    const { getAllNotes } = await loadVault()

    const notes = await getAllNotes()

    expect(notes).toEqual([
      expect.objectContaining({
        _id: 'Inbox/project-brief.md',
        content: '# Brief\n\nRecovered body',
      }),
    ])
  })

  it('keeps cached notes visible when a successful local list omits them', async () => {
    localStorage.setItem('mc-notes-meta', JSON.stringify([
      {
        _id: 'Inbox/visible.md',
        title: 'Visible',
        folder: 'Inbox',
        tags: [],
        links: [],
        aliases: [],
        created_at: 1,
        updated_at: 2,
      },
      {
        _id: 'Projects/missing.md',
        title: 'Missing from list',
        folder: 'Projects',
        tags: [],
        links: [],
        aliases: [],
        created_at: 1,
        updated_at: 3,
      },
    ]))
    apiMock.get.mockImplementation(async (path: string) => {
      if (path === '/api/vault/local/documents') {
        return {
          data: {
            notes: [
              {
                _id: 'Inbox/visible.md',
                type: 'note',
                title: 'Visible',
                content: '# Visible',
                folder: 'Inbox',
                tags: [],
                links: [],
                aliases: [],
                created_at: 1,
                updated_at: 2,
              },
            ],
            attachments: [],
          },
        }
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    const { getAllNotes, isCachedTitleOnlyNote } = await loadVault()

    const notes = await getAllNotes()

    expect(notes.map(note => note._id)).toEqual(['Projects/missing.md', 'Inbox/visible.md'])
    expect(notes.find(note => note._id === 'Inbox/visible.md')).toEqual(expect.objectContaining({ content: '# Visible' }))
    expect(isCachedTitleOnlyNote(notes.find(note => note._id === 'Projects/missing.md')!)).toBe(true)
  })

  it('blocks saves from title-only cache records so blank editors cannot overwrite note bodies', async () => {
    localStorage.setItem('mc-notes-meta', JSON.stringify([
      {
        _id: 'Inbox/project-brief.md',
        title: 'Project Brief',
        folder: 'Inbox',
        tags: [],
        links: [],
        created_at: 1,
        updated_at: 2,
      },
    ]))
    apiMock.get.mockImplementation(async (path: string) => {
      if (path === '/api/vault/local/documents') throw new Error('list offline')
      if (path === '/api/vault/local/doc?id=Inbox%2Fproject-brief.md') throw new Error('body offline')
      return { data: { folders: [] } }
    })
    const { getAllNotes, putNote } = await loadVault()

    const notes = await getAllNotes()

    expect(notes[0]).toEqual(expect.objectContaining({ content_status: 'cached_title_only' }))
    await expect(putNote({ ...notes[0], content: '' })).rejects.toThrow('Cannot save this note until its body has loaded')
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it('hides internal clawctrl sync documents from visible notes', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        notes: [
          {
            _id: '.clawctrl/data-views.md',
            title: 'clawctrl data views',
            content: '# Internal',
            folder: '.clawctrl',
            tags: [],
            links: [],
            created_at: 1,
            updated_at: 2,
          },
          {
            _id: 'Projects/roadmap.md',
            title: 'Roadmap',
            content: '# Roadmap',
            folder: 'Projects',
            tags: [],
            links: [],
            created_at: 1,
            updated_at: 2,
          },
        ],
        attachments: [],
      },
    })
    const { getAllNotes } = await loadVault()

    expect(await getAllNotes()).toEqual([
      expect.objectContaining({ _id: 'Projects/roadmap.md' }),
    ])
  })

  it('keeps private writes local-only when the local vault write fails', async () => {
    apiMock.put.mockRejectedValue(new Error('local vault offline'))
    const { createNote, getRecoverableDrafts } = await loadVault()

    const note = await createNote('Private Draft', 'Inbox', '# Private')

    expect(note).toEqual(
      expect.objectContaining({
        _id: 'Inbox/private-draft.md',
        content: '# Private',
      }),
    )
    expect(apiMock.put).toHaveBeenCalledTimes(1)
    expect(apiMock.put).toHaveBeenCalledWith('/api/vault/local/doc?id=Inbox%2Fprivate-draft.md', expect.any(Object))
    expect(apiMock.put.mock.calls.some(([path]) => String(path).startsWith('/api/vault/doc'))).toBe(false)
    expect(getRecoverableDrafts()).toEqual([
      expect.objectContaining({ id: 'Inbox/private-draft.md', content: '# Private' }),
    ])
  })

  it('recovers unsynced local drafts after a module restart', async () => {
    apiMock.put.mockRejectedValue(new Error('local vault offline'))
    let vault = await loadVault()

    const note = await vault.createNote('Crash Draft', 'Inbox', '# Before crash')

    expect(vault.getRecoverableDrafts()).toEqual([expect.objectContaining({ id: note._id, content: '# Before crash' })])

    apiMock.get.mockRejectedValue(new Error('local vault still offline'))
    vault = await loadVault()
    const notes = await vault.getAllNotes()

    expect(apiMock.get.mock.calls.some(([path]) => String(path).startsWith('/api/vault/notes'))).toBe(false)
    expect(vault.getRecoverableDrafts()).toEqual([
      expect.objectContaining({
        id: 'Inbox/crash-draft.md',
        title: 'Crash Draft',
        folder: 'Inbox',
        content: '# Before crash',
      }),
    ])
    expect(notes).toEqual([
      expect.objectContaining({
        _id: 'Inbox/crash-draft.md',
        title: 'Crash Draft',
        content: '# Before crash',
      }),
    ])
  })

  it('recovers an offline edit after a successful note was reopened from stale backend state', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-13T10:00:00Z'))
    apiMock.put.mockResolvedValue({ data: { rev: 'local-1' } })
    let vault = await loadVault()

    const note = await vault.createNote('Offline Edit', 'Inbox', '# Saved')

    expect(vault.getRecoverableDrafts()).toEqual([])

    vi.setSystemTime(new Date('2026-05-13T10:01:00Z'))
    apiMock.put.mockRejectedValueOnce(new Error('local vault offline'))
    const edited = await vault.putNote({ ...note, content: '# Edited offline' })

    expect(edited).toEqual(expect.objectContaining({ content: '# Edited offline' }))
    expect(vault.getRecoverableDrafts()).toEqual([
      expect.objectContaining({
        id: 'Inbox/offline-edit.md',
        content: '# Edited offline',
      }),
    ])

    apiMock.get.mockResolvedValue({
      data: {
        notes: [
          {
            ...note,
            content: '# Saved',
            updated_at: note.updated_at,
          },
        ],
        attachments: [],
      },
    })
    vault = await loadVault()
    const notes = await vault.getAllNotes()

    expect(notes).toEqual([
      expect.objectContaining({
        _id: 'Inbox/offline-edit.md',
        title: 'Offline Edit',
        content: '# Edited offline',
      }),
    ])
    expect(vault.getRecoverableDrafts()).toEqual([
      expect.objectContaining({
        id: 'Inbox/offline-edit.md',
        title: 'Offline Edit',
        folder: 'Inbox',
        content: '# Edited offline',
      }),
    ])
  })

  it('does not let an empty local draft hide fetched backend content', async () => {
    localStorage.setItem('mc-notes-drafts', JSON.stringify([
      {
        id: 'Inbox/project-brief.md',
        content: '',
        updated_at: 999,
      },
    ]))
    apiMock.get.mockResolvedValue({
      data: {
        notes: [
          {
            _id: 'Inbox/project-brief.md',
            title: 'Project Brief',
            content: '# Brief\n\nVisible backend body',
            folder: 'Inbox',
            tags: [],
            links: [],
            aliases: [],
            created_at: 1,
            updated_at: 2,
          },
        ],
        attachments: [],
      },
    })
    const { getAllNotes, getRecoverableDrafts } = await loadVault()

    const notes = await getAllNotes()

    expect(notes).toEqual([
      expect.objectContaining({
        _id: 'Inbox/project-brief.md',
        content: '# Brief\n\nVisible backend body',
      }),
    ])
    expect(getRecoverableDrafts()).toEqual([])
  })

  it('does not require CouchDB when the local vault list is unavailable', async () => {
    apiMock.get.mockRejectedValue(new Error('local vault unavailable'))
    const { getAllNotes } = await loadVault()

    await expect(getAllNotes()).resolves.toEqual([])

    expect(apiMock.get).toHaveBeenCalledTimes(1)
    expect(apiMock.get).toHaveBeenCalledWith('/api/vault/local/documents')
    expect(apiMock.get.mock.calls.some(([path]) => String(path).startsWith('/api/vault/notes'))).toBe(false)
  })

  it('retries local vault hydration after serving title-only cached metadata', async () => {
    localStorage.setItem(
      'mc-notes-meta',
      JSON.stringify([
        {
          _id: 'Inbox/recovered.md',
          title: 'Recovered',
          folder: 'Inbox',
          tags: [],
          links: [],
          aliases: [],
          created_at: 1,
          updated_at: 2,
        },
      ]),
    )
    let documentListCalls = 0
    apiMock.get.mockImplementation(async (path: string) => {
      if (path === '/api/vault/local/documents') {
        documentListCalls += 1
        if (documentListCalls === 1) throw new Error('local vault warming up')
        return {
          data: {
            notes: [
              {
                _id: 'Inbox/recovered.md',
                type: 'note',
                title: 'Recovered',
                content: '# Real body\n\nLoaded after retry.',
                folder: 'Inbox',
                tags: [],
                links: [],
                aliases: [],
                created_at: 1,
                updated_at: 3,
              },
            ],
            attachments: [],
          },
        }
      }
      throw new Error('document body still warming up')
    })
    const { getAllNotes } = await loadVault()

    await expect(getAllNotes()).resolves.toEqual([
      expect.objectContaining({
        _id: 'Inbox/recovered.md',
        title: 'Recovered',
        content: '',
      }),
    ])
    await expect(getAllNotes()).resolves.toEqual([
      expect.objectContaining({
        _id: 'Inbox/recovered.md',
        title: 'Recovered',
        content: '# Real body\n\nLoaded after retry.',
      }),
    ])

    expect(apiMock.get).toHaveBeenNthCalledWith(1, '/api/vault/local/documents')
    expect(apiMock.get).toHaveBeenNthCalledWith(2, '/api/vault/local/doc?id=Inbox%2Frecovered.md')
    expect(apiMock.get).toHaveBeenNthCalledWith(3, '/api/vault/local/documents')
    expect(apiMock.get.mock.calls.some(([path]) => String(path).startsWith('/api/vault/notes'))).toBe(false)
  })

  it('keeps retrying local vault body hydration when the document list only has empty bodies', async () => {
    let bodyCalls = 0
    apiMock.get.mockImplementation(async (path: string) => {
      if (path === '/api/vault/local/documents') {
        return {
          data: {
            notes: [
              {
                _id: 'Inbox/recovered.md',
                type: 'note',
                title: 'Recovered',
                content: '',
                folder: 'Inbox',
                tags: [],
                links: [],
                aliases: [],
                created_at: 1,
                updated_at: 2,
              },
            ],
            attachments: [],
          },
        }
      }
      if (path === '/api/vault/local/doc?id=Inbox%2Frecovered.md') {
        bodyCalls += 1
        if (bodyCalls === 1) throw new Error('document body still warming up')
        return {
          data: {
            _id: 'Inbox/recovered.md',
            type: 'note',
            title: 'Recovered',
            content: '# Real body\n\nLoaded after retry.',
            folder: 'Inbox',
            tags: [],
            links: [],
            aliases: [],
            created_at: 1,
            updated_at: 3,
          },
        }
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    const { getAllNotes } = await loadVault()

    await expect(getAllNotes()).resolves.toEqual([
      expect.objectContaining({
        _id: 'Inbox/recovered.md',
        title: 'Recovered',
        content: '',
      }),
    ])
    await expect(getAllNotes()).resolves.toEqual([
      expect.objectContaining({
        _id: 'Inbox/recovered.md',
        title: 'Recovered',
        content: '# Real body\n\nLoaded after retry.',
      }),
    ])

    expect(apiMock.get.mock.calls.filter(([path]) => path === '/api/vault/local/documents')).toHaveLength(2)
    expect(apiMock.get.mock.calls.filter(([path]) => path === '/api/vault/local/doc?id=Inbox%2Frecovered.md')).toHaveLength(2)
    expect(apiMock.get.mock.calls.some(([path]) => String(path).startsWith('/api/vault/notes'))).toBe(false)
  })

  it('keeps multi-note all-empty hydration title-only so blank cache records do not become editable', async () => {
    apiMock.get.mockImplementation(async (path: string) => {
      if (path === '/api/vault/local/documents') {
        return {
          data: {
            notes: [
              {
                _id: 'Inbox/one.md',
                type: 'note',
                title: 'One',
                content: '',
                folder: 'Inbox',
                tags: [],
                links: [],
                aliases: [],
                created_at: 1,
                updated_at: 2,
              },
              {
                _id: 'Inbox/two.md',
                type: 'note',
                title: 'Two',
                content: '',
                folder: 'Inbox',
                tags: [],
                links: [],
                aliases: [],
                created_at: 1,
                updated_at: 3,
              },
            ],
            attachments: [],
          },
        }
      }
      if (path === '/api/vault/local/doc?id=Inbox%2Fone.md') {
        return {
          data: {
            _id: 'Inbox/one.md',
            type: 'note',
            title: 'One',
            content: '',
            folder: 'Inbox',
            tags: [],
            links: [],
            aliases: [],
            created_at: 1,
            updated_at: 2,
          },
        }
      }
      if (path === '/api/vault/local/doc?id=Inbox%2Ftwo.md') {
        return {
          data: {
            _id: 'Inbox/two.md',
            type: 'note',
            title: 'Two',
            content: '',
            folder: 'Inbox',
            tags: [],
            links: [],
            aliases: [],
            created_at: 1,
            updated_at: 3,
          },
        }
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    const { getAllNotes, isCachedTitleOnlyNote } = await loadVault()

    const notes = await getAllNotes()

    expect(notes).toHaveLength(2)
    expect(notes.map(note => note.content)).toEqual(['', ''])
    expect(notes.every(isCachedTitleOnlyNote)).toBe(true)
  })

  it('refetches a legacy all-empty in-memory cache before exposing blank notes', async () => {
    apiMock.get.mockImplementation(async (path: string) => {
      if (path === '/api/vault/local/documents') {
        return {
          data: {
            notes: [
              {
                _id: 'Inbox/one.md',
                type: 'note',
                title: 'One',
                content: '# One\n\nReal body',
                folder: 'Inbox',
                tags: [],
                links: [],
                aliases: [],
                created_at: 1,
                updated_at: 2,
              },
              {
                _id: 'Inbox/two.md',
                type: 'note',
                title: 'Two',
                content: '# Two\n\nReal body',
                folder: 'Inbox',
                tags: [],
                links: [],
                aliases: [],
                created_at: 1,
                updated_at: 3,
              },
            ],
            attachments: [],
          },
        }
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    apiMock.put.mockResolvedValue({ data: { rev: 'local-blank' } })
    const { getAllNotes, putNote } = await loadVault()

    const loaded = await getAllNotes()
    await putNote({ ...loaded[0], content: '' })
    await putNote({ ...loaded[1], content: '' })

    const recovered = await getAllNotes()

    expect(apiMock.get.mock.calls.filter(([path]) => path === '/api/vault/local/documents')).toHaveLength(2)
    expect(recovered.map(note => note.content)).toEqual([
      '# Two\n\nReal body',
      '# One\n\nReal body',
    ])
  })

  it('still allows a single intentionally blank note to open for editing', async () => {
    apiMock.get.mockImplementation(async (path: string) => {
      if (path === '/api/vault/local/documents') {
        return {
          data: {
            notes: [
              {
                _id: 'Inbox/blank.md',
                type: 'note',
                title: 'Blank',
                content: '',
                folder: 'Inbox',
                tags: [],
                links: [],
                aliases: [],
                created_at: 1,
                updated_at: 2,
              },
            ],
            attachments: [],
          },
        }
      }
      if (path === '/api/vault/local/doc?id=Inbox%2Fblank.md') {
        return {
          data: {
            _id: 'Inbox/blank.md',
            type: 'note',
            title: 'Blank',
            content: '',
            folder: 'Inbox',
            tags: [],
            links: [],
            aliases: [],
            created_at: 1,
            updated_at: 2,
          },
        }
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    const { getAllNotes, isCachedTitleOnlyNote } = await loadVault()

    const notes = await getAllNotes()

    expect(notes).toEqual([
      expect.objectContaining({
        _id: 'Inbox/blank.md',
        content: '',
      }),
    ])
    expect(isCachedTitleOnlyNote(notes[0])).toBe(false)
  })

  it('moves a note by creating the new doc and deleting the old doc', async () => {
    apiMock.put.mockResolvedValueOnce({ data: { rev: '1-old' } }).mockResolvedValueOnce({ data: { rev: '1-new' } })
    apiMock.del.mockResolvedValue(undefined)
    const { createNote, moveNote, getAllNotes } = await loadVault()

    const note = await createNote('Project Brief', 'Inbox', '# Brief')
    const moved = await moveNote(note._id, 'Projects/Active')
    const notes = await getAllNotes()

    expect(moved).toEqual(
      expect.objectContaining({
        _id: 'Projects/Active/project-brief.md',
        _rev: '1-new',
        folder: 'Projects/Active',
        content: '# Brief',
      }),
    )
    expect(apiMock.del).toHaveBeenCalledWith('/api/vault/local/doc?id=Inbox%2Fproject-brief.md')
    expect(notes.map(n => n._id)).toEqual(['Projects/Active/project-brief.md'])
  })

  it('does not fall back to legacy CouchDB delete routes when local delete fails', async () => {
    apiMock.put.mockResolvedValue({ data: { rev: '1-note' } })
    apiMock.del.mockRejectedValue(new Error('local delete failed'))
    const { createNote, deleteNote, getAllNotes } = await loadVault()

    const note = await createNote('Project Brief', 'Inbox', '# Brief')
    await expect(deleteNote(note._id)).rejects.toThrow('local delete failed')

    expect(apiMock.del).toHaveBeenCalledTimes(1)
    expect(apiMock.del).toHaveBeenCalledWith('/api/vault/local/doc?id=Inbox%2Fproject-brief.md')
    expect(apiMock.del.mock.calls.some(([path]) => String(path).startsWith('/api/vault/doc'))).toBe(false)
    expect(await getAllNotes()).toEqual([expect.objectContaining({ _id: 'Inbox/project-brief.md' })])
  })

  it('moves notes to protected local trash without deleting local content', async () => {
    apiMock.put.mockResolvedValue({ data: { rev: '1-note' } })
    apiMock.post.mockResolvedValue({ data: { ok: true, rev: 'local-trash' } })
    const { createNote, trashNote, getAllNotes } = await loadVault()

    const note = await createNote('Project Brief', 'Inbox', '# Brief')
    await trashNote(note._id)
    const notes = await getAllNotes()

    expect(apiMock.post).toHaveBeenCalledWith('/api/vault/local/trash?id=Inbox%2Fproject-brief.md', {})
    expect(notes[0]).toEqual(
      expect.objectContaining({
        _id: 'Inbox/project-brief.md',
        folder: 'Trash/Inbox',
        content: '# Brief',
      }),
    )
    expect(apiMock.del).not.toHaveBeenCalled()
  })

  it('maps backend trashed notes into Trash and removes them from cache when emptying Trash', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        notes: [
          {
            _id: 'Inbox/project-brief.md',
            title: 'Project Brief',
            content: '# Brief',
            folder: 'Inbox',
            tags: [],
            links: [],
            created_at: 1,
            updated_at: 2,
            trashed_at: 30,
            trash_origin_path: 'Inbox',
          },
        ],
        attachments: [],
      },
    })
    apiMock.post.mockResolvedValue({ data: { ok: true, deleted: 1 } })
    const { emptyTrash, getAllNotes } = await loadVault()

    expect(await getAllNotes()).toEqual([
      expect.objectContaining({
        _id: 'Inbox/project-brief.md',
        folder: 'Trash/Inbox',
        trash_origin_path: 'Inbox',
        trashed_at: 30,
      }),
    ])

    await expect(emptyTrash()).resolves.toBe(1)
    await expect(getAllNotes()).resolves.toEqual([])
  })

  it('restores trashed notes from the local vault API', async () => {
    apiMock.post.mockResolvedValue({ data: { ok: true, rev: 'local-restore' } })
    apiMock.get.mockResolvedValueOnce({
      data: {
        _id: 'Inbox/project-brief.md',
        type: 'note',
        title: 'Project Brief',
        content: '# Brief',
        folder: 'Inbox',
        tags: [],
        links: [],
        aliases: [],
        properties: {},
        created_at: 10,
        updated_at: 20,
      },
    })
    const { restoreTrashedNote, getAllNotes } = await loadVault()

    const restored = await restoreTrashedNote('Inbox/project-brief.md')
    const notes = await getAllNotes()

    expect(apiMock.post).toHaveBeenCalledWith('/api/vault/local/trash/restore', {
      id: 'Inbox/project-brief.md',
      folder: undefined,
    })
    expect(restored).toEqual(expect.objectContaining({ folder: 'Inbox', content: '# Brief' }))
    expect(notes[0]).toEqual(expect.objectContaining({ folder: 'Inbox' }))
  })

  it('empties local trash and removes cached trashed notes', async () => {
    apiMock.put.mockResolvedValue({ data: { rev: '1-note' } })
    apiMock.post
      .mockResolvedValueOnce({ data: { ok: true, rev: 'local-trash' } })
      .mockResolvedValueOnce({ data: { ok: true, deleted: 1 } })
    const { createNote, emptyTrash, getAllNotes, trashNote } = await loadVault()

    const note = await createNote('Project Brief', 'Inbox', '# Brief')
    await trashNote(note._id)
    const deleted = await emptyTrash()
    const notes = await getAllNotes()

    expect(apiMock.post).toHaveBeenNthCalledWith(1, '/api/vault/local/trash?id=Inbox%2Fproject-brief.md', {})
    expect(apiMock.post).toHaveBeenNthCalledWith(2, '/api/vault/local/trash/empty', {})
    expect(deleted).toBe(1)
    expect(notes).toEqual([])
  })

  it('loads local vault privacy status', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        canonical_store: 'local_sqlite',
        remote_required: false,
        encrypted_backup_supported: true,
        database_path: '/Users/example/Library/Application Support/clawctrl/local.db',
        attachments_path: '/Users/example/Library/Application Support/clawctrl/vault-attachments',
        counts: {
          live_notes: 3,
          trashed_notes: 1,
          folders: 2,
          attachments: 4,
          attachment_bytes: 1024,
          versions: 8,
          open_comments: 1,
          open_suggestions: 2,
          pending_saves: 0,
          audit_events: 12,
        },
      },
    })
    const { getVaultStatus } = await loadVault()

    const status = await getVaultStatus()

    expect(apiMock.get).toHaveBeenCalledWith('/api/vault/local/status')
    expect(status).toEqual(
      expect.objectContaining({
        canonical_store: 'local_sqlite',
        remote_required: false,
        encrypted_backup_supported: true,
        counts: expect.objectContaining({ live_notes: 3, versions: 8 }),
      }),
    )
  })

  it('loads recent local vault audit events', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        events: [
          {
            id: 'audit-1',
            document_id: 'Projects/roadmap.md',
            action: 'export_encrypted',
            metadata: { notes: 3 },
            created_at: 10,
          },
        ],
      },
    })
    const { getVaultAuditEvents } = await loadVault()

    const events = await getVaultAuditEvents(12)

    expect(apiMock.get).toHaveBeenCalledWith('/api/vault/local/audit?limit=12')
    expect(events).toEqual([
      expect.objectContaining({
        id: 'audit-1',
        document_id: 'Projects/roadmap.md',
        action: 'export_encrypted',
        metadata: { notes: 3 },
      }),
    ])
  })

  it('loads the local vault save and sync ledger', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        pending_saves: [
          {
            id: 'save-1',
            document_id: 'Projects/roadmap.md',
            operation: 'put_document',
            payload: { title: 'Roadmap' },
            created_at: 10,
            attempts: 2,
            last_error: 'offline',
          },
        ],
        sync_states: [
          {
            provider: 'couch',
            remote_id: 'remote-roadmap',
            local_id: 'Projects/roadmap.md',
            remote_rev: '2-remote',
            last_synced_at: 20,
            conflict_state: 'conflict',
            conflict: { remote: true },
          },
        ],
      },
    })
    const { getVaultSyncLedger } = await loadVault()

    const ledger = await getVaultSyncLedger(8)

    expect(apiMock.get).toHaveBeenCalledWith('/api/vault/local/sync-ledger?limit=8')
    expect(ledger.pending_saves[0]).toEqual(
      expect.objectContaining({
        id: 'save-1',
        attempts: 2,
        last_error: 'offline',
      }),
    )
    expect(ledger.sync_states[0]).toEqual(
      expect.objectContaining({
        provider: 'couch',
        conflict_state: 'conflict',
      }),
    )
  })

  it('resolves a reviewed local vault sync conflict', async () => {
    const { resolveVaultSyncConflict } = await loadVault()

    await resolveVaultSyncConflict('remote-vault', 'remote/Projects/roadmap.md')

    expect(apiMock.post).toHaveBeenCalledWith('/api/vault/local/sync-ledger/resolve', {
      provider: 'remote-vault',
      remote_id: 'remote/Projects/roadmap.md',
    })
  })

  it('creates an explicit HTTP collaboration provider for remote CRDT transport', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/collaboration/events?')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({
            data: {
              events: [
                {
                  eventId: 'evt-remote',
                  clientId: 'remote-client',
                  sequence: 7,
                  type: 'presence',
                  documentId: 'Projects/roadmap.md',
                  peer: { id: 'remote-client', name: 'Remote', seenAt: 20 },
                  richOperations: [
                    {
                      type: 'update',
                      id: 'block:base:0000:abcd1234',
                      blockType: 'heading',
                      markdown: '# Roadmap',
                    },
                    {
                      type: 'tableCell',
                      id: 'block:base:0001:table1234',
                      row: 1,
                      column: 2,
                      markdown: '12',
                    },
                    {
                      type: 'tableRow',
                      id: 'block:base:0001:table1234',
                      index: 2,
                      cells: ['DNS', 'Sam'],
                    },
                    {
                      type: 'tableRowDelete',
                      id: 'block:base:0001:table1234',
                      index: 1,
                      cells: ['Hosting', 'Ada'],
                    },
                    {
                      type: 'tableColumn',
                      id: 'block:base:0001:table1234',
                      index: 2,
                      cells: ['Cost', '---', '10'],
                    },
                    {
                      type: 'tableColumnDelete',
                      id: 'block:base:0001:table1234',
                      index: 1,
                      cells: ['Owner', '---', 'Ada'],
                    },
                    {
                      type: 'listItem',
                      id: 'block:base:0003:tasks1234',
                      index: 1,
                      markdown: '- [x] Review citations',
                    },
                    {
                      type: 'listItemInsert',
                      id: 'block:base:0003:tasks1234',
                      index: 2,
                      markdown: '- [ ] Send confirmation',
                    },
                    {
                      type: 'listItemDelete',
                      id: 'block:base:0003:tasks1234',
                      index: 0,
                      markdown: '- [ ] Draft outline',
                    },
                    {
                      type: 'line',
                      id: 'block:base:0004:quote1234',
                      index: 2,
                      markdown: '> Confirm launch owner',
                    },
                    {
                      type: 'lineInsert',
                      id: 'block:base:0004:quote1234',
                      index: 3,
                      markdown: '> Publish update',
                    },
                    {
                      type: 'lineDelete',
                      id: 'block:base:0004:quote1234',
                      index: 1,
                      markdown: '> Draft checklist',
                    },
                    {
                      type: 'mark',
                      id: 'block:base:0002:style1234',
                      mark: 'highlight',
                      textStart: 0,
                      textEnd: 5,
                      color: '#ffee58',
                    },
                  ],
                  updatedAt: 20,
                },
              ],
            },
          }),
        }
      }
      if (String(url).includes('/collaboration/crdt-state?')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({
            data: {
              documentId: 'Projects/roadmap.md',
              state: [{ id: 'm:base:000000', afterId: null, value: 'A' }],
              checksum: 'hash',
              clientId: 'remote-client',
              sequence: 7,
              updatedAt: 21,
            },
          }),
        }
      }
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ data: { ok: true, body: init?.body } }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)
    const { createVaultCollaborationHttpTransport } = await loadVault()
    const transport = createVaultCollaborationHttpTransport({
      baseUrl: 'https://remote.example.test/',
      apiKey: 'remote-key',
      pairingKey: 'pair-key-1234567890',
    })

    const events = await transport.list('Projects/roadmap.md', 5)
    const state = await transport.getCrdtState('Projects/roadmap.md')
    await transport.publish(events[0])
    await transport.saveCrdtState(state!)

    expect(events).toEqual([
      expect.objectContaining({
        eventId: 'evt-remote',
        clientId: 'remote-client',
        documentId: 'Projects/roadmap.md',
        richOperations: [
          expect.objectContaining({
            type: 'update',
            blockType: 'heading',
          }),
          expect.objectContaining({
            type: 'tableCell',
            row: 1,
            column: 2,
            markdown: '12',
          }),
          expect.objectContaining({
            type: 'tableRow',
            index: 2,
            cells: ['DNS', 'Sam'],
          }),
          expect.objectContaining({
            type: 'tableRowDelete',
            index: 1,
            cells: ['Hosting', 'Ada'],
          }),
          expect.objectContaining({
            type: 'tableColumn',
            index: 2,
            cells: ['Cost', '---', '10'],
          }),
          expect.objectContaining({
            type: 'tableColumnDelete',
            index: 1,
            cells: ['Owner', '---', 'Ada'],
          }),
          expect.objectContaining({
            type: 'listItem',
            index: 1,
            markdown: '- [x] Review citations',
          }),
          expect.objectContaining({
            type: 'listItemInsert',
            index: 2,
            markdown: '- [ ] Send confirmation',
          }),
          expect.objectContaining({
            type: 'listItemDelete',
            index: 0,
            markdown: '- [ ] Draft outline',
          }),
          expect.objectContaining({
            type: 'line',
            index: 2,
            markdown: '> Confirm launch owner',
          }),
          expect.objectContaining({
            type: 'lineInsert',
            index: 3,
            markdown: '> Publish update',
          }),
          expect.objectContaining({
            type: 'lineDelete',
            index: 1,
            markdown: '> Draft checklist',
          }),
          expect.objectContaining({
            type: 'mark',
            mark: 'highlight',
            color: '#ffee58',
          }),
        ],
      }),
    ])
    expect(state).toEqual(
      expect.objectContaining({
        documentId: 'Projects/roadmap.md',
        sequence: 7,
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://remote.example.test/api/vault/local/collaboration/events?id=Projects%2Froadmap.md&since=5&limit=200',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'X-API-Key': 'remote-key',
          'X-Claw-Vault-Pairing-Key': 'pair-key-1234567890',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://remote.example.test/api/vault/local/collaboration/events',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://remote.example.test/api/vault/local/collaboration/crdt-state',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('checks remote collaboration provider health with pairing headers', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        data: {
          canonical_store: 'local_sqlite',
          remote_required: false,
          collaboration_pairing: 'approved',
          events: true,
          crdt_snapshots: true,
          counts: {
            approved_pairings: 2,
            active_events: 3,
            crdt_snapshots: 4,
          },
          lastEventAt: 20,
          lastSnapshotAt: 30,
          lastPairingSeenAt: 40,
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { testVaultCollaborationRemoteProvider } = await loadVault()

    const health = await testVaultCollaborationRemoteProvider({
      baseUrl: 'https://remote.example.test/',
      apiKey: 'remote-key',
      pairingKey: 'pair-key-1234567890',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://remote.example.test/api/vault/local/collaboration/health',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'X-API-Key': 'remote-key',
          'X-Claw-Vault-Pairing-Key': 'pair-key-1234567890',
        }),
      }),
    )
    expect(health).toEqual(
      expect.objectContaining({
        ok: true,
        readiness: 'ready',
        readinessLabel: 'Provider ready',
        readinessSeverity: 'success',
        canonicalStore: 'local_sqlite',
        remoteRequired: false,
        pairingApproved: true,
        events: true,
        crdtSnapshots: true,
        counts: {
          approvedPairings: 2,
          activeEvents: 3,
          crdtSnapshots: 4,
        },
        lastEventAt: 20,
        lastSnapshotAt: 30,
        lastPairingSeenAt: 40,
      }),
    )
  })

  it('classifies paired remote collaboration providers with no activity as idle', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        data: {
          canonical_store: 'local_sqlite',
          collaboration_pairing: 'approved',
          events: true,
          crdt_snapshots: true,
          counts: {
            approved_pairings: 1,
            active_events: 0,
            crdt_snapshots: 0,
          },
        },
      }),
    })))
    const { testVaultCollaborationRemoteProvider } = await loadVault()

    const health = await testVaultCollaborationRemoteProvider({
      baseUrl: 'https://remote.example.test/',
      pairingKey: 'pair-key-1234567890',
    })

    expect(health).toEqual(
      expect.objectContaining({
        ok: true,
        readiness: 'idle',
        readinessLabel: 'Ready, no document activity yet',
        readinessSeverity: 'warning',
        error: undefined,
      }),
    )
  })

  it('approves, lists, and revokes remote collaboration pairings through the local vault', async () => {
    apiMock.post.mockImplementation(async (url: string) => {
      if (url.endsWith('/collaboration/pairings/revoke')) {
        return { data: { revoked: 1, revokedAt: 120 } }
      }
      return {
        data: {
          id: 'pairing-1',
          deviceLabel: 'Mac Studio',
          status: 'approved',
          keyFingerprint: 'abc123def456',
          createdAt: 10,
          updatedAt: 20,
          approvedAt: 20,
          revokedAt: null,
          lastSeenAt: null,
        },
      }
    })
    apiMock.get.mockResolvedValue({
      data: {
        pairings: [
          {
            id: 'pairing-1',
            deviceLabel: 'Mac Studio',
            status: 'approved',
            keyFingerprint: 'abc123def456',
            createdAt: 10,
            updatedAt: 20,
            approvedAt: 20,
            revokedAt: null,
            lastSeenAt: 30,
          },
        ],
      },
    })
    const { approveVaultCollaborationPairing, getVaultCollaborationPairings, revokeVaultCollaborationPairing } =
      await loadVault()

    const approved = await approveVaultCollaborationPairing('pair-key-1234567890', 'Mac Studio')
    const pairings = await getVaultCollaborationPairings()
    const revoked = await revokeVaultCollaborationPairing({ pairingId: 'pairing-1' })

    expect(apiMock.post).toHaveBeenNthCalledWith(1, '/api/vault/local/collaboration/pairings', {
      pairing_key: 'pair-key-1234567890',
      device_label: 'Mac Studio',
    })
    expect(apiMock.get).toHaveBeenCalledWith('/api/vault/local/collaboration/pairings')
    expect(apiMock.post).toHaveBeenNthCalledWith(2, '/api/vault/local/collaboration/pairings/revoke', {
      pairing_id: 'pairing-1',
      pairing_key: undefined,
    })
    expect(approved).toEqual(expect.objectContaining({ id: 'pairing-1', keyFingerprint: 'abc123def456' }))
    expect(pairings).toEqual([expect.objectContaining({ status: 'approved', lastSeenAt: 30 })])
    expect(revoked).toEqual({ revoked: 1, revokedAt: 120 })
  })

  it('lists, restores, and discards recoverable local drafts', async () => {
    apiMock.put.mockResolvedValue({ data: { rev: 'local-1' } })
    const { createNote, discardLocalDraft, getRecoverableDrafts, restoreLocalDraft, saveLocalDraft } = await loadVault()

    const note = await createNote('Drafted Note', 'Inbox', '# Original')
    saveLocalDraft(note._id, '# Recovered')
    const drafts = getRecoverableDrafts()
    const restored = await restoreLocalDraft(note._id)
    saveLocalDraft(note._id, '# Throw away')
    discardLocalDraft(note._id)

    expect(drafts).toEqual([
      expect.objectContaining({
        id: 'Inbox/drafted-note.md',
        title: 'Drafted Note',
        folder: 'Inbox',
        content: '# Recovered',
      }),
    ])
    expect(restored).toEqual(expect.objectContaining({ content: '# Recovered' }))
    expect(getRecoverableDrafts()).toEqual([])
  })

  it('uploads attachments to the local vault first', async () => {
    apiMock.post.mockResolvedValue({
      data: {
        id: 'Media/10-diagram.png',
        rev: 'local-10',
        mime: 'image/png',
        size: 4,
        created_at: 10,
      },
    })
    const { uploadAttachment, getAllNotes } = await loadVault()

    const uploaded = await uploadAttachment(new File(['test'], 'diagram.png', { type: 'image/png' }), 'Media')
    const notes = await getAllNotes()

    expect(apiMock.post).toHaveBeenCalledWith(
      '/api/vault/local/attachment',
      expect.objectContaining({
        name: 'diagram.png',
        mime: 'image/png',
        folder: 'Media',
        data: expect.stringContaining('data:image/png;base64,'),
      }),
    )
    expect(uploaded).toEqual(expect.objectContaining({ id: 'Media/10-diagram.png', mime: 'image/png' }))
    expect(notes).toEqual([
      expect.objectContaining({
        _id: 'Media/10-diagram.png',
        type: 'attachment',
        folder: 'Media',
      }),
    ])
  })

  it('does not fall back to legacy CouchDB attachment upload routes', async () => {
    apiMock.post.mockRejectedValue(new Error('local attachment failed'))
    const { uploadAttachment } = await loadVault()

    await expect(uploadAttachment(new File(['test'], 'diagram.png', { type: 'image/png' }), 'Media')).rejects.toThrow(
      'local attachment failed',
    )
    expect(apiMock.post).toHaveBeenCalledTimes(1)
    expect(apiMock.post).toHaveBeenCalledWith('/api/vault/local/attachment', expect.any(Object))
    expect(apiMock.post.mock.calls.some(([path]) => String(path).startsWith('/api/vault/attachment'))).toBe(false)
  })

  it('can preserve imported attachment IDs', async () => {
    apiMock.post.mockResolvedValue({
      data: {
        id: 'Assets/diagram.png',
        rev: 'local-11',
        mime: 'image/png',
        size: 4,
        created_at: 11,
      },
    })
    const { uploadAttachment } = await loadVault()

    await uploadAttachment(new File(['test'], 'diagram.png', { type: 'image/png' }), 'Assets', 'Assets/diagram.png')

    expect(apiMock.post).toHaveBeenCalledWith(
      '/api/vault/local/attachment',
      expect.objectContaining({
        id: 'Assets/diagram.png',
        folder: 'Assets',
        name: 'diagram.png',
      }),
    )
  })

  it('trashes, restores, and permanently deletes local attachments', async () => {
    apiMock.post
      .mockResolvedValueOnce({
        data: {
          id: 'Media/10-diagram.png',
          rev: 'local-10',
          mime: 'image/png',
          size: 4,
          created_at: 10,
        },
      })
      .mockResolvedValueOnce({ data: { ok: true, rev: 'local-trash' } })
      .mockResolvedValueOnce({ data: { ok: true, rev: 'local-restore' } })
    apiMock.del.mockResolvedValue({ data: { ok: true } })
    const { deleteNote, getAllNotes, restoreTrashedNote, trashNote, uploadAttachment } = await loadVault()

    const uploaded = await uploadAttachment(new File(['test'], 'diagram.png', { type: 'image/png' }), 'Media')
    await trashNote(uploaded.id)
    let notes = await getAllNotes()
    expect(apiMock.post).toHaveBeenNthCalledWith(2, '/api/vault/local/attachment/trash?id=Media%2F10-diagram.png', {})
    expect(notes[0]).toEqual(expect.objectContaining({ type: 'attachment', folder: 'Trash/Media' }))

    await restoreTrashedNote(uploaded.id)
    notes = await getAllNotes()
    expect(apiMock.post).toHaveBeenNthCalledWith(3, '/api/vault/local/attachment/trash/restore', {
      id: 'Media/10-diagram.png',
      folder: undefined,
    })
    expect(notes[0]).toEqual(expect.objectContaining({ type: 'attachment', folder: 'Media' }))

    await deleteNote(uploaded.id)
    expect(apiMock.del).toHaveBeenCalledWith('/api/vault/local/attachment?id=Media%2F10-diagram.png')
    expect(await getAllNotes()).toEqual([])
  })

  it('imports legacy CouchDB notes into local vault when local vault is empty', async () => {
    apiMock.get
      .mockResolvedValueOnce({ data: { notes: [], attachments: [] } })
      .mockResolvedValueOnce({
        data: {
          notes: [
            {
              _id: 'Legacy/project.md',
              type: 'note',
              title: 'Project',
              content: '# Project',
              folder: 'Legacy',
              tags: ['legacy'],
              links: [],
              created_at: 10,
              updated_at: 20,
            },
          ],
          attachments: [],
        },
      })
      .mockResolvedValueOnce({
        data: {
          folders: [
            {
              _id: 'cc:folder:Legacy',
              type: 'folder',
              path: 'Legacy',
              name: 'Legacy',
              created_at: 10,
              updated_at: 20,
            },
          ],
        },
      })
    apiMock.post.mockResolvedValue({ data: { imported_notes: 1, imported_folders: 1 } })
    const { getAllNotes, getAllFolders } = await loadVault()

    const notes = await getAllNotes()
    const folders = await getAllFolders()

    expect(apiMock.post).toHaveBeenCalledWith('/api/vault/local/import', {
      notes: [expect.objectContaining({ _id: 'Legacy/project.md', content: '# Project' })],
      folders: [expect.objectContaining({ path: 'Legacy' })],
    })
    expect(notes).toEqual([expect.objectContaining({ _id: 'Legacy/project.md', folder: 'Legacy' })])
    expect(folders).toEqual([expect.objectContaining({ path: 'Legacy' })])
  })

  it('recovers legacy markdown bodies when the local vault contains only unsafe blank imports', async () => {
    apiMock.get.mockImplementation(async (path: string) => {
      if (path === '/api/vault/local/documents') {
        return {
          data: {
            notes: [
              {
                _id: 'Legacy/one.md',
                type: 'note',
                title: 'One',
                content: '',
                folder: 'Legacy',
                tags: [],
                links: [],
                aliases: [],
                created_at: 1,
                updated_at: 2,
              },
              {
                _id: 'Legacy/two.md',
                type: 'note',
                title: 'Two',
                content: '',
                folder: 'Legacy',
                tags: [],
                links: [],
                aliases: [],
                created_at: 1,
                updated_at: 3,
              },
            ],
            attachments: [],
          },
        }
      }
      if (String(path).startsWith('/api/vault/local/doc?id=')) throw new Error('blank local body')
      if (path === '/api/vault/notes') {
        return {
          data: {
            notes: [
              {
                _id: 'Legacy/one.md',
                title: 'One',
                content_markdown: '# One\n\nRecovered from legacy markdown.',
                folder: 'Legacy',
                tags: [],
                links: [],
                created_at: 1,
                updated_at: 2,
              },
              {
                _id: 'Legacy/two.md',
                title: 'Two',
                markdown: '# Two\n\nRecovered from legacy markdown.',
                folder: 'Legacy',
                tags: [],
                links: [],
                created_at: 1,
                updated_at: 3,
              },
            ],
          },
        }
      }
      if (path === '/api/vault/folders') return { data: { folders: [] } }
      throw new Error(`Unexpected request: ${path}`)
    })
    apiMock.post.mockResolvedValue({ data: { imported_notes: 2 } })
    const { getAllNotes } = await loadVault()

    const notes = await getAllNotes()

    expect(notes.map(note => note.content)).toEqual([
      '# Two\n\nRecovered from legacy markdown.',
      '# One\n\nRecovered from legacy markdown.',
    ])
    expect(apiMock.post).toHaveBeenCalledWith('/api/vault/local/import', {
      notes: [
        expect.objectContaining({ _id: 'Legacy/one.md', content: '# One\n\nRecovered from legacy markdown.' }),
        expect.objectContaining({ _id: 'Legacy/two.md', content: '# Two\n\nRecovered from legacy markdown.' }),
      ],
      folders: [],
    })
  })

  it('searches notes through the local vault FTS endpoint', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        notes: [
          {
            _id: 'Projects/roadmap.md',
            type: 'note',
            title: 'Roadmap',
            content: '# Roadmap\n\nPrivate planning',
            folder: 'Projects',
            tags: ['strategy'],
            links: [],
            aliases: [],
            properties: { status: 'active' },
            created_at: 10,
            updated_at: 20,
          },
        ],
        attachments: [
          {
            _id: 'Media/private-strategy.png',
            type: 'attachment',
            title: 'private-strategy.png',
            filename: 'private-strategy.png',
            path: 'Media',
            folder: 'Media',
            created_at: 11,
            updated_at: 11,
          },
        ],
      },
    })
    const { searchVaultNotes } = await loadVault()

    const results = await searchVaultNotes('private strategy')

    expect(apiMock.get).toHaveBeenCalledWith('/api/vault/local/search?q=private%20strategy&include_trashed=true')
    expect(results).toEqual([
      expect.objectContaining({
        _id: 'Projects/roadmap.md',
        folder: 'Projects',
        tags: ['strategy'],
      }),
      expect.objectContaining({
        _id: 'Media/private-strategy.png',
        type: 'attachment',
        title: 'private-strategy.png',
        folder: 'Media',
      }),
    ])
  })

  it('creates, lists, and resolves local document comments', async () => {
    apiMock.post
      .mockResolvedValueOnce({
        data: {
          comment: {
            id: 'comment-1',
            document_id: 'Projects/roadmap.md',
            anchor: { scope: 'document' },
            body: 'Tighten intro',
            status: 'open',
            created_at: 10,
            updated_at: 10,
            resolved_at: null,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          reply: {
            id: 'reply-1',
            comment_id: 'comment-1',
            document_id: 'Projects/roadmap.md',
            body: 'Agreed',
            created_at: 11,
            updated_at: 11,
          },
        },
      })
      .mockResolvedValueOnce({ data: { ok: true, id: 'comment-1' } })
    apiMock.get.mockResolvedValue({
      data: {
        comments: [
          {
            id: 'comment-1',
            document_id: 'Projects/roadmap.md',
            anchor: { scope: 'document' },
            body: 'Tighten intro',
            status: 'open',
            created_at: 10,
            updated_at: 10,
            resolved_at: null,
            replies: [
              {
                id: 'reply-1',
                comment_id: 'comment-1',
                document_id: 'Projects/roadmap.md',
                body: 'Agreed',
                created_at: 11,
                updated_at: 11,
              },
            ],
          },
        ],
      },
    })
    const { createNoteComment, createNoteCommentReply, getNoteComments, resolveNoteComment } = await loadVault()

    const created = await createNoteComment('Projects/roadmap.md', 'Tighten intro', { scope: 'document' })
    const reply = await createNoteCommentReply('comment-1', 'Agreed')
    const comments = await getNoteComments('Projects/roadmap.md')
    await resolveNoteComment('comment-1')

    expect(apiMock.post).toHaveBeenNthCalledWith(1, '/api/vault/local/comments', {
      document_id: 'Projects/roadmap.md',
      body: 'Tighten intro',
      anchor_json: { scope: 'document' },
    })
    expect(apiMock.post).toHaveBeenNthCalledWith(2, '/api/vault/local/comments/comment-1/replies', {
      body: 'Agreed',
    })
    expect(apiMock.get).toHaveBeenCalledWith('/api/vault/local/comments?id=Projects%2Froadmap.md')
    expect(apiMock.post).toHaveBeenNthCalledWith(3, '/api/vault/local/comments/comment-1/resolve', {})
    expect(created).toEqual(expect.objectContaining({ id: 'comment-1', body: 'Tighten intro' }))
    expect(reply).toEqual(expect.objectContaining({ id: 'reply-1', body: 'Agreed' }))
    expect(comments).toEqual([
      expect.objectContaining({ id: 'comment-1', replies: [expect.objectContaining({ id: 'reply-1' })] }),
    ])
  })

  it('creates, lists, applies, and rejects local document suggestions', async () => {
    apiMock.post
      .mockResolvedValueOnce({
        data: {
          suggestion: {
            id: 'suggestion-1',
            document_id: 'Projects/roadmap.md',
            anchor: { scope: 'document' },
            patch: { type: 'replace_document', content: '# Roadmap\n\nSharper plan', body: 'Sharpen plan' },
            status: 'open',
            created_at: 10,
            applied_at: null,
          },
        },
      })
      .mockResolvedValueOnce({ data: { ok: true, id: 'suggestion-1', status: 'applied' } })
      .mockResolvedValueOnce({ data: { ok: true, id: 'suggestion-1', status: 'rejected' } })
    apiMock.get.mockResolvedValue({
      data: {
        suggestions: [
          {
            id: 'suggestion-1',
            document_id: 'Projects/roadmap.md',
            anchor: { scope: 'document' },
            patch: { type: 'replace_document', content: '# Roadmap\n\nSharper plan', body: 'Sharpen plan' },
            status: 'open',
            created_at: 10,
            applied_at: null,
          },
        ],
      },
    })
    const { applyNoteSuggestion, createNoteSuggestion, getNoteSuggestions, rejectNoteSuggestion } = await loadVault()

    const created = await createNoteSuggestion(
      'Projects/roadmap.md',
      { type: 'replace_document', content: '# Roadmap\n\nSharper plan' },
      'Sharpen plan',
      { scope: 'document' },
    )
    const suggestions = await getNoteSuggestions('Projects/roadmap.md')
    await applyNoteSuggestion('suggestion-1')
    await rejectNoteSuggestion('suggestion-1')

    expect(apiMock.post).toHaveBeenNthCalledWith(1, '/api/vault/local/suggestions', {
      document_id: 'Projects/roadmap.md',
      body: 'Sharpen plan',
      anchor_json: { scope: 'document' },
      patch_json: { type: 'replace_document', content: '# Roadmap\n\nSharper plan' },
    })
    expect(apiMock.get).toHaveBeenCalledWith('/api/vault/local/suggestions?id=Projects%2Froadmap.md')
    expect(apiMock.post).toHaveBeenNthCalledWith(2, '/api/vault/local/suggestions/suggestion-1/apply', {})
    expect(apiMock.post).toHaveBeenNthCalledWith(3, '/api/vault/local/suggestions/suggestion-1/reject', {})
    expect(created).toEqual(expect.objectContaining({ id: 'suggestion-1', status: 'open' }))
    expect(suggestions).toEqual([expect.objectContaining({ id: 'suggestion-1' })])
  })

  it('exports and imports encrypted local vault backups', async () => {
    apiMock.post
      .mockResolvedValueOnce({
        data: {
          backup: {
            format: 'clawctrl-encrypted-vault-backup',
            version: 1,
            created_at: '2026-05-12T00:00:00Z',
            encryption: {
              algorithm: 'AES-256-GCM',
              kdf: 'Argon2id',
              salt: 'salt',
              nonce: 'nonce',
            },
            ciphertext: 'ciphertext',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          imported_notes: 1,
          imported_folders: 1,
          imported_attachments: 1,
          imported_versions: 1,
          imported_comments: 1,
          imported_comment_replies: 1,
          imported_suggestions: 1,
          imported_audit_events: 1,
          imported_save_queue: 1,
          imported_sync_state: 1,
        },
      })
    const { exportEncryptedVault, importEncryptedVault, getAllNotes } = await loadVault()

    const backup = await exportEncryptedVault('long-password')
    const stats = await importEncryptedVault('long-password', backup)
    const notes = await getAllNotes()

    expect(apiMock.post).toHaveBeenNthCalledWith(1, '/api/vault/local/export/encrypted', {
      password: 'long-password',
    })
    expect(apiMock.post).toHaveBeenNthCalledWith(2, '/api/vault/local/import/encrypted', {
      password: 'long-password',
      backup,
    })
    expect(apiMock.get).toHaveBeenCalledWith('/api/vault/local/documents')
    expect(backup).toEqual(expect.objectContaining({ format: 'clawctrl-encrypted-vault-backup' }))
    expect(stats).toEqual(
      expect.objectContaining({
        imported_notes: 1,
        imported_attachments: 1,
        imported_audit_events: 1,
        imported_save_queue: 1,
        imported_sync_state: 1,
      }),
    )
    expect(notes).toEqual([])
  })

  it('loads, previews, restores, names, and checkpoints local revisions', async () => {
    apiMock.get
      .mockResolvedValueOnce({
        data: {
          revisions: [
            {
              rev: 'local:Projects/roadmap.md:2',
              status: 'available',
              version_number: 2,
              label: 'Launch draft',
              created_at: 10,
              created_by: 'local',
              reason: 'checkpoint',
              checksum: 'abc',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          revision: {
            rev: 'local:Projects/roadmap.md:2',
            document_id: 'Projects/roadmap.md',
            status: 'available',
            version_number: 2,
            label: 'Launch draft',
            content: '# Roadmap',
            metadata: { title: 'Roadmap' },
            created_at: 10,
            created_by: 'local',
            reason: 'checkpoint',
            checksum: 'abc',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          _id: 'Projects/roadmap.md',
          type: 'note',
          title: 'Roadmap',
          content: '# Restored Roadmap',
          folder: 'Projects',
          tags: ['strategy'],
          links: [],
          aliases: [],
          properties: { status: 'restored' },
          created_at: 1,
          updated_at: 20,
        },
      })
    apiMock.post
      .mockResolvedValueOnce({ data: { id: 'Projects/roadmap.md', rev: 'local-restore' } })
      .mockResolvedValueOnce({ data: { id: 'Projects/roadmap.md', rev: 'local:Projects/roadmap.md:3' } })
      .mockResolvedValueOnce({
        data: { id: 'Projects/roadmap.md', rev: 'local:Projects/roadmap.md:2', label: 'Final draft' },
      })
    const { createNoteVersionCheckpoint, getNoteRevision, getNoteRevisions, labelNoteRevision, restoreNoteRevision } =
      await loadVault()

    const revisions = await getNoteRevisions('Projects/roadmap.md')
    const preview = await getNoteRevision('Projects/roadmap.md', 'local:Projects/roadmap.md:2')
    const restored = await restoreNoteRevision('Projects/roadmap.md', 'local:Projects/roadmap.md:2')
    const checkpoint = await createNoteVersionCheckpoint('Projects/roadmap.md', 'Launch draft')
    await labelNoteRevision('Projects/roadmap.md', 'local:Projects/roadmap.md:2', 'Final draft')

    expect(apiMock.get).toHaveBeenNthCalledWith(1, '/api/vault/local/revisions?id=Projects%2Froadmap.md')
    expect(apiMock.get).toHaveBeenNthCalledWith(
      2,
      '/api/vault/local/revision?id=Projects%2Froadmap.md&rev=local%3AProjects%2Froadmap.md%3A2',
    )
    expect(apiMock.post).toHaveBeenNthCalledWith(1, '/api/vault/local/restore', {
      id: 'Projects/roadmap.md',
      rev: 'local:Projects/roadmap.md:2',
    })
    expect(apiMock.get).toHaveBeenNthCalledWith(3, '/api/vault/local/doc?id=Projects%2Froadmap.md')
    expect(apiMock.post).toHaveBeenNthCalledWith(2, '/api/vault/local/revisions/checkpoint', {
      id: 'Projects/roadmap.md',
      label: 'Launch draft',
    })
    expect(apiMock.post).toHaveBeenNthCalledWith(3, '/api/vault/local/revisions/label', {
      id: 'Projects/roadmap.md',
      rev: 'local:Projects/roadmap.md:2',
      label: 'Final draft',
    })
    expect(revisions).toEqual([expect.objectContaining({ rev: 'local:Projects/roadmap.md:2', label: 'Launch draft' })])
    expect(preview).toEqual(expect.objectContaining({ content: '# Roadmap', reason: 'checkpoint' }))
    expect(restored).toEqual(expect.objectContaining({ _id: 'Projects/roadmap.md', content: '# Restored Roadmap' }))
    expect(checkpoint).toBe('local:Projects/roadmap.md:3')
  })

  it('parses Obsidian frontmatter aliases and tags', async () => {
    apiMock.put.mockResolvedValue({})
    const { createNote, getAllNotes, noteIdFromTitle } = await loadVault()

    const content = [
      '---',
      'aliases: [Roadmap Alpha, RA]',
      'tags:',
      '  - strategy',
      '  - #planning',
      'status: active',
      '---',
      '',
      '# Roadmap',
    ].join('\n')
    await createNote('Roadmap', 'Plans', content)
    const notes = await getAllNotes()

    expect(notes[0]).toEqual(
      expect.objectContaining({
        aliases: ['Roadmap Alpha', 'RA'],
        tags: expect.arrayContaining(['strategy', 'planning']),
        properties: expect.objectContaining({
          status: 'active',
        }),
      }),
    )
    expect(noteIdFromTitle('Roadmap Alpha', notes)).toBe('Plans/roadmap.md')
  })

  it('resolves wikilinks with paths, headings, and aliases', async () => {
    apiMock.put.mockResolvedValue({})
    const { createNote, getAllNotes, noteIdFromTitle } = await loadVault()

    await createNote('Deep Work', 'Ideas', 'Body')
    const notes = await getAllNotes()

    expect(noteIdFromTitle('Ideas/Deep Work#Next steps', notes)).toBe('Ideas/deep-work.md')
    expect(noteIdFromTitle('Deep Work.md', notes)).toBe('Ideas/deep-work.md')
  })

  it('rewrites wikilinks on title rename while preserving headings and display aliases', async () => {
    const { rewriteWikilinks } = await loadVault()

    expect(
      rewriteWikilinks(
        'See [[Old Title]], [[Folder/Old Title#Plan|the plan]], and [[Other]].',
        'Old Title',
        'New Title',
      ),
    ).toBe('See [[New Title]], [[Folder/New Title#Plan|the plan]], and [[Other]].')
  })

  it('rewrites wikilinks on path move while preserving headings and display aliases', async () => {
    const { rewriteWikilinkPath } = await loadVault()

    expect(
      rewriteWikilinkPath(
        'See [[Projects/Roadmap#Scope|scope]], [[Roadmap]], and [[Projects/Other]].',
        'Projects/roadmap.md',
        'Archive/roadmap.md',
      ),
    ).toBe('See [[Archive/Roadmap#Scope|scope]], [[Roadmap]], and [[Projects/Other]].')
  })

  it('can promote the first unlinked mention to a wikilink', async () => {
    const { linkFirstPlainMention } = await loadVault()

    expect(linkFirstPlainMention('Roadmap connects to delivery. Roadmap stays.', 'Roadmap')).toBe(
      '[[Roadmap]] connects to delivery. Roadmap stays.',
    )
    expect(linkFirstPlainMention('Alpha connects to delivery.', 'Alpha', 'Project Alpha')).toBe(
      '[[Project Alpha|Alpha]] connects to delivery.',
    )
  })
})
