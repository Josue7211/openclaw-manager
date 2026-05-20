import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  lazy,
  Suspense,
  type ElementType,
  type ReactNode,
} from 'react'
import {
  Trash,
  ShareNetwork,
  PenNib,
  Cloud,
  CloudSlash,
  GitBranch,
  MagnifyingGlass,
  NotePencil,
  FolderPlus,
  Star,
  UploadSimple,
  Copy,
  FileDoc,
  FileHtml,
  FilePdf,
  FileText,
  ArrowCounterClockwise,
  ChatCircleText,
  ShieldCheck,
  Table,
  SquaresFour,
  ListBullets,
} from '@phosphor-icons/react'
import { useVault } from '@/hooks/notes/useVault'
import {
  applyNoteSuggestion,
  approveVaultCollaborationPairing,
  createNoteComment,
  createNoteCommentReply,
  createNoteSuggestion,
  createNoteVersionCheckpoint,
  discardLocalDraft,
  exportEncryptedVault,
  getNoteComments,
  getNoteRevision,
  getNoteRevisions,
  getNoteSuggestions,
  getRecoverableDrafts,
  getVaultAuditEvents,
  getVaultCollaborationCrdtState,
  getVaultCollaborationPairings,
  getVaultStatus,
  getVaultSyncLedger,
  importEncryptedVault,
  labelNoteRevision,
  linkFirstPlainMention,
  listVaultCollaborationEvents,
  noteIdFromTitle,
  normalizeFolderPath,
  publishVaultCollaborationEvent,
  createVaultCollaborationHttpTransport,
  rejectNoteSuggestion,
  resolveNoteComment,
  restoreLocalDraft,
  restoreNoteRevision,
  rewriteWikilinkPath,
  rewriteWikilinks,
  saveVaultCollaborationCrdtState,
  saveLocalDraft,
  searchVaultNotes,
  testVaultCollaborationRemoteProvider,
  revokeVaultCollaborationPairing,
  uploadAttachment,
} from '@/lib/vault'
import type {
  VaultAuditEvent,
  VaultCollaborationPairing,
  VaultCollaborationProviderHealth,
  VaultComment,
  VaultRecoverableDraft,
  VaultRevision,
  VaultRevisionDetail,
  VaultStatus,
  VaultSuggestion,
  VaultSyncLedger,
} from '@/lib/vault'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
import { getRemoteApiKey, getRequestApiKeyForPath, getRequestBaseForPath } from '@/lib/api'
import { verifyMarkdownVaultArchive } from '@/lib/vaultArchive'
import { verifyEncryptedVaultBackup } from '@/lib/vaultBackup'
import FileTree from './FileTree'
import NoteEditor from './NoteEditor'
import BacklinksPanel from './BacklinksPanel'
import { NOTE_TEMPLATES, VAULT_TEMPLATES_FOLDER, applyTemplate, vaultTemplatesFromNotes } from '@/features/notes/templates'
import {
  downloadDocx,
  downloadHtml,
  downloadMarkdown,
  downloadReviewPackage,
  printNotePdf,
  type ReviewPackagePermission,
} from '@/features/notes/export'
import { noteSearchText } from '@/features/notes/searchFilters'
import { setTaskLineDone, type VaultTaskRow } from '@/features/notes/dataMode'
import { VaultDataView } from '@/features/notes/VaultDataView'
import { buildClipNote, readClipboardClipInput } from './clipper'
import {
  autoMergeLocalCollabOperation,
  createLayeredLocalCollabTransport,
  mergeLocalCollabDraft,
  summarizeLocalCollabProviderStatuses,
  useLocalNoteCollaboration,
  type LocalCollabDraft,
  type LocalCollabTransportProvider,
  type LocalCollabTransportStatus,
} from '@/features/notes/collaboration'
import {
  buildInitialCanvasData,
  CANVAS_FOLDER,
  CANVAS_TITLE,
  isCanvasBoardNote,
  serializeCanvasNote,
} from './canvasData'
import { upsertMarkdownTableOfContents } from './markdownBridge'
import { removeDocumentProperty, upsertDocumentProperty } from './documentProperties'
import { DocumentInfoPanel } from '@/features/notes/DocumentInfoPanel'
import { groupedNotesShortcuts } from './notesShortcuts'
import {
  DEFAULT_NOTES_EDITOR_PREFERENCES,
  createNotesRemoteCollaborationPairingInvite,
  isNotesRemoteCollaborationPairingKey,
  isNotesRemoteCollaborationBaseUrl,
  notesRemoteCollaborationSetupStatus,
  normalizeNotesEditorPreferences,
  parseNotesRemoteCollaborationPairingInvite,
  type NotesEditorPreferences,
} from './notesPreferences'
import { folderAncestors, planMarkdownVaultImport, rewriteImportedAttachmentEmbeds } from './vaultImport'
import {
  VERSION_RESTORE_SAFETY_NOTE,
  buildVersionDiff,
  restoreRevisionConfirmMessage,
  summarizeVersionDiff,
} from './versionDiff'
import { applySuggestionPatch } from './suggestions'
import { isNoteInTrash, isNotesTrashPath, noteFolderPath } from '@/features/notes/trash'
import {
  buildVaultPluginWriteRecords,
  buildVaultPluginCommandContributions,
  buildVaultPluginTrustedPublishers,
  fetchVaultPluginMarketplaceFeed,
  installedVaultPlugins,
  planVaultPluginWriteApply,
  removeAppliedVaultPluginWriteBlocks,
  vaultPluginMarketplacePackagesMarkdown,
} from '@/features/notes/vaultPlugins'
import type { NoteReviewMarker, NoteSelectionAnchor, VaultNote } from '@/features/notes/types'

const GraphView = lazy(() => import('./GraphView'))
const CanvasView = lazy(() => import('./CanvasView'))

type ViewMode = 'editor' | 'graph' | 'data' | 'canvas'
type SaveState = 'saved' | 'unsaved' | 'saving' | 'error'

const SAVE_DEBOUNCE_MS = 700
function isInsideFolder(folder: string, path: string): boolean {
  return folder === path || folder.startsWith(`${path}/`)
}

function isNoteInsideFolder(note: VaultNote, path: string): boolean {
  return isInsideFolder(noteFolderPath(note), path)
}

function applyPathRewrites(content: string, rewrites: Array<[string, string]>): string {
  return rewrites.reduce((next, [fromId, toId]) => rewriteWikilinkPath(next, fromId, toId), content)
}

function documentAnchor(): NoteSelectionAnchor {
  return { scope: 'document' }
}

function usableSelectionAnchor(anchor: NoteSelectionAnchor | null): NoteSelectionAnchor {
  if (!anchor || anchor.scope !== 'selection' || !anchor.quote?.trim()) return documentAnchor()
  return anchor
}

function usableSuggestionAnchor(anchor: NoteSelectionAnchor | null): NoteSelectionAnchor {
  if (anchor?.scope === 'selection' && anchor.quote?.trim()) return anchor
  if (anchor?.scope === 'cursor' && typeof anchor.start === 'number') return anchor
  return documentAnchor()
}

interface SuggestionDiffLine {
  kind: 'same' | 'removed' | 'added'
  text: string
}

function suggestionDiff(before: string, after: string): SuggestionDiffLine[] {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  if (before === after) return beforeLines.slice(0, 12).map(text => ({ kind: 'same', text }))
  return [
    ...beforeLines.slice(0, 8).map(text => ({ kind: 'removed' as const, text })),
    ...afterLines.slice(0, 8).map(text => ({ kind: 'added' as const, text })),
  ].slice(0, 16)
}

interface CommandAction {
  id: string
  label: string
  detail?: string
  icon: ElementType
  onRun: () => void
}

