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

describe('vault notes', () => {
  it('creates unique note paths instead of overwriting repeated titles', async () => {
    apiMock.put.mockResolvedValue({})
    const { createNote, getAllNotes } = await loadVault()

    const first = await createNote('Untitled', 'Projects')
    const second = await createNote('Untitled', 'Projects')
    const notes = await getAllNotes()

    expect(first._id).toBe('Projects/untitled.md')
    expect(second._id).toBe('Projects/untitled-2.md')
    expect(notes.map((note) => note._id).sort()).toEqual([
      'Projects/untitled-2.md',
      'Projects/untitled.md',
    ])
  })

  it('creates notes with initial content for templates and duplicates', async () => {
    apiMock.put.mockResolvedValue({})
    const { createNote, getAllNotes } = await loadVault()

    const note = await createNote('Daily 2026-05-08', 'Daily', '# May 8\n\n- [ ] Ship notes\n')
    const notes = await getAllNotes()

    expect(note).toEqual(expect.objectContaining({
      _id: 'Daily/daily-2026-05-08.md',
      content: '# May 8\n\n- [ ] Ship notes\n',
      folder: 'Daily',
    }))
    expect(notes[0].content).toContain('Ship notes')
  })

  it('moves a note by creating the new doc and deleting the old doc', async () => {
    apiMock.put
      .mockResolvedValueOnce({ data: { rev: '1-old' } })
      .mockResolvedValueOnce({ data: { rev: '1-new' } })
    apiMock.del.mockResolvedValue(undefined)
    const { createNote, moveNote, getAllNotes } = await loadVault()

    const note = await createNote('Project Brief', 'Inbox', '# Brief')
    const moved = await moveNote(note._id, 'Projects/Active')
    const notes = await getAllNotes()

    expect(moved).toEqual(expect.objectContaining({
      _id: 'Projects/Active/project-brief.md',
      _rev: '1-new',
      folder: 'Projects/Active',
      content: '# Brief',
    }))
    expect(apiMock.del).toHaveBeenCalledWith('/api/vault/doc?id=Inbox%2Fproject-brief.md&rev=1-old')
    expect(notes.map((n) => n._id)).toEqual(['Projects/Active/project-brief.md'])
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

    expect(notes[0]).toEqual(expect.objectContaining({
      aliases: ['Roadmap Alpha', 'RA'],
      tags: expect.arrayContaining(['strategy', 'planning']),
      properties: expect.objectContaining({
        status: 'active',
      }),
    }))
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

  it('can promote the first unlinked mention to a wikilink', async () => {
    const { linkFirstPlainMention } = await loadVault()

    expect(linkFirstPlainMention('Roadmap connects to delivery. Roadmap stays.', 'Roadmap'))
      .toBe('[[Roadmap]] connects to delivery. Roadmap stays.')
  })
})
