import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Notes from '../Notes'
import type { NoteSelectionAnchor, VaultFolder, VaultNote } from '../types'
import { vaultPluginWriteMarkdown } from '@/features/notes/vaultPlugins'
import type { VaultAuditEvent, VaultComment, VaultRevision, VaultRevisionDetail, VaultStatus, VaultSuggestion, VaultSyncLedger } from '@/lib/vault'

const mocks = vi.hoisted(() => ({
  notes: [] as VaultNote[],
  unavailableNotes: [] as VaultNote[],
  folders: [] as VaultFolder[],
  error: null as string | null,
  trashNote: vi.fn(() => Promise.resolve()),
  deleteNote: vi.fn(() => Promise.resolve()),
  trashFolder: vi.fn(() => Promise.resolve()),
  restoreTrashedNote: vi.fn((id: string) => Promise.resolve(note({ _id: id, folder: 'Homework' }))),
  restoreTrashedFolder: vi.fn(() => Promise.resolve()),
  emptyTrash: vi.fn(() => Promise.resolve()),
  refresh: vi.fn(() => Promise.resolve()),
  createFolder: vi.fn(() => Promise.resolve()),
  deleteFolder: vi.fn(() => Promise.resolve()),
  moveNote: vi.fn((id: string, folder: string) => {
    const source = mocks.notes.find(note => note._id === id)
    const moved = source
      ? { ...source, _id: `${folder}/${source.title}.md`, folder }
      : note({ _id: `${folder}/moved.md`, title: 'moved', folder })
    return Promise.resolve(moved)
  }),
  updateNote: vi.fn((note: VaultNote) => Promise.resolve(note)),
  getNoteComments: vi.fn(() => Promise.resolve([] as VaultComment[])),
  createNoteComment: vi.fn(() => Promise.resolve(null)),
  createNoteCommentReply: vi.fn(() => Promise.resolve(null)),
  getNoteSuggestions: vi.fn(() => Promise.resolve([] as VaultSuggestion[])),
  createNoteSuggestion: vi.fn(() => Promise.resolve(null)),
  applyNoteSuggestion: vi.fn(() => Promise.resolve()),
  rejectNoteSuggestion: vi.fn(() => Promise.resolve()),
  resolveVaultSyncConflict: vi.fn(() => Promise.resolve()),
  createNote: vi.fn((title: string, folder?: string, content = '') => Promise.resolve({
    _id: `${folder || 'Inbox'}/${title}.md`,
    type: 'note',
    title,
    content,
    folder: folder || 'Inbox',
    tags: [],
    links: [],
    aliases: [],
    created_at: 10,
    updated_at: 10,
  } as VaultNote)),
  createNoteVersionCheckpoint: vi.fn(() => Promise.resolve('rev-new')),
  getNoteRevisions: vi.fn(() => Promise.resolve([] as VaultRevision[])),
  getNoteRevision: vi.fn(() => Promise.resolve(null as VaultRevisionDetail | null)),
  restoreNoteRevision: vi.fn((id: string) => Promise.resolve(note({ _id: id }))),
  labelNoteRevision: vi.fn(() => Promise.resolve(null)),
  writeText: vi.fn(() => Promise.resolve()),
  downloadPublishedNotesSite: vi.fn(),
  downloadReviewPackage: vi.fn(),
  exportEncryptedVault: vi.fn(() => Promise.resolve({ format: 'clawcontrol-encrypted-vault', version: 1 })),
  importEncryptedVault: vi.fn(() => Promise.resolve(null)),
  approveVaultCollaborationPairing: vi.fn(() => Promise.resolve(null)),
  revokeVaultCollaborationPairing: vi.fn(() => Promise.resolve(null)),
  getVaultAuditEvents: vi.fn(() => Promise.resolve([] as VaultAuditEvent[])),
  getVaultStatus: vi.fn(() => Promise.resolve(null as VaultStatus | null)),
  getVaultSyncLedger: vi.fn(() => Promise.resolve(null as VaultSyncLedger | null)),
  apiGet: vi.fn(() => Promise.resolve({ data: { content: '' } })),
  apiPut: vi.fn(() => Promise.resolve({ data: {} })),
}))

function note(overrides: Partial<VaultNote> = {}): VaultNote {
  return {
    _id: 'Homework/commands.md',
    type: 'note',
    title: 'commands',
    content: '# commands',
    folder: 'Homework',
    tags: [],
    links: [],
    aliases: [],
    created_at: 1,
    updated_at: 2,
    ...overrides,
  }
}

function suggestion(overrides: Partial<VaultSuggestion> = {}): VaultSuggestion {
  return {
    id: 'suggestion-1',
    document_id: 'Homework/commands.md',
    anchor: { scope: 'selection', start: 2, end: 10, quote: 'commands' },
    patch: { type: 'replace_selection', content: 'brief' },
    status: 'open',
    created_at: 20,
    applied_at: null,
    ...overrides,
  }
}

function comment(overrides: Partial<VaultComment> = {}): VaultComment {
  return {
    id: 'comment-1',
    document_id: 'Homework/commands.md',
    body: 'Needs review',
    anchor: { scope: 'selection', quote: 'commands' },
    status: 'open',
    created_at: 20,
    resolved_at: null,
    replies: [],
    ...overrides,
  }
}

function revision(overrides: Partial<VaultRevision> = {}): VaultRevision {
  return {
    rev: 'rev-1',
    status: 'available',
    version_number: 1,
    label: 'Initial draft',
    created_at: 20,
    reason: 'checkpoint',
    ...overrides,
  }
}

function revisionDetail(overrides: Partial<VaultRevisionDetail> = {}): VaultRevisionDetail {
  return {
    ...revision(overrides),
    document_id: 'Homework/commands.md',
    content: '# commands\n\nVersion body',
    ...overrides,
  }
}

vi.mock('@/hooks/notes/useVault', () => ({
  useVault: () => ({
    notes: mocks.notes,
    unavailableNotes: mocks.unavailableNotes,
    folders: mocks.folders,
    loading: false,
    syncing: false,
    error: mocks.error,
    refresh: mocks.refresh,
    createNote: mocks.createNote,
    createFolder: mocks.createFolder,
    updateNote: mocks.updateNote,
    moveNote: mocks.moveNote,
    deleteNote: mocks.deleteNote,
    trashNote: mocks.trashNote,
    trashFolder: mocks.trashFolder,
    restoreTrashedNote: mocks.restoreTrashedNote,
    restoreTrashedFolder: mocks.restoreTrashedFolder,
    emptyTrash: mocks.emptyTrash,
    deleteFolder: mocks.deleteFolder,
  }),
}))

vi.mock('@/lib/vault', () => ({
  applyNoteSuggestion: mocks.applyNoteSuggestion,
  approveVaultCollaborationPairing: mocks.approveVaultCollaborationPairing,
  createNoteComment: mocks.createNoteComment,
  createNoteCommentReply: mocks.createNoteCommentReply,
  createNoteSuggestion: mocks.createNoteSuggestion,
  createNoteVersionCheckpoint: mocks.createNoteVersionCheckpoint,
  createVaultCollaborationHttpTransport: vi.fn(() => null),
  discardLocalDraft: vi.fn(),
  exportEncryptedVault: mocks.exportEncryptedVault,
  getNoteComments: mocks.getNoteComments,
  getNoteRevision: mocks.getNoteRevision,
  getNoteRevisions: mocks.getNoteRevisions,
  getNoteSuggestions: mocks.getNoteSuggestions,
  getRecoverableDrafts: vi.fn(() => []),
  getVaultAuditEvents: mocks.getVaultAuditEvents,
  getVaultCollaborationCrdtState: vi.fn(() => Promise.resolve(null)),
  getVaultCollaborationPairings: vi.fn(() => Promise.resolve([])),
  getVaultStatus: mocks.getVaultStatus,
  getVaultSyncLedger: mocks.getVaultSyncLedger,
  importEncryptedVault: mocks.importEncryptedVault,
  labelNoteRevision: mocks.labelNoteRevision,
  linkFirstPlainMention: vi.fn((content: string) => content),
  listVaultCollaborationEvents: vi.fn(() => Promise.resolve([])),
  noteIdFromTitle: vi.fn((title: string) => title.toLowerCase().replaceAll(' ', '-')),
  normalizeFolderPath: vi.fn((path: string | null | undefined) => path?.trim() ?? ''),
  publishVaultCollaborationEvent: vi.fn(() => Promise.resolve(null)),
  rejectNoteSuggestion: mocks.rejectNoteSuggestion,
  resolveNoteComment: vi.fn(() => Promise.resolve(null)),
  resolveVaultSyncConflict: mocks.resolveVaultSyncConflict,
  restoreLocalDraft: vi.fn(() => null),
  restoreNoteRevision: mocks.restoreNoteRevision,
  rewriteWikilinkPath: vi.fn((content: string) => content),
  rewriteWikilinks: vi.fn((content: string) => content),
  revokeVaultCollaborationPairing: mocks.revokeVaultCollaborationPairing,
  saveLocalDraft: vi.fn(),
  saveVaultCollaborationCrdtState: vi.fn(() => Promise.resolve(null)),
  searchVaultNotes: vi.fn(() => Promise.resolve([])),
  testVaultCollaborationRemoteProvider: vi.fn(() => Promise.resolve(null)),
  uploadAttachment: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: mocks.apiGet,
    put: mocks.apiPut,
  },
  getRemoteApiKey: vi.fn(() => null),
  getRequestApiKeyForPath: vi.fn(() => null),
  getRequestBaseForPath: vi.fn(() => ''),
}))

vi.mock('@/lib/vaultArchive', () => ({ verifyMarkdownVaultArchive: vi.fn(() => ({ ok: true, errors: [] })) }))
vi.mock('@/lib/vaultBackup', () => ({ verifyEncryptedVaultBackup: vi.fn(() => ({ ok: true, errors: [] })) }))

vi.mock('../NoteEditor', () => ({
  default: ({
    note,
    onChange,
    onSelectionChange,
    jumpToLineRequest,
  }: {
    note: VaultNote
    onChange: (content: string) => void
    onSelectionChange?: (anchor: NoteSelectionAnchor) => void
    jumpToLineRequest?: { noteId: string; lineNumber: number; requestId: number } | null
  }) => (
    <div
      data-testid="note-editor"
      data-jump-line={jumpToLineRequest?.noteId === note._id ? String(jumpToLineRequest.lineNumber) : ''}
    >
      <textarea
        aria-label="Markdown source editor"
        defaultValue={note.content}
        onChange={(event) => onChange(event.currentTarget.value)}
        onSelect={(event) => {
          const textarea = event.currentTarget
          const start = textarea.selectionStart ?? 0
          const end = textarea.selectionEnd ?? start
          onSelectionChange?.({
            scope: start === end ? 'cursor' : 'selection',
            mode: 'markdown',
            start,
            end,
            quote: start === end ? '' : textarea.value.slice(start, end),
          })
        }}
      />
      <div
        role="textbox"
        aria-label="Document editor"
        contentEditable
        suppressContentEditableWarning
        onMouseUp={() => onSelectionChange?.({
          scope: 'selection',
          start: 0,
          end: 13,
          quote: 'One two three',
        })}
        onInput={(event) => onChange(event.currentTarget.textContent || '')}
      >
        {note.content}
      </div>
    </div>
  ),
}))
vi.mock('../BacklinksPanel', () => ({
  default: ({
    collapsed = true,
    openRequest = 0,
  }: {
    collapsed?: boolean
    openRequest?: number
  }) => (
    <div data-testid="backlinks-panel" data-collapsed={String(collapsed)} data-open-request={openRequest} />
  ),
}))
vi.mock('../GraphView', () => ({ default: () => <div data-testid="graph-view" /> }))
vi.mock('../CanvasView', () => ({ default: () => <div data-testid="canvas-view" /> }))
vi.mock('@/features/notes/export', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/notes/export')>()
  return {
    ...actual,
    downloadDocx: vi.fn(),
    downloadHtml: vi.fn(),
    downloadMarkdown: vi.fn(),
    downloadPublishedNotesSite: mocks.downloadPublishedNotesSite,
    downloadReviewPackage: mocks.downloadReviewPackage,
    printNotePdf: vi.fn(),
    setFrontmatterProperty: vi.fn((markdown: string, key: string, rawValue: string) => {
    const body = markdown.startsWith('---\n')
      ? markdown.replace(/^---\n[\s\S]*?\n---\n*/, '')
      : markdown
    const value = rawValue.trim()
    return value ? `---\n${key}: ${value}\n---\n\n${body}` : body
    }),
  }
})
vi.mock('../clipper', () => ({
  buildClipNote: vi.fn(),
  readClipboardClipInput: vi.fn(() => Promise.resolve(null)),
}))
vi.mock('../collaboration', () => ({
  autoMergeLocalCollabOperation: vi.fn(() => null),
  createLayeredLocalCollabTransport: vi.fn(() => ({ status: () => [] })),
  mergeLocalCollabDraft: vi.fn(() => null),
  summarizeLocalCollabProviderStatuses: vi.fn(() => ({ state: 'ready', label: 'Collab ready', detail: '' })),
  useLocalNoteCollaboration: vi.fn(() => ({
    supported: true,
    peers: [],
    drafts: [],
    syncing: false,
    lastSyncedAt: null,
    lastSyncError: null,
    syncNow: vi.fn(() => Promise.resolve()),
    broadcastOperation: vi.fn(() => Promise.resolve()),
    broadcastCursor: vi.fn(),
    dismissDraft: vi.fn(),
  })),
}))