export default function NotesPage() {
  const {
    notes,
    folders,
    loading,
    syncing,
    error,
    refresh,
    createNote,
    createFolder,
    updateNote,
    moveNote,
    deleteNote,
    trashNote,
    trashFolder,
    restoreTrashedNote,
    restoreTrashedFolder,
    emptyTrash,
    deleteFolder,
  } = useVault()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('graph')
  const [searchQuery, setSearchQuery] = useState('')
  const [treeWidth, setTreeWidth] = useState(220)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [focusMode, setFocusMode] = useLocalStorageState('mc-notes-focus-mode', false)
  const [infoPanelOpen, setInfoPanelOpen] = useLocalStorageState('mc-notes-info-panel-open', false)
  const [editorPreferences, setEditorPreferences] = useLocalStorageState<NotesEditorPreferences>(
    'mc-notes-editor-preferences',
    DEFAULT_NOTES_EDITOR_PREFERENCES,
  )
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [pinnedNoteIds, setPinnedNoteIds] = useLocalStorageState<string[]>('mc-pinned-note-ids', [])
  const [recentNoteIds, setRecentNoteIds] = useLocalStorageState<string[]>('mc-recent-note-ids', [])
  const [recentLimit, setRecentLimit] = useLocalStorageState('mc-notes-recent-limit', 5)
  const titleRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const encryptedBackupInputRef = useRef<HTMLInputElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingContentRef = useRef<Map<string, string>>(new Map())
  const notesRef = useRef(notes)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRevisions, setHistoryRevisions] = useState<VaultRevision[]>([])
  const [historyPreview, setHistoryPreview] = useState<VaultRevisionDetail | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [searchResultNotes, setSearchResultNotes] = useState<typeof notes | null>(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState<string | null>(null)
  const [noteComments, setNoteComments] = useState<VaultComment[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null)
  const [noteSuggestions, setNoteSuggestions] = useState<VaultSuggestion[]>([])
  const [selectionAnchor, setSelectionAnchor] = useState<NoteSelectionAnchor | null>(null)
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null)
  const [vaultStatusOpen, setVaultStatusOpen] = useState(false)
  const [vaultStatusLoading, setVaultStatusLoading] = useState(false)
  const [vaultStatusError, setVaultStatusError] = useState<string | null>(null)
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null)
  const [vaultAuditEvents, setVaultAuditEvents] = useState<VaultAuditEvent[]>([])
  const [vaultSyncLedger, setVaultSyncLedger] = useState<VaultSyncLedger | null>(null)
  const [draftRecoveryOpen, setDraftRecoveryOpen] = useState(false)
  const [recoverableDrafts, setRecoverableDrafts] = useState<VaultRecoverableDraft[]>([])
  const [collabReviewOpen, setCollabReviewOpen] = useState(false)

  const selected = notes.find(n => n._id === selectedId) ?? null
  const normalizedEditorPreferences = useMemo(
    () => normalizeNotesEditorPreferences(editorPreferences),
    [editorPreferences],
  )
  const localCollabTransport = useMemo(
    () => {
      const providers: LocalCollabTransportProvider[] = [
        {
          id: 'local-sqlite',
          transport: {
            publish: publishVaultCollaborationEvent,
            list: listVaultCollaborationEvents,
            getCrdtState: getVaultCollaborationCrdtState,
            saveCrdtState: saveVaultCollaborationCrdtState,
          },
        },
      ]
      const remoteBaseUrl = normalizedEditorPreferences.remoteCollaborationBaseUrl
      const pairingKey = normalizedEditorPreferences.remoteCollaborationPairingKey
      if (
        normalizedEditorPreferences.remoteCollaborationEnabled &&
        isNotesRemoteCollaborationBaseUrl(remoteBaseUrl) &&
        isNotesRemoteCollaborationPairingKey(pairingKey)
      ) {
        providers.push({
          id: 'remote-http',
          transport: createVaultCollaborationHttpTransport({
            baseUrl: remoteBaseUrl,
            apiKey: getRemoteApiKey(),
            pairingKey,
            timeoutMs: 10_000,
          }),
        })
      }
      return createLayeredLocalCollabTransport(providers)
    },
    [
      normalizedEditorPreferences.remoteCollaborationBaseUrl,
      normalizedEditorPreferences.remoteCollaborationEnabled,
      normalizedEditorPreferences.remoteCollaborationPairingKey,
    ],
  )
  const [localCollabProviderStatuses, setLocalCollabProviderStatuses] = useState<LocalCollabTransportStatus[]>(() =>
    localCollabTransport.status(),
  )
  useEffect(() => {
    setLocalCollabProviderStatuses(localCollabTransport.status())
    const timer = window.setInterval(() => {
      setLocalCollabProviderStatuses(localCollabTransport.status())
    }, 2_000)
    return () => window.clearInterval(timer)
  }, [localCollabTransport])
  const localCollabProviderSummary = useMemo(
    () => summarizeLocalCollabProviderStatuses(localCollabProviderStatuses),
    [localCollabProviderStatuses],
  )
  const {
    supported: localCollabSupported,
    peers: localCollabPeers,
    drafts: localCollabDrafts,
    syncing: localCollabSyncing,
    lastSyncedAt: localCollabLastSyncedAt,
    lastSyncError: localCollabLastSyncError,
    syncNow: syncLocalCollabNow,
    broadcastOperation: broadcastLocalOperation,
    broadcastCursor: broadcastLocalCursor,
    dismissDraft: dismissLocalCollabDraft,
  } = useLocalNoteCollaboration(selected?.type === 'note' ? selected._id : null, 'Local editor', localCollabTransport)
  const vaultTemplates = useMemo(() => vaultTemplatesFromNotes(notes), [notes])
  const vaultPlugins = useMemo(() => installedVaultPlugins(notes), [notes])
  const vaultPluginCommands = useMemo(() => buildVaultPluginCommandContributions(notes), [notes])
  const pinnedNoteSet = useMemo(() => new Set(pinnedNoteIds), [pinnedNoteIds])
  const canvasBoardNote = useMemo(
    () => notes.find(note => note.type === 'note' && isCanvasBoardNote(note)) ?? null,
    [notes],
  )
  const reviewMarkers = useMemo<NoteReviewMarker[]>(() => {
    if (!selected || selected.type === 'attachment') return []
    return [
      ...noteComments
        .filter(comment => !comment.resolved_at && comment.status !== 'resolved')
        .map(comment => ({
          id: comment.id,
          kind: 'comment' as const,
          status: comment.status,
          anchor: comment.anchor,
        })),
      ...noteSuggestions
        .filter(suggestion => suggestion.status === 'open')
        .map(suggestion => ({
          id: suggestion.id,
          kind: 'suggestion' as const,
          status: suggestion.status,
          anchor: suggestion.anchor,
        })),
    ]
  }, [noteComments, noteSuggestions, selected])

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  useEffect(() => {
    setSelectionAnchor(null)
    setActiveReviewId(null)
  }, [selectedId])

  useEffect(() => {
    if (!selectedId || selected?.type === 'attachment') {
      setNoteComments([])
      setNoteSuggestions([])
      return
    }
    let cancelled = false
    Promise.allSettled([getNoteComments(selectedId), getNoteSuggestions(selectedId)]).then(
      ([commentsResult, suggestionsResult]) => {
        if (cancelled) return
        setNoteComments(commentsResult.status === 'fulfilled' ? commentsResult.value : [])
        setNoteSuggestions(suggestionsResult.status === 'fulfilled' ? suggestionsResult.value : [])
      },
    )
    return () => {
      cancelled = true
    }
  }, [selectedId, selected?.type])

  useEffect(() => {
    const query = searchQuery.trim()
    if (!query) {
      setSearchResultNotes(null)
      return
    }
    const backendQuery = noteSearchText(query)
    if (!backendQuery) {
      setSearchResultNotes(null)
      return
    }

    let cancelled = false
    const timer = setTimeout(() => {
      searchVaultNotes(backendQuery)
        .then(results => {
          if (!cancelled) setSearchResultNotes(results)
        })
        .catch(err => {
          console.warn('[notes] local vault search failed, using in-memory search:', err)
          if (!cancelled) setSearchResultNotes(null)
        })
    }, 160)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchQuery])

  const fileTreeNotes = searchResultNotes ?? notes
  const searchUsesBackend = searchResultNotes !== null

  const allNoteTitles = useMemo(
    () => notes.filter(n => n.type === 'note').flatMap(n => [n.title, ...(n.aliases ?? [])]),
    [notes],
  )

  const normalizedRecentLimit = Math.max(1, Math.min(10, Number(recentLimit) || 5))

  const flushPendingSave = useCallback(
    async (id?: string) => {
      const pending = id ? pendingContentRef.current.get(id) : undefined
      const entries: Array<[string, string]> = id
        ? pending === undefined
          ? []
          : [[id, pending]]
        : [...pendingContentRef.current.entries()]

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      if (entries.length === 0) return

      setSaveState('saving')
      try {
        for (const [noteId, content] of entries) {
          const note = notesRef.current.find(item => item._id === noteId)
          if (!note || note.type === 'attachment') continue
          const saved = await updateNote({ ...note, content })
          notesRef.current = notesRef.current.map(item => (item._id === saved._id ? saved : item))
          pendingContentRef.current.delete(noteId)
        }
        setLastSavedAt(Date.now())
        setSaveState(pendingContentRef.current.size ? 'unsaved' : 'saved')
      } catch (err) {
        console.error('[notes] autosave failed:', err)
        setSaveState('error')
      }
    },
    [updateNote],
  )

  useEffect(() => {
    const onBeforeUnload = () => {
      void flushPendingSave()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      void flushPendingSave()
    }
  }, [flushPendingSave])

  useEffect(() => {
    if (!selectedId) return
    setRecentNoteIds(prev => [selectedId, ...prev.filter(id => id !== selectedId)].slice(0, 24))
  }, [selectedId, setRecentNoteIds])

  useEffect(() => {
    if (!editingTitle) setTitleDraft(selected?.title ?? '')
  }, [editingTitle, selected?.title])

  const handleCreate = useCallback(
    async (folder?: string, title = 'Untitled', content = '') => {
      const note = await createNote(title, folder, content)
      setSelectedId(note._id)
      setViewMode('editor')
      setTitleDraft(note.title)
      setTimeout(() => {
        setEditingTitle(true)
        titleRef.current?.select()
      }, 50)
    },
    [createNote],
  )

  const handleCreateDailyNote = useCallback(
    async (folder?: string) => {
      const daily = NOTE_TEMPLATES.find(template => template.id === 'daily')
      const iso = new Date().toISOString().slice(0, 10)
      await handleCreate(folder, `Daily ${iso}`, daily ? applyTemplate(daily) : `# ${iso}\n\n`)
    },
    [handleCreate],
  )

  const handleCreateTemplate = useCallback(
    async (folder: string | undefined, templateId: string) => {
      const template = [...NOTE_TEMPLATES, ...vaultTemplates].find(item => item.id === templateId)
      if (!template) return
      const title =
        template.id === 'meeting' ? 'Meeting Note' : template.id === 'project' ? 'Project Brief' : template.label
      await handleCreate(folder, title, applyTemplate(template))
    },
    [handleCreate, vaultTemplates],
  )

  const handleSaveCurrentAsTemplate = useCallback(async () => {
    if (!selected || selected.type === 'attachment') return
    const title = window.prompt('Template name', selected.title ? `${selected.title} Template` : 'New Template')
    if (!title) return
    const content = pendingContentRef.current.get(selected._id) ?? selected.content
    await flushPendingSave(selected._id)
    await createFolder(VAULT_TEMPLATES_FOLDER)
    const template = await createNote(
      title,
      VAULT_TEMPLATES_FOLDER,
      `---\ntemplate: true\n---\n\n${content.replace(/^---[\s\S]*?\n---\s*/, '')}`,
    )
    setSelectedId(template._id)
    setViewMode('editor')
    await refresh()
  }, [createFolder, createNote, flushPendingSave, refresh, selected])

  const handleCreateFolder = useCallback(
    async (parent?: string) => {
      const name = window.prompt(parent ? `New folder in ${parent}` : 'New folder')
      if (!name) return
      const nextPath = normalizeFolderPath(parent ? `${parent}/${name}` : name)
      if (!nextPath) return
      await createFolder(nextPath)
    },
    [createFolder],
  )

  const createSafetyCheckpoints = useCallback(
    async (ids: string[], label: string) => {
      const uniqueIds = [...new Set(ids)]
      for (const id of uniqueIds) {
        const note = notesRef.current.find(item => item._id === id)
        if (!note || note.type !== 'note') continue
        try {
          await flushPendingSave(id)
          await createNoteVersionCheckpoint(id, label)
        } catch (err) {
          console.warn('[notes] safety checkpoint failed:', err)
        }
      }
    },
    [flushPendingSave],
  )

  const handleDeleteNote = useCallback(
    async (id?: string) => {
      const targetId = id ?? selectedId
      if (!targetId) return
      const note = notes.find(n => n._id === targetId)
      if (!note) return
      const label = note?.title || targetId
      const permanent = isNoteInTrash(note)
      const action = permanent ? 'Permanently delete' : 'Move to Trash'
      if (!window.confirm(`${action} "${label}"?`)) return

      setSearchResultNotes(null)
      const idx = notes.findIndex(n => n._id === targetId)
      const next =
        notes.slice(idx + 1).find(item => item._id !== targetId && !isNoteInTrash(item)) ??
        notes
          .slice(0, idx)
          .reverse()
          .find(item => item._id !== targetId && !isNoteInTrash(item)) ??
        null
      if (selectedId === targetId) setSelectedId(next?._id ?? null)
      setPinnedNoteIds(prev => prev.filter(noteId => noteId !== targetId))
      setRecentNoteIds(prev => prev.filter(noteId => noteId !== targetId))

      try {
        await flushPendingSave(targetId)
        await createSafetyCheckpoints([targetId], permanent ? 'Before permanent delete' : 'Before moving to Trash')
        if (permanent) {
          await deleteNote(targetId)
        } else {
          await trashNote(targetId)
        }
        await refresh()
      } catch (err) {
        window.alert(err instanceof Error ? err.message : `${action} failed`)
        await refresh()
      }
    },
    [
      createSafetyCheckpoints,
      deleteNote,
      flushPendingSave,
      notes,
      refresh,
      selectedId,
      setPinnedNoteIds,
      setRecentNoteIds,
      trashNote,
    ],
  )

  const handleRestoreFromTrash = useCallback(async () => {
    if (!selected || !isNoteInTrash(selected)) return
    setSearchResultNotes(null)
    const restored = await restoreTrashedNote(selected._id)
    setSelectedId(restored._id)
    setViewMode('editor')
    await refresh()
  }, [refresh, restoreTrashedNote, selected])

  const handleEmptyTrash = useCallback(async () => {
    const trashed = notes.filter(isNoteInTrash)
    const trashedFolders = folders.filter(folder => isNotesTrashPath(folder.path))
    if (trashed.length === 0 && trashedFolders.length === 0) {
      window.alert('Trash is already empty.')
      return
    }
    if (
      !window.confirm(
        `Permanently delete ${trashed.length} trashed note${trashed.length === 1 ? '' : 's'} and ${trashedFolders.length} folder${trashedFolders.length === 1 ? '' : 's'}? This cannot be undone.`,
      )
    )
      return
    setSearchResultNotes(null)
    await flushPendingSave()
    await createSafetyCheckpoints(
      trashed.map(note => note._id),
      'Before emptying Trash',
    )
    await emptyTrash()
    if (selectedId && trashed.some(note => note._id === selectedId)) {
      setSelectedId(null)
    }
    setPinnedNoteIds(prev => prev.filter(id => !trashed.some(note => note._id === id)))
    setRecentNoteIds(prev => prev.filter(id => !trashed.some(note => note._id === id)))
    await refresh()
  }, [
    createSafetyCheckpoints,
    emptyTrash,
    flushPendingSave,
    folders,
    notes,
    refresh,
    selectedId,
    setPinnedNoteIds,
    setRecentNoteIds,
  ])

  const handleOpenVaultStatus = useCallback(async () => {
    setVaultStatusOpen(true)
    setVaultStatusLoading(true)
    setVaultStatusError(null)
    try {
      const [status, auditEvents, syncLedger] = await Promise.all([
        getVaultStatus(),
        getVaultAuditEvents(12),
        getVaultSyncLedger(12),
      ])
      setVaultStatus(status)
      setVaultAuditEvents(auditEvents)
      setVaultSyncLedger(syncLedger)
    } catch (err) {
      setVaultStatus(null)
      setVaultAuditEvents([])
      setVaultSyncLedger(null)
      setVaultStatusError(err instanceof Error ? err.message : 'Could not load vault status')
    } finally {
      setVaultStatusLoading(false)
    }
  }, [])

  const loadRecoverableDrafts = useCallback(() => {
    setRecoverableDrafts(getRecoverableDrafts())
  }, [])

  const handleOpenDraftRecovery = useCallback(() => {
    loadRecoverableDrafts()
    setDraftRecoveryOpen(true)
  }, [loadRecoverableDrafts])

  const handleManualSaveCheckpoint = useCallback(async () => {
    if (!selectedId) return
    const note = notesRef.current.find(item => item._id === selectedId)
    if (!note || note.type !== 'note') return
    const hadPendingChange = pendingContentRef.current.has(selectedId)
    await flushPendingSave(selectedId)
    if (!hadPendingChange) return
    try {
      await createNoteVersionCheckpoint(selectedId, 'Manual save')
      setLastSavedAt(Date.now())
      setSaveState(pendingContentRef.current.size ? 'unsaved' : 'saved')
    } catch (err) {
      console.warn('[notes] manual save checkpoint failed:', err)
      setSaveState('error')
    }
  }, [flushPendingSave, selectedId])

  const handleRestoreDraft = useCallback(
    async (id: string) => {
      const restored = await restoreLocalDraft(id)
      setSelectedId(restored._id)
      setViewMode('editor')
      await refresh()
      loadRecoverableDrafts()
    },
    [loadRecoverableDrafts, refresh],
  )

  const handleDiscardDraft = useCallback(
    async (id: string) => {
      discardLocalDraft(id)
      await refresh()
      loadRecoverableDrafts()
    },
    [loadRecoverableDrafts, refresh],
  )

  const handleDeleteFolder = useCallback(
    async (path: string) => {
      if (!path) return
      const affectedNotes = notes.filter(note => note.type === 'note' && isNoteInsideFolder(note, path))
      const affectedFolders = folders
        .filter(folder => isInsideFolder(folder.path, path))
        .sort((a, b) => b.path.length - a.path.length)
      const permanent = isNotesTrashPath(path)
      const action = permanent ? 'Permanently delete' : 'Move to Trash'
      if (
        !window.confirm(
          `${action} folder "${path}" and ${affectedNotes.length} note${affectedNotes.length === 1 ? '' : 's'}?`,
        )
      )
        return

      setSearchResultNotes(null)
      await flushPendingSave()
      await createSafetyCheckpoints(
        affectedNotes.map(note => note._id),
        permanent ? 'Before permanent folder delete' : 'Before moving folder to Trash',
      )

      if (permanent) {
        for (const note of affectedNotes) {
          await deleteNote(note._id)
        }
        for (const folder of affectedFolders) {
          await deleteFolder(folder.path)
        }
        if (affectedFolders.length === 0) {
          await deleteFolder(path)
        }
      } else {
        await trashFolder(path)
      }

      if (selectedId && affectedNotes.some(note => note._id === selectedId)) {
        setSelectedId(null)
      }
      await refresh()
    },
    [
      createSafetyCheckpoints,
      deleteFolder,
      deleteNote,
      flushPendingSave,
      folders,
      notes,
      refresh,
      selectedId,
      trashFolder,
    ],
  )

  const handleRestoreFolder = useCallback(
    async (path: string) => {
      if (!isNotesTrashPath(path)) return
      const affectedNotes = notes.filter(note => note.type === 'note' && isNoteInsideFolder(note, path))
      if (
        !window.confirm(
          `Restore folder "${path}" and ${affectedNotes.length} note${affectedNotes.length === 1 ? '' : 's'}?`,
        )
      )
        return
      setSearchResultNotes(null)
      await restoreTrashedFolder(path)
      await refresh()
    },
    [notes, refresh, restoreTrashedFolder],
  )

  const handleRenameFolder = useCallback(
    async (path: string) => {
      if (!path) return
      const raw = window.prompt('Rename folder', path)
      if (!raw) return
      const nextPath = normalizeFolderPath(raw)
      if (!nextPath || nextPath === path) return
      if (nextPath.startsWith(`${path}/`)) {
        window.alert('Folder cannot be renamed inside itself.')
        return
      }
      setSearchResultNotes(null)

      const affectedFolders = folders
        .filter(folder => folder.path === path || folder.path.startsWith(`${path}/`))
        .sort((a, b) => a.path.length - b.path.length)
      const affectedNotes = notes.filter(note => isNoteInsideFolder(note, path))
      const movedByOldId = new Map<string, (typeof affectedNotes)[number]>()
      const rewrites: Array<[string, string]> = []
      await createSafetyCheckpoints(
        affectedNotes.map(note => note._id),
        'Before folder rename',
      )

      for (const folder of affectedFolders) {
        const suffix = folder.path === path ? '' : folder.path.slice(path.length)
        await createFolder(`${nextPath}${suffix}`)
      }

      for (const note of affectedNotes) {
        const currentFolder = noteFolderPath(note)
        const suffix = currentFolder === path ? '' : currentFolder.slice(path.length)
        const moved = await moveNote(note._id, `${nextPath}${suffix}`)
        movedByOldId.set(note._id, moved)
        rewrites.push([note._id, moved._id])
        setPinnedNoteIds(prev => prev.map(noteId => (noteId === note._id ? moved._id : noteId)))
        setRecentNoteIds(prev => prev.map(noteId => (noteId === note._id ? moved._id : noteId)))
        if (selectedId === note._id) setSelectedId(moved._id)
      }

      for (const note of notes) {
        if (note.type !== 'note') continue
        const moved = movedByOldId.get(note._id)
        const target = moved ?? note
        const nextContent = applyPathRewrites(target.content, rewrites)
        if (nextContent !== target.content) {
          await updateNote({ ...target, content: nextContent })
        }
      }

      for (const folder of [...affectedFolders].sort((a, b) => b.path.length - a.path.length)) {
        await deleteFolder(folder.path)
      }
      await refresh()
    },
    [
      createFolder,
      createSafetyCheckpoints,
      deleteFolder,
      folders,
      moveNote,
      notes,
      refresh,
      selectedId,
      setPinnedNoteIds,
      setRecentNoteIds,
      updateNote,
    ],
  )

  const handleRenameNote = useCallback(
    (id: string) => {
      const note = notes.find(item => item._id === id)
      setSelectedId(id)
      setViewMode('editor')
      setTitleDraft(note?.title ?? '')
      setTimeout(() => {
        setEditingTitle(true)
        titleRef.current?.select()
      }, 50)
    },
    [notes],
  )

  const handleDuplicateNote = useCallback(
    async (id: string) => {
      const note = notes.find(n => n._id === id)
      if (!note || note.type === 'attachment') return
      const duplicate = await createNote(`${note.title || 'Untitled'} Copy`, note.folder, note.content)
      setSelectedId(duplicate._id)
      setViewMode('editor')
    },
    [createNote, notes],
  )

  const handleMoveNote = useCallback(
    async (id: string) => {
      const note = notes.find(n => n._id === id)
      if (!note || note.type === 'attachment') return
      const folderList = folders.map(folder => folder.path).join(', ')
      const raw = window.prompt(
        folderList
          ? `Move to folder. Leave blank for vault root.\nExisting folders: ${folderList}`
          : 'Move to folder. Leave blank for vault root.',
        note.folder,
      )
      if (raw === null) return
      setSearchResultNotes(null)
      await createSafetyCheckpoints([id], 'Before note move')
      const moved = await moveNote(id, normalizeFolderPath(raw))
      const rewrites: Array<[string, string]> = [[id, moved._id]]
      for (const candidate of notes) {
        if (candidate.type !== 'note') continue
        const target = candidate._id === id ? moved : candidate
        const nextContent = applyPathRewrites(target.content, rewrites)
        if (nextContent !== target.content) {
          await updateNote({ ...target, content: nextContent })
        }
      }
      setPinnedNoteIds(prev => prev.map(noteId => (noteId === id ? moved._id : noteId)))
      setRecentNoteIds(prev => prev.map(noteId => (noteId === id ? moved._id : noteId)))
      if (selectedId === id) setSelectedId(moved._id)
    },
    [createSafetyCheckpoints, folders, moveNote, notes, selectedId, setPinnedNoteIds, setRecentNoteIds, updateNote],
  )

  const handleMoveNoteToFolder = useCallback(
    async (id: string, folder: string) => {
      setSearchResultNotes(null)
      await createSafetyCheckpoints([id], 'Before note move')
      const moved = await moveNote(id, normalizeFolderPath(folder))
      const rewrites: Array<[string, string]> = [[id, moved._id]]
      for (const candidate of notes) {
        if (candidate.type !== 'note') continue
        const target = candidate._id === id ? moved : candidate
        const nextContent = applyPathRewrites(target.content, rewrites)
        if (nextContent !== target.content) {
          await updateNote({ ...target, content: nextContent })
        }
      }
      setPinnedNoteIds(prev => prev.map(noteId => (noteId === id ? moved._id : noteId)))
      setRecentNoteIds(prev => prev.map(noteId => (noteId === id ? moved._id : noteId)))
      if (selectedId === id) setSelectedId(moved._id)
    },
    [createSafetyCheckpoints, moveNote, notes, selectedId, setPinnedNoteIds, setRecentNoteIds, updateNote],
  )

  const handleRestoreNoteToFolder = useCallback(
    async (id: string, folder: string) => {
      setSearchResultNotes(null)
      const restored = await restoreTrashedNote(id, normalizeFolderPath(folder))
      if (selectedId === id) setSelectedId(restored._id)
      await refresh()
    },
    [refresh, restoreTrashedNote, selectedId],
  )

  const handleTogglePin = useCallback(
    (id: string) => {
      setPinnedNoteIds(prev => (prev.includes(id) ? prev.filter(noteId => noteId !== id) : [id, ...prev]))
    },
    [setPinnedNoteIds],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      const key = event.key.toLowerCase()

      if (key === '/') {
        event.preventDefault()
        setShortcutsOpen(open => !open)
        return
      }

      if ((key === 'p' && !event.altKey) || key === 'o') {
        event.preventDefault()
        setCommandOpen(true)
        setCommandQuery('')
        return
      }

      if (key === 's') {
        event.preventDefault()
        void handleManualSaveCheckpoint()
        return
      }

      if (key === 'n' && event.shiftKey) {
        event.preventDefault()
        void handleCreateFolder(selected?.folder)
        return
      }

      if (key === 'n') {
        event.preventDefault()
        void handleCreate(selected?.folder)
        return
      }

      if (key === 'd' && event.altKey) {
        event.preventDefault()
        void handleCreateDailyNote(selected?.folder)
        return
      }

      if (key === 'p' && event.altKey && selectedId) {
        event.preventDefault()
        handleTogglePin(selectedId)
        return
      }

      if (key === 'f' && event.shiftKey) {
        event.preventDefault()
        setFocusMode(prev => !prev)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    handleCreate,
    handleCreateDailyNote,
    handleCreateFolder,
    handleManualSaveCheckpoint,
    handleTogglePin,
    selected?.folder,
    selectedId,
    setFocusMode,
  ])

  const handleCopyMarkdown = useCallback(
    (id: string) => {
      const note = notes.find(n => n._id === id)
      if (!note || note.type === 'attachment') return
      void navigator.clipboard?.writeText(note.content)
    },
    [notes],
  )

  const handleExportMarkdown = useCallback(
    (id: string) => {
      const note = notes.find(n => n._id === id)
      if (!note || note.type === 'attachment') return
      downloadMarkdown(note)
    },
    [notes],
  )

  const handleExportDocx = useCallback(
    (id: string) => {
      const note = notes.find(n => n._id === id)
      if (!note || note.type === 'attachment') return
      void downloadDocx(note, { notes })
    },
    [notes],
  )

  const handleExportPdf = useCallback(
    (id: string) => {
      const note = notes.find(n => n._id === id)
      if (!note || note.type === 'attachment') return
      printNotePdf(note, { notes })
    },
    [notes],
  )

  const handleExportHtml = useCallback(
    (id: string) => {
      const note = notes.find(n => n._id === id)
      if (!note || note.type === 'attachment') return
      downloadHtml(note, { notes })
    },
    [notes],
  )

  const handleExportReviewPackage = useCallback(
    async (id: string) => {
      const note = notes.find(n => n._id === id)
      if (!note || note.type === 'attachment') return
      try {
        const rawPermission = (window.prompt('Offline share permission: view, comment, or suggest', 'suggest') || '')
          .trim()
          .toLowerCase()
        if (!rawPermission) return
        if (!['view', 'comment', 'suggest'].includes(rawPermission)) {
          window.alert('Choose view, comment, or suggest.')
          return
        }
        const recipient = window.prompt('Recipient label or email (optional)', '')?.trim() || undefined
        const [comments, suggestions] = await Promise.all([getNoteComments(note._id), getNoteSuggestions(note._id)])
        downloadReviewPackage(
          note,
          comments,
          suggestions,
          { notes },
          {
            permission: rawPermission as ReviewPackagePermission,
            recipient,
          },
        )
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Could not export private share package')
      }
    },
    [notes],
  )

  const handleExportVault = useCallback(async () => {
    const archivePath = '/api/vault/local/export/markdown'
    try {
      const headers: Record<string, string> = {}
      const apiKey = getRequestApiKeyForPath(archivePath)
      if (apiKey) headers['X-API-Key'] = apiKey
      const res = await fetch(`${getRequestBaseForPath(archivePath)}${archivePath}`, { headers })
      if (!res.ok) throw new Error(`Archive export failed (${res.status})`)
      const archiveBuffer = await res.arrayBuffer()
      const verification = verifyMarkdownVaultArchive(archiveBuffer)
      if (!verification.ok) throw new Error(`Archive verification failed: ${verification.errors.join('; ')}`)
      const archiveBlob = new Blob([archiveBuffer], { type: 'application/x-tar' })
      const url = URL.createObjectURL(archiveBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `clawcontrol-vault-markdown-${new Date().toISOString().slice(0, 10)}.tar`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      return
    } catch (err) {
      console.warn('[notes] local Markdown archive export failed:', err)
      window.alert(err instanceof Error ? err.message : 'Could not export Markdown vault archive')
      return
    }
  }, [])

  const handleExportEncryptedVault = useCallback(async () => {
    const password = window.prompt('Encrypted backup password')
    if (!password) return
    const confirmation = window.prompt('Confirm encrypted backup password')
    if (confirmation !== password) {
      window.alert('Backup passwords do not match.')
      return
    }
    const backup = await exportEncryptedVault(password)
    const exportBlob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(exportBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `clawcontrol-encrypted-vault-${new Date().toISOString().slice(0, 10)}.ccvault.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }, [])

  const handleImportEncryptedVault = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0]
      if (!file) return
      const password = window.prompt('Encrypted backup password')
      if (!password) return
      try {
        const backup = JSON.parse(await file.text())
        const verification = verifyEncryptedVaultBackup(backup)
        if (!verification.ok) {
          window.alert(`Encrypted vault backup is not valid:\n${verification.errors.join('\n')}`)
          return
        }
        await importEncryptedVault(password, backup)
        await refresh()
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Encrypted vault import failed')
      }
    },
    [refresh],
  )

  const handleImportMarkdownFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return
      const plan = planMarkdownVaultImport(Array.from(files))
      const foldersToCreate = new Set<string>()
      for (const note of plan.notes) {
        for (const folder of folderAncestors(note.folder)) foldersToCreate.add(folder)
      }
      for (const attachment of plan.attachments) {
        for (const folder of folderAncestors(attachment.folder)) foldersToCreate.add(folder)
      }
      for (const folder of foldersToCreate) {
        await createFolder(folder)
      }
      for (const note of plan.notes) {
        await createNote(
          note.title,
          note.folder,
          rewriteImportedAttachmentEmbeds(await note.file.text(), note, plan.attachments),
        )
      }
      for (const attachment of plan.attachments) {
        await uploadAttachment(attachment.file, attachment.folder, attachment.id)
      }
      await refresh()
      if (plan.skipped > 0) {
        window.alert(
          `Imported ${plan.notes.length} notes and ${plan.attachments.length} attachments. Skipped ${plan.skipped} system or unsupported files.`,
        )
      }
    },
    [createFolder, createNote, refresh],
  )

  const handleCreateClipboardClip = useCallback(async () => {
    try {
      const input = await readClipboardClipInput()
      if (!input.html?.trim() && !input.text?.trim()) {
        window.alert('Clipboard is empty or unavailable.')
        return
      }
      const clip = buildClipNote(input)
      await createFolder('Clips')
      const note = await createNote(clip.title, 'Clips', clip.content)
      await refresh()
      if (selectedId && selectedId !== note._id) void flushPendingSave(selectedId)
      setSelectedId(note._id)
      setViewMode('editor')
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not import clipboard clip.')
    }
  }, [createFolder, createNote, flushPendingSave, refresh, selectedId])

  const handleCopyCurrentWikilink = useCallback(() => {
    if (!selected || selected.type === 'attachment') return
    void navigator.clipboard?.writeText(`[[${selected.title || selected._id.replace(/\.md$/, '')}]]`)
  }, [selected])

  const handleOpenVersionHistory = useCallback(async () => {
    if (!selected || selected.type === 'attachment') return
    await flushPendingSave(selected._id)
    setHistoryOpen(true)
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const revisions = await getNoteRevisions(selected._id)
      setHistoryRevisions(revisions)
      setHistoryPreview(null)
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Could not load version history')
      setHistoryRevisions([])
    } finally {
      setHistoryLoading(false)
    }
  }, [flushPendingSave, selected])

  const loadComments = useCallback(async (id: string) => {
    setCommentsLoading(true)
    setCommentsError(null)
    try {
      setNoteComments(await getNoteComments(id))
    } catch (err) {
      setCommentsError(err instanceof Error ? err.message : 'Could not load comments')
      setNoteComments([])
    } finally {
      setCommentsLoading(false)
    }
  }, [])

  const handleOpenComments = useCallback(async () => {
    if (!selected || selected.type === 'attachment') return
    setCommentsOpen(true)
    await loadComments(selected._id)
  }, [loadComments, selected])

  const handleAddComment = useCallback(async () => {
    if (!selected || selected.type === 'attachment') return
    const body = window.prompt('New comment')
    if (!body?.trim()) return
    const anchor = usableSelectionAnchor(selectionAnchor)
    setCommentsLoading(true)
    setCommentsError(null)
    try {
      await createNoteComment(selected._id, body.trim(), anchor as unknown as Record<string, unknown>)
      await loadComments(selected._id)
    } catch (err) {
      setCommentsError(err instanceof Error ? err.message : 'Could not add comment')
    } finally {
      setCommentsLoading(false)
    }
  }, [loadComments, selected, selectionAnchor])

  const handleResolveComment = useCallback(
    async (id: string) => {
      if (!selected || selected.type === 'attachment') return
      setCommentsLoading(true)
      setCommentsError(null)
      try {
        await resolveNoteComment(id)
        await loadComments(selected._id)
        setActiveReviewId(current => (current === id ? null : current))
      } catch (err) {
        setCommentsError(err instanceof Error ? err.message : 'Could not resolve comment')
      } finally {
        setCommentsLoading(false)
      }
    },
    [loadComments, selected],
  )

  const handleReplyToComment = useCallback(
    async (id: string) => {
      if (!selected || selected.type === 'attachment') return
      const body = window.prompt('Reply')
      if (!body?.trim()) return
      setCommentsLoading(true)
      setCommentsError(null)
      try {
        await createNoteCommentReply(id, body.trim())
        await loadComments(selected._id)
      } catch (err) {
        setCommentsError(err instanceof Error ? err.message : 'Could not add reply')
      } finally {
        setCommentsLoading(false)
      }
    },
    [loadComments, selected],
  )

  const handleJumpToReviewAnchor = useCallback(
    (id: string) => {
      setActiveReviewId(id)
      setViewMode('editor')
    },
    [setViewMode],
  )

  const loadSuggestions = useCallback(async (id: string) => {
    setSuggestionsLoading(true)
    setSuggestionsError(null)
    try {
      setNoteSuggestions(await getNoteSuggestions(id))
    } catch (err) {
      setSuggestionsError(err instanceof Error ? err.message : 'Could not load suggestions')
      setNoteSuggestions([])
    } finally {
      setSuggestionsLoading(false)
    }
  }, [])

  const handleOpenSuggestions = useCallback(async () => {
    if (!selected || selected.type === 'attachment') return
    setSuggestionsOpen(true)
    await loadSuggestions(selected._id)
  }, [loadSuggestions, selected])

  const handleAddSuggestion = useCallback(async () => {
    if (!selected || selected.type === 'attachment') return
    const anchor = usableSuggestionAnchor(selectionAnchor)
    const selectedText = anchor.scope === 'selection' ? (anchor.quote ?? '') : ''
    const cursorInsert = anchor.scope === 'cursor'
    const content = window.prompt(
      anchor.scope === 'selection'
        ? 'Suggested replacement for selected text'
        : cursorInsert
          ? 'Suggested text to insert'
          : 'Suggested replacement Markdown',
      cursorInsert ? '' : selectedText || selected.content,
    )
    if (content === null || (!cursorInsert && content === (selectedText || selected.content))) return
    const body = window.prompt('Reason or note for this suggestion') ?? ''
    const patch =
      anchor.scope === 'selection'
        ? { type: 'replace_selection', content }
        : cursorInsert
          ? { type: 'insert_at_cursor', content }
          : { type: 'replace_document', content }
    setSuggestionsLoading(true)
    setSuggestionsError(null)
    try {
      await createNoteSuggestion(selected._id, patch, body.trim(), anchor as unknown as Record<string, unknown>)
      await loadSuggestions(selected._id)
    } catch (err) {
      setSuggestionsError(err instanceof Error ? err.message : 'Could not add suggestion')
    } finally {
      setSuggestionsLoading(false)
    }
  }, [loadSuggestions, selected, selectionAnchor])

  const handleApplySuggestion = useCallback(
    async (id: string) => {
      if (!selected || selected.type === 'attachment') return
      const suggestion = noteSuggestions.find(item => item.id === id)
      const result = applySuggestionPatch(
        selected.content,
        suggestion?.patch,
        suggestion?.anchor as NoteSelectionAnchor | undefined,
      )
      if (result.error === 'missing_content') {
        setSuggestionsError('Suggestion has no replacement content')
        return
      }
      if (result.error === 'unsupported') {
        setSuggestionsError('This suggestion type cannot be applied yet')
        return
      }
      if (result.error === 'anchor_mismatch' || result.content === null) {
        setSuggestionsError('Selected text or cursor position no longer matches this suggestion')
        return
      }
      setSuggestionsLoading(true)
      setSuggestionsError(null)
      try {
        await flushPendingSave(selected._id)
        await updateNote({ ...selected, content: result.content })
        await applyNoteSuggestion(id)
        await refresh()
        await loadSuggestions(selected._id)
        setActiveReviewId(current => (current === id ? null : current))
        setSaveState('saved')
        setLastSavedAt(Date.now())
      } catch (err) {
        setSuggestionsError(err instanceof Error ? err.message : 'Could not apply suggestion')
      } finally {
        setSuggestionsLoading(false)
      }
    },
    [flushPendingSave, loadSuggestions, noteSuggestions, refresh, selected, updateNote],
  )

  const handleRejectSuggestion = useCallback(
    async (id: string) => {
      if (!selected || selected.type === 'attachment') return
      setSuggestionsLoading(true)
      setSuggestionsError(null)
      try {
        await rejectNoteSuggestion(id)
        await loadSuggestions(selected._id)
        setActiveReviewId(current => (current === id ? null : current))
      } catch (err) {
        setSuggestionsError(err instanceof Error ? err.message : 'Could not reject suggestion')
      } finally {
        setSuggestionsLoading(false)
      }
    },
    [loadSuggestions, selected],
  )

  const handleRestoreRevision = useCallback(
    async (rev: string) => {
      if (!selected || selected.type === 'attachment') return
      const label = historyRevisions.find(revision => revision.rev === rev)?.label
      if (!window.confirm(restoreRevisionConfirmMessage(rev, label))) return
      setHistoryLoading(true)
      setHistoryError(null)
      try {
        const note = await restoreNoteRevision(selected._id, rev)
        setSelectedId(note._id)
        await refresh()
        const revisions = await getNoteRevisions(note._id)
        setHistoryRevisions(revisions)
        setHistoryPreview(null)
        setSaveState('saved')
        setLastSavedAt(Date.now())
      } catch (err) {
        setHistoryError(err instanceof Error ? err.message : 'Could not restore revision')
      } finally {
        setHistoryLoading(false)
      }
    },
    [getNoteRevisions, historyRevisions, refresh, restoreNoteRevision, selected],
  )

  const handlePreviewRevision = useCallback(
    async (rev: string) => {
      if (!selected || selected.type === 'attachment') return
      setHistoryLoading(true)
      setHistoryError(null)
      try {
        setHistoryPreview(await getNoteRevision(selected._id, rev))
      } catch (err) {
        setHistoryError(err instanceof Error ? err.message : 'Could not preview revision')
      } finally {
        setHistoryLoading(false)
      }
    },
    [selected],
  )

  const handleCreateVersionCheckpoint = useCallback(async () => {
    if (!selected || selected.type === 'attachment') return
    const label = window.prompt('Version name')
    if (label === null) return
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      await flushPendingSave(selected._id)
      const rev = await createNoteVersionCheckpoint(selected._id, label.trim())
      const revisions = await getNoteRevisions(selected._id)
      setHistoryRevisions(revisions)
      setHistoryPreview(await getNoteRevision(selected._id, rev))
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Could not create version')
    } finally {
      setHistoryLoading(false)
    }
  }, [flushPendingSave, selected])

  const handleRenameRevision = useCallback(
    async (rev: string, currentLabel?: string | null) => {
      if (!selected || selected.type === 'attachment') return
      const label = window.prompt('Version name', currentLabel ?? '')
      if (label === null) return
      setHistoryLoading(true)
      setHistoryError(null)
      try {
        await labelNoteRevision(selected._id, rev, label.trim())
        const revisions = await getNoteRevisions(selected._id)
        setHistoryRevisions(revisions)
        setHistoryPreview(prev => (prev?.rev === rev ? { ...prev, label: label.trim() || null } : prev))
      } catch (err) {
        setHistoryError(err instanceof Error ? err.message : 'Could not rename version')
      } finally {
        setHistoryLoading(false)
      }
    },
    [selected],
  )

  const handleContentChange = useCallback(
    (content: string, options: { broadcast?: boolean } = {}) => {
      if (!selected || selected.type === 'attachment') return
      const noteId = selected._id
      const baseContent = pendingContentRef.current.get(noteId) ?? selected.content
      pendingContentRef.current.set(noteId, content)
      saveLocalDraft(noteId, content)
      if (options.broadcast !== false) broadcastLocalOperation(content, baseContent)
      setSaveState('unsaved')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(async () => {
        await flushPendingSave(noteId)
      }, SAVE_DEBOUNCE_MS)
    },
    [broadcastLocalOperation, flushPendingSave, selected],
  )

  const handleSelectionAnchorChange = useCallback(
    (anchor: NoteSelectionAnchor) => {
      setSelectionAnchor(anchor)
      if (typeof anchor.start === 'number') {
        broadcastLocalCursor(anchor.start, typeof anchor.end === 'number' ? anchor.end : anchor.start)
      }
    },
    [broadcastLocalCursor],
  )

  useEffect(() => {
    if (!selected || selected.type === 'attachment') return
    for (const draft of localCollabDrafts) {
      const localContent = pendingContentRef.current.get(selected._id) ?? selected.content
      const result = autoMergeLocalCollabOperation(localContent, selected.content, draft)
      if (!result) continue
      if (result.status === 'apply-remote' || result.status === 'merge-remote') {
        handleContentChange(result.content, { broadcast: false })
      }
      dismissLocalCollabDraft(draft.id)
    }
  }, [dismissLocalCollabDraft, handleContentChange, localCollabDrafts, selected])

  const handleApplyLocalCollabDraft = useCallback(
    (draft: LocalCollabDraft) => {
      if (!selected || selected.type === 'attachment') return
      const localContent = pendingContentRef.current.get(selected._id) ?? selected.content
      const result = mergeLocalCollabDraft(localContent, selected.content, draft)
      if (result.status === 'same' || result.status === 'keep-local') {
        dismissLocalCollabDraft(draft.id)
        return
      }
      handleContentChange(result.status === 'conflict' ? result.remoteContent : result.content)
      dismissLocalCollabDraft(draft.id)
      if (localCollabDrafts.length <= 1) setCollabReviewOpen(false)
    },
    [dismissLocalCollabDraft, handleContentChange, localCollabDrafts.length, selected],
  )

  const handleDismissLocalCollabDraft = useCallback(
    (draftId: string) => {
      dismissLocalCollabDraft(draftId)
      if (localCollabDrafts.length <= 1) setCollabReviewOpen(false)
    },
    [dismissLocalCollabDraft, localCollabDrafts.length],
  )

  const handleInsertVaultPluginBlock = useCallback(
    (plugin: string, title: string, options: Record<string, unknown> = {}) => {
      if (!selected || selected.type === 'attachment') return
      const current = pendingContentRef.current.get(selected._id) ?? selected.content
      const block = ['```claw-plugin', JSON.stringify({ ...options, plugin, title }, null, 2), '```'].join('\n')
      handleContentChange(`${current.trimEnd()}\n\n${block}\n`)
      setViewMode('editor')
    },
    [handleContentChange, selected],
  )

  const handleInsertVaultPluginManifest = useCallback(() => {
    if (!selected || selected.type === 'attachment') return
    const current = pendingContentRef.current.get(selected._id) ?? selected.content
    const manifest = {
      id: 'local.dashboard',
      label: 'Dashboard',
      description: 'Local template plugin stored in this vault.',
      enabled: true,
      version: '0.1.0',
      author: 'Local vault',
      apiVersion: 'notes-plugin-v1',
      minAppVersion: '0.1.0',
      license: 'private',
      keywords: ['dashboard', 'local-first'],
      permissions: ['read:vault-stats', 'read:recent-notes'],
      template: '### {{title}}\n\nNotes: {{noteCount}}\nTasks: {{taskDone}}/{{taskTotal}}\n\n{{recentList}}',
    }
    const block = ['```claw-plugin-manifest', JSON.stringify(manifest, null, 2), '```'].join('\n')
    handleContentChange(`${current.trimEnd()}\n\n${block}\n`)
    setViewMode('editor')
  }, [handleContentChange, selected])

  const handleInsertVaultPluginTrustedPublisher = useCallback(() => {
    if (!selected || selected.type === 'attachment') return
    const current = pendingContentRef.current.get(selected._id) ?? selected.content
    const trust = {
      signer: 'Publisher name',
      publicKey: {
        kty: 'EC',
        crv: 'P-256',
        x: 'base64url-x-coordinate',
        y: 'base64url-y-coordinate',
      },
      revoked: false,
      rotatedToKeyId: '',
      expiresAt: '',
    }
    const block = ['```claw-plugin-trust', JSON.stringify(trust, null, 2), '```'].join('\n')
    handleContentChange(`${current.trimEnd()}\n\n${block}\n`)
    setViewMode('editor')
  }, [handleContentChange, selected])

  const handleImportPluginMarketplaceFeed = useCallback(async () => {
    const rawUrl = window.prompt('Plugin marketplace feed URL')
    const url = rawUrl?.trim()
    if (!url) return
    try {
      const packages = await fetchVaultPluginMarketplaceFeed(url, fetch, buildVaultPluginTrustedPublishers(notes))
      if (packages.length === 0) {
        window.alert('No installable plugin packages found in that feed.')
        return
      }
      const host = new URL(url).hostname || 'remote'
      const title = `Plugin Marketplace ${host}`
      const content = [
        `# ${title}`,
        '',
        `Imported from ${url}`,
        '',
        vaultPluginMarketplacePackagesMarkdown(packages),
        '',
        '```claw-plugin',
        JSON.stringify({ plugin: 'vault.marketplace', title: 'Plugin marketplace', includeDisabled: true }, null, 2),
        '```',
      ].join('\n')
      if (!folders.some(folder => folder.path === 'Plugins')) {
        await createFolder('Plugins')
      }
      const note = await createNote(title, 'Plugins', content)
      setSelectedId(note._id)
      setViewMode('editor')
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not import plugin marketplace feed')
    }
  }, [createFolder, createNote, folders])

  const ensurePluginWriteFolder = useCallback(
    async (folder: string, folderSet: Set<string>) => {
      const normalized = normalizeFolderPath(folder)
      if (!normalized) return
      const parts = normalized.split('/').filter(Boolean)
      for (let i = 1; i <= parts.length; i += 1) {
        const path = parts.slice(0, i).join('/')
        if (folderSet.has(path)) continue
        await createFolder(path)
        folderSet.add(path)
      }
    },
    [createFolder],
  )

  const handleApplyVaultPluginWrites = useCallback(async () => {
    await flushPendingSave()
    const records = buildVaultPluginWriteRecords(notesRef.current)
    if (records.length === 0) {
      window.alert('No pending plugin write requests.')
      return
    }

    const plan = planVaultPluginWriteApply(notesRef.current, records)
    if (plan.applied.length === 0) {
      window.alert(`No plugin writes can be applied. ${plan.skipped.length} request${plan.skipped.length === 1 ? '' : 's'} skipped.`)
      return
    }

    const skipped = plan.skipped.length
      ? `\n${plan.skipped.length} request${plan.skipped.length === 1 ? '' : 's'} will be skipped because of conflicts or unsafe paths.`
      : ''
    if (
      !window.confirm(
        `Apply ${plan.applied.length} plugin write request${plan.applied.length === 1 ? '' : 's'}? Safety checkpoints will be created for ${plan.checkpointNoteIds.length} existing note${plan.checkpointNoteIds.length === 1 ? '' : 's'}.${skipped}`,
      )
    ) {
      return
    }

    const sourceCleanupIds = [
      ...new Set(
        plan.applied
          .map(change => change.record.sourceNoteId)
          .filter((id): id is string => Boolean(id)),
      ),
    ]

    setSearchResultNotes(null)
    await createSafetyCheckpoints(
      [...plan.checkpointNoteIds, ...sourceCleanupIds],
      'Before applying plugin writes',
    )

    const folderSet = new Set(folders.map(folder => folder.path))
    const finalById = new Map(plan.notes.map(note => [note._id, note]))
    const changedFinalIds = new Set(plan.applied.map(change => change.nextNoteId))
    const renamePairs = plan.applied
      .filter(change => change.record.action === 'rename' && change.noteId !== change.nextNoteId)
      .map(change => [change.noteId, change.nextNoteId] as const)

    for (const id of changedFinalIds) {
      const finalNote = finalById.get(id)
      if (!finalNote || finalNote.type !== 'note') continue
      const shouldTrash = isNoteInTrash(finalNote)
      const liveFolder = normalizeFolderPath(
        shouldTrash
          ? finalNote.trash_origin_path || finalNote.folder.replace(/^Trash\/?/, '')
          : finalNote.folder,
      )
      await ensurePluginWriteFolder(liveFolder, folderSet)
      await updateNote({
        ...finalNote,
        folder: liveFolder,
        trashed_at: shouldTrash ? null : finalNote.trashed_at,
        trash_origin_path: shouldTrash ? null : finalNote.trash_origin_path,
      })
      if (shouldTrash) {
        await trashNote(id)
      }
    }

    for (const [fromId, toId] of renamePairs) {
      if (fromId !== toId) await deleteNote(fromId)
    }

    const changedFinalIdSet = new Set(changedFinalIds)
    const renamedFromIds = new Set(renamePairs.map(([fromId]) => fromId))
    const appliedChecksums = plan.applied.map(change => change.record.checksum)
    for (const sourceId of sourceCleanupIds) {
      if (changedFinalIdSet.has(sourceId) || renamedFromIds.has(sourceId)) continue
      const source = notesRef.current.find(note => note._id === sourceId)
      if (!source || source.type !== 'note' || isNoteInTrash(source)) continue
      const nextContent = removeAppliedVaultPluginWriteBlocks(source.content, appliedChecksums)
      if (nextContent !== source.content) {
        await updateNote({ ...source, content: nextContent })
      }
    }

    if (renamePairs.length > 0) {
      const renamed = new Map(renamePairs)
      setPinnedNoteIds(prev => prev.map(id => renamed.get(id) ?? id))
      setRecentNoteIds(prev => prev.map(id => renamed.get(id) ?? id))
      if (selectedId && renamed.has(selectedId)) setSelectedId(renamed.get(selectedId) ?? selectedId)
    }

    await refresh()
    if (plan.skipped.length > 0) {
      window.alert(`Applied ${plan.applied.length} plugin writes. Skipped ${plan.skipped.length} conflicted request${plan.skipped.length === 1 ? '' : 's'}.`)
    }
  }, [
    createSafetyCheckpoints,
    deleteNote,
    ensurePluginWriteFolder,
    flushPendingSave,
    folders,
    refresh,
    selectedId,
    setPinnedNoteIds,
    setRecentNoteIds,
    trashNote,
    updateNote,
  ])

  const handleTitleCommit = useCallback(async () => {
    if (!selected || selected.type === 'attachment') {
      setEditingTitle(false)
      return
    }
    const nextTitle = titleDraft.trim() || 'Untitled'
    const previousTitle = selected.title
    setEditingTitle(false)
    if (nextTitle === previousTitle) return

    await createSafetyCheckpoints([selected._id], 'Before title rename')
    await updateNote({ ...selected, title: nextTitle })

    const changedNotes = notes.filter(note => {
      if (note.type !== 'note' || note._id === selected._id) return false
      return rewriteWikilinks(note.content, previousTitle, nextTitle) !== note.content
    })

    for (const note of changedNotes) {
      await updateNote({
        ...note,
        content: rewriteWikilinks(note.content, previousTitle, nextTitle),
      })
    }
  }, [createSafetyCheckpoints, notes, selected, titleDraft, updateNote])

  const handleLinkUnlinkedMention = useCallback(
    async (sourceNoteId: string) => {
      if (!selected) return
      const source = notes.find(note => note._id === sourceNoteId)
      if (!source || source.type !== 'note') return
      const linked = linkFirstPlainMention(source.content, selected.title)
      if (linked === source.content) return
      await updateNote({ ...source, content: linked })
    },
    [notes, selected, updateNote],
  )

  const handleWikilinkClick = useCallback(
    async (link: string) => {
      if (selectedId) await flushPendingSave(selectedId)
      const targetId = noteIdFromTitle(link, notes)
      if (targetId) {
        setSelectedId(targetId)
        setViewMode('editor')
      } else {
        const note = await createNote(link)
        setSelectedId(note._id)
        setViewMode('editor')
      }
    },
    [notes, createNote, flushPendingSave, selectedId],
  )

  const handleGraphSelect = useCallback(
    (id: string) => {
      if (selectedId && selectedId !== id) void flushPendingSave(selectedId)
      setSelectedId(id)
      setViewMode('editor')
    },
    [flushPendingSave, selectedId],
  )

  const handleToggleTaskDone = useCallback(
    async (row: VaultTaskRow, done: boolean) => {
      const note = notesRef.current.find(item => item._id === row.noteId)
      if (!note || note.type !== 'note') return
      const nextContent = setTaskLineDone(note.content, row.line, done)
      if (nextContent === null) return
      try {
        await flushPendingSave(row.noteId)
        await createSafetyCheckpoints([row.noteId], 'Before task toggle')
        const updated = await updateNote({ ...note, content: nextContent, updated_at: Date.now() })
        notesRef.current = notesRef.current.map(item => (item._id === updated._id ? updated : item))
        setLastSavedAt(Date.now())
        setSaveState('saved')
        await refresh()
      } catch (err) {
        console.warn('[notes] task toggle failed:', err)
        setSaveState('error')
      }
    },
    [createSafetyCheckpoints, flushPendingSave, refresh, updateNote],
  )

  const handleUpsertTableOfContents = useCallback(async () => {
    if (!selected || selected.type === 'attachment') return
    const currentContent = pendingContentRef.current.get(selected._id) ?? selected.content
    const nextContent = upsertMarkdownTableOfContents(currentContent)
    if (nextContent === currentContent) return
    try {
      await createSafetyCheckpoints([selected._id], 'Before table of contents update')
      const source = notesRef.current.find(item => item._id === selected._id && item.type === 'note') ?? selected
      const updated = await updateNote({ ...source, content: nextContent, updated_at: Date.now() })
      notesRef.current = notesRef.current.map(item => (item._id === updated._id ? updated : item))
      pendingContentRef.current.delete(selected._id)
      discardLocalDraft(selected._id)
      setLastSavedAt(Date.now())
      setSaveState(pendingContentRef.current.size ? 'unsaved' : 'saved')
      await refresh()
    } catch (err) {
      console.warn('[notes] table of contents update failed:', err)
      setSaveState('error')
    }
  }, [createSafetyCheckpoints, refresh, selected, updateNote])

  const saveSelectedContentNow = useCallback(
    async (nextContent: string, checkpointLabel: string, failureLabel: string) => {
      if (!selected || selected.type === 'attachment') return
      try {
        await createSafetyCheckpoints([selected._id], checkpointLabel)
        const source = notesRef.current.find(item => item._id === selected._id && item.type === 'note') ?? selected
        const updated = await updateNote({ ...source, content: nextContent, updated_at: Date.now() })
        notesRef.current = notesRef.current.map(item => (item._id === updated._id ? updated : item))
        pendingContentRef.current.delete(selected._id)
        discardLocalDraft(selected._id)
        setLastSavedAt(Date.now())
        setSaveState(pendingContentRef.current.size ? 'unsaved' : 'saved')
        await refresh()
      } catch (err) {
        console.warn(`[notes] ${failureLabel} failed:`, err)
        setSaveState('error')
      }
    },
    [createSafetyCheckpoints, refresh, selected, updateNote],
  )

  const saveDocumentProperty = useCallback(
    async (key: string, value: string, mode: 'set' | 'remove' = 'set') => {
      if (!selected || selected.type === 'attachment') return
      const currentContent = pendingContentRef.current.get(selected._id) ?? selected.content
      const nextContent =
        mode === 'remove'
          ? removeDocumentProperty(currentContent, key)
          : upsertDocumentProperty(currentContent, key, value)
      if (nextContent === currentContent) return
      await saveSelectedContentNow(
        nextContent,
        mode === 'remove' ? 'Before document property removal' : 'Before document property update',
        mode === 'remove' ? 'document property removal' : 'document property update',
      )
    },
    [saveSelectedContentNow, selected],
  )

  const handleSetDocumentProperty = useCallback(async () => {
    if (!selected || selected.type === 'attachment') return
    const key = window.prompt('Property name', 'status')
    if (key === null) return
    const value = window.prompt('Property value', '')
    if (value === null) return
    await saveDocumentProperty(key, value)
  }, [saveDocumentProperty, selected])

  const handleRemoveDocumentProperty = useCallback(async () => {
    if (!selected || selected.type === 'attachment') return
    const existingKeys = Object.keys(selected.properties ?? {})
    const key = window.prompt('Property to remove', existingKeys[0] ?? '')
    if (key === null) return
    await saveDocumentProperty(key, '', 'remove')
  }, [saveDocumentProperty, selected])

  const handleCreateCanvasBoard = useCallback(async () => {
    const existing = notesRef.current.find(note => note.type === 'note' && isCanvasBoardNote(note))
    if (existing) return existing
    await createFolder(CANVAS_FOLDER)
    const note = await createNote(
      CANVAS_TITLE,
      CANVAS_FOLDER,
      serializeCanvasNote(buildInitialCanvasData(notesRef.current)),
    )
    await refresh()
    return note
  }, [createFolder, createNote, refresh])

  const handleOpenCanvasView = useCallback(async () => {
    await handleCreateCanvasBoard()
    setViewMode('canvas')
  }, [handleCreateCanvasBoard])

  const handleSaveCanvasBoard = useCallback(
    async (data: ReturnType<typeof buildInitialCanvasData>) => {
      const board =
        notesRef.current.find(note => note.type === 'note' && isCanvasBoardNote(note)) ??
        (await handleCreateCanvasBoard())
      const updated = await updateNote({
        ...board,
        content: serializeCanvasNote(data),
        updated_at: Date.now(),
      })
      notesRef.current = notesRef.current.map(note => (note._id === updated._id ? updated : note))
    },
    [handleCreateCanvasBoard, updateNote],
  )

  const handleManualCollabSync = useCallback(async () => {
    if (!selected || selected.type !== 'note') return
    await syncLocalCollabNow()
    setLocalCollabProviderStatuses(localCollabTransport.status())
  }, [localCollabTransport, selected, syncLocalCollabNow])

  const commandItems = useMemo<CommandAction[]>(() => {
    const baseActions: CommandAction[] = [
      {
        id: 'new-note',
        label: 'New note',
        detail: selected?.folder ? `Create in ${selected.folder}` : 'Create in vault root',
        icon: NotePencil,
        onRun: () => {
          void handleCreate(selected?.folder)
        },
      },
      {
        id: 'new-daily-note',
        label: 'New daily note',
        detail: selected?.folder ? `Create in ${selected.folder}` : 'Create in vault root',
        icon: NotePencil,
        onRun: () => {
          void handleCreateDailyNote(selected?.folder)
        },
      },
      ...vaultTemplates.slice(0, 20).map<CommandAction>(template => ({
        id: `vault-template:${template.id}`,
        label: `New from ${template.label}`,
        detail: template.noteId || 'Vault template',
        icon: FileText,
        onRun: () => {
          void handleCreateTemplate(selected?.folder, template.id)
        },
      })),
      {
        id: 'new-folder',
        label: 'New folder',
        detail: selected?.folder ? `Create in ${selected.folder}` : 'Create in vault root',
        icon: FolderPlus,
        onRun: () => {
          void handleCreateFolder(selected?.folder)
        },
      },
      {
        id: 'graph-view',
        label: 'Open graph view',
        detail: 'Knowledge graph',
        icon: GitBranch,
        onRun: () => setViewMode('graph'),
      },
      {
        id: 'data-view',
        label: 'Open data view',
        detail: 'Local vault metadata table',
        icon: Table,
        onRun: () => setViewMode('data'),
      },
      {
        id: 'canvas-view',
        label: 'Open canvas view',
        detail: 'Local visual board stored as a vault note',
        icon: SquaresFour,
        onRun: () => {
          void handleOpenCanvasView()
        },
      },
      {
        id: 'toggle-focus-mode',
        label: focusMode ? 'Exit focus mode' : 'Enter focus mode',
        detail: 'Hide or show the notes sidebar',
        icon: PenNib,
        onRun: () => setFocusMode(prev => !prev),
      },
      {
        id: 'export-vault',
        label: 'Export Markdown vault',
        detail: 'Download .tar with .md files and attachments',
        icon: ShareNetwork,
        onRun: () => {
          void handleExportVault()
        },
      },
      {
        id: 'export-encrypted-vault',
        label: 'Export encrypted vault backup',
        detail: 'Password-protected local backup',
        icon: ShareNetwork,
        onRun: () => {
          void handleExportEncryptedVault()
        },
      },
      {
        id: 'vault-status',
        label: 'Vault privacy status',
        detail: 'Local storage, counts, backup readiness',
        icon: ShieldCheck,
        onRun: () => {
          void handleOpenVaultStatus()
        },
      },
      {
        id: 'notes-keyboard-shortcuts',
        label: 'Keyboard shortcuts',
        detail: 'Notes, editor, and review shortcuts',
        icon: FileText,
        onRun: () => setShortcutsOpen(true),
      },
      {
        id: 'notes-editor-preferences',
        label: 'Editor preferences',
        detail: `${normalizedEditorPreferences.defaultMode}, ${normalizedEditorPreferences.markdownWidth} width`,
        icon: PenNib,
        onRun: () => setPreferencesOpen(true),
      },
      {
        id: 'recovered-drafts',
        label: 'Recovered drafts',
        detail: `${getRecoverableDrafts().length} unsynced local drafts`,
        icon: FileText,
        onRun: handleOpenDraftRecovery,
      },
      {
        id: 'save-current-checkpoint',
        label: 'Save current note',
        detail: 'Flush local save and create a manual version when changed',
        icon: FileText,
        onRun: () => {
          void handleManualSaveCheckpoint()
        },
      },
      {
        id: 'import-markdown',
        label: 'Import markdown files',
        detail: 'Create vault notes from local .md files',
        icon: UploadSimple,
        onRun: () => fileInputRef.current?.click(),
      },
      {
        id: 'import-clipboard-clip',
        label: 'Import clipboard clip',
        detail: 'Create a local Clips note from copied web text or HTML',
        icon: UploadSimple,
        onRun: () => {
          void handleCreateClipboardClip()
        },
      },
      {
        id: 'import-plugin-marketplace-feed',
        label: 'Import plugin marketplace feed',
        detail: 'Fetch signed package metadata into a local vault note',
        icon: UploadSimple,
        onRun: () => {
          void handleImportPluginMarketplaceFeed()
        },
      },
      {
        id: 'import-markdown-folder',
        label: 'Import markdown folder',
        detail: 'Preserve Obsidian vault folder paths',
        icon: UploadSimple,
        onRun: () => folderInputRef.current?.click(),
      },
      {
        id: 'import-encrypted-vault',
        label: 'Import encrypted vault backup',
        detail: 'Restore a .ccvault.json backup',
        icon: UploadSimple,
        onRun: () => encryptedBackupInputRef.current?.click(),
      },
      {
        id: 'empty-trash',
        label: 'Empty Trash',
        detail: `${notes.filter(note => note.type === 'note' && isNoteInTrash(note)).length} notes, ${notes.filter(note => note.type === 'attachment' && isNoteInTrash(note)).length} attachments, ${folders.filter(folder => isNotesTrashPath(folder.path)).length} folders`,
        icon: Trash,
        onRun: () => {
          void handleEmptyTrash()
        },
      },
    ]

    if (selectedId) {
      baseActions.push({
        id: 'toggle-pin',
        label: pinnedNoteSet.has(selectedId) ? 'Unpin current note' : 'Pin current note',
        detail: selected?.title || selectedId,
        icon: Star,
        onRun: () => handleTogglePin(selectedId),
      })
      baseActions.push({
        id: 'copy-current-wikilink',
        label: 'Copy current wikilink',
        detail: selected?.title || selectedId,
        icon: Copy,
        onRun: handleCopyCurrentWikilink,
      })
      if (selected?.type === 'note' && localCollabSupported) {
        baseActions.push({
          id: 'sync-local-collaboration',
          label: 'Sync collaboration now',
          detail: localCollabLastSyncError
            ? `Last sync failed: ${localCollabLastSyncError}`
            : localCollabProviderSummary.state === 'degraded' || localCollabProviderSummary.state === 'offline'
              ? localCollabProviderSummary.detail
              : localCollabLastSyncedAt
                ? `Last checked ${new Date(localCollabLastSyncedAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}`
                : 'Poll paired providers for this note',
          icon: Cloud,
          onRun: () => {
            void handleManualCollabSync()
          },
        })
      }
      if (localCollabDrafts.length > 0) {
        baseActions.push({
          id: 'review-local-collab-drafts',
          label: 'Review incoming local drafts',
          detail: `${localCollabDrafts.length} pending local edit${localCollabDrafts.length === 1 ? '' : 's'}`,
          icon: ChatCircleText,
          onRun: () => setCollabReviewOpen(true),
        })
      }
      baseActions.push({
        id: 'document-info',
        label: infoPanelOpen ? 'Close document info' : 'Open document info',
        detail: selected?.title || selectedId,
        icon: FileText,
        onRun: () => setInfoPanelOpen(open => !open),
      })
      baseActions.push({
        id: 'version-history',
        label: 'Open version history',
        detail: selected?.title || selectedId,
        icon: GitBranch,
        onRun: () => {
          void handleOpenVersionHistory()
        },
      })
      baseActions.push({
        id: 'insert-table-of-contents',
        label: 'Insert or update table of contents',
        detail: selected?.title || selectedId,
        icon: ListBullets,
        onRun: () => {
          void handleUpsertTableOfContents()
        },
      })
      baseActions.push({
        id: 'set-document-property',
        label: 'Set document property',
        detail: 'Write local frontmatter metadata',
        icon: NotePencil,
        onRun: () => {
          void handleSetDocumentProperty()
        },
      })
      baseActions.push({
        id: 'save-current-as-template',
        label: 'Save current note as template',
        detail: VAULT_TEMPLATES_FOLDER,
        icon: FileText,
        onRun: () => {
          void handleSaveCurrentAsTemplate()
        },
      })
      baseActions.push({
        id: 'remove-document-property',
        label: 'Remove document property',
        detail: selected?.properties ? Object.keys(selected.properties).join(', ') || 'No properties' : 'No properties',
        icon: NotePencil,
        onRun: () => {
          void handleRemoveDocumentProperty()
        },
      })
      baseActions.push({
        id: 'suggestions',
        label: 'Open suggestions',
        detail: selected?.title || selectedId,
        icon: NotePencil,
        onRun: () => {
          void handleOpenSuggestions()
        },
      })
      baseActions.push({
        id: 'insert-vault-stats-plugin',
        label: 'Insert vault stats plugin',
        detail: 'Local plugin block, no remote execution',
        icon: SquaresFour,
        onRun: () => handleInsertVaultPluginBlock('vault.stats', 'Vault stats'),
      })
      baseActions.push({
        id: 'insert-recent-notes-plugin',
        label: 'Insert recent notes plugin',
        detail: 'Local plugin block, no remote execution',
        icon: ListBullets,
        onRun: () => handleInsertVaultPluginBlock('vault.recent', 'Recent notes'),
      })
      baseActions.push({
        id: 'insert-plugin-registry',
        label: 'Insert plugin registry',
        detail: 'Audit local plugin sources and permissions',
        icon: SquaresFour,
        onRun: () => handleInsertVaultPluginBlock('vault.plugins', 'Plugin registry'),
      })
      baseActions.push({
        id: 'insert-plugin-marketplace',
        label: 'Insert plugin marketplace',
        detail: 'Browse vault-local plugin packages and install snippets',
        icon: SquaresFour,
        onRun: () => handleInsertVaultPluginBlock('vault.marketplace', 'Plugin marketplace'),
      })
      const pendingPluginWriteCount = buildVaultPluginWriteRecords(notes).length
      baseActions.push({
        id: 'insert-plugin-write-review',
        label: 'Insert plugin write review',
        detail: 'Audit pending plugin changes before approval',
        icon: ShieldCheck,
        onRun: () => handleInsertVaultPluginBlock('vault.plugin-writes', 'Plugin write review'),
      })
      baseActions.push({
        id: 'apply-plugin-write-requests',
        label: 'Apply plugin write requests',
        detail: `${pendingPluginWriteCount} pending reviewed request${pendingPluginWriteCount === 1 ? '' : 's'}`,
        icon: ShieldCheck,
        onRun: () => {
          void handleApplyVaultPluginWrites()
        },
      })
      baseActions.push({
        id: 'insert-plugin-manifest',
        label: 'Insert local plugin manifest',
        detail: 'Install a safe vault-local template plugin',
        icon: SquaresFour,
        onRun: handleInsertVaultPluginManifest,
      })
      baseActions.push({
        id: 'insert-plugin-trusted-publisher',
        label: 'Insert plugin trusted publisher',
        detail: 'Trust a marketplace signing key from this vault',
        icon: ShieldCheck,
        onRun: handleInsertVaultPluginTrustedPublisher,
      })
      for (const command of vaultPluginCommands) {
        baseActions.push({
          id: command.id,
          label: command.label,
          detail: command.detail,
          icon: SquaresFour,
          onRun: () =>
            handleInsertVaultPluginBlock(
              command.pluginId,
              command.config.title ?? command.pluginLabel,
              command.config as Record<string, unknown>,
            ),
        })
      }
      for (const plugin of vaultPlugins.filter(plugin => plugin.id.startsWith('local.')).slice(0, 20)) {
        baseActions.push({
          id: `insert-local-plugin:${plugin.id}`,
          label: `Insert ${plugin.label}`,
          detail: plugin.description || plugin.id,
          icon: SquaresFour,
          onRun: () => handleInsertVaultPluginBlock(plugin.id, plugin.label),
        })
      }
      baseActions.push({
        id: 'export-current-docx',
        label: 'Export current note as DOCX',
        detail: selected?.title || selectedId,
        icon: FileDoc,
        onRun: () => handleExportDocx(selectedId),
      })
      baseActions.push({
        id: 'export-current-pdf',
        label: 'Export current note as PDF',
        detail: 'Opens print dialog',
        icon: FilePdf,
        onRun: () => handleExportPdf(selectedId),
      })
      baseActions.push({
        id: 'export-current-markdown',
        label: 'Export current note as Markdown',
        detail: selected?.title || selectedId,
        icon: FileText,
        onRun: () => handleExportMarkdown(selectedId),
      })
      baseActions.push({
        id: 'export-current-html',
        label: 'Export current note as HTML',
        detail: selected?.title || selectedId,
        icon: FileHtml,
        onRun: () => handleExportHtml(selectedId),
      })
      baseActions.push({
        id: 'export-current-review',
        label: 'Export private share package',
        detail: 'Offline review with view/comment/suggest permission',
        icon: ShareNetwork,
        onRun: () => {
          void handleExportReviewPackage(selectedId)
        },
      })
    }

    const noteActions = notes
      .filter(note => note.type === 'note')
      .map<CommandAction>(note => ({
        id: `note:${note._id}`,
        label: note.title || 'Untitled',
        detail: [note.folder || 'Vault root', ...(note.aliases?.map(alias => `@${alias}`) ?? [])].join(' '),
        icon: NotePencil,
        onRun: () => {
          if (selectedId && selectedId !== note._id) void flushPendingSave(selectedId)
          setSelectedId(note._id)
          setViewMode('editor')
        },
      }))

    return [...baseActions, ...noteActions]
  }, [
    flushPendingSave,
    focusMode,
    folders,
    handleCopyCurrentWikilink,
    handleCreate,
    handleCreateClipboardClip,
    handleCreateDailyNote,
    handleCreateFolder,
    handleCreateTemplate,
    handleEmptyTrash,
    handleExportDocx,
    handleExportEncryptedVault,
    handleExportHtml,
    handleExportMarkdown,
    handleExportPdf,
    handleExportReviewPackage,
    handleExportVault,
    handleApplyVaultPluginWrites,
    handleInsertVaultPluginBlock,
    handleInsertVaultPluginManifest,
    handleInsertVaultPluginTrustedPublisher,
    handleImportPluginMarketplaceFeed,
    handleManualSaveCheckpoint,
    handleManualCollabSync,
    handleOpenCanvasView,
    handleOpenDraftRecovery,
    handleOpenSuggestions,
    handleOpenVaultStatus,
    handleOpenVersionHistory,
    handleRemoveDocumentProperty,
    handleSaveCurrentAsTemplate,
    handleSetDocumentProperty,
    handleTogglePin,
    handleUpsertTableOfContents,
    infoPanelOpen,
    localCollabDrafts.length,
    localCollabLastSyncError,
    localCollabLastSyncedAt,
    localCollabProviderSummary,
    localCollabSupported,
    normalizedEditorPreferences.defaultMode,
    normalizedEditorPreferences.markdownWidth,
    notes,
    pinnedNoteSet,
    selected?.folder,
    selected?.properties,
    selected?.title,
    selectedId,
    setFocusMode,
    setInfoPanelOpen,
    vaultPluginCommands,
    vaultPlugins,
    vaultTemplates,
  ])

  const handleResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = treeWidth
      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX
        setTreeWidth(Math.max(160, Math.min(startWidth + delta, 360)))
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [treeWidth],
  )

  if (loading) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: 13,
        }}
      >
        Loading vault...
      </div>
    )
  }

  if (error && notes.length === 0) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 12,
          color: 'var(--text-muted)',
          fontSize: 13,
        }}
      >
        <div style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Notes sync unavailable</div>
        <div style={{ maxWidth: 420, textAlign: 'center', lineHeight: 1.5 }}>{error}</div>
        <button
          type="button"
          onClick={refresh}
          style={{
            background: 'var(--bg-white-04)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '7px 14px',
            fontSize: 12,
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  const saveLabel =
    saveState === 'saving'
      ? 'Saving...'
      : saveState === 'unsaved'
        ? 'Unsaved'
        : saveState === 'error'
          ? 'Save failed'
          : lastSavedAt
            ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
            : 'Saved'

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,text/markdown,text/plain"
        multiple
        style={{ display: 'none' }}
        onChange={event => {
          void handleImportMarkdownFiles(event.target.files)
          event.target.value = ''
        }}
      />
      <input
        ref={node => {
          folderInputRef.current = node
          node?.setAttribute('webkitdirectory', '')
          node?.setAttribute('directory', '')
        }}
        type="file"
        accept=".md,text/markdown,text/plain"
        multiple
        style={{ display: 'none' }}
        onChange={event => {
          void handleImportMarkdownFiles(event.target.files)
          event.target.value = ''
        }}
      />
      <input
        ref={encryptedBackupInputRef}
        type="file"
        accept=".ccvault.json,application/json"
        style={{ display: 'none' }}
        onChange={event => {
          void handleImportEncryptedVault(event.target.files)
          event.target.value = ''
        }}
      />
      <div
        style={{
          flex: 1,
          minHeight: 0,
          margin: '-20px -28px',
          display: 'flex',
          overflow: 'hidden',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
      >
        {!focusMode && (
          <>
            {/* File tree */}
            <div
              style={{
                width: treeWidth,
                minWidth: treeWidth,
                borderRight: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <FileTree
                notes={fileTreeNotes}
                folders={folders}
                templates={vaultTemplates}
                pinnedNoteIds={pinnedNoteSet}
                recentNoteIds={recentNoteIds}
                recentLimit={normalizedRecentLimit}
                onRecentLimitChange={setRecentLimit}
                selectedId={selectedId}
                onSelect={id => {
                  if (selectedId && selectedId !== id) void flushPendingSave(selectedId)
                  setSelectedId(id)
                  setViewMode('editor')
                }}
                onCreate={handleCreate}
                onCreateFolder={handleCreateFolder}
                onDelete={handleDeleteNote}
                onDeleteFolder={handleDeleteFolder}
                onRestoreFolder={handleRestoreFolder}
                onRename={handleRenameNote}
                onRenameFolder={handleRenameFolder}
                onDuplicate={handleDuplicateNote}
                onMove={handleMoveNote}
                onMoveToFolder={handleMoveNoteToFolder}
                onRestoreNoteToFolder={handleRestoreNoteToFolder}
                onCreateDailyNote={handleCreateDailyNote}
                onCreateTemplate={handleCreateTemplate}
                onCopyMarkdown={handleCopyMarkdown}
                onExportMarkdown={handleExportMarkdown}
                onTogglePin={handleTogglePin}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                searchUsesBackend={searchUsesBackend}
              />
            </div>

            {/* Resize handle */}
            <div
              onMouseDown={handleResize}
              style={{
                width: 4,
                cursor: 'col-resize',
                background: 'transparent',
                flexShrink: 0,
                marginLeft: -2,
                marginRight: -2,
                zIndex: 10,
                position: 'relative',
              }}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize file tree"
            />
          </>
        )}

        {/* Main area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Toolbar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 16px',
              gap: 2,
              flexShrink: 0,
              height: 40,
              borderBottom: '1px solid var(--border)',
            }}
          >
            {/* Breadcrumb / Title */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0, gap: 6 }}>
              {selected ? (
                <>
                  {selected.folder && (
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        opacity: 0.5,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {selected.folder} /
                    </span>
                  )}
                  {editingTitle ? (
                    <input
                      ref={titleRef}
                      value={titleDraft}
                      onChange={e => setTitleDraft(e.target.value)}
                      onBlur={() => {
                        void handleTitleCommit()
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void handleTitleCommit()
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          setTitleDraft(selected.title)
                          setEditingTitle(false)
                        }
                      }}
                      aria-label="Note title"
                      autoFocus
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-primary)',
                        fontSize: 13,
                        fontWeight: 500,
                        fontFamily: 'inherit',
                        flex: 1,
                        padding: '2px 0',
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => {
                        setTitleDraft(selected.title)
                        setEditingTitle(true)
                        setTimeout(() => titleRef.current?.select(), 20)
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-primary)',
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'text',
                        padding: '2px 4px',
                        borderRadius: 'var(--radius-sm)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textAlign: 'left',
                      }}
                    >
                      {selected.title || 'Untitled'}
                    </button>
                  )}
                </>
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: 13, opacity: 0.5 }}>Select a note</span>
              )}
            </div>

            {/* Sync indicator */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color:
                  saveState === 'error'
                    ? 'var(--red)'
                    : syncing || saveState === 'saving'
                      ? 'var(--accent)'
                      : 'var(--text-muted)',
                fontSize: 10,
                marginRight: 4,
                opacity: syncing || saveState !== 'saved' ? 1 : 0.55,
              }}
              title={syncing ? 'Syncing...' : saveLabel}
            >
              {syncing || saveState === 'saving' || saveState === 'saved' ? (
                <Cloud size={12} />
              ) : (
                <CloudSlash size={12} />
              )}
              <span>{syncing ? 'Syncing' : saveLabel}</span>
            </div>

            {selected?.type === 'note' && localCollabSupported && (
              <button
                type="button"
                onClick={() => {
                  void handleManualCollabSync()
                }}
                title={
                  localCollabLastSyncError
                    ? `Collaboration sync failed: ${localCollabLastSyncError}`
                    : localCollabLastSyncedAt
                      ? `${localCollabProviderSummary.detail} Last checked ${new Date(localCollabLastSyncedAt).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}`
                      : localCollabProviderSummary.detail
                }
                disabled={localCollabSyncing}
                style={{
                  color:
                    localCollabLastSyncError || localCollabProviderSummary.state === 'offline'
                      ? 'var(--red)'
                      : localCollabProviderSummary.state === 'degraded'
                        ? 'var(--amber)'
                        : localCollabProviderSummary.state === 'ready'
                          ? 'var(--accent)'
                          : 'var(--text-muted)',
                  fontSize: 10,
                  padding: '2px 6px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-white-03)',
                  cursor: localCollabSyncing ? 'wait' : 'pointer',
                }}
              >
                {localCollabSyncing ? 'Syncing collab' : localCollabProviderSummary.label}
              </button>
            )}

            {localCollabPeers.length > 0 && (
              <div
                title={localCollabPeers.map(peer => peer.name).join(', ')}
                style={{
                  color: 'var(--accent)',
                  fontSize: 10,
                  padding: '2px 6px',
                  border: '1px solid var(--accent-a20)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent-a08)',
                }}
              >
                {localCollabPeers.length} local editor{localCollabPeers.length === 1 ? '' : 's'}
              </div>
            )}
            {localCollabDrafts.length > 0 && (
              <button
                type="button"
                onClick={() => setCollabReviewOpen(true)}
                title={localCollabDrafts.map(draft => `${draft.peer.name} sent a local draft`).join(', ')}
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 10,
                  padding: '2px 6px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-white-03)',
                  cursor: 'pointer',
                }}
              >
                {localCollabDrafts.length} incoming draft{localCollabDrafts.length === 1 ? '' : 's'}
              </button>
            )}

            {selected?.type === 'note' && (
              <div
                style={{
                  display: 'flex',
                  background: 'var(--bg-white-02)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 2,
                  gap: 1,
                  border: '1px solid var(--border)',
                }}
              >
                <IconButton label="Download DOCX" onClick={() => handleExportDocx(selected._id)}>
                  <FileDoc size={12} />
                </IconButton>
                <IconButton label="Version history" onClick={handleOpenVersionHistory}>
                  <GitBranch size={12} />
                </IconButton>
                <IconButton label="Comments" onClick={handleOpenComments}>
                  <ChatCircleText size={12} />
                </IconButton>
                <IconButton label="Document info" onClick={() => setInfoPanelOpen(open => !open)}>
                  <FileText size={12} />
                </IconButton>
                <IconButton label="Suggestions" onClick={handleOpenSuggestions}>
                  <NotePencil size={12} />
                </IconButton>
                <IconButton
                  label="Download private share package"
                  onClick={() => {
                    void handleExportReviewPackage(selected._id)
                  }}
                >
                  <ShareNetwork size={12} />
                </IconButton>
                <IconButton label="Print or save PDF" onClick={() => handleExportPdf(selected._id)}>
                  <FilePdf size={12} />
                </IconButton>
                <IconButton label="Download Markdown" onClick={() => handleExportMarkdown(selected._id)}>
                  <FileText size={12} />
                </IconButton>
                <IconButton label="Download HTML" onClick={() => handleExportHtml(selected._id)}>
                  <FileHtml size={12} />
                </IconButton>
              </div>
            )}

            {/* View toggle */}
            <div
              style={{
                display: 'flex',
                background: 'var(--bg-white-02)',
                borderRadius: 'var(--radius-sm)',
                padding: 2,
                gap: 1,
                border: '1px solid var(--border)',
              }}
            >
              <button
                onClick={() => setViewMode('editor')}
                aria-label="Editor view"
                style={{
                  background: viewMode === 'editor' ? 'var(--bg-white-04)' : 'transparent',
                  border: 'none',
                  color: viewMode === 'editor' ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '3px 8px',
                  borderRadius: 'calc(var(--radius-sm) - 2px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: viewMode === 'editor' ? 500 : 400,
                  transition: 'all var(--duration-fast)',
                }}
              >
                <PenNib size={11} />
                Edit
              </button>
              <button
                onClick={() => setViewMode('graph')}
                aria-label="Graph view"
                style={{
                  background: viewMode === 'graph' ? 'var(--bg-white-04)' : 'transparent',
                  border: 'none',
                  color: viewMode === 'graph' ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '3px 8px',
                  borderRadius: 'calc(var(--radius-sm) - 2px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: viewMode === 'graph' ? 500 : 400,
                  transition: 'all var(--duration-fast)',
                }}
              >
                <GitBranch size={11} />
                Graph
              </button>
              <button
                onClick={() => setViewMode('data')}
                aria-label="Data view"
                style={{
                  background: viewMode === 'data' ? 'var(--bg-white-04)' : 'transparent',
                  border: 'none',
                  color: viewMode === 'data' ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '3px 8px',
                  borderRadius: 'calc(var(--radius-sm) - 2px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: viewMode === 'data' ? 500 : 400,
                  transition: 'all var(--duration-fast)',
                }}
              >
                <Table size={11} />
                Data
              </button>
              <button
                onClick={() => {
                  void handleOpenCanvasView()
                }}
                aria-label="Canvas view"
                style={{
                  background: viewMode === 'canvas' ? 'var(--bg-white-04)' : 'transparent',
                  border: 'none',
                  color: viewMode === 'canvas' ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '3px 8px',
                  borderRadius: 'calc(var(--radius-sm) - 2px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: viewMode === 'canvas' ? 500 : 400,
                  transition: 'all var(--duration-fast)',
                }}
              >
                <SquaresFour size={11} />
                Canvas
              </button>
            </div>

            {/* Delete */}
            {selected && isNoteInTrash(selected) && (
              <button
                type="button"
                onClick={() => {
                  void handleRestoreFromTrash()
                }}
                className="hover-bg"
                aria-label="Restore item from Trash"
                title="Restore item from Trash"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '5px 8px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  opacity: 0.82,
                  transition: 'opacity var(--duration-fast)',
                }}
              >
                <ArrowCounterClockwise size={13} />
                Restore
              </button>
            )}
            {selected && (
              <button
                type="button"
                onClick={() => {
                  void handleDeleteNote()
                }}
                className="hover-bg"
                aria-label={isNoteInTrash(selected) ? 'Permanently delete note' : 'Move note to Trash'}
                title={isNoteInTrash(selected) ? 'Permanently delete note' : 'Move note to Trash'}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '5px 8px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  opacity: 0.72,
                  transition: 'opacity var(--duration-fast)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.opacity = '1'
                  e.currentTarget.style.color = 'var(--red)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.opacity = '0.72'
                  e.currentTarget.style.color = 'var(--text-muted)'
                }}
              >
                <Trash size={13} />
                {isNoteInTrash(selected) ? 'Delete' : 'Trash'}
              </button>
            )}
          </div>

          {/* Content */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {viewMode === 'editor' ? (
              selected ? (
                selected.type === 'attachment' ? (
                  <AttachmentPreview id={selected._id} />
                ) : (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <NoteEditor
                      note={selected}
                      onChange={handleContentChange}
                      onWikilinkClick={handleWikilinkClick}
                      preferences={normalizedEditorPreferences}
                      onSelectionChange={handleSelectionAnchorChange}
                      reviewMarkers={reviewMarkers}
                      activeReviewId={activeReviewId}
                      allNoteTitles={allNoteTitles}
                      allNotes={notes}
                    />
                    <BacklinksPanel
                      currentNoteTitle={selected.title}
                      allNotes={notes}
                      onNavigate={id => {
                        if (selectedId && selectedId !== id) void flushPendingSave(selectedId)
                        setSelectedId(id)
                        setViewMode('editor')
                      }}
                      onLinkMention={handleLinkUnlinkedMention}
                    />
                  </div>
                )
              ) : (
                <EmptyState onCreateNote={() => handleCreate()} />
              )
            ) : viewMode === 'graph' ? (
              <Suspense
                fallback={
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-muted)',
                      fontSize: 12,
                    }}
                  >
                    Loading graph...
                  </div>
                }
              >
                <GraphView notes={notes} selectedId={selectedId} onSelectNote={handleGraphSelect} />
              </Suspense>
            ) : viewMode === 'canvas' ? (
              <Suspense
                fallback={
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-muted)',
                      fontSize: 12,
                    }}
                  >
                    Loading canvas...
                  </div>
                }
              >
                <CanvasView
                  notes={notes}
                  boardNote={canvasBoardNote}
                  selectedId={selectedId}
                  onSelectNote={handleGraphSelect}
                  onSaveBoard={handleSaveCanvasBoard}
                  onCreateBoard={handleCreateCanvasBoard}
                />
              </Suspense>
            ) : (
              <VaultDataView
                notes={notes}
                query={searchQuery}
                onToggleTask={handleToggleTaskDone}
                onSelect={id => {
                  if (selectedId && selectedId !== id) void flushPendingSave(selectedId)
                  setSelectedId(id)
                  setViewMode('editor')
                }}
              />
            )}
            {infoPanelOpen && selected && (
              <DocumentInfoPanel
                note={selected}
                onClose={() => setInfoPanelOpen(false)}
                onSetProperty={(key, value) => {
                  void saveDocumentProperty(key, value)
                }}
                onRemoveProperty={key => {
                  void saveDocumentProperty(key, '', 'remove')
                }}
              />
            )}
          </div>
        </div>
      </div>
      {commandOpen && (
        <NotesCommandPalette
          query={commandQuery}
          items={commandItems}
          onQueryChange={setCommandQuery}
          onClose={() => setCommandOpen(false)}
        />
      )}
      {historyOpen && (
        <VersionHistoryDialog
          noteTitle={selected?.title || 'Note'}
          currentContent={selected?.content || ''}
          revisions={historyRevisions}
          preview={historyPreview}
          loading={historyLoading}
          error={historyError}
          onCreateCheckpoint={handleCreateVersionCheckpoint}
          onPreview={handlePreviewRevision}
          onRename={handleRenameRevision}
          onRestore={handleRestoreRevision}
          onClose={() => setHistoryOpen(false)}
        />
      )}
      {commentsOpen && (
        <CommentsDialog
          noteTitle={selected?.title || 'Note'}
          comments={noteComments}
          loading={commentsLoading}
          error={commentsError}
          onAdd={handleAddComment}
          onResolve={handleResolveComment}
          onReply={handleReplyToComment}
          onJump={handleJumpToReviewAnchor}
          onClose={() => setCommentsOpen(false)}
        />
      )}
      {suggestionsOpen && (
        <SuggestionsDialog
          noteTitle={selected?.title || 'Note'}
          suggestions={noteSuggestions}
          loading={suggestionsLoading}
          error={suggestionsError}
          onAdd={handleAddSuggestion}
          onApply={handleApplySuggestion}
          onReject={handleRejectSuggestion}
          onJump={handleJumpToReviewAnchor}
          onClose={() => setSuggestionsOpen(false)}
        />
      )}
      {vaultStatusOpen && (
        <VaultStatusDialog
          status={vaultStatus}
          auditEvents={vaultAuditEvents}
          syncLedger={vaultSyncLedger}
          loading={vaultStatusLoading}
          error={vaultStatusError}
          onRefresh={handleOpenVaultStatus}
          onClose={() => setVaultStatusOpen(false)}
        />
      )}
      {shortcutsOpen && <NotesShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      {preferencesOpen && (
        <NotesPreferencesDialog
          preferences={normalizedEditorPreferences}
          providerStatuses={localCollabProviderStatuses}
          onChange={setEditorPreferences}
          onClose={() => setPreferencesOpen(false)}
        />
      )}
      {collabReviewOpen && selected?.type === 'note' && (
        <LocalCollabDraftDialog
          drafts={localCollabDrafts}
          localContent={pendingContentRef.current.get(selected._id) ?? selected.content}
          baseContent={selected.content}
          onApply={handleApplyLocalCollabDraft}
          onDismiss={handleDismissLocalCollabDraft}
          onClose={() => setCollabReviewOpen(false)}
        />
      )}
      {draftRecoveryOpen && (
        <DraftRecoveryDialog
          drafts={recoverableDrafts}
          onRestore={handleRestoreDraft}
          onDiscard={handleDiscardDraft}
          onRefresh={loadRecoverableDrafts}
          onClose={() => setDraftRecoveryOpen(false)}
        />
      )}
    </>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="hover-bg"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: 24,
        height: 24,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: 'calc(var(--radius-sm) - 2px)',
        background: 'transparent',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {children}
    </button>
  )
}

