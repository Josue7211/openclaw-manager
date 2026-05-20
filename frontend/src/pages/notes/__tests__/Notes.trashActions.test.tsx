import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Notes from '../Notes'
import type { VaultNote } from '../types'

const mocks = vi.hoisted(() => ({
  trashNote: vi.fn(() => Promise.resolve()),
  refresh: vi.fn(() => Promise.resolve()),
  updateNote: vi.fn((note: VaultNote) => Promise.resolve(note)),
  createNoteVersionCheckpoint: vi.fn(() => Promise.resolve(null)),
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

vi.mock('@/hooks/notes/useVault', () => ({
  useVault: () => ({
    notes: [note()],
    folders: [],
    loading: false,
    syncing: false,
    error: null,
    refresh: mocks.refresh,
    createNote: vi.fn(),
    createFolder: vi.fn(),
    updateNote: mocks.updateNote,
    moveNote: vi.fn(),
    deleteNote: vi.fn(),
    trashNote: mocks.trashNote,
    trashFolder: vi.fn(),
    restoreTrashedNote: vi.fn(),
    restoreTrashedFolder: vi.fn(),
    emptyTrash: vi.fn(),
    deleteFolder: vi.fn(),
  }),
}))

vi.mock('@/lib/vault', () => ({
  applyNoteSuggestion: vi.fn(() => Promise.resolve(null)),
  approveVaultCollaborationPairing: vi.fn(() => Promise.resolve(null)),
  createNoteComment: vi.fn(() => Promise.resolve(null)),
  createNoteCommentReply: vi.fn(() => Promise.resolve(null)),
  createNoteSuggestion: vi.fn(() => Promise.resolve(null)),
  createNoteVersionCheckpoint: mocks.createNoteVersionCheckpoint,
  createVaultCollaborationHttpTransport: vi.fn(() => null),
  discardLocalDraft: vi.fn(),
  exportEncryptedVault: vi.fn(() => Promise.resolve(null)),
  getNoteComments: vi.fn(() => Promise.resolve([])),
  getNoteRevision: vi.fn(() => Promise.resolve(null)),
  getNoteRevisions: vi.fn(() => Promise.resolve([])),
  getNoteSuggestions: vi.fn(() => Promise.resolve([])),
  getRecoverableDrafts: vi.fn(() => []),
  getVaultAuditEvents: vi.fn(() => Promise.resolve([])),
  getVaultCollaborationCrdtState: vi.fn(() => Promise.resolve(null)),
  getVaultCollaborationPairings: vi.fn(() => Promise.resolve([])),
  getVaultStatus: vi.fn(() => Promise.resolve(null)),
  getVaultSyncLedger: vi.fn(() => Promise.resolve(null)),
  importEncryptedVault: vi.fn(() => Promise.resolve(null)),
  labelNoteRevision: vi.fn(() => Promise.resolve(null)),
  linkFirstPlainMention: vi.fn((content: string) => content),
  listVaultCollaborationEvents: vi.fn(() => Promise.resolve([])),
  noteIdFromTitle: vi.fn((title: string) => title.toLowerCase().replaceAll(' ', '-')),
  normalizeFolderPath: vi.fn((path: string | null | undefined) => path?.trim() ?? ''),
  publishVaultCollaborationEvent: vi.fn(() => Promise.resolve(null)),
  rejectNoteSuggestion: vi.fn(() => Promise.resolve(null)),
  resolveNoteComment: vi.fn(() => Promise.resolve(null)),
  restoreLocalDraft: vi.fn(() => null),
  restoreNoteRevision: vi.fn(() => Promise.resolve(null)),
  rewriteWikilinkPath: vi.fn((content: string) => content),
  rewriteWikilinks: vi.fn((content: string) => content),
  revokeVaultCollaborationPairing: vi.fn(() => Promise.resolve(null)),
  saveLocalDraft: vi.fn(),
  saveVaultCollaborationCrdtState: vi.fn(() => Promise.resolve(null)),
  searchVaultNotes: vi.fn(() => Promise.resolve([])),
  testVaultCollaborationRemoteProvider: vi.fn(() => Promise.resolve(null)),
  uploadAttachment: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@/lib/api', () => ({
  getRemoteApiKey: vi.fn(() => null),
  getRequestApiKeyForPath: vi.fn(() => null),
  getRequestBaseForPath: vi.fn(() => ''),
}))

vi.mock('@/lib/vaultArchive', () => ({ verifyMarkdownVaultArchive: vi.fn(() => ({ ok: true, errors: [] })) }))
vi.mock('@/lib/vaultBackup', () => ({ verifyEncryptedVaultBackup: vi.fn(() => ({ ok: true, errors: [] })) }))

vi.mock('../NoteEditor', () => ({ default: () => <div data-testid="note-editor" /> }))
vi.mock('../BacklinksPanel', () => ({ default: () => <div data-testid="backlinks-panel" /> }))
vi.mock('../export', () => ({
  downloadDocx: vi.fn(),
  downloadHtml: vi.fn(),
  downloadMarkdown: vi.fn(),
  downloadReviewPackage: vi.fn(),
  printNotePdf: vi.fn(),
}))
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
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('routes the selected note Trash button through the safe trash flow', async () => {
    render(<Notes />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Homework' }))
    fireEvent.click(screen.getByText('commands'))
    fireEvent.click(screen.getByRole('button', { name: 'Move note to Trash' }))

    await waitFor(() => expect(mocks.trashNote).toHaveBeenCalledWith('Homework/commands.md'))
    expect(mocks.createNoteVersionCheckpoint).toHaveBeenCalledWith('Homework/commands.md', 'Before moving to Trash')
    expect(mocks.refresh).toHaveBeenCalled()
  }, 45_000)
})