describe('Notes trash actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mocks.notes = [note()]
    mocks.unavailableNotes = []
    mocks.error = null
    mocks.folders = [{
      _id: 'folder-homework',
      type: 'folder',
      path: 'Homework',
      name: 'Homework',
      created_at: 1,
      updated_at: 2,
    }]
    mocks.createFolder.mockResolvedValue(undefined)
    mocks.deleteFolder.mockResolvedValue(undefined)
    mocks.deleteNote.mockResolvedValue(undefined)
    mocks.trashFolder.mockResolvedValue(undefined)
    mocks.restoreTrashedNote.mockImplementation((id: string) => Promise.resolve(note({ _id: id, folder: 'Homework' })))
    mocks.restoreTrashedFolder.mockResolvedValue(undefined)
    mocks.emptyTrash.mockResolvedValue(undefined)
    mocks.restoreNoteRevision.mockImplementation((id: string) => Promise.resolve(note({ _id: id })))
    mocks.moveNote.mockImplementation((id: string, folder: string) => {
      const source = mocks.notes.find(note => note._id === id)
      const moved = source
        ? { ...source, _id: `${folder}/${source.title}.md`, folder }
        : note({ _id: `${folder}/moved.md`, title: 'moved', folder })
      return Promise.resolve(moved)
    })
    mocks.getNoteComments.mockResolvedValue([])
    mocks.createNoteComment.mockResolvedValue(null)
    mocks.createNoteCommentReply.mockResolvedValue(null)
    mocks.getNoteSuggestions.mockResolvedValue([])
    mocks.createNoteSuggestion.mockResolvedValue(null)
    mocks.applyNoteSuggestion.mockResolvedValue()
    mocks.rejectNoteSuggestion.mockResolvedValue()
    mocks.resolveVaultSyncConflict.mockResolvedValue()
    mocks.createNoteVersionCheckpoint.mockResolvedValue('rev-new')
    mocks.getNoteRevisions.mockResolvedValue([])
    mocks.getNoteRevision.mockResolvedValue(revisionDetail({ rev: 'rev-new', label: 'Research draft' }))
    mocks.labelNoteRevision.mockResolvedValue(null)
    mocks.exportEncryptedVault.mockResolvedValue({ format: 'clawcontrol-encrypted-vault', version: 1 })
    mocks.importEncryptedVault.mockResolvedValue(null)
    mocks.approveVaultCollaborationPairing.mockResolvedValue(null)
    mocks.revokeVaultCollaborationPairing.mockResolvedValue(null)
    mocks.getVaultAuditEvents.mockResolvedValue([])
    mocks.getVaultStatus.mockResolvedValue(null)
    mocks.getVaultSyncLedger.mockResolvedValue(null)
    mocks.apiGet.mockResolvedValue({ data: { content: '' } })
    mocks.apiPut.mockResolvedValue({ data: {} })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: mocks.writeText },
    })
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('routes the selected note Trash button through the safe trash flow', async () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to Trash' }))

    const dialog = screen.getByRole('form', { name: 'Move to Trash note' })
    expect(within(dialog).getByText(/safety checkpoint/i)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move to Trash' }))

    await waitFor(() => expect(mocks.trashNote).toHaveBeenCalledWith('Homework/commands.md'))
    expect(mocks.createNoteVersionCheckpoint).toHaveBeenCalledWith('Homework/commands.md', 'Before moving to Trash')
    expect(mocks.refresh).toHaveBeenCalled()
    expect(window.confirm).not.toHaveBeenCalled()
  }, 45_000)

  it('keeps primary note toolbar actions compact and dropdown-based', () => {
    render(<Notes />)

    expect(screen.getByTestId('notes-topbar')).toHaveStyle({ overflow: 'visible' })
    expect(screen.getByTestId('notes-topbar')).toHaveStyle({ height: '36px' })
    expect(screen.getByTestId('notes-topbar')).toHaveStyle({ flexWrap: 'nowrap' })
    expect(screen.getByTestId('notes-topbar-primary')).toHaveStyle({ overflow: 'visible' })
    expect(screen.getByTestId('notes-topbar-primary')).toHaveStyle({ flexWrap: 'nowrap' })
    expect(screen.getByRole('button', { name: 'Workspace tools' })).toHaveTextContent('')
    expect(screen.queryByRole('button', { name: 'Open command palette' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hide file tree' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create note actions' }).textContent).toBe('')
    expect(screen.getByRole('button', { name: 'Note status' })).toHaveTextContent('')
    expect(screen.getByRole('button', { name: 'Notes view' })).toHaveTextContent('')
    expect(screen.getByRole('button', { name: 'More note actions' }).textContent).toBe('')
  })

  it('opens the first editable note on initial load instead of showing a blank editor', async () => {
    localStorage.setItem('mc-notes-focus-mode', 'true')

    render(<Notes />)

    await waitFor(() => {
      expect(screen.getByTestId('notes-topbar-primary')).toHaveTextContent('commands')
    })
    expect(screen.queryByRole('button', { name: 'Create first note' })).not.toBeInTheDocument()
  })

  it('shows title-only cached notes without opening them as blank editable notes', async () => {
    mocks.notes = []
    mocks.unavailableNotes = [
      note({
        _id: 'project-brief.md',
        title: 'Project Brief',
        folder: '',
        content: '',
        content_status: 'cached_title_only',
      }),
    ]
    mocks.error = 'Only cached note titles are available right now.'

    render(<Notes />)

    expect(screen.getByTestId('unavailable-notes-state')).toHaveTextContent('Note bodies are still loading')
    const unavailableNote = screen.getByRole('button', { name: 'Project Brief body unavailable' })
    expect(unavailableNote).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create first note' })).not.toBeInTheDocument()

    fireEvent.click(unavailableNote)

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled())
    expect(screen.queryByTestId('note-editor')).not.toBeInTheDocument()
  })

  it('keeps cached title-only notes visible beside editable notes', async () => {
    mocks.notes = [note({ _id: 'commands.md', folder: '' })]
    mocks.unavailableNotes = [
      note({
        _id: 'Ideas/roadmap.md',
        title: 'Roadmap',
        folder: 'Ideas',
        content: '',
        content_status: 'cached_title_only',
      }),
    ]
    mocks.error = 'Only cached note titles are available right now.'

    render(<Notes />)

    expect(screen.getByRole('button', { name: 'Roadmap body unavailable' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /commands/i })).toBeInTheDocument()
    expect(screen.queryByTestId('unavailable-notes-state')).not.toBeInTheDocument()
  })

  it('collapses right-side note actions into one dropdown on narrow screens', () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 })

    try {
      render(<Notes />)

      expect(screen.getByRole('button', { name: 'Note tools' })).toHaveTextContent('')
      expect(screen.getByTestId('notes-topbar-primary')).toHaveTextContent('Select a note')
      expect(within(screen.getByTestId('notes-topbar-primary')).queryByText('Vault workspace')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Workspace tools' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Note status' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Create note actions' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Notes view' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'More note actions' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Note tools' }))

      const menu = screen.getByRole('menu', { name: 'Note tools' })
      expect(within(menu).getByText('Workspace')).toBeInTheDocument()
      expect((menu.textContent ?? '').indexOf('Status and sync')).toBeLessThan((menu.textContent ?? '').indexOf('Workspace'))
      expect(within(menu).getByRole('menuitem', { name: 'Open command palette' })).toBeInTheDocument()
      expect(within(menu).getByText('Status and sync')).toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: /Refresh notes from vault/i })).toBeInTheDocument()
      expect(within(menu).getByText('Create')).toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: 'New note' })).toBeInTheDocument()
      expect(within(menu).getByText('View')).toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: 'Data' })).toBeInTheDocument()

      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Data' }))
      expect(screen.getByText(/rows/i)).toBeInTheDocument()
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth })
      window.dispatchEvent(new Event('resize'))
    }
  })

  it('keeps workspace tabs, jumps, and status actions inside compact Note tools', async () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 })
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        content: '# brief',
      }),
      note({
        _id: 'Archive/old.md',
        title: 'old',
        folder: 'Archive',
        content: '# old',
      }),
    ]
    localStorage.setItem('mc-notes-workspace-tab-ids', JSON.stringify(['Projects/brief.md', 'Archive/old.md']))
    localStorage.setItem('mc-pinned-note-ids', JSON.stringify(['Projects/brief.md']))
    localStorage.setItem('mc-recent-note-ids', JSON.stringify(['Archive/old.md', 'Projects/brief.md']))

    try {
      render(<Notes />)

      expect(screen.queryByRole('button', { name: 'Workspace tools' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Note status' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Note tools' }))
      let menu = screen.getByRole('menu', { name: 'Note tools' })
      expect((menu.textContent ?? '').indexOf('Status and sync')).toBeLessThan((menu.textContent ?? '').indexOf('Workspace'))
      expect(within(menu).getByRole('menuitem', { name: 'Close sidebars' })).toHaveTextContent('Hide the file tree')
      expect(within(menu).getByText('Open tabs')).toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: 'Switch tab: brief' })).toHaveTextContent('Projects')
      expect(within(menu).getByRole('menuitem', { name: 'Open in side pane: old' })).toHaveTextContent('Archive')
      expect(within(menu).getByRole('menuitem', { name: 'Close tab: old' })).toHaveTextContent('Remove from this local workspace stack')
      expect(within(menu).getByRole('menuitem', { name: 'Close all tabs' })).toBeInTheDocument()
      expect(within(menu).getByText('Pinned notes')).toBeInTheDocument()
      expect(within(menu).getByText('Recent notes')).toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: 'Refresh notes from vault' })).toBeInTheDocument()

      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Switch tab: brief' }))
      expect(screen.getByLabelText('Rename note')).toHaveTextContent('brief')

      fireEvent.click(screen.getByRole('button', { name: 'Note tools' }))
      menu = screen.getByRole('menu', { name: 'Note tools' })
      expect(within(menu).getByRole('menuitem', { name: 'Save current note' })).toBeInTheDocument()
      expect(within(menu).getByText('Collaboration')).toBeInTheDocument()
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Open in side pane: old' }))
      expect(screen.getByTestId('workspace-side-pane')).toHaveTextContent('old')

      fireEvent.click(screen.getByRole('button', { name: 'Note tools' }))
      menu = screen.getByRole('menu', { name: 'Note tools' })
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Refresh notes from vault' }))
      await waitFor(() => expect(mocks.refresh).toHaveBeenCalled())
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth })
      window.dispatchEvent(new Event('resize'))
    }
  })

  it('carries compact save and sync status on the single Note tools trigger', () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 })
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    })

    try {
      render(<Notes />)

      const trigger = screen.getByRole('button', { name: 'Note tools' })
      expect(trigger).toHaveTextContent('')
      expect(trigger).toHaveStyle({ color: 'var(--accent)' })
      expect(trigger).toHaveAttribute('title', 'Note tools - Offline')
      const describedBy = trigger.getAttribute('aria-describedby')
      expect(describedBy).toBeTruthy()
      expect(document.getElementById(describedBy ?? '')).toHaveTextContent('Hidden note status: Offline')
      expect(screen.queryByRole('button', { name: 'Note status' })).not.toBeInTheDocument()

      fireEvent.click(trigger)
      const menu = screen.getByRole('menu', { name: 'Note tools' })
      expect((menu.textContent ?? '').indexOf('Offline mode')).toBeLessThan((menu.textContent ?? '').indexOf('Open command palette'))
      expect(within(menu).getByRole('menuitem', { name: /Offline mode/i })).toHaveTextContent('Edits stay local')
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth })
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: true,
      })
      window.dispatchEvent(new Event('resize'))
    }
  })

  it('promotes hidden workspace and pinned-note sync errors onto compact Note tools', async () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 })
    localStorage.setItem('mc-notes-workspace-snapshots', JSON.stringify([{
      id: 'workspace-main',
      name: 'Main writing workspace',
      viewMode: 'editor',
      focusMode: false,
      infoPanelOpen: false,
      treeWidth: 220,
      selectedId: 'Homework/commands.md',
      savedAt: 40,
    }]))
    localStorage.setItem('mc-pinned-note-ids', JSON.stringify(['Homework/commands.md']))
    localStorage.setItem('mc-pinned-note-sync-updated-at', '40')
    mocks.apiPut.mockRejectedValue(new Error('Vault sync write failed'))

    try {
      render(<Notes />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Note tools' })).toHaveAttribute('title', 'Note tools - 2 sync settings need retry')
      })

      const trigger = screen.getByRole('button', { name: 'Note tools' })
      expect(trigger).toHaveTextContent('')
      expect(trigger).toHaveStyle({ color: 'var(--red)' })
      const describedBy = trigger.getAttribute('aria-describedby')
      expect(describedBy).toBeTruthy()
      expect(document.getElementById(describedBy ?? '')).toHaveTextContent('Hidden sync status: Workspace sync issue; Pinned-note sync issue')
      expect(screen.queryByRole('button', { name: 'Workspace tools' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Note status' })).not.toBeInTheDocument()

      fireEvent.click(trigger)
      const menu = screen.getByRole('menu', { name: 'Note tools' })
      const menuText = menu.textContent ?? ''
      expect(menuText.indexOf('Workspace sync issue')).toBeGreaterThan(menuText.indexOf('Status and sync'))
      expect(menuText.indexOf('Workspace sync issue')).toBeLessThan(menuText.indexOf('Open command palette'))
      expect(menuText.indexOf('Pinned-note sync issue')).toBeLessThan(menuText.indexOf('Open command palette'))
      expect(within(menu).getAllByRole('menuitem', { name: 'Retry workspace sync' }).length).toBeGreaterThan(0)
      expect(within(menu).getAllByRole('menuitem', { name: 'Retry pinned-note sync' }).length).toBeGreaterThan(0)
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth })
      window.dispatchEvent(new Event('resize'))
    }
  })

  it('promotes hidden saved-search and editor preference sync errors onto compact Note tools', async () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 })
    localStorage.setItem('mc-notes-saved-searches', JSON.stringify([{
      id: 'search:tag:project',
      label: 'Project tag',
      query: 'tag:project',
      createdAt: 40,
      updatedAt: 40,
    }]))
    localStorage.setItem('mc-notes-editor-preferences', JSON.stringify({
      markdownWidth: 'wide',
      markdownFontSize: 17,
      defaultMode: 'rich',
    }))
    localStorage.setItem('mc-notes-editor-preferences-sync-updated-at', '40')
    mocks.apiPut.mockRejectedValue(new Error('Vault sync write failed'))

    try {
      render(<Notes />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Note tools' })).toHaveAttribute('title', 'Note tools - 2 sync settings need retry')
      })

      const trigger = screen.getByRole('button', { name: 'Note tools' })
      expect(trigger).toHaveTextContent('')
      expect(trigger).toHaveStyle({ color: 'var(--red)' })
      const describedBy = trigger.getAttribute('aria-describedby')
      expect(describedBy).toBeTruthy()
      expect(document.getElementById(describedBy ?? '')).toHaveTextContent('Hidden sync status: Saved-search sync issue; Editor preferences sync issue')

      fireEvent.click(trigger)
      const menu = screen.getByRole('menu', { name: 'Note tools' })
      const menuText = menu.textContent ?? ''
      expect(menuText.indexOf('Saved-search sync issue')).toBeGreaterThan(menuText.indexOf('Status and sync'))
      expect(menuText.indexOf('Saved-search sync issue')).toBeLessThan(menuText.indexOf('Open command palette'))
      expect(menuText.indexOf('Editor preferences sync issue')).toBeLessThan(menuText.indexOf('Open command palette'))
      expect(within(menu).getByRole('menuitem', { name: 'Retry saved-search sync' })).toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: 'Retry editor preferences sync' })).toBeInTheDocument()
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth })
      window.dispatchEvent(new Event('resize'))
    }
  })

  it('opens compact Note tools from the keyboard and restores focus', async () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 })

    try {
      render(<Notes />)

      const trigger = screen.getByRole('button', { name: 'Note tools' })
      fireEvent.keyDown(trigger, { key: 'ArrowDown' })

      const menu = screen.getByRole('menu', { name: 'Note tools' })
      expect(within(menu).getByRole('menuitem', { name: 'Graph' })).toHaveFocus()

      fireEvent.keyDown(menu, { key: 'End' })
      expect(within(menu).getByRole('menuitem', { name: 'Canvas' })).toHaveFocus()

      fireEvent.keyDown(menu, { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('menu', { name: 'Note tools' })).not.toBeInTheDocument())
      await waitFor(() => expect(trigger).toHaveFocus())
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth })
      window.dispatchEvent(new Event('resize'))
    }
  })

  it('keeps selected note actions keyboard-reachable in compact Note tools', () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 })

    try {
      render(<Notes />)

      fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
      fireEvent.click(screen.getAllByText('commands')[0])
      expect(screen.queryByRole('button', { name: 'Note details' })).not.toBeInTheDocument()

      const trigger = screen.getByRole('button', { name: 'Note tools' })
      fireEvent.keyDown(trigger, { key: 'ArrowUp' })

      const menu = screen.getByRole('menu', { name: 'Note tools' })
      expect(within(menu).getByText('Current note')).toBeInTheDocument()
      expect((menu.textContent ?? '').indexOf('Status and sync')).toBeLessThan((menu.textContent ?? '').indexOf('Current note'))
      expect(within(menu).getByRole('menuitem', { name: 'Rename note' })).toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: 'Copy wikilink' })).toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: 'Open local graph' })).toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: 'Move to Trash' })).toHaveFocus()
      expect(within(menu).getByRole('menuitem', { name: 'Private share package' })).toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: 'Version history' })).toBeInTheDocument()
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth })
      window.dispatchEvent(new Event('resize'))
    }
  })

  it('supports typeahead in long compact Note tools menus', () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 })

    try {
      render(<Notes />)

      fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
      fireEvent.click(screen.getAllByText('commands')[0])

      const trigger = screen.getByRole('button', { name: 'Note tools' })
      fireEvent.keyDown(trigger, { key: 'ArrowDown' })

      const menu = screen.getByRole('menu', { name: 'Note tools' })
      fireEvent.keyDown(menu, { key: 'v' })
      expect(within(menu).getByRole('menuitem', { name: 'Version history' })).toHaveFocus()

      fireEvent.keyDown(menu, { key: 'e' })
      expect(within(menu).getByRole('menuitem', { name: 'Version history' })).toHaveFocus()
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth })
      window.dispatchEvent(new Event('resize'))
    }
  })

  it('filters long compact Note tools menus without widening the topbar', async () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 })

    try {
      render(<Notes />)

      fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
      fireEvent.click(screen.getAllByText('commands')[0])

      fireEvent.click(screen.getByRole('button', { name: 'Note tools' }))
      const menu = screen.getByRole('menu', { name: 'Note tools' })
      const filter = within(menu).getByRole('textbox', { name: 'Filter note tools' })

      expect(filter.parentElement).toHaveStyle({ position: 'sticky' })
      fireEvent.keyDown(menu, { key: '/' })
      expect(filter).toHaveFocus()

      fireEvent.change(filter, { target: { value: 'version' } })
      expect(within(menu).getByRole('menuitem', { name: 'Version history' })).toBeInTheDocument()
      expect(within(menu).queryByRole('menuitem', { name: 'New note' })).not.toBeInTheDocument()
      expect(within(menu).getAllByText('Create')).toHaveLength(1)

      fireEvent.change(filter, { target: { value: 'workspace' } })
      expect(within(menu).getAllByText('Workspace').length).toBeGreaterThanOrEqual(1)
      expect(within(menu).getByRole('menuitem', { name: 'Open command palette' })).toBeInTheDocument()
      expect(within(menu).queryByRole('menuitem', { name: 'New note' })).not.toBeInTheDocument()

      fireEvent.change(filter, { target: { value: 'static publish' } })
      expect(within(menu).getByRole('menuitem', { name: 'Publish static site' })).toBeInTheDocument()
      expect(within(menu).queryByRole('menuitem', { name: 'New note' })).not.toBeInTheDocument()

      fireEvent.click(within(menu).getByRole('button', { name: 'Filter Note tools: Export' }))
      expect(filter).toHaveValue('Export and share')
      expect(within(menu).getByText('Export and share')).toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: 'Export DOCX' })).toBeInTheDocument()
      expect(within(menu).queryByRole('menuitem', { name: 'New note' })).not.toBeInTheDocument()

      fireEvent.click(within(menu).getByRole('button', { name: 'Filter Note tools: Status' }))
      expect(filter).toHaveValue('Status and sync')
      expect(within(menu).getByRole('menuitem', { name: 'Save current note' })).toBeInTheDocument()
      expect(within(menu).queryByRole('menuitem', { name: 'Export DOCX' })).not.toBeInTheDocument()

      fireEvent.click(within(menu).getByRole('button', { name: 'Show all Note tools actions' }))
      expect(filter).toHaveValue('')
      expect(within(menu).getByRole('menuitem', { name: 'New note' })).toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: 'Export DOCX' })).toBeInTheDocument()

      fireEvent.change(filter, { target: { value: 'zzzz' } })
      expect(within(menu).getByText('No matching actions.')).toBeInTheDocument()
      expect(screen.getByTestId('notes-topbar')).toHaveStyle({ height: '36px' })

      fireEvent.keyDown(filter, { key: 'Escape' })
      expect(filter).toHaveValue('')
      fireEvent.keyDown(filter, { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('menu', { name: 'Note tools' })).not.toBeInTheDocument())
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth })
      window.dispatchEvent(new Event('resize'))
    }
  })

  it('uses the single topbar dropdown at medium app widths', () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 880 })

    try {
      render(<Notes />)

      expect(screen.getByRole('button', { name: 'Note tools' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Workspace tools' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Create note actions' })).not.toBeInTheDocument()
      expect(screen.getByTestId('notes-topbar')).toHaveStyle({ height: '36px' })
      expect(screen.getByTestId('notes-topbar')).toHaveStyle({ flexWrap: 'nowrap' })
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth })
      window.dispatchEvent(new Event('resize'))
    }
  })

  it('keeps the selected note title readable in the narrow topbar', () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 })

    try {
      render(<Notes />)

      fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
      fireEvent.click(screen.getAllByText('commands')[0])

      const topbar = screen.getByTestId('notes-topbar-primary')
      const rename = within(topbar).getByRole('button', { name: 'Rename note' })
      expect(rename).toHaveTextContent('commands')
      expect(rename).not.toHaveTextContent('Homework')
      expect(rename).toHaveAttribute('title', 'Homework / commands')
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth })
      window.dispatchEvent(new Event('resize'))
    }
  })

  it('collapses note actions when the actual topbar area is cramped', async () => {
    const originalInnerWidth = window.innerWidth
    const OriginalResizeObserver = globalThis.ResizeObserver
    let resizeCallback: ResizeObserverCallback | null = null
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1000 })
    vi.stubGlobal('ResizeObserver', TestResizeObserver)

    try {
      render(<Notes />)
      expect(screen.queryByRole('button', { name: 'Note tools' })).not.toBeInTheDocument()
      await waitFor(() => expect(resizeCallback).not.toBeNull())

      act(() => {
        resizeCallback?.([
          {
            target: screen.getByTestId('notes-topbar'),
            contentRect: DOMRect.fromRect({ width: 840, height: 36 }),
          } as ResizeObserverEntry,
        ], {} as ResizeObserver)
      })

      expect(screen.getByRole('button', { name: 'Note tools' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Workspace tools' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Note status' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Create note actions' })).not.toBeInTheDocument()
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth })
      vi.stubGlobal('ResizeObserver', OriginalResizeObserver)
      window.dispatchEvent(new Event('resize'))
    }
  })

  it('keeps workspace utility actions in a compact topbar dropdown', () => {
    render(<Notes />)

    const trigger = screen.getByRole('button', { name: 'Workspace tools' })
    fireEvent.click(trigger)

    const menu = screen.getByRole('menu', { name: 'Workspace tools' })
    expect(menu).toBeInTheDocument()
    expect(menu.id).toBeTruthy()
    expect(trigger).toHaveAttribute('aria-controls', menu.id)
    expect(menu).toHaveStyle({ position: 'fixed', left: '8px' })
    expect(within(menu).getByRole('menuitem', { name: 'Open command palette' })).toHaveTextContent('Search notes')
    expect(within(menu).getByRole('menuitem', { name: 'Keyboard shortcuts' })).toHaveTextContent('Open the Notes shortcut reference')
    expect(within(menu).getByText('Sidebars')).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Hide file tree' })).toHaveTextContent('cleaner writing layout')
    expect(within(menu).getByRole('menuitem', { name: 'Show document info' })).toBeDisabled()
    expect(within(menu).getByRole('menuitem', { name: 'Close sidebars' })).toHaveTextContent('Hide the file tree')
    expect(within(menu).getByText('Workspace snapshot')).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Save current workspace' })).toHaveTextContent('Capture view')
    expect(within(menu).getByRole('menuitem', { name: 'Restore saved workspace' })).toBeDisabled()
    expect(within(menu).queryByText('Saved workspaces')).not.toBeInTheDocument()
    expect(menu.querySelectorAll('span[aria-hidden="true"]').length).toBeGreaterThanOrEqual(2)
  })

  it('filters normal-width workspace and More topbar dropdowns', () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    const workspaceMenu = screen.getByRole('menu', { name: 'Workspace tools' })
    fireEvent.change(within(workspaceMenu).getByRole('textbox', { name: 'Filter workspace tools' }), {
      target: { value: 'sync' },
    })

    expect(within(workspaceMenu).getByRole('menuitem', { name: 'Workspaces syncing' })).toBeInTheDocument()
    expect(within(workspaceMenu).queryByRole('menuitem', { name: 'Open command palette' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))

    const moreMenu = screen.getByRole('menu', { name: 'More note actions' })
    fireEvent.change(within(moreMenu).getByRole('textbox', { name: 'Filter more note actions' }), {
      target: { value: 'version' },
    })

    expect(within(moreMenu).getByRole('menuitem', { name: 'Version history' })).toBeInTheDocument()
    expect(within(moreMenu).queryByRole('menuitem', { name: 'Comments' })).not.toBeInTheDocument()
    expect(screen.getByTestId('notes-topbar')).toHaveStyle({ height: '36px' })
  })

  it('closes a topbar menu when keyboard focus leaves its trigger and menu', async () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    const menu = screen.getByRole('menu', { name: 'Workspace tools' })
    const firstItem = within(menu).getByRole('menuitem', { name: 'Open command palette' })
    expect(firstItem).toHaveFocus()

    const nextTopbarControl = screen.getByRole('button', { name: 'Notes view' })
    nextTopbarControl.focus()
    fireEvent.blur(firstItem, { relatedTarget: nextTopbarControl })

    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Workspace tools' })).not.toBeInTheDocument())
    expect(nextTopbarControl).toHaveFocus()
  })

  it('closes a topbar menu when the editor is clicked outside the menu', async () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    expect(screen.getByRole('menu', { name: 'Workspace tools' })).toBeInTheDocument()

    act(() => {
      fireEvent.pointerDown(screen.getByTestId('graph-view'))
    })

    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Workspace tools' })).not.toBeInTheDocument())
  })

  it('saves and restores the compact workspace layout from the topbar', () => {
    render(<Notes />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Search notes' }), {
      target: { value: 'commands' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Notes view' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Data' }))
    expect(screen.getByText(/rows/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save current workspace' }))
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-snapshot') || '{}')).toMatchObject({
      viewMode: 'data',
      focusMode: false,
      infoPanelOpen: false,
      searchQuery: 'commands',
    })
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-snapshots') || '[]')).toEqual([
      expect.objectContaining({
        name: 'Data / No active note',
        viewMode: 'data',
      }),
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Notes view' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Graph' }))
    expect(screen.getByTestId('graph-view')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Search notes' }), {
      target: { value: 'no-match' },
    })
    expect(screen.getByRole('textbox', { name: 'Search notes' })).toHaveValue('no-match')

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restore saved workspace' }))

    expect(screen.getByText(/rows/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Search notes' })).toHaveValue('commands')
  })

  it('saves and restores data view filters with workspace presets', async () => {
    mocks.notes = [
      note({
        content: [
          '---',
          'status: active',
          '---',
          '# commands',
          '',
          '- [ ] Draft compact toolbar',
        ].join('\n'),
        properties: { status: 'active' },
      }),
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        content: '# brief',
        properties: { status: 'draft' },
        updated_at: 5,
      }),
    ]
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Notes view' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Data' }))

    fireEvent.change(screen.getByRole('textbox', { name: 'Data view filter' }), {
      target: { value: 'status:active' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Data view sort' }), {
      target: { value: 'title' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Data view sort direction' }), {
      target: { value: 'asc' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Data view group' }), {
      target: { value: 'folder' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Data view layout' }), {
      target: { value: 'cards' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Data view formula' }), {
      target: { value: 'taskPercent' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save current workspace' }))
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-snapshot') || '{}')).toMatchObject({
      viewMode: 'data',
      dataContext: {
        query: 'status:active',
        dataSortKey: 'title',
        sortDirection: 'asc',
        groupKey: 'folder',
        layout: 'cards',
        formulaKey: 'taskPercent',
      },
    })

    fireEvent.change(screen.getByRole('textbox', { name: 'Data view filter' }), {
      target: { value: 'no-match' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Data view sort' }), {
      target: { value: 'updated' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Data view sort direction' }), {
      target: { value: 'desc' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Data view group' }), {
      target: { value: 'none' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Data view layout' }), {
      target: { value: 'table' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Data view formula' }), {
      target: { value: 'none' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restore saved workspace' }))

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Data view filter' })).toHaveValue('status:active'))
    expect(screen.getByRole('combobox', { name: 'Data view sort' })).toHaveValue('title')
    expect(screen.getByRole('combobox', { name: 'Data view sort direction' })).toHaveValue('asc')
    expect(screen.getByRole('combobox', { name: 'Data view group' })).toHaveValue('folder')
    expect(screen.getByRole('combobox', { name: 'Data view layout' })).toHaveValue('cards')
    expect(screen.getByRole('combobox', { name: 'Data view formula' })).toHaveValue('taskPercent')
  })

  it('saves and restores file tree expansion with workspace presets', () => {
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        content: '# brief',
      }),
    ]
    mocks.folders = [
      ...mocks.folders,
      {
        _id: 'folder-projects',
        type: 'folder',
        path: 'Projects',
        name: 'Projects',
        created_at: 3,
        updated_at: 4,
      },
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Projects' }))
    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save current workspace' }))

    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-snapshot') || '{}').expandedFolders).toEqual(
      expect.arrayContaining(['Projects']),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Projects' }))
    expect(screen.getByRole('button', { name: 'Expand Projects' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restore saved workspace' }))

    expect(screen.getByRole('button', { name: 'Collapse Projects' })).toBeInTheDocument()
  })

  it('saves and restores the open references panel with workspace presets', async () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    expect(screen.getByTestId('backlinks-panel')).toHaveAttribute('data-collapsed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Note details' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open references' }))
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Note details' })).not.toBeInTheDocument())
    expect(screen.getByTestId('backlinks-panel')).toHaveAttribute('data-collapsed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save current workspace' }))
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-snapshot') || '{}')).toMatchObject({
      referencesOpen: true,
    })

    localStorage.setItem('mc-notes-workspace-snapshot', JSON.stringify({
      ...JSON.parse(localStorage.getItem('mc-notes-workspace-snapshot') || '{}'),
      referencesOpen: false,
    }))
    window.dispatchEvent(new CustomEvent('local-storage-state-changed', { detail: { key: 'mc-notes-workspace-snapshot' } }))
    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restore saved workspace' }))
    expect(screen.getByTestId('backlinks-panel')).toHaveAttribute('data-collapsed', 'true')
  })

  it('saves and restores graph filter context with workspace presets', () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Notes view' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Graph' }))
    expect(screen.getByTestId('graph-view')).toBeInTheDocument()

    localStorage.setItem('mc-notes-graph-search', JSON.stringify('alpha graph'))
    localStorage.setItem('mc-notes-graph-focus-matches', JSON.stringify(true))
    localStorage.setItem('mc-notes-graph-hide-orphans', JSON.stringify(true))
    localStorage.setItem('mc-notes-graph-local', JSON.stringify(true))
    localStorage.setItem('mc-notes-graph-group-mode', JSON.stringify('folder'))

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save current workspace' }))
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-snapshot') || '{}')).toMatchObject({
      viewMode: 'graph',
      graphContext: {
        graphSearch: 'alpha graph',
        focusMatches: true,
        hideOrphans: true,
        localGraph: true,
        groupMode: 'folder',
      },
    })

    localStorage.setItem('mc-notes-graph-search', JSON.stringify('different'))
    localStorage.setItem('mc-notes-graph-focus-matches', JSON.stringify(false))
    localStorage.setItem('mc-notes-graph-hide-orphans', JSON.stringify(false))
    localStorage.setItem('mc-notes-graph-local', JSON.stringify(false))
    localStorage.setItem('mc-notes-graph-group-mode', JSON.stringify('tag'))

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restore saved workspace' }))

    expect(localStorage.getItem('mc-notes-graph-search')).toBe(JSON.stringify('alpha graph'))
    expect(localStorage.getItem('mc-notes-graph-focus-matches')).toBe('true')
    expect(localStorage.getItem('mc-notes-graph-hide-orphans')).toBe('true')
    expect(localStorage.getItem('mc-notes-graph-local')).toBe('true')
    expect(localStorage.getItem('mc-notes-graph-group-mode')).toBe(JSON.stringify('folder'))
  })

  it('manages note sidebars from the compact workspace dropdown', () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide file tree' }))
    expect(screen.queryByRole('button', { name: 'Expand Homework' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show file tree' }))
    const expandHomework = screen.queryByRole('button', { name: 'Expand Homework' })
    if (expandHomework) fireEvent.click(expandHomework)
    fireEvent.click(screen.getAllByText('commands')[0])

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show document info' }))
    expect(screen.getByRole('complementary', { name: 'Document info' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Close sidebars' }))
    expect(screen.queryByRole('button', { name: 'Expand Homework' })).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Document info' })).not.toBeInTheDocument()
  })

  it('resizes the file tree from compact menus and the command palette', async () => {
    render(<Notes />)
    const fileTreePane = () => screen.getByRole('separator', { name: 'Resize file tree' }).previousElementSibling as HTMLElement

    expect(fileTreePane()).toHaveStyle({ width: '220px' })

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    let menu = screen.getByRole('menu', { name: 'Workspace tools' })
    expect(within(menu).getByRole('menuitem', { name: 'Narrow file tree' })).toHaveTextContent('220px wide')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Narrow file tree' }))
    expect(fileTreePane()).toHaveStyle({ width: '180px' })

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Widen file tree' }))
    expect(fileTreePane()).toHaveStyle({ width: '220px' })

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Reset file tree width' }))
    expect(fileTreePane()).toHaveStyle({ width: '220px' })

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Workspace tools' })).not.toBeInTheDocument())

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'widen file tree' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Widen file tree/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    expect(fileTreePane()).toHaveStyle({ width: '260px' })
  })

  it('resizes the file tree with the keyboard-accessible separator', () => {
    render(<Notes />)
    const separator = screen.getByRole('separator', { name: 'Resize file tree' })
    const fileTreePane = () => separator.previousElementSibling as HTMLElement

    expect(separator).toHaveAttribute('aria-valuemin', '160')
    expect(separator).toHaveAttribute('aria-valuemax', '360')
    expect(separator).toHaveAttribute('aria-valuenow', '220')
    expect(separator).toHaveAttribute('tabindex', '0')

    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
    expect(fileTreePane()).toHaveStyle({ width: '200px' })
    expect(separator).toHaveAttribute('aria-valuenow', '200')

    fireEvent.keyDown(separator, { key: 'ArrowRight', shiftKey: true })
    expect(fileTreePane()).toHaveStyle({ width: '240px' })
    expect(separator).toHaveAttribute('aria-valuenow', '240')

    fireEvent.keyDown(separator, { key: 'Home' })
    expect(fileTreePane()).toHaveStyle({ width: '160px' })
    expect(separator).toHaveAttribute('aria-valuenow', '160')

    fireEvent.keyDown(separator, { key: 'End' })
    expect(fileTreePane()).toHaveStyle({ width: '360px' })
    expect(separator).toHaveAttribute('aria-valuenow', '360')
  })

  it('keeps multiple named workspace presets in the compact topbar menu', () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Research layout')
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Notes view' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save current workspace' }))

    fireEvent.click(screen.getByRole('button', { name: 'Notes view' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Graph' }))
    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save current workspace' }))

    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-snapshots') || '[]')).toEqual([
      expect.objectContaining({ name: 'Graph / No active note', viewMode: 'graph' }),
      expect.objectContaining({ name: 'Data / No active note', viewMode: 'data' }),
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    const menu = screen.getByRole('menu', { name: 'Workspace tools' })
    expect(within(menu).getByText('Saved workspaces')).toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Restore workspace: Data / No active note' }))
    expect(screen.getByText(/rows/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename workspace: Data / No active note' }))
    const renameDialog = screen.getByRole('form', { name: 'Rename workspace' })
    fireEvent.change(within(renameDialog).getByRole('textbox'), { target: { value: 'Research layout' } })
    fireEvent.click(within(renameDialog).getByRole('button', { name: 'Rename workspace' }))
    expect(promptSpy).not.toHaveBeenCalled()
    const renamedSnapshots = JSON.parse(localStorage.getItem('mc-notes-workspace-snapshots') || '[]')
    expect(renamedSnapshots).toHaveLength(2)
    expect(renamedSnapshots).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Graph / No active note', viewMode: 'graph' }),
      expect.objectContaining({ name: 'Research layout', viewMode: 'data' }),
    ]))

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete workspace: Graph / No active note' }))
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-snapshots') || '[]')).toEqual([
      expect.objectContaining({ name: 'Research layout', viewMode: 'data' }),
    ])
  })

  it('saves and restores workspace tab stacks with workspace presets', () => {
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        content: '# brief',
      }),
      note({
        _id: 'Archive/old.md',
        title: 'old',
        folder: 'Archive',
        content: '# old',
      }),
    ]
    localStorage.setItem('mc-notes-workspace-tab-ids', JSON.stringify(['Projects/brief.md', 'Archive/old.md']))

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save current workspace' }))

    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-snapshot') || '{}')).toMatchObject({
      tabIds: ['Projects/brief.md', 'Archive/old.md'],
    })

    localStorage.setItem('mc-notes-workspace-tab-ids', JSON.stringify(['Homework/commands.md']))
    window.dispatchEvent(new CustomEvent('local-storage-state-changed', { detail: { key: 'mc-notes-workspace-tab-ids' } }))

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restore saved workspace' }))

    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-tab-ids') || '[]')).toEqual(['Projects/brief.md', 'Archive/old.md'])
  })

  it('cleans stale workspace tabs and restores missing selections to a live note', async () => {
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        content: '# brief',
      }),
    ]
    localStorage.setItem(
      'mc-notes-workspace-tab-ids',
      JSON.stringify(['Missing/gone.md', 'Projects/brief.md', 'Projects/brief.md']),
    )
    localStorage.setItem(
      'mc-notes-workspace-snapshot',
      JSON.stringify({
        id: 'stale-workspace',
        name: 'Stale workspace',
        viewMode: 'editor',
        focusMode: false,
        infoPanelOpen: false,
        treeWidth: 240,
        selectedId: 'Missing/gone.md',
        tabIds: ['Missing/gone.md', 'Projects/brief.md'],
        savedAt: 20,
      }),
    )

    render(<Notes />)

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('mc-notes-workspace-tab-ids') || '[]')).toEqual(['Projects/brief.md'])
    })

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restore saved workspace' }))

    expect(screen.getByLabelText('Rename note')).toHaveTextContent('brief')
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-tab-ids') || '[]')).toEqual(['Projects/brief.md'])
  })

  it('opens an editable workspace side pane without adding navbar buttons', async () => {
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        content: '# brief',
      }),
      note({
        _id: 'Archive/old.md',
        title: 'old',
        folder: 'Archive',
        content: '# old',
      }),
    ]
    localStorage.setItem('mc-notes-workspace-tab-ids', JSON.stringify(['Projects/brief.md', 'Archive/old.md']))

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch tab: brief' }))

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in side pane: old' }))

    const sidePane = screen.getByTestId('workspace-side-pane')
    expect(within(sidePane).getByText('old')).toBeInTheDocument()
    expect(within(sidePane).getByText('Archive')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open in side pane: old' })).not.toBeInTheDocument()

    fireEvent.change(within(sidePane).getByRole('textbox', { name: 'Markdown source editor' }), {
      target: { value: '# old\n\nEdited beside brief' },
    })

    await waitFor(() => expect(mocks.updateNote).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'Archive/old.md',
      content: '# old\n\nEdited beside brief',
    })))
  })

  it('swaps the side pane into the primary editor without closing the previous note', async () => {
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        content: '# brief',
      }),
      note({
        _id: 'Archive/old.md',
        title: 'old',
        folder: 'Archive',
        content: '# old',
      }),
    ]
    localStorage.setItem('mc-notes-workspace-tab-ids', JSON.stringify(['Projects/brief.md', 'Archive/old.md']))

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch tab: brief' }))
    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in side pane: old' }))

    fireEvent.click(within(screen.getByTestId('workspace-side-pane')).getByRole('button', { name: 'Make side pane primary' }))

    expect(screen.getByLabelText('Rename note')).toHaveTextContent('old')
    expect(within(screen.getByTestId('workspace-side-pane')).getByText('brief')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-side-pane-id') || 'null')).toBe('Projects/brief.md')
  })

  it('swaps the side pane into the primary editor from the command palette', async () => {
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        content: '# brief',
      }),
      note({
        _id: 'Archive/old.md',
        title: 'old',
        folder: 'Archive',
        content: '# old',
      }),
    ]
    localStorage.setItem('mc-notes-workspace-tab-ids', JSON.stringify(['Projects/brief.md', 'Archive/old.md']))
    localStorage.setItem('mc-notes-workspace-side-pane-id', JSON.stringify('Archive/old.md'))

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch tab: brief' }))
    await waitFor(() => expect(screen.getByTestId('workspace-side-pane')).toHaveTextContent('old'))

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'swap side pane' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Swap primary and side pane/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    expect(screen.getByLabelText('Rename note')).toHaveTextContent('old')
    expect(within(screen.getByTestId('workspace-side-pane')).getByText('brief')).toBeInTheDocument()
  })

  it('swaps the side pane into the primary editor from the split keyboard shortcut', async () => {
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        content: '# brief',
      }),
      note({
        _id: 'Archive/old.md',
        title: 'old',
        folder: 'Archive',
        content: '# old',
      }),
    ]
    localStorage.setItem('mc-notes-workspace-tab-ids', JSON.stringify(['Projects/brief.md', 'Archive/old.md']))
    localStorage.setItem('mc-notes-workspace-side-pane-id', JSON.stringify('Archive/old.md'))

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch tab: brief' }))
    await waitFor(() => expect(screen.getByTestId('workspace-side-pane')).toHaveTextContent('old'))

    fireEvent.keyDown(window, { key: '\\', ctrlKey: true, altKey: true, shiftKey: true })

    expect(screen.getByLabelText('Rename note')).toHaveTextContent('old')
    expect(within(screen.getByTestId('workspace-side-pane')).getByText('brief')).toBeInTheDocument()
  })

  it('opens the active primary note as a duplicate workspace side pane', async () => {
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        content: '# brief',
      }),
      note({
        _id: 'Archive/old.md',
        title: 'old',
        folder: 'Archive',
        content: '# old',
      }),
    ]
    localStorage.setItem('mc-notes-workspace-tab-ids', JSON.stringify(['Projects/brief.md', 'Archive/old.md']))
    localStorage.setItem('mc-notes-workspace-side-pane-id', JSON.stringify('Projects/brief.md'))

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch tab: brief' }))

    await waitFor(() => expect(screen.getAllByTestId('note-editor')).toHaveLength(2))
    expect(within(screen.getByTestId('workspace-side-pane')).getByText('brief')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    const menu = screen.getByRole('menu', { name: 'Workspace tools' })
    expect(within(menu).getByRole('menuitem', { name: 'Open in side pane: brief' })).toHaveTextContent('Split the current note')
    expect(within(menu).getByRole('menuitem', { name: 'Open in side pane: old' })).toBeInTheDocument()
  })

  it('saves and restores the workspace side pane in presets', () => {
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        content: '# brief',
      }),
      note({
        _id: 'Archive/old.md',
        title: 'old',
        folder: 'Archive',
        content: '# old',
      }),
    ]
    localStorage.setItem('mc-notes-workspace-tab-ids', JSON.stringify(['Projects/brief.md', 'Archive/old.md']))

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch tab: brief' }))
    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in side pane: old' }))

    fireEvent.mouseDown(screen.getByRole('separator', { name: 'Resize workspace side pane' }), { clientX: 900 })
    fireEvent.mouseMove(document, { clientX: 760 })
    fireEvent.mouseUp(document)

    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-side-pane-width') || '0')).toBe(560)
    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save current workspace' }))

    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-snapshot') || '{}')).toMatchObject({
      selectedId: 'Projects/brief.md',
      sidePaneId: 'Archive/old.md',
      sidePaneWidth: 560,
      tabIds: ['Archive/old.md', 'Projects/brief.md'],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Close workspace side pane' }))
    expect(screen.queryByTestId('workspace-side-pane')).not.toBeInTheDocument()
    localStorage.setItem('mc-notes-workspace-side-pane-width', JSON.stringify(320))
    window.dispatchEvent(new CustomEvent('local-storage-state-changed', { detail: { key: 'mc-notes-workspace-side-pane-width' } }))

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restore saved workspace' }))

    expect(screen.getByTestId('workspace-side-pane')).toHaveTextContent('old')
    expect(screen.getByTestId('workspace-side-pane')).toHaveStyle({ width: '560px' })
    expect(screen.getByLabelText('Rename note')).toHaveTextContent('brief')
  })

  it('resizes the workspace side pane from the keyboard', () => {
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        content: '# brief',
      }),
      note({
        _id: 'Archive/old.md',
        title: 'old',
        folder: 'Archive',
        content: '# old',
      }),
    ]
    localStorage.setItem('mc-notes-workspace-tab-ids', JSON.stringify(['Projects/brief.md', 'Archive/old.md']))

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch tab: brief' }))
    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in side pane: old' }))

    const separator = screen.getByRole('separator', { name: 'Resize workspace side pane' })
    expect(separator).toHaveAttribute('aria-valuemin', '300')
    expect(separator).toHaveAttribute('aria-valuemax', '720')
    expect(separator).toHaveAttribute('aria-valuenow', '420')
    expect(separator).toHaveAttribute('tabindex', '0')

    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-side-pane-width') || '0')).toBe(440)
    expect(separator).toHaveAttribute('aria-valuenow', '440')

    fireEvent.keyDown(separator, { key: 'ArrowRight', shiftKey: true })
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-side-pane-width') || '0')).toBe(400)

    fireEvent.keyDown(separator, { key: 'Home' })
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-side-pane-width') || '0')).toBe(300)

    fireEvent.keyDown(separator, { key: 'End' })
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-side-pane-width') || '0')).toBe(720)
  })

  it('resizes the workspace side pane from compact menus and the command palette', async () => {
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        content: '# brief',
      }),
      note({
        _id: 'Archive/old.md',
        title: 'old',
        folder: 'Archive',
        content: '# old',
      }),
    ]
    localStorage.setItem('mc-notes-workspace-tab-ids', JSON.stringify(['Projects/brief.md', 'Archive/old.md']))

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch tab: brief' }))
    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in side pane: old' }))

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    let menu = screen.getByRole('menu', { name: 'Workspace tools' })
    expect(within(menu).getByRole('menuitem', { name: 'Narrow side pane' })).toHaveTextContent('420px wide')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Narrow side pane' }))
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-side-pane-width') || '0')).toBe(380)
    expect(screen.getByTestId('workspace-side-pane')).toHaveStyle({ width: '380px' })

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Widen side pane' }))
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-side-pane-width') || '0')).toBe(420)

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Reset side pane width' }))
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-side-pane-width') || '0')).toBe(420)

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Workspace tools' })).not.toBeInTheDocument())

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'widen side pane' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Widen side pane/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-side-pane-width') || '0')).toBe(460)
  })

  it('surfaces pinned and recent note jumps from the workspace dropdown', () => {
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        content: '# brief',
      }),
      note({
        _id: 'Archive/old.md',
        title: 'old',
        folder: 'Archive',
        content: '# old',
      }),
    ]
    localStorage.setItem('mc-pinned-note-ids', JSON.stringify(['Projects/brief.md']))
    localStorage.setItem('mc-recent-note-ids', JSON.stringify(['Archive/old.md', 'Projects/brief.md']))

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))

    const menu = screen.getByRole('menu', { name: 'Workspace tools' })
    expect(within(menu).getByText('Pinned notes')).toBeInTheDocument()
    expect(within(menu).getByText('Recent notes')).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'brief' })).toHaveTextContent('Projects')
    expect(within(menu).getByRole('menuitem', { name: 'old' })).toHaveTextContent('Archive')

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'old' }))

    expect(screen.queryByRole('menu', { name: 'Workspace tools' })).not.toBeInTheDocument()
    expect(screen.getByTestId('note-editor')).toBeInTheDocument()
    expect(screen.getByLabelText('Rename note')).toHaveTextContent('old')
  })

  it('keeps a local workspace tab stack inside the compact workspace dropdown', () => {
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        content: '# brief',
      }),
      note({
        _id: 'Archive/old.md',
        title: 'old',
        folder: 'Archive',
        content: '# old',
      }),
    ]
    localStorage.setItem('mc-notes-workspace-tab-ids', JSON.stringify(['Projects/brief.md', 'Archive/old.md']))

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    let menu = screen.getByRole('menu', { name: 'Workspace tools' })
    expect(within(menu).getByText('Open tabs')).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Switch tab: brief' })).toHaveTextContent('Projects')
    expect(within(menu).getByRole('menuitem', { name: 'Close tab: old' })).toHaveTextContent('Remove from this local workspace stack')

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Switch tab: old' }))
    expect(screen.getByLabelText('Rename note')).toHaveTextContent('old')

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    menu = screen.getByRole('menu', { name: 'Workspace tools' })
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Close tab: old' }))

    expect(screen.getByLabelText('Rename note')).toHaveTextContent('brief')
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-tab-ids') || '[]')).toEqual(['Projects/brief.md'])
  })

  it('reorders workspace tabs by dragging them inside the compact workspace dropdown', () => {
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        content: '# brief',
      }),
      note({
        _id: 'Archive/old.md',
        title: 'old',
        folder: 'Archive',
        content: '# old',
      }),
    ]
    localStorage.setItem('mc-notes-workspace-tab-ids', JSON.stringify([
      'Projects/brief.md',
      'Archive/old.md',
      'Homework/commands.md',
    ]))
    const dragData = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn((type: string, value: string) => {
        dragData.set(type, value)
      }),
      getData: vi.fn((type: string) => dragData.get(type) ?? ''),
    }

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    const menu = screen.getByRole('menu', { name: 'Workspace tools' })
    const oldTab = within(menu).getByRole('menuitem', { name: 'Switch tab: old' })
    const briefTab = within(menu).getByRole('menuitem', { name: 'Switch tab: brief' })

    expect(oldTab).toHaveTextContent('Drag or Alt+Up/Down to reorder')
    fireEvent.dragStart(oldTab, { dataTransfer })
    fireEvent.dragOver(briefTab, { dataTransfer })
    fireEvent.drop(briefTab, { dataTransfer })

    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-tab-ids') || '[]')).toEqual([
      'Archive/old.md',
      'Projects/brief.md',
      'Homework/commands.md',
    ])
    const switchItems = within(menu)
      .getAllByRole('menuitem')
      .filter(item => item.getAttribute('aria-label')?.startsWith('Switch tab:'))
      .map(item => item.getAttribute('aria-label'))
    expect(switchItems).toEqual(['Switch tab: old', 'Switch tab: brief', 'Switch tab: commands'])
  })

  it('reorders workspace tabs from the keyboard and command palette', async () => {
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        content: '# brief',
      }),
      note({
        _id: 'Archive/old.md',
        title: 'old',
        folder: 'Archive',
        content: '# old',
      }),
    ]
    localStorage.setItem('mc-notes-workspace-tab-ids', JSON.stringify([
      'Projects/brief.md',
      'Archive/old.md',
      'Homework/commands.md',
    ]))

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    let menu = screen.getByRole('menu', { name: 'Workspace tools' })
    const oldTab = within(menu).getByRole('menuitem', { name: 'Switch tab: old' })

    expect(oldTab).toHaveTextContent('Alt+Up/Down')
    fireEvent.keyDown(oldTab, { key: 'ArrowUp', altKey: true })

    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-tab-ids') || '[]')).toEqual([
      'Archive/old.md',
      'Projects/brief.md',
      'Homework/commands.md',
    ])

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Switch tab: old' }))
    expect(screen.getByLabelText('Rename note')).toHaveTextContent('old')
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-tab-ids') || '[]')).toEqual([
      'Archive/old.md',
      'Projects/brief.md',
      'Homework/commands.md',
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    menu = screen.getByRole('menu', { name: 'Workspace tools' })
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Move current tab later' }))
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-tab-ids') || '[]')).toEqual([
      'Projects/brief.md',
      'Archive/old.md',
      'Homework/commands.md',
    ])

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'move current tab earlier' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Move current tab earlier/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-tab-ids') || '[]')).toEqual([
      'Archive/old.md',
      'Projects/brief.md',
      'Homework/commands.md',
    ])
  })

  it('cycles local workspace tabs from shortcuts and the command palette', async () => {
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        content: '# brief',
      }),
      note({
        _id: 'Archive/old.md',
        title: 'old',
        folder: 'Archive',
        content: '# old',
      }),
    ]
    localStorage.setItem('mc-notes-workspace-tab-ids', JSON.stringify(['Projects/brief.md', 'Archive/old.md']))

    render(<Notes />)

    fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true, altKey: true })
    expect(screen.getByLabelText('Rename note')).toHaveTextContent('brief')

    fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true, altKey: true })
    expect(screen.getByLabelText('Rename note')).toHaveTextContent('old')

    fireEvent.keyDown(window, { key: 'ArrowLeft', ctrlKey: true, altKey: true })
    expect(screen.getByLabelText('Rename note')).toHaveTextContent('brief')

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'next workspace tab' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Next workspace tab/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    expect(screen.getByLabelText('Rename note')).toHaveTextContent('old')
  })

  it('manages workspace tab stacks with compact close actions', async () => {
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        content: '# brief',
      }),
      note({
        _id: 'Archive/old.md',
        title: 'old',
        folder: 'Archive',
        content: '# old',
      }),
    ]
    localStorage.setItem('mc-notes-workspace-tab-ids', JSON.stringify(['Projects/brief.md', 'Archive/old.md', 'Homework/commands.md']))

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch tab: old' }))
    expect(screen.getByLabelText('Rename note')).toHaveTextContent('old')

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    let menu = screen.getByRole('menu', { name: 'Workspace tools' })
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Close other tabs' }))
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-tab-ids') || '[]')).toEqual(['Archive/old.md'])

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'close all workspace tabs' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Close all workspace tabs/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    expect(JSON.parse(localStorage.getItem('mc-notes-workspace-tab-ids') || '[]')).toEqual([])
    expect(screen.queryByRole('button', { name: 'Rename note' })).not.toBeInTheDocument()

    localStorage.setItem('mc-notes-workspace-tab-ids', JSON.stringify(['Projects/brief.md', 'Archive/old.md']))
    window.dispatchEvent(new CustomEvent('local-storage-state-changed', { detail: { key: 'mc-notes-workspace-tab-ids' } }))
    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    menu = screen.getByRole('menu', { name: 'Workspace tools' })
    expect(within(menu).getByRole('menuitem', { name: 'Close all tabs' })).toBeInTheDocument()
  })

  it('keeps creation actions in their own compact topbar dropdown', () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Create note actions' }))

    const menu = screen.getByRole('menu', { name: 'Create note actions' })
    expect(menu).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'New note' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'New daily note' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Daily note by date' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'This week note' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'This month note' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'New folder' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Import clipboard clip' })).toBeInTheDocument()
    expect(menu.querySelectorAll('span[aria-hidden="true"]').length).toBeGreaterThanOrEqual(5)

    fireEvent.change(within(menu).getByRole('textbox', { name: 'Filter create actions' }), {
      target: { value: 'month' },
    })
    expect(within(menu).getByRole('menuitem', { name: 'This month note' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'New note' })).not.toBeInTheDocument()
  })

  it('creates folders from an in-app topbar dialog without browser prompts', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Create note actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'New folder' }))

    const dialog = screen.getByRole('form', { name: 'Create folder' })
    expect(within(dialog).getByText('Inside Homework')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Folder name' }), {
      target: { value: 'Research' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create folder' }))

    await waitFor(() => expect(mocks.createFolder).toHaveBeenCalledWith('Homework/Research'))
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('renames folders from an in-app dialog without browser prompts', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    render(<Notes />)

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'rename folder homework' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Rename folder: Homework/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    const dialog = screen.getByRole('form', { name: 'Rename folder' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Folder path' }), {
      target: { value: 'School' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename folder' }))

    await waitFor(() => expect(mocks.moveNote).toHaveBeenCalledWith('Homework/commands.md', 'School'))
    expect(mocks.createFolder).toHaveBeenCalledWith('School')
    expect(mocks.deleteFolder).toHaveBeenCalledWith('Homework')
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('moves folders to trash from an in-app confirmation without browser prompts', async () => {
    render(<Notes />)

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Expand Homework' }), { clientX: 120, clientY: 120 })
    fireEvent.click(screen.getByRole('button', { name: 'Move Folder to Trash' }))

    const dialog = screen.getByRole('form', { name: 'Move to Trash folder' })
    expect(within(dialog).getByText(/safety checkpoints/i)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move to Trash' }))

    await waitFor(() => expect(mocks.trashFolder).toHaveBeenCalledWith('Homework'))
    expect(mocks.createNoteVersionCheckpoint).toHaveBeenCalledWith('Homework/commands.md', 'Before moving folder to Trash')
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('moves notes from the file tree with an in-app folder picker without browser prompts', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    mocks.folders = [
      ...mocks.folders,
      {
        _id: 'folder-projects',
        type: 'folder',
        path: 'Projects',
        name: 'Projects',
        created_at: 3,
        updated_at: 4,
      },
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.contextMenu(screen.getAllByText('commands')[0], { clientX: 120, clientY: 120 })
    fireEvent.click(screen.getByRole('button', { name: 'Move...' }))

    const dialog = screen.getByRole('form', { name: 'Move note' })
    expect(within(dialog).getByRole('combobox', { name: 'Existing folders' })).toHaveValue('Homework')
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Existing folders' }), {
      target: { value: 'Projects' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move note' }))

    await waitFor(() => expect(mocks.moveNote).toHaveBeenCalledWith('Homework/commands.md', 'Projects'))
    expect(mocks.createNoteVersionCheckpoint).toHaveBeenCalledWith('Homework/commands.md', 'Before note move')
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('surfaces save, sync, and collaboration state in the status menu', () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Note status' }))

    const menu = screen.getByRole('menu', { name: 'Note status' })
    expect(menu).toBeInTheDocument()
    expect(menu).toHaveStyle({ position: 'fixed', left: '8px' })
    expect(screen.getByText('Local save')).toBeInTheDocument()
    expect(screen.getByText('Vault sync')).toBeInTheDocument()
    expect(screen.getByText('Collaboration')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Save current note/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Refresh notes from vault/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Sync diagnostics/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Recovered drafts/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Sync local collab/i })).toBeInTheDocument()

    fireEvent.change(within(menu).getByRole('textbox', { name: 'Filter note status' }), {
      target: { value: 'diagnostics' },
    })
    expect(within(menu).getByRole('menuitem', { name: 'Sync diagnostics' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: /Save current note/i })).not.toBeInTheDocument()
  })

  it('promotes known sync conflicts into the topbar status menu', async () => {
    mocks.getVaultSyncLedger.mockResolvedValue({
      pending_saves: [],
      sync_states: [
        {
          provider: 'remote-vault',
          remote_id: 'remote/Projects/conflict.md',
          local_id: 'Projects/conflict.md',
          remote_rev: 'remote-rev-7',
          last_synced_at: 20,
          conflict_state: 'conflict',
          conflict: {
            remote_markdown: '# conflict\n\nRemote version',
          },
        },
      ],
    })

    render(<Notes />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Note status' })).toHaveTextContent('1 sync conflict')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Note status' }))
    const menu = screen.getByRole('menu', { name: 'Note status' })

    await waitFor(() => {
      expect(within(menu).getByRole('menuitem', { name: '1 sync conflict needs review' })).toBeInTheDocument()
    })
    expect(within(menu).getByRole('menuitem', { name: '1 sync conflict needs review' })).toHaveTextContent('Open diagnostics')
  })

  it('surfaces sync conflicts inside diagnostics without adding navbar controls', async () => {
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/conflict.md',
        title: 'conflict',
        folder: 'Projects',
        content: '# conflict\n\nLocal version',
      }),
    ]
    mocks.getVaultStatus.mockResolvedValue({
      canonical_store: 'local_sqlite',
      remote_required: false,
      encrypted_backup_supported: true,
      database_path: '/tmp/clawcontrol/local.db',
      attachments_path: '/tmp/clawcontrol/attachments',
      counts: {
        live_notes: 1,
        trashed_notes: 0,
        folders: 1,
        attachments: 0,
        attachment_bytes: 0,
        versions: 2,
        open_comments: 0,
        open_suggestions: 0,
        pending_saves: 0,
        audit_events: 1,
      },
    })
    mocks.getVaultSyncLedger.mockResolvedValue({
      pending_saves: [],
      sync_states: [
        {
          provider: 'remote-vault',
          remote_id: 'remote/Projects/conflict.md',
          local_id: 'Projects/conflict.md',
          remote_rev: 'remote-rev-7',
          last_synced_at: 20,
          conflict_state: 'conflict',
          conflict: {
            local_rev: 'local-rev-3',
            remote_rev: 'remote-rev-7',
            remote_markdown: '# conflict\n\nRemote version',
            reason: 'both sides edited body',
          },
        },
      ],
    })

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Note status' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Sync diagnostics/i }))

    const dialog = await screen.findByRole('dialog', { name: 'Vault privacy status' })
    expect(within(dialog).getByText('Sync conflicts')).toBeInTheDocument()
    expect(within(dialog).getByText(/Review these before trusting remote sync/i)).toBeInTheDocument()
    expect(within(dialog).getByText('remote-vault')).toBeInTheDocument()
    expect(within(dialog).getByText(/Projects\/conflict\.md -> remote\/Projects\/conflict\.md/)).toBeInTheDocument()
    expect(within(dialog).getByText('conflict')).toBeInTheDocument()
    expect(within(dialog).getByText(/local local-rev-3 and remote remote-rev-7/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/both sides edited body/i)).toBeInTheDocument()
    expect(within(dialog).getByText('Remote preview')).toBeInTheDocument()
    expect(within(dialog).getByText('1 added, 1 removed')).toBeInTheDocument()
    expect(within(dialog).getByText('Local version')).toBeInTheDocument()
    expect(within(dialog).getByText('Remote version')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Suggest remote version' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Keep local version' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sync conflicts/i })).not.toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Open local note' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Vault privacy status' })).not.toBeInTheDocument())
    expect(screen.getByRole('textbox', { name: 'Markdown source editor' })).toHaveValue('# conflict\n\nLocal version')
  })

  it('clears a reviewed sync conflict while keeping the local note version', async () => {
    mocks.notes = [
      note({
        _id: 'Projects/conflict.md',
        title: 'conflict',
        folder: 'Projects',
        content: '# conflict\n\nLocal version',
      }),
    ]
    mocks.getVaultStatus.mockResolvedValue({
      canonical_store: 'local_sqlite',
      remote_required: false,
      encrypted_backup_supported: true,
      database_path: '/tmp/clawcontrol/local.db',
      attachments_path: '/tmp/clawcontrol/attachments',
      counts: {
        live_notes: 1,
        trashed_notes: 0,
        folders: 1,
        attachments: 0,
        attachment_bytes: 0,
        versions: 2,
        open_comments: 0,
        open_suggestions: 0,
        pending_saves: 0,
        audit_events: 1,
      },
    })
    mocks.getVaultSyncLedger.mockResolvedValue({
      pending_saves: [],
      sync_states: [
        {
          provider: 'remote-vault',
          remote_id: 'remote/Projects/conflict.md',
          local_id: 'Projects/conflict.md',
          remote_rev: 'remote-rev-7',
          last_synced_at: 20,
          conflict_state: 'conflict',
          conflict: {
            remote_markdown: '# conflict\n\nRemote version',
          },
        },
      ],
    })

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Note status' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Sync diagnostics/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Vault privacy status' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep local version' }))

    await waitFor(() => expect(mocks.resolveVaultSyncConflict).toHaveBeenCalledWith('remote-vault', 'remote/Projects/conflict.md'))
    expect(mocks.createNoteSuggestion).not.toHaveBeenCalled()
    await waitFor(() => expect(within(dialog).queryByText('Sync conflicts')).not.toBeInTheDocument())
    expect(screen.getByRole('textbox', { name: 'Markdown source editor' })).toHaveValue('# conflict\n\nLocal version')
  })

  it('turns remote sync conflict content into a normal review suggestion', async () => {
    mocks.notes = [
      note({
        _id: 'Projects/conflict.md',
        title: 'conflict',
        folder: 'Projects',
        content: '# conflict\n\nLocal version',
      }),
    ]
    mocks.getVaultStatus.mockResolvedValue({
      canonical_store: 'local_sqlite',
      remote_required: false,
      encrypted_backup_supported: true,
      database_path: '/tmp/clawcontrol/local.db',
      attachments_path: '/tmp/clawcontrol/attachments',
      counts: {
        live_notes: 1,
        trashed_notes: 0,
        folders: 1,
        attachments: 0,
        attachment_bytes: 0,
        versions: 2,
        open_comments: 0,
        open_suggestions: 0,
        pending_saves: 0,
        audit_events: 1,
      },
    })
    mocks.getVaultSyncLedger.mockResolvedValue({
      pending_saves: [],
      sync_states: [
        {
          provider: 'remote-vault',
          remote_id: 'remote/Projects/conflict.md',
          local_id: 'Projects/conflict.md',
          remote_rev: 'remote-rev-7',
          last_synced_at: 20,
          conflict_state: 'conflict',
          conflict: {
            local_rev: 'local-rev-3',
            remote_rev: 'remote-rev-7',
            remote_markdown: '# conflict\n\nRemote version',
          },
        },
      ],
    })

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Note status' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Sync diagnostics/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Vault privacy status' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Suggest remote version' }))

    await waitFor(() => expect(mocks.createNoteSuggestion).toHaveBeenCalledWith(
      'Projects/conflict.md',
      { type: 'replace_document', content: '# conflict\n\nRemote version' },
      'Remote sync conflict from remote-vault. Review before accepting.',
      expect.objectContaining({
        scope: 'document',
        provider: 'remote-vault',
        remote_id: 'remote/Projects/conflict.md',
        remote_rev: 'remote-rev-7',
      }),
    ))
    expect(mocks.resolveVaultSyncConflict).toHaveBeenCalledWith('remote-vault', 'remote/Projects/conflict.md')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Vault privacy status' })).not.toBeInTheDocument())
    expect(screen.getByRole('textbox', { name: 'Markdown source editor' })).toHaveValue('# conflict\n\nLocal version')
  })

  it('reviews non-overlapping sync conflict edits before creating a merged suggestion', async () => {
    mocks.notes = [
      note({
        _id: 'Projects/conflict.md',
        title: 'conflict',
        folder: 'Projects',
        content: ['# conflict', '', '- Local line updated', '- Remote line'].join('\n'),
      }),
    ]
    mocks.getVaultStatus.mockResolvedValue({
      canonical_store: 'local_sqlite',
      remote_required: false,
      encrypted_backup_supported: true,
      database_path: '/tmp/clawcontrol/local.db',
      attachments_path: '/tmp/clawcontrol/attachments',
      counts: {
        live_notes: 1,
        trashed_notes: 0,
        folders: 1,
        attachments: 0,
        attachment_bytes: 0,
        versions: 2,
        open_comments: 0,
        open_suggestions: 0,
        pending_saves: 0,
        audit_events: 1,
      },
    })
    mocks.getVaultSyncLedger.mockResolvedValue({
      pending_saves: [],
      sync_states: [
        {
          provider: 'remote-vault',
          remote_id: 'remote/Projects/conflict.md',
          local_id: 'Projects/conflict.md',
          remote_rev: 'remote-rev-8',
          last_synced_at: 20,
          conflict_state: 'conflict',
          conflict: {
            base_markdown: ['# conflict', '', '- Local line', '- Remote line'].join('\n'),
            remote_markdown: ['# conflict', '', '- Local line', '- Remote line updated'].join('\n'),
          },
        },
      ],
    })

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Note status' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Sync diagnostics/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Vault privacy status' })
    expect(within(dialog).getByText('Auto-merge preview')).toBeInTheDocument()
    expect(within(dialog).getByText('Base version:')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Review merge' }))

    const mergeDialog = await screen.findByRole('dialog', { name: 'Review sync merge' })
    const editor = within(mergeDialog).getByRole('textbox', { name: 'Merged Markdown' })
    expect(editor).toHaveValue(['# conflict', '', '- Local line updated', '- Remote line updated'].join('\n'))
    fireEvent.change(editor, {
      target: { value: ['# conflict', '', '- Local line updated', '- Remote line updated', '- Reviewed'].join('\n') },
    })
    fireEvent.click(within(mergeDialog).getByRole('button', { name: 'Create merge suggestion' }))

    await waitFor(() => expect(mocks.createNoteSuggestion).toHaveBeenCalledWith(
      'Projects/conflict.md',
      {
        type: 'replace_document',
        content: ['# conflict', '', '- Local line updated', '- Remote line updated', '- Reviewed'].join('\n'),
      },
      'Reviewed sync merge from remote-vault. Review before accepting.',
      expect.objectContaining({
        scope: 'document',
        provider: 'remote-vault',
        remote_id: 'remote/Projects/conflict.md',
        merge_strategy: 'reviewed_non_overlapping_lines',
      }),
    ))
    expect(mocks.resolveVaultSyncConflict).toHaveBeenCalledWith('remote-vault', 'remote/Projects/conflict.md')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Vault privacy status' })).not.toBeInTheDocument())
    expect(screen.getByRole('textbox', { name: 'Markdown source editor' })).toHaveValue(
      ['# conflict', '', '- Local line updated', '- Remote line'].join('\n'),
    )
  })

  it('refreshes vault note bodies from the compact status menu without adding navbar buttons', async () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Note status' }))
    const menu = screen.getByRole('menu', { name: 'Note status' })
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Refresh notes from vault/i }))

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Note status' })).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Refresh notes from vault/i })).not.toBeInTheDocument()
  })

  it('shows explicit offline state in the compact status dropdown', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    })

    render(<Notes />)

    expect(screen.getByRole('button', { name: 'Note status' })).toHaveTextContent('Offline')

    fireEvent.click(screen.getByRole('button', { name: 'Note status' }))
    expect(screen.getByRole('menuitem', { name: /Offline mode/i })).toHaveTextContent('Edits stay local')

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    })
    fireEvent(window, new Event('online'))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Note status' })).toHaveTextContent(''))
  })

  it('queues offline edits locally and flushes them after reconnect', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    })

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source editor' }), {
      target: { value: '# commands\n\nQueued while offline' },
    })

    expect(mocks.updateNote).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Note status' })).toHaveTextContent('Offline')

    fireEvent.click(screen.getByRole('button', { name: 'Note status' }))
    expect(screen.getByRole('menuitem', { name: /1 queued local edit/i })).toHaveTextContent('waiting for reconnect')

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    })
    fireEvent(window, new Event('online'))

    await waitFor(() => expect(mocks.updateNote).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'Homework/commands.md',
      content: '# commands\n\nQueued while offline',
    })))
  })

  it('does not create a manual save checkpoint while offline edits are still queued', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    })

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source editor' }), {
      target: { value: '# commands\n\nManual save while offline' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Note status' }))
    const saveItem = screen.getByRole('menuitem', { name: /Save current note/i })
    expect(saveItem).toBeDisabled()
    expect(saveItem).toHaveTextContent('Reconnect before flushing queued edits')

    expect(mocks.updateNote).not.toHaveBeenCalled()
    expect(mocks.createNoteVersionCheckpoint).not.toHaveBeenCalled()
  })

  it('keeps backend save failures queued and retries them from the status menu', async () => {
    mocks.updateNote.mockRejectedValueOnce(new Error('backend unavailable'))

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source editor' }), {
      target: { value: '# commands\n\nRetry after backend failure' },
    })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Note status' })).toHaveTextContent('Save failed'))

    fireEvent.click(screen.getByRole('button', { name: 'Note status' }))
    const statusMenu = screen.getByRole('menu', { name: 'Note status' })
    expect(within(statusMenu).getAllByRole('menuitem', { name: /Save failed/i })[0]).toHaveTextContent('Queued edits are still local')
    expect(screen.getByRole('menuitem', { name: /1 queued local edit/i })).toHaveTextContent('Last save failed')
    const retryItem = within(statusMenu)
      .getAllByRole('menuitem', { name: /Retry queued save/i })
      .find(item => item.textContent?.startsWith('Retry queued save'))
    if (!retryItem) throw new Error('Retry queued save action was not rendered')
    expect(retryItem).toHaveTextContent('without naming a version checkpoint')
    fireEvent.click(within(statusMenu).getByRole('menuitem', { name: /Review queued edits/i }))

    const queueDialog = screen.getByRole('dialog', { name: 'Queued local edits' })
    expect(within(queueDialog).getByText('commands')).toBeInTheDocument()
    expect(within(queueDialog).getByText(/Homework\/commands\.md/)).toBeInTheDocument()
    expect(within(queueDialog).getByText(/Save failed: backend unavailable/)).toBeInTheDocument()
    expect(within(queueDialog).getByText('Retry after backend failure')).toBeInTheDocument()
    fireEvent.click(within(queueDialog).getByRole('button', { name: 'Retry all queued edits' }))

    await waitFor(() => expect(mocks.updateNote).toHaveBeenCalledTimes(2))
    expect(mocks.updateNote).toHaveBeenLastCalledWith(expect.objectContaining({
      _id: 'Homework/commands.md',
      content: '# commands\n\nRetry after backend failure',
    }))
    expect(mocks.createNoteVersionCheckpoint).not.toHaveBeenCalled()
  })

  it('keeps saved timestamp detail inside the status dropdown instead of lengthening the navbar', async () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source editor' }), {
      target: { value: '# commands\n\nAutosaved from topbar test' },
    })

    expect(screen.getByRole('button', { name: 'Note status' })).toHaveTextContent('Queued 1')

    await waitFor(() => expect(mocks.updateNote).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'Homework/commands.md',
      content: '# commands\n\nAutosaved from topbar test',
    })))

    const statusButton = screen.getByRole('button', { name: 'Note status' })
    expect(statusButton).toHaveTextContent('')

    fireEvent.click(statusButton)
    expect(screen.getByRole('menu', { name: 'Note status' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Saved \d/i })).toBeInTheDocument()
  })

  it('keeps the More menu focused on review, export, and trash sections', () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))

    const menu = screen.getByRole('menu', { name: 'More note actions' })
    expect(menu).toBeInTheDocument()
    expect(within(menu).queryByText('Create')).not.toBeInTheDocument()
    expect(within(menu).getByText('Review and info')).toBeInTheDocument()
    expect(within(menu).getByText('Export and share')).toBeInTheDocument()
    expect(within(menu).getByText('Trash')).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'New daily note' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Pin current note' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Copy wikilink' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Copy note embed' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Copy note path' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Reveal in file tree' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Open in side pane' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Open references' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Open local graph' })).not.toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Version history' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Word count' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Export DOCX' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Move to Trash' })).toBeInTheDocument()
    expect(menu.querySelectorAll('span[aria-hidden="true"]').length).toBeGreaterThanOrEqual(8)
  })

  it('opens note word count from the compact topbar More menu', async () => {
    mocks.notes = [
      note({
        content: '# commands\n\nOne two three\n\n[[Project Alpha]] #school',
        tags: ['school'],
        links: ['Project Alpha'],
      }),
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Word count' }))

    const dialog = screen.getByRole('dialog', { name: 'Word count' })
    expect(within(dialog).getByText('Words')).toBeInTheDocument()
    expect(within(dialog).getByText('Links')).toBeInTheDocument()
    expect(within(dialog).getByText('Tags')).toBeInTheDocument()
    expect(within(dialog).getByText('Estimated pages')).toBeInTheDocument()
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus())

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Word count' })).not.toBeInTheDocument())
  })

  it('opens note word count from the Docs keyboard shortcut', async () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true, shiftKey: true })

    const dialog = screen.getByRole('dialog', { name: 'Word count' })
    expect(within(dialog).getByText('Words')).toBeInTheDocument()
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus())
  })

  it('opens note word count from the command palette', async () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'word count' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Open word count/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: 'Word count' })).toBeInTheDocument()
  })

  it('opens note comments from the command palette', async () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'comments' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Open comments/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    expect(await screen.findByRole('dialog', { name: 'Comments' })).toBeInTheDocument()
    expect(mocks.getNoteComments).toHaveBeenCalledWith('Homework/commands.md')
  })

  it('includes current selection stats in the topbar word count dialog', async () => {
    mocks.notes = [
      note({
        content: '# commands\n\nOne two three\n\nFour five six',
      }),
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.mouseUp(screen.getByRole('textbox', { name: 'Document editor' }))
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true, shiftKey: true })

    const dialog = screen.getByRole('dialog', { name: 'Word count' })
    const selection = within(dialog).getByRole('region', { name: 'Selection word count' })
    expect(within(selection).getByText('Selection')).toBeInTheDocument()
    expect(within(selection).getByText('Words')).toBeInTheDocument()
    expect(within(selection).getByText('3')).toBeInTheDocument()
    expect(within(dialog).queryByText('No selected text')).not.toBeInTheDocument()
  })

  it('exports private share packages from an in-app role dialog without browser prompts', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    mocks.getNoteComments.mockResolvedValue([comment()])
    mocks.getNoteSuggestions.mockResolvedValue([suggestion()])

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Private share package' }))

    const dialog = screen.getByRole('form', { name: 'Private share package' })
    expect(within(dialog).getByRole('combobox', { name: 'Permission' })).toHaveValue('suggest')
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Permission' }), {
      target: { value: 'comment' },
    })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Recipient' }), {
      target: { value: 'reviewer@example.com' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export share package' }))

    await waitFor(() => expect(mocks.downloadReviewPackage).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'Homework/commands.md' }),
      [expect.objectContaining({ id: 'comment-1' })],
      [expect.objectContaining({ id: 'suggestion-1' })],
      { notes: expect.any(Array) },
      { permission: 'comment', recipient: 'reviewer@example.com' },
    ))
    expect(mocks.getNoteComments).toHaveBeenCalledWith('Homework/commands.md')
    expect(mocks.getNoteSuggestions).toHaveBeenCalledWith('Homework/commands.md')
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('publishes a local static notes site from the compact export menu without adding topbar controls', async () => {
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        content: '# brief\n\nSee [[commands]]',
      }),
      note({
        _id: 'Media/image.png',
        type: 'attachment',
        title: 'image.png',
        folder: 'Media',
        content: '',
      }),
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))
    const menu = screen.getByRole('menu', { name: 'More note actions' })
    expect(within(menu).getByRole('menuitem', { name: 'Publish static site' })).toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Publish static site' }))

    await waitFor(() => expect(mocks.downloadPublishedNotesSite).toHaveBeenCalledWith(
      [
        expect.objectContaining({ _id: 'Homework/commands.md' }),
        expect.objectContaining({ _id: 'Projects/brief.md' }),
      ],
      { entryId: 'Homework/commands.md', title: 'commands Site' },
    ))
    expect(screen.queryByRole('button', { name: 'Publish static site' })).not.toBeInTheDocument()
  })

  it('names the current version from an in-app dialog without browser prompts', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    mocks.getNoteRevision.mockResolvedValue(revisionDetail({ rev: 'rev-new', label: 'Research draft' }))

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Version history' }))

    const history = await screen.findByRole('dialog', { name: 'Version history' })
    fireEvent.click(within(history).getByRole('button', { name: 'Name current version' }))

    const form = screen.getByRole('form', { name: 'Name current version' })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Version name' }), {
      target: { value: 'Research draft' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Name current version' }))

    await waitFor(() => expect(mocks.createNoteVersionCheckpoint).toHaveBeenCalledWith(
      'Homework/commands.md',
      'Research draft',
    ))
    expect(mocks.getNoteRevision).toHaveBeenCalledWith('Homework/commands.md', 'rev-new')
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('renames a version from an in-app dialog without browser prompts', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    mocks.getNoteRevisions.mockResolvedValue([revision()])
    mocks.getNoteRevision.mockResolvedValue(revisionDetail())

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Version history' }))

    const versionButton = (await screen.findByText('Initial draft')).closest('button')
    expect(versionButton).not.toBeNull()
    fireEvent.click(versionButton as HTMLButtonElement)
    await waitFor(() => expect(mocks.getNoteRevision).toHaveBeenCalledWith('Homework/commands.md', 'rev-1'))
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))

    const form = screen.getByRole('form', { name: 'Rename version' })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Version name' }), {
      target: { value: 'Shared draft' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Rename version' }))

    await waitFor(() => expect(mocks.labelNoteRevision).toHaveBeenCalledWith(
      'Homework/commands.md',
      'rev-1',
      'Shared draft',
    ))
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('copies a previewed version into the current note with a safety checkpoint', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    mocks.getNoteRevisions.mockResolvedValue([revision({ rev: 'rev-1', label: 'Initial draft' })])
    mocks.getNoteRevision.mockResolvedValue(revisionDetail({
      rev: 'rev-1',
      label: 'Initial draft',
      content: '# Restored text\n\nCopied from history',
    }))

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Version history' }))

    const versionButton = (await screen.findByText('Initial draft')).closest('button')
    expect(versionButton).not.toBeNull()
    fireEvent.click(versionButton as HTMLButtonElement)
    await waitFor(() => expect(mocks.getNoteRevision).toHaveBeenCalledWith('Homework/commands.md', 'rev-1'))
    fireEvent.click(screen.getByRole('button', { name: 'Copy to current' }))

    await waitFor(() => expect(mocks.createNoteVersionCheckpoint).toHaveBeenCalledWith(
      'Homework/commands.md',
      'Before copying from Initial draft',
    ))
    await waitFor(() => expect(mocks.updateNote).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'Homework/commands.md',
      content: '# Restored text\n\nCopied from history',
    })))
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('restores a version from an in-app confirmation without browser prompts', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    mocks.getNoteRevisions.mockResolvedValue([revision({ rev: 'rev-1', label: 'Initial draft' })])
    mocks.getNoteRevision.mockResolvedValue(revisionDetail({
      rev: 'rev-1',
      label: 'Initial draft',
      content: '# Previous text',
    }))
    mocks.restoreNoteRevision.mockResolvedValue(note({ _id: 'Homework/commands.md', content: '# Previous text' }))

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Version history' }))

    const versionButton = (await screen.findByText('Initial draft')).closest('button')
    expect(versionButton).not.toBeNull()
    fireEvent.click(versionButton as HTMLButtonElement)
    await waitFor(() => expect(mocks.getNoteRevision).toHaveBeenCalledWith('Homework/commands.md', 'rev-1'))
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))

    const dialog = screen.getByRole('form', { name: 'Restore version' })
    expect(within(dialog).getByText(/Restore creates a pre-restore safety version/i)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restore version' }))

    await waitFor(() => expect(mocks.restoreNoteRevision).toHaveBeenCalledWith('Homework/commands.md', 'rev-1'))
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('adds comments from an in-app dialog without browser prompts', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Comments' }))

    const commentsDialog = await screen.findByRole('dialog', { name: 'Comments' })
    fireEvent.click(within(commentsDialog).getByRole('button', { name: 'Add comment' }))

    const compose = screen.getByRole('form', { name: 'Add comment' })
    fireEvent.change(within(compose).getByRole('textbox', { name: 'Comment text' }), {
      target: { value: 'Please tighten this section.' },
    })
    fireEvent.click(within(compose).getByRole('button', { name: 'Add comment' }))

    await waitFor(() => expect(mocks.createNoteComment).toHaveBeenCalledWith(
      'Homework/commands.md',
      'Please tighten this section.',
      { scope: 'document' },
    ))
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('replies to comments from an in-app dialog without browser prompts', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    mocks.getNoteComments.mockResolvedValue([comment()])

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Comments' }))

    const commentsDialog = await screen.findByRole('dialog', { name: 'Comments' })
    fireEvent.click(await within(commentsDialog).findByRole('button', { name: 'Reply' }))

    const compose = screen.getByRole('form', { name: 'Reply to comment' })
    expect(within(compose).getAllByText('commands').length).toBeGreaterThanOrEqual(1)
    fireEvent.change(within(compose).getByRole('textbox', { name: 'Reply text' }), {
      target: { value: 'Updated.' },
    })
    fireEvent.click(within(compose).getByRole('button', { name: 'Send reply' }))

    await waitFor(() => expect(mocks.createNoteCommentReply).toHaveBeenCalledWith('comment-1', 'Updated.'))
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('drafts comment replies with local assistive writing', async () => {
    mocks.getNoteComments.mockResolvedValue([
      comment({
        body: 'Can you clarify this?',
        anchor: { scope: 'selection', quote: 'commands' },
      }),
    ])

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Comments' }))

    const commentsDialog = await screen.findByRole('dialog', { name: 'Comments' })
    fireEvent.click(await within(commentsDialog).findByRole('button', { name: 'Draft reply' }))

    const compose = screen.getByRole('form', { name: 'Reply to comment' })
    const reply = within(compose).getByRole('textbox', { name: 'Reply text' })
    expect(reply).toHaveValue('Thanks. I clarified commands and tightened the surrounding context.')
    fireEvent.click(within(compose).getByRole('button', { name: 'Send reply' }))

    await waitFor(() => expect(mocks.createNoteCommentReply).toHaveBeenCalledWith(
      'comment-1',
      'Thanks. I clarified commands and tightened the surrounding context.',
    ))
  })

  it('creates suggestions from an in-app dialog without browser prompts', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Suggestions' }))

    const suggestionsDialog = await screen.findByRole('dialog', { name: 'Suggestions' })
    fireEvent.click(within(suggestionsDialog).getByRole('button', { name: 'Suggest edit' }))

    const compose = screen.getByRole('form', { name: 'Suggest edit' })
    fireEvent.change(within(compose).getByRole('textbox', { name: 'Suggested Markdown' }), {
      target: { value: '# commands\n\nSuggested edit' },
    })
    fireEvent.change(within(compose).getByRole('textbox', { name: 'Suggestion note' }), {
      target: { value: 'Clarify wording' },
    })
    fireEvent.click(within(compose).getByRole('button', { name: 'Create suggestion' }))

    await waitFor(() => expect(mocks.createNoteSuggestion).toHaveBeenCalledWith(
      'Homework/commands.md',
      { type: 'replace_document', content: '# commands\n\nSuggested edit' },
      'Clarify wording',
      { scope: 'document' },
    ))
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('adds comments to open suggestions from the suggestions dialog', async () => {
    mocks.getNoteSuggestions.mockResolvedValue([suggestion()])

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Suggestions' }))

    const suggestionsDialog = await screen.findByRole('dialog', { name: 'Suggestions' })
    fireEvent.click(await within(suggestionsDialog).findByRole('button', { name: 'Comment' }))

    const compose = screen.getByRole('form', { name: 'Comment on suggestion' })
    expect(within(compose).getByText('Suggestion on: commands')).toBeInTheDocument()
    fireEvent.change(within(compose).getByRole('textbox', { name: 'Comment text' }), {
      target: { value: 'Can we keep this shorter?' },
    })
    fireEvent.click(within(compose).getByRole('button', { name: 'Add comment' }))

    await waitFor(() => expect(mocks.createNoteComment).toHaveBeenCalledWith(
      'Homework/commands.md',
      'Can we keep this shorter?',
      expect.objectContaining({
        scope: 'selection',
        quote: 'Suggestion on: commands',
        suggestion_id: 'suggestion-1',
        suggestion_patch_type: 'replace_selection',
        suggestion_preview: 'brief',
      }),
    ))
  })

  it('shows suggestion-specific comment threads in the suggestions dialog', async () => {
    mocks.getNoteSuggestions.mockResolvedValue([suggestion()])
    mocks.getNoteComments.mockResolvedValue([
      comment({
        id: 'comment-suggestion-1',
        body: 'Can we keep this shorter?',
        anchor: {
          scope: 'selection',
          quote: 'Suggestion on: commands',
          suggestion_id: 'suggestion-1',
          suggestion_patch_type: 'replace_selection',
          suggestion_preview: 'brief',
        },
        replies: [{
          id: 'reply-1',
          comment_id: 'comment-suggestion-1',
          document_id: 'Homework/commands.md',
          body: 'Shorter works.',
          created_at: 21,
          updated_at: 21,
        }],
      }),
      comment({
        id: 'comment-general-1',
        body: 'General comment should stay in the Comments panel.',
        anchor: { scope: 'selection', quote: 'commands' },
      }),
    ])

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Suggestions' }))

    const suggestionsDialog = await screen.findByRole('dialog', { name: 'Suggestions' })
    expect(await within(suggestionsDialog).findByText('Can we keep this shorter?')).toBeInTheDocument()
    expect(within(suggestionsDialog).getByText('Shorter works.')).toBeInTheDocument()
    expect(within(suggestionsDialog).getByText('1 comment')).toBeInTheDocument()
    expect(within(suggestionsDialog).queryByText('General comment should stay in the Comments panel.')).not.toBeInTheDocument()
  })

  it('creates local writing-assist suggestions without adding topbar controls', async () => {
    mocks.notes = [
      note({
        content: '# commands\n\nthis is really very useful in order to ship.',
      }),
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    const editor = screen.getByRole('textbox', { name: 'Markdown source editor' }) as HTMLTextAreaElement
    editor.setSelectionRange(12, editor.value.length)
    fireEvent.select(editor)

    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Assist writing' }))

    const dialog = await screen.findByRole('dialog', { name: 'Writing assistant' })
    expect(screen.queryByRole('button', { name: 'Assist writing' })).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('radio', { name: /Make selection concise/i }))
    expect(within(dialog).getByRole('textbox', { name: 'Writing assistant suggestion' })).toHaveValue('This is useful to ship.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create suggestion' }))

    await waitFor(() => expect(mocks.createNoteSuggestion).toHaveBeenCalledWith(
      'Homework/commands.md',
      { type: 'replace_selection', content: 'This is useful to ship.' },
      'Assistive writing: Make selection concise. Generated locally; review before accepting.',
      {
        scope: 'selection',
        mode: 'markdown',
        start: 12,
        end: 56,
        quote: 'this is really very useful in order to ship.',
      },
    ))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Suggestions' })).toBeInTheDocument())
  })

  it('applies writing-assist tone and length controls before creating suggestions', async () => {
    mocks.notes = [
      note({
        content: '# commands\n\nThis is really very useful in order to ship. It has extra words.\n\n- First\n- Second\n- Third\n- Fourth',
      }),
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Assist writing' }))

    const dialog = await screen.findByRole('dialog', { name: 'Writing assistant' })
    expect(within(dialog).getByRole('combobox', { name: 'Writing assistant provider' })).toHaveValue('local')
    expect(within(dialog).getByText('Local-only assistant. Note text stays on this device and is not sent to a remote provider.')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Writing assistant tone' }), {
      target: { value: 'direct' },
    })
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Writing assistant length' }), {
      target: { value: 'short' },
    })

    expect(within(dialog).getByRole('textbox', { name: 'Writing assistant suggestion' })).toHaveValue(
      '# commands\nThis is really very useful in order to ship.\n- First\n- Second\n- Third',
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create suggestion' }))

    await waitFor(() => expect(mocks.createNoteSuggestion).toHaveBeenCalledWith(
      'Homework/commands.md',
      {
        type: 'replace_document',
        content: '# commands\nThis is really very useful in order to ship.\n- First\n- Second\n- Third',
      },
      expect.stringContaining('direct tone, short length applied locally'),
      { scope: 'document' },
    ))
  })

  it('accepts all open suggestions from the review dialog', async () => {
    mocks.getNoteSuggestions.mockResolvedValue([
      suggestion(),
      suggestion({
        id: 'suggestion-2',
        anchor: { scope: 'cursor', start: 7, end: 7 },
        patch: { type: 'insert_at_cursor', content: '\n\nReviewed' },
      }),
    ])

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Suggestions' }))

    const dialog = await screen.findByRole('dialog', { name: 'Suggestions' })
    expect(within(dialog).getByText('2 open suggestions.')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept all' }))

    await waitFor(() => expect(mocks.updateNote).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'Homework/commands.md',
      content: '# brief\n\nReviewed',
    })))
    expect(mocks.applyNoteSuggestion).toHaveBeenCalledWith('suggestion-1')
    expect(mocks.applyNoteSuggestion).toHaveBeenCalledWith('suggestion-2')
    expect(mocks.rejectNoteSuggestion).not.toHaveBeenCalled()
  })

  it('rejects all open suggestions without editing the note', async () => {
    mocks.getNoteSuggestions.mockResolvedValue([
      suggestion(),
      suggestion({
        id: 'suggestion-2',
        status: 'applied',
      }),
      suggestion({
        id: 'suggestion-3',
        anchor: { scope: 'cursor', start: 10, end: 10 },
        patch: { type: 'insert_at_cursor', content: '\n\nNope' },
      }),
    ])

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Suggestions' }))

    const dialog = await screen.findByRole('dialog', { name: 'Suggestions' })
    expect(within(dialog).getByText('2 open suggestions.')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject all' }))

    await waitFor(() => expect(mocks.rejectNoteSuggestion).toHaveBeenCalledWith('suggestion-1'))
    expect(mocks.rejectNoteSuggestion).toHaveBeenCalledWith('suggestion-3')
    expect(mocks.rejectNoteSuggestion).not.toHaveBeenCalledWith('suggestion-2')
    expect(mocks.updateNote).not.toHaveBeenCalled()
  })

  it('toggles the current note pin from the note details menu', async () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Note details' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pin current note' }))

    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Note details' })).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Note details' }))
    expect(screen.getByRole('menuitem', { name: 'Unpin current note' })).toBeInTheDocument()
  })

  it('filters note detail actions inside the topbar dropdown', () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Note details' }))

    const menu = screen.getByRole('menu', { name: 'Note details' })
    fireEvent.change(within(menu).getByRole('textbox', { name: 'Filter note details' }), {
      target: { value: 'block' },
    })

    expect(within(menu).getByRole('menuitem', { name: 'Insert block ID' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Copy block reference' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Rename note' })).not.toBeInTheDocument()
  })

  it('reveals the current note in the file tree from the note details menu', async () => {
    localStorage.setItem('mc-notes-focus-mode', 'true')

    render(<Notes />)

    await waitFor(() => expect(screen.getByTestId('notes-topbar-primary')).toHaveTextContent('commands'))
    expect(screen.queryByRole('button', { name: 'Expand Homework' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Note details' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reveal in file tree' }))

    expect(await screen.findByRole('button', { name: 'Collapse Homework' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'commands' }).length).toBeGreaterThan(0)
  })

  it('opens the current note in a side pane from the note details menu', async () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Note details' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in side pane' }))

    await waitFor(() => expect(screen.getAllByTestId('note-editor')).toHaveLength(2))
    expect(within(screen.getByTestId('workspace-side-pane')).getByText('commands')).toBeInTheDocument()
  })

  it('opens a file tree note in a side pane from the note context menu', async () => {
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        content: '# brief',
      }),
    ]
    mocks.folders = [
      ...mocks.folders,
      {
        _id: 'folder-projects',
        type: 'folder',
        path: 'Projects',
        name: 'Projects',
        created_at: 3,
        updated_at: 4,
      },
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getByRole('button', { name: 'commands' }))
    fireEvent.click(screen.getByRole('button', { name: 'Expand Projects' }))
    fireEvent.contextMenu(screen.getByRole('button', { name: 'brief' }), { clientX: 120, clientY: 120 })
    fireEvent.click(screen.getByRole('button', { name: 'Open in side pane' }))

    await waitFor(() => expect(screen.getAllByTestId('note-editor')).toHaveLength(2))
    expect(within(screen.getByTestId('workspace-side-pane')).getByText('brief')).toBeInTheDocument()
  })

  it('opens the current note in a side pane from the split keyboard shortcut', async () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.keyDown(window, { key: '\\', ctrlKey: true, altKey: true })

    await waitFor(() => expect(screen.getAllByTestId('note-editor')).toHaveLength(2))
    expect(within(screen.getByTestId('workspace-side-pane')).getByText('commands')).toBeInTheDocument()
  })

  it('clears sidebar search when revealing the current note in the file tree', async () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.change(screen.getByRole('textbox', { name: 'Search notes' }), {
      target: { value: 'no-match' },
    })

    expect(screen.getByRole('textbox', { name: 'Search notes' })).toHaveValue('no-match')
    expect(screen.getByText('No matches')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Note details' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reveal in file tree' }))

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Search notes' })).toHaveValue(''))
    expect(screen.getByRole('button', { name: 'Collapse Homework' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'commands' }).length).toBeGreaterThan(0)
  })

  it('copies the current note wikilink from the note details menu', () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Note details' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy wikilink' }))

    expect(mocks.writeText).toHaveBeenCalledWith('[[commands]]')
  })

  it('copies the current note embed from the note details menu', () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Note details' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy note embed' }))

    expect(mocks.writeText).toHaveBeenCalledWith('![[commands]]')
  })

  it('copies the current note embed from the command palette', async () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'copy embed' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Copy current embed/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    expect(mocks.writeText).toHaveBeenCalledWith('![[commands]]')
  })

  it('reveals the current note in the file tree from the command palette', async () => {
    localStorage.setItem('mc-notes-focus-mode', 'true')

    render(<Notes />)

    await waitFor(() => expect(screen.getByTestId('notes-topbar-primary')).toHaveTextContent('commands'))
    expect(screen.queryByRole('button', { name: 'Expand Homework' })).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'reveal current note' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Reveal current note in file tree/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Collapse Homework' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'commands' }).length).toBeGreaterThan(0)
  })

  it('opens the current note in a side pane from the command palette', async () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'open side pane commands' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Open in side pane: commands/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    expect(screen.getAllByTestId('note-editor')).toHaveLength(2)
    expect(within(screen.getByTestId('workspace-side-pane')).getByText('commands')).toBeInTheDocument()
  })

  it('inserts another note as an embed from the command palette', async () => {
    mocks.notes = [
      note(),
      note({
        _id: 'Projects/alpha.md',
        title: 'Project Alpha',
        folder: 'Projects',
        content: '# Project Alpha',
      }),
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'insert embed alpha' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Insert embed: Project Alpha/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    await waitFor(() => expect(mocks.updateNote).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'Homework/commands.md',
      content: '# commands\n\n![[Project Alpha]]\n',
    })))
  })

  it('inserts another note embed at the markdown cursor from the command palette', async () => {
    mocks.notes = [
      note({
        content: '# commands\n\nTail',
      }),
      note({
        _id: 'Projects/alpha.md',
        title: 'Project Alpha',
        folder: 'Projects',
        content: '# Project Alpha',
      }),
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    const editor = screen.getByRole('textbox', { name: 'Markdown source editor' }) as HTMLTextAreaElement
    editor.setSelectionRange('# commands'.length, '# commands'.length)
    fireEvent.select(editor)
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'insert embed alpha' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Insert embed: Project Alpha/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    await waitFor(() => expect(mocks.updateNote).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'Homework/commands.md',
      content: '# commands\n\n![[Project Alpha]]\n\nTail',
    })))
  })

  it('inserts an Obsidian block ID at the markdown cursor from the command palette', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1234567890)
    mocks.notes = [
      note({
        content: '# commands\n\nTail',
      }),
    ]

    try {
      render(<Notes />)

      fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
      fireEvent.click(screen.getAllByText('commands')[0])
      const editor = screen.getByRole('textbox', { name: 'Markdown source editor' }) as HTMLTextAreaElement
      editor.setSelectionRange('# commands'.length, '# commands'.length)
      fireEvent.select(editor)
      fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
      fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
        target: { value: 'block id' },
      })
      fireEvent.click(screen.getByRole('option', { name: /Insert block ID/i }))

      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
      await waitFor(() => expect(mocks.updateNote).toHaveBeenCalledWith(expect.objectContaining({
        _id: 'Homework/commands.md',
        content: `# commands ^commands-${(1234567890).toString(36)}\n\nTail`,
      })))
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('copies an Obsidian block reference from the markdown cursor', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1234567890)
    mocks.notes = [
      note({
        content: '# commands\n\nTail',
      }),
    ]

    try {
      render(<Notes />)

      fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
      fireEvent.click(screen.getAllByText('commands')[0])
      const editor = screen.getByRole('textbox', { name: 'Markdown source editor' }) as HTMLTextAreaElement
      editor.setSelectionRange('# commands'.length, '# commands'.length)
      fireEvent.select(editor)
      fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
      fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
        target: { value: 'copy block reference' },
      })
      fireEvent.click(screen.getByRole('option', { name: /Copy block reference/i }))

      const blockId = `commands-${(1234567890).toString(36)}`
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
      expect(mocks.writeText).toHaveBeenCalledWith(`[[commands#^${blockId}]]`)
      await waitFor(() => expect(mocks.updateNote).toHaveBeenCalledWith(expect.objectContaining({
        _id: 'Homework/commands.md',
        content: `# commands ^${blockId}\n\nTail`,
      })))
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('reuses an existing block ID when copying a block reference', async () => {
    mocks.notes = [
      note({
        content: '# commands ^existing-block\n\nTail',
      }),
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    const editor = screen.getByRole('textbox', { name: 'Markdown source editor' }) as HTMLTextAreaElement
    editor.setSelectionRange('# commands'.length, '# commands'.length)
    fireEvent.select(editor)
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'copy block reference' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Copy block reference/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    expect(mocks.writeText).toHaveBeenCalledWith('[[commands#^existing-block]]')
    expect(mocks.updateNote).not.toHaveBeenCalled()
  })

  it('copies the nearest Markdown heading reference from the command palette', async () => {
    mocks.notes = [
      note({
        content: '# commands\n\n## Research Plan\n\nTail',
      }),
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    const editor = screen.getByRole('textbox', { name: 'Markdown source editor' }) as HTMLTextAreaElement
    const cursor = '# commands\n\n## Research Plan\n\nTa'.length
    editor.setSelectionRange(cursor, cursor)
    fireEvent.select(editor)
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'copy heading reference' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Copy heading reference/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    expect(mocks.writeText).toHaveBeenCalledWith('[[commands#Research Plan]]')
    expect(mocks.updateNote).not.toHaveBeenCalled()
  })

  it('copies Obsidian heading and block references from the note details menu', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1234567890)
    mocks.notes = [
      note({
        content: '# commands\n\n## Research Plan\n\nTail',
      }),
    ]

    try {
      render(<Notes />)

      fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
      fireEvent.click(screen.getAllByText('commands')[0])
      const editor = screen.getByRole('textbox', { name: 'Markdown source editor' }) as HTMLTextAreaElement
      const cursor = '# commands\n\n## Research Plan'.length
      editor.setSelectionRange(cursor, cursor)
      fireEvent.select(editor)

      fireEvent.click(screen.getByRole('button', { name: 'Note details' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Copy heading reference' }))
      expect(mocks.writeText).toHaveBeenCalledWith('[[commands#Research Plan]]')
      expect(mocks.updateNote).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: 'Note details' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Copy block reference' }))

      const blockId = `commands-${(1234567890).toString(36)}`
      expect(mocks.writeText).toHaveBeenCalledWith(`[[commands#^${blockId}]]`)
      await waitFor(() => expect(mocks.updateNote).toHaveBeenCalledWith(expect.objectContaining({
        _id: 'Homework/commands.md',
        content: `# commands\n\n## Research Plan ^${blockId}\n\nTail`,
      })))
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('opens the active note outline from the command palette and jumps to a heading', async () => {
    mocks.notes = [
      note({
        content: '# commands\n\n## Research Plan\n\n### Tasks\n\nTail',
      }),
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'open outline' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Open outline/i }))

    expect(await screen.findByRole('dialog', { name: 'Active note outline' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Tasks/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Active note outline' })).not.toBeInTheDocument())
    expect(screen.getByTestId('note-editor')).toHaveAttribute('data-jump-line', '5')
  })

  it('opens current note references from the compact note details menu', async () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    expect(screen.getByTestId('backlinks-panel')).toHaveAttribute('data-open-request', '0')

    fireEvent.click(screen.getByRole('button', { name: 'Note details' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open references' }))

    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Note details' })).not.toBeInTheDocument())
    expect(screen.getByTestId('backlinks-panel')).toHaveAttribute('data-open-request', '1')
  })

  it('opens current note references from the command palette', async () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'references' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Open references/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    expect(screen.getByTestId('backlinks-panel')).toHaveAttribute('data-open-request', '1')
  })

  it('opens the current note local graph from the compact note details menu', async () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Note details' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open local graph' }))

    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Note details' })).not.toBeInTheDocument())
    expect(screen.getByTestId('graph-view')).toBeInTheDocument()
    expect(localStorage.getItem('mc-notes-graph-local')).toBe('true')
  })

  it('opens the current note local graph from the command palette', async () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'local graph' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Open local graph/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    expect(screen.getByTestId('graph-view')).toBeInTheDocument()
    expect(localStorage.getItem('mc-notes-graph-local')).toBe('true')
  })

  it('copies current note identity links from the compact note details menu', () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])

    fireEvent.click(screen.getByRole('button', { name: 'Note details' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy wikilink' }))
    expect(mocks.writeText).toHaveBeenCalledWith('[[commands]]')

    fireEvent.click(screen.getByRole('button', { name: 'Note details' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy note embed' }))
    expect(mocks.writeText).toHaveBeenCalledWith('![[commands]]')

    fireEvent.click(screen.getByRole('button', { name: 'Note details' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy note path' }))

    expect(mocks.writeText).toHaveBeenCalledWith('Homework/commands.md')
  })

  it('keeps the note title compact and moves the path into a details dropdown', () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])

    const rename = screen.getByRole('button', { name: 'Rename note' })
    expect(rename).toHaveTextContent('commands')
    expect(rename).not.toHaveTextContent('Homework')
    expect(rename.textContent).not.toContain('\n')

    fireEvent.click(screen.getByRole('button', { name: 'Note details' }))
    expect(screen.getByRole('menuitem', { name: 'commands' })).toHaveTextContent('Homework/commands.md')
    expect(screen.getByText('Identity')).toBeInTheDocument()
    expect(screen.getByText('Copy links')).toBeInTheDocument()
    expect(screen.getByText('References')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Pin current note' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Reveal in file tree' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Open in side pane' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Copy wikilink' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Copy note embed' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Open references' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Open local graph' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Insert block ID' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Copy block reference' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Copy heading reference' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy note path' }))
    expect(mocks.writeText).toHaveBeenCalledWith('Homework/commands.md')
  })

  it('smokes selecting, creating, typing, and More from the Notes chrome', async () => {
    mocks.createNote.mockImplementation(async (title: string, folder?: string, content = '') => {
      const created = note({
        _id: `${folder || 'Homework'}/${title}.md`,
        title,
        folder: folder || 'Homework',
        content,
        created_at: 10,
        updated_at: 10,
      })
      mocks.notes = [...mocks.notes, created]
      return created
    })

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    expect(screen.getByTestId('note-editor')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source editor' }), {
      target: { value: '# commands\n\nSource smoke edit' },
    })

    await waitFor(() => expect(mocks.updateNote).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'Homework/commands.md',
      content: '# commands\n\nSource smoke edit',
    })))

    const documentEditor = screen.getByRole('textbox', { name: 'Document editor' })
    documentEditor.textContent = '# commands\n\nRich doc smoke edit'
    fireEvent.input(documentEditor)

    await waitFor(() => expect(mocks.updateNote).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'Homework/commands.md',
      content: '# commands\n\nRich doc smoke edit',
    })))

    fireEvent.click(screen.getByRole('button', { name: 'Create note actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'New note' }))

    await waitFor(() => expect(mocks.createNote).toHaveBeenCalledWith('Untitled', 'Homework', ''))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rename note' })).toHaveTextContent('Untitled'))

    fireEvent.click(screen.getByRole('button', { name: 'Create note actions' }))
    const createMenu = await screen.findByRole('menu', { name: 'Create note actions' })
    expect(within(createMenu).getByRole('menuitem', { name: 'New daily note' })).toBeInTheDocument()
    expect(within(createMenu).getByRole('menuitem', { name: 'This week note' })).toBeInTheDocument()
    expect(within(createMenu).getByRole('menuitem', { name: 'This month note' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))
    const moreMenu = screen.getByRole('menu', { name: 'More note actions' })
    expect(within(moreMenu).queryByRole('menuitem', { name: 'Copy note path' })).not.toBeInTheDocument()
    expect(within(moreMenu).getByRole('menuitem', { name: 'Version history' })).toBeInTheDocument()
  }, 45_000)

  it('renames tags from an in-app dialog without browser prompts', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    mocks.notes = [
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        tags: ['project/alpha'],
        content: [
          '---',
          'tags:',
          '  - project/alpha',
          '---',
          '',
          'Body #project/alpha and #project/alpha-extra',
        ].join('\n'),
      }),
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Rename tag project/alpha' }))
    const dialog = screen.getByRole('form', { name: 'Rename tag' })
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'project/gamma' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename tag' }))

    await waitFor(() => expect(mocks.updateNote).toHaveBeenCalled())
    expect(mocks.updateNote).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'Projects/brief.md',
      content: [
        '---',
        'tags:',
        '  - project/gamma',
        '---',
        '',
        'Body #project/gamma and #project/alpha-extra',
      ].join('\n'),
    }))
    expect(promptSpy).not.toHaveBeenCalled()
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('surfaces tag rename actions in the command palette', async () => {
    mocks.notes = [
      note({
        _id: 'Projects/brief.md',
        title: 'brief',
        folder: 'Projects',
        tags: ['project/alpha'],
        content: 'Body #project/alpha',
      }),
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open command palette' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'rename project alpha' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Rename tag #project\/alpha/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    expect(screen.getByRole('form', { name: 'Rename tag' })).toBeInTheDocument()
  })

  it('opens a searchable all-tags view and launches tag rename without browser prompts', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    mocks.notes = [
      note({
        _id: 'Projects/alpha.md',
        title: 'alpha',
        folder: 'Projects',
        tags: ['project/alpha'],
        content: 'Body #project/alpha',
      }),
      note({
        _id: 'Projects/beta.md',
        title: 'beta',
        folder: 'Projects',
        tags: ['project/beta'],
        content: 'Body #project/beta',
      }),
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Projects' }))
    fireEvent.click(screen.getByRole('button', { name: 'alpha' }))
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'all tags' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Open all tags/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    const dialog = screen.getByRole('dialog', { name: 'All tags' })
    expect(within(dialog).getByText('#project')).toBeInTheDocument()
    expect(within(dialog).getAllByText('#project/alpha').length).toBeGreaterThan(0)
    expect(within(dialog).getAllByText('#project/beta').length).toBeGreaterThan(0)

    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Filter tags' }), {
      target: { value: 'alpha' },
    })

    expect(within(dialog).getByText('#project')).toBeInTheDocument()
    expect(within(dialog).getAllByText('#project/alpha').length).toBeGreaterThan(0)
    expect(within(dialog).queryByRole('button', { name: 'Rename tag project/beta' })).not.toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename tag project/alpha' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'All tags' })).not.toBeInTheDocument())
    expect(screen.getByRole('form', { name: 'Rename tag' })).toBeInTheDocument()
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('removes a tag from the all-tags view with an in-app confirmation', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    mocks.notes = [
      note({
        _id: 'Projects/alpha.md',
        title: 'alpha',
        folder: 'Projects',
        tags: ['project/alpha'],
        content: [
          '---',
          'tags:',
          '  - project/alpha',
          '  - area',
          '---',
          '',
          'Body #project/alpha and #project/alpha-extra',
        ].join('\n'),
      }),
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Projects' }))
    fireEvent.click(screen.getByRole('button', { name: 'alpha' }))
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'all tags' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Open all tags/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    const tagsDialog = screen.getByRole('dialog', { name: 'All tags' })
    fireEvent.click(within(tagsDialog).getByRole('button', { name: 'Remove tag project/alpha' }))

    const removeDialog = screen.getByRole('form', { name: 'Remove tag' })
    expect(within(removeDialog).getByText(/#project\/alpha in 1 note/)).toBeInTheDocument()
    fireEvent.click(within(removeDialog).getByRole('button', { name: 'Remove tag' }))

    await waitFor(() => expect(mocks.updateNote).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'Projects/alpha.md',
      content: [
        '---',
        'tags:',
        '  - area',
        '---',
        '',
        'Body  and #project/alpha-extra',
      ].join('\n'),
    })))
    expect(mocks.refresh).toHaveBeenCalled()
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('applies an existing tag to the current note from the all-tags view', async () => {
    mocks.notes = [
      note({
        _id: 'Projects/alpha.md',
        title: 'alpha',
        folder: 'Projects',
        tags: [],
        content: '# Alpha',
      }),
      note({
        _id: 'Projects/beta.md',
        title: 'beta',
        folder: 'Projects',
        tags: ['project/beta'],
        content: 'Body #project/beta',
      }),
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Projects' }))
    fireEvent.click(screen.getByRole('button', { name: 'alpha' }))
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'all tags' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Open all tags/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    const tagsDialog = screen.getByRole('dialog', { name: 'All tags' })
    fireEvent.click(within(tagsDialog).getByRole('button', { name: 'Apply tag project/beta to current note' }))

    await waitFor(() => expect(mocks.updateNote).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'Projects/alpha.md',
      content: [
        '---',
        'tags:',
        '  - project/beta',
        '---',
        '',
        '# Alpha',
      ].join('\n'),
    })))
    expect(mocks.createNoteVersionCheckpoint).toHaveBeenCalledWith('Projects/alpha.md', 'Before tag apply')
    expect(screen.queryByRole('dialog', { name: 'All tags' })).not.toBeInTheDocument()
  })

  it('filters the vault from the all-tags view without adding navbar controls', async () => {
    mocks.notes = [
      note({
        _id: 'Projects/alpha.md',
        title: 'alpha',
        folder: 'Projects',
        tags: ['project/alpha'],
        content: 'Body #project/alpha',
      }),
      note({
        _id: 'Projects/beta.md',
        title: 'beta',
        folder: 'Projects',
        tags: ['project/beta'],
        content: 'Body #project/beta',
      }),
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Projects' }))
    fireEvent.click(screen.getByRole('button', { name: 'alpha' }))
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'all tags' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Open all tags/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    const tagsDialog = screen.getByRole('dialog', { name: 'All tags' })
    fireEvent.click(within(tagsDialog).getByRole('button', { name: 'Filter notes by tag project/beta' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'All tags' })).not.toBeInTheDocument())
    expect(screen.getByRole('textbox', { name: 'Search notes' })).toHaveValue('tag:project/beta')
    expect(screen.getByRole('button', { name: 'beta' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'alpha' })).not.toBeInTheDocument()
  })

  it('saves the current note as a template from an in-app dialog without browser prompts', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'save current note as template' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Save current note as template/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    const dialog = screen.getByRole('form', { name: 'Save current note as template' })
    expect(within(dialog).getByRole('textbox', { name: 'Template name' })).toHaveValue('commands Template')
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Template name' }), {
      target: { value: 'Command Template' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save template' }))

    await waitFor(() => expect(mocks.createFolder).toHaveBeenCalledWith('Templates'))
    expect(mocks.createNote).toHaveBeenCalledWith(
      'Command Template',
      'Templates',
      '---\ntemplate: true\n---\n\n# commands',
    )
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('imports plugin marketplace feeds from an in-app URL dialog without browser prompts', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    const payload = {
      packages: [
        {
          packageId: 'pkg.local.remote',
          plugin: {
            id: 'local.remote',
            label: 'Remote package',
            description: 'Fetched from a remote feed',
            enabled: true,
            version: '1.0.0',
            permissions: ['read:tags'],
            template: 'Tags:\n{{tagList}}',
          },
        },
      ],
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => payload,
    })) as unknown as typeof fetch
    vi.stubGlobal('fetch', fetchMock)

    render(<Notes />)

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'import plugin marketplace feed' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Import plugin marketplace feed/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    const dialog = screen.getByRole('form', { name: 'Import plugin marketplace feed' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Feed URL' }), {
      target: { value: 'https://plugins.example/feed.json#ignored' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import feed' }))

    await waitFor(() => expect(mocks.createFolder).toHaveBeenCalledWith('Plugins'))
    expect(fetchMock).toHaveBeenCalledWith(
      'https://plugins.example/feed.json',
      expect.objectContaining({
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      }),
    )
    expect(mocks.createNote).toHaveBeenCalledWith(
      'Plugin Marketplace plugins.example',
      'Plugins',
      expect.stringContaining('Imported from https://plugins.example/feed.json#ignored'),
    )
    expect(mocks.createNote).toHaveBeenCalledWith(
      'Plugin Marketplace plugins.example',
      'Plugins',
      expect.stringContaining('Remote package'),
    )
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('shows an in-app notice for empty plugin marketplace feeds without browser alerts', async () => {
    const alertSpy = vi.spyOn(window, 'alert')
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ packages: [] }),
    })) as unknown as typeof fetch
    vi.stubGlobal('fetch', fetchMock)

    render(<Notes />)

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'import plugin marketplace feed' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Import plugin marketplace feed/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    const dialog = screen.getByRole('form', { name: 'Import plugin marketplace feed' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Feed URL' }), {
      target: { value: 'https://plugins.example/empty.json' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import feed' }))

    expect(await screen.findByRole('dialog', { name: 'No plugin packages found' })).toBeInTheDocument()
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('applies plugin write requests from an in-app confirmation without browser confirms', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    mocks.notes = [
      note(),
      note({
        _id: 'Plugins/writes.md',
        title: 'Writes',
        folder: 'Plugins',
        content: vaultPluginWriteMarkdown('local.writer', {
          action: 'modify',
          path: 'Homework/commands.md',
          content: '# Updated by plugin',
        }),
        updated_at: 12,
      }),
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'apply plugin write requests' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Apply plugin write requests/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    const dialog = screen.getByRole('form', { name: 'Apply plugin writes' })
    expect(within(dialog).getByText(/Safety checkpoints/i)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply plugin writes' }))

    await waitFor(() => expect(mocks.updateNote).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'Homework/commands.md',
      content: '# Updated by plugin',
    })))
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('exports encrypted vault backups from an in-app password dialog without browser prompts', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const createObjectUrl = vi.fn(() => 'blob:encrypted-vault')
    const revokeObjectUrl = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl })

    render(<Notes />)

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'export encrypted vault backup' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Export encrypted vault backup/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    const dialog = screen.getByRole('form', { name: 'Export encrypted vault backup' })
    fireEvent.change(within(dialog).getByLabelText('Password'), {
      target: { value: 'correct horse battery staple' },
    })
    fireEvent.change(within(dialog).getByLabelText('Confirm password'), {
      target: { value: 'correct horse battery staple' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export backup' }))

    await waitFor(() => expect(mocks.exportEncryptedVault).toHaveBeenCalledWith('correct horse battery staple'))
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob))
    expect(clickSpy).toHaveBeenCalled()
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:encrypted-vault')
    expect(promptSpy).not.toHaveBeenCalled()
    clickSpy.mockRestore()
  })

  it('approves remote collaboration pairings from an in-app label form without browser prompts', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')

    render(<Notes />)

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'editor preferences' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Editor preferences/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    expect(screen.getByText('Editor preferences')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Remote collaboration provider'))
    fireEvent.change(screen.getByLabelText('Provider URL'), {
      target: { value: 'https://vault.example' },
    })
    fireEvent.change(screen.getByLabelText('Pairing key'), {
      target: { value: 'pair-key-1234567890' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Approve local key' }))

    const form = screen.getByRole('form', { name: 'Approve local pairing' })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Device label' }), {
      target: { value: 'Studio laptop' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Approve pairing' }))

    await waitFor(() => expect(mocks.approveVaultCollaborationPairing).toHaveBeenCalledWith(
      'pair-key-1234567890',
      'Studio laptop',
    ))
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('revokes remote collaboration pairings from an in-app confirmation without browser confirms', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')

    render(<Notes />)

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'editor preferences' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Editor preferences/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Remote collaboration provider'))
    fireEvent.change(screen.getByLabelText('Provider URL'), {
      target: { value: 'https://vault.example' },
    })
    fireEvent.change(screen.getByLabelText('Pairing key'), {
      target: { value: 'pair-key-1234567890' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Revoke key' }))

    const dialog = screen.getByRole('form', { name: 'Revoke pairing key' })
    expect(within(dialog).getByText(/Remote collaboration will need a newly approved key/i)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke pairing' }))

    await waitFor(() => expect(mocks.revokeVaultCollaborationPairing).toHaveBeenCalledWith({
      pairingKey: 'pair-key-1234567890',
    }))
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('shows an in-app notice for invalid pairing invites without browser alerts', async () => {
    const alertSpy = vi.spyOn(window, 'alert')

    render(<Notes />)

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'editor preferences' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Editor preferences/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Accept invite' }))
    const form = screen.getByRole('form', { name: 'Accept pairing invite' })
    fireEvent.change(within(form).getByLabelText('Pairing invite'), {
      target: { value: 'not-a-valid-invite' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Accept pairing' }))

    expect(await screen.findByRole('dialog', { name: 'Pairing invite failed' })).toBeInTheDocument()
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('exposes editor preferences as a focused modal dialog with keyboard dismissal', async () => {
    render(<Notes />)

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'editor preferences' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Editor preferences/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    const dialog = screen.getByRole('dialog', { name: 'Editor preferences' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    await waitFor(() => expect(dialog).toHaveFocus())

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editor preferences' })).not.toBeInTheDocument())
  })

  it('applies vault-scoped appearance and CSS snippet preferences without adding topbar controls', async () => {
    render(<Notes />)

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'editor preferences' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Editor preferences/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    const dialog = screen.getByRole('dialog', { name: 'Editor preferences' })
    fireEvent.change(within(dialog).getByLabelText('Appearance'), {
      target: { value: 'light' },
    })
    fireEvent.click(within(dialog).getByLabelText('Enable CSS snippet'))
    fireEvent.change(within(dialog).getByLabelText('CSS snippet'), {
      target: { value: '.tiptap-note-body { font-size: 15px; }' },
    })

    await waitFor(() => expect(screen.getByTestId('notes-css-snippet')).toHaveTextContent(
      '@scope ([data-notes-vault-scope="true"])',
    ))
    expect(screen.getByTestId('notes-css-snippet')).toHaveTextContent('.tiptap-note-body { font-size: 15px; }')
    expect(document.querySelector('[data-notes-vault-scope="true"]')).toHaveAttribute('data-notes-appearance', 'light')
    expect(screen.getByTestId('notes-topbar')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /CSS snippet/i })).not.toBeInTheDocument()
  })

  it('sets document properties from an in-app dialog without browser prompts', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'set document property' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Set document property/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    const dialog = screen.getByRole('form', { name: 'Set document property' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Property name' }), {
      target: { value: 'reviewers' },
    })
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Property type' }), {
      target: { value: 'list' },
    })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Property value' }), {
      target: { value: 'Ada, Ben' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Set document property' }))

    await waitFor(() => expect(mocks.updateNote).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'Homework/commands.md',
      content: expect.stringContaining('reviewers: Ada, Ben'),
    })))
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('removes document properties from an in-app dialog without browser prompts', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    mocks.notes = [
      note({
        content: ['---', 'status: draft', '---', '', '# commands'].join('\n'),
        properties: { status: 'draft' },
      }),
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'remove document property' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Remove document property/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    const dialog = screen.getByRole('form', { name: 'Remove document property' })
    expect(within(dialog).getByRole('combobox', { name: 'Property name' })).toHaveValue('status')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove document property' }))

    await waitFor(() => expect(mocks.updateNote).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'Homework/commands.md',
      content: expect.not.stringContaining('status: draft'),
    })))
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('renames document properties from an in-app dialog without browser prompts', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    mocks.notes = [
      note({
        content: ['---', 'status: draft', '---', '', '# commands'].join('\n'),
        properties: { status: 'draft' },
      }),
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'rename document property' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Rename document property/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    const dialog = screen.getByRole('form', { name: 'Rename document property' })
    expect(within(dialog).getByRole('combobox', { name: 'Current property' })).toHaveValue('status')
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'New property name' }), {
      target: { value: 'review_status' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename document property' }))

    await waitFor(() => expect(mocks.updateNote).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'Homework/commands.md',
      content: expect.stringContaining('review_status: draft'),
    })))
    expect(mocks.updateNote.mock.calls.at(-1)?.[0].content).not.toMatch(/^status: draft$/m)
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('opens a searchable all-properties view without adding browser prompts', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    mocks.notes = [
      note({
        properties: { status: 'draft', owner: 'Ada' },
      }),
      note({
        _id: 'Homework/review.md',
        title: 'review',
        content: '# review',
        properties: { status: 'approved', reviewers: ['Ada', 'Ben'] },
      }),
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'all properties' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Open all properties/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    const dialog = screen.getByRole('dialog', { name: 'All properties' })
    expect(within(dialog).getByText('status')).toBeInTheDocument()
    expect(within(dialog).getByText('owner')).toBeInTheDocument()
    expect(within(dialog).getByText('reviewers')).toBeInTheDocument()

    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Filter properties' }), {
      target: { value: 'approved' },
    })

    expect(within(dialog).getByText('status')).toBeInTheDocument()
    expect(within(dialog).queryByText('owner')).not.toBeInTheDocument()
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('edits document properties from the all-properties view without browser prompts', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    mocks.notes = [
      note({
        properties: { status: 'draft' },
      }),
      note({
        _id: 'Homework/review.md',
        title: 'review',
        content: '# review',
        properties: { status: 'approved' },
      }),
    ]

    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getAllByText('commands')[0])
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'all properties' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Open all properties/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    const indexDialog = screen.getByRole('dialog', { name: 'All properties' })
    fireEvent.click(within(indexDialog).getByRole('button', { name: 'Edit status in review' }))

    const propertyDialog = screen.getByRole('form', { name: 'Set document property' })
    expect(within(propertyDialog).getByRole('textbox', { name: 'Property name' })).toHaveValue('status')
    expect(within(propertyDialog).getByRole('textbox', { name: 'Property value' })).toHaveValue('approved')
    fireEvent.change(within(propertyDialog).getByRole('textbox', { name: 'Property value' }), {
      target: { value: 'reviewed' },
    })
    fireEvent.click(within(propertyDialog).getByRole('button', { name: 'Set document property' }))

    await waitFor(() => expect(mocks.updateNote).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'Homework/review.md',
      content: expect.stringContaining('status: reviewed'),
    })))
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('opens workspace tools from keyboard shortcuts and the command palette', async () => {
    render(<Notes />)

    fireEvent.keyDown(window, { key: 'w', ctrlKey: true, altKey: true })
    expect(screen.getByRole('menu', { name: 'Workspace tools' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Workspace tools' })).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    expect(screen.getByRole('dialog', { name: 'Notes command palette' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes or run a command' }), {
      target: { value: 'workspace tools' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Open workspace tools/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notes command palette' })).not.toBeInTheDocument())
    expect(screen.getByRole('menu', { name: 'Workspace tools' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    fireEvent.click(screen.getByRole('button', { name: 'Workspace tools' }))
    expect(screen.getByRole('menu', { name: 'Workspace tools' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Open command palette' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: '/', ctrlKey: true })
    expect(screen.getByRole('dialog')).toHaveTextContent('Ctrl/Cmd+Alt+W')
    expect(screen.getByRole('dialog')).toHaveTextContent('Ctrl/Cmd+/')
    expect(screen.getByRole('dialog')).toHaveTextContent('Ctrl/Cmd+Alt+Left/Right')
    expect(screen.getByRole('dialog')).toHaveTextContent('Alt+Up/Down')
    expect(screen.getByRole('dialog')).toHaveTextContent('Ctrl/Cmd+Alt+\\')
    expect(screen.getByRole('dialog')).toHaveTextContent('Ctrl/Cmd+Alt+Shift+\\')
  })

  it('opens keyboard shortcuts from compact Note tools without adding a topbar button', () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 })

    try {
      render(<Notes />)

      fireEvent.click(screen.getByRole('button', { name: 'Note tools' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Keyboard shortcuts' }))

      expect(screen.queryByRole('menu', { name: 'Note tools' })).not.toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveTextContent('Ctrl/Cmd+/')
      expect(screen.queryByRole('button', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument()
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth })
      window.dispatchEvent(new Event('resize'))
    }
  })

  it('dismisses top bar menus with Escape and outside clicks', () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Notes view' }))
    expect(screen.getByRole('menu', { name: 'Notes view' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Notes view' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))
    expect(screen.getByRole('menu', { name: 'More note actions' })).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu', { name: 'More note actions' })).not.toBeInTheDocument()
  })

  it('opens top bar menus from the keyboard and focuses the active item', () => {
    render(<Notes />)

    fireEvent.keyDown(screen.getByRole('button', { name: 'Notes view' }), { key: 'ArrowDown' })

    expect(screen.getByRole('menu', { name: 'Notes view' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Graph' })).toHaveFocus()
  })

  it('opens top bar menus with ArrowUp and focuses the last item', () => {
    render(<Notes />)

    fireEvent.keyDown(screen.getByRole('button', { name: 'Notes view' }), { key: 'ArrowUp' })

    expect(screen.getByRole('menu', { name: 'Notes view' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Canvas' })).toHaveFocus()
  })

  it('returns focus to the top bar menu trigger when Escape closes the menu', async () => {
    render(<Notes />)

    const trigger = screen.getByRole('button', { name: 'Notes view' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Graph' })).toHaveFocus()

    fireEvent.keyDown(screen.getByRole('menu', { name: 'Notes view' }), { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Notes view' })).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('positions topbar menus inside the viewport instead of anchoring them over the editor', async () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }))
    const menu = screen.getByRole('menu', { name: 'More note actions' })

    await waitFor(() => expect(menu).toHaveStyle({ position: 'fixed' }))
    expect(screen.getByTestId('notes-topbar')).not.toContainElement(menu)
    expect(menu.style.maxWidth).toContain('100vw')
    expect(Number.parseFloat(menu.style.left)).toBeGreaterThanOrEqual(8)
  })

  it('returns focus to the top bar menu trigger after selecting a menu item', async () => {
    render(<Notes />)

    const trigger = screen.getByRole('button', { name: 'Notes view' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Data' }))

    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Notes view' })).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(trigger).toHaveTextContent('')
  })

  it('moves focus through top bar menu items with arrow, Home, and End keys', () => {
    render(<Notes />)

    fireEvent.keyDown(screen.getByRole('button', { name: 'Notes view' }), { key: 'ArrowDown' })
    const menu = screen.getByRole('menu', { name: 'Notes view' })

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Data' })).toHaveFocus()

    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(screen.getByRole('menuitem', { name: 'Graph' })).toHaveFocus()

    fireEvent.keyDown(menu, { key: 'End' })
    expect(screen.getByRole('menuitem', { name: 'Canvas' })).toHaveFocus()

    fireEvent.keyDown(menu, { key: 'Home' })
    expect(screen.getByRole('menuitem', { name: 'Editor' })).toHaveFocus()
  })
})