function VersionHistoryDialog({
  noteTitle,
  currentContent,
  revisions,
  preview,
  loading,
  error,
  onCreateCheckpoint,
  onPreview,
  onRename,
  onRestore,
  onClose,
}: {
  noteTitle: string
  currentContent: string
  revisions: VaultRevision[]
  preview: VaultRevisionDetail | null
  loading: boolean
  error: string | null
  onCreateCheckpoint: () => void
  onPreview: (rev: string) => void
  onRename: (rev: string, currentLabel?: string | null) => void
  onRestore: (rev: string) => void
  onClose: () => void
}) {
  const [compareMode, setCompareMode] = useState(false)
  const diffRows = useMemo(
    () => (preview ? buildVersionDiff(preview.content, currentContent) : []),
    [currentContent, preview],
  )
  const diffSummary = useMemo(() => summarizeVersionDiff(diffRows), [diffRows])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Version history"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'flex',
        justifyContent: 'flex-end',
        background: 'rgba(0, 0, 0, 0.34)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <aside
        style={{
          width: 'min(760px, calc(100vw - 24px))',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          boxShadow: '-18px 0 60px var(--overlay-heavy)',
        }}
      >
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Version history</div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {noteTitle}
          </div>
        </div>
        <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onCreateCheckpoint}
            style={{
              background: 'var(--bg-white-04)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '7px 10px',
              fontSize: 12,
            }}
          >
            Name current version
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr' }}>
          <div style={{ overflow: 'auto', borderRight: '1px solid var(--border)', padding: 12 }}>
            {loading && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 12 }}>Loading versions...</div>
            )}
            {error && <div style={{ color: 'var(--red)', fontSize: 12, lineHeight: 1.5, padding: 12 }}>{error}</div>}
            {!loading && !error && revisions.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5, padding: 12 }}>
                No local versions yet. Autosave and named checkpoints appear here.
              </div>
            )}
            {!loading &&
              !error &&
              revisions.map((revision, index) => {
                const selected = preview?.rev === revision.rev
                const title =
                  revision.label ||
                  (index === 0 ? 'Current version' : `Version ${revision.version_number ?? revisions.length - index}`)
                return (
                  <button
                    key={revision.rev}
                    type="button"
                    onClick={() => onPreview(revision.rev)}
                    style={{
                      width: '100%',
                      display: 'block',
                      padding: '10px 8px',
                      border: 'none',
                      borderBottom: '1px solid var(--border)',
                      borderRadius: 0,
                      background: selected ? 'var(--bg-white-04)' : 'transparent',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {title}
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginTop: 3,
                      }}
                    >
                      {revision.reason || revision.status}
                      {revision.created_at
                        ? ` - ${new Date(revision.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                        : ''}
                    </span>
                  </button>
                )
              })}
          </div>
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {preview ? (
              <>
                <div
                  style={{
                    padding: 12,
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        color: 'var(--text-secondary)',
                        fontSize: 13,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {preview.label || `Version ${preview.version_number ?? ''}`}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>
                      {preview.reason || 'version'}
                      {preview.created_at ? ` - ${new Date(preview.created_at).toLocaleString()}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCompareMode(value => !value)}
                    style={{
                      background: compareMode ? 'var(--accent-dim)' : 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: compareMode ? 'var(--text-on-color)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '5px 9px',
                      fontSize: 11,
                    }}
                  >
                    {compareMode ? 'Preview' : 'Compare'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRename(preview.rev, preview.label)}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '5px 9px',
                      fontSize: 11,
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => onRestore(preview.rev)}
                    style={{
                      background: 'var(--bg-white-04)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '5px 9px',
                      fontSize: 11,
                    }}
                  >
                    Restore
                  </button>
                </div>
                <div
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    lineHeight: 1.45,
                  }}
                >
                  {VERSION_RESTORE_SAFETY_NOTE}
                </div>
                {compareMode ? (
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      overflow: 'auto',
                      padding: 12,
                      background: 'var(--bg-base)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      lineHeight: 1.55,
                    }}
                  >
                    <div style={{ color: 'var(--text-muted)', fontFamily: 'inherit', fontSize: 11, marginBottom: 10 }}>
                      {diffSummary.added} added, {diffSummary.removed} removed
                    </div>
                    {diffRows.map((row, index) => (
                      <div
                        key={`${row.kind}-${index}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '22px 1fr',
                          gap: 8,
                          padding: '1px 6px',
                          borderRadius: 'var(--radius-sm)',
                          color:
                            row.kind === 'removed'
                              ? 'var(--red)'
                              : row.kind === 'added'
                                ? 'var(--green)'
                                : 'var(--text-secondary)',
                          background:
                            row.kind === 'removed'
                              ? 'rgba(239, 68, 68, 0.10)'
                              : row.kind === 'added'
                                ? 'rgba(34, 197, 94, 0.10)'
                                : 'transparent',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        <span style={{ color: 'var(--text-muted)', userSelect: 'none' }}>
                          {row.kind === 'removed' ? '-' : row.kind === 'added' ? '+' : ' '}
                        </span>
                        <span>{row.text || ' '}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <pre
                    style={{
                      flex: 1,
                      minHeight: 0,
                      margin: 0,
                      overflow: 'auto',
                      padding: 16,
                      background: 'var(--bg-base)',
                      color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {preview.content}
                  </pre>
                )}
              </>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                  fontSize: 12,
                }}
              >
                Select a version to preview
              </div>
            )}
          </div>
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--bg-white-04)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '7px 12px',
              fontSize: 12,
            }}
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  )
}

function CommentsDialog({
  noteTitle,
  comments,
  loading,
  error,
  onAdd,
  onResolve,
  onReply,
  onJump,
  onClose,
}: {
  noteTitle: string
  comments: VaultComment[]
  loading: boolean
  error: string | null
  onAdd: () => void
  onResolve: (id: string) => void
  onReply: (id: string) => void
  onJump: (id: string) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Comments"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'flex',
        justifyContent: 'flex-end',
        background: 'rgba(0, 0, 0, 0.34)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <aside
        style={{
          width: 'min(380px, calc(100vw - 24px))',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          boxShadow: '-18px 0 60px var(--overlay-heavy)',
        }}
      >
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Comments</div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {noteTitle}
          </div>
        </div>
        <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={onAdd}
            style={{
              width: '100%',
              background: 'var(--bg-white-04)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '8px 10px',
              fontSize: 12,
            }}
          >
            Add comment
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {loading && <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 12 }}>Loading comments...</div>}
          {error && <div style={{ color: 'var(--red)', fontSize: 12, lineHeight: 1.5, padding: 12 }}>{error}</div>}
          {!loading && !error && comments.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5, padding: 12 }}>
              No comments yet.
            </div>
          )}
          {!loading &&
            !error &&
            comments.map(comment => {
              const resolved = Boolean(comment.resolved_at) || comment.status === 'resolved'
              const quote = typeof comment.anchor?.quote === 'string' ? comment.anchor.quote : ''
              return (
                <div
                  key={comment.id}
                  style={{
                    padding: '10px 8px',
                    borderBottom: '1px solid var(--border)',
                    opacity: resolved ? 0.58 : 1,
                  }}
                >
                  <div
                    style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}
                  >
                    {comment.body}
                  </div>
                  {quote && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: '6px 8px',
                        borderLeft: '2px solid var(--accent-dim)',
                        background: 'var(--bg-white-02)',
                        color: 'var(--text-muted)',
                        fontSize: 11,
                        lineHeight: 1.45,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {quote.length > 220 ? `${quote.slice(0, 220)}...` : quote}
                    </div>
                  )}
                  {Array.isArray(comment.replies) && comment.replies.length > 0 && (
                    <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                      {comment.replies.map(reply => (
                        <div
                          key={reply.id}
                          style={{
                            padding: '6px 8px',
                            borderLeft: '2px solid var(--border)',
                            background: 'var(--bg-white-02)',
                            color: 'var(--text-secondary)',
                            fontSize: 11,
                            lineHeight: 1.45,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          <div>{reply.body}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 4 }}>
                            {new Date(reply.created_at).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <span style={{ flex: 1, minWidth: 0, color: 'var(--text-muted)', fontSize: 11 }}>
                      {new Date(comment.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                    {quote && (
                      <button
                        type="button"
                        onClick={() => {
                          onJump(comment.id)
                          onClose()
                        }}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          padding: '4px 8px',
                          fontSize: 11,
                        }}
                      >
                        Jump
                      </button>
                    )}
                    {!resolved && (
                      <button
                        type="button"
                        onClick={() => onReply(comment.id)}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          padding: '4px 8px',
                          fontSize: 11,
                        }}
                      >
                        Reply
                      </button>
                    )}
                    {!resolved && (
                      <button
                        type="button"
                        onClick={() => onResolve(comment.id)}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          padding: '4px 8px',
                          fontSize: 11,
                        }}
                      >
                        Resolve
                      </button>
                    )}
                    {resolved && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Resolved</span>}
                  </div>
                </div>
              )
            })}
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--bg-white-04)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '7px 12px',
              fontSize: 12,
            }}
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  )
}

function SuggestionsDialog({
  noteTitle,
  suggestions,
  loading,
  error,
  onAdd,
  onApply,
  onReject,
  onJump,
  onClose,
}: {
  noteTitle: string
  suggestions: VaultSuggestion[]
  loading: boolean
  error: string | null
  onAdd: () => void
  onApply: (id: string) => void
  onReject: (id: string) => void
  onJump: (id: string) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Suggestions"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'flex',
        justifyContent: 'flex-end',
        background: 'rgba(0, 0, 0, 0.34)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <aside
        style={{
          width: 'min(420px, calc(100vw - 24px))',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          boxShadow: '-18px 0 60px var(--overlay-heavy)',
        }}
      >
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Suggestions</div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {noteTitle}
          </div>
        </div>
        <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={onAdd}
            style={{
              width: '100%',
              background: 'var(--bg-white-04)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '8px 10px',
              fontSize: 12,
            }}
          >
            Suggest edit
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {loading && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 12 }}>Loading suggestions...</div>
          )}
          {error && <div style={{ color: 'var(--red)', fontSize: 12, lineHeight: 1.5, padding: 12 }}>{error}</div>}
          {!loading && !error && suggestions.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5, padding: 12 }}>
              No suggestions yet.
            </div>
          )}
          {!loading &&
            !error &&
            suggestions.map(suggestion => {
              const open = suggestion.status === 'open'
              const body = typeof suggestion.patch.body === 'string' ? suggestion.patch.body : ''
              const content = typeof suggestion.patch.content === 'string' ? suggestion.patch.content : ''
              const quote = typeof suggestion.anchor?.quote === 'string' ? suggestion.anchor.quote : ''
              const diffBase = suggestion.patch.type === 'replace_selection' ? quote : ''
              const diff = suggestionDiff(diffBase, content)
              const label =
                suggestion.patch.type === 'replace_selection'
                  ? 'Selection replacement'
                  : suggestion.patch.type === 'replace_document'
                    ? 'Document replacement'
                    : suggestion.patch.type === 'insert_at_cursor'
                      ? 'Cursor insertion'
                      : String(suggestion.patch.type || 'Suggestion')
              return (
                <div
                  key={suggestion.id}
                  style={{
                    padding: '10px 8px',
                    borderBottom: '1px solid var(--border)',
                    opacity: open ? 1 : 0.58,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <span
                      style={{ flex: 1, minWidth: 0, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}
                    >
                      {label}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{suggestion.status}</span>
                  </div>
                  {body && (
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        lineHeight: 1.45,
                        whiteSpace: 'pre-wrap',
                        marginBottom: 8,
                      }}
                    >
                      {body}
                    </div>
                  )}
                  {quote && (
                    <div
                      style={{
                        marginBottom: 8,
                        padding: '6px 8px',
                        borderLeft: '2px solid var(--accent-dim)',
                        background: 'var(--bg-white-02)',
                        color: 'var(--text-muted)',
                        fontSize: 11,
                        lineHeight: 1.45,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {quote.length > 220 ? `${quote.slice(0, 220)}...` : quote}
                    </div>
                  )}
                  {content && (
                    <div
                      style={{
                        margin: 0,
                        maxHeight: 150,
                        overflow: 'auto',
                        background: 'var(--bg-white-02)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: 8,
                        fontSize: 11,
                        lineHeight: 1.45,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {diff.map((line, index) => (
                        <div
                          key={`${line.kind}-${index}-${line.text}`}
                          style={{
                            color:
                              line.kind === 'added'
                                ? 'var(--green)'
                                : line.kind === 'removed'
                                  ? 'var(--red)'
                                  : 'var(--text-muted)',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '- ' : '  '}
                          {line.text || ' '}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <span style={{ flex: 1, minWidth: 0, color: 'var(--text-muted)', fontSize: 11 }}>
                      {new Date(suggestion.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                    {quote && (
                      <button
                        type="button"
                        onClick={() => {
                          onJump(suggestion.id)
                          onClose()
                        }}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          padding: '4px 8px',
                          fontSize: 11,
                        }}
                      >
                        Jump
                      </button>
                    )}
                    {open && (
                      <>
                        <button
                          type="button"
                          onClick={() => onReject(suggestion.id)}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            padding: '4px 8px',
                            fontSize: 11,
                          }}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => onApply(suggestion.id)}
                          style={{
                            background: 'var(--accent-dim)',
                            border: '1px solid transparent',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-on-color)',
                            cursor: 'pointer',
                            padding: '4px 8px',
                            fontSize: 11,
                          }}
                        >
                          Accept
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--bg-white-04)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '7px 12px',
              fontSize: 12,
            }}
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

function NotesShortcutsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const groups = groupedNotesShortcuts()

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.42)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <aside
        style={{
          width: 'min(680px, 100%)',
          maxHeight: '80vh',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>Keyboard shortcuts</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Local notes, editor, and review actions</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hover-bg"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px 10px',
              fontSize: 12,
            }}
          >
            Close
          </button>
        </div>
        <div
          style={{
            padding: 16,
            overflow: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 12,
          }}
        >
          {Object.entries(groups).map(([scope, shortcuts]) => (
            <section
              key={scope}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-white-02)',
                padding: 10,
              }}
            >
              <div style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 650, marginBottom: 8 }}>
                {scope}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {shortcuts.map(shortcut => (
                  <div
                    key={`${shortcut.scope}-${shortcut.keys}-${shortcut.action}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '92px minmax(0, 1fr)',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <kbd
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-base)',
                        color: 'var(--text-primary)',
                        padding: '4px 5px',
                        fontSize: 10,
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {shortcut.keys}
                    </kbd>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.35 }}>
                      {shortcut.action}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </aside>
    </div>
  )
}

function NotesPreferencesDialog({
  preferences,
  providerStatuses,
  onChange,
  onClose,
}: {
  preferences: NotesEditorPreferences
  providerStatuses: LocalCollabTransportStatus[]
  onChange: (preferences: NotesEditorPreferences) => void
  onClose: () => void
}) {
  const [pairings, setPairings] = useState<VaultCollaborationPairing[]>([])
  const [pairingBusy, setPairingBusy] = useState(false)
  const [pairingError, setPairingError] = useState<string | null>(null)
  const [providerHealth, setProviderHealth] = useState<VaultCollaborationProviderHealth | null>(null)
  const [providerHealthBusy, setProviderHealthBusy] = useState(false)
  const update = (patch: Partial<NotesEditorPreferences>) => {
    onChange(normalizeNotesEditorPreferences({ ...preferences, ...patch }))
  }
  const remoteSetup = notesRemoteCollaborationSetupStatus(preferences)

  const refreshPairings = useCallback(async () => {
    try {
      const next = await getVaultCollaborationPairings()
      setPairings(next)
      setPairingError(null)
    } catch (error) {
      setPairingError(error instanceof Error ? error.message : 'Could not load approved pairings')
    }
  }, [])

  const checkProviderHealth = async (nextPreferences: NotesEditorPreferences = preferences) => {
    setProviderHealthBusy(true)
    const health = await testVaultCollaborationRemoteProvider({
      baseUrl: nextPreferences.remoteCollaborationBaseUrl,
      apiKey: getRemoteApiKey(),
      pairingKey: nextPreferences.remoteCollaborationPairingKey,
      timeoutMs: 8_000,
    })
    setProviderHealth(health)
    setProviderHealthBusy(false)
  }

  const createPairingInvite = async () => {
    try {
      setPairingBusy(true)
      const { invite, encoded } = createNotesRemoteCollaborationPairingInvite({
        providerUrl: preferences.remoteCollaborationBaseUrl,
        pairingKey: preferences.remoteCollaborationPairingKey,
        deviceLabel: 'ClawControl Notes',
      })
      const nextPreferences = normalizeNotesEditorPreferences({
        ...preferences,
        remoteCollaborationEnabled: true,
        remoteCollaborationBaseUrl: invite.providerUrl,
        remoteCollaborationPairingKey: invite.pairingKey,
      })
      onChange(nextPreferences)
      await approveVaultCollaborationPairing(invite.pairingKey, invite.deviceLabel)
      await refreshPairings()
      void checkProviderHealth(nextPreferences)
      window.prompt('Pairing invite', encoded)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not create pairing invite')
    } finally {
      setPairingBusy(false)
    }
  }

  const approveCurrentPairing = async () => {
    if (!isNotesRemoteCollaborationPairingKey(preferences.remoteCollaborationPairingKey)) {
      setPairingError('Use a valid pairing key before approving this vault.')
      return
    }
    const deviceLabel = window.prompt('Device label', 'ClawControl Notes')?.trim() || 'ClawControl Notes'
    setPairingBusy(true)
    try {
      await approveVaultCollaborationPairing(preferences.remoteCollaborationPairingKey, deviceLabel)
      await refreshPairings()
      void checkProviderHealth()
    } catch (error) {
      setPairingError(error instanceof Error ? error.message : 'Could not approve pairing')
    } finally {
      setPairingBusy(false)
    }
  }

  const revokeCurrentPairing = async () => {
    if (!isNotesRemoteCollaborationPairingKey(preferences.remoteCollaborationPairingKey)) {
      setPairingError('Use a valid pairing key before revoking this vault.')
      return
    }
    if (!window.confirm('Revoke this pairing key for the local vault?')) return
    setPairingBusy(true)
    try {
      await revokeVaultCollaborationPairing({ pairingKey: preferences.remoteCollaborationPairingKey })
      await refreshPairings()
    } catch (error) {
      setPairingError(error instanceof Error ? error.message : 'Could not revoke pairing')
    } finally {
      setPairingBusy(false)
    }
  }

  const acceptPairingInvite = async () => {
    const raw = window.prompt('Paste pairing invite')
    if (!raw?.trim()) return
    setPairingBusy(true)
    try {
      const invite = parseNotesRemoteCollaborationPairingInvite(raw)
      const nextPreferences = normalizeNotesEditorPreferences({
        ...preferences,
        remoteCollaborationEnabled: true,
        remoteCollaborationBaseUrl: invite.providerUrl,
        remoteCollaborationPairingKey: invite.pairingKey,
      })
      onChange(nextPreferences)
      await approveVaultCollaborationPairing(invite.pairingKey, invite.deviceLabel)
      await refreshPairings()
      void checkProviderHealth(nextPreferences)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not accept pairing invite')
    } finally {
      setPairingBusy(false)
    }
  }

  const testProvider = async () => {
    await checkProviderHealth()
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    void refreshPairings()
  }, [refreshPairings])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.42)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <aside
        style={{
          width: 'min(520px, 100%)',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>Editor preferences</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Local-only settings for this vault UI</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hover-bg"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px 10px',
              fontSize: 12,
            }}
          >
            Close
          </button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 12 }}>
          <PreferenceSelect
            label="Default editor mode"
            value={preferences.defaultMode}
            options={[
              ['doc', 'Document'],
              ['source', 'Markdown'],
              ['split', 'Split'],
              ['read', 'Read'],
            ]}
            onChange={value => update({ defaultMode: value as NotesEditorPreferences['defaultMode'] })}
          />
          <PreferenceSelect
            label="Markdown line width"
            value={preferences.markdownWidth}
            options={[
              ['narrow', 'Narrow'],
              ['normal', 'Normal'],
              ['wide', 'Wide'],
            ]}
            onChange={value => update({ markdownWidth: value as NotesEditorPreferences['markdownWidth'] })}
          />
          <PreferenceSelect
            label="Markdown font size"
            value={preferences.markdownFontSize}
            options={[
              ['small', 'Small'],
              ['normal', 'Normal'],
              ['large', 'Large'],
            ]}
            onChange={value => update({ markdownFontSize: value as NotesEditorPreferences['markdownFontSize'] })}
          />
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 12 }}
          >
            <input
              type="checkbox"
              checked={preferences.spellcheck}
              onChange={event => update({ spellcheck: event.target.checked })}
            />
            Spellcheck Markdown editor
          </label>
          <div
            style={{
              borderTop: '1px solid var(--border)',
              paddingTop: 12,
              display: 'grid',
              gap: 8,
            }}
          >
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 12 }}
            >
              <input
                type="checkbox"
                checked={preferences.remoteCollaborationEnabled}
                onChange={event => update({ remoteCollaborationEnabled: event.target.checked })}
              />
              Remote collaboration provider
            </label>
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: remoteSetup.ready ? 'color-mix(in srgb, var(--success) 10%, transparent)' : 'var(--bg-white-04)',
                color: 'var(--text-secondary)',
                padding: '8px 10px',
                display: 'grid',
                gap: 3,
              }}
            >
              <div
                style={{
                  color: remoteSetup.ready ? 'var(--success)' : 'var(--text-primary)',
                  fontSize: 12,
                  fontWeight: 650,
                }}
              >
                {remoteSetup.label}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.35 }}>{remoteSetup.detail}</div>
            </div>
            {providerStatuses.length > 0 && (
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '7px 9px',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    fontWeight: 650,
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  Provider health
                </div>
                {providerStatuses.map(status => (
                  <div
                    key={status.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(100px, 1fr) auto',
                      gap: 8,
                      padding: '7px 9px',
                      borderBottom: '1px solid var(--border)',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          color: 'var(--text-secondary)',
                          fontSize: 12,
                          fontWeight: 650,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {status.id}
                      </div>
                      <div
                        style={{
                          color: status.lastError ? 'var(--danger)' : 'var(--text-muted)',
                          fontSize: 11,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatCollabProviderDetail(status)}
                      </div>
                    </div>
                    <span
                      style={{
                        color: status.ok ? 'var(--success)' : 'var(--danger)',
                        fontSize: 11,
                        fontWeight: 650,
                      }}
                    >
                      {status.ok ? 'Online' : 'Needs attention'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {providerHealth && (
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: providerHealth.readinessSeverity === 'success'
                    ? 'color-mix(in srgb, var(--success) 10%, transparent)'
                    : providerHealth.readinessSeverity === 'warning'
                      ? 'color-mix(in srgb, var(--warning) 10%, transparent)'
                      : 'color-mix(in srgb, var(--danger) 10%, transparent)',
                  color: 'var(--text-secondary)',
                  padding: '8px 10px',
                  display: 'grid',
                  gap: 3,
                }}
              >
                <div
                  style={{
                    color:
                      providerHealth.readinessSeverity === 'success'
                        ? 'var(--success)'
                        : providerHealth.readinessSeverity === 'warning'
                          ? 'var(--warning)'
                          : 'var(--danger)',
                    fontSize: 12,
                    fontWeight: 650,
                  }}
                >
                  {providerHealth.readinessLabel}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.35 }}>
                  {providerHealth.readinessDetail ||
                    `Collaboration health checked at ${new Date(providerHealth.checkedAt).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}.`}
                </div>
                {providerHealth.counts && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                      gap: 6,
                      marginTop: 4,
                    }}
                  >
                    <ProviderHealthMetric label="Pairings" value={providerHealth.counts.approvedPairings} />
                    <ProviderHealthMetric label="Events" value={providerHealth.counts.activeEvents} />
                    <ProviderHealthMetric label="Snapshots" value={providerHealth.counts.crdtSnapshots} />
                  </div>
                )}
              </div>
            )}
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Provider URL</span>
              <input
                type="url"
                value={preferences.remoteCollaborationBaseUrl}
                disabled={!preferences.remoteCollaborationEnabled}
                placeholder="https://your-clawcontrol.example"
                onChange={event => update({ remoteCollaborationBaseUrl: event.target.value })}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: preferences.remoteCollaborationEnabled ? 'var(--bg-base)' : 'var(--bg-muted)',
                  color: 'var(--text-primary)',
                  padding: '7px 8px',
                  font: 'inherit',
                  fontSize: 12,
                  minWidth: 0,
                }}
              />
            </label>
            {preferences.remoteCollaborationEnabled &&
              preferences.remoteCollaborationBaseUrl &&
              !isNotesRemoteCollaborationBaseUrl(preferences.remoteCollaborationBaseUrl) && (
                <div style={{ color: 'var(--danger)', fontSize: 11 }}>Use an HTTP(S) provider URL.</div>
              )}
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Pairing key</span>
              <input
                type="password"
                value={preferences.remoteCollaborationPairingKey}
                disabled={!preferences.remoteCollaborationEnabled}
                placeholder="Paste paired-device key"
                onChange={event => update({ remoteCollaborationPairingKey: event.target.value })}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: preferences.remoteCollaborationEnabled ? 'var(--bg-base)' : 'var(--bg-muted)',
                  color: 'var(--text-primary)',
                  padding: '7px 8px',
                  font: 'inherit',
                  fontSize: 12,
                  minWidth: 0,
                }}
              />
            </label>
            {preferences.remoteCollaborationEnabled &&
              preferences.remoteCollaborationPairingKey &&
              !isNotesRemoteCollaborationPairingKey(preferences.remoteCollaborationPairingKey) && (
                <div style={{ color: 'var(--danger)', fontSize: 11 }}>Use a pairing key with 16+ safe characters.</div>
              )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={createPairingInvite}
                disabled={
                  pairingBusy ||
                  !preferences.remoteCollaborationEnabled ||
                  !isNotesRemoteCollaborationBaseUrl(preferences.remoteCollaborationBaseUrl)
                }
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-white-04)',
                  color: 'var(--text-secondary)',
                  cursor: pairingBusy ? 'wait' : preferences.remoteCollaborationEnabled ? 'pointer' : 'not-allowed',
                  padding: '7px 10px',
                  fontSize: 12,
                }}
              >
                Create and approve invite
              </button>
              <button
                type="button"
                onClick={acceptPairingInvite}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-white-04)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '7px 10px',
                  fontSize: 12,
                }}
              >
                Accept invite
              </button>
              <button
                type="button"
                onClick={() => {
                  void testProvider()
                }}
                disabled={
                  providerHealthBusy ||
                  !remoteSetup.ready ||
                  !isNotesRemoteCollaborationBaseUrl(preferences.remoteCollaborationBaseUrl)
                }
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-white-04)',
                  color: 'var(--text-secondary)',
                  cursor: providerHealthBusy ? 'wait' : remoteSetup.ready ? 'pointer' : 'not-allowed',
                  padding: '7px 10px',
                  fontSize: 12,
                }}
              >
                {providerHealthBusy ? 'Testing...' : 'Test provider'}
              </button>
              <button
                type="button"
                onClick={approveCurrentPairing}
                disabled={pairingBusy || !isNotesRemoteCollaborationPairingKey(preferences.remoteCollaborationPairingKey)}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-white-04)',
                  color: 'var(--text-secondary)',
                  cursor: pairingBusy ? 'wait' : 'pointer',
                  padding: '7px 10px',
                  fontSize: 12,
                }}
              >
                Approve local key
              </button>
              <button
                type="button"
                onClick={revokeCurrentPairing}
                disabled={pairingBusy || !isNotesRemoteCollaborationPairingKey(preferences.remoteCollaborationPairingKey)}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'transparent',
                  color: 'var(--danger)',
                  cursor: pairingBusy ? 'wait' : 'pointer',
                  padding: '7px 10px',
                  fontSize: 12,
                }}
              >
                Revoke key
              </button>
            </div>
            {pairingError && <div style={{ color: 'var(--danger)', fontSize: 11 }}>{pairingError}</div>}
            {pairings.length > 0 && (
              <div style={{ display: 'grid', gap: 6 }}>
                {pairings.slice(0, 4).map(pairing => (
                  <div
                    key={pairing.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 8,
                      alignItems: 'center',
                      color: 'var(--text-muted)',
                      fontSize: 11,
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pairing.deviceLabel} - {pairing.keyFingerprint}
                    </span>
                    <span style={{ color: pairing.status === 'approved' ? 'var(--success)' : 'var(--danger)' }}>
                      {pairing.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

function PreferenceSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<[string, string]>
  onChange: (value: string) => void
}) {
  return (
    <label style={{ display: 'grid', gap: 5 }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>{label}</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-base)',
          color: 'var(--text-primary)',
          padding: '7px 8px',
          font: 'inherit',
          fontSize: 12,
        }}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  )
}

function ProviderHealthMetric({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-white-02)',
        padding: '6px 7px',
        minWidth: 0,
      }}
    >
      <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 2 }}>{label}</div>
      <div style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 650 }}>{value}</div>
    </div>
  )
}

function formatCollabProviderTimestamp(status: LocalCollabTransportStatus): string {
  const timestamp = status.lastCrdtStateAt ?? status.lastListedAt ?? status.lastPublishedAt
  if (!timestamp) return 'Waiting for activity'
  return `Last activity ${new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

function formatCollabProviderDetail(status: LocalCollabTransportStatus): string {
  if (status.lastError) return status.lastError
  if (status.pendingMirrorCount) {
    return `${status.pendingMirrorCount} mirror event${status.pendingMirrorCount === 1 ? '' : 's'} pending`
  }
  return formatCollabProviderTimestamp(status)
}

function VaultStatusDialog({
  status,
  auditEvents,
  syncLedger,
  loading,
  error,
  onRefresh,
  onClose,
}: {
  status: VaultStatus | null
  auditEvents: VaultAuditEvent[]
  syncLedger: VaultSyncLedger | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const counts = status?.counts
  const rows = counts
    ? [
        ['Live notes', counts.live_notes],
        ['Trashed notes', counts.trashed_notes],
        ['Folders', counts.folders],
        ['Attachments', counts.attachments],
        ['Attachment storage', formatBytes(counts.attachment_bytes)],
        ['Versions', counts.versions],
        ['Open comments', counts.open_comments],
        ['Open suggestions', counts.open_suggestions],
        ['Pending saves', counts.pending_saves],
        ['Audit events', counts.audit_events],
      ]
    : []

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Vault privacy status"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.34)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <section
        style={{
          width: 'min(620px, calc(100vw - 32px))',
          maxHeight: 'min(760px, calc(100vh - 32px))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-panel)',
          boxShadow: '0 24px 80px var(--overlay-heavy)',
        }}
      >
        <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <ShieldCheck size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--text-primary)' }}>Vault privacy status</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Local-first storage and backup readiness
              </div>
            </div>
          </div>
        </div>
        <div style={{ overflow: 'auto', padding: 16 }}>
          {loading && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 12 }}>Loading vault status...</div>
          )}
          {error && <div style={{ color: 'var(--red)', fontSize: 12, lineHeight: 1.5, padding: 12 }}>{error}</div>}
          {!loading && !error && status && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                <StatusBadge
                  label="Canonical store"
                  value={status.canonical_store === 'local_sqlite' ? 'Local SQLite' : status.canonical_store}
                />
                <StatusBadge label="Cloud required" value={status.remote_required ? 'Yes' : 'No'} />
                <StatusBadge
                  label="Encrypted backup"
                  value={status.encrypted_backup_supported ? 'Ready' : 'Unavailable'}
                />
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                {rows.map(([label, value]) => (
                  <div
                    key={label}
                    style={{ display: 'flex', gap: 12, padding: '8px 10px', borderBottom: '1px solid var(--border)' }}
                  >
                    <div style={{ flex: 1, minWidth: 0, color: 'var(--text-muted)', fontSize: 12 }}>{label}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 650 }}>{value}</div>
                  </div>
                ))}
              </div>
              <PathRow label="Database" value={status.database_path} />
              <PathRow label="Attachments" value={status.attachments_path} />
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <div
                  style={{
                    padding: '8px 10px',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    fontWeight: 650,
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  Save and sync ledger
                </div>
                {!syncLedger || (syncLedger.pending_saves.length === 0 && syncLedger.sync_states.length === 0) ? (
                  <div style={{ padding: 10, color: 'var(--text-muted)', fontSize: 12 }}>
                    No queued local saves or sync conflicts.
                  </div>
                ) : (
                  <>
                    {syncLedger.pending_saves.map(save => (
                      <LedgerRow
                        key={save.id}
                        title={save.operation}
                        detail={save.document_id}
                        meta={
                          save.last_error ? `${save.attempts} tries · ${save.last_error}` : `${save.attempts} tries`
                        }
                      />
                    ))}
                    {syncLedger.sync_states.map(state => (
                      <LedgerRow
                        key={`${state.provider}:${state.remote_id}`}
                        title={`${state.provider} · ${state.conflict_state}`}
                        detail={state.local_id}
                        meta={
                          state.last_synced_at
                            ? new Date(state.last_synced_at).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              })
                            : 'Not synced'
                        }
                      />
                    ))}
                  </>
                )}
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <div
                  style={{
                    padding: '8px 10px',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    fontWeight: 650,
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  Recent audit events
                </div>
                {auditEvents.length === 0 ? (
                  <div style={{ padding: 10, color: 'var(--text-muted)', fontSize: 12 }}>
                    No local audit events yet.
                  </div>
                ) : (
                  auditEvents.map(event => (
                    <div
                      key={event.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(120px, 1fr) minmax(0, 2fr) auto',
                        gap: 10,
                        padding: '8px 10px',
                        borderBottom: '1px solid var(--border)',
                        alignItems: 'center',
                      }}
                    >
                      <div
                        style={{
                          color: 'var(--text-secondary)',
                          fontSize: 12,
                          fontWeight: 650,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {event.action.replace(/_/g, ' ')}
                      </div>
                      <div
                        style={{
                          color: 'var(--text-muted)',
                          fontSize: 11,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {event.document_id || String(event.metadata.path || event.metadata.id || 'vault')}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                        {event.created_at
                          ? new Date(event.created_at).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })
                          : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <div
          style={{
            padding: 12,
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onRefresh}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '7px 12px',
              fontSize: 12,
            }}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--bg-white-04)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '7px 12px',
              fontSize: 12,
            }}
          >
            Close
          </button>
        </div>
      </section>
    </div>
  )
}

function StatusBadge({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: 10,
        background: 'var(--bg-white-02)',
        minWidth: 0,
      }}
    >
      <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div
        style={{
          color: 'var(--text-primary)',
          fontSize: 13,
          fontWeight: 650,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function LedgerRow({ title, detail, meta }: { title: string; detail: string; meta: string }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(120px, 1fr) minmax(0, 2fr) auto',
        gap: 10,
        padding: '8px 10px',
        borderBottom: '1px solid var(--border)',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          color: 'var(--text-secondary)',
          fontSize: 12,
          fontWeight: 650,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </div>
      <div
        style={{
          color: 'var(--text-muted)',
          fontSize: 11,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {detail || 'vault'}
      </div>
      <div
        style={{
          color: 'var(--text-muted)',
          fontSize: 11,
          whiteSpace: 'nowrap',
          maxWidth: 180,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {meta}
      </div>
    </div>
  )
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 5 }}>{label}</div>
      <div
        style={{
          color: 'var(--text-secondary)',
          background: 'var(--bg-white-02)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 10px',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function LocalCollabDraftDialog({
  drafts,
  localContent,
  baseContent,
  onApply,
  onDismiss,
  onClose,
}: {
  drafts: LocalCollabDraft[]
  localContent: string
  baseContent: string
  onApply: (draft: LocalCollabDraft) => void
  onDismiss: (draftId: string) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Incoming local drafts"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'flex',
        justifyContent: 'flex-end',
        background: 'rgba(0, 0, 0, 0.34)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <aside
        style={{
          width: 'min(500px, calc(100vw - 24px))',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          boxShadow: '-18px 0 60px var(--overlay-heavy)',
        }}
      >
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Local collaboration</div>
          <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--text-primary)' }}>Incoming drafts</div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {drafts.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5, padding: 12 }}>
              No incoming local drafts.
            </div>
          ) : (
            drafts.map(draft => {
              const merge = mergeLocalCollabDraft(localContent, baseContent, draft)
              const statusLabel =
                merge.status === 'apply-remote'
                  ? 'Safe to apply'
                  : merge.status === 'merge-remote'
                    ? 'Safe to merge'
                  : merge.status === 'conflict'
                    ? 'Conflict'
                    : merge.status === 'keep-local'
                      ? 'Already covered locally'
                      : 'Already applied'
              const statusColor = merge.status === 'conflict' ? 'var(--red)' : 'var(--accent)'
              return (
                <div key={draft.id} style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div
                      style={{
                        color: 'var(--text-secondary)',
                        fontSize: 12,
                        fontWeight: 650,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {draft.peer.name}
                    </div>
                    <div
                      style={{
                        color: statusColor,
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '2px 6px',
                        fontSize: 10,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {statusLabel}
                    </div>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 3 }}>
                    {new Date(draft.updatedAt).toLocaleString()}
                  </div>
                  <pre
                    style={{
                      maxHeight: 170,
                      overflow: 'auto',
                      margin: '8px 0 0',
                      padding: 8,
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-white-02)',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      lineHeight: 1.45,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {draft.content.length > 800 ? `${draft.content.slice(0, 800)}...` : draft.content}
                  </pre>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => onDismiss(draft.id)}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        padding: '5px 9px',
                        fontSize: 11,
                      }}
                    >
                      Keep mine
                    </button>
                    <button
                      type="button"
                      onClick={() => onApply(draft)}
                      style={{
                        background: merge.status === 'conflict' ? 'var(--red)' : 'var(--accent-dim)',
                        border: '1px solid transparent',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-on-color)',
                        cursor: 'pointer',
                        padding: '5px 9px',
                        fontSize: 11,
                      }}
                    >
                      {merge.status === 'conflict' ? 'Replace mine' : 'Apply'}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--bg-white-04)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '7px 12px',
              fontSize: 12,
            }}
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  )
}

function DraftRecoveryDialog({
  drafts,
  onRestore,
  onDiscard,
  onRefresh,
  onClose,
}: {
  drafts: VaultRecoverableDraft[]
  onRestore: (id: string) => void
  onDiscard: (id: string) => void
  onRefresh: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Recovered drafts"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'flex',
        justifyContent: 'flex-end',
        background: 'rgba(0, 0, 0, 0.34)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <aside
        style={{
          width: 'min(460px, calc(100vw - 24px))',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          boxShadow: '-18px 0 60px var(--overlay-heavy)',
        }}
      >
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Crash recovery</div>
          <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--text-primary)' }}>Recovered drafts</div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {drafts.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5, padding: 12 }}>
              No unsynced local drafts.
            </div>
          ) : (
            drafts.map(draft => (
              <div key={draft.id} style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                <div
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: 12,
                    fontWeight: 650,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {draft.title}
                </div>
                <div
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    marginTop: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {draft.folder || 'Vault root'} - {new Date(draft.updated_at).toLocaleString()}
                </div>
                <pre
                  style={{
                    maxHeight: 120,
                    overflow: 'auto',
                    margin: '8px 0 0',
                    padding: 8,
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-white-02)',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {draft.content.length > 600 ? `${draft.content.slice(0, 600)}...` : draft.content}
                </pre>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => onDiscard(draft.id)}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '5px 9px',
                      fontSize: 11,
                    }}
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={() => onRestore(draft.id)}
                    style={{
                      background: 'var(--accent-dim)',
                      border: '1px solid transparent',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-on-color)',
                      cursor: 'pointer',
                      padding: '5px 9px',
                      fontSize: 11,
                    }}
                  >
                    Restore
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <div
          style={{
            padding: 12,
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onRefresh}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '7px 12px',
              fontSize: 12,
            }}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--bg-white-04)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '7px 12px',
              fontSize: 12,
            }}
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  )
}

function NotesCommandPalette({
  query,
  items,
  onQueryChange,
  onClose,
}: {
  query: string
  items: CommandAction[]
  onQueryChange: (query: string) => void
  onClose: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items.slice(0, 24)
    return items
      .filter(item => item.label.toLowerCase().includes(q) || item.detail?.toLowerCase().includes(q))
      .slice(0, 24)
  }, [items, query])

  const run = useCallback(
    (item: CommandAction) => {
      item.onRun()
      onClose()
    },
    [onClose],
  )

  useEffect(() => {
    inputRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
      if (event.key === 'Enter' && filtered[0]) {
        event.preventDefault()
        run(filtered[0])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filtered, onClose, run])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Notes command palette"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '12vh',
        background: 'rgba(0, 0, 0, 0.36)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div
        style={{
          width: 'min(680px, calc(100vw - 32px))',
          maxHeight: '72vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-panel)',
          boxShadow: '0 24px 80px var(--overlay-heavy)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '13px 14px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <MagnifyingGlass size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="Search notes or run a command..."
            aria-label="Search notes or run a command"
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-primary)',
              font: 'inherit',
              fontSize: 14,
              outline: 'none',
            }}
          />
        </div>

        <div style={{ overflowY: 'auto', padding: 6 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '26px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
              No commands or notes found
            </div>
          ) : (
            filtered.map((item, index) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => run(item)}
                  className="hover-bg"
                  style={{
                    width: '100%',
                    minHeight: 42,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    background: index === 0 ? 'var(--bg-white-04)' : 'transparent',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    padding: '7px 10px',
                    textAlign: 'left',
                  }}
                >
                  <Icon size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 13,
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.label}
                    </span>
                    {item.detail && (
                      <span
                        style={{
                          display: 'block',
                          marginTop: 1,
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.detail}
                      </span>
                    )}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function AttachmentPreview({ id }: { id: string }) {
  const name = id.split('/').pop() || id
  const [src, setSrc] = useState(() => `/api/vault/local/media?id=${encodeURIComponent(id)}`)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSrc(`/api/vault/local/media?id=${encodeURIComponent(id)}`)
    setError(null)
  }, [id])

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'auto',
        padding: 32,
        background: 'var(--bg-base)',
      }}
    >
      {!error && (
        <img
          src={src}
          alt={name}
          onError={() => {
            setError('Failed to load image')
          }}
          style={{
            maxWidth: '100%',
            maxHeight: '80vh',
            objectFit: 'contain',
            borderRadius: 8,
            boxShadow: '0 2px 16px var(--overlay-light)',
          }}
        />
      )}
      {error && (
        <button
          onClick={() => {
            setError(null)
            setSrc(`/api/vault/local/media?id=${encodeURIComponent(id)}`)
          }}
          style={{
            background: 'var(--bg-white-04)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '8px 16px',
            fontSize: 12,
          }}
        >
          Retry loading image
        </button>
      )}
      <div
        style={{
          marginTop: 12,
          fontSize: 12,
          color: 'var(--text-muted)',
          opacity: 0.6,
        }}
      >
        {name}
      </div>
    </div>
  )
}

function EmptyState({ onCreateNote }: { onCreateNote: () => void }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 12,
        color: 'var(--text-muted)',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: 'var(--bg-white-02)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ShareNetwork size={22} style={{ opacity: 0.3, color: 'var(--accent)' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            marginBottom: 4,
            color: 'var(--text-secondary)',
          }}
        >
          Your knowledge graph awaits
        </div>
        <div style={{ fontSize: 12, maxWidth: 280, lineHeight: 1.6, opacity: 0.6 }}>
          Create notes and link them with [[wikilinks]]
        </div>
      </div>
      <button
        onClick={onCreateNote}
        style={{
          background: 'var(--accent-dim)',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-on-color)',
          cursor: 'pointer',
          padding: '7px 18px',
          fontSize: 12,
          fontWeight: 500,
          transition: 'opacity var(--duration-fast)',
        }}
        onMouseEnter={e => {
          ;(e.target as HTMLButtonElement).style.opacity = '0.85'
        }}
        onMouseLeave={e => {
          ;(e.target as HTMLButtonElement).style.opacity = '1'
        }}
      >
        Create first note
      </button>
    </div>
  )
}
