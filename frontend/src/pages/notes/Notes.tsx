import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  useState,
  useCallback,
  useRef,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  lazy,
  Suspense,
  type CSSProperties,
  type DragEventHandler,
  type KeyboardEventHandler,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  Trash,
  ArrowClockwise,
  ShareNetwork,
  PenNib,
  Cloud,
  CloudSlash,
  GitBranch,
  NotePencil,
  FolderOpen,
  FolderPlus,
  Star,
  UploadSimple,
  Copy,
  FileDoc,
  FileHtml,
  FilePdf,
  FileText,
  ChatCircleText,
  DotsThree,
  ShieldCheck,
  Plus,
  Table,
  SquaresFour,
  ListBullets,
  X,
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
  resolveVaultSyncConflict,
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
import { LOCAL_STORAGE_STATE_EVENT, useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
import { getRemoteApiKey, getRequestApiKeyForPath, getRequestBaseForPath } from '@/lib/api'
import { verifyMarkdownVaultArchive } from '@/lib/vaultArchive'
import { verifyEncryptedVaultBackup } from '@/lib/vaultBackup'
import FileTree from './FileTree'
import NoteEditor from './NoteEditor'
import BacklinksPanel from './BacklinksPanel'
import type { BacklinkReference } from './backlinks'
import {
  NOTE_TEMPLATES,
  VAULT_TEMPLATES_FOLDER,
  appendTemplateToContent,
  applyTemplate,
  extractTemplatePrompts,
  selectFolderTemplate,
  vaultTemplatesFromNotes,
  type NoteTemplate,
  type TemplatePrompt,
} from '@/features/notes/templates'
import {
  downloadDocx,
  downloadHtml,
  downloadMarkdown,
  downloadPublishedNotesSite,
  downloadReviewPackage,
  printNotePdf,
  type ReviewPackagePermission,
} from '@/features/notes/export'
import { matchesNoteSearch, noteSearchText } from '@/features/notes/searchFilters'
import {
  mergeSavedSearches,
  normalizeSavedSearches,
  removeSavedSearch,
  savedSearchesEqual,
  upsertSavedSearch,
  type NotesSavedSearch,
} from '@/features/notes/savedSearches'
import {
  loadSyncedNotesSavedSearches,
  saveSyncedNotesSavedSearches,
} from '@/features/notes/savedSearchSync'
import {
  loadSyncedPinnedNotesState,
  mergePinnedNotesState,
  normalizePinnedNoteIds,
  pinnedNotesStateEqual,
  saveSyncedPinnedNotesState,
  type NotesPinnedNotesState,
} from '@/features/notes/pinnedNotesSync'
import {
  loadSyncedNotesWorkspaceSnapshots,
  mergeNotesWorkspaceSnapshots,
  normalizeNotesWorkspaceSnapshots,
  notesWorkspaceSnapshotsEqual,
  saveSyncedNotesWorkspaceSnapshots,
} from '@/features/notes/workspaceSync'
import {
  applySyncedNotesEditorPreferences,
  loadSyncedNotesEditorPreferences,
  mergeSyncedNotesEditorPreferences,
  notesEditorPreferencesToSyncState,
  saveSyncedNotesEditorPreferences,
  syncedNotesEditorPreferencesEqual,
  type SyncedNotesEditorPreferences,
} from '@/features/notes/editorPreferenceSync'
import {
  normalizeVaultDataWorkspaceContext,
  setTaskLineDone,
  type VaultDataWorkspaceContext,
  type VaultTaskRow,
} from '@/features/notes/dataMode'
import { VaultDataView } from '@/features/notes/VaultDataView'
import { buildClipNote, readClipboardClipInput } from './clipper'
import {
  autoMergeLocalCollabOperation,
  createLayeredLocalCollabTransport,
  mergeLocalCollabDraft,
  mergeNonOverlappingLineChanges,
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
import {
  formatDocumentPropertyInputValue,
  inferDocumentPropertyValueKind,
  normalizeDocumentPropertyKey,
  removeDocumentProperty,
  renameDocumentProperty,
  upsertDocumentProperty,
  type DocumentPropertyValueKind,
} from './documentProperties'
import { DocumentInfoPanel } from '@/features/notes/DocumentInfoPanel'
import { buildVaultPropertyIndex } from '@/features/notes/documentPropertiesIndex'
import { documentStats, type DocumentStats } from '@/features/notes/documentStats'
import { NotesCommandPalette, type CommandAction } from '@/features/notes/NotesCommandPalette'
import { groupedNotesShortcuts } from './notesShortcuts'
import {
  DEFAULT_NOTES_EDITOR_PREFERENCES,
  buildDailyNoteTitle,
  buildPeriodicNoteTitle,
  createNotesRemoteCollaborationPairingInvite,
  dailyNoteDateFromInput,
  dailyNoteDateInputValue,
  dailyNoteDateWithOffset,
  isNotesRemoteCollaborationPairingKey,
  isNotesRemoteCollaborationBaseUrl,
  notesRemoteCollaborationSetupStatus,
  notesCssSnippetText,
  normalizeNotesEditorPreferences,
  periodicNoteFolder,
  periodicNoteTemplateId,
  type NotesAppearanceMode,
  parseNotesRemoteCollaborationPairingInvite,
  type NotesPeriodicKind,
  type NotesEditorPreferences,
} from './notesPreferences'
import { folderAncestors, planMarkdownVaultImport, readImportedNoteMarkdown } from './vaultImport'
import {
  VERSION_RESTORE_SAFETY_NOTE,
  buildVersionDiff,
  restoreRevisionConfirmMessage,
  summarizeVersionDiff,
} from './versionDiff'
import { applySuggestionPatch } from './suggestions'
import { isNoteInTrash, isNotesTrashPath, noteFolderPath } from '@/features/notes/trash'
import {
  affectedNotesForTagRename,
  applyTagToContent,
  buildTagIndex,
  buildTagRows,
  removeTagFromContent,
  renameTagInContent,
} from '@/features/notes/tags'
import {
  applyWritingAssistControls,
  buildCommentReplyDraft,
  buildWritingAssistDraft,
  writingAssistPrivacySummary,
  writingAssistProviderLabel,
  writingAssistPatchForDraft,
  type WritingAssistControls,
  type WritingAssistDraft,
  type WritingAssistLength,
  type WritingAssistOption,
  type WritingAssistProvider,
  type WritingAssistTone,
} from '@/features/notes/assistiveWriting'
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
import { normalizeSelectionAnchor } from './reviewAnchors'

const GraphView = lazy(() => import('./GraphView'))
const CanvasView = lazy(() => import('./CanvasView'))

type ViewMode = 'editor' | 'graph' | 'data' | 'canvas'
type SaveState = 'saved' | 'unsaved' | 'saving' | 'error'
type WorkspaceSyncState = 'local' | 'loading' | 'saving' | 'synced' | 'error'
type SavedSearchSyncState = 'local' | 'loading' | 'saving' | 'synced' | 'error'
type PinnedNotesSyncState = 'local' | 'loading' | 'saving' | 'synced' | 'error'
type EditorPreferencesSyncState = 'local' | 'loading' | 'saving' | 'synced' | 'error'
type TopBarMenu = 'workspace' | 'status' | 'create' | 'view' | 'more' | 'note-tools' | 'note-identity'

const COMPACT_TOPBAR_VIEWPORT_WIDTH = 900
const COMPACT_TOPBAR_ACTUAL_WIDTH = 860
const MENU_VIEWPORT_MARGIN = 8

function viewportAnchoredMenuStyle(
  trigger: HTMLElement | null,
  menu: HTMLElement | null,
  align: 'left' | 'right' = 'left',
  fallbackWidth = 240,
  maxHeight = 340,
): CSSProperties {
  if (typeof window === 'undefined' || !trigger) return {}
  const triggerRect = trigger.getBoundingClientRect()
  const measuredWidth = menu?.getBoundingClientRect().width || fallbackWidth
  const width = Math.min(measuredWidth, window.innerWidth - MENU_VIEWPORT_MARGIN * 2)
  const preferredLeft = align === 'right' ? triggerRect.right - width : triggerRect.left
  const left = Math.min(
    Math.max(MENU_VIEWPORT_MARGIN, preferredLeft),
    Math.max(MENU_VIEWPORT_MARGIN, window.innerWidth - width - MENU_VIEWPORT_MARGIN),
  )
  const availableBelow = Math.max(160, window.innerHeight - triggerRect.bottom - MENU_VIEWPORT_MARGIN - 4)

  return {
    position: 'fixed',
    top: Math.min(triggerRect.bottom + 4, window.innerHeight - MENU_VIEWPORT_MARGIN),
    left,
    right: 'auto',
    maxWidth: `min(280px, calc(100vw - ${MENU_VIEWPORT_MARGIN * 2}px))`,
    maxHeight: `min(${maxHeight}px, ${availableBelow}px)`,
  }
}

interface TemplatePromptRequest {
  templateLabel: string
  prompts: TemplatePrompt[]
}

interface TemplateNameRequest {
  defaultTitle: string
}

interface TagRenameRequest {
  tag: string
  affectedCount: number
}

interface TagRemoveRequest {
  tag: string
  affectedCount: number
}

interface FolderCreateRequest {
  parent?: string
}

interface FolderRenameRequest {
  path: string
  affectedNoteCount: number
  affectedFolderCount: number
}

interface MoveNoteRequest {
  noteId: string
  title: string
  currentFolder: string
  folders: string[]
}

interface VersionNameRequest {
  mode: 'create' | 'rename'
  rev?: string
  currentLabel?: string | null
}

interface DocumentPropertyRequest {
  mode: 'set' | 'remove' | 'rename'
  properties: Record<string, string | string[]>
  sourceKey?: string
  defaultKey?: string
  defaultValue?: string
  defaultKind?: DocumentPropertyValueKind
}

interface ReviewPackageRequest {
  noteId: string
  title: string
}

interface PluginMarketplaceFeedRequest {
  defaultUrl: string
}

interface EncryptedBackupRequest {
  mode: 'export' | 'import'
  file?: File
  fileName?: string
}

interface ConfirmActionRequest {
  title: string
  detail: string
  confirmLabel: string
  tone?: 'default' | 'danger'
  onConfirm: () => void | Promise<void>
}

interface NoticeRequest {
  title: string
  detail: string
  actionLabel?: string
  tone?: 'default' | 'warning' | 'danger'
}

interface WorkspaceRenameRequest {
  snapshotKey: string
  currentName: string
  viewMode: ViewMode
}

interface MarkdownOutlineHeading {
  level: number
  text: string
  lineNumber: number
}

interface CommentComposeRequest {
  mode: 'comment' | 'reply'
  noteId: string
  noteTitle: string
  anchor?: NoteSelectionAnchor | Record<string, unknown>
  commentId?: string
  suggestionId?: string
  quote?: string
  defaultBody?: string
}

interface SuggestionComposeRequest {
  noteId: string
  noteTitle: string
  anchor: NoteSelectionAnchor
  defaultContent: string
  selectedText: string
  cursorInsert: boolean
}

interface WritingAssistRequest {
  noteId: string
  noteTitle: string
  draft: WritingAssistDraft
}

interface MergeConflictReviewRequest {
  state: VaultSyncLedger['sync_states'][number]
  noteId: string
  noteTitle: string
  localContent: string
  remoteContent: string
  baseContent: string | null
  initialContent: string
  autoMerged: boolean
}

interface QueuedLocalEdit {
  noteId: string
  title: string
  folder: string
  content: string
  error?: string
}

interface NotesWorkspaceSnapshot {
  id?: string
  name?: string
  viewMode: ViewMode
  focusMode: boolean
  infoPanelOpen: boolean
  treeWidth: number
  sidePaneWidth?: number
  searchQuery?: string
  expandedFolders?: string[]
  referencesOpen?: boolean
  graphContext?: NotesGraphWorkspaceContext
  dataContext?: VaultDataWorkspaceContext
  selectedId: string | null
  sidePaneId?: string | null
  tabIds?: string[]
  savedAt: number
}

interface NotesGraphWorkspaceContext {
  graphSearch: string
  focusMatches: boolean
  hideOrphans: boolean
  localGraph: boolean
  groupMode: 'tag' | 'folder' | 'type' | 'none'
}

const SAVE_DEBOUNCE_MS = 700
const MIN_FILE_TREE_WIDTH = 160
const MAX_FILE_TREE_WIDTH = 360
const DEFAULT_FILE_TREE_WIDTH = 220
const FILE_TREE_WIDTH_STEP = 40
const MIN_WORKSPACE_SIDE_PANE_WIDTH = 300
const MAX_WORKSPACE_SIDE_PANE_WIDTH = 720
const DEFAULT_WORKSPACE_SIDE_PANE_WIDTH = 420
const WORKSPACE_SIDE_PANE_WIDTH_STEP = 40
const WORKSPACE_TAB_DRAG_TYPE = 'application/x-clawctrl-workspace-tab'
const VALID_GRAPH_GROUP_MODES = new Set<NotesGraphWorkspaceContext['groupMode']>(['tag', 'folder', 'type', 'none'])

function readLocalStorageJson<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored !== null ? JSON.parse(stored) as T : fallback
  } catch {
    return fallback
  }
}

function writeLocalStorageJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
  window.dispatchEvent(new CustomEvent(LOCAL_STORAGE_STATE_EVENT, { detail: { key } }))
}

function readGraphWorkspaceContext(): NotesGraphWorkspaceContext {
  const groupMode = readLocalStorageJson<unknown>('mc-notes-graph-group-mode', 'tag')
  return {
    graphSearch: String(readLocalStorageJson('mc-notes-graph-search', '') || '').slice(0, 240),
    focusMatches: readLocalStorageJson<unknown>('mc-notes-graph-focus-matches', false) === true,
    hideOrphans: readLocalStorageJson<unknown>('mc-notes-graph-hide-orphans', false) === true,
    localGraph: readLocalStorageJson<unknown>('mc-notes-graph-local', false) === true,
    groupMode: typeof groupMode === 'string' && VALID_GRAPH_GROUP_MODES.has(groupMode as NotesGraphWorkspaceContext['groupMode'])
      ? groupMode as NotesGraphWorkspaceContext['groupMode']
      : 'tag',
  }
}

function restoreGraphWorkspaceContext(context: NotesGraphWorkspaceContext | undefined): void {
  if (!context) return
  try {
    writeLocalStorageJson('mc-notes-graph-search', context.graphSearch)
    writeLocalStorageJson('mc-notes-graph-focus-matches', context.focusMatches)
    writeLocalStorageJson('mc-notes-graph-hide-orphans', context.hideOrphans)
    writeLocalStorageJson('mc-notes-graph-local', context.localGraph)
    writeLocalStorageJson('mc-notes-graph-group-mode', context.groupMode)
    writeLocalStorageJson('mc-notes-graph-settings-updated-at', Date.now())
  } catch {
    // Graph controls still remain usable inside GraphView if local storage is unavailable.
  }
}

function clampWorkspaceSidePaneWidth(width: number): number {
  return Math.max(MIN_WORKSPACE_SIDE_PANE_WIDTH, Math.min(MAX_WORKSPACE_SIDE_PANE_WIDTH, Math.round(width)))
}

function clampFileTreeWidth(width: number): number {
  return Math.max(MIN_FILE_TREE_WIDTH, Math.min(MAX_FILE_TREE_WIDTH, Math.round(width)))
}

function notesAppearanceStyle(mode: NotesAppearanceMode): CSSProperties {
  if (mode === 'light') {
    return {
      colorScheme: 'light',
      '--bg-base': '#f7f7f4',
      '--bg-panel': '#ffffff',
      '--bg-muted': '#ecece7',
      '--bg-elevated': '#ffffff',
      '--bg-white-02': 'rgba(16, 20, 24, 0.03)',
      '--bg-white-03': 'rgba(16, 20, 24, 0.04)',
      '--bg-white-04': 'rgba(16, 20, 24, 0.06)',
      '--bg-white-06': 'rgba(16, 20, 24, 0.08)',
      '--bg-white-08': 'rgba(16, 20, 24, 0.1)',
      '--text-primary': '#15171a',
      '--text-secondary': '#3d4248',
      '--text-muted': '#69707a',
      '--border': 'rgba(16, 20, 24, 0.12)',
      '--border-hover': 'rgba(16, 20, 24, 0.2)',
      '--hover-bg': 'rgba(16, 20, 24, 0.06)',
    } as CSSProperties
  }
  if (mode === 'dark') {
    return {
      colorScheme: 'dark',
      '--bg-base': '#0a0b0d',
      '--bg-panel': '#111318',
      '--bg-muted': '#171a20',
      '--bg-elevated': '#151821',
      '--bg-white-02': 'rgba(255, 255, 255, 0.02)',
      '--bg-white-03': 'rgba(255, 255, 255, 0.03)',
      '--bg-white-04': 'rgba(255, 255, 255, 0.04)',
      '--bg-white-06': 'rgba(255, 255, 255, 0.06)',
      '--bg-white-08': 'rgba(255, 255, 255, 0.08)',
      '--text-primary': '#e8e9ee',
      '--text-secondary': '#b9bec8',
      '--text-muted': '#858c98',
      '--border': 'rgba(255, 255, 255, 0.08)',
      '--border-hover': 'rgba(255, 255, 255, 0.14)',
      '--hover-bg': 'rgba(255, 255, 255, 0.05)',
    } as CSSProperties
  }
  return {}
}

function viewModeLabel(mode: ViewMode): string {
  if (mode === 'editor') return 'Editor'
  if (mode === 'graph') return 'Graph'
  if (mode === 'data') return 'Data'
  return 'Canvas'
}

function workspaceSnapshotKey(snapshot: NotesWorkspaceSnapshot): string {
  return snapshot.id || `${snapshot.viewMode}:${snapshot.savedAt}:${snapshot.selectedId ?? 'no-note'}`
}

function noteLinkTitle(note: Pick<VaultNote, '_id' | 'title'>): string {
  return note.title || note._id.replace(/\.md$/, '')
}

function noteEmbedMarkdown(note: Pick<VaultNote, '_id' | 'title'>): string {
  return `![[${noteLinkTitle(note)}]]`
}

function insertMarkdownBlockAtAnchor(content: string, insertion: string, anchor: NoteSelectionAnchor | null): string {
  const block = insertion.trim()
  if (!block) return content
  if (
    anchor?.mode !== 'markdown' ||
    typeof anchor.start !== 'number' ||
    typeof anchor.end !== 'number'
  ) {
    return appendTemplateToContent(content, block)
  }

  const start = Math.max(0, Math.min(anchor.start, content.length))
  const end = Math.max(start, Math.min(anchor.end, content.length))
  const before = content.slice(0, start).trimEnd()
  const after = content.slice(end).trimStart()
  if (!before && !after) return `${block}\n`
  if (!before) return `${block}\n\n${after}`
  if (!after) return `${before}\n\n${block}\n`
  return `${before}\n\n${block}\n\n${after}`
}

function slugForBlockId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'block'
}

function createBlockId(note: Pick<VaultNote, '_id' | 'title'>): string {
  return `${slugForBlockId(noteLinkTitle(note))}-${Date.now().toString(36)}`
}

function insertBlockIdAtAnchor(content: string, blockId: string, anchor: NoteSelectionAnchor | null): string {
  const marker = `^${blockId.replace(/^\^+/, '')}`
  if (
    anchor?.mode !== 'markdown' ||
    typeof anchor.start !== 'number'
  ) {
    return insertMarkdownBlockAtAnchor(content, marker, null)
  }

  const cursor = Math.max(0, Math.min(anchor.start, content.length))
  const lineStart = content.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1
  const nextLineBreak = content.indexOf('\n', cursor)
  const lineEnd = nextLineBreak === -1 ? content.length : nextLineBreak
  const line = content.slice(lineStart, lineEnd)
  if (!line.trim()) {
    return `${content.slice(0, lineStart)}${marker}${content.slice(lineEnd)}`
  }
  const nextLine = line.match(/\s\^[A-Za-z0-9-]+$/)
    ? line.replace(/\s\^[A-Za-z0-9-]+$/, ` ${marker}`)
    : `${line.trimEnd()} ${marker}`
  return `${content.slice(0, lineStart)}${nextLine}${content.slice(lineEnd)}`
}

function blockIdAtAnchorLine(content: string, anchor: NoteSelectionAnchor | null): string | null {
  if (
    anchor?.mode !== 'markdown' ||
    typeof anchor.start !== 'number'
  ) {
    return null
  }
  const cursor = Math.max(0, Math.min(anchor.start, content.length))
  const lineStart = content.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1
  const nextLineBreak = content.indexOf('\n', cursor)
  const lineEnd = nextLineBreak === -1 ? content.length : nextLineBreak
  const line = content.slice(lineStart, lineEnd)
  return line.match(/\s\^([A-Za-z0-9-]+)$/)?.[1] ?? null
}

function blockReferenceMarkdown(note: Pick<VaultNote, '_id' | 'title'>, blockId: string): string {
  return `[[${noteLinkTitle(note)}#^${blockId.replace(/^\^+/, '')}]]`
}

function headingAtAnchor(content: string, anchor: NoteSelectionAnchor | null): string | null {
  if (
    anchor?.mode !== 'markdown' ||
    typeof anchor.start !== 'number'
  ) {
    return null
  }
  const cursor = Math.max(0, Math.min(anchor.start, content.length))
  const currentLineEnd = content.indexOf('\n', cursor)
  const throughCurrentLine = content.slice(0, currentLineEnd === -1 ? content.length : currentLineEnd)
  const lines = throughCurrentLine.split('\n')
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = lines[index]?.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/)
    const heading = match?.[1]?.trim()
    if (heading) return heading
  }
  return null
}

function headingReferenceMarkdown(note: Pick<VaultNote, '_id' | 'title'>, heading: string): string {
  return `[[${noteLinkTitle(note)}#${heading}]]`
}

function collectMarkdownOutlineHeadings(content: string): MarkdownOutlineHeading[] {
  return content
    .split('\n')
    .map((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
      if (!match) return null
      return {
        level: match[1].length,
        text: match[2].trim(),
        lineNumber: index + 1,
      }
    })
    .filter((heading): heading is MarkdownOutlineHeading => !!heading)
}

function headingForReference(content: string, anchor: NoteSelectionAnchor | null, note: Pick<VaultNote, '_id' | 'title'>): string | null {
  const anchoredHeading = headingAtAnchor(content, anchor)
  if (anchoredHeading) return anchoredHeading

  const noteTitle = noteLinkTitle(note).trim().toLowerCase()
  const headings = collectMarkdownOutlineHeadings(content)
  return headings.find(heading => heading.text.trim().toLowerCase() !== noteTitle)?.text ?? headings[0]?.text ?? null
}

function fallbackHeadingAnchor(content: string, note: Pick<VaultNote, '_id' | 'title'>): NoteSelectionAnchor | null {
  const noteTitle = noteLinkTitle(note).trim().toLowerCase()
  const heading = collectMarkdownOutlineHeadings(content)
    .find(item => item.text.trim().toLowerCase() !== noteTitle)
  if (!heading) return null

  const lines = content.split('\n')
  let start = 0
  for (let index = 0; index < heading.lineNumber - 1; index += 1) {
    start += (lines[index]?.length ?? 0) + 1
  }
  const end = start + (lines[heading.lineNumber - 1]?.length ?? 0)
  return { scope: 'cursor', mode: 'markdown', start: end, end, quote: '' }
}

function markdownAnchorOrHeadingFallback(
  content: string,
  anchor: NoteSelectionAnchor | null,
  note: Pick<VaultNote, '_id' | 'title'>,
): NoteSelectionAnchor | null {
  if (anchor?.mode === 'markdown' && typeof anchor.start === 'number') return anchor
  return fallbackHeadingAnchor(content, note)
}

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

export default function NotesPage() {
  const {
    notes,
    unavailableNotes,
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
  const [treeWidth, setTreeWidth] = useState(DEFAULT_FILE_TREE_WIDTH)
  const [workspaceSidePaneWidth, setWorkspaceSidePaneWidth] = useLocalStorageState('mc-notes-workspace-side-pane-width', 420)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [focusMode, setFocusMode] = useLocalStorageState('mc-notes-focus-mode', false)
  const [infoPanelOpen, setInfoPanelOpen] = useLocalStorageState('mc-notes-info-panel-open', false)
  const [editorPreferences, setEditorPreferences] = useLocalStorageState<NotesEditorPreferences>(
    'mc-notes-editor-preferences',
    DEFAULT_NOTES_EDITOR_PREFERENCES,
  )
  const [editorPreferencesSyncUpdatedAt, setEditorPreferencesSyncUpdatedAt] = useLocalStorageState('mc-notes-editor-preferences-sync-updated-at', 0)
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [topBarMenu, setTopBarMenu] = useState<TopBarMenu | null>(null)
  const [compactTopBarActions, setCompactTopBarActions] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < COMPACT_TOPBAR_VIEWPORT_WIDTH
  })
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [wordCountOpen, setWordCountOpen] = useState(false)
  const [propertiesIndexOpen, setPropertiesIndexOpen] = useState(false)
  const [tagsIndexOpen, setTagsIndexOpen] = useState(false)
  const [activeOutlineOpen, setActiveOutlineOpen] = useState(false)
  const [editorJumpRequest, setEditorJumpRequest] = useState<{ noteId: string; lineNumber: number; requestId: number } | null>(null)
  const [backlinksOpenRequest, setBacklinksOpenRequest] = useState(0)
  const [referencesPanelCollapsed, setReferencesPanelCollapsed] = useLocalStorageState('mc-backlinks-collapsed', true)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [dailyDatePickerOpen, setDailyDatePickerOpen] = useState(false)
  const [templatePromptRequest, setTemplatePromptRequest] = useState<TemplatePromptRequest | null>(null)
  const [templateNameRequest, setTemplateNameRequest] = useState<TemplateNameRequest | null>(null)
  const [tagRenameRequest, setTagRenameRequest] = useState<TagRenameRequest | null>(null)
  const [tagRemoveRequest, setTagRemoveRequest] = useState<TagRemoveRequest | null>(null)
  const [folderCreateRequest, setFolderCreateRequest] = useState<FolderCreateRequest | null>(null)
  const [folderRenameRequest, setFolderRenameRequest] = useState<FolderRenameRequest | null>(null)
  const [moveNoteRequest, setMoveNoteRequest] = useState<MoveNoteRequest | null>(null)
  const [workspaceRenameRequest, setWorkspaceRenameRequest] = useState<WorkspaceRenameRequest | null>(null)
  const [pinnedNoteIds, setPinnedNoteIds] = useLocalStorageState<string[]>('mc-pinned-note-ids', [])
  const [pinnedNoteSyncUpdatedAt, setPinnedNoteSyncUpdatedAt] = useLocalStorageState('mc-pinned-note-sync-updated-at', 0)
  const [recentNoteIds, setRecentNoteIds] = useLocalStorageState<string[]>('mc-recent-note-ids', [])
  const [recentLimit, setRecentLimit] = useLocalStorageState('mc-notes-recent-limit', 5)
  const [workspaceSnapshot, setWorkspaceSnapshot] = useLocalStorageState<NotesWorkspaceSnapshot | null>('mc-notes-workspace-snapshot', null)
  const [workspaceSnapshots, setWorkspaceSnapshots] = useLocalStorageState<NotesWorkspaceSnapshot[]>('mc-notes-workspace-snapshots', [])
  const [workspaceTabIds, setWorkspaceTabIds] = useLocalStorageState<string[]>('mc-notes-workspace-tab-ids', [])
  const [workspaceSidePaneId, setWorkspaceSidePaneId] = useLocalStorageState<string | null>('mc-notes-workspace-side-pane-id', null)
  const [fileTreeExpandedFolders, setFileTreeExpandedFolders] = useState<Set<string>>(new Set(['']))
  const [dataWorkspaceContext, setDataWorkspaceContext] = useState<VaultDataWorkspaceContext>(() => normalizeVaultDataWorkspaceContext(null))
  const [workspaceSyncState, setWorkspaceSyncState] = useState<WorkspaceSyncState>('local')
  const [workspaceSyncError, setWorkspaceSyncError] = useState<string | null>(null)
  const [savedSearches, setSavedSearches] = useLocalStorageState<NotesSavedSearch[]>('mc-notes-saved-searches', [])
  const [savedSearchSyncState, setSavedSearchSyncState] = useState<SavedSearchSyncState>('local')
  const [savedSearchSyncError, setSavedSearchSyncError] = useState<string | null>(null)
  const [pinnedNotesSyncState, setPinnedNotesSyncState] = useState<PinnedNotesSyncState>('local')
  const [pinnedNotesSyncError, setPinnedNotesSyncError] = useState<string | null>(null)
  const [editorPreferencesSyncState, setEditorPreferencesSyncState] = useState<EditorPreferencesSyncState>('local')
  const [editorPreferencesSyncError, setEditorPreferencesSyncError] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const topBarRef = useRef<HTMLDivElement>(null)
  const templatePromptResolverRef = useRef<((values: Record<string, string> | null) => void) | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const encryptedBackupInputRef = useRef<HTMLInputElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingContentRef = useRef<Map<string, string>>(new Map())
  const selectionAnchorRef = useRef<NoteSelectionAnchor | null>(null)
  const notesRef = useRef(notes)
  const initialSelectionRecoveredRef = useRef(false)
  const workspaceSnapshotsRef = useRef(workspaceSnapshots)
  const savedSearchesRef = useRef(savedSearches)
  const editorPreferencesRef = useRef(editorPreferences)
  const editorPreferencesSyncStateRef = useRef<SyncedNotesEditorPreferences>(
    notesEditorPreferencesToSyncState(editorPreferences, Number(editorPreferencesSyncUpdatedAt) || 0),
  )
  const pinnedNotesStateRef = useRef<NotesPinnedNotesState>({
    pinnedNoteIds: normalizePinnedNoteIds(pinnedNoteIds),
    updatedAt: Number(pinnedNoteSyncUpdatedAt) || 0,
  })
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [networkOnline, setNetworkOnline] = useState(() => {
    if (typeof navigator === 'undefined') return true
    return navigator.onLine !== false
  })
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRevisions, setHistoryRevisions] = useState<VaultRevision[]>([])
  const [historyPreview, setHistoryPreview] = useState<VaultRevisionDetail | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [versionNameRequest, setVersionNameRequest] = useState<VersionNameRequest | null>(null)
  const [documentPropertyRequest, setDocumentPropertyRequest] = useState<DocumentPropertyRequest | null>(null)
  const [reviewPackageRequest, setReviewPackageRequest] = useState<ReviewPackageRequest | null>(null)
  const [pluginMarketplaceFeedRequest, setPluginMarketplaceFeedRequest] = useState<PluginMarketplaceFeedRequest | null>(null)
  const [encryptedBackupRequest, setEncryptedBackupRequest] = useState<EncryptedBackupRequest | null>(null)
  const [confirmActionRequest, setConfirmActionRequest] = useState<ConfirmActionRequest | null>(null)
  const [noticeRequest, setNoticeRequest] = useState<NoticeRequest | null>(null)
  const [searchResultNotes, setSearchResultNotes] = useState<typeof notes | null>(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState<string | null>(null)
  const [noteComments, setNoteComments] = useState<VaultComment[]>([])
  const [commentComposeRequest, setCommentComposeRequest] = useState<CommentComposeRequest | null>(null)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null)
  const [noteSuggestions, setNoteSuggestions] = useState<VaultSuggestion[]>([])
  const [suggestionComposeRequest, setSuggestionComposeRequest] = useState<SuggestionComposeRequest | null>(null)
  const [writingAssistRequest, setWritingAssistRequest] = useState<WritingAssistRequest | null>(null)
  const [mergeConflictReviewRequest, setMergeConflictReviewRequest] = useState<MergeConflictReviewRequest | null>(null)
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
  const [queuedEditsOpen, setQueuedEditsOpen] = useState(false)
  const [saveErrorByNoteId, setSaveErrorByNoteId] = useState<Record<string, string>>({})

  const selected = notes.find(n => n._id === selectedId) ?? null
  const selectedWordStats = useMemo(
    () => selected?.type === 'note' ? documentStats(selected.content) : null,
    [selected],
  )
  const selectedOutlineHeadings = useMemo(() => {
    if (selected?.type !== 'note') return []
    return collectMarkdownOutlineHeadings(pendingContentRef.current.get(selected._id) ?? selected.content)
  }, [saveState, selected])
  const selectedWordSelectionStats = useMemo(
    () => selectionAnchor?.scope === 'selection' && selectionAnchor.quote?.trim()
      ? documentStats(selectionAnchor.quote)
      : null,
    [selectionAnchor],
  )
  const normalizedEditorPreferences = useMemo(
    () => normalizeNotesEditorPreferences(editorPreferences),
    [editorPreferences],
  )
  const writingAssistDefaults = useMemo<WritingAssistControls>(
    () => ({
      provider: normalizedEditorPreferences.writingAssistProvider,
      tone: normalizedEditorPreferences.writingAssistTone,
      length: normalizedEditorPreferences.writingAssistLength,
    }),
    [
      normalizedEditorPreferences.writingAssistLength,
      normalizedEditorPreferences.writingAssistProvider,
      normalizedEditorPreferences.writingAssistTone,
    ],
  )
  const notesCssSnippet = useMemo(
    () => notesCssSnippetText(normalizedEditorPreferences),
    [normalizedEditorPreferences],
  )
  const notesVaultAppearanceStyle = useMemo(
    () => notesAppearanceStyle(normalizedEditorPreferences.appearanceMode),
    [normalizedEditorPreferences.appearanceMode],
  )
  const editorPreferencesSyncLabel =
    editorPreferencesSyncState === 'loading'
      ? 'Preferences syncing'
      : editorPreferencesSyncState === 'saving'
        ? 'Preferences saving'
        : editorPreferencesSyncState === 'synced'
          ? 'Preferences synced'
          : editorPreferencesSyncState === 'error'
            ? 'Preferences unsynced'
            : 'Preferences local'
  const editorPreferencesSyncDetail =
    editorPreferencesSyncState === 'error'
      ? editorPreferencesSyncError || 'Editor preferences are kept on this device.'
      : editorPreferencesSyncState === 'local'
        ? 'Saved locally until vault sync is available.'
        : 'Synced through the local vault. Remote collaboration keys stay local.'
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
  const allTemplates = useMemo<NoteTemplate[]>(() => [...NOTE_TEMPLATES, ...vaultTemplates], [vaultTemplates])
  const selectedFolderTemplate = useMemo(
    () => selectFolderTemplate(vaultTemplates, selected?.folder),
    [selected?.folder, vaultTemplates],
  )
  const vaultPlugins = useMemo(() => installedVaultPlugins(notes), [notes])
  const vaultPluginCommands = useMemo(() => buildVaultPluginCommandContributions(notes), [notes])
  const pinnedNoteSet = useMemo(() => new Set(pinnedNoteIds), [pinnedNoteIds])
  const pinnedNotesSyncLabel =
    pinnedNotesSyncState === 'loading'
      ? 'Pinned notes syncing'
      : pinnedNotesSyncState === 'saving'
        ? 'Pinned notes saving'
        : pinnedNotesSyncState === 'synced'
          ? 'Pinned notes synced'
          : pinnedNotesSyncState === 'error'
            ? 'Pinned notes unsynced'
            : 'Pinned notes local'
  const pinnedNotesSyncDetail =
    pinnedNotesSyncState === 'error'
      ? pinnedNotesSyncError || 'Local pinned notes are kept on this device.'
      : pinnedNotesSyncState === 'local'
        ? 'Saved locally until vault sync is available.'
        : 'Synced through the local vault.'
  const normalizedSavedSearches = useMemo(() => normalizeSavedSearches(savedSearches), [savedSearches])
  const savedSearchSyncLabel =
    savedSearchSyncState === 'loading'
      ? 'Searches syncing'
      : savedSearchSyncState === 'saving'
        ? 'Searches saving'
        : savedSearchSyncState === 'synced'
          ? 'Searches synced'
          : savedSearchSyncState === 'error'
            ? 'Searches unsynced'
            : 'Searches local'
  const savedSearchSyncDetail =
    savedSearchSyncState === 'error'
      ? savedSearchSyncError || 'Local saved searches are kept on this device.'
      : savedSearchSyncState === 'local'
        ? 'Saved locally until vault sync is available.'
        : 'Synced through the local vault.'
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
        .map(suggestion => {
          const patchType = typeof suggestion.patch.type === 'string' ? suggestion.patch.type : ''
          const content = typeof suggestion.patch.content === 'string' ? suggestion.patch.content : ''
          const anchor = normalizeSelectionAnchor(suggestion.anchor)
          const trackedChange =
            patchType === 'replace_selection'
              ? { type: 'replace' as const, before: anchor?.quote ?? '', after: content }
              : patchType === 'insert_at_cursor'
                ? { type: 'insert' as const, after: content }
                : patchType === 'replace_document'
                  ? { type: 'replace_document' as const, after: content }
                  : undefined
          return {
            id: suggestion.id,
            kind: 'suggestion' as const,
            status: suggestion.status,
            anchor: suggestion.anchor,
            trackedChange,
          }
        }),
    ]
  }, [noteComments, noteSuggestions, selected])

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  useEffect(() => {
    editorPreferencesRef.current = normalizedEditorPreferences
    editorPreferencesSyncStateRef.current = notesEditorPreferencesToSyncState(
      normalizedEditorPreferences,
      Number(editorPreferencesSyncUpdatedAt) || 0,
    )
  }, [editorPreferencesSyncUpdatedAt, normalizedEditorPreferences])

  const syncEditorPreferencesState = useCallback(async (state: SyncedNotesEditorPreferences) => {
    const normalized = notesEditorPreferencesToSyncState(state.preferences, Number(state.updatedAt) || Date.now())
    editorPreferencesSyncStateRef.current = normalized
    setEditorPreferencesSyncState('saving')
    setEditorPreferencesSyncError(null)
    try {
      await saveSyncedNotesEditorPreferences(normalized)
      setEditorPreferencesSyncState('synced')
    } catch (err) {
      setEditorPreferencesSyncState('error')
      setEditorPreferencesSyncError(errorMessage(err))
    }
  }, [])

  const updateEditorPreferences = useCallback((preferences: NotesEditorPreferences) => {
    const normalized = normalizeNotesEditorPreferences(preferences)
    const updatedAt = Date.now()
    const syncState = notesEditorPreferencesToSyncState(normalized, updatedAt)
    editorPreferencesRef.current = normalized
    editorPreferencesSyncStateRef.current = syncState
    setEditorPreferences(normalized)
    setEditorPreferencesSyncUpdatedAt(updatedAt)
    void syncEditorPreferencesState(syncState)
  }, [setEditorPreferences, setEditorPreferencesSyncUpdatedAt, syncEditorPreferencesState])

  const updateWritingAssistDefaults = useCallback((controls: WritingAssistControls) => {
    updateEditorPreferences({
      ...editorPreferencesRef.current,
      writingAssistProvider: controls.provider,
      writingAssistTone: controls.tone,
      writingAssistLength: controls.length,
    })
  }, [updateEditorPreferences])

  useEffect(() => {
    let cancelled = false
    setEditorPreferencesSyncState('loading')
    setEditorPreferencesSyncError(null)

    async function loadEditorPreferences() {
      const local = editorPreferencesSyncStateRef.current
      const synced = await loadSyncedNotesEditorPreferences()
      if (cancelled) return
      const merged = mergeSyncedNotesEditorPreferences(synced, local)
      editorPreferencesSyncStateRef.current = merged
      if (!syncedNotesEditorPreferencesEqual(merged, local)) {
        const nextPreferences = applySyncedNotesEditorPreferences(editorPreferencesRef.current, merged)
        editorPreferencesRef.current = nextPreferences
        setEditorPreferences(nextPreferences)
        setEditorPreferencesSyncUpdatedAt(merged.updatedAt)
      }
      if (!syncedNotesEditorPreferencesEqual(merged, synced)) {
        await syncEditorPreferencesState(merged)
        return
      }
      setEditorPreferencesSyncState('synced')
    }

    loadEditorPreferences().catch((err) => {
      if (cancelled) return
      setEditorPreferencesSyncState('error')
      setEditorPreferencesSyncError(errorMessage(err))
    })

    return () => {
      cancelled = true
    }
  }, [setEditorPreferences, setEditorPreferencesSyncUpdatedAt, syncEditorPreferencesState])

  const handleRetryEditorPreferencesSync = useCallback(() => {
    void syncEditorPreferencesState(editorPreferencesSyncStateRef.current)
  }, [syncEditorPreferencesState])

  useEffect(() => {
    pinnedNotesStateRef.current = {
      pinnedNoteIds: normalizePinnedNoteIds(pinnedNoteIds),
      updatedAt: Number(pinnedNoteSyncUpdatedAt) || 0,
    }
  }, [pinnedNoteIds, pinnedNoteSyncUpdatedAt])

  const syncPinnedNotesState = useCallback(async (state: NotesPinnedNotesState) => {
    const normalized: NotesPinnedNotesState = {
      pinnedNoteIds: normalizePinnedNoteIds(state.pinnedNoteIds),
      updatedAt: Number(state.updatedAt) || Date.now(),
    }
    pinnedNotesStateRef.current = normalized
    setPinnedNotesSyncState('saving')
    setPinnedNotesSyncError(null)
    try {
      await saveSyncedPinnedNotesState(normalized)
      setPinnedNotesSyncState('synced')
    } catch (err) {
      setPinnedNotesSyncState('error')
      setPinnedNotesSyncError(errorMessage(err))
    }
  }, [])

  const updatePinnedNoteIds = useCallback((updater: (previous: string[]) => string[]) => {
    const updatedAt = Date.now()
    setPinnedNoteIds(prev => {
      const next = normalizePinnedNoteIds(updater(prev))
      const nextState = { pinnedNoteIds: next, updatedAt }
      pinnedNotesStateRef.current = nextState
      void syncPinnedNotesState(nextState)
      return next
    })
    setPinnedNoteSyncUpdatedAt(updatedAt)
  }, [setPinnedNoteIds, setPinnedNoteSyncUpdatedAt, syncPinnedNotesState])

  useEffect(() => {
    let cancelled = false
    setPinnedNotesSyncState('loading')
    setPinnedNotesSyncError(null)

    async function loadPinnedNotesState() {
      const local = pinnedNotesStateRef.current
      const synced = await loadSyncedPinnedNotesState()
      if (cancelled) return
      const merged = mergePinnedNotesState(synced, local)
      pinnedNotesStateRef.current = merged
      if (!pinnedNotesStateEqual(merged, local)) {
        setPinnedNoteIds(merged.pinnedNoteIds)
        setPinnedNoteSyncUpdatedAt(merged.updatedAt)
      }
      if (!pinnedNotesStateEqual(merged, synced)) {
        await syncPinnedNotesState(merged)
        return
      }
      setPinnedNotesSyncState('synced')
    }

    loadPinnedNotesState().catch((err) => {
      if (cancelled) return
      setPinnedNotesSyncState('error')
      setPinnedNotesSyncError(errorMessage(err))
    })

    return () => {
      cancelled = true
    }
  }, [setPinnedNoteIds, setPinnedNoteSyncUpdatedAt, syncPinnedNotesState])

  const handleRetryPinnedNotesSync = useCallback(() => {
    void syncPinnedNotesState(pinnedNotesStateRef.current)
  }, [syncPinnedNotesState])

  useEffect(() => {
    savedSearchesRef.current = normalizedSavedSearches
  }, [normalizedSavedSearches])

  const syncSavedSearches = useCallback(async (searches: NotesSavedSearch[]) => {
    const normalized = normalizeSavedSearches(searches)
    savedSearchesRef.current = normalized
    setSavedSearchSyncState('saving')
    setSavedSearchSyncError(null)
    try {
      await saveSyncedNotesSavedSearches(normalized)
      setSavedSearchSyncState('synced')
    } catch (err) {
      setSavedSearchSyncState('error')
      setSavedSearchSyncError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setSavedSearchSyncState('loading')
    setSavedSearchSyncError(null)

    async function loadSavedSearches() {
      const local = savedSearchesRef.current
      const synced = await loadSyncedNotesSavedSearches()
      if (cancelled) return
      const merged = mergeSavedSearches(synced, local)
      savedSearchesRef.current = merged
      if (!savedSearchesEqual(merged, local)) {
        setSavedSearches(merged)
      }
      if (!savedSearchesEqual(merged, synced)) {
        await syncSavedSearches(merged)
        return
      }
      setSavedSearchSyncState('synced')
    }

    loadSavedSearches().catch((err) => {
      if (cancelled) return
      setSavedSearchSyncState('error')
      setSavedSearchSyncError(errorMessage(err))
    })

    return () => {
      cancelled = true
    }
  }, [setSavedSearches, syncSavedSearches])

  const handleRetrySavedSearchSync = useCallback(() => {
    void syncSavedSearches(savedSearchesRef.current)
  }, [syncSavedSearches])

  useEffect(() => {
    const updateNetworkState = () => setNetworkOnline(navigator.onLine !== false)
    window.addEventListener('online', updateNetworkState)
    window.addEventListener('offline', updateNetworkState)
    updateNetworkState()
    return () => {
      window.removeEventListener('online', updateNetworkState)
      window.removeEventListener('offline', updateNetworkState)
    }
  }, [])

  useEffect(() => {
    const updateTopBarDensity = (observedWidth?: number) => {
      const measuredWidth = observedWidth ?? topBarRef.current?.getBoundingClientRect().width ?? 0
      setCompactTopBarActions(
        window.innerWidth < COMPACT_TOPBAR_VIEWPORT_WIDTH ||
          (measuredWidth > 0 && measuredWidth < COMPACT_TOPBAR_ACTUAL_WIDTH),
      )
    }
    updateTopBarDensity()
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(entries => {
          updateTopBarDensity(entries[0]?.contentRect.width)
        })
    const handleWindowResize = () => updateTopBarDensity()
    if (topBarRef.current) observer?.observe(topBarRef.current)
    window.addEventListener('resize', handleWindowResize)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', handleWindowResize)
    }
  }, [])

  useEffect(() => {
    selectionAnchorRef.current = null
    setSelectionAnchor(null)
    setActiveReviewId(null)
    setTopBarMenu(null)
  }, [selectedId])

  useEffect(() => {
    setTopBarMenu(null)
  }, [compactTopBarActions, viewMode])

  useEffect(() => {
    if (!topBarMenu) return

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTopBarMenu(null)
    }
    const closeOnOutsidePointer = (event: MouseEvent | PointerEvent) => {
      const target = event.target
      if (target instanceof Node && topBarRef.current?.contains(target)) return
      setTopBarMenu(null)
    }

    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('mousedown', closeOnOutsidePointer)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('mousedown', closeOnOutsidePointer)
    }
  }, [topBarMenu])

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

  const unavailableNoteIds = useMemo(
    () => new Set(unavailableNotes.map(note => note._id)),
    [unavailableNotes],
  )
  const visibleVaultNotes = useMemo(() => {
    const byId = new Map<string, VaultNote>()
    for (const note of notes) byId.set(note._id, note)
    for (const note of unavailableNotes) {
      if (!byId.has(note._id)) byId.set(note._id, note)
    }
    return [...byId.values()]
  }, [notes, unavailableNotes])
  const fileTreeNotes = useMemo(
    () => {
      if (!searchResultNotes) return visibleVaultNotes
      const byId = new Map(searchResultNotes.map(note => [note._id, note]))
      for (const note of unavailableNotes) {
        if (matchesNoteSearch(note, searchQuery) && !byId.has(note._id)) {
          byId.set(note._id, note)
        }
      }
      return [...byId.values()]
    },
    [searchQuery, searchResultNotes, unavailableNotes, visibleVaultNotes],
  )
  const searchUsesBackend = searchResultNotes !== null

  const allNoteTitles = useMemo(
    () => visibleVaultNotes.filter(n => n.type === 'note').flatMap(n => [n.title, ...(n.aliases ?? [])]),
    [visibleVaultNotes],
  )

  const normalizedRecentLimit = Math.max(1, Math.min(10, Number(recentLimit) || 5))
  const noteById = useMemo(() => new Map(notes.map(note => [note._id, note])), [notes])
  const pinnedWorkspaceNotes = useMemo(
    () => pinnedNoteIds
      .map(id => noteById.get(id))
      .filter((note): note is VaultNote => !!note && note.type === 'note' && !isNoteInTrash(note))
      .slice(0, 5),
    [noteById, pinnedNoteIds],
  )
  const recentWorkspaceNotes = useMemo(
    () => recentNoteIds
      .map(id => noteById.get(id))
      .filter((note): note is VaultNote => !!note && note.type === 'note' && !isNoteInTrash(note))
      .filter(note => !pinnedNoteSet.has(note._id))
      .slice(0, normalizedRecentLimit),
    [noteById, normalizedRecentLimit, pinnedNoteSet, recentNoteIds],
  )
  const workspaceTabNotes = useMemo(
    () => workspaceTabIds
      .map(id => noteById.get(id))
      .filter((note): note is VaultNote => !!note && note.type === 'note' && !isNoteInTrash(note))
      .slice(0, 8),
    [noteById, workspaceTabIds],
  )
  const workspaceSidePaneNote = useMemo(() => {
    if (!workspaceSidePaneId) return null
    const note = noteById.get(workspaceSidePaneId)
    return note?.type === 'note' && !isNoteInTrash(note) ? note : null
  }, [noteById, workspaceSidePaneId])
  const workspaceSidePanePixelWidth = clampWorkspaceSidePaneWidth(
    Number(workspaceSidePaneWidth) || DEFAULT_WORKSPACE_SIDE_PANE_WIDTH,
  )
  const workspaceExpandedFolders = useMemo(
    () => [...fileTreeExpandedFolders]
      .map(path => path.trim())
      .filter(Boolean)
      .filter((path, index, paths) => paths.indexOf(path) === index)
      .sort()
      .slice(0, 32),
    [fileTreeExpandedFolders],
  )
  const dataWorkspaceContextId = useMemo(() => [
    dataWorkspaceContext.mode,
    dataWorkspaceContext.query,
    dataWorkspaceContext.dataSortKey,
    dataWorkspaceContext.taskSortKey,
    dataWorkspaceContext.sortDirection,
    dataWorkspaceContext.groupKey,
    dataWorkspaceContext.layout,
    dataWorkspaceContext.formulaKey,
    dataWorkspaceContext.customFormula,
  ].join('|').slice(0, 280), [dataWorkspaceContext])
  const currentWorkspaceSnapshotName = `${viewModeLabel(viewMode)} / ${selected?.title || 'No active note'}`
  const currentWorkspaceSnapshotId = [
    viewMode,
    focusMode ? 'focus' : 'tree',
    infoPanelOpen ? 'info' : 'no-info',
    selectedId ?? 'no-note',
    workspaceSidePaneNote?._id ?? 'no-side-pane',
    workspaceTabIds.join('|') || 'no-tabs',
    viewMode === 'data' ? dataWorkspaceContextId : 'no-data',
  ].join(':')
  const normalizedWorkspaceSnapshots = workspaceSnapshots
    .filter(snapshot => snapshot && typeof snapshot.savedAt === 'number')
    .slice()
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, 8)
  const workspaceSyncLabel =
    workspaceSyncState === 'loading'
      ? 'Workspaces syncing'
      : workspaceSyncState === 'saving'
        ? 'Workspaces saving'
        : workspaceSyncState === 'synced'
          ? 'Workspaces synced'
          : workspaceSyncState === 'error'
            ? 'Workspaces unsynced'
            : 'Workspaces local'
  const workspaceSyncDetail =
    workspaceSyncState === 'error'
      ? workspaceSyncError || 'Local presets are kept on this device.'
      : workspaceSyncState === 'local'
        ? 'Saved locally until vault sync is available.'
        : 'Synced through the local vault.'

  useEffect(() => {
    workspaceSnapshotsRef.current = normalizeNotesWorkspaceSnapshots(workspaceSnapshots)
  }, [workspaceSnapshots])

  const syncWorkspaceSnapshots = useCallback(async (snapshots: NotesWorkspaceSnapshot[]) => {
    const normalized = normalizeNotesWorkspaceSnapshots(snapshots)
    workspaceSnapshotsRef.current = normalized
    setWorkspaceSyncState('saving')
    setWorkspaceSyncError(null)
    try {
      await saveSyncedNotesWorkspaceSnapshots(normalized)
      setWorkspaceSyncState('synced')
    } catch (err) {
      setWorkspaceSyncState('error')
      setWorkspaceSyncError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setWorkspaceSyncState('loading')
    setWorkspaceSyncError(null)

    async function loadWorkspaceSnapshots() {
      const local = workspaceSnapshotsRef.current
      const synced = await loadSyncedNotesWorkspaceSnapshots()
      if (cancelled) return
      const merged = mergeNotesWorkspaceSnapshots(synced, local)
      workspaceSnapshotsRef.current = merged
      if (!notesWorkspaceSnapshotsEqual(merged, local)) {
        setWorkspaceSnapshots(merged)
      }
      setWorkspaceSnapshot(prev => prev ?? merged[0] ?? null)
      if (!notesWorkspaceSnapshotsEqual(merged, synced)) {
        await syncWorkspaceSnapshots(merged)
        return
      }
      setWorkspaceSyncState('synced')
    }

    loadWorkspaceSnapshots().catch((err) => {
      if (cancelled) return
      setWorkspaceSyncState('error')
      setWorkspaceSyncError(errorMessage(err))
    })

    return () => {
      cancelled = true
    }
  }, [setWorkspaceSnapshot, setWorkspaceSnapshots, syncWorkspaceSnapshots])

  const handleRetryWorkspaceSync = useCallback(() => {
    void syncWorkspaceSnapshots(workspaceSnapshotsRef.current)
  }, [syncWorkspaceSnapshots])

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

      if (!networkOnline) {
        setSaveState('unsaved')
        return
      }

      setSaveState('saving')
      let failed = false
      for (const [noteId, content] of entries) {
        const note = notesRef.current.find(item => item._id === noteId)
        if (!note || note.type === 'attachment') continue
        try {
          const saved = await updateNote({ ...note, content })
          notesRef.current = notesRef.current.map(item => (item._id === saved._id ? saved : item))
          pendingContentRef.current.delete(noteId)
          setSaveErrorByNoteId(prev => {
            if (!(noteId in prev)) return prev
            const next = { ...prev }
            delete next[noteId]
            return next
          })
        } catch (err) {
          failed = true
          const message = errorMessage(err)
          console.error('[notes] autosave failed:', err)
          setSaveErrorByNoteId(prev => ({ ...prev, [noteId]: message }))
        }
      }
      if (failed) {
        setSaveState('error')
      } else {
        setLastSavedAt(Date.now())
        setSaveState(pendingContentRef.current.size ? 'unsaved' : 'saved')
      }
    },
    [networkOnline, updateNote],
  )

  useEffect(() => {
    if (!networkOnline || pendingContentRef.current.size === 0) return
    void flushPendingSave()
  }, [flushPendingSave, networkOnline])

  useEffect(() => {
    if (initialSelectionRecoveredRef.current || loading || !focusMode) return
    if (selectedId && selected) {
      initialSelectionRecoveredRef.current = true
      return
    }

    const firstEditableNote = notes.find(note => note.type === 'note' && !isNoteInTrash(note))
    if (!firstEditableNote) return

    initialSelectionRecoveredRef.current = true
    setSelectedId(firstEditableNote._id)
    if (viewMode !== 'editor') setViewMode('editor')
  }, [focusMode, loading, notes, selected, selectedId, viewMode])

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
    if (!selected || selected.type !== 'note' || isNoteInTrash(selected)) return
    setWorkspaceTabIds(prev => {
      if (prev.includes(selected._id)) return prev
      return [selected._id, ...prev].slice(0, 8)
    })
  }, [selected, setWorkspaceTabIds])

  useEffect(() => {
    if (loading) return
    const liveNoteIds = new Set(
      notes
        .filter(note => note.type === 'note' && !isNoteInTrash(note))
        .map(note => note._id),
    )
    setWorkspaceTabIds(prev => {
      const next = prev
        .filter((id, index, ids) => ids.indexOf(id) === index && liveNoteIds.has(id))
        .slice(0, 8)
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) return prev
      return next
    })
  }, [loading, notes, setWorkspaceTabIds])

  useEffect(() => {
    if (loading || !selectedId || selected) return
    const firstEditableNote = notes.find(note => note.type === 'note' && !isNoteInTrash(note))
    if (!firstEditableNote) return
    setSelectedId(firstEditableNote._id)
    if (viewMode !== 'editor') setViewMode('editor')
  }, [loading, notes, selected, selectedId, viewMode])

  useEffect(() => {
    if (!workspaceSidePaneId) return
    const note = noteById.get(workspaceSidePaneId)
    if (!note || note.type !== 'note' || isNoteInTrash(note)) {
      setWorkspaceSidePaneId(null)
    }
  }, [noteById, setWorkspaceSidePaneId, workspaceSidePaneId])

  useEffect(() => {
    if (!editingTitle) setTitleDraft(selected?.title ?? '')
  }, [editingTitle, selected?.title])

  const resolveTemplatePromptRequest = useCallback((values: Record<string, string> | null) => {
    templatePromptResolverRef.current?.(values)
    templatePromptResolverRef.current = null
    setTemplatePromptRequest(null)
  }, [])

  const collectTemplatePromptValues = useCallback((template: NoteTemplate): Promise<Record<string, string> | null> => {
    const prompts = extractTemplatePrompts(template.content)
    if (prompts.length === 0) return Promise.resolve({})
    templatePromptResolverRef.current?.(null)
    return new Promise(resolve => {
      templatePromptResolverRef.current = resolve
      setTemplatePromptRequest({ templateLabel: template.label, prompts })
    })
  }, [])

  const handleCreate = useCallback(
    async (folder?: string, title = 'Untitled', content = '', options: { useFolderTemplate?: boolean } = {}) => {
      const folderTemplate = content || options.useFolderTemplate === false ? null : selectFolderTemplate(vaultTemplates, folder)
      const promptValues = folderTemplate ? await collectTemplatePromptValues(folderTemplate) : {}
      if (!promptValues) return
      const nextContent = folderTemplate
        ? applyTemplate(folderTemplate, { title, folder, promptValues })
        : content
      const note = await createNote(title, folder, nextContent)
      setSelectedId(note._id)
      setViewMode('editor')
      setTitleDraft(note.title)
      setTimeout(() => {
        setEditingTitle(true)
        titleRef.current?.focus()
      }, 50)
    },
    [collectTemplatePromptValues, createNote, vaultTemplates],
  )

  const handleCreateDailyNote = useCallback(
    async (folder?: string, date: Date = new Date()) => {
      const now = date
      const targetFolder = folder ?? normalizedEditorPreferences.dailyNoteFolder
      const title = buildDailyNoteTitle(normalizedEditorPreferences, now)
      const existing = normalizedEditorPreferences.dailyNoteOpenExisting
        ? notesRef.current.find(note =>
            note.type === 'note' &&
            note.title === title &&
            normalizeFolderPath(note.folder || '') === normalizeFolderPath(targetFolder || ''),
          )
        : null
      if (existing) {
        setSelectedId(existing._id)
        setViewMode('editor')
        setTitleDraft(existing.title)
        return
      }

      if (targetFolder) await createFolder(targetFolder)
      const daily =
        allTemplates.find(template => template.id === normalizedEditorPreferences.dailyNoteTemplateId) ??
        allTemplates.find(template => template.id === 'daily')
      const promptValues = daily ? await collectTemplatePromptValues(daily) : {}
      if (!promptValues) return
      await handleCreate(
        targetFolder,
        title,
        daily ? applyTemplate(daily, { now, title, folder: targetFolder, promptValues }) : `# ${title}\n\n`,
        { useFolderTemplate: false },
      )
    },
    [allTemplates, collectTemplatePromptValues, createFolder, handleCreate, normalizedEditorPreferences],
  )

  const handleCreatePeriodicNote = useCallback(
    async (kind: NotesPeriodicKind, folder?: string, date: Date = new Date()) => {
      if (kind === 'daily') {
        await handleCreateDailyNote(folder, date)
        return
      }

      const now = date
      const targetFolder = folder ?? periodicNoteFolder(kind, normalizedEditorPreferences)
      const title = buildPeriodicNoteTitle(kind, normalizedEditorPreferences, now)
      const existing = normalizedEditorPreferences.dailyNoteOpenExisting
        ? notesRef.current.find(note =>
            note.type === 'note' &&
            note.title === title &&
            normalizeFolderPath(note.folder || '') === normalizeFolderPath(targetFolder || ''),
          )
        : null
      if (existing) {
        setSelectedId(existing._id)
        setViewMode('editor')
        setTitleDraft(existing.title)
        return
      }

      if (targetFolder) await createFolder(targetFolder)
      const preferredTemplateId = periodicNoteTemplateId(kind, normalizedEditorPreferences)
      const template =
        allTemplates.find(item => item.id === preferredTemplateId) ??
        allTemplates.find(item => item.id === kind) ??
        allTemplates.find(item => item.id === normalizedEditorPreferences.dailyNoteTemplateId) ??
        allTemplates.find(item => item.id === 'daily')
      const promptValues = template ? await collectTemplatePromptValues(template) : {}
      if (!promptValues) return
      await handleCreate(
        targetFolder,
        title,
        template ? applyTemplate(template, { now, title, folder: targetFolder, promptValues }) : `# ${title}\n\n`,
        { useFolderTemplate: false },
      )
    },
    [allTemplates, collectTemplatePromptValues, createFolder, handleCreate, handleCreateDailyNote, normalizedEditorPreferences],
  )

  const handleCreateTemplate = useCallback(
    async (folder: string | undefined, templateId: string) => {
      const template = allTemplates.find(item => item.id === templateId)
      if (!template) return
      const title =
        template.id === 'meeting' ? 'Meeting Note' : template.id === 'project' ? 'Project Brief' : template.label
      const promptValues = await collectTemplatePromptValues(template)
      if (!promptValues) return
      await handleCreate(folder, title, applyTemplate(template, { title, folder, promptValues }), { useFolderTemplate: false })
    },
    [allTemplates, collectTemplatePromptValues, handleCreate],
  )

  const handleSaveSearch = useCallback(() => {
    const query = searchQuery.trim()
    if (!query) return
    setSavedSearches(prev => {
      const next = upsertSavedSearch(prev, { query })
      void syncSavedSearches(next)
      return next
    })
  }, [searchQuery, setSavedSearches, syncSavedSearches])

  const handleRemoveSavedSearch = useCallback(
    (id: string) => {
      setSavedSearches(prev => {
        const next = removeSavedSearch(prev, id)
        void syncSavedSearches(next)
        return next
      })
    },
    [setSavedSearches, syncSavedSearches],
  )

  const handleRenameTag = useCallback(
    (tag: string) => {
      const affected = affectedNotesForTagRename(notesRef.current, tag)
      if (affected.length === 0) return
      setTagRenameRequest({ tag, affectedCount: affected.length })
    },
    [],
  )

  const handleConfirmRenameTag = useCallback(
    async (tag: string, nextTag: string) => {
      const affected = affectedNotesForTagRename(notesRef.current, tag)
      if (affected.length === 0) {
        setTagRenameRequest(null)
        return
      }
      await flushPendingSave()
      for (const note of affected) {
        const nextContent = renameTagInContent(note.content, tag, nextTag)
        if (nextContent !== note.content) {
          await updateNote({ ...note, content: nextContent, updated_at: Date.now() })
        }
      }
      setTagRenameRequest(null)
      await refresh()
    },
    [flushPendingSave, refresh, updateNote],
  )

  const handleRemoveTag = useCallback(
    (tag: string) => {
      const affected = affectedNotesForTagRename(notesRef.current, tag)
      if (affected.length === 0) return
      setTagRemoveRequest({ tag, affectedCount: affected.length })
    },
    [],
  )

  const handleConfirmRemoveTag = useCallback(
    async (tag: string) => {
      const affected = affectedNotesForTagRename(notesRef.current, tag)
      if (affected.length === 0) {
        setTagRemoveRequest(null)
        return
      }
      await flushPendingSave()
      for (const note of affected) {
        const nextContent = removeTagFromContent(note.content, tag)
        if (nextContent !== note.content) {
          await updateNote({ ...note, content: nextContent, updated_at: Date.now() })
        }
      }
      setTagRemoveRequest(null)
      await refresh()
    },
    [flushPendingSave, refresh, updateNote],
  )

  const handleSaveCurrentAsTemplate = useCallback(() => {
    if (!selected || selected.type === 'attachment') return
    setTemplateNameRequest({ defaultTitle: selected.title ? `${selected.title} Template` : 'New Template' })
  }, [selected])

  const handleSubmitSaveCurrentAsTemplate = useCallback(async (title: string) => {
    if (!selected || selected.type === 'attachment') return
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return
    const content = pendingContentRef.current.get(selected._id) ?? selected.content
    await flushPendingSave(selected._id)
    await createFolder(VAULT_TEMPLATES_FOLDER)
    const template = await createNote(
      trimmedTitle,
      VAULT_TEMPLATES_FOLDER,
      `---\ntemplate: true\n---\n\n${content.replace(/^---[\s\S]*?\n---\s*/, '')}`,
    )
    setTemplateNameRequest(null)
    setSelectedId(template._id)
    setViewMode('editor')
    await refresh()
  }, [createFolder, createNote, flushPendingSave, refresh, selected])

  const handleCreateFolder = useCallback(
    (parent?: string) => {
      setFolderCreateRequest({ parent })
    },
    [],
  )

  const handleConfirmCreateFolder = useCallback(
    async (parent: string | undefined, name: string) => {
      const nextPath = normalizeFolderPath(parent ? `${parent}/${name}` : name)
      if (!nextPath) return
      await createFolder(nextPath)
      setFolderCreateRequest(null)
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

  const requestConfirmAction = useCallback((request: ConfirmActionRequest) => {
    setTopBarMenu(null)
    setConfirmActionRequest(request)
  }, [])

  const showNotice = useCallback((request: NoticeRequest) => {
    setTopBarMenu(null)
    setNoticeRequest(request)
  }, [])

  const handleDeleteNote = useCallback(
    (id?: string) => {
      const targetId = id ?? selectedId
      if (!targetId) return
      const note = notes.find(n => n._id === targetId)
      if (!note) return
      const label = note?.title || targetId
      const permanent = isNoteInTrash(note)
      const action = permanent ? 'Permanently delete' : 'Move to Trash'
      requestConfirmAction({
        title: `${action} note`,
        detail: permanent
          ? `"${label}" will be permanently deleted from the local vault. This cannot be undone.`
          : `"${label}" will move to Trash. A safety checkpoint is created first.`,
        confirmLabel: action,
        tone: permanent ? 'danger' : 'default',
        onConfirm: async () => {
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
          updatePinnedNoteIds(prev => prev.filter(noteId => noteId !== targetId))
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
            showNotice({
              title: `${action} failed`,
              detail: err instanceof Error ? err.message : `${action} failed`,
              tone: 'danger',
            })
            await refresh()
          }
        }
      })
    },
    [
      createSafetyCheckpoints,
      deleteNote,
      flushPendingSave,
      notes,
      refresh,
      requestConfirmAction,
      selectedId,
      setRecentNoteIds,
      showNotice,
      trashNote,
      updatePinnedNoteIds,
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
      showNotice({
        title: 'Trash is empty',
        detail: 'There are no trashed notes or folders to permanently delete.',
      })
      return
    }
    requestConfirmAction({
      title: 'Empty Trash',
      detail: `Permanently delete ${trashed.length} trashed note${trashed.length === 1 ? '' : 's'} and ${trashedFolders.length} folder${trashedFolders.length === 1 ? '' : 's'}. This cannot be undone.`,
      confirmLabel: 'Empty Trash',
      tone: 'danger',
      onConfirm: async () => {
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
        updatePinnedNoteIds(prev => prev.filter(id => !trashed.some(note => note._id === id)))
        setRecentNoteIds(prev => prev.filter(id => !trashed.some(note => note._id === id)))
        await refresh()
      },
    })
  }, [
    createSafetyCheckpoints,
    emptyTrash,
    flushPendingSave,
    folders,
    notes,
    refresh,
    requestConfirmAction,
    selectedId,
    setRecentNoteIds,
    showNotice,
    updatePinnedNoteIds,
  ])

  const refreshVaultSyncLedger = useCallback(async () => {
    try {
      const syncLedger = await getVaultSyncLedger(12)
      setVaultSyncLedger(syncLedger)
    } catch (err) {
      console.warn('[notes] could not refresh sync ledger:', err)
    }
  }, [])

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

  useEffect(() => {
    void refreshVaultSyncLedger()
  }, [refreshVaultSyncLedger])

  useEffect(() => {
    if (topBarMenu !== 'status' && topBarMenu !== 'note-tools') return
    void refreshVaultSyncLedger()
  }, [refreshVaultSyncLedger, topBarMenu])

  useEffect(() => {
    const refreshVisibleLedger = () => {
      if (document.visibilityState !== 'hidden') void refreshVaultSyncLedger()
    }
    window.addEventListener('online', refreshVisibleLedger)
    document.addEventListener('visibilitychange', refreshVisibleLedger)
    return () => {
      window.removeEventListener('online', refreshVisibleLedger)
      document.removeEventListener('visibilitychange', refreshVisibleLedger)
    }
  }, [refreshVaultSyncLedger])

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
    if (!hadPendingChange || pendingContentRef.current.has(selectedId)) return
    try {
      await createNoteVersionCheckpoint(selectedId, 'Manual save')
      setLastSavedAt(Date.now())
      setSaveState(pendingContentRef.current.size ? 'unsaved' : 'saved')
    } catch (err) {
      console.warn('[notes] manual save checkpoint failed:', err)
      setSaveState('error')
    }
  }, [flushPendingSave, selectedId])

  const handleRetryQueuedSave = useCallback(async () => {
    if (!networkOnline || pendingContentRef.current.size === 0) return
    await flushPendingSave()
  }, [flushPendingSave, networkOnline])

  const handleOpenQueuedEdit = useCallback((noteId: string) => {
    const note = notesRef.current.find(item => item._id === noteId)
    if (!note || note.type === 'attachment') return
    setSelectedId(noteId)
    setViewMode('editor')
    setTitleDraft(note.title)
    setQueuedEditsOpen(false)
  }, [])

  const handleOpenDiagnosticsNote = useCallback((noteId: string) => {
    const note = notesRef.current.find(item => item._id === noteId)
    if (!note || note.type === 'attachment') return
    setSelectedId(noteId)
    setViewMode('editor')
    setTitleDraft(note.title)
    setVaultStatusOpen(false)
  }, [])

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
    (path: string) => {
      if (!path) return
      const affectedNotes = notes.filter(note => note.type === 'note' && isNoteInsideFolder(note, path))
      const affectedFolders = folders
        .filter(folder => isInsideFolder(folder.path, path))
        .sort((a, b) => b.path.length - a.path.length)
      const permanent = isNotesTrashPath(path)
      const action = permanent ? 'Permanently delete' : 'Move to Trash'
      requestConfirmAction({
        title: `${action} folder`,
        detail: permanent
          ? `Folder "${path}" and ${affectedNotes.length} note${affectedNotes.length === 1 ? '' : 's'} will be permanently deleted. This cannot be undone.`
          : `Folder "${path}" and ${affectedNotes.length} note${affectedNotes.length === 1 ? '' : 's'} will move to Trash. Safety checkpoints are created first.`,
        confirmLabel: action,
        tone: permanent ? 'danger' : 'default',
        onConfirm: async () => {
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
        }
      })
    },
    [
      createSafetyCheckpoints,
      deleteFolder,
      deleteNote,
      flushPendingSave,
      folders,
      notes,
      refresh,
      requestConfirmAction,
      selectedId,
      trashFolder,
    ],
  )

  const handleRestoreFolder = useCallback(
    (path: string) => {
      if (!isNotesTrashPath(path)) return
      const affectedNotes = notes.filter(note => note.type === 'note' && isNoteInsideFolder(note, path))
      requestConfirmAction({
        title: 'Restore folder',
        detail: `Restore folder "${path}" and ${affectedNotes.length} note${affectedNotes.length === 1 ? '' : 's'} from Trash.`,
        confirmLabel: 'Restore folder',
        onConfirm: async () => {
          setSearchResultNotes(null)
          await restoreTrashedFolder(path)
          await refresh()
        },
      })
    },
    [notes, refresh, requestConfirmAction, restoreTrashedFolder],
  )

  const handleRenameFolder = useCallback(
    (path: string) => {
      if (!path) return
      setFolderRenameRequest({
        path,
        affectedFolderCount: folders.filter(folder => folder.path === path || folder.path.startsWith(`${path}/`)).length,
        affectedNoteCount: notes.filter(note => isNoteInsideFolder(note, path)).length,
      })
    },
    [folders, notes],
  )

  const handleConfirmRenameFolder = useCallback(
    async (path: string, nextPathRaw: string) => {
      const nextPath = normalizeFolderPath(nextPathRaw)
      if (!nextPath || nextPath === path) return
      if (nextPath.startsWith(`${path}/`)) {
        showNotice({
          title: 'Folder rename blocked',
          detail: 'A folder cannot be renamed inside itself. Choose a sibling or parent path instead.',
          tone: 'warning',
        })
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
        updatePinnedNoteIds(prev => prev.map(noteId => (noteId === note._id ? moved._id : noteId)))
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
      setFolderRenameRequest(null)
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
      setRecentNoteIds,
      showNotice,
      updatePinnedNoteIds,
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
        titleRef.current?.focus()
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
    (id: string) => {
      const note = notes.find(n => n._id === id)
      if (!note || note.type === 'attachment') return
      setMoveNoteRequest({
        noteId: id,
        title: note.title || 'Untitled',
        currentFolder: note.folder || '',
        folders: folders.map(folder => folder.path).filter(path => path.length > 0),
      })
    },
    [folders, notes],
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
      updatePinnedNoteIds(prev => prev.map(noteId => (noteId === id ? moved._id : noteId)))
      setRecentNoteIds(prev => prev.map(noteId => (noteId === id ? moved._id : noteId)))
      if (selectedId === id) setSelectedId(moved._id)
    },
    [createSafetyCheckpoints, moveNote, notes, selectedId, setRecentNoteIds, updateNote, updatePinnedNoteIds],
  )

  const handleSubmitMoveNote = useCallback(async (folder: string) => {
    const request = moveNoteRequest
    if (!request) return
    await handleMoveNoteToFolder(request.noteId, folder)
    setMoveNoteRequest(null)
  }, [handleMoveNoteToFolder, moveNoteRequest])

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
      updatePinnedNoteIds(prev => (prev.includes(id) ? prev.filter(noteId => noteId !== id) : [id, ...prev]))
    },
    [updatePinnedNoteIds],
  )

  const handleOpenWorkspaceTools = useCallback(() => {
    setCommandOpen(false)
    setTopBarMenu('workspace')
  }, [])

  const handleCycleWorkspaceTab = useCallback((direction: 'next' | 'previous') => {
    if (workspaceTabNotes.length === 0) return
    const currentIndex = selectedId ? workspaceTabNotes.findIndex(note => note._id === selectedId) : -1
    const nextIndex = direction === 'next'
      ? (currentIndex + 1) % workspaceTabNotes.length
      : (currentIndex - 1 + workspaceTabNotes.length) % workspaceTabNotes.length
    const next = workspaceTabNotes[nextIndex]
    if (!next) return
    if (selectedId && selectedId !== next._id) void flushPendingSave(selectedId)
    setSelectedId(next._id)
    setViewMode('editor')
    setCommandOpen(false)
    setTopBarMenu(null)
  }, [flushPendingSave, selectedId, workspaceTabNotes])

  const handleReorderWorkspaceTab = useCallback((sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return
    setWorkspaceTabIds(prev => {
      const fromIndex = prev.indexOf(sourceId)
      const toIndex = prev.indexOf(targetId)
      if (fromIndex === -1 || toIndex === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      const targetIndex = next.indexOf(targetId)
      if (!moved || targetIndex === -1) return prev
      next.splice(targetIndex, 0, moved)
      return next.slice(0, 8)
    })
  }, [setWorkspaceTabIds])

  const handleMoveWorkspaceTab = useCallback((id: string, direction: 'earlier' | 'later') => {
    setWorkspaceTabIds(prev => {
      const fromIndex = prev.indexOf(id)
      if (fromIndex === -1) return prev
      const toIndex = direction === 'earlier' ? fromIndex - 1 : fromIndex + 1
      if (toIndex < 0 || toIndex >= prev.length) return prev
      const next = [...prev]
      ;[next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]]
      return next.slice(0, 8)
    })
  }, [setWorkspaceTabIds])

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

      if (key === 'w' && event.altKey) {
        event.preventDefault()
        handleOpenWorkspaceTools()
        return
      }

      if (event.altKey && key === 'arrowright') {
        event.preventDefault()
        handleCycleWorkspaceTab('next')
        return
      }

      if (event.altKey && key === 'arrowleft') {
        event.preventDefault()
        handleCycleWorkspaceTab('previous')
        return
      }

      if (key === 'f' && event.shiftKey) {
        event.preventDefault()
        setFocusMode(prev => !prev)
        return
      }

      if (key === 'c' && event.shiftKey && selected?.type === 'note') {
        event.preventDefault()
        setWordCountOpen(open => !open)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    handleCreate,
    handleCreateDailyNote,
    handleCreateFolder,
    handleCycleWorkspaceTab,
    handleManualSaveCheckpoint,
    handleOpenWorkspaceTools,
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

  const handlePublishStaticSite = useCallback(
    (id: string) => {
      const note = notes.find(n => n._id === id)
      if (!note || note.type === 'attachment') return
      void downloadPublishedNotesSite(
        notes.filter(item => item.type === 'note' && !isNoteInTrash(item)),
        { entryId: note._id, title: `${note.title || 'Untitled'} Site` },
      )
    },
    [notes],
  )

  const handleExportReviewPackage = useCallback(
    (id: string) => {
      const note = notes.find(n => n._id === id)
      if (!note || note.type === 'attachment') return
      setReviewPackageRequest({ noteId: note._id, title: note.title || 'Untitled' })
    },
    [notes],
  )

  const handleSubmitReviewPackage = useCallback(
    async (permission: ReviewPackagePermission, recipient: string) => {
      const request = reviewPackageRequest
      if (!request) return
      const note = notes.find(n => n._id === request.noteId)
      if (!note || note.type === 'attachment') {
        setReviewPackageRequest(null)
        return
      }
      try {
        const [comments, suggestions] = await Promise.all([getNoteComments(note._id), getNoteSuggestions(note._id)])
        downloadReviewPackage(
          note,
          comments,
          suggestions,
          { notes },
          {
            permission,
            recipient: recipient.trim() || undefined,
          },
        )
        setReviewPackageRequest(null)
      } catch (err) {
        showNotice({
          title: 'Private share export failed',
          detail: err instanceof Error ? err.message : 'Could not export private share package',
          tone: 'danger',
        })
      }
    },
    [notes, reviewPackageRequest, showNotice],
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
      link.download = `clawctrl-vault-markdown-${new Date().toISOString().slice(0, 10)}.tar`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      return
    } catch (err) {
      console.warn('[notes] local Markdown archive export failed:', err)
      showNotice({
        title: 'Markdown archive export failed',
        detail: err instanceof Error ? err.message : 'Could not export Markdown vault archive',
        tone: 'danger',
      })
      return
    }
  }, [showNotice])

  const handleExportEncryptedVault = useCallback(() => {
    setEncryptedBackupRequest({ mode: 'export' })
  }, [])

  const handleSubmitEncryptedBackup = useCallback(async (password: string) => {
    const request = encryptedBackupRequest
    if (!request) return
    const backup = await exportEncryptedVault(password)
    const exportBlob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(exportBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `clawctrl-encrypted-vault-${new Date().toISOString().slice(0, 10)}.ccvault.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setEncryptedBackupRequest(null)
  }, [encryptedBackupRequest])

  const handleImportEncryptedVault = useCallback(
    (files: FileList | null) => {
      const file = files?.[0]
      if (!file) return
      setEncryptedBackupRequest({ mode: 'import', file, fileName: file.name })
    },
    [],
  )

  const handleSubmitEncryptedVaultImport = useCallback(
    async (password: string) => {
      const request = encryptedBackupRequest
      const file = request?.mode === 'import' ? request.file : undefined
      if (!file) return
      try {
        const backup = JSON.parse(await file.text())
        const verification = verifyEncryptedVaultBackup(backup)
        if (!verification.ok) {
          showNotice({
            title: 'Encrypted backup is invalid',
            detail: verification.errors.join('\n'),
            tone: 'danger',
          })
          return
        }
        await importEncryptedVault(password, backup)
        setEncryptedBackupRequest(null)
        await refresh()
      } catch (err) {
        showNotice({
          title: 'Encrypted vault import failed',
          detail: err instanceof Error ? err.message : 'Encrypted vault import failed',
          tone: 'danger',
        })
      }
    },
    [encryptedBackupRequest, refresh, showNotice],
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
          await readImportedNoteMarkdown(note, plan.attachments),
        )
      }
      for (const attachment of plan.attachments) {
        await uploadAttachment(attachment.file, attachment.folder, attachment.id)
      }
      await refresh()
      if (plan.skipped > 0) {
        showNotice({
          title: 'Import completed with skipped files',
          detail: `Imported ${plan.notes.length} notes and ${plan.attachments.length} attachments. Skipped ${plan.skipped} system or unsupported files.`,
          tone: 'warning',
        })
      }
    },
    [createFolder, createNote, refresh, showNotice],
  )

  const handleCreateClipboardClip = useCallback(async () => {
    try {
      const input = await readClipboardClipInput()
      if (!input.html?.trim() && !input.text?.trim()) {
        showNotice({
          title: 'Clipboard is empty',
          detail: 'Clipboard HTML and text are empty or unavailable.',
          tone: 'warning',
        })
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
      showNotice({
        title: 'Clipboard import failed',
        detail: err instanceof Error ? err.message : 'Could not import clipboard clip.',
        tone: 'danger',
      })
    }
  }, [createFolder, createNote, flushPendingSave, refresh, selectedId, showNotice])

  const handleOpenWorkspaceNote = useCallback((id: string) => {
    if (selectedId && selectedId !== id) void flushPendingSave(selectedId)
    setSelectedId(id)
    setViewMode('editor')
    setTopBarMenu(null)
  }, [flushPendingSave, selectedId])

  const handleOpenWorkspaceSidePane = useCallback((id: string) => {
    const note = noteById.get(id)
    if (!note || note.type !== 'note' || isNoteInTrash(note)) return
    setWorkspaceSidePaneId(id)
    setWorkspaceTabIds(prev => [id, ...prev.filter(tabId => tabId !== id)].slice(0, 8))
    setViewMode('editor')
    setTopBarMenu(null)
  }, [noteById, setWorkspaceSidePaneId, setWorkspaceTabIds])

  const handlePromoteWorkspaceSidePane = useCallback(() => {
    if (!workspaceSidePaneNote) return
    if (selectedId && selectedId !== workspaceSidePaneNote._id) void flushPendingSave(selectedId)
    if (workspaceSidePaneId) void flushPendingSave(workspaceSidePaneId)
    const previousPrimaryId = selected?.type === 'note' && !isNoteInTrash(selected) ? selected._id : null
    const nextPrimaryId = workspaceSidePaneNote._id
    setSelectedId(nextPrimaryId)
    setWorkspaceSidePaneId(previousPrimaryId)
    setWorkspaceTabIds(prev => [
      nextPrimaryId,
      ...(previousPrimaryId ? [previousPrimaryId] : []),
      ...prev.filter(tabId => tabId !== nextPrimaryId && tabId !== previousPrimaryId),
    ].slice(0, 8))
    setViewMode('editor')
    setTopBarMenu(null)
  }, [flushPendingSave, selected, selectedId, setWorkspaceSidePaneId, setWorkspaceTabIds, workspaceSidePaneId, workspaceSidePaneNote])

  const handleCloseWorkspaceSidePane = useCallback(() => {
    if (workspaceSidePaneId) void flushPendingSave(workspaceSidePaneId)
    setWorkspaceSidePaneId(null)
    setTopBarMenu(null)
  }, [flushPendingSave, setWorkspaceSidePaneId, workspaceSidePaneId])

  const handleAdjustWorkspaceSidePaneWidth = useCallback((action: 'narrow' | 'widen' | 'reset') => {
    const currentWidth = clampWorkspaceSidePaneWidth(Number(workspaceSidePaneWidth) || DEFAULT_WORKSPACE_SIDE_PANE_WIDTH)
    if (action === 'reset') {
      setWorkspaceSidePaneWidth(DEFAULT_WORKSPACE_SIDE_PANE_WIDTH)
      return
    }
    const delta = action === 'widen' ? WORKSPACE_SIDE_PANE_WIDTH_STEP : -WORKSPACE_SIDE_PANE_WIDTH_STEP
    setWorkspaceSidePaneWidth(clampWorkspaceSidePaneWidth(currentWidth + delta))
  }, [setWorkspaceSidePaneWidth, workspaceSidePaneWidth])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod || !event.altKey || event.key !== '\\') return

      if (event.shiftKey) {
        if (!workspaceSidePaneNote) return
        event.preventDefault()
        handlePromoteWorkspaceSidePane()
        return
      }

      if (selected?.type !== 'note') return
      event.preventDefault()
      handleOpenWorkspaceSidePane(selected._id)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleOpenWorkspaceSidePane, handlePromoteWorkspaceSidePane, selected, workspaceSidePaneNote])

  const handleCloseWorkspaceTab = useCallback((id: string) => {
    if (selectedId === id) {
      void flushPendingSave(id)
      const nextId = workspaceTabIds.filter(tabId => tabId !== id).find(tabId => noteById.has(tabId)) ?? null
      setSelectedId(nextId)
      if (nextId) setViewMode('editor')
    }
    if (workspaceSidePaneId === id) setWorkspaceSidePaneId(null)
    setWorkspaceTabIds(prev => prev.filter(tabId => tabId !== id))
    setTopBarMenu(null)
  }, [flushPendingSave, noteById, selectedId, setWorkspaceSidePaneId, setWorkspaceTabIds, workspaceSidePaneId, workspaceTabIds])

  const handleCloseOtherWorkspaceTabs = useCallback(() => {
    if (!selectedId || !noteById.has(selectedId)) return
    setWorkspaceTabIds([selectedId])
    if (workspaceSidePaneId && workspaceSidePaneId !== selectedId) setWorkspaceSidePaneId(null)
    setTopBarMenu(null)
  }, [noteById, selectedId, setWorkspaceSidePaneId, setWorkspaceTabIds, workspaceSidePaneId])

  const handleCloseAllWorkspaceTabs = useCallback(() => {
    if (selectedId) void flushPendingSave(selectedId)
    if (workspaceSidePaneId) void flushPendingSave(workspaceSidePaneId)
    setWorkspaceTabIds([])
    setWorkspaceSidePaneId(null)
    setSelectedId(null)
    setTopBarMenu(null)
  }, [flushPendingSave, selectedId, setWorkspaceSidePaneId, setWorkspaceTabIds, workspaceSidePaneId])

  const handleAdjustFileTreeWidth = useCallback((action: 'narrow' | 'widen' | 'reset') => {
    if (action === 'reset') {
      setTreeWidth(DEFAULT_FILE_TREE_WIDTH)
      return
    }
    const delta = action === 'widen' ? FILE_TREE_WIDTH_STEP : -FILE_TREE_WIDTH_STEP
    setTreeWidth(current => clampFileTreeWidth(current + delta))
  }, [])

  const currentWorkspaceSnapshot = useCallback((): NotesWorkspaceSnapshot => ({
    id: currentWorkspaceSnapshotId,
    name: currentWorkspaceSnapshotName,
    viewMode,
    focusMode,
    infoPanelOpen,
    treeWidth,
    sidePaneWidth: workspaceSidePanePixelWidth,
    ...(searchQuery.trim() ? { searchQuery: searchQuery.trim() } : {}),
    ...(workspaceExpandedFolders.length ? { expandedFolders: workspaceExpandedFolders } : {}),
    referencesOpen: !referencesPanelCollapsed,
    graphContext: readGraphWorkspaceContext(),
    ...(viewMode === 'data' ? { dataContext: normalizeVaultDataWorkspaceContext(dataWorkspaceContext) } : {}),
    selectedId,
    sidePaneId: workspaceSidePaneNote?._id ?? null,
    tabIds: workspaceTabIds.filter(id => noteById.has(id)).slice(0, 8),
    savedAt: Date.now(),
  }), [currentWorkspaceSnapshotId, currentWorkspaceSnapshotName, dataWorkspaceContext, focusMode, infoPanelOpen, noteById, referencesPanelCollapsed, searchQuery, selectedId, treeWidth, viewMode, workspaceExpandedFolders, workspaceSidePaneNote, workspaceSidePanePixelWidth, workspaceTabIds])

  const restoreWorkspaceSnapshot = useCallback((snapshot: NotesWorkspaceSnapshot | null) => {
    if (!snapshot) return
    if (selectedId && selectedId !== snapshot.selectedId) void flushPendingSave(selectedId)
    const nextTabIds = (snapshot.tabIds ?? [])
      .filter((id, index, ids) => ids.indexOf(id) === index && noteById.has(id))
      .slice(0, 8)
    if (nextTabIds.length > 0) setWorkspaceTabIds(nextTabIds)
    const sidePaneId = snapshot.sidePaneId && noteById.has(snapshot.sidePaneId) ? snapshot.sidePaneId : null
    const fallbackNoteId = nextTabIds[0] ?? notes.find(note => note.type === 'note' && !isNoteInTrash(note))?._id ?? null
    const selectedNoteId = snapshot.selectedId && noteById.has(snapshot.selectedId) ? snapshot.selectedId : fallbackNoteId
    setWorkspaceSidePaneId(sidePaneId)
    setViewMode(snapshot.viewMode)
    setFocusMode(snapshot.focusMode)
    setInfoPanelOpen(snapshot.infoPanelOpen)
    setSearchQuery(snapshot.searchQuery ?? '')
    setReferencesPanelCollapsed(snapshot.referencesOpen !== true)
    restoreGraphWorkspaceContext(snapshot.graphContext)
    if (snapshot.dataContext) setDataWorkspaceContext(normalizeVaultDataWorkspaceContext(snapshot.dataContext))
    setFileTreeExpandedFolders(new Set([
      '',
      ...(snapshot.expandedFolders ?? [])
        .map(path => typeof path === 'string' ? path.trim() : '')
        .filter(Boolean)
        .slice(0, 32),
    ]))
    setTreeWidth(clampFileTreeWidth(snapshot.treeWidth))
    if (snapshot.sidePaneWidth) setWorkspaceSidePaneWidth(clampWorkspaceSidePaneWidth(snapshot.sidePaneWidth))
    setSelectedId(selectedNoteId)
    setTopBarMenu(null)
  }, [flushPendingSave, noteById, notes, selectedId, setFocusMode, setInfoPanelOpen, setWorkspaceSidePaneId, setWorkspaceSidePaneWidth, setWorkspaceTabIds])

  const handleSaveWorkspaceSnapshot = useCallback(() => {
    const snapshot = currentWorkspaceSnapshot()
    setWorkspaceSnapshot(snapshot)
    setWorkspaceSnapshots(prev => {
      const next = normalizeNotesWorkspaceSnapshots([snapshot, ...prev.filter(item => item.id !== snapshot.id)])
      void syncWorkspaceSnapshots(next)
      return next
    })
    setTopBarMenu(null)
  }, [currentWorkspaceSnapshot, setWorkspaceSnapshot, setWorkspaceSnapshots, syncWorkspaceSnapshots])

  const handleRestoreWorkspaceSnapshot = useCallback(() => {
    restoreWorkspaceSnapshot(workspaceSnapshot)
  }, [restoreWorkspaceSnapshot, workspaceSnapshot])

  const handleRestoreNamedWorkspaceSnapshot = useCallback((snapshot: NotesWorkspaceSnapshot) => {
    restoreWorkspaceSnapshot(snapshot)
  }, [restoreWorkspaceSnapshot])

  const handleRenameWorkspaceSnapshot = useCallback((snapshot: NotesWorkspaceSnapshot) => {
    setWorkspaceRenameRequest({
      snapshotKey: workspaceSnapshotKey(snapshot),
      currentName: snapshot.name || `${viewModeLabel(snapshot.viewMode)} workspace`,
      viewMode: snapshot.viewMode,
    })
    setTopBarMenu(null)
  }, [])

  const handleConfirmRenameWorkspaceSnapshot = useCallback((key: string, name: string) => {
    const nextName = name.trim()
    if (!nextName) return
    const savedAt = Date.now()
    setWorkspaceSnapshots(prev => {
      const next = normalizeNotesWorkspaceSnapshots(
        prev.map(item => (workspaceSnapshotKey(item) === key ? { ...item, name: nextName, savedAt } : item)),
      )
      void syncWorkspaceSnapshots(next)
      return next
    })
    setWorkspaceSnapshot(prev => (prev && workspaceSnapshotKey(prev) === key ? { ...prev, name: nextName, savedAt } : prev))
    setWorkspaceRenameRequest(null)
  }, [setWorkspaceSnapshot, setWorkspaceSnapshots, syncWorkspaceSnapshots])

  const handleDeleteWorkspaceSnapshot = useCallback((snapshot: NotesWorkspaceSnapshot) => {
    const key = workspaceSnapshotKey(snapshot)
    setWorkspaceSnapshots(prev => {
      const next = normalizeNotesWorkspaceSnapshots(prev.filter(item => workspaceSnapshotKey(item) !== key))
      void syncWorkspaceSnapshots(next)
      return next
    })
    setWorkspaceSnapshot(prev => (prev && workspaceSnapshotKey(prev) === key ? null : prev))
    setTopBarMenu(null)
  }, [setWorkspaceSnapshot, setWorkspaceSnapshots, syncWorkspaceSnapshots])

  const handleCopyCurrentWikilink = useCallback(() => {
    if (!selected || selected.type === 'attachment') return
    void navigator.clipboard?.writeText(`[[${selected.title || selected._id.replace(/\.md$/, '')}]]`)
  }, [selected])

  const handleCopyCurrentEmbed = useCallback(() => {
    if (!selected || selected.type === 'attachment') return
    void navigator.clipboard?.writeText(noteEmbedMarkdown(selected))
  }, [selected])

  const handleCopyCurrentPath = useCallback(() => {
    if (!selected || selected.type === 'attachment') return
    void navigator.clipboard?.writeText(selected._id)
  }, [selected])

  const handleRevealCurrentInFileTree = useCallback(() => {
    if (!selected) return
    setSearchQuery('')
    setFocusMode(false)
  }, [selected, setFocusMode, setSearchQuery])

  const handleOpenReferences = useCallback(() => {
    if (!selected || selected.type !== 'note') return
    setViewMode('editor')
    setReferencesPanelCollapsed(false)
    setBacklinksOpenRequest(request => request + 1)
  }, [selected, setReferencesPanelCollapsed])

  const handleOpenLocalGraph = useCallback(() => {
    if (!selected || selected.type !== 'note') return
    try {
      localStorage.setItem('mc-notes-graph-local', JSON.stringify(true))
      localStorage.setItem('mc-notes-graph-settings-updated-at', JSON.stringify(Date.now()))
      window.dispatchEvent(new CustomEvent(LOCAL_STORAGE_STATE_EVENT, {
        detail: { key: 'mc-notes-graph-local' },
      }))
      window.dispatchEvent(new CustomEvent(LOCAL_STORAGE_STATE_EVENT, {
        detail: { key: 'mc-notes-graph-settings-updated-at' },
      }))
    } catch {
      // The graph still opens if storage is unavailable; the in-view Local toggle remains usable.
    }
    setViewMode('graph')
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
    const anchor = usableSelectionAnchor(selectionAnchor)
    setCommentComposeRequest({
      mode: 'comment',
      noteId: selected._id,
      noteTitle: selected.title || 'Untitled',
      anchor,
      quote: anchor.quote,
    })
  }, [selected, selectionAnchor])

  const handleSubmitCommentCompose = useCallback(async (body: string) => {
    const request = commentComposeRequest
    if (!request) return
    const trimmed = body.trim()
    if (!trimmed) return
    setCommentsLoading(true)
    setCommentsError(null)
    try {
      if (request.mode === 'reply') {
        if (!request.commentId) return
        await createNoteCommentReply(request.commentId, trimmed)
      } else {
        await createNoteComment(request.noteId, trimmed, request.anchor as unknown as Record<string, unknown>)
      }
      await loadComments(request.noteId)
      setCommentComposeRequest(null)
    } catch (err) {
      setCommentsError(err instanceof Error ? err.message : request.mode === 'reply' ? 'Could not add reply' : 'Could not add comment')
    } finally {
      setCommentsLoading(false)
    }
  }, [commentComposeRequest, loadComments])

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
    (id: string, defaultBody = '') => {
      if (!selected || selected.type === 'attachment') return
      const comment = noteComments.find(item => item.id === id)
      const quote = typeof comment?.anchor?.quote === 'string' ? comment.anchor.quote : undefined
      setCommentComposeRequest({
        mode: 'reply',
        noteId: selected._id,
        noteTitle: selected.title || 'Untitled',
        commentId: id,
        quote,
        defaultBody,
      })
    },
    [noteComments, selected],
  )

  const handleDraftReplyToComment = useCallback(
    (id: string) => {
      if (!selected || selected.type === 'attachment') return
      const comment = noteComments.find(item => item.id === id)
      if (!comment) return
      handleReplyToComment(id, buildCommentReplyDraft(comment, selected.title || selected._id))
    },
    [handleReplyToComment, noteComments, selected],
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
    await Promise.all([loadSuggestions(selected._id), loadComments(selected._id)])
  }, [loadComments, loadSuggestions, selected])

  const handleAddSuggestion = useCallback(async () => {
    if (!selected || selected.type === 'attachment') return
    const anchor = usableSuggestionAnchor(selectionAnchor)
    const selectedText = anchor.scope === 'selection' ? (anchor.quote ?? '') : ''
    const cursorInsert = anchor.scope === 'cursor'
    setSuggestionComposeRequest({
      noteId: selected._id,
      noteTitle: selected.title || 'Untitled',
      anchor,
      selectedText,
      cursorInsert,
      defaultContent: cursorInsert ? '' : selectedText || selected.content,
    })
  }, [selected, selectionAnchor])

  const handleCommentOnSuggestion = useCallback((id: string) => {
    if (!selected || selected.type === 'attachment') return
    const suggestion = noteSuggestions.find(item => item.id === id)
    if (!suggestion) return
    const anchor = normalizeSelectionAnchor(suggestion.anchor)
    const patchType = typeof suggestion.patch.type === 'string' ? suggestion.patch.type : 'suggestion'
    const content = typeof suggestion.patch.content === 'string' ? suggestion.patch.content : ''
    const quote =
      anchor?.quote
        ? `Suggestion on: ${anchor.quote}`
        : patchType === 'replace_document'
          ? 'Suggestion replaces this document'
          : patchType === 'insert_at_cursor'
            ? 'Suggestion inserts at cursor'
            : 'Suggestion'
    setCommentComposeRequest({
      mode: 'comment',
      noteId: selected._id,
      noteTitle: selected.title || 'Untitled',
      suggestionId: suggestion.id,
      anchor: {
        ...(anchor ?? { scope: 'document' as const }),
        quote,
        suggestion_id: suggestion.id,
        suggestion_patch_type: patchType,
        suggestion_preview: content.slice(0, 500),
      },
      quote,
      defaultBody: '',
    })
  }, [noteSuggestions, selected])

  const handleSubmitSuggestionCompose = useCallback(async (content: string, body: string) => {
    const request = suggestionComposeRequest
    if (!request) return
    if (!request.cursorInsert && content === request.defaultContent) return
    const patch =
      request.anchor.scope === 'selection'
        ? { type: 'replace_selection', content }
        : request.cursorInsert
          ? { type: 'insert_at_cursor', content }
          : { type: 'replace_document', content }
    setSuggestionsLoading(true)
    setSuggestionsError(null)
    try {
      await createNoteSuggestion(request.noteId, patch, body.trim(), request.anchor as unknown as Record<string, unknown>)
      await loadSuggestions(request.noteId)
      setSuggestionComposeRequest(null)
    } catch (err) {
      setSuggestionsError(err instanceof Error ? err.message : 'Could not add suggestion')
    } finally {
      setSuggestionsLoading(false)
    }
  }, [loadSuggestions, suggestionComposeRequest])

  const handleSuggestRemoteConflictVersion = useCallback(
    async (state: VaultSyncLedger['sync_states'][number]) => {
      const note = notesRef.current.find(item => item._id === state.local_id)
      if (!note || note.type !== 'note') return
      const remoteContent = remoteConflictContent(state.conflict)
      if (!remoteContent) return
      setSuggestionsLoading(true)
      setSuggestionsError(null)
      try {
        await createNoteSuggestion(
          note._id,
          { type: 'replace_document', content: remoteContent },
          `Remote sync conflict from ${state.provider}. Review before accepting.`,
          {
            scope: 'document',
            mode: 'markdown',
            conflict_state: state.conflict_state,
            provider: state.provider,
            remote_id: state.remote_id,
            remote_rev: state.remote_rev,
          },
        )
        await resolveVaultSyncConflict(state.provider, state.remote_id)
        await loadSuggestions(note._id)
        setVaultSyncLedger(current => current
          ? {
              ...current,
              sync_states: current.sync_states.map(item =>
                item.provider === state.provider && item.remote_id === state.remote_id
                  ? { ...item, conflict_state: 'clean', conflict: {} }
                  : item,
              ),
            }
          : current)
        setSelectedId(note._id)
        setViewMode('editor')
        setTitleDraft(note.title)
        setVaultStatusOpen(false)
        setSuggestionsOpen(true)
      } catch (err) {
        setVaultStatusError(err instanceof Error ? err.message : 'Could not create remote version suggestion')
      } finally {
        setSuggestionsLoading(false)
      }
    },
    [loadSuggestions],
  )

  const handleReviewSyncConflictMerge = useCallback((state: VaultSyncLedger['sync_states'][number]) => {
    const note = notesRef.current.find(item => item._id === state.local_id)
    if (!note || note.type !== 'note') return
    const remoteContent = remoteConflictContent(state.conflict)
    if (!remoteContent) return
    const baseContent = baseConflictContent(state.conflict)
    const autoMergedContent = mergedSyncConflictContent(state, note.content)
    setMergeConflictReviewRequest({
      state,
      noteId: note._id,
      noteTitle: note.title || note._id,
      localContent: note.content,
      remoteContent,
      baseContent,
      initialContent: autoMergedContent ?? conflictMarkedMergeContent(note.content, remoteContent, state.provider),
      autoMerged: !!autoMergedContent,
    })
  }, [])

  const handleSubmitSyncConflictMergeReview = useCallback(async (content: string) => {
    const request = mergeConflictReviewRequest
    if (!request) return
    const nextContent = content.trimEnd()
    if (!nextContent.trim()) {
      setVaultStatusError('Merge suggestion content cannot be empty')
      return
    }
    setSuggestionsLoading(true)
    setSuggestionsError(null)
    setVaultStatusError(null)
    try {
      await createNoteSuggestion(
        request.noteId,
        { type: 'replace_document', content: nextContent },
        `Reviewed sync merge from ${request.state.provider}. Review before accepting.`,
        {
          scope: 'document',
          mode: 'markdown',
          conflict_state: request.state.conflict_state,
          merge_strategy: request.autoMerged ? 'reviewed_non_overlapping_lines' : 'reviewed_manual_merge',
          provider: request.state.provider,
          remote_id: request.state.remote_id,
          remote_rev: request.state.remote_rev,
        },
      )
      await resolveVaultSyncConflict(request.state.provider, request.state.remote_id)
      await loadSuggestions(request.noteId)
      setVaultSyncLedger(current => current
        ? {
            ...current,
            sync_states: current.sync_states.map(item =>
              item.provider === request.state.provider && item.remote_id === request.state.remote_id
                ? { ...item, conflict_state: 'clean', conflict: {} }
                : item,
            ),
          }
        : current)
      setSelectedId(request.noteId)
      setViewMode('editor')
      setTitleDraft(request.noteTitle)
      setMergeConflictReviewRequest(null)
      setVaultStatusOpen(false)
      setSuggestionsOpen(true)
    } catch (err) {
      setVaultStatusError(err instanceof Error ? err.message : 'Could not create reviewed merge suggestion')
    } finally {
      setSuggestionsLoading(false)
    }
  }, [loadSuggestions, mergeConflictReviewRequest])

  const handleKeepLocalSyncConflictVersion = useCallback(async (state: VaultSyncLedger['sync_states'][number]) => {
    setVaultStatusError(null)
    try {
      await resolveVaultSyncConflict(state.provider, state.remote_id)
      const note = notesRef.current.find(item => item._id === state.local_id)
      if (note && note.type === 'note') {
        setSelectedId(note._id)
        setViewMode('editor')
        setTitleDraft(note.title)
      }
      setVaultSyncLedger(current => current
        ? {
            ...current,
            sync_states: current.sync_states.map(item =>
              item.provider === state.provider && item.remote_id === state.remote_id
                ? { ...item, conflict_state: 'clean', conflict: {} }
                : item,
            ),
          }
        : current)
    } catch (err) {
      setVaultStatusError(err instanceof Error ? err.message : 'Could not keep local version')
    }
  }, [])

  const handleOpenWritingAssist = useCallback(() => {
    if (!selected || selected.type !== 'note') return
    const current = pendingContentRef.current.get(selected._id) ?? selected.content
    const draft = buildWritingAssistDraft(selected, selectionAnchor, current)
    setWritingAssistRequest({
      noteId: selected._id,
      noteTitle: selected.title || 'Untitled',
      draft,
    })
    setViewMode('editor')
  }, [selected, selectionAnchor])

  const handleCreateWritingAssistSuggestion = useCallback(async (option: WritingAssistOption) => {
    const request = writingAssistRequest
    if (!request) return
    const patch = writingAssistPatchForDraft(request.draft, option)
    setSuggestionsLoading(true)
    setSuggestionsError(null)
    try {
      await createNoteSuggestion(
        request.noteId,
        patch,
        `Assistive writing: ${option.label}. ${option.note}`,
        request.draft.anchor as unknown as Record<string, unknown>,
      )
      await loadSuggestions(request.noteId)
      setWritingAssistRequest(null)
      setSuggestionsOpen(true)
    } catch (err) {
      setSuggestionsError(err instanceof Error ? err.message : 'Could not create writing suggestion')
    } finally {
      setSuggestionsLoading(false)
    }
  }, [loadSuggestions, writingAssistRequest])

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

  const handleApplyAllSuggestions = useCallback(async () => {
    if (!selected || selected.type === 'attachment') return
    const openSuggestions = noteSuggestions.filter(suggestion => suggestion.status === 'open')
    if (openSuggestions.length === 0) return

    let nextContent = pendingContentRef.current.get(selected._id) ?? selected.content
    for (const suggestion of openSuggestions) {
      const result = applySuggestionPatch(
        nextContent,
        suggestion.patch,
        suggestion.anchor as NoteSelectionAnchor | undefined,
      )
      if (result.error === 'missing_content') {
        setSuggestionsError(`Suggestion ${suggestion.id} has no replacement content`)
        return
      }
      if (result.error === 'unsupported') {
        setSuggestionsError(`Suggestion ${suggestion.id} cannot be applied yet`)
        return
      }
      if (result.error === 'anchor_mismatch' || result.content === null) {
        setSuggestionsError(`Suggestion ${suggestion.id} no longer matches this note`)
        return
      }
      nextContent = result.content
    }

    setSuggestionsLoading(true)
    setSuggestionsError(null)
    try {
      await flushPendingSave(selected._id)
      await updateNote({ ...selected, content: nextContent })
      for (const suggestion of openSuggestions) {
        await applyNoteSuggestion(suggestion.id)
      }
      await refresh()
      await loadSuggestions(selected._id)
      setActiveReviewId(current => (openSuggestions.some(suggestion => suggestion.id === current) ? null : current))
      setSaveState('saved')
      setLastSavedAt(Date.now())
    } catch (err) {
      setSuggestionsError(err instanceof Error ? err.message : 'Could not apply all suggestions')
    } finally {
      setSuggestionsLoading(false)
    }
  }, [flushPendingSave, loadSuggestions, noteSuggestions, refresh, selected, updateNote])

  const handleRejectAllSuggestions = useCallback(async () => {
    if (!selected || selected.type === 'attachment') return
    const openSuggestions = noteSuggestions.filter(suggestion => suggestion.status === 'open')
    if (openSuggestions.length === 0) return
    setSuggestionsLoading(true)
    setSuggestionsError(null)
    try {
      for (const suggestion of openSuggestions) {
        await rejectNoteSuggestion(suggestion.id)
      }
      await loadSuggestions(selected._id)
      setActiveReviewId(current => (openSuggestions.some(suggestion => suggestion.id === current) ? null : current))
    } catch (err) {
      setSuggestionsError(err instanceof Error ? err.message : 'Could not reject all suggestions')
    } finally {
      setSuggestionsLoading(false)
    }
  }, [loadSuggestions, noteSuggestions, selected])

  const handleRestoreRevision = useCallback(
    (rev: string) => {
      if (!selected || selected.type === 'attachment') return
      const label = historyRevisions.find(revision => revision.rev === rev)?.label
      requestConfirmAction({
        title: 'Restore version',
        detail: restoreRevisionConfirmMessage(rev, label),
        confirmLabel: 'Restore version',
        tone: 'danger',
        onConfirm: async () => {
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
      })
    },
    [getNoteRevisions, historyRevisions, refresh, requestConfirmAction, restoreNoteRevision, selected],
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
    setVersionNameRequest({ mode: 'create' })
  }, [selected])

  const handleRenameRevision = useCallback(
    (rev: string, currentLabel?: string | null) => {
      if (!selected || selected.type === 'attachment') return
      setVersionNameRequest({ mode: 'rename', rev, currentLabel })
    },
    [selected],
  )

  const handleSubmitVersionName = useCallback(async (label: string) => {
    const request = versionNameRequest
    if (!selected || selected.type === 'attachment' || !request) return
    const nextLabel = label.trim()
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      if (request.mode === 'create') {
        await flushPendingSave(selected._id)
        const rev = await createNoteVersionCheckpoint(selected._id, nextLabel)
        const revisions = await getNoteRevisions(selected._id)
        setHistoryRevisions(revisions)
        setHistoryPreview(await getNoteRevision(selected._id, rev))
      } else if (request.rev) {
        const rev = request.rev
        await labelNoteRevision(selected._id, rev, nextLabel)
        const revisions = await getNoteRevisions(selected._id)
        setHistoryRevisions(revisions)
        setHistoryPreview(prev => (prev?.rev === rev ? { ...prev, label: nextLabel || null } : prev))
      }
      setVersionNameRequest(null)
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : request.mode === 'create' ? 'Could not create version' : 'Could not rename version')
    } finally {
      setHistoryLoading(false)
    }
  }, [flushPendingSave, selected, versionNameRequest])

  const queueNoteContentChange = useCallback(
    (note: VaultNote, content: string, options: { broadcast?: boolean } = {}) => {
      if (note.type === 'attachment') return
      const noteId = note._id
      const baseContent = pendingContentRef.current.get(noteId) ?? note.content
      pendingContentRef.current.set(noteId, content)
      saveLocalDraft(noteId, content)
      if (options.broadcast !== false) broadcastLocalOperation(content, baseContent)
      setSaveState('unsaved')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (!networkOnline) {
        saveTimerRef.current = null
        return
      }
      saveTimerRef.current = setTimeout(async () => {
        await flushPendingSave(noteId)
      }, SAVE_DEBOUNCE_MS)
    },
    [broadcastLocalOperation, flushPendingSave, networkOnline],
  )

  const handleContentChange = useCallback(
    (content: string, options: { broadcast?: boolean } = {}) => {
      if (!selected || selected.type === 'attachment') return
      queueNoteContentChange(selected, content, options)
    },
    [queueNoteContentChange, selected],
  )

  const handleCopyRevisionToCurrent = useCallback(
    async (rev: string) => {
      if (!selected || selected.type === 'attachment') return
      setHistoryLoading(true)
      setHistoryError(null)
      try {
        const detail = historyPreview?.rev === rev
          ? historyPreview
          : await getNoteRevision(selected._id, rev)
        const label = historyRevisions.find(revision => revision.rev === rev)?.label || detail.label || rev
        await flushPendingSave(selected._id)
        await createNoteVersionCheckpoint(selected._id, `Before copying from ${label}`)
        const updated = await updateNote({ ...selected, content: detail.content })
        setSelectedId(updated._id)
        await refresh()
        setHistoryOpen(false)
        setHistoryPreview(null)
        setViewMode('editor')
        setSaveState('saved')
        setLastSavedAt(Date.now())
      } catch (err) {
        setHistoryError(err instanceof Error ? err.message : 'Could not copy version into current note')
      } finally {
        setHistoryLoading(false)
      }
    },
    [flushPendingSave, historyPreview, historyRevisions, refresh, selected, updateNote],
  )

  const handleSidePaneContentChange = useCallback(
    (content: string) => {
      if (!workspaceSidePaneNote) return
      queueNoteContentChange(workspaceSidePaneNote, content, { broadcast: false })
    },
    [queueNoteContentChange, workspaceSidePaneNote],
  )

  const handleInsertTemplateIntoCurrent = useCallback(
    async (templateId: string) => {
      if (!selected || selected.type === 'attachment') return
      const template = allTemplates.find(item => item.id === templateId)
      if (!template) return
      const promptValues = await collectTemplatePromptValues(template)
      if (!promptValues) return
      const current = pendingContentRef.current.get(selected._id) ?? selected.content
      const insertion = applyTemplate(template, {
        title: selected.title,
        folder: selected.folder,
        promptValues,
      })
      handleContentChange(appendTemplateToContent(current, insertion))
      setViewMode('editor')
    },
    [allTemplates, collectTemplatePromptValues, handleContentChange, selected],
  )

  const handleInsertNoteEmbedIntoCurrent = useCallback(
    (target: VaultNote) => {
      if (!selected || selected.type !== 'note' || target.type !== 'note') return
      const current = pendingContentRef.current.get(selected._id) ?? selected.content
      handleContentChange(insertMarkdownBlockAtAnchor(current, noteEmbedMarkdown(target), selectionAnchorRef.current))
      setViewMode('editor')
    },
    [handleContentChange, selected],
  )

  const handleInsertBlockIdIntoCurrent = useCallback(
    () => {
      if (!selected || selected.type !== 'note') return
      const current = pendingContentRef.current.get(selected._id) ?? selected.content
      const anchor = markdownAnchorOrHeadingFallback(current, selectionAnchorRef.current, selected)
      handleContentChange(insertBlockIdAtAnchor(current, createBlockId(selected), anchor))
      setViewMode('editor')
    },
    [handleContentChange, selected],
  )

  const handleCopyBlockReference = useCallback(
    () => {
      if (!selected || selected.type !== 'note') return
      const current = pendingContentRef.current.get(selected._id) ?? selected.content
      const anchor = markdownAnchorOrHeadingFallback(current, selectionAnchorRef.current, selected)
      const blockId = blockIdAtAnchorLine(current, anchor) ?? createBlockId(selected)
      const nextContent = insertBlockIdAtAnchor(current, blockId, anchor)
      if (nextContent !== current) handleContentChange(nextContent)
      void navigator.clipboard?.writeText(blockReferenceMarkdown(selected, blockId))
      setViewMode('editor')
    },
    [handleContentChange, selected],
  )

  const handleCopyHeadingReference = useCallback(
    () => {
      if (!selected || selected.type !== 'note') return
      const current = pendingContentRef.current.get(selected._id) ?? selected.content
      const heading = headingForReference(current, selectionAnchorRef.current, selected)
      if (!heading) {
        handleCopyCurrentWikilink()
        return
      }
      void navigator.clipboard?.writeText(headingReferenceMarkdown(selected, heading))
      setViewMode('editor')
    },
    [handleCopyCurrentWikilink, selected],
  )

  const handleOpenActiveOutline = useCallback(() => {
    if (!selected || selected.type !== 'note') return
    setActiveOutlineOpen(true)
    setViewMode('editor')
  }, [selected])

  const handleJumpToOutlineHeading = useCallback(
    (heading: MarkdownOutlineHeading) => {
      if (!selected || selected.type !== 'note') return
      setViewMode('editor')
      setActiveOutlineOpen(false)
      setEditorJumpRequest(previous => ({
        noteId: selected._id,
        lineNumber: heading.lineNumber,
        requestId: (previous?.requestId ?? 0) + 1,
      }))
    },
    [selected],
  )

  const handleSelectionAnchorChange = useCallback(
    (anchor: NoteSelectionAnchor) => {
      selectionAnchorRef.current = anchor
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

  const handleImportPluginMarketplaceFeed = useCallback(() => {
    setPluginMarketplaceFeedRequest({ defaultUrl: '' })
  }, [])

  const handleSubmitPluginMarketplaceFeed = useCallback(async (rawUrl: string) => {
    const url = rawUrl.trim()
    if (!url) return
    try {
      const packages = await fetchVaultPluginMarketplaceFeed(url, fetch, buildVaultPluginTrustedPublishers(notes))
      if (packages.length === 0) {
        showNotice({
          title: 'No plugin packages found',
          detail: 'No installable plugin packages were found in that marketplace feed.',
          tone: 'warning',
        })
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
      setPluginMarketplaceFeedRequest(null)
    } catch (err) {
      showNotice({
        title: 'Plugin marketplace import failed',
        detail: err instanceof Error ? err.message : 'Could not import plugin marketplace feed',
        tone: 'danger',
      })
    }
  }, [createFolder, createNote, folders, notes, showNotice])

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
      showNotice({
        title: 'No plugin writes',
        detail: 'There are no pending plugin write requests in this vault.',
      })
      return
    }

    const plan = planVaultPluginWriteApply(notesRef.current, records)
    if (plan.applied.length === 0) {
      showNotice({
        title: 'No plugin writes applied',
        detail: `No plugin writes can be applied. ${plan.skipped.length} request${plan.skipped.length === 1 ? '' : 's'} skipped because of conflicts or unsafe paths.`,
        tone: 'warning',
      })
      return
    }

    const skipped = plan.skipped.length
      ? ` ${plan.skipped.length} request${plan.skipped.length === 1 ? '' : 's'} will be skipped because of conflicts or unsafe paths.`
      : ''
    requestConfirmAction({
      title: 'Apply plugin writes',
      detail: `Apply ${plan.applied.length} plugin write request${plan.applied.length === 1 ? '' : 's'}. Safety checkpoints will be created for ${plan.checkpointNoteIds.length} existing note${plan.checkpointNoteIds.length === 1 ? '' : 's'}.${skipped}`,
      confirmLabel: 'Apply plugin writes',
      tone: 'danger',
      onConfirm: async () => {
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
          updatePinnedNoteIds(prev => prev.map(id => renamed.get(id) ?? id))
          setRecentNoteIds(prev => prev.map(id => renamed.get(id) ?? id))
          if (selectedId && renamed.has(selectedId)) setSelectedId(renamed.get(selectedId) ?? selectedId)
        }

        await refresh()
        if (plan.skipped.length > 0) {
          showNotice({
            title: 'Plugin writes applied',
            detail: `Applied ${plan.applied.length} plugin writes. Skipped ${plan.skipped.length} conflicted request${plan.skipped.length === 1 ? '' : 's'}.`,
            tone: 'warning',
          })
        }
      },
    })
  }, [
    createSafetyCheckpoints,
    deleteNote,
    ensurePluginWriteFolder,
    flushPendingSave,
    folders,
    refresh,
    requestConfirmAction,
    selectedId,
    setRecentNoteIds,
    showNotice,
    updatePinnedNoteIds,
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
    async (sourceNoteId: string, mentionText?: string) => {
      if (!selected) return
      const source = notes.find(note => note._id === sourceNoteId)
      if (!source || source.type !== 'note') return
      const linked = linkFirstPlainMention(source.content, mentionText || selected.title, selected.title)
      if (linked === source.content) return
      await updateNote({ ...source, content: linked })
    },
    [notes, selected, updateNote],
  )

  const handleLinkAllUnlinkedMentions = useCallback(
    async (references: BacklinkReference[]) => {
      if (!selected || selected.type !== 'note') return
      for (const reference of references) {
        const source = notes.find(note => note._id === reference.note._id)
        if (!source || source.type !== 'note') continue
        const linked = linkFirstPlainMention(source.content, reference.matchedText || selected.title, selected.title)
        if (linked === source.content) continue
        const updated = await updateNote({ ...source, content: linked })
        notesRef.current = notesRef.current.map(note => (note._id === updated._id ? updated : note))
      }
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
    async (key: string, value: string, mode: DocumentPropertyRequest['mode'] = 'set', sourceKey?: string) => {
      if (!selected || selected.type === 'attachment') return
      const currentContent = pendingContentRef.current.get(selected._id) ?? selected.content
      const nextContent = mode === 'rename'
        ? renameDocumentProperty(currentContent, sourceKey || key, key)
        : mode === 'remove'
          ? removeDocumentProperty(currentContent, key)
          : upsertDocumentProperty(currentContent, key, value)
      if (nextContent === currentContent) return
      const checkpointLabel = mode === 'rename'
        ? 'Before document property rename'
        : mode === 'remove'
          ? 'Before document property removal'
          : 'Before document property update'
      const failureLabel = mode === 'rename'
        ? 'document property rename'
        : mode === 'remove'
          ? 'document property removal'
          : 'document property update'
      await saveSelectedContentNow(
        nextContent,
        checkpointLabel,
        failureLabel,
      )
    },
    [saveSelectedContentNow, selected],
  )

  const handleApplyTagToCurrentNote = useCallback(
    async (tag: string) => {
      if (!selected || selected.type !== 'note') return
      const nextContent = applyTagToContent(selected.content, tag)
      setTagsIndexOpen(false)
      if (nextContent === selected.content) return
      await saveSelectedContentNow(nextContent, 'Before tag apply', 'tag apply')
      await refresh()
    },
    [refresh, saveSelectedContentNow, selected],
  )

  const handleSetDocumentProperty = useCallback(() => {
    if (!selected || selected.type === 'attachment') return
    setDocumentPropertyRequest({ mode: 'set', properties: selected.properties ?? {} })
  }, [selected])

  const handleRemoveDocumentProperty = useCallback(() => {
    if (!selected || selected.type === 'attachment') return
    setDocumentPropertyRequest({ mode: 'remove', properties: selected.properties ?? {} })
  }, [selected])

  const handleRenameDocumentProperty = useCallback((sourceKey?: string) => {
    if (!selected || selected.type === 'attachment') return
    setDocumentPropertyRequest({ mode: 'rename', properties: selected.properties ?? {}, sourceKey })
  }, [selected])

  const handleOpenIndexedDocumentProperty = useCallback((
    noteId: string,
    key: string,
    mode: DocumentPropertyRequest['mode'],
  ) => {
    const target = notesRef.current.find(note => note._id === noteId)
    if (!target || target.type === 'attachment') return
    setPropertiesIndexOpen(false)
    if (selectedId && selectedId !== noteId) void flushPendingSave(selectedId)
    setSelectedId(noteId)
    setViewMode('editor')
    const rawValue = target.properties?.[key]
    setDocumentPropertyRequest({
      mode,
      properties: target.properties ?? {},
      sourceKey: mode === 'rename' ? key : undefined,
      defaultKey: key,
      defaultValue: rawValue === undefined ? '' : formatDocumentPropertyInputValue(inferDocumentPropertyValueKind(rawValue), Array.isArray(rawValue) ? rawValue.join(', ') : rawValue),
      defaultKind: rawValue === undefined ? 'text' : inferDocumentPropertyValueKind(rawValue),
    })
  }, [flushPendingSave, selectedId])

  const handleSubmitDocumentProperty = useCallback(async (key: string, value: string, sourceKey?: string) => {
    const request = documentPropertyRequest
    if (!request) return
    await saveDocumentProperty(key, value, request.mode, sourceKey || request.sourceKey)
    setDocumentPropertyRequest(null)
  }, [documentPropertyRequest, saveDocumentProperty])

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
        detail: selectedFolderTemplate
          ? `Create in ${selected?.folder || 'vault root'} with ${selectedFolderTemplate.label}`
          : selected?.folder ? `Create in ${selected.folder}` : 'Create in vault root',
        icon: NotePencil,
        keywords: ['create note', 'quick note', 'new file'],
        category: 'Create',
        rank: 20,
        onRun: () => {
          void handleCreate(selected?.folder)
        },
      },
      {
        id: 'new-daily-note',
        label: 'Open today daily note',
        detail: selected?.folder ? `Open or create in ${selected.folder}` : 'Open or create in vault root',
        icon: NotePencil,
        keywords: ['today', 'journal', 'daily'],
        category: 'Create',
        rank: 18,
        onRun: () => {
          void handleCreateDailyNote(selected?.folder)
        },
      },
      {
        id: 'open-yesterday-daily-note',
        label: 'Open yesterday daily note',
        detail: buildDailyNoteTitle(normalizedEditorPreferences, dailyNoteDateWithOffset(new Date(), -1)),
        icon: NotePencil,
        keywords: ['yesterday', 'journal', 'daily', 'previous day'],
        category: 'Create',
        rank: 11,
        onRun: () => {
          void handleCreateDailyNote(selected?.folder, dailyNoteDateWithOffset(new Date(), -1))
        },
      },
      {
        id: 'open-tomorrow-daily-note',
        label: 'Open tomorrow daily note',
        detail: buildDailyNoteTitle(normalizedEditorPreferences, dailyNoteDateWithOffset(new Date(), 1)),
        icon: NotePencil,
        keywords: ['tomorrow', 'journal', 'daily', 'next day'],
        category: 'Create',
        rank: 10,
        onRun: () => {
          void handleCreateDailyNote(selected?.folder, dailyNoteDateWithOffset(new Date(), 1))
        },
      },
      {
        id: 'open-daily-note-by-date',
        label: 'Open daily note by date',
        detail: buildDailyNoteTitle(normalizedEditorPreferences, new Date()),
        icon: NotePencil,
        keywords: ['calendar', 'date', 'journal', 'daily'],
        category: 'Create',
        rank: 9,
        onRun: () => setDailyDatePickerOpen(true),
      },
      {
        id: 'open-weekly-note',
        label: 'Open this week note',
        detail: buildPeriodicNoteTitle('weekly', normalizedEditorPreferences, new Date()),
        icon: NotePencil,
        keywords: ['weekly', 'week', 'periodic', 'journal', 'review'],
        category: 'Create',
        rank: 10,
        onRun: () => {
          void handleCreatePeriodicNote('weekly', selected?.folder)
        },
      },
      {
        id: 'open-monthly-note',
        label: 'Open this month note',
        detail: buildPeriodicNoteTitle('monthly', normalizedEditorPreferences, new Date()),
        icon: NotePencil,
        keywords: ['monthly', 'month', 'periodic', 'journal', 'review'],
        category: 'Create',
        rank: 10,
        onRun: () => {
          void handleCreatePeriodicNote('monthly', selected?.folder)
        },
      },
      ...vaultTemplates.slice(0, 20).map<CommandAction>(template => ({
        id: `vault-template:${template.id}`,
        label: `New from ${template.label}`,
        detail: template.noteId || 'Vault template',
        icon: FileText,
        category: 'Create',
        onRun: () => {
          void handleCreateTemplate(selected?.folder, template.id)
        },
      })),
      ...(selected?.type === 'note'
        ? allTemplates
            .filter(template => template.id !== 'blank' && template.content.trim())
            .slice(0, 24)
            .map<CommandAction>(template => ({
              id: `insert-template:${template.id}`,
              label: `Insert template: ${template.label}`,
              detail: template.source === 'vault' ? template.noteId || 'Vault template' : 'Built-in template',
              icon: FileText,
              keywords: ['template insert', 'append template', template.label],
              category: 'Insert',
              onRun: () => {
                void handleInsertTemplateIntoCurrent(template.id)
              },
            }))
        : []),
      {
        id: 'new-folder',
        label: 'New folder',
        detail: selected?.folder ? `Create in ${selected.folder}` : 'Create in vault root',
        icon: FolderPlus,
        keywords: ['create folder', 'directory'],
        category: 'Create',
        rank: 16,
        onRun: () => {
          void handleCreateFolder(selected?.folder)
        },
      },
      ...folders
        .filter(folder => folder.path && !isNotesTrashPath(folder.path))
        .slice(0, 24)
        .map<CommandAction>(folder => ({
          id: `rename-folder:${folder.path}`,
          label: `Rename folder: ${folder.path}`,
          detail: 'Rename folder and update moved note paths',
          icon: FolderPlus,
          keywords: ['rename folder', 'move folder', folder.name, folder.path],
          category: 'Folders',
          onRun: () => handleRenameFolder(folder.path),
        })),
      {
        id: 'graph-view',
        label: 'Open graph view',
        detail: 'Knowledge graph',
        icon: GitBranch,
        keywords: ['graph', 'local graph', 'connections', 'map'],
        category: 'Views',
        rank: 14,
        onRun: () => setViewMode('graph'),
      },
      {
        id: 'data-view',
        label: 'Open data view',
        detail: 'Local vault metadata table',
        icon: Table,
        keywords: ['properties', 'metadata', 'table', 'bases'],
        category: 'Views',
        rank: 12,
        onRun: () => setViewMode('data'),
      },
      {
        id: 'canvas-view',
        label: 'Open canvas view',
        detail: 'Local visual board stored as a vault note',
        icon: SquaresFour,
        keywords: ['canvas', 'board', 'visual map'],
        category: 'Views',
        rank: 12,
        onRun: () => {
          void handleOpenCanvasView()
        },
      },
      {
        id: 'toggle-focus-mode',
        label: focusMode ? 'Exit focus mode' : 'Enter focus mode',
        detail: 'Hide or show the notes sidebar',
        icon: PenNib,
        keywords: ['zen', 'focus', 'hide sidebar'],
        category: 'Workspace',
        rank: 10,
        onRun: () => setFocusMode(prev => !prev),
      },
      {
        id: 'open-workspace-tools',
        label: 'Open workspace tools',
        detail: 'Manage sidebars, layout presets, pinned notes, and recent notes',
        icon: ListBullets,
        keywords: ['workspace', 'layout', 'workspaces', 'sidebars', 'pinned', 'recent'],
        category: 'Workspace',
        rank: 13,
        onRun: handleOpenWorkspaceTools,
      },
      {
        id: 'close-workspace-sidebars',
        label: 'Close workspace sidebars',
        detail: 'Hide the file tree and document info sidebars',
        icon: PenNib,
        keywords: ['workspace', 'sidebars', 'hide sidebars', 'focus'],
        category: 'Workspace',
        rank: 10,
        onRun: () => {
          setFocusMode(true)
          setInfoPanelOpen(false)
        },
      },
      {
        id: 'save-workspace-preset',
        label: 'Save current workspace',
        detail: currentWorkspaceSnapshotName,
        icon: ShieldCheck,
        keywords: ['workspace', 'layout', 'save workspace', 'preset'],
        category: 'Workspace',
        rank: 11,
        onRun: handleSaveWorkspaceSnapshot,
      },
      ...(workspaceSnapshot
        ? [{
            id: 'restore-last-workspace-preset',
            label: 'Restore saved workspace',
            detail: workspaceSnapshot.name || `${viewModeLabel(workspaceSnapshot.viewMode)} workspace`,
            icon: UploadSimple,
            keywords: ['workspace', 'layout', 'restore workspace', 'preset'],
            category: 'Workspace',
            rank: 9,
            onRun: handleRestoreWorkspaceSnapshot,
          } satisfies CommandAction]
        : []),
      ...normalizedWorkspaceSnapshots.map<CommandAction>(snapshot => {
        const snapshotName = snapshot.name || `${viewModeLabel(snapshot.viewMode)} workspace`
        return {
          id: `restore-workspace:${workspaceSnapshotKey(snapshot)}`,
          label: `Restore workspace: ${snapshotName}`,
          detail: `${viewModeLabel(snapshot.viewMode)} view, saved ${new Date(snapshot.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
          icon: UploadSimple,
          keywords: ['workspace', 'layout', 'restore workspace', 'preset', snapshotName],
          category: 'Workspace',
          rank: 7,
          onRun: () => handleRestoreNamedWorkspaceSnapshot(snapshot),
        }
      }),
      ...normalizedWorkspaceSnapshots.map<CommandAction>(snapshot => {
        const snapshotName = snapshot.name || `${viewModeLabel(snapshot.viewMode)} workspace`
        return {
          id: `rename-workspace:${workspaceSnapshotKey(snapshot)}`,
          label: `Rename workspace: ${snapshotName}`,
          detail: 'Rename this local layout preset',
          icon: NotePencil,
          keywords: ['workspace', 'layout', 'rename workspace', 'preset', snapshotName],
          category: 'Workspace',
          rank: 6,
          onRun: () => handleRenameWorkspaceSnapshot(snapshot),
        }
      }),
      ...(workspaceSidePaneNote
        ? [{
            id: 'swap-workspace-side-pane',
            label: 'Swap primary and side pane',
            detail: workspaceSidePaneNote.title || workspaceSidePaneNote._id,
            icon: SquaresFour,
            keywords: ['workspace', 'pane', 'split pane', 'swap panes', 'make side pane primary'],
            category: 'Workspace',
            rank: 8,
            onRun: handlePromoteWorkspaceSidePane,
          } satisfies CommandAction, {
            id: 'close-workspace-side-pane',
            label: 'Close workspace side pane',
            detail: workspaceSidePaneNote.title || workspaceSidePaneNote._id,
            icon: X,
            keywords: ['workspace', 'pane', 'split pane', 'close side pane'],
            category: 'Workspace',
            rank: 7,
            onRun: handleCloseWorkspaceSidePane,
          } satisfies CommandAction, {
            id: 'narrow-workspace-side-pane',
            label: 'Narrow side pane',
            detail: `${workspaceSidePanePixelWidth}px wide`,
            icon: SquaresFour,
            keywords: ['workspace', 'pane', 'split pane', 'narrow side pane', 'resize side pane'],
            category: 'Workspace',
            rank: 6,
            onRun: () => handleAdjustWorkspaceSidePaneWidth('narrow'),
          } satisfies CommandAction, {
            id: 'widen-workspace-side-pane',
            label: 'Widen side pane',
            detail: `${workspaceSidePanePixelWidth}px wide`,
            icon: SquaresFour,
            keywords: ['workspace', 'pane', 'split pane', 'widen side pane', 'resize side pane'],
            category: 'Workspace',
            rank: 6,
            onRun: () => handleAdjustWorkspaceSidePaneWidth('widen'),
          } satisfies CommandAction, {
            id: 'reset-workspace-side-pane-width',
            label: 'Reset side pane width',
            detail: `${DEFAULT_WORKSPACE_SIDE_PANE_WIDTH}px default`,
            icon: SquaresFour,
            keywords: ['workspace', 'pane', 'split pane', 'reset side pane width', 'resize side pane'],
            category: 'Workspace',
            rank: 5,
            onRun: () => handleAdjustWorkspaceSidePaneWidth('reset'),
          } satisfies CommandAction]
        : []),
      ...workspaceTabNotes.map<CommandAction>(note => ({
        id: `switch-workspace-tab:${note._id}`,
        label: `Switch tab: ${note.title || 'Untitled'}`,
        detail: note.folder || 'Vault root',
        icon: FileText,
        keywords: ['workspace', 'tab', 'tabs', note._id, note.title],
        category: 'Workspace',
        rank: selectedId === note._id ? 6 : 5,
        onRun: () => handleOpenWorkspaceNote(note._id),
      })),
      ...workspaceTabNotes
        .map<CommandAction>(note => ({
          id: `open-workspace-side-pane:${note._id}`,
          label: `Open in side pane: ${note.title || 'Untitled'}`,
          detail: note.folder || 'Vault root',
          icon: SquaresFour,
          keywords: ['workspace', 'pane', 'split pane', 'side pane', note._id, note.title],
          category: 'Workspace',
          rank: workspaceSidePaneNote?._id === note._id ? 5 : 4,
          onRun: () => handleOpenWorkspaceSidePane(note._id),
        })),
      ...(workspaceTabNotes.length > 1
        ? [
            {
              id: 'next-workspace-tab',
              label: 'Next workspace tab',
              detail: 'Cycle forward through open note tabs',
              icon: FileText,
              keywords: ['workspace', 'tab', 'next tab', 'cycle tab'],
              category: 'Workspace',
              rank: 8,
              onRun: () => handleCycleWorkspaceTab('next'),
            },
            {
              id: 'previous-workspace-tab',
              label: 'Previous workspace tab',
              detail: 'Cycle backward through open note tabs',
              icon: FileText,
              keywords: ['workspace', 'tab', 'previous tab', 'cycle tab'],
              category: 'Workspace',
              rank: 8,
              onRun: () => handleCycleWorkspaceTab('previous'),
            },
            ...(selectedId && workspaceTabNotes.some(note => note._id === selectedId)
              ? [
                  {
                    id: 'move-current-workspace-tab-earlier',
                    label: 'Move current tab earlier',
                    detail: 'Reorder the active workspace tab toward the top',
                    icon: DotsThree,
                    keywords: ['workspace', 'tab', 'reorder tab', 'move tab earlier', 'move tab left'],
                    category: 'Workspace',
                    rank: 7,
                    onRun: () => handleMoveWorkspaceTab(selectedId, 'earlier'),
                  },
                  {
                    id: 'move-current-workspace-tab-later',
                    label: 'Move current tab later',
                    detail: 'Reorder the active workspace tab toward the bottom',
                    icon: DotsThree,
                    keywords: ['workspace', 'tab', 'reorder tab', 'move tab later', 'move tab right'],
                    category: 'Workspace',
                    rank: 7,
                    onRun: () => handleMoveWorkspaceTab(selectedId, 'later'),
                  },
                ] satisfies CommandAction[]
              : []),
            {
              id: 'close-other-workspace-tabs',
              label: 'Close other workspace tabs',
              detail: selected?.title || 'Keep the active note tab',
              icon: DotsThree,
              keywords: ['workspace', 'tab', 'close other tabs'],
              category: 'Workspace',
              rank: 6,
              onRun: handleCloseOtherWorkspaceTabs,
            },
          ] satisfies CommandAction[]
        : []),
      ...(selectedId && workspaceTabNotes.some(note => note._id === selectedId)
        ? [{
            id: 'close-current-workspace-tab',
            label: 'Close current tab',
            detail: selected?.title || selectedId,
            icon: DotsThree,
            keywords: ['workspace', 'tab', 'close tab'],
            category: 'Workspace',
            rank: 5,
            onRun: () => handleCloseWorkspaceTab(selectedId),
          } satisfies CommandAction]
        : []),
      ...(workspaceTabNotes.length > 0
        ? [{
            id: 'close-all-workspace-tabs',
            label: 'Close all workspace tabs',
            detail: `${workspaceTabNotes.length} open note tab${workspaceTabNotes.length === 1 ? '' : 's'}`,
            icon: DotsThree,
            keywords: ['workspace', 'tab', 'close all tabs'],
            category: 'Workspace',
            rank: 4,
            onRun: handleCloseAllWorkspaceTabs,
          } satisfies CommandAction]
        : []),
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
        label: 'Import notes',
        detail: 'Create vault notes from Markdown, HTML, or text files',
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
        label: 'Import notes folder',
        detail: 'Preserve vault folders for Markdown, HTML, text, and attachments',
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

    if (!focusMode) {
      baseActions.push(
        {
          id: 'narrow-file-tree',
          label: 'Narrow file tree',
          detail: `${treeWidth}px wide`,
          icon: FolderOpen,
          keywords: ['workspace', 'sidebar', 'file tree', 'narrow file tree', 'resize file tree'],
          category: 'Workspace',
          rank: 7,
          onRun: () => handleAdjustFileTreeWidth('narrow'),
        },
        {
          id: 'widen-file-tree',
          label: 'Widen file tree',
          detail: `${treeWidth}px wide`,
          icon: FolderOpen,
          keywords: ['workspace', 'sidebar', 'file tree', 'widen file tree', 'resize file tree'],
          category: 'Workspace',
          rank: 7,
          onRun: () => handleAdjustFileTreeWidth('widen'),
        },
        {
          id: 'reset-file-tree-width',
          label: 'Reset file tree width',
          detail: `${DEFAULT_FILE_TREE_WIDTH}px default`,
          icon: FolderOpen,
          keywords: ['workspace', 'sidebar', 'file tree', 'reset file tree width', 'resize file tree'],
          category: 'Workspace',
          rank: 6,
          onRun: () => handleAdjustFileTreeWidth('reset'),
        },
      )
    }

    if (selectedId) {
      baseActions.push({
        id: 'toggle-pin',
        label: pinnedNoteSet.has(selectedId) ? 'Unpin current note' : 'Pin current note',
        detail: selected?.title || selectedId,
        icon: Star,
        onRun: () => handleTogglePin(selectedId),
      })
      baseActions.push({
        id: 'reveal-current-note',
        label: 'Reveal current note in file tree',
        detail: selected?.folder || 'Vault root',
        icon: FolderOpen,
        keywords: ['reveal active file', 'show in file tree', 'file explorer', 'navigation', 'obsidian'],
        category: 'Workspace',
        rank: 8,
        onRun: handleRevealCurrentInFileTree,
      })
      baseActions.push({
        id: 'copy-current-wikilink',
        label: 'Copy current wikilink',
        detail: selected?.title || selectedId,
        icon: Copy,
        onRun: handleCopyCurrentWikilink,
      })
      baseActions.push({
        id: 'copy-current-embed',
        label: 'Copy current embed',
        detail: selected?.title || selectedId,
        icon: Copy,
        keywords: ['embed', 'transclusion', 'obsidian', 'copy embed', 'note embed'],
        category: 'Links',
        rank: 8,
        onRun: handleCopyCurrentEmbed,
      })
      if (selected?.type === 'note') {
        baseActions.push({
          id: 'open-current-references',
          label: 'Open references',
          detail: selected.title || selectedId,
          icon: GitBranch,
          keywords: ['backlinks', 'references', 'linked mentions', 'unlinked mentions', 'obsidian'],
          category: 'Links',
          rank: 8,
          onRun: handleOpenReferences,
        })
        baseActions.push({
          id: 'open-current-local-graph',
          label: 'Open local graph',
          detail: selected.title || selectedId,
          icon: GitBranch,
          keywords: ['graph', 'local graph', 'connections', 'obsidian', 'map'],
          category: 'Links',
          rank: 8,
          onRun: handleOpenLocalGraph,
        })
      }
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
        keywords: ['workspace', 'sidebar', 'document info', 'properties', 'metadata'],
        category: 'Workspace',
        rank: 9,
        onRun: () => setInfoPanelOpen(open => !open),
      })
      baseActions.push({
        id: 'open-all-properties',
        label: 'Open all properties',
        detail: 'Browse and filter vault frontmatter metadata',
        icon: Table,
        keywords: ['properties', 'metadata', 'frontmatter', 'all properties', 'obsidian'],
        category: 'Workspace',
        rank: 8,
        onRun: () => setPropertiesIndexOpen(true),
      })
      baseActions.push({
        id: 'open-all-tags',
        label: 'Open all tags',
        detail: 'Browse nested vault tags and affected notes',
        icon: ListBullets,
        keywords: ['tags', 'tag pane', 'all tags', 'nested tags', 'obsidian'],
        category: 'Workspace',
        rank: 8,
        onRun: () => setTagsIndexOpen(true),
      })
      if (selected?.type === 'note') {
        baseActions.push({
          id: 'word-count',
          label: 'Open word count',
          detail: selected.title || selectedId,
          icon: FileText,
          keywords: ['word count', 'statistics', 'stats', 'characters', 'pages'],
          category: 'Review',
          rank: 9,
          onRun: () => setWordCountOpen(true),
        })
        baseActions.push({
          id: 'assist-writing',
          label: 'Assist writing',
          detail: selectionAnchor?.scope === 'selection' && selectionAnchor.quote?.trim()
            ? 'Draft edits for the current selection'
            : 'Draft local writing suggestions',
          icon: PenNib,
          keywords: ['smart compose', 'assistive writing', 'rewrite', 'polish', 'concise', 'suggestion'],
          category: 'Review',
          rank: 8,
          onRun: handleOpenWritingAssist,
        })
        baseActions.push({
          id: 'open-active-outline',
          label: 'Open outline',
          detail: selectedOutlineHeadings.length > 0
            ? `${selectedOutlineHeadings.length} heading${selectedOutlineHeadings.length === 1 ? '' : 's'}`
            : 'No headings in this note',
          icon: ListBullets,
          keywords: ['outline', 'headings', 'table of contents', 'jump heading', 'obsidian'],
          category: 'Navigation',
          rank: 9,
          onRun: handleOpenActiveOutline,
        })
        selectedOutlineHeadings.slice(0, 24).forEach((heading, index) => {
          baseActions.push({
            id: `jump-heading:${heading.lineNumber}:${index}`,
            label: `Go to heading: ${heading.text}`,
            detail: `H${heading.level} · line ${heading.lineNumber}`,
            icon: ListBullets,
            keywords: ['outline', 'heading', 'jump', 'navigate', heading.text],
            category: 'Navigation',
            rank: 6,
            onRun: () => handleJumpToOutlineHeading(heading),
          })
        })
        baseActions.push({
          id: 'comments',
          label: 'Open comments',
          detail: selected.title || selectedId,
          icon: ChatCircleText,
          keywords: ['comments', 'review', 'annotations', 'discussion', 'notes'],
          category: 'Review',
          rank: 8,
          onRun: () => {
            void handleOpenComments()
          },
        })
      }
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
        id: 'insert-block-id',
        label: 'Insert block ID',
        detail: 'Add an Obsidian block reference to the current Markdown line',
        icon: GitBranch,
        keywords: ['block id', 'block reference', 'obsidian', 'anchor', 'embed'],
        category: 'Insert',
        rank: 7,
        onRun: handleInsertBlockIdIntoCurrent,
      })
      baseActions.push({
        id: 'copy-block-reference',
        label: 'Copy block reference',
        detail: 'Create or reuse a block ID and copy a link to it',
        icon: Copy,
        keywords: ['block reference', 'copy block', 'block id', 'obsidian', 'anchor', 'wikilink'],
        category: 'Links',
        rank: 7,
        onRun: handleCopyBlockReference,
      })
      baseActions.push({
        id: 'copy-heading-reference',
        label: 'Copy heading reference',
        detail: 'Copy a link to the nearest Markdown heading',
        icon: Copy,
        keywords: ['heading reference', 'copy heading', 'heading link', 'obsidian', 'wikilink'],
        category: 'Links',
        rank: 7,
        onRun: handleCopyHeadingReference,
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
        id: 'rename-document-property',
        label: 'Rename document property',
        detail: selected?.properties ? Object.keys(selected.properties).join(', ') || 'No properties' : 'No properties',
        icon: NotePencil,
        keywords: ['frontmatter', 'metadata', 'property rename', 'obsidian'],
        onRun: () => {
          void handleRenameDocumentProperty()
        },
      })
      baseActions.push({
        id: 'suggestions',
        label: 'Open suggestions',
        detail: selected?.title || selectedId,
        icon: NotePencil,
        keywords: ['suggestions', 'review', 'edits', 'tracked changes'],
        category: 'Review',
        rank: 8,
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
        id: 'publish-static-site',
        label: 'Publish static notes site',
        detail: 'Download a local static HTML site for this vault',
        icon: ShareNetwork,
        onRun: () => handlePublishStaticSite(selectedId),
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

    const recentRank = new Map(recentNoteIds.map((id, index) => [id, Math.max(0, 30 - index)]))
    const noteActions = notes
      .filter(note => note.type === 'note')
      .map<CommandAction>(note => ({
        id: `note:${note._id}`,
        label: note.title || 'Untitled',
        detail: [note.folder || 'Vault root', ...(note.aliases?.map(alias => `@${alias}`) ?? [])].join(' '),
        icon: NotePencil,
        keywords: [note._id, note.folder, ...(note.aliases ?? []), ...note.tags].filter(Boolean),
        category: 'Notes',
        rank: (recentRank.get(note._id) ?? 0) + (pinnedNoteSet.has(note._id) ? 8 : 0),
        onRun: () => {
          if (selectedId && selectedId !== note._id) void flushPendingSave(selectedId)
          setSelectedId(note._id)
          setViewMode('editor')
        },
      }))

    const noteEmbedActions = selected?.type === 'note'
      ? notes
          .filter(note => note.type === 'note' && note._id !== selected._id)
          .slice(0, 40)
          .map<CommandAction>(note => ({
            id: `insert-note-embed:${note._id}`,
            label: `Insert embed: ${note.title || 'Untitled'}`,
            detail: note.folder || 'Vault root',
            icon: Copy,
            keywords: ['embed', 'transclusion', 'insert embed', 'note embed', 'obsidian', note._id, note.title, ...(note.aliases ?? [])].filter(Boolean),
            category: 'Insert',
            rank: (recentRank.get(note._id) ?? 0) + (pinnedNoteSet.has(note._id) ? 6 : 0),
            onRun: () => handleInsertNoteEmbedIntoCurrent(note),
          }))
      : []

    const tagActions = buildTagRows(notes, 64)
      .filter(row => row.directCount > 0)
      .map<CommandAction>(row => ({
        id: `rename-tag:${row.tag}`,
        label: `Rename tag #${row.tag}`,
        detail: `${row.directCount} direct, ${row.count} total note${row.count === 1 ? '' : 's'}`,
        icon: NotePencil,
        keywords: ['tag', 'tags', 'rename tag', `#${row.tag}`, row.label],
        category: 'Tags',
        onRun: () => handleRenameTag(row.tag),
      }))

    return [...baseActions, ...noteEmbedActions, ...tagActions, ...noteActions]
  }, [
    allTemplates,
    currentWorkspaceSnapshotName,
    flushPendingSave,
    focusMode,
    folders,
    handleCopyCurrentEmbed,
    handleCopyCurrentWikilink,
    handleCreate,
    handleCreateClipboardClip,
    handleCreateDailyNote,
    handleCreateFolder,
    handleCreatePeriodicNote,
    handleCreateTemplate,
    handleCloseAllWorkspaceTabs,
    handleCloseOtherWorkspaceTabs,
    handleCycleWorkspaceTab,
    handleCloseWorkspaceTab,
    handleEmptyTrash,
    handleExportDocx,
    handleExportEncryptedVault,
    handleExportHtml,
    handleExportMarkdown,
    handleExportPdf,
    handleExportReviewPackage,
    handleExportVault,
    handlePublishStaticSite,
    handleApplyVaultPluginWrites,
    handleCopyBlockReference,
    handleCopyHeadingReference,
    handleInsertVaultPluginBlock,
    handleInsertBlockIdIntoCurrent,
    handleInsertTemplateIntoCurrent,
    handleInsertNoteEmbedIntoCurrent,
    handleInsertVaultPluginManifest,
    handleInsertVaultPluginTrustedPublisher,
    handleImportPluginMarketplaceFeed,
    handleManualSaveCheckpoint,
    handleManualCollabSync,
    handleAdjustFileTreeWidth,
    handleAdjustWorkspaceSidePaneWidth,
    handleCloseWorkspaceSidePane,
    handleOpenWorkspaceSidePane,
    handleOpenWorkspaceNote,
    handleMoveWorkspaceTab,
    handleOpenCanvasView,
    handleOpenComments,
    handleOpenActiveOutline,
    handleOpenDraftRecovery,
    handleJumpToOutlineHeading,
    handleOpenLocalGraph,
    handleOpenReferences,
    handlePromoteWorkspaceSidePane,
    handleRevealCurrentInFileTree,
    handleOpenSuggestions,
    handleOpenVaultStatus,
    handleOpenVersionHistory,
    handleOpenWritingAssist,
    handleOpenWorkspaceTools,
    handleRenameFolder,
    handleRenameTag,
    handleRenameDocumentProperty,
    handleRenameWorkspaceSnapshot,
    handleRemoveDocumentProperty,
    handleRestoreNamedWorkspaceSnapshot,
    handleRestoreWorkspaceSnapshot,
    handleSaveCurrentAsTemplate,
    handleSaveWorkspaceSnapshot,
    handleSetDocumentProperty,
    handleTogglePin,
    handleUpsertTableOfContents,
    treeWidth,
    infoPanelOpen,
    focusMode,
    localCollabDrafts.length,
    localCollabLastSyncError,
    localCollabLastSyncedAt,
    localCollabProviderSummary,
    localCollabSupported,
    normalizedWorkspaceSnapshots,
    normalizedEditorPreferences.defaultMode,
    normalizedEditorPreferences.dailyNoteTitleFormat,
    normalizedEditorPreferences.markdownWidth,
    notes,
    pinnedNoteSet,
    recentNoteIds,
    selected?.folder,
    selectedFolderTemplate,
    selected?.properties,
    selected?.title,
    selectionAnchor,
    selectedOutlineHeadings,
    selectedId,
    setFocusMode,
    setInfoPanelOpen,
    vaultPluginCommands,
    vaultPlugins,
    vaultTemplates,
    workspaceTabNotes,
    workspaceSidePaneNote,
    workspaceSidePanePixelWidth,
    workspaceSnapshot,
  ])

  const handleResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = treeWidth
      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX
        setTreeWidth(clampFileTreeWidth(startWidth + delta))
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

  const handleSidePaneResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = clampWorkspaceSidePaneWidth(Number(workspaceSidePaneWidth) || DEFAULT_WORKSPACE_SIDE_PANE_WIDTH)
      const onMove = (ev: MouseEvent) => {
        const delta = startX - ev.clientX
        setWorkspaceSidePaneWidth(clampWorkspaceSidePaneWidth(startWidth + delta))
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
    [setWorkspaceSidePaneWidth, workspaceSidePaneWidth],
  )

  const handleSidePaneResizeKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const currentWidth = clampWorkspaceSidePaneWidth(Number(workspaceSidePaneWidth) || DEFAULT_WORKSPACE_SIDE_PANE_WIDTH)
      const step = event.shiftKey ? 40 : 20
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setWorkspaceSidePaneWidth(clampWorkspaceSidePaneWidth(currentWidth + step))
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setWorkspaceSidePaneWidth(clampWorkspaceSidePaneWidth(currentWidth - step))
      } else if (event.key === 'Home') {
        event.preventDefault()
        setWorkspaceSidePaneWidth(MIN_WORKSPACE_SIDE_PANE_WIDTH)
      } else if (event.key === 'End') {
        event.preventDefault()
        setWorkspaceSidePaneWidth(MAX_WORKSPACE_SIDE_PANE_WIDTH)
      }
    },
    [setWorkspaceSidePaneWidth, workspaceSidePaneWidth],
  )

  const handleFileTreeResizeKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const step = event.shiftKey ? FILE_TREE_WIDTH_STEP : FILE_TREE_WIDTH_STEP / 2
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setTreeWidth(current => clampFileTreeWidth(current - step))
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setTreeWidth(current => clampFileTreeWidth(current + step))
      } else if (event.key === 'Home') {
        event.preventDefault()
        setTreeWidth(MIN_FILE_TREE_WIDTH)
      } else if (event.key === 'End') {
        event.preventDefault()
        setTreeWidth(MAX_FILE_TREE_WIDTH)
      }
    },
    [],
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

  if (error && notes.length === 0 && unavailableNotes.length === 0) {
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

  const pendingLocalEditCount = pendingContentRef.current.size
  const pendingLocalEdits: QueuedLocalEdit[] = [...pendingContentRef.current.entries()].map(([noteId, content]) => {
    const note = notesRef.current.find(item => item._id === noteId)
    const title = note?.type === 'note' ? note.title || noteId.split('/').pop()?.replace(/\.md$/, '') || noteId : noteId
    const folder = note?.type === 'note'
      ? note.folder || 'Vault root'
      : normalizeFolderPath(noteId.split('/').slice(0, -1).join('/')) || 'Vault root'
    return {
      noteId,
      title,
      folder,
      content,
      error: saveErrorByNoteId[noteId],
    }
  })

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

  const saveDetail = selected?.type !== 'note'
    ? 'Select a note to save edits.'
    : saveState === 'error'
      ? 'Queued edits are still local. Retry the queued save when the backend is available.'
      : 'Autosaves after edits; manual save also creates a checkpoint when changed.'

  const queuedEditDetail = !networkOnline
    ? 'Saved locally and waiting for reconnect.'
    : saveState === 'error'
      ? 'Last save failed; retry queued save keeps the edit local until it succeeds.'
      : 'Waiting for the next save flush.'
  const knownSyncConflicts = (vaultSyncLedger?.sync_states ?? []).filter(state => isSyncConflictState(state))
  const knownSyncConflictCount = knownSyncConflicts.length
  const knownSyncConflictLabel = `${knownSyncConflictCount} sync conflict${knownSyncConflictCount === 1 ? '' : 's'}`
  const knownSyncConflictActionLabel = `${knownSyncConflictLabel} ${knownSyncConflictCount === 1 ? 'needs' : 'need'} review`

  const noteStatusLabel = saveState === 'error'
    ? 'Save failed'
    : localCollabLastSyncError
      ? 'Sync issue'
      : knownSyncConflictCount > 0
        ? knownSyncConflictLabel
      : !networkOnline
        ? 'Offline'
      : localCollabDrafts.length > 0
        ? `${localCollabDrafts.length} draft${localCollabDrafts.length === 1 ? '' : 's'}`
        : localCollabSyncing
          ? 'Collab sync'
          : syncing
            ? 'Syncing'
            : pendingLocalEditCount > 0
              ? `Queued ${pendingLocalEditCount}`
            : saveState === 'saving'
              ? 'Saving...'
              : saveState === 'unsaved'
                ? 'Unsaved'
                : 'Saved'

  const noteStatusTone =
    saveState === 'error' || localCollabLastSyncError || knownSyncConflictCount > 0
      ? 'danger'
      : !networkOnline || syncing || saveState === 'saving' || localCollabSyncing || localCollabDrafts.length > 0 || pendingLocalEditCount > 0
        ? 'accent'
        : 'muted'
  const noteStatusTriggerLabel = noteStatusTone === 'muted' && noteStatusLabel === 'Saved' ? '' : noteStatusLabel
  const compactHiddenSyncIssueLabels = [
    workspaceSyncState === 'error' ? 'Workspace sync issue' : null,
    pinnedNotesSyncState === 'error' ? 'Pinned-note sync issue' : null,
    savedSearchSyncState === 'error' ? 'Saved-search sync issue' : null,
    editorPreferencesSyncState === 'error' ? 'Editor preferences sync issue' : null,
  ].filter((label): label is string => Boolean(label))
  const compactHiddenSyncIssueLabel =
    compactHiddenSyncIssueLabels.length === 1
      ? compactHiddenSyncIssueLabels[0]
      : `${compactHiddenSyncIssueLabels.length} sync settings need retry`
  const compactNoteToolsTone =
    noteStatusTone === 'danger' || compactHiddenSyncIssueLabels.length > 0
      ? 'danger'
      : noteStatusTone === 'accent'
        ? 'accent'
        : 'default'
  const compactNoteToolsStatusLabel =
    noteStatusTone === 'danger'
      ? noteStatusLabel
      : compactHiddenSyncIssueLabels.length > 0
        ? compactHiddenSyncIssueLabel
        : noteStatusLabel
  const compactNoteToolsTitle = compactNoteToolsTone === 'default' ? 'Note tools' : `Note tools - ${compactNoteToolsStatusLabel}`
  const compactNoteToolsDescription = compactNoteToolsTone === 'default'
    ? undefined
    : compactHiddenSyncIssueLabels.length > 0
      ? `Hidden sync status: ${compactHiddenSyncIssueLabels.join('; ')}. Open Note tools for Status and sync.`
      : `Hidden note status: ${noteStatusLabel}. Open Note tools for Status and sync.`
  const noteStatusIcon = !networkOnline ? <CloudSlash size={14} /> : <Cloud size={14} />

  const viewModeIcon =
    viewMode === 'editor'
      ? <FileText size={14} />
      : viewMode === 'graph'
        ? <GitBranch size={14} />
        : viewMode === 'data'
          ? <Table size={14} />
          : <SquaresFour size={14} />
  const selectedFolderLabel = selected?.folder || 'Vault root'
  const selectedContextLabel = selected?.type === 'attachment' ? `${selectedFolderLabel} / Attachment` : selectedFolderLabel
  const recoverableDraftCount = getRecoverableDrafts().length

  const closeTopBarMenu = () => setTopBarMenu(null)

  const runStatusAction = (action: string) => {
    closeTopBarMenu()
    if (action === 'sync') void handleManualCollabSync()
    if (action === 'drafts') setCollabReviewOpen(true)
    if (action === 'queued-edits') setQueuedEditsOpen(true)
    if (action === 'retry-save') void handleRetryQueuedSave()
    if (action === 'manual-save') void handleManualSaveCheckpoint()
    if (action === 'refresh-vault') void refresh()
    if (action === 'vault-status') void handleOpenVaultStatus()
    if (action === 'recovered-drafts') handleOpenDraftRecovery()
  }

  const runViewAction = (next: ViewMode) => {
    closeTopBarMenu()
    if (next === 'canvas') {
      void handleOpenCanvasView()
      return
    }
    setViewMode(next)
  }

  const runMoreAction = (action: string) => {
    closeTopBarMenu()
    if (action === 'new-note') void handleCreate(selected?.folder)
    if (action === 'daily') void handleCreateDailyNote(selected?.folder)
    if (action === 'daily-yesterday') void handleCreateDailyNote(selected?.folder, dailyNoteDateWithOffset(new Date(), -1))
    if (action === 'daily-tomorrow') void handleCreateDailyNote(selected?.folder, dailyNoteDateWithOffset(new Date(), 1))
    if (action === 'daily-date') setDailyDatePickerOpen(true)
    if (action === 'weekly') void handleCreatePeriodicNote('weekly', selected?.folder)
    if (action === 'monthly') void handleCreatePeriodicNote('monthly', selected?.folder)
    if (action === 'folder') void handleCreateFolder(selected?.folder)
    if (action === 'clip') void handleCreateClipboardClip()
    if (action === 'versions') void handleOpenVersionHistory()
    if (action === 'comments') void handleOpenComments()
    if (action === 'suggest') void handleOpenSuggestions()
    if (action === 'assist-writing') handleOpenWritingAssist()
    if (action === 'references') handleOpenReferences()
    if (action === 'local-graph') handleOpenLocalGraph()
    if (action === 'info') setInfoPanelOpen(open => !open)
    if (action === 'outline') handleOpenActiveOutline()
    if (action === 'word-count') setWordCountOpen(true)
    if (action === 'pin' && selected) handleTogglePin(selected._id)
    if (action === 'reveal-file-tree') handleRevealCurrentInFileTree()
    if (action === 'open-current-side-pane' && selected?.type === 'note') handleOpenWorkspaceSidePane(selected._id)
    if (action === 'copy-wikilink') handleCopyCurrentWikilink()
    if (action === 'copy-embed') handleCopyCurrentEmbed()
    if (action === 'copy-path') handleCopyCurrentPath()
    if (action === 'insert-block-id') handleInsertBlockIdIntoCurrent()
    if (action === 'copy-block-reference') handleCopyBlockReference()
    if (action === 'copy-heading-reference') handleCopyHeadingReference()
    if (action === 'docx' && selected?.type === 'note') handleExportDocx(selected._id)
    if (action === 'pdf' && selected?.type === 'note') handleExportPdf(selected._id)
    if (action === 'markdown' && selected?.type === 'note') handleExportMarkdown(selected._id)
    if (action === 'html' && selected?.type === 'note') handleExportHtml(selected._id)
    if (action === 'publish-site' && selected?.type === 'note') handlePublishStaticSite(selected._id)
    if (action === 'share' && selected?.type === 'note') void handleExportReviewPackage(selected._id)
    if (action === 'restore') void handleRestoreFromTrash()
    if (action === 'trash') void handleDeleteNote()
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.mdown,.html,.htm,.txt,text/markdown,text/html,text/plain"
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
        accept=".md,.markdown,.mdown,.html,.htm,.txt,text/markdown,text/html,text/plain"
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
      {notesCssSnippet && (
        <style data-testid="notes-css-snippet">{notesCssSnippet}</style>
      )}
      <div
        data-notes-vault-scope="true"
        data-notes-appearance={normalizedEditorPreferences.appearanceMode}
        style={{
          flex: 1,
          minHeight: 0,
          margin: '-20px -28px',
          display: 'flex',
          overflow: 'hidden',
          ...notesVaultAppearanceStyle,
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
                unavailableNoteIds={unavailableNoteIds}
                onUnavailableNoteSelect={() => {
                  void refresh()
                }}
                onSelect={id => {
                  if (unavailableNoteIds.has(id)) {
                    void refresh()
                    return
                  }
                  if (selectedId && selectedId !== id) void flushPendingSave(selectedId)
                  setSelectedId(id)
                  setViewMode('editor')
                }}
                onOpenInSidePane={handleOpenWorkspaceSidePane}
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
                onRenameTag={handleRenameTag}
                expandedFolders={fileTreeExpandedFolders}
                onExpandedFoldersChange={paths => setFileTreeExpandedFolders(new Set([
                  '',
                  ...paths
                    .map(path => path.trim())
                    .filter(Boolean)
                    .slice(0, 32),
                ]))}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                searchUsesBackend={searchUsesBackend}
                savedSearches={normalizedSavedSearches}
                savedSearchSyncLabel={savedSearchSyncLabel}
                savedSearchSyncDetail={savedSearchSyncDetail}
                savedSearchSyncError={savedSearchSyncState === 'error'}
                onSaveSearch={handleSaveSearch}
                onRemoveSavedSearch={handleRemoveSavedSearch}
                onRetrySavedSearchSync={handleRetrySavedSearchSync}
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
              aria-valuemin={MIN_FILE_TREE_WIDTH}
              aria-valuemax={MAX_FILE_TREE_WIDTH}
              aria-valuenow={treeWidth}
              aria-valuetext={`${treeWidth} pixels wide`}
              tabIndex={0}
              onKeyDown={handleFileTreeResizeKeyDown}
            />
          </>
        )}

        {/* Main area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Toolbar */}
          <div
            ref={topBarRef}
            data-testid="notes-topbar"
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'nowrap',
              gap: 6,
              height: 36,
              maxHeight: 36,
              padding: '4px 8px',
              flexShrink: 0,
              position: 'relative',
              zIndex: 80,
              borderBottom: '1px solid var(--border)',
              background: 'color-mix(in srgb, var(--bg-base) 94%, black)',
              boxShadow: '0 1px 0 var(--bg-white-03)',
              overflow: 'visible',
              whiteSpace: 'nowrap',
            }}
          >
            <div data-testid="notes-topbar-primary" style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 6, minWidth: 0, flex: '1 1 0', overflow: 'visible', height: 28 }}>
              <div style={{ minWidth: compactTopBarActions ? 48 : 84, maxWidth: compactTopBarActions ? 'none' : 'clamp(120px, 34vw, 360px)', display: 'flex', alignItems: 'center', flex: compactTopBarActions ? '1 1 96px' : '1 1 180px', height: 28 }}>
                {selected ? (
                  editingTitle ? (
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
                        width: '100%',
                        minWidth: 0,
                        height: 28,
                        background: 'var(--bg-white-03)',
                        border: '1px solid var(--accent-a30)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                        fontSize: 14,
                        fontWeight: 650,
                        fontFamily: 'inherit',
                        padding: '0 7px',
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      aria-label="Rename note"
                      onClick={() => {
                        setTitleDraft(selected.title)
                        setEditingTitle(true)
                        setTimeout(() => titleRef.current?.focus(), 20)
                      }}
                      style={{
                        width: '100%',
                        minWidth: 0,
                        height: 28,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-primary)',
                        cursor: 'text',
                        padding: '0 5px',
                        borderRadius: 'var(--radius-sm)',
                        overflow: 'hidden',
                        textAlign: 'left',
                      }}
                      title={`${selectedContextLabel} / ${selected.title || 'Untitled'}`}
                    >
                      <span
                        style={{
                          color: 'var(--text-primary)',
                          fontSize: 14,
                          fontWeight: 650,
                          minWidth: 32,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: '1 1 auto',
                        }}
                      >
                        {selected.title || 'Untitled'}
                      </span>
                    </button>
                  )
                ) : (
                  <div
                    style={{
                      width: '100%',
                      minWidth: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '0 5px',
                      overflow: 'hidden',
                    }}
                  >
                    {!compactTopBarActions && (
                      <>
                        <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 550, whiteSpace: 'nowrap' }}>Vault workspace</span>
                        <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>/</span>
                      </>
                    )}
                    <span style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Select a note</span>
                  </div>
                )}
              </div>

              {selected && !editingTitle && !compactTopBarActions && (
                <TopBarMenuButton
                  label="Note details"
                  icon={<FolderOpen size={14} />}
                  menuAlign="left"
                  searchable
                  searchLabel="Filter note details"
                  searchPlaceholder="Filter details..."
                  open={topBarMenu === 'note-identity'}
                  onToggle={() => setTopBarMenu(topBarMenu === 'note-identity' ? null : 'note-identity')}
                >
                  <TopBarMenuSection label="Current note" />
                  <TopBarMenuItem
                    label={selected.title || 'Untitled'}
                    icon={<FileText size={14} />}
                    detail={selected._id}
                    disabled
                  />
                  <TopBarMenuItem
                    label={selectedFolderLabel}
                    icon={<FolderOpen size={14} />}
                    detail={selected.type === 'attachment' ? 'Attachment folder' : 'Folder'}
                    disabled
                  />
                  {selected.type === 'note' && (
                    <>
                      <TopBarMenuSection label="Identity" />
                      <TopBarMenuItem
                        label="Rename note"
                        icon={<NotePencil size={14} />}
                        onClick={() => {
                          setTopBarMenu(null)
                          setTitleDraft(selected.title)
                          setEditingTitle(true)
                          setTimeout(() => titleRef.current?.focus(), 20)
                        }}
                      />
                      <TopBarMenuItem label={pinnedNoteSet.has(selected._id) ? 'Unpin current note' : 'Pin current note'} icon={<Star size={14} />} onClick={() => runMoreAction('pin')} />
                      <TopBarMenuItem
                        label="Reveal in file tree"
                        icon={<FolderOpen size={14} />}
                        detail={focusMode ? 'Show the file tree with this note selected.' : selected.folder || 'Vault root'}
                        onClick={() => runMoreAction('reveal-file-tree')}
                      />
                      <TopBarMenuItem
                        label="Open in side pane"
                        icon={<SquaresFour size={14} />}
                        detail="Split this note beside the editor."
                        onClick={() => runMoreAction('open-current-side-pane')}
                      />
                      <TopBarMenuSection label="Copy links" />
                      <TopBarMenuItem label="Copy wikilink" icon={<Copy size={14} />} onClick={() => runMoreAction('copy-wikilink')} />
                      <TopBarMenuItem label="Copy note embed" icon={<Copy size={14} />} onClick={() => runMoreAction('copy-embed')} />
                      <TopBarMenuItem label="Copy note path" icon={<Copy size={14} />} onClick={() => runMoreAction('copy-path')} />
                      <TopBarMenuSection label="References" />
                      <TopBarMenuItem label="Open references" icon={<GitBranch size={14} />} onClick={() => runMoreAction('references')} />
                      <TopBarMenuItem label="Open local graph" icon={<GitBranch size={14} />} onClick={() => runMoreAction('local-graph')} />
                      <TopBarMenuItem label="Insert block ID" icon={<GitBranch size={14} />} onClick={() => runMoreAction('insert-block-id')} />
                      <TopBarMenuItem label="Copy block reference" icon={<Copy size={14} />} onClick={() => runMoreAction('copy-block-reference')} />
                      <TopBarMenuItem label="Copy heading reference" icon={<Copy size={14} />} onClick={() => runMoreAction('copy-heading-reference')} />
                    </>
                  )}
                </TopBarMenuButton>
              )}

              {!compactTopBarActions && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 3, flexWrap: 'nowrap', flex: '0 1 auto', minWidth: 0 }}>
	                  <TopBarMenuButton
	                    label="Workspace tools"
	                    icon={<ListBullets size={14} />}
	                    menuAlign="left"
	                    searchable
	                    searchLabel="Filter workspace tools"
	                    searchPlaceholder="Filter workspace..."
	                    open={topBarMenu === 'workspace'}
	                    onToggle={() => setTopBarMenu(topBarMenu === 'workspace' ? null : 'workspace')}
	                  >
                    <TopBarMenuItem
                      label="Open command palette"
                      icon={<ListBullets size={14} />}
                      detail="Search notes, run commands, and jump across the vault."
                      onClick={() => {
                        setCommandOpen(true)
                        setCommandQuery('')
                        setTopBarMenu(null)
                      }}
                    />
                    <TopBarMenuItem
                      label="Keyboard shortcuts"
                      icon={<FileText size={14} />}
                      detail="Open the Notes shortcut reference."
                      onClick={() => {
                        setShortcutsOpen(true)
                        setTopBarMenu(null)
                      }}
                    />
                    <TopBarMenuSection label="Sidebars" />
                    <TopBarMenuItem
                      label={focusMode ? 'Show file tree' : 'Hide file tree'}
                      icon={<PenNib size={14} />}
                      detail={focusMode ? 'Bring back the file tree sidebar.' : 'Enter a cleaner writing layout.'}
                      onClick={() => {
                        setFocusMode(prev => !prev)
                        setTopBarMenu(null)
                      }}
                    />
                    {!focusMode && (
                      <>
                        <TopBarMenuItem
                          label="Narrow file tree"
                          icon={<FolderOpen size={14} />}
                          detail={`${treeWidth}px wide`}
                          onClick={() => handleAdjustFileTreeWidth('narrow')}
                        />
                        <TopBarMenuItem
                          label="Widen file tree"
                          icon={<FolderOpen size={14} />}
                          detail={`${treeWidth}px wide`}
                          onClick={() => handleAdjustFileTreeWidth('widen')}
                        />
                        <TopBarMenuItem
                          label="Reset file tree width"
                          icon={<FolderOpen size={14} />}
                          detail={`${DEFAULT_FILE_TREE_WIDTH}px default`}
                          onClick={() => handleAdjustFileTreeWidth('reset')}
                        />
                      </>
                    )}
                    <TopBarMenuItem
                      label={infoPanelOpen ? 'Hide document info' : 'Show document info'}
                      icon={<FileText size={14} />}
                      detail={selected ? 'Toggle the right document metadata sidebar.' : 'Select a note to inspect metadata.'}
                      disabled={!selected}
                      onClick={() => {
                        setInfoPanelOpen(prev => !prev)
                        setTopBarMenu(null)
                      }}
                    />
                    <TopBarMenuItem
                      label="Close sidebars"
                      icon={<PenNib size={14} />}
                      detail="Hide the file tree and document info sidebars."
                      onClick={() => {
                        setFocusMode(true)
                        setInfoPanelOpen(false)
                        setTopBarMenu(null)
                      }}
                    />
                    {workspaceSidePaneNote && (
                      <>
                        <TopBarMenuItem
                          label="Swap primary and side pane"
                          icon={<SquaresFour size={14} />}
                          detail={workspaceSidePaneNote.title || workspaceSidePaneNote._id}
                          onClick={handlePromoteWorkspaceSidePane}
                        />
                        <TopBarMenuItem
                          label="Close side pane"
                          icon={<X size={14} />}
                          detail={workspaceSidePaneNote.title || workspaceSidePaneNote._id}
                          onClick={handleCloseWorkspaceSidePane}
                        />
                        <TopBarMenuItem
                          label="Narrow side pane"
                          icon={<SquaresFour size={14} />}
                          detail={`${workspaceSidePanePixelWidth}px wide`}
                          onClick={() => handleAdjustWorkspaceSidePaneWidth('narrow')}
                        />
                        <TopBarMenuItem
                          label="Widen side pane"
                          icon={<SquaresFour size={14} />}
                          detail={`${workspaceSidePanePixelWidth}px wide`}
                          onClick={() => handleAdjustWorkspaceSidePaneWidth('widen')}
                        />
                        <TopBarMenuItem
                          label="Reset side pane width"
                          icon={<SquaresFour size={14} />}
                          detail={`${DEFAULT_WORKSPACE_SIDE_PANE_WIDTH}px default`}
                          onClick={() => handleAdjustWorkspaceSidePaneWidth('reset')}
                        />
                      </>
                    )}
                    {workspaceTabNotes.length > 0 && (
                      <>
                        <TopBarMenuSection label="Open tabs" />
                        {workspaceTabNotes.map(note => {
                          const isActivePrimaryNote = selectedId === note._id
                          return (
                            <Fragment key={`workspace-tab-${note._id}`}>
                              <TopBarMenuItem
                                label={`Switch tab: ${note.title || 'Untitled'}`}
                                icon={<FileText size={14} />}
                                detail={workspaceTabNotes.length > 1 ? `${note.folder || 'Vault root'} · Drag or Alt+Up/Down to reorder` : note.folder || 'Vault root'}
                                active={isActivePrimaryNote}
                                draggable={workspaceTabNotes.length > 1}
                                onDragStart={event => {
                                  event.dataTransfer.setData(WORKSPACE_TAB_DRAG_TYPE, note._id)
                                  event.dataTransfer.effectAllowed = 'move'
                                }}
                                onDragOver={event => {
                                  if (workspaceTabNotes.length <= 1) return
                                  event.preventDefault()
                                  event.dataTransfer.dropEffect = 'move'
                                }}
                                onDrop={event => {
                                  event.preventDefault()
                                  handleReorderWorkspaceTab(event.dataTransfer.getData(WORKSPACE_TAB_DRAG_TYPE), note._id)
                                }}
                                onKeyDown={event => {
                                  if (!event.altKey || workspaceTabNotes.length <= 1) return
                                  if (event.key === 'ArrowUp') {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    handleMoveWorkspaceTab(note._id, 'earlier')
                                  }
                                  if (event.key === 'ArrowDown') {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    handleMoveWorkspaceTab(note._id, 'later')
                                  }
                                }}
                                onClick={() => handleOpenWorkspaceNote(note._id)}
                              />
                              <TopBarMenuItem
                                label={`Open in side pane: ${note.title || 'Untitled'}`}
                                icon={<SquaresFour size={14} />}
                                detail={isActivePrimaryNote ? 'Split the current note to the side.' : note.folder || 'Vault root'}
                                active={workspaceSidePaneNote?._id === note._id}
                                onClick={() => handleOpenWorkspaceSidePane(note._id)}
                              />
                              <TopBarMenuItem
                                label={`Close tab: ${note.title || 'Untitled'}`}
                                icon={<DotsThree size={14} />}
                                detail="Remove from this local workspace stack."
                                onClick={() => handleCloseWorkspaceTab(note._id)}
                              />
                            </Fragment>
                          )
                        })}
                        {selectedId && workspaceTabNotes.length > 1 && (
                          <>
                            <TopBarMenuItem
                              label="Move current tab earlier"
                              icon={<DotsThree size={14} />}
                              detail="Reorder the active tab toward the top."
                              onClick={() => handleMoveWorkspaceTab(selectedId, 'earlier')}
                            />
                            <TopBarMenuItem
                              label="Move current tab later"
                              icon={<DotsThree size={14} />}
                              detail="Reorder the active tab toward the bottom."
                              onClick={() => handleMoveWorkspaceTab(selectedId, 'later')}
                            />
                            <TopBarMenuItem
                              label="Close other tabs"
                              icon={<DotsThree size={14} />}
                              detail="Keep the active note tab in this workspace."
                              onClick={handleCloseOtherWorkspaceTabs}
                            />
                          </>
                        )}
                        <TopBarMenuItem
                          label="Close all tabs"
                          icon={<DotsThree size={14} />}
                          detail="Clear this local workspace tab stack."
                          tone="danger"
                          onClick={handleCloseAllWorkspaceTabs}
                        />
                      </>
                    )}
                    <TopBarMenuSection label="Workspace snapshot" />
                    <TopBarMenuItem
                      label="Save current workspace"
                      icon={<ShieldCheck size={14} />}
                      detail="Capture view, sidebar, info panel, width, and active note."
                      onClick={handleSaveWorkspaceSnapshot}
                    />
                    <TopBarMenuItem
                      label="Restore saved workspace"
                      icon={<UploadSimple size={14} />}
                      detail={workspaceSnapshot ? `Saved ${new Date(workspaceSnapshot.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'No saved workspace yet.'}
                      disabled={!workspaceSnapshot}
                      onClick={handleRestoreWorkspaceSnapshot}
                    />
                    <TopBarMenuItem
                      label={workspaceSyncLabel}
                      icon={workspaceSyncState === 'error' ? <CloudSlash size={14} /> : <Cloud size={14} />}
                      detail={workspaceSyncDetail}
                      disabled
                    />
                    {workspaceSyncState === 'error' && (
                      <TopBarMenuItem
                        label="Retry workspace sync"
                        icon={<ArrowClockwise size={14} />}
                        detail="Write local workspace presets to the hidden vault sync note."
                        onClick={handleRetryWorkspaceSync}
                      />
                    )}
                    {normalizedWorkspaceSnapshots.length > 0 && (
                      <>
                        <TopBarMenuSection label="Saved workspaces" />
                        {normalizedWorkspaceSnapshots.map(snapshot => {
                          const snapshotName = snapshot.name || `${viewModeLabel(snapshot.viewMode)} workspace`
                          const snapshotKey = workspaceSnapshotKey(snapshot)
                          return (
                            <Fragment key={snapshotKey}>
                              <TopBarMenuItem
                                label={`Restore workspace: ${snapshotName}`}
                                icon={<UploadSimple size={14} />}
                                detail={`${viewModeLabel(snapshot.viewMode)} view, saved ${new Date(snapshot.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                                active={!!workspaceSnapshot && workspaceSnapshotKey(workspaceSnapshot) === snapshotKey}
                                onClick={() => handleRestoreNamedWorkspaceSnapshot(snapshot)}
                              />
                              <TopBarMenuItem
                                label={`Rename workspace: ${snapshotName}`}
                                icon={<NotePencil size={14} />}
                                detail="Rename this local layout preset."
                                onClick={() => handleRenameWorkspaceSnapshot(snapshot)}
                              />
                              <TopBarMenuItem
                                label={`Delete workspace: ${snapshotName}`}
                                icon={<Trash size={14} />}
                                detail="Remove this local workspace preset."
                                tone="danger"
                                onClick={() => handleDeleteWorkspaceSnapshot(snapshot)}
                              />
                            </Fragment>
                          )
                        })}
                      </>
                    )}
                    <TopBarMenuSection label="Pinned sync" />
                    <TopBarMenuItem
                      label={pinnedNotesSyncLabel}
                      icon={pinnedNotesSyncState === 'error' ? <CloudSlash size={14} /> : <Cloud size={14} />}
                      detail={pinnedNotesSyncDetail}
                      disabled
                    />
                    {pinnedNotesSyncState === 'error' && (
                      <TopBarMenuItem
                        label="Retry pinned-note sync"
                        icon={<ArrowClockwise size={14} />}
                        detail="Write local pinned notes to the hidden vault sync note."
                        onClick={handleRetryPinnedNotesSync}
                      />
                    )}
                    {pinnedWorkspaceNotes.length > 0 && (
                      <>
                        <TopBarMenuSection label="Pinned notes" />
                        {pinnedWorkspaceNotes.map(note => (
                          <TopBarMenuItem
                            key={`workspace-pinned-${note._id}`}
                            label={note.title || 'Untitled'}
                            icon={<Star size={14} />}
                            detail={note.folder || 'Vault root'}
                            active={selectedId === note._id}
                            onClick={() => handleOpenWorkspaceNote(note._id)}
                          />
                        ))}
                      </>
                    )}
                    {recentWorkspaceNotes.length > 0 && (
                      <>
                        <TopBarMenuSection label="Recent notes" />
                        {recentWorkspaceNotes.map(note => (
                          <TopBarMenuItem
                            key={`workspace-recent-${note._id}`}
                            label={note.title || 'Untitled'}
                            icon={<NotePencil size={14} />}
                            detail={note.folder || 'Vault root'}
                            active={selectedId === note._id}
                            onClick={() => handleOpenWorkspaceNote(note._id)}
                          />
                        ))}
                      </>
                    )}
                  </TopBarMenuButton>
                  <TopBarMenuButton
                    label="Note status"
                    icon={noteStatusIcon}
                    text={noteStatusTriggerLabel}
                    tone={noteStatusTone}
                    menuAlign="left"
                    searchable
                    searchLabel="Filter note status"
                    searchPlaceholder="Filter status..."
                    open={topBarMenu === 'status'}
                    onToggle={() => setTopBarMenu(topBarMenu === 'status' ? null : 'status')}
                  >
                    <TopBarMenuSection label="Local save" />
                    <TopBarMenuItem
                      label={saveLabel}
                      icon={<Cloud size={14} />}
                      detail={saveDetail}
                      disabled
                    />
                    {pendingLocalEditCount > 0 && (
                      <TopBarMenuItem
                        label={`${pendingLocalEditCount} queued local edit${pendingLocalEditCount === 1 ? '' : 's'}`}
                        icon={<FileText size={14} />}
                        detail={queuedEditDetail}
                        disabled
                      />
                    )}
                    {pendingLocalEditCount > 0 && (
                      <TopBarMenuItem
                        label="Review queued edits"
                        icon={<FileText size={14} />}
                        detail="Inspect local-only notes, save errors, and retry paths."
                        onClick={() => runStatusAction('queued-edits')}
                      />
                    )}
                    {networkOnline && pendingLocalEditCount > 0 && (
                      <TopBarMenuItem
                        label="Retry queued save"
                        icon={<Cloud size={14} />}
                        detail="Flush queued local edits without naming a version checkpoint."
                        onClick={() => runStatusAction('retry-save')}
                      />
                    )}
                    {selected?.type === 'note' && (
                      <TopBarMenuItem
                        label="Save current note"
                        icon={<Cloud size={14} />}
                        detail={networkOnline ? 'Flush pending edits and name a version checkpoint.' : 'Reconnect before flushing queued edits or naming a version checkpoint.'}
                        disabled={!networkOnline}
                        onClick={() => runStatusAction('manual-save')}
                      />
                    )}
                    <TopBarMenuSection label="Vault sync" />
                    {knownSyncConflictCount > 0 && (
                      <TopBarMenuItem
                        label={knownSyncConflictActionLabel}
                        icon={<ShieldCheck size={14} />}
                        detail="Open diagnostics to compare remote changes, keep local, or create a reviewed merge suggestion."
                        tone="danger"
                        onClick={() => runStatusAction('vault-status')}
                      />
                    )}
                    <TopBarMenuItem
                      label={!networkOnline ? 'Offline mode' : syncing ? 'Vault sync running' : error ? 'Vault sync unavailable' : 'Vault sync ready'}
                      icon={!networkOnline ? <CloudSlash size={14} /> : <Cloud size={14} />}
                      detail={!networkOnline ? 'Edits stay local and sync resumes when the device is online.' : error || 'Local vault cache and remote state are available.'}
                      disabled
                    />
                    <TopBarMenuItem
                      label="Refresh notes from vault"
                      icon={<ArrowClockwise size={14} />}
                      detail="Reload local vault documents now, including note bodies and folders."
                      onClick={() => runStatusAction('refresh-vault')}
                    />
                    <TopBarMenuItem label="Sync diagnostics" icon={<ShieldCheck size={14} />} detail="Inspect local save queue, sync ledger, and vault privacy status." onClick={() => runStatusAction('vault-status')} />
                    <TopBarMenuItem label="Recovered drafts" icon={<FileText size={14} />} detail={`${recoverableDraftCount} unsynced local draft${recoverableDraftCount === 1 ? '' : 's'}`} onClick={() => runStatusAction('recovered-drafts')} />
                    {selected?.type === 'note' && localCollabSupported && (
                      <>
                        <TopBarMenuSection label="Collaboration" />
                        <TopBarMenuItem
                          label={localCollabSyncing ? 'Collab syncing...' : `Sync local collab (${localCollabProviderSummary.label})`}
                          icon={<Cloud size={14} />}
                          detail={localCollabLastSyncError || localCollabProviderSummary.detail || 'Layered local and remote collaboration transports.'}
                          disabled={localCollabSyncing}
                          onClick={() => runStatusAction('sync')}
                        />
                        {localCollabPeers.length > 0 && (
                          <TopBarMenuItem
                            label={`${localCollabPeers.length} local editor${localCollabPeers.length === 1 ? '' : 's'}`}
                            icon={<ChatCircleText size={14} />}
                            detail={localCollabPeers.map(peer => peer.name).join(', ')}
                            disabled
                          />
                        )}
                        {localCollabDrafts.length > 0 && (
                          <TopBarMenuItem
                            label={`Review ${localCollabDrafts.length} incoming draft${localCollabDrafts.length === 1 ? '' : 's'}`}
                            icon={<FileText size={14} />}
                            onClick={() => runStatusAction('drafts')}
                          />
                        )}
                      </>
                    )}
                  </TopBarMenuButton>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 3, flex: '0 0 auto', minWidth: 0, marginLeft: 'auto' }}>
              {compactTopBarActions ? (
	                <TopBarMenuButton
	                  label="Note tools"
	                  icon={<DotsThree size={16} weight="bold" />}
	                  tone={compactNoteToolsTone}
	                  title={compactNoteToolsTitle}
	                  description={compactNoteToolsDescription}
	                  indicatorTone={compactNoteToolsTone === 'default' ? undefined : compactNoteToolsTone}
	                  searchable
	                  quickFilters={[
	                    { label: 'Status', query: 'Status and sync' },
	                    { label: 'Current', query: 'Current note' },
	                    { label: 'Workspace', query: 'Workspace' },
	                    { label: 'Create', query: 'Create' },
	                    { label: 'View', query: 'View' },
	                    { label: 'Export', query: 'Export and share' },
	                  ]}
	                  searchLabel="Filter note tools"
	                  searchPlaceholder="Filter actions..."
	                  open={topBarMenu === 'note-tools'}
	                  onToggle={() => setTopBarMenu(topBarMenu === 'note-tools' ? null : 'note-tools')}
	                >
                  <TopBarMenuSection label="Status and sync" />
                  <TopBarMenuItem
                    label={saveLabel}
                    icon={<Cloud size={14} />}
                    detail={saveDetail}
                    disabled
                  />
                  {pendingLocalEditCount > 0 && (
                    <TopBarMenuItem
                      label={`${pendingLocalEditCount} queued local edit${pendingLocalEditCount === 1 ? '' : 's'}`}
                      icon={<FileText size={14} />}
                      detail={queuedEditDetail}
                      disabled
                    />
                  )}
                  {pendingLocalEditCount > 0 && (
                    <TopBarMenuItem
                      label="Review queued edits"
                      icon={<FileText size={14} />}
                      detail="Inspect local-only notes, save errors, and retry paths."
                      onClick={() => runStatusAction('queued-edits')}
                    />
                  )}
                  {networkOnline && pendingLocalEditCount > 0 && (
                    <TopBarMenuItem
                      label="Retry queued save"
                      icon={<Cloud size={14} />}
                      detail="Flush queued local edits without naming a version checkpoint."
                      onClick={() => runStatusAction('retry-save')}
                    />
                  )}
                  {selected?.type === 'note' && (
                    <TopBarMenuItem
                      label="Save current note"
                      icon={<Cloud size={14} />}
                      detail={networkOnline ? 'Flush pending edits and name a version checkpoint.' : 'Reconnect before flushing queued edits or naming a version checkpoint.'}
                      disabled={!networkOnline}
                      onClick={() => runStatusAction('manual-save')}
                    />
                  )}
                  {knownSyncConflictCount > 0 && (
                    <TopBarMenuItem
                      label={knownSyncConflictActionLabel}
                      icon={<ShieldCheck size={14} />}
                      detail="Open diagnostics to compare remote changes, keep local, or create a reviewed merge suggestion."
                      tone="danger"
                      onClick={() => runStatusAction('vault-status')}
                    />
                  )}
                  <TopBarMenuItem
                    label={!networkOnline ? 'Offline mode' : syncing ? 'Vault sync running' : error ? 'Vault sync unavailable' : 'Vault sync ready'}
                    icon={!networkOnline ? <CloudSlash size={14} /> : <Cloud size={14} />}
                    detail={!networkOnline ? 'Edits stay local and sync resumes when the device is online.' : error || 'Local vault cache and remote state are available.'}
                    disabled
                  />
                  {workspaceSyncState === 'error' && (
                    <>
                      <TopBarMenuItem
                        label="Workspace sync issue"
                        icon={<CloudSlash size={14} />}
                        detail={workspaceSyncDetail}
                        tone="danger"
                        disabled
                      />
                      <TopBarMenuItem
                        label="Retry workspace sync"
                        icon={<ArrowClockwise size={14} />}
                        detail="Write local workspace presets to the hidden vault sync note."
                        onClick={handleRetryWorkspaceSync}
                      />
                    </>
                  )}
                  {pinnedNotesSyncState === 'error' && (
                    <>
                      <TopBarMenuItem
                        label="Pinned-note sync issue"
                        icon={<CloudSlash size={14} />}
                        detail={pinnedNotesSyncDetail}
                        tone="danger"
                        disabled
                      />
                      <TopBarMenuItem
                        label="Retry pinned-note sync"
                        icon={<ArrowClockwise size={14} />}
                        detail="Write local pinned notes to the hidden vault sync note."
                        onClick={handleRetryPinnedNotesSync}
                      />
                    </>
                  )}
                  {savedSearchSyncState === 'error' && (
                    <>
                      <TopBarMenuItem
                        label="Saved-search sync issue"
                        icon={<CloudSlash size={14} />}
                        detail={savedSearchSyncDetail}
                        tone="danger"
                        disabled
                      />
                      <TopBarMenuItem
                        label="Retry saved-search sync"
                        icon={<ArrowClockwise size={14} />}
                        detail="Write local saved searches to the hidden vault sync note."
                        onClick={handleRetrySavedSearchSync}
                      />
                    </>
                  )}
                  {editorPreferencesSyncState === 'error' && (
                    <>
                      <TopBarMenuItem
                        label="Editor preferences sync issue"
                        icon={<CloudSlash size={14} />}
                        detail={editorPreferencesSyncDetail}
                        tone="danger"
                        disabled
                      />
                      <TopBarMenuItem
                        label="Retry editor preferences sync"
                        icon={<ArrowClockwise size={14} />}
                        detail="Write local editor preferences to the hidden vault sync note."
                        onClick={handleRetryEditorPreferencesSync}
                      />
                    </>
                  )}
                  <TopBarMenuItem
                    label="Refresh notes from vault"
                    icon={<ArrowClockwise size={14} />}
                    detail="Reload local vault documents now, including note bodies and folders."
                    onClick={() => runStatusAction('refresh-vault')}
                  />
                  <TopBarMenuItem label="Sync diagnostics" icon={<ShieldCheck size={14} />} detail="Inspect local save queue, sync ledger, and vault privacy status." onClick={() => runStatusAction('vault-status')} />
                  <TopBarMenuItem label="Recovered drafts" icon={<FileText size={14} />} detail={`${recoverableDraftCount} unsynced local draft${recoverableDraftCount === 1 ? '' : 's'}`} onClick={() => runStatusAction('recovered-drafts')} />
                  {selected?.type === 'note' && localCollabSupported && (
                    <>
                      <TopBarMenuSection label="Collaboration" />
                      <TopBarMenuItem
                        label={localCollabSyncing ? 'Collab syncing...' : `Sync local collab (${localCollabProviderSummary.label})`}
                        icon={<Cloud size={14} />}
                        detail={localCollabLastSyncError || localCollabProviderSummary.detail || 'Layered local and remote collaboration transports.'}
                        disabled={localCollabSyncing}
                        onClick={() => runStatusAction('sync')}
                      />
                      {localCollabPeers.length > 0 && (
                        <TopBarMenuItem
                          label={`${localCollabPeers.length} local editor${localCollabPeers.length === 1 ? '' : 's'}`}
                          icon={<ChatCircleText size={14} />}
                          detail={localCollabPeers.map(peer => peer.name).join(', ')}
                          disabled
                        />
                      )}
                      {localCollabDrafts.length > 0 && (
                        <TopBarMenuItem
                          label={`Review ${localCollabDrafts.length} incoming draft${localCollabDrafts.length === 1 ? '' : 's'}`}
                          icon={<FileText size={14} />}
                          onClick={() => runStatusAction('drafts')}
                        />
                      )}
                    </>
                  )}
                  {selected && (
                    <>
                      <TopBarMenuSection label="Current note" />
                      <TopBarMenuItem
                        label={selected.title || 'Untitled'}
                        icon={<FileText size={14} />}
                        detail={selected._id}
                        disabled
                      />
                      <TopBarMenuItem
                        label={selectedFolderLabel}
                        icon={<FolderOpen size={14} />}
                        detail={selected.type === 'attachment' ? 'Attachment folder' : 'Folder'}
                        disabled
                      />
                      {selected.type === 'note' && (
                        <>
                          <TopBarMenuItem
                            label="Rename note"
                            icon={<NotePencil size={14} />}
                            onClick={() => {
                              setTopBarMenu(null)
                              setTitleDraft(selected.title)
                              setEditingTitle(true)
                              setTimeout(() => titleRef.current?.focus(), 20)
                            }}
                          />
                          <TopBarMenuItem label={pinnedNoteSet.has(selected._id) ? 'Unpin current note' : 'Pin current note'} icon={<Star size={14} />} onClick={() => runMoreAction('pin')} />
                          <TopBarMenuItem
                            label="Reveal in file tree"
                            icon={<FolderOpen size={14} />}
                            detail={focusMode ? 'Show the file tree with this note selected.' : selected.folder || 'Vault root'}
                            onClick={() => runMoreAction('reveal-file-tree')}
                          />
                          <TopBarMenuItem
                            label="Open in side pane"
                            icon={<SquaresFour size={14} />}
                            detail="Split this note beside the editor."
                            onClick={() => runMoreAction('open-current-side-pane')}
                          />
                          <TopBarMenuSection label="Copy links" />
                          <TopBarMenuItem label="Copy wikilink" icon={<Copy size={14} />} onClick={() => runMoreAction('copy-wikilink')} />
                          <TopBarMenuItem label="Copy note embed" icon={<Copy size={14} />} onClick={() => runMoreAction('copy-embed')} />
                          <TopBarMenuItem label="Copy note path" icon={<Copy size={14} />} onClick={() => runMoreAction('copy-path')} />
                          <TopBarMenuSection label="References" />
                          <TopBarMenuItem label="Open references" icon={<GitBranch size={14} />} onClick={() => runMoreAction('references')} />
                          <TopBarMenuItem label="Open local graph" icon={<GitBranch size={14} />} onClick={() => runMoreAction('local-graph')} />
                          <TopBarMenuItem label="Insert block ID" icon={<GitBranch size={14} />} onClick={() => runMoreAction('insert-block-id')} />
                          <TopBarMenuItem label="Copy block reference" icon={<Copy size={14} />} onClick={() => runMoreAction('copy-block-reference')} />
                          <TopBarMenuItem label="Copy heading reference" icon={<Copy size={14} />} onClick={() => runMoreAction('copy-heading-reference')} />
                        </>
                      )}
                    </>
                  )}
                  <TopBarMenuSection label="Workspace" />
                  <TopBarMenuItem
                    label="Open command palette"
                    icon={<ListBullets size={14} />}
                    detail="Search notes, run commands, and jump across the vault."
                    onClick={() => {
                      setCommandOpen(true)
                      setCommandQuery('')
                      setTopBarMenu(null)
                    }}
                  />
                  <TopBarMenuItem
                    label="Keyboard shortcuts"
                    icon={<FileText size={14} />}
                    detail="Open the Notes shortcut reference."
                    onClick={() => {
                      setShortcutsOpen(true)
                      setTopBarMenu(null)
                    }}
                  />
                  <TopBarMenuItem
                    label={focusMode ? 'Show file tree' : 'Hide file tree'}
                    icon={<PenNib size={14} />}
                    detail={focusMode ? 'Bring back the file tree sidebar.' : 'Enter a cleaner writing layout.'}
                    onClick={() => {
                      setFocusMode(prev => !prev)
                      setTopBarMenu(null)
                    }}
                  />
                  {!focusMode && (
                    <>
                      <TopBarMenuItem
                        label="Narrow file tree"
                        icon={<FolderOpen size={14} />}
                        detail={`${treeWidth}px wide`}
                        onClick={() => handleAdjustFileTreeWidth('narrow')}
                      />
                      <TopBarMenuItem
                        label="Widen file tree"
                        icon={<FolderOpen size={14} />}
                        detail={`${treeWidth}px wide`}
                        onClick={() => handleAdjustFileTreeWidth('widen')}
                      />
                      <TopBarMenuItem
                        label="Reset file tree width"
                        icon={<FolderOpen size={14} />}
                        detail={`${DEFAULT_FILE_TREE_WIDTH}px default`}
                        onClick={() => handleAdjustFileTreeWidth('reset')}
                      />
                    </>
                  )}
                  <TopBarMenuItem
                    label={infoPanelOpen ? 'Hide document info' : 'Show document info'}
                    icon={<FileText size={14} />}
                    detail={selected ? 'Toggle the right document metadata sidebar.' : 'Select a note to inspect metadata.'}
                    disabled={!selected}
                    onClick={() => {
                      setInfoPanelOpen(prev => !prev)
                      setTopBarMenu(null)
                    }}
                  />
                  <TopBarMenuItem
                    label="Close sidebars"
                    icon={<PenNib size={14} />}
                    detail="Hide the file tree and document info sidebars."
                    onClick={() => {
                      setFocusMode(true)
                      setInfoPanelOpen(false)
                      setTopBarMenu(null)
                    }}
                  />
                  {workspaceSidePaneNote && (
                    <>
                      <TopBarMenuItem
                        label="Swap primary and side pane"
                        icon={<SquaresFour size={14} />}
                        detail={workspaceSidePaneNote.title || workspaceSidePaneNote._id}
                        onClick={handlePromoteWorkspaceSidePane}
                      />
                      <TopBarMenuItem
                        label="Close side pane"
                        icon={<X size={14} />}
                        detail={workspaceSidePaneNote.title || workspaceSidePaneNote._id}
                        onClick={handleCloseWorkspaceSidePane}
                      />
                      <TopBarMenuItem
                        label="Narrow side pane"
                        icon={<SquaresFour size={14} />}
                        detail={`${workspaceSidePanePixelWidth}px wide`}
                        onClick={() => handleAdjustWorkspaceSidePaneWidth('narrow')}
                      />
                      <TopBarMenuItem
                        label="Widen side pane"
                        icon={<SquaresFour size={14} />}
                        detail={`${workspaceSidePanePixelWidth}px wide`}
                        onClick={() => handleAdjustWorkspaceSidePaneWidth('widen')}
                      />
                      <TopBarMenuItem
                        label="Reset side pane width"
                        icon={<SquaresFour size={14} />}
                        detail={`${DEFAULT_WORKSPACE_SIDE_PANE_WIDTH}px default`}
                        onClick={() => handleAdjustWorkspaceSidePaneWidth('reset')}
                      />
                    </>
                  )}
                  {workspaceTabNotes.length > 0 && (
                    <>
                      <TopBarMenuSection label="Open tabs" />
                      {workspaceTabNotes.map(note => {
                        const isActivePrimaryNote = selectedId === note._id
                        return (
                          <Fragment key={`compact-workspace-tab-${note._id}`}>
                              <TopBarMenuItem
                                label={`Switch tab: ${note.title || 'Untitled'}`}
                                icon={<FileText size={14} />}
                                detail={workspaceTabNotes.length > 1 ? `${note.folder || 'Vault root'} · Drag or Alt+Up/Down to reorder` : note.folder || 'Vault root'}
                                active={isActivePrimaryNote}
                                draggable={workspaceTabNotes.length > 1}
                                onDragStart={event => {
                                  event.dataTransfer.setData(WORKSPACE_TAB_DRAG_TYPE, note._id)
                                  event.dataTransfer.effectAllowed = 'move'
                                }}
                                onDragOver={event => {
                                  if (workspaceTabNotes.length <= 1) return
                                  event.preventDefault()
                                  event.dataTransfer.dropEffect = 'move'
                                }}
                                onDrop={event => {
                                  event.preventDefault()
                                  handleReorderWorkspaceTab(event.dataTransfer.getData(WORKSPACE_TAB_DRAG_TYPE), note._id)
                                }}
                                onKeyDown={event => {
                                  if (!event.altKey || workspaceTabNotes.length <= 1) return
                                  if (event.key === 'ArrowUp') {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    handleMoveWorkspaceTab(note._id, 'earlier')
                                  }
                                  if (event.key === 'ArrowDown') {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    handleMoveWorkspaceTab(note._id, 'later')
                                  }
                                }}
                                onClick={() => handleOpenWorkspaceNote(note._id)}
                              />
                            <TopBarMenuItem
                              label={`Open in side pane: ${note.title || 'Untitled'}`}
                              icon={<SquaresFour size={14} />}
                              detail={isActivePrimaryNote ? 'Split the current note to the side.' : note.folder || 'Vault root'}
                              active={workspaceSidePaneNote?._id === note._id}
                              onClick={() => handleOpenWorkspaceSidePane(note._id)}
                            />
                            <TopBarMenuItem
                              label={`Close tab: ${note.title || 'Untitled'}`}
                              icon={<DotsThree size={14} />}
                              detail="Remove from this local workspace stack."
                              onClick={() => handleCloseWorkspaceTab(note._id)}
                            />
                          </Fragment>
                        )
                      })}
                      {selectedId && workspaceTabNotes.length > 1 && (
                        <>
                          <TopBarMenuItem
                            label="Move current tab earlier"
                            icon={<DotsThree size={14} />}
                            detail="Reorder the active tab toward the top."
                            onClick={() => handleMoveWorkspaceTab(selectedId, 'earlier')}
                          />
                          <TopBarMenuItem
                            label="Move current tab later"
                            icon={<DotsThree size={14} />}
                            detail="Reorder the active tab toward the bottom."
                            onClick={() => handleMoveWorkspaceTab(selectedId, 'later')}
                          />
                          <TopBarMenuItem
                            label="Close other tabs"
                            icon={<DotsThree size={14} />}
                            detail="Keep the active note tab in this workspace."
                            onClick={handleCloseOtherWorkspaceTabs}
                          />
                        </>
                      )}
                      <TopBarMenuItem
                        label="Close all tabs"
                        icon={<DotsThree size={14} />}
                        detail="Clear this local workspace tab stack."
                        tone="danger"
                        onClick={handleCloseAllWorkspaceTabs}
                      />
                    </>
                  )}
                  <TopBarMenuSection label="Workspace snapshot" />
                  <TopBarMenuItem
                    label="Save current workspace"
                    icon={<ShieldCheck size={14} />}
                    detail="Capture view, sidebar, info panel, width, and active note."
                    onClick={handleSaveWorkspaceSnapshot}
                  />
                  <TopBarMenuItem
                    label="Restore saved workspace"
                    icon={<UploadSimple size={14} />}
                    detail={workspaceSnapshot ? `Saved ${new Date(workspaceSnapshot.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'No saved workspace yet.'}
                    disabled={!workspaceSnapshot}
                    onClick={handleRestoreWorkspaceSnapshot}
                  />
                  <TopBarMenuItem
                    label={workspaceSyncLabel}
                    icon={workspaceSyncState === 'error' ? <CloudSlash size={14} /> : <Cloud size={14} />}
                    detail={workspaceSyncDetail}
                    disabled
                  />
                  {normalizedWorkspaceSnapshots.length > 0 && (
                    <>
                      <TopBarMenuSection label="Saved workspaces" />
                      {normalizedWorkspaceSnapshots.map(snapshot => {
                        const snapshotName = snapshot.name || `${viewModeLabel(snapshot.viewMode)} workspace`
                        const snapshotKey = workspaceSnapshotKey(snapshot)
                        return (
                          <Fragment key={`compact-workspace-snapshot-${snapshotKey}`}>
                            <TopBarMenuItem
                              label={`Restore workspace: ${snapshotName}`}
                              icon={<UploadSimple size={14} />}
                              detail={`${viewModeLabel(snapshot.viewMode)} view, saved ${new Date(snapshot.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                              active={!!workspaceSnapshot && workspaceSnapshotKey(workspaceSnapshot) === snapshotKey}
                              onClick={() => handleRestoreNamedWorkspaceSnapshot(snapshot)}
                            />
                            <TopBarMenuItem
                              label={`Rename workspace: ${snapshotName}`}
                              icon={<NotePencil size={14} />}
                              detail="Rename this local layout preset."
                              onClick={() => handleRenameWorkspaceSnapshot(snapshot)}
                            />
                            <TopBarMenuItem
                              label={`Delete workspace: ${snapshotName}`}
                              icon={<Trash size={14} />}
                              detail="Remove this local workspace preset."
                              tone="danger"
                              onClick={() => handleDeleteWorkspaceSnapshot(snapshot)}
                            />
                          </Fragment>
                        )
                      })}
                    </>
                  )}
                  <TopBarMenuSection label="Pinned sync" />
                  <TopBarMenuItem
                    label={pinnedNotesSyncLabel}
                    icon={pinnedNotesSyncState === 'error' ? <CloudSlash size={14} /> : <Cloud size={14} />}
                    detail={pinnedNotesSyncDetail}
                    disabled
                  />
                  {pinnedWorkspaceNotes.length > 0 && (
                    <>
                      <TopBarMenuSection label="Pinned notes" />
                      {pinnedWorkspaceNotes.map(note => (
                        <TopBarMenuItem
                          key={`compact-workspace-pinned-${note._id}`}
                          label={note.title || 'Untitled'}
                          icon={<Star size={14} />}
                          detail={note.folder || 'Vault root'}
                          active={selectedId === note._id}
                          onClick={() => handleOpenWorkspaceNote(note._id)}
                        />
                      ))}
                    </>
                  )}
                  {recentWorkspaceNotes.length > 0 && (
                    <>
                      <TopBarMenuSection label="Recent notes" />
                      {recentWorkspaceNotes.map(note => (
                        <TopBarMenuItem
                          key={`compact-workspace-recent-${note._id}`}
                          label={note.title || 'Untitled'}
                          icon={<NotePencil size={14} />}
                          detail={note.folder || 'Vault root'}
                          active={selectedId === note._id}
                          onClick={() => handleOpenWorkspaceNote(note._id)}
                        />
                      ))}
                    </>
                  )}
                  <TopBarMenuSection label="Create" />
                  <TopBarMenuItem label="New note" icon={<NotePencil size={14} />} onClick={() => runMoreAction('new-note')} />
                  <TopBarMenuItem label="New daily note" icon={<NotePencil size={14} />} onClick={() => runMoreAction('daily')} />
                  <TopBarMenuItem label="Yesterday's daily note" icon={<NotePencil size={14} />} onClick={() => runMoreAction('daily-yesterday')} />
                  <TopBarMenuItem label="Tomorrow's daily note" icon={<NotePencil size={14} />} onClick={() => runMoreAction('daily-tomorrow')} />
                  <TopBarMenuItem label="Daily note by date" icon={<NotePencil size={14} />} onClick={() => runMoreAction('daily-date')} />
                  <TopBarMenuItem label="This week note" icon={<NotePencil size={14} />} onClick={() => runMoreAction('weekly')} />
                  <TopBarMenuItem label="This month note" icon={<NotePencil size={14} />} onClick={() => runMoreAction('monthly')} />
                  <TopBarMenuItem label="New folder" icon={<FolderPlus size={14} />} onClick={() => runMoreAction('folder')} />
                  <TopBarMenuItem label="Import clipboard clip" icon={<UploadSimple size={14} />} onClick={() => runMoreAction('clip')} />
                  <TopBarMenuSection label="View" />
                  <TopBarMenuItem label="Editor" icon={<FileText size={14} />} active={viewMode === 'editor'} onClick={() => runViewAction('editor')} />
                  <TopBarMenuItem label="Graph" icon={<GitBranch size={14} />} active={viewMode === 'graph'} onClick={() => runViewAction('graph')} />
                  <TopBarMenuItem label="Data" icon={<Table size={14} />} active={viewMode === 'data'} onClick={() => runViewAction('data')} />
                  <TopBarMenuItem label="Canvas" icon={<SquaresFour size={14} />} active={viewMode === 'canvas'} onClick={() => runViewAction('canvas')} />
                  {selected?.type === 'note' && (
                    <>
                      <TopBarMenuSection label="Review and info" />
                      <TopBarMenuItem label="Open outline" icon={<ListBullets size={14} />} detail={`${selectedOutlineHeadings.length} heading${selectedOutlineHeadings.length === 1 ? '' : 's'}`} onClick={() => runMoreAction('outline')} />
                      <TopBarMenuItem label="Version history" icon={<GitBranch size={14} />} onClick={() => runMoreAction('versions')} />
                      <TopBarMenuItem label="Comments" icon={<ChatCircleText size={14} />} onClick={() => runMoreAction('comments')} />
                      <TopBarMenuItem label="Suggestions" icon={<PenNib size={14} />} onClick={() => runMoreAction('suggest')} />
                      <TopBarMenuItem label="Assist writing" icon={<PenNib size={14} />} onClick={() => runMoreAction('assist-writing')} />
                      <TopBarMenuItem label="Word count" icon={<FileText size={14} />} onClick={() => runMoreAction('word-count')} />
                      <TopBarMenuItem label="Document info" icon={<FileText size={14} />} onClick={() => runMoreAction('info')} />
                      <TopBarMenuSection label="Export and share" />
                      <TopBarMenuItem label="Export DOCX" icon={<FileDoc size={14} />} onClick={() => runMoreAction('docx')} />
                      <TopBarMenuItem label="Print / PDF" icon={<FilePdf size={14} />} onClick={() => runMoreAction('pdf')} />
                      <TopBarMenuItem label="Export Markdown" icon={<FileText size={14} />} onClick={() => runMoreAction('markdown')} />
                      <TopBarMenuItem label="Export HTML" icon={<FileHtml size={14} />} onClick={() => runMoreAction('html')} />
                      <TopBarMenuItem label="Publish static site" icon={<ShareNetwork size={14} />} onClick={() => runMoreAction('publish-site')} />
                      <TopBarMenuItem label="Private share package" icon={<ShareNetwork size={14} />} onClick={() => runMoreAction('share')} />
                    </>
                  )}
                  {selected && <TopBarMenuSection label="Trash" />}
                  {selected && isNoteInTrash(selected) && <TopBarMenuItem label="Restore from Trash" icon={<UploadSimple size={14} />} onClick={() => runMoreAction('restore')} />}
                  {selected && (
                    <TopBarMenuItem
                      label={isNoteInTrash(selected) ? 'Delete permanently' : 'Move to Trash'}
                      icon={<Trash size={14} />}
                      tone="danger"
                      onClick={() => runMoreAction('trash')}
                    />
                  )}
                </TopBarMenuButton>
              ) : (
                <>
                  <TopBarMenuButton
	                    label="Create note actions"
	                    icon={<Plus size={15} weight="bold" />}
	                    searchable
	                    searchLabel="Filter create actions"
	                    searchPlaceholder="Filter create..."
	                    open={topBarMenu === 'create'}
	                    onToggle={() => setTopBarMenu(topBarMenu === 'create' ? null : 'create')}
	                  >
                    <TopBarMenuItem label="New note" icon={<NotePencil size={14} />} onClick={() => runMoreAction('new-note')} />
                    <TopBarMenuItem label="New daily note" icon={<NotePencil size={14} />} onClick={() => runMoreAction('daily')} />
                    <TopBarMenuItem label="Yesterday's daily note" icon={<NotePencil size={14} />} onClick={() => runMoreAction('daily-yesterday')} />
                    <TopBarMenuItem label="Tomorrow's daily note" icon={<NotePencil size={14} />} onClick={() => runMoreAction('daily-tomorrow')} />
                    <TopBarMenuItem label="Daily note by date" icon={<NotePencil size={14} />} onClick={() => runMoreAction('daily-date')} />
                    <TopBarMenuItem label="This week note" icon={<NotePencil size={14} />} onClick={() => runMoreAction('weekly')} />
                    <TopBarMenuItem label="This month note" icon={<NotePencil size={14} />} onClick={() => runMoreAction('monthly')} />
                    <TopBarMenuItem label="New folder" icon={<FolderPlus size={14} />} onClick={() => runMoreAction('folder')} />
                    <TopBarMenuItem label="Import clipboard clip" icon={<UploadSimple size={14} />} onClick={() => runMoreAction('clip')} />
                  </TopBarMenuButton>
                  <TopBarMenuButton
                    label="Notes view"
                    icon={viewModeIcon}
                    open={topBarMenu === 'view'}
                    onToggle={() => setTopBarMenu(topBarMenu === 'view' ? null : 'view')}
                  >
                    <TopBarMenuItem label="Editor" icon={<FileText size={14} />} active={viewMode === 'editor'} onClick={() => runViewAction('editor')} />
                    <TopBarMenuItem label="Graph" icon={<GitBranch size={14} />} active={viewMode === 'graph'} onClick={() => runViewAction('graph')} />
                    <TopBarMenuItem label="Data" icon={<Table size={14} />} active={viewMode === 'data'} onClick={() => runViewAction('data')} />
                    <TopBarMenuItem label="Canvas" icon={<SquaresFour size={14} />} active={viewMode === 'canvas'} onClick={() => runViewAction('canvas')} />
                  </TopBarMenuButton>
	                  <TopBarMenuButton
	                    label="More note actions"
	                    icon={<DotsThree size={16} weight="bold" />}
	                    searchable
	                    searchLabel="Filter more note actions"
	                    searchPlaceholder="Filter actions..."
	                    open={topBarMenu === 'more'}
	                    onToggle={() => setTopBarMenu(topBarMenu === 'more' ? null : 'more')}
	                  >
                    {selected?.type === 'note' && (
                      <>
                      <TopBarMenuSection label="Review and info" />
                      <TopBarMenuItem label="Open outline" icon={<ListBullets size={14} />} detail={`${selectedOutlineHeadings.length} heading${selectedOutlineHeadings.length === 1 ? '' : 's'}`} onClick={() => runMoreAction('outline')} />
                        <TopBarMenuItem label="Version history" icon={<GitBranch size={14} />} onClick={() => runMoreAction('versions')} />
                        <TopBarMenuItem label="Comments" icon={<ChatCircleText size={14} />} onClick={() => runMoreAction('comments')} />
                        <TopBarMenuItem label="Suggestions" icon={<PenNib size={14} />} onClick={() => runMoreAction('suggest')} />
                        <TopBarMenuItem label="Assist writing" icon={<PenNib size={14} />} onClick={() => runMoreAction('assist-writing')} />
                        <TopBarMenuItem label="Word count" icon={<FileText size={14} />} onClick={() => runMoreAction('word-count')} />
                        <TopBarMenuItem label="Document info" icon={<FileText size={14} />} onClick={() => runMoreAction('info')} />
                        <TopBarMenuSection label="Export and share" />
                        <TopBarMenuItem label="Export DOCX" icon={<FileDoc size={14} />} onClick={() => runMoreAction('docx')} />
                        <TopBarMenuItem label="Print / PDF" icon={<FilePdf size={14} />} onClick={() => runMoreAction('pdf')} />
                        <TopBarMenuItem label="Export Markdown" icon={<FileText size={14} />} onClick={() => runMoreAction('markdown')} />
                        <TopBarMenuItem label="Export HTML" icon={<FileHtml size={14} />} onClick={() => runMoreAction('html')} />
                        <TopBarMenuItem label="Publish static site" icon={<ShareNetwork size={14} />} onClick={() => runMoreAction('publish-site')} />
                        <TopBarMenuItem label="Private share package" icon={<ShareNetwork size={14} />} onClick={() => runMoreAction('share')} />
                      </>
                    )}
                    {selected && <TopBarMenuSection label="Trash" />}
                    {selected && isNoteInTrash(selected) && <TopBarMenuItem label="Restore from Trash" icon={<UploadSimple size={14} />} onClick={() => runMoreAction('restore')} />}
                    {selected && (
                      <TopBarMenuItem
                        label={isNoteInTrash(selected) ? 'Delete permanently' : 'Move to Trash'}
                        icon={<Trash size={14} />}
                        tone="danger"
                        onClick={() => runMoreAction('trash')}
                      />
                    )}
                  </TopBarMenuButton>
                </>
              )}
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {notes.length === 0 && unavailableNotes.length > 0 ? (
              <UnavailableNotesState count={unavailableNotes.length} onRetry={() => void refresh()} />
            ) : viewMode === 'editor' ? (
              selected ? (
                selected.type === 'attachment' ? (
                  <AttachmentPreview id={selected._id} />
                ) : (
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
                    <div style={{ flex: '1 1 58%', minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <NoteEditor
                        note={selected}
                        onChange={handleContentChange}
                        onWikilinkClick={handleWikilinkClick}
                        preferences={normalizedEditorPreferences}
                        onSelectionChange={handleSelectionAnchorChange}
                        reviewMarkers={reviewMarkers}
                        activeReviewId={activeReviewId}
                        onReviewMarkerSelect={setActiveReviewId}
                        allNoteTitles={allNoteTitles}
                        allNotes={notes}
                        jumpToLineRequest={editorJumpRequest}
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
                        onLinkAllMentions={handleLinkAllUnlinkedMentions}
                        collapsed={referencesPanelCollapsed}
                        onCollapsedChange={setReferencesPanelCollapsed}
                        openRequest={backlinksOpenRequest}
                      />
                    </div>
                    {workspaceSidePaneNote && (
                      <>
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          aria-label="Resize workspace side pane"
                          aria-valuemin={MIN_WORKSPACE_SIDE_PANE_WIDTH}
                          aria-valuemax={MAX_WORKSPACE_SIDE_PANE_WIDTH}
                          aria-valuenow={workspaceSidePanePixelWidth}
                          aria-valuetext={`${workspaceSidePanePixelWidth} pixels wide`}
                          tabIndex={0}
                          onMouseDown={handleSidePaneResize}
                          onKeyDown={handleSidePaneResizeKeyDown}
                          style={{
                            width: 6,
                            flex: '0 0 6px',
                            cursor: 'col-resize',
                            borderLeft: '1px solid var(--border)',
                            background: 'transparent',
                          }}
                        />
                        <aside
                          data-testid="workspace-side-pane"
                          aria-label="Workspace side pane"
                          style={{
                            flex: `0 0 ${workspaceSidePanePixelWidth}px`,
                            width: workspaceSidePanePixelWidth,
                            minWidth: MIN_WORKSPACE_SIDE_PANE_WIDTH,
                            maxWidth: MAX_WORKSPACE_SIDE_PANE_WIDTH,
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            background: 'var(--bg-base)',
                          }}
                        >
                        <div
                          style={{
                            minHeight: 36,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '4px 8px',
                            borderBottom: '1px solid var(--border)',
                            background: 'color-mix(in srgb, var(--bg-base) 94%, black)',
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                color: 'var(--text-primary)',
                                fontSize: 12,
                                fontWeight: 650,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {workspaceSidePaneNote.title || 'Untitled'}
                            </div>
                            <div
                              style={{
                                color: 'var(--text-muted)',
                                fontSize: 10,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {workspaceSidePaneNote.folder || 'Vault root'}
                            </div>
                          </div>
                          <button
                            type="button"
                            aria-label="Make side pane primary"
                            title="Make side pane primary"
                            className="hover-bg"
                            onClick={handlePromoteWorkspaceSidePane}
                            style={{
                              width: 28,
                              height: 28,
                              border: '1px solid transparent',
                              borderRadius: 'var(--radius-sm)',
                              background: 'transparent',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                            }}
                          >
                            <FileText size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label="Close workspace side pane"
                            title="Close workspace side pane"
                            className="hover-bg"
                            onClick={handleCloseWorkspaceSidePane}
                            style={{
                              width: 28,
                              height: 28,
                              border: '1px solid transparent',
                              borderRadius: 'var(--radius-sm)',
                              background: 'transparent',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                            }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <NoteEditor
                          note={workspaceSidePaneNote}
                          onChange={handleSidePaneContentChange}
                          onWikilinkClick={handleWikilinkClick}
                          preferences={normalizedEditorPreferences}
                          allNoteTitles={allNoteTitles}
                          allNotes={notes}
                        />
                        </aside>
                      </>
                    )}
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
                syncPresets
                workspaceContext={dataWorkspaceContext}
                onWorkspaceContextChange={setDataWorkspaceContext}
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
                onRenameProperty={key => {
                  handleRenameDocumentProperty(key)
                }}
                onRemoveProperty={key => {
                  void saveDocumentProperty(key, '', 'remove')
                }}
                onOpenAllProperties={() => setPropertiesIndexOpen(true)}
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
          onCopyToCurrent={handleCopyRevisionToCurrent}
          onRestore={handleRestoreRevision}
          onClose={() => setHistoryOpen(false)}
        />
      )}
      {versionNameRequest && (
        <VersionNameDialog
          request={versionNameRequest}
          loading={historyLoading}
          onSubmit={name => {
            void handleSubmitVersionName(name)
          }}
          onCancel={() => setVersionNameRequest(null)}
        />
      )}
      {documentPropertyRequest && (
        <DocumentPropertyDialog
          request={documentPropertyRequest}
          onSubmit={(key, value, sourceKey) => {
            void handleSubmitDocumentProperty(key, value, sourceKey)
          }}
          onCancel={() => setDocumentPropertyRequest(null)}
        />
      )}
      {reviewPackageRequest && (
        <ReviewPackageDialog
          request={reviewPackageRequest}
          onSubmit={(permission, recipient) => {
            void handleSubmitReviewPackage(permission, recipient)
          }}
          onCancel={() => setReviewPackageRequest(null)}
        />
      )}
      {pluginMarketplaceFeedRequest && (
        <PluginMarketplaceFeedDialog
          request={pluginMarketplaceFeedRequest}
          onSubmit={url => {
            void handleSubmitPluginMarketplaceFeed(url)
          }}
          onCancel={() => setPluginMarketplaceFeedRequest(null)}
        />
      )}
      {encryptedBackupRequest && (
        <EncryptedBackupPasswordDialog
          request={encryptedBackupRequest}
          onSubmit={password => {
            if (encryptedBackupRequest.mode === 'export') {
              void handleSubmitEncryptedBackup(password)
            } else {
              void handleSubmitEncryptedVaultImport(password)
            }
          }}
          onCancel={() => setEncryptedBackupRequest(null)}
        />
      )}
      {confirmActionRequest && (
        <ConfirmActionDialog
          request={confirmActionRequest}
          onCancel={() => setConfirmActionRequest(null)}
          onSettled={() => setConfirmActionRequest(null)}
        />
      )}
      {noticeRequest && (
        <NoticeDialog
          request={noticeRequest}
          onClose={() => setNoticeRequest(null)}
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
          onDraftReply={handleDraftReplyToComment}
          onJump={handleJumpToReviewAnchor}
          onClose={() => setCommentsOpen(false)}
        />
      )}
      {commentComposeRequest && (
        <CommentComposeDialog
          request={commentComposeRequest}
          loading={commentsLoading}
          onSubmit={body => {
            void handleSubmitCommentCompose(body)
          }}
          onCancel={() => setCommentComposeRequest(null)}
        />
      )}
      {suggestionsOpen && (
        <SuggestionsDialog
          noteTitle={selected?.title || 'Note'}
          suggestions={noteSuggestions}
          comments={noteComments}
          loading={suggestionsLoading}
          error={suggestionsError}
          onAdd={handleAddSuggestion}
          onComment={handleCommentOnSuggestion}
          onResolveComment={handleResolveComment}
          onReplyToComment={handleReplyToComment}
          onDraftReplyToComment={handleDraftReplyToComment}
          onApply={handleApplySuggestion}
          onReject={handleRejectSuggestion}
          onApplyAll={handleApplyAllSuggestions}
          onRejectAll={handleRejectAllSuggestions}
          onJump={handleJumpToReviewAnchor}
          onClose={() => setSuggestionsOpen(false)}
        />
      )}
      {suggestionComposeRequest && (
        <SuggestionComposeDialog
          request={suggestionComposeRequest}
          loading={suggestionsLoading}
          onSubmit={(content, body) => {
            void handleSubmitSuggestionCompose(content, body)
          }}
          onCancel={() => setSuggestionComposeRequest(null)}
        />
      )}
      {writingAssistRequest && (
        <WritingAssistDialog
          request={writingAssistRequest}
          defaultControls={writingAssistDefaults}
          loading={suggestionsLoading}
          error={suggestionsError}
          onControlsChange={updateWritingAssistDefaults}
          onCreate={option => {
            void handleCreateWritingAssistSuggestion(option)
          }}
          onCancel={() => setWritingAssistRequest(null)}
        />
      )}
      {vaultStatusOpen && (
        <VaultStatusDialog
          status={vaultStatus}
          auditEvents={vaultAuditEvents}
          syncLedger={vaultSyncLedger}
          notes={notes}
          loading={vaultStatusLoading}
          error={vaultStatusError}
          onRefresh={handleOpenVaultStatus}
          onOpenNote={handleOpenDiagnosticsNote}
          onSuggestRemote={handleSuggestRemoteConflictVersion}
          onReviewMerge={handleReviewSyncConflictMerge}
          onKeepLocal={handleKeepLocalSyncConflictVersion}
          onClose={() => setVaultStatusOpen(false)}
        />
      )}
      {mergeConflictReviewRequest && (
        <SyncConflictMergeDialog
          request={mergeConflictReviewRequest}
          saving={suggestionsLoading}
          onCreate={content => {
            void handleSubmitSyncConflictMergeReview(content)
          }}
          onCancel={() => setMergeConflictReviewRequest(null)}
        />
      )}
      {queuedEditsOpen && (
        <QueuedEditsDialog
          edits={pendingLocalEdits}
          online={networkOnline}
          saving={saveState === 'saving'}
          onRetry={() => void handleRetryQueuedSave()}
          onOpenNote={handleOpenQueuedEdit}
          onOpenDiagnostics={() => {
            setQueuedEditsOpen(false)
            void handleOpenVaultStatus()
          }}
          onClose={() => setQueuedEditsOpen(false)}
        />
      )}
      {shortcutsOpen && <NotesShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      {wordCountOpen && selectedWordStats && (
        <TopBarWordCountDialog
          stats={selectedWordStats}
          selectionStats={selectedWordSelectionStats}
          onClose={() => setWordCountOpen(false)}
        />
      )}
      {propertiesIndexOpen && (
        <AllPropertiesDialog
          notes={notes}
          onOpenNote={id => {
            setPropertiesIndexOpen(false)
            if (selectedId && selectedId !== id) void flushPendingSave(selectedId)
            setSelectedId(id)
            setViewMode('editor')
          }}
          onEditProperty={(noteId, key) => handleOpenIndexedDocumentProperty(noteId, key, 'set')}
          onRenameProperty={(noteId, key) => handleOpenIndexedDocumentProperty(noteId, key, 'rename')}
          onRemoveProperty={(noteId, key) => handleOpenIndexedDocumentProperty(noteId, key, 'remove')}
          onClose={() => setPropertiesIndexOpen(false)}
        />
      )}
      {tagsIndexOpen && (
        <AllTagsDialog
          notes={notes}
          onOpenNote={id => {
            setTagsIndexOpen(false)
            if (selectedId && selectedId !== id) void flushPendingSave(selectedId)
            setSelectedId(id)
            setViewMode('editor')
          }}
          onRenameTag={tag => {
            setTagsIndexOpen(false)
            handleRenameTag(tag)
          }}
          onRemoveTag={tag => {
            setTagsIndexOpen(false)
            handleRemoveTag(tag)
          }}
          currentNote={selected?.type === 'note' ? selected : null}
          onApplyTagToCurrent={tag => {
            void handleApplyTagToCurrentNote(tag)
          }}
          onFilterTag={tag => {
            setTagsIndexOpen(false)
            setSearchQuery(`tag:${tag}`)
          }}
          onClose={() => setTagsIndexOpen(false)}
        />
      )}
      {activeOutlineOpen && selected?.type === 'note' && (
        <ActiveNoteOutlineDialog
          noteTitle={selected.title || 'Untitled'}
          headings={selectedOutlineHeadings}
          onJump={handleJumpToOutlineHeading}
          onClose={() => setActiveOutlineOpen(false)}
        />
      )}
      {dailyDatePickerOpen && (
        <DailyDatePickerDialog
          preferences={normalizedEditorPreferences}
          onOpenDate={date => {
            setDailyDatePickerOpen(false)
            void handleCreateDailyNote(selected?.folder, date)
          }}
          onClose={() => setDailyDatePickerOpen(false)}
        />
      )}
      {templatePromptRequest && (
        <TemplatePromptDialog
          request={templatePromptRequest}
          onSubmit={values => resolveTemplatePromptRequest(values)}
          onCancel={() => resolveTemplatePromptRequest(null)}
        />
      )}
      {templateNameRequest && (
        <TemplateNameDialog
          request={templateNameRequest}
          onSubmit={name => {
            void handleSubmitSaveCurrentAsTemplate(name)
          }}
          onCancel={() => setTemplateNameRequest(null)}
        />
      )}
      {tagRenameRequest && (
        <TagRenameDialog
          request={tagRenameRequest}
          onSubmit={nextTag => void handleConfirmRenameTag(tagRenameRequest.tag, nextTag)}
          onCancel={() => setTagRenameRequest(null)}
        />
      )}
      {tagRemoveRequest && (
        <TagRemoveDialog
          request={tagRemoveRequest}
          onSubmit={() => void handleConfirmRemoveTag(tagRemoveRequest.tag)}
          onCancel={() => setTagRemoveRequest(null)}
        />
      )}
      {folderCreateRequest && (
        <FolderNameDialog
          mode="create"
          request={folderCreateRequest}
          onSubmit={name => void handleConfirmCreateFolder(folderCreateRequest.parent, name)}
          onCancel={() => setFolderCreateRequest(null)}
        />
      )}
      {folderRenameRequest && (
        <FolderNameDialog
          mode="rename"
          request={folderRenameRequest}
          onSubmit={nextPath => void handleConfirmRenameFolder(folderRenameRequest.path, nextPath)}
          onCancel={() => setFolderRenameRequest(null)}
        />
      )}
      {moveNoteRequest && (
        <MoveNoteDialog
          request={moveNoteRequest}
          onSubmit={folder => void handleSubmitMoveNote(folder)}
          onCancel={() => setMoveNoteRequest(null)}
        />
      )}
      {workspaceRenameRequest && (
        <WorkspaceRenameDialog
          request={workspaceRenameRequest}
          onSubmit={name => handleConfirmRenameWorkspaceSnapshot(workspaceRenameRequest.snapshotKey, name)}
          onCancel={() => setWorkspaceRenameRequest(null)}
        />
      )}
      {preferencesOpen && (
        <NotesPreferencesDialog
          preferences={normalizedEditorPreferences}
          providerStatuses={localCollabProviderStatuses}
          templates={allTemplates}
          syncLabel={editorPreferencesSyncLabel}
          syncDetail={editorPreferencesSyncDetail}
          syncError={editorPreferencesSyncState === 'error'}
          onRetrySync={handleRetryEditorPreferencesSync}
          onConfirmAction={requestConfirmAction}
          onNotice={showNotice}
          onChange={updateEditorPreferences}
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

function TopBarAction({
  label,
  onClick,
  children,
  tone = 'default',
}: {
  label: string
  onClick: () => void
  children: ReactNode
  tone?: 'default' | 'danger'
}) {
  return (
    <button
      type="button"
      className="hover-bg"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        minHeight: 28,
        minWidth: 28,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        border: 'none',
        borderRadius: 'calc(var(--radius-sm) - 1px)',
        background: 'transparent',
        color: tone === 'danger' ? 'var(--red)' : 'var(--text-secondary)',
        cursor: 'pointer',
        padding: '0 6px',
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

function TopBarMenuButton({
  label,
  text = '',
  icon,
	  title,
	  description,
	  indicatorTone,
	  tone = 'default',
	  menuAlign = 'right',
	  searchable = false,
	  quickFilters = [],
	  searchLabel,
	  searchPlaceholder = 'Filter actions...',
	  open,
	  onToggle,
	  children,
	}: {
	  label: string
	  text?: string
	  icon?: ReactNode
	  title?: string
	  description?: string
	  indicatorTone?: 'accent' | 'danger'
	  tone?: 'default' | 'muted' | 'accent' | 'danger'
	  menuAlign?: 'left' | 'right'
	  searchable?: boolean
	  quickFilters?: { label: string; query: string }[]
	  searchLabel?: string
	  searchPlaceholder?: string
	  open: boolean
	  onToggle: () => void
	  children: ReactNode
	}) {
  const hasText = text.trim().length > 0
  const color = tone === 'danger' ? 'var(--red)' : tone === 'accent' ? 'var(--accent)' : 'var(--text-secondary)'
  const background = tone === 'accent' ? 'var(--accent-a08)' : tone === 'danger' ? 'color-mix(in srgb, var(--red) 10%, transparent)' : open ? 'var(--bg-white-06)' : 'transparent'
  const border = tone === 'danger' ? 'color-mix(in srgb, var(--red) 30%, var(--border))' : tone === 'accent' ? 'var(--accent-a20)' : open ? 'var(--border)' : 'transparent'
  const indicatorColor = indicatorTone === 'danger' ? 'var(--red)' : indicatorTone === 'accent' ? 'var(--accent)' : undefined
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const menuId = useId()
  const descriptionId = description ? `${menuId}-description` : undefined
  const pendingOpenFocusRef = useRef<'first' | 'last' | null>(null)
	  const typeaheadRef = useRef('')
	  const typeaheadTimerRef = useRef<number | null>(null)
	  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
	  const [menuQuery, setMenuQuery] = useState('')
	  const normalizedMenuQuery = menuQuery.trim().toLowerCase()
	  const restoreTriggerFocus = () => requestAnimationFrame(() => triggerRef.current?.focus())

  const resetTypeahead = () => {
    typeaheadRef.current = ''
    if (typeaheadTimerRef.current) {
      window.clearTimeout(typeaheadTimerRef.current)
      typeaheadTimerRef.current = null
    }
  }

	  useLayoutEffect(() => {
	    if (!open) {
	      setMenuStyle({})
	      setMenuQuery('')
	      resetTypeahead()
	      return
	    }
    const updateMenuStyle = () => {
      setMenuStyle(viewportAnchoredMenuStyle(triggerRef.current, menuRef.current, menuAlign, 240, 340))
    }
    updateMenuStyle()
    window.addEventListener('resize', updateMenuStyle)
    window.addEventListener('scroll', updateMenuStyle, true)
    return () => {
      window.removeEventListener('resize', updateMenuStyle)
      window.removeEventListener('scroll', updateMenuStyle, true)
    }
  }, [menuAlign, open])

  useEffect(() => () => resetTypeahead(), [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && wrapperRef.current?.contains(target)) return
      if (target instanceof Node && menuRef.current?.contains(target)) return
      onToggle()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [onToggle, open])

  useEffect(() => {
    if (!open) return
    if (pendingOpenFocusRef.current === 'last') {
      pendingOpenFocusRef.current = null
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') ?? [])
      items[items.length - 1]?.focus()
      return
    }
    pendingOpenFocusRef.current = null
    const active = menuRef.current?.querySelector<HTMLButtonElement>('button[data-active="true"]:not(:disabled)')
    const first = menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')
    ;(active ?? first)?.focus()
  }, [open])

  const focusMenuItem = (direction: 'next' | 'previous' | 'first' | 'last') => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') ?? [])
    if (items.length === 0) return
    if (direction === 'first') {
      items[0].focus()
      return
    }
    if (direction === 'last') {
      items[items.length - 1].focus()
      return
    }
    const currentIndex = Math.max(0, items.findIndex(item => item === document.activeElement))
    const nextIndex = direction === 'next'
      ? (currentIndex + 1) % items.length
      : (currentIndex - 1 + items.length) % items.length
    items[nextIndex].focus()
  }

  const focusMenuItemByTypeahead = (key: string) => {
    const normalizedKey = key.toLowerCase()
    typeaheadRef.current = `${typeaheadRef.current}${normalizedKey}`.slice(0, 32)
    if (typeaheadTimerRef.current) window.clearTimeout(typeaheadTimerRef.current)
    typeaheadTimerRef.current = window.setTimeout(() => {
      typeaheadRef.current = ''
      typeaheadTimerRef.current = null
    }, 700)

    const query = typeaheadRef.current
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') ?? [])
    if (items.length === 0) return
    const currentIndex = items.findIndex(item => item === document.activeElement)
    const orderedItems = [
      ...items.slice(Math.max(0, currentIndex + 1)),
      ...items.slice(0, Math.max(0, currentIndex + 1)),
    ]
    const match = orderedItems.find(item => (item.getAttribute('aria-label') ?? '').toLowerCase().startsWith(query))
      ?? orderedItems.find(item => (item.getAttribute('aria-label') ?? '').toLowerCase().includes(query))
    match?.focus()
    match?.scrollIntoView?.({ block: 'nearest' })
  }

  const closeMenuAndRestoreFocus = () => {
    if (open) onToggle()
    restoreTriggerFocus()
  }

	  const withMenuItemSelect = (node: ReactNode): ReactNode => Children.map(node, child => {
	    if (!isValidElement<TopBarMenuItemProps & { children?: ReactNode }>(child)) return child
	    if (child.type === Fragment) {
	      return <Fragment>{withMenuItemSelect(child.props.children)}</Fragment>
	    }
	    return cloneElement(child, { onSelect: restoreTriggerFocus })
	  })
	  const menuChildren = withMenuItemSelect(
	    normalizedMenuQuery ? filterTopBarMenuChildren(children, normalizedMenuQuery) : children,
	  )
	  const menuHasMatches = !normalizedMenuQuery || topBarMenuChildrenMatch(children, normalizedMenuQuery)

  return (
    <div
      ref={wrapperRef}
      onBlur={() => {
        if (!open) return
        requestAnimationFrame(() => {
          const active = document.activeElement
          if (active instanceof Node && wrapperRef.current?.contains(active)) return
          if (active instanceof Node && menuRef.current?.contains(active)) return
          onToggle()
        })
      }}
      style={{ position: 'relative', flex: '0 0 auto' }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-describedby={descriptionId}
        title={title ?? label}
        onClick={onToggle}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            if (!open) {
              pendingOpenFocusRef.current = 'first'
              onToggle()
            }
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) {
              pendingOpenFocusRef.current = 'last'
              onToggle()
            }
          }
          if (event.key === 'Escape' && open) {
            event.preventDefault()
            closeMenuAndRestoreFocus()
          }
        }}
        className="hover-bg"
        style={{
          height: 28,
          minWidth: 28,
          maxWidth: 132,
          border: `1px solid ${border}`,
          borderRadius: 'var(--radius-sm)',
          background,
          color,
          cursor: 'pointer',
          padding: icon && !hasText ? 0 : '0 8px',
          fontSize: 11,
          fontWeight: 650,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          whiteSpace: 'nowrap',
          position: 'relative',
        }}
      >
        {icon && (
          <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {icon}
          </span>
        )}
        {hasText && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>}
        {indicatorColor && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: 3,
              right: 3,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: indicatorColor,
              boxShadow: '0 0 0 2px var(--bg-base)',
            }}
          />
        )}
      </button>
      {description && (
        <span
          id={descriptionId}
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          {description}
        </span>
      )}
      {open && typeof document !== 'undefined' && createPortal((
	        <div
	          ref={menuRef}
	          id={menuId}
	          role="menu"
	          aria-label={label}
          onKeyDown={event => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              focusMenuItem('next')
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              focusMenuItem('previous')
            }
            if (event.key === 'Home') {
              event.preventDefault()
              focusMenuItem('first')
            }
            if (event.key === 'End') {
              event.preventDefault()
              focusMenuItem('last')
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              closeMenuAndRestoreFocus()
            }
            if (
              searchable &&
              event.key === '/' &&
              !event.altKey &&
              !event.ctrlKey &&
              !event.metaKey
            ) {
              event.preventDefault()
              searchInputRef.current?.focus()
              searchInputRef.current?.select()
              return
            }
            if (
              event.key.length === 1 &&
              event.key.trim().length > 0 &&
              !event.altKey &&
              !event.ctrlKey &&
              !event.metaKey
            ) {
              event.preventDefault()
              focusMenuItemByTypeahead(event.key)
            }
          }}
          style={{
            position: 'absolute',
            left: menuAlign === 'left' ? 0 : undefined,
            right: menuAlign === 'right' ? 0 : undefined,
            top: 32,
            zIndex: 120,
            minWidth: 190,
            maxWidth: 'min(280px, calc(100vw - 24px))',
            maxHeight: 'min(340px, calc(100vh - 96px))',
            overflow: 'auto',
            padding: 5,
            border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-panel, #111318)',
            boxShadow: '0 14px 30px var(--overlay-heavy, rgba(0, 0, 0, 0.45))',
            ...menuStyle,
	          }}
	        >
	          {searchable && (
	            <div
	              role="presentation"
	              style={{
	                position: 'sticky',
	                top: -5,
	                zIndex: 1,
	                padding: '4px 4px 6px',
	                background: 'var(--bg-panel, #111318)',
	                borderBottom: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
	                margin: '-5px -5px 4px',
	              }}
	            >
	              <input
	                ref={searchInputRef}
	                aria-label={searchLabel ?? `Filter ${label}`}
	                value={menuQuery}
	                placeholder={searchPlaceholder}
	                onChange={event => setMenuQuery(event.currentTarget.value)}
	                onKeyDown={event => {
	                  event.stopPropagation()
	                  if (event.key === 'ArrowDown') {
	                    event.preventDefault()
	                    focusMenuItem('first')
	                  }
	                  if (event.key === 'Escape' && menuQuery) {
	                    event.preventDefault()
	                    setMenuQuery('')
	                  }
	                  if (event.key === 'Escape' && !menuQuery) {
	                    event.preventDefault()
	                    closeMenuAndRestoreFocus()
	                  }
	                }}
	                style={{
	                  width: '100%',
	                  height: 28,
	                  border: '1px solid var(--border)',
	                  borderRadius: 'var(--radius-sm)',
	                  background: 'var(--bg-white-03)',
	                  color: 'var(--text-primary)',
	                  padding: '0 8px',
	                  font: 'inherit',
	                  fontSize: 11,
	                  outline: 'none',
	                }}
	              />
	              {quickFilters.length > 0 && (
	                <div
	                  role="presentation"
	                  style={{
	                    display: 'flex',
	                    flexWrap: 'wrap',
	                    gap: 4,
	                    marginTop: 6,
	                  }}
	                >
	                  <button
	                    type="button"
	                    aria-label={`Show all ${label} actions`}
	                    onClick={() => {
	                      setMenuQuery('')
	                      searchInputRef.current?.focus()
	                    }}
	                    style={{
	                      minHeight: 22,
	                      border: `1px solid ${normalizedMenuQuery ? 'var(--border)' : 'var(--accent-a20)'}`,
	                      borderRadius: 'var(--radius-sm)',
	                      background: normalizedMenuQuery ? 'var(--bg-white-03)' : 'var(--accent-a08)',
	                      color: normalizedMenuQuery ? 'var(--text-muted)' : 'var(--accent)',
	                      cursor: 'pointer',
	                      padding: '0 7px',
	                      fontSize: 10,
	                      fontWeight: 650,
	                      lineHeight: 1,
	                    }}
	                  >
	                    All
	                  </button>
	                  {quickFilters.map(filter => {
	                    const active = normalizedMenuQuery === filter.query.trim().toLowerCase()
	                    return (
	                      <button
	                        key={`${filter.label}:${filter.query}`}
	                        type="button"
	                        aria-label={`Filter ${label}: ${filter.label}`}
	                        onClick={() => {
	                          setMenuQuery(filter.query)
	                          searchInputRef.current?.focus()
	                        }}
	                        style={{
	                          minHeight: 22,
	                          border: `1px solid ${active ? 'var(--accent-a20)' : 'var(--border)'}`,
	                          borderRadius: 'var(--radius-sm)',
	                          background: active ? 'var(--accent-a08)' : 'var(--bg-white-03)',
	                          color: active ? 'var(--accent)' : 'var(--text-muted)',
	                          cursor: 'pointer',
	                          padding: '0 7px',
	                          fontSize: 10,
	                          fontWeight: 650,
	                          lineHeight: 1,
	                        }}
	                      >
	                        {filter.label}
	                      </button>
	                    )
	                  })}
	                </div>
	              )}
	            </div>
	          )}
	          {menuChildren}
	          {searchable && normalizedMenuQuery && !menuHasMatches && (
	            <div
	              role="presentation"
	              style={{
	                padding: '10px 8px',
	                color: 'var(--text-muted)',
	                fontSize: 11,
	                lineHeight: 1.4,
	              }}
	            >
	              No matching actions.
	            </div>
	          )}
	        </div>
	      ), document.body)}
    </div>
  )
}

interface TopBarMenuItemProps {
  label: string
  icon?: ReactNode
  detail?: string
  active?: boolean
  disabled?: boolean
  draggable?: boolean
  tone?: 'default' | 'danger'
  onClick?: () => void
  onSelect?: () => void
  onDragStart?: DragEventHandler<HTMLButtonElement>
  onDragOver?: DragEventHandler<HTMLButtonElement>
  onDrop?: DragEventHandler<HTMLButtonElement>
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>
}

function topBarMenuItemMatches(
  props: Pick<TopBarMenuItemProps, 'label' | 'detail'>,
  query: string,
): boolean {
  return topBarMenuTextMatches(`${props.label} ${props.detail ?? ''}`, query)
}

function topBarMenuSectionMatches(
  props: { label?: string },
  query: string,
): boolean {
  return topBarMenuTextMatches(props.label ?? '', query)
}

function topBarMenuTextMatches(text: string, query: string): boolean {
  const normalizedText = text.toLowerCase()
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true
  if (normalizedText.includes(normalizedQuery)) return true
  return normalizedQuery
    .split(/\s+/)
    .filter(Boolean)
    .every(token => normalizedText.includes(token))
}

function topBarMenuChildrenMatch(node: ReactNode, query: string): boolean {
  return Children.toArray(node).some(child => {
    if (!isValidElement<TopBarMenuItemProps & { children?: ReactNode }>(child)) return false
    if (child.type === Fragment) return topBarMenuChildrenMatch(child.props.children, query)
    if (child.type === TopBarMenuSection) return topBarMenuSectionMatches(child.props, query)
    return topBarMenuItemMatches(child.props, query)
  })
}

function filterTopBarMenuChildren(node: ReactNode, query: string): ReactNode {
  const filtered: ReactNode[] = []
  let pendingSection: ReactNode | null = null
  let pendingSectionMatches = false

  Children.toArray(node).forEach(child => {
    if (!isValidElement<TopBarMenuItemProps & { children?: ReactNode }>(child)) return
    if (child.type === Fragment) {
      const filteredChildren = filterTopBarMenuChildren(child.props.children, query)
      if (topBarMenuChildrenMatch(filteredChildren, query)) {
        filtered.push(<Fragment key={`filtered-fragment-${filtered.length}`}>{filteredChildren}</Fragment>)
      }
      return
    }

    if (child.type === TopBarMenuSection) {
      pendingSection = child
      pendingSectionMatches = topBarMenuSectionMatches(child.props, query)
      return
    }

    if (pendingSectionMatches || topBarMenuItemMatches(child.props, query)) {
      if (pendingSection) {
        filtered.push(pendingSection)
        pendingSection = null
      }
      filtered.push(child)
    }
  })

  return filtered
}

function TopBarMenuSection({ label }: { label: string }) {
  return (
    <div
      role="presentation"
      style={{
        padding: '7px 8px 4px',
        color: 'var(--text-faint)',
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1,
        textTransform: 'uppercase',
      }}
    >
      {label}
    </div>
  )
}

function TopBarMenuItem({
  label,
  icon,
  detail,
  active = false,
  disabled = false,
  draggable = false,
  tone = 'default',
  onClick,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
  onKeyDown,
}: TopBarMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-label={label}
      data-active={active ? 'true' : undefined}
      draggable={draggable && !disabled}
      disabled={disabled}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onKeyDown={onKeyDown}
      onClick={() => {
        onClick?.()
        onSelect?.()
      }}
      style={{
        width: '100%',
        display: 'grid',
        gridTemplateColumns: icon ? '18px minmax(0, 1fr)' : 'minmax(0, 1fr)',
        alignItems: 'center',
        columnGap: 7,
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        background: active ? 'var(--bg-white-06)' : 'transparent',
        color: disabled ? 'var(--text-muted)' : tone === 'danger' ? 'var(--red)' : 'var(--text-secondary)',
        cursor: disabled ? 'default' : 'pointer',
        padding: '6px 8px',
        textAlign: 'left',
        opacity: disabled ? 0.68 : 1,
      }}
    >
      {icon && (
        <span
          aria-hidden
          style={{
            width: 18,
            height: 18,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: tone === 'danger' ? 'var(--red)' : active ? 'var(--accent)' : 'var(--text-muted)',
          }}
        >
          {icon}
        </span>
      )}
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12, fontWeight: active ? 700 : 600, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        {detail && (
          <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 10, lineHeight: 1.25, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {detail}
          </span>
        )}
      </span>
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
  onCopyToCurrent,
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
  onCopyToCurrent: (rev: string) => void
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
                    onClick={() => onCopyToCurrent(preview.rev)}
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
                    Copy to current
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

function VersionNameDialog({
  request,
  loading,
  onSubmit,
  onCancel,
}: {
  request: VersionNameRequest
  loading: boolean
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(request.mode === 'rename' ? request.currentLabel ?? '' : '')
  const trimmed = value.trim()
  const valid = request.mode === 'rename' ? trimmed !== (request.currentLabel ?? '').trim() : trimmed.length > 0
  const title = request.mode === 'rename' ? 'Rename version' : 'Name current version'

  useEffect(() => {
    setValue(request.mode === 'rename' ? request.currentLabel ?? '' : '')
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [request.currentLabel, request.mode])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !loading) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(0, 0, 0, 0.42)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <form
        aria-label={title}
        onSubmit={event => {
          event.preventDefault()
          if (valid && !loading) onSubmit(trimmed)
        }}
        style={{
          width: 'min(420px, 100%)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-panel)',
          boxShadow: 'var(--shadow-xl)',
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
          <GitBranch size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>{title}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              {request.mode === 'rename' ? 'Update or clear this saved version name.' : 'Create a named checkpoint for the current note.'}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="hover-bg"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: loading ? 'default' : 'pointer',
              padding: '6px 10px',
              fontSize: 12,
            }}
          >
            Cancel
          </button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Version name</span>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={event => setValue(event.target.value)}
              placeholder="Draft before review"
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                padding: '8px 9px',
                font: 'inherit',
                fontSize: 13,
                minWidth: 0,
                outline: 'none',
              }}
            />
          </label>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-white-02)',
              color: valid ? 'var(--text-secondary)' : 'var(--text-muted)',
              padding: '8px 10px',
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            {request.mode === 'rename'
              ? 'Leave blank and save to clear the visible name.'
              : 'Named versions make important checkpoints easier to find later.'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: loading ? 'default' : 'pointer',
                padding: '7px 11px',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || loading}
              style={{
                border: '1px solid var(--accent-a20)',
                borderRadius: 'var(--radius-sm)',
                background: valid && !loading ? 'var(--accent-a12)' : 'var(--bg-muted)',
                color: valid && !loading ? 'var(--accent)' : 'var(--text-muted)',
                cursor: valid && !loading ? 'pointer' : 'not-allowed',
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              {loading ? 'Saving...' : title}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function DocumentPropertyDialog({
  request,
  onSubmit,
  onCancel,
}: {
  request: DocumentPropertyRequest
  onSubmit: (key: string, value: string, sourceKey?: string) => void
  onCancel: () => void
}) {
  const propertyKeys = Object.keys(request.properties)
  const firstKey = request.sourceKey || request.defaultKey || propertyKeys[0] || ''
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)
  const [sourceKey, setSourceKey] = useState(firstKey)
  const [key, setKey] = useState(request.mode === 'remove' || request.mode === 'rename' ? firstKey : request.defaultKey || 'status')
  const [value, setValue] = useState(request.defaultValue || '')
  const [valueKind, setValueKind] = useState<DocumentPropertyValueKind>(request.defaultKind || 'text')
  const normalizedSourceKey = normalizeDocumentPropertyKey(sourceKey)
  const normalizedKey = normalizeDocumentPropertyKey(key)
  const valid = request.mode === 'rename'
    ? normalizedSourceKey.length > 0 && propertyKeys.includes(normalizedSourceKey) && normalizedKey.length > 0 && normalizedKey !== normalizedSourceKey
    : request.mode === 'remove'
      ? normalizedKey.length > 0 && propertyKeys.includes(normalizedKey)
      : normalizedKey.length > 0
  const title = request.mode === 'rename'
    ? 'Rename document property'
    : request.mode === 'remove'
      ? 'Remove document property'
      : 'Set document property'

  useEffect(() => {
    setSourceKey(firstKey)
    setKey(request.mode === 'remove' || request.mode === 'rename' ? firstKey : request.defaultKey || 'status')
    setValue(request.defaultValue || '')
    setValueKind(request.defaultKind || 'text')
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      if (inputRef.current instanceof HTMLInputElement) inputRef.current.select()
    })
  }, [firstKey, request.defaultKey, request.defaultKind, request.defaultValue, request.mode])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(0, 0, 0, 0.42)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <form
        aria-label={title}
        onSubmit={event => {
          event.preventDefault()
          if (valid) onSubmit(normalizedKey, formatDocumentPropertyInputValue(valueKind, value), normalizedSourceKey)
        }}
        style={{
          width: 'min(440px, 100%)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-panel)',
          boxShadow: 'var(--shadow-xl)',
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
          <NotePencil size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>{title}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              {request.mode === 'rename'
                ? 'Rename frontmatter metadata without changing its value.'
                : request.mode === 'remove'
                  ? 'Remove frontmatter metadata from this note.'
                  : 'Write frontmatter metadata for this note.'}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
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
            Cancel
          </button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          {request.mode === 'rename' && (
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Current property</span>
              <select
                value={sourceKey}
                onChange={event => {
                  setSourceKey(event.target.value)
                  setKey(event.target.value)
                }}
                aria-label="Current property"
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-base)',
                  color: 'var(--text-primary)',
                  padding: '8px 9px',
                  font: 'inherit',
                  fontSize: 13,
                  minWidth: 0,
                  outline: 'none',
                }}
              >
                {propertyKeys.map(propertyKey => (
                  <option key={propertyKey} value={propertyKey}>{propertyKey}</option>
                ))}
              </select>
            </label>
          )}
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>
              {request.mode === 'rename' ? 'New property name' : 'Property name'}
            </span>
            {request.mode === 'remove' && propertyKeys.length > 0 ? (
              <select
                ref={node => {
                  inputRef.current = node
                }}
                value={key}
                onChange={event => setKey(event.target.value)}
                aria-label="Property name"
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-base)',
                  color: 'var(--text-primary)',
                  padding: '8px 9px',
                  font: 'inherit',
                  fontSize: 13,
                  minWidth: 0,
                  outline: 'none',
                }}
              >
                {propertyKeys.map(propertyKey => (
                  <option key={propertyKey} value={propertyKey}>{propertyKey}</option>
                ))}
              </select>
            ) : (
              <input
                ref={node => {
                  inputRef.current = node
                }}
                type="text"
                value={key}
                onChange={event => setKey(event.target.value)}
                aria-label={request.mode === 'rename' ? 'New property name' : 'Property name'}
                placeholder={request.mode === 'rename' ? 'review_status' : 'status'}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-base)',
                  color: 'var(--text-primary)',
                  padding: '8px 9px',
                  font: 'inherit',
                  fontSize: 13,
                  minWidth: 0,
                  outline: 'none',
                }}
              />
            )}
          </label>
          {request.mode === 'set' && (
            <>
              <label style={{ display: 'grid', gap: 5 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Property type</span>
                <select
                  value={valueKind}
                  onChange={event => setValueKind(event.target.value as DocumentPropertyValueKind)}
                  aria-label="Property type"
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-base)',
                    color: 'var(--text-primary)',
                    padding: '8px 9px',
                    font: 'inherit',
                    fontSize: 13,
                    minWidth: 0,
                    outline: 'none',
                  }}
                >
                  <option value="text">Text</option>
                  <option value="list">List</option>
                  <option value="number">Number</option>
                  <option value="checkbox">Checkbox</option>
                  <option value="date">Date</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 5 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Property value</span>
                <input
                  type={valueKind === 'date' ? 'date' : valueKind === 'number' ? 'number' : 'text'}
                  value={value}
                  onChange={event => setValue(event.target.value)}
                  aria-label="Property value"
                  placeholder={valueKind === 'list' ? 'draft, reviewed' : valueKind === 'checkbox' ? 'true' : 'draft'}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-base)',
                    color: 'var(--text-primary)',
                    padding: '8px 9px',
                    font: 'inherit',
                    fontSize: 13,
                    minWidth: 0,
                    outline: 'none',
                  }}
                />
              </label>
            </>
          )}
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-white-02)',
              color: valid ? 'var(--text-secondary)' : 'var(--text-muted)',
              padding: '8px 10px',
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            {request.mode === 'rename'
              ? propertyKeys.length === 0
                ? 'This note has no document properties to rename.'
                : normalizedKey === normalizedSourceKey
                  ? 'Enter a different destination property name.'
                  : `Renames ${normalizedSourceKey || 'property'} to ${normalizedKey || 'property'} in the note frontmatter.`
              : request.mode === 'remove'
              ? propertyKeys.length === 0
                ? 'This note has no document properties to remove.'
                : 'Removes the selected property from the note frontmatter.'
              : `Saves ${valueKind} metadata as ${normalizedKey || 'property'} in the note frontmatter.`}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid}
              style={{
                border: '1px solid var(--accent-a20)',
                borderRadius: 'var(--radius-sm)',
                background: valid ? 'var(--accent-a12)' : 'var(--bg-muted)',
                color: valid ? 'var(--accent)' : 'var(--text-muted)',
                cursor: valid ? 'pointer' : 'not-allowed',
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              {title}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function ReviewPackageDialog({
  request,
  onSubmit,
  onCancel,
}: {
  request: ReviewPackageRequest
  onSubmit: (permission: ReviewPackagePermission, recipient: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [permission, setPermission] = useState<ReviewPackagePermission>('suggest')
  const [recipient, setRecipient] = useState('')

  useEffect(() => {
    setPermission('suggest')
    setRecipient('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [request.noteId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(0, 0, 0, 0.42)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <form
        aria-label="Private share package"
        onSubmit={event => {
          event.preventDefault()
          onSubmit(permission, recipient)
        }}
        style={{
          width: 'min(460px, 100%)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-panel)',
          boxShadow: 'var(--shadow-xl)',
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
          <ShareNetwork size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>Private share package</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {request.title}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
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
            Cancel
          </button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Permission</span>
            <select
              aria-label="Permission"
              value={permission}
              onChange={event => setPermission(event.target.value as ReviewPackagePermission)}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                padding: '8px 9px',
                font: 'inherit',
                fontSize: 13,
                minWidth: 0,
                outline: 'none',
              }}
            >
              <option value="view">View only</option>
              <option value="comment">Comment</option>
              <option value="suggest">Suggest edits</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Recipient</span>
            <input
              ref={inputRef}
              type="text"
              aria-label="Recipient"
              value={recipient}
              onChange={event => setRecipient(event.target.value)}
              placeholder="Name or email, optional"
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                padding: '8px 9px',
                font: 'inherit',
                fontSize: 13,
                minWidth: 0,
                outline: 'none',
              }}
            />
          </label>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-white-02)',
              color: 'var(--text-secondary)',
              padding: '8px 10px',
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            Exports a local review package with the current document, comments, suggestions, and selected role.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                border: '1px solid var(--accent-a20)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-a12)',
                color: 'var(--accent)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              Export share package
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function PluginMarketplaceFeedDialog({
  request,
  onSubmit,
  onCancel,
}: {
  request: PluginMarketplaceFeedRequest
  onSubmit: (url: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(request.defaultUrl)
  const trimmed = value.trim()

  useEffect(() => {
    setValue(request.defaultUrl)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [request.defaultUrl])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(0, 0, 0, 0.42)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <form
        aria-label="Import plugin marketplace feed"
        onSubmit={event => {
          event.preventDefault()
          if (trimmed) onSubmit(trimmed)
        }}
        style={{
          width: 'min(460px, 100%)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-panel)',
          boxShadow: 'var(--shadow-xl)',
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
          <UploadSimple size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>Import marketplace feed</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              Fetch signed plugin package metadata into a local vault note.
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
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
            Cancel
          </button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Feed URL</span>
            <input
              ref={inputRef}
              type="url"
              aria-label="Feed URL"
              value={value}
              onChange={event => setValue(event.target.value)}
              placeholder="https://plugins.example/feed.json"
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                padding: '8px 9px',
                font: 'inherit',
                fontSize: 13,
                minWidth: 0,
                outline: 'none',
              }}
            />
          </label>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-white-02)',
              color: 'var(--text-secondary)',
              padding: '8px 10px',
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            HTTPS feeds are fetched without credentials. Local HTTP is only accepted for development hosts.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!trimmed}
              style={{
                border: '1px solid var(--accent-a20)',
                borderRadius: 'var(--radius-sm)',
                background: trimmed ? 'var(--accent-a12)' : 'var(--bg-muted)',
                color: trimmed ? 'var(--accent)' : 'var(--text-muted)',
                cursor: trimmed ? 'pointer' : 'not-allowed',
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              Import feed
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function EncryptedBackupPasswordDialog({
  request,
  onSubmit,
  onCancel,
}: {
  request: EncryptedBackupRequest
  onSubmit: (password: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const isExport = request.mode === 'export'
  const valid = password.length > 0 && (!isExport || confirmation === password)
  const title = isExport ? 'Export encrypted vault backup' : 'Import encrypted vault backup'
  const helper = isExport
    ? confirmation && confirmation !== password
      ? 'Backup passwords do not match.'
      : 'Choose a password for this local encrypted vault backup.'
    : `Enter the password for ${request.fileName || 'this encrypted vault backup'}.`

  useEffect(() => {
    setPassword('')
    setConfirmation('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [request.mode, request.fileName])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(0, 0, 0, 0.42)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <form
        aria-label={title}
        onSubmit={event => {
          event.preventDefault()
          if (valid) onSubmit(password)
        }}
        style={{
          width: 'min(440px, 100%)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-panel)',
          boxShadow: 'var(--shadow-xl)',
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
          <ShieldCheck size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>{title}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isExport ? 'Create a password-protected local vault backup.' : request.fileName || 'Restore a local encrypted vault backup.'}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
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
            Cancel
          </button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Password</span>
            <input
              ref={inputRef}
              type="password"
              aria-label="Password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="new-password"
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                padding: '8px 9px',
                font: 'inherit',
                fontSize: 13,
                minWidth: 0,
                outline: 'none',
              }}
            />
          </label>
          {isExport && (
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Confirm password</span>
              <input
                type="password"
                aria-label="Confirm password"
                value={confirmation}
                onChange={event => setConfirmation(event.target.value)}
                autoComplete="new-password"
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-base)',
                  color: 'var(--text-primary)',
                  padding: '8px 9px',
                  font: 'inherit',
                  fontSize: 13,
                  minWidth: 0,
                  outline: 'none',
                }}
              />
            </label>
          )}
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-white-02)',
              color: isExport && confirmation && confirmation !== password ? 'var(--red)' : 'var(--text-secondary)',
              padding: '8px 10px',
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            {helper}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid}
              style={{
                border: '1px solid var(--accent-a20)',
                borderRadius: 'var(--radius-sm)',
                background: valid ? 'var(--accent-a12)' : 'var(--bg-muted)',
                color: valid ? 'var(--accent)' : 'var(--text-muted)',
                cursor: valid ? 'pointer' : 'not-allowed',
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              {isExport ? 'Export backup' : 'Import backup'}
            </button>
          </div>
        </div>
      </form>
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
  onDraftReply,
  onJump,
  onClose,
}: {
  noteTitle: string
  comments: VaultComment[]
  loading: boolean
  error: string | null
  onAdd: () => void
  onResolve: (id: string) => void
  onReply: (id: string, defaultBody?: string) => void
  onDraftReply: (id: string) => void
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
                        onClick={() => onDraftReply(comment.id)}
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
                        Draft reply
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

function CommentComposeDialog({
  request,
  loading,
  onSubmit,
  onCancel,
}: {
  request: CommentComposeRequest
  loading: boolean
  onSubmit: (body: string) => void
  onCancel: () => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [body, setBody] = useState(request.defaultBody ?? '')
  const title = request.mode === 'reply' ? 'Reply to comment' : request.suggestionId ? 'Comment on suggestion' : 'Add comment'
  const valid = body.trim().length > 0

  useEffect(() => {
    setBody(request.defaultBody ?? '')
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [request])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(0, 0, 0, 0.42)',
      }}
    >
      <form
        aria-label={title}
        onSubmit={event => {
          event.preventDefault()
          if (valid && !loading) onSubmit(body)
        }}
        style={{
          width: 'min(460px, 100%)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-panel)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>{title}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {request.noteTitle}
          </div>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          {request.quote && (
            <div
              style={{
                borderLeft: '2px solid var(--accent-dim)',
                background: 'var(--bg-white-02)',
                color: 'var(--text-muted)',
                fontSize: 11,
                lineHeight: 1.45,
                maxHeight: 96,
                overflow: 'auto',
                padding: '7px 9px',
                whiteSpace: 'pre-wrap',
              }}
            >
              {request.quote.length > 260 ? `${request.quote.slice(0, 260)}...` : request.quote}
            </div>
          )}
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>
              {request.mode === 'reply' ? 'Reply' : 'Comment'}
            </span>
            <textarea
              ref={textareaRef}
              value={body}
              onChange={event => setBody(event.target.value)}
              rows={5}
              aria-label={request.mode === 'reply' ? 'Reply text' : 'Comment text'}
              placeholder={request.mode === 'reply' ? 'Write a reply...' : 'Write a comment...'}
              style={{
                width: '100%',
                minWidth: 0,
                resize: 'vertical',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                padding: '8px 9px',
                font: 'inherit',
                fontSize: 13,
                lineHeight: 1.45,
                outline: 'none',
              }}
            />
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: loading ? 'default' : 'pointer',
                padding: '7px 11px',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || loading}
              style={{
                border: '1px solid var(--accent-a20)',
                borderRadius: 'var(--radius-sm)',
                background: valid && !loading ? 'var(--accent-a12)' : 'var(--bg-muted)',
                color: valid && !loading ? 'var(--accent)' : 'var(--text-muted)',
                cursor: valid && !loading ? 'pointer' : 'not-allowed',
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              {loading ? 'Saving...' : request.mode === 'reply' ? 'Send reply' : 'Add comment'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function SuggestionsDialog({
  noteTitle,
  suggestions,
  comments,
  loading,
  error,
  onAdd,
  onComment,
  onResolveComment,
  onReplyToComment,
  onDraftReplyToComment,
  onApply,
  onReject,
  onApplyAll,
  onRejectAll,
  onJump,
  onClose,
}: {
  noteTitle: string
  suggestions: VaultSuggestion[]
  comments: VaultComment[]
  loading: boolean
  error: string | null
  onAdd: () => void
  onComment: (id: string) => void
  onResolveComment: (id: string) => void
  onReplyToComment: (id: string) => void
  onDraftReplyToComment: (id: string) => void
  onApply: (id: string) => void
  onReject: (id: string) => void
  onApplyAll: () => void
  onRejectAll: () => void
  onJump: (id: string) => void
  onClose: () => void
}) {
  const openCount = suggestions.filter(suggestion => suggestion.status === 'open').length

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
        <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'grid', gap: 8 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              disabled={loading || openCount === 0}
              onClick={onApplyAll}
              style={{
                background: openCount === 0 ? 'var(--bg-muted)' : 'var(--accent-dim)',
                border: '1px solid transparent',
                borderRadius: 'var(--radius-sm)',
                color: openCount === 0 ? 'var(--text-muted)' : 'var(--text-on-color)',
                cursor: loading || openCount === 0 ? 'not-allowed' : 'pointer',
                padding: '7px 10px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              Accept all
            </button>
            <button
              type="button"
              disabled={loading || openCount === 0}
              onClick={onRejectAll}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: openCount === 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
                cursor: loading || openCount === 0 ? 'not-allowed' : 'pointer',
                padding: '7px 10px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              Reject all
            </button>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.35 }}>
            {openCount === 0 ? 'No open suggestions.' : `${openCount} open suggestion${openCount === 1 ? '' : 's'}.`}
          </div>
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
              const suggestionComments = comments.filter(comment => {
                const anchor = comment.anchor as unknown
                return Boolean(
                  anchor &&
                    typeof anchor === 'object' &&
                    (anchor as Record<string, unknown>).suggestion_id === suggestion.id,
                )
              })
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
                  {suggestionComments.length > 0 && (
                    <div
                      aria-label={`Comments on suggestion ${suggestion.id}`}
                      style={{
                        marginTop: 8,
                        display: 'grid',
                        gap: 7,
                        borderLeft: '2px solid var(--accent-dim)',
                        padding: '2px 0 2px 8px',
                      }}
                    >
                      <div style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 650 }}>
                        {suggestionComments.length} comment{suggestionComments.length === 1 ? '' : 's'}
                      </div>
                      {suggestionComments.map(comment => {
                        const resolved = Boolean(comment.resolved_at) || comment.status === 'resolved'
                        return (
                          <div
                            key={comment.id}
                            style={{
                              display: 'grid',
                              gap: 6,
                              padding: '7px 8px',
                              background: 'var(--bg-white-02)',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-sm)',
                              opacity: resolved ? 0.58 : 1,
                            }}
                          >
                            <div
                              style={{
                                color: 'var(--text-secondary)',
                                fontSize: 11,
                                lineHeight: 1.45,
                                whiteSpace: 'pre-wrap',
                              }}
                            >
                              {comment.body}
                            </div>
                            {Array.isArray(comment.replies) && comment.replies.length > 0 && (
                              <div style={{ display: 'grid', gap: 5 }}>
                                {comment.replies.map(reply => (
                                  <div
                                    key={reply.id}
                                    style={{
                                      borderLeft: '2px solid var(--border)',
                                      paddingLeft: 7,
                                      color: 'var(--text-muted)',
                                      fontSize: 10,
                                      lineHeight: 1.4,
                                      whiteSpace: 'pre-wrap',
                                    }}
                                  >
                                    {reply.body}
                                  </div>
                                ))}
                              </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <span style={{ flex: 1, minWidth: 0, color: 'var(--text-muted)', fontSize: 10 }}>
                                {new Date(comment.created_at).toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </span>
                              {!resolved && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => onDraftReplyToComment(comment.id)}
                                    style={{
                                      background: 'transparent',
                                      border: '0',
                                      color: 'var(--text-secondary)',
                                      cursor: 'pointer',
                                      padding: 0,
                                      fontSize: 10,
                                    }}
                                  >
                                    Draft
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onReplyToComment(comment.id)}
                                    style={{
                                      background: 'transparent',
                                      border: '0',
                                      color: 'var(--text-secondary)',
                                      cursor: 'pointer',
                                      padding: 0,
                                      fontSize: 10,
                                    }}
                                  >
                                    Reply
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onResolveComment(comment.id)}
                                    style={{
                                      background: 'transparent',
                                      border: '0',
                                      color: 'var(--text-secondary)',
                                      cursor: 'pointer',
                                      padding: 0,
                                      fontSize: 10,
                                    }}
                                  >
                                    Resolve
                                  </button>
                                </>
                              )}
                              {resolved && <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>Resolved</span>}
                            </div>
                          </div>
                        )
                      })}
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
                          onClick={() => onComment(suggestion.id)}
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
                          Comment
                        </button>
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

function SuggestionComposeDialog({
  request,
  loading,
  onSubmit,
  onCancel,
}: {
  request: SuggestionComposeRequest
  loading: boolean
  onSubmit: (content: string, body: string) => void
  onCancel: () => void
}) {
  const [content, setContent] = useState(request.defaultContent)
  const [body, setBody] = useState('')
  const contentRef = useRef<HTMLTextAreaElement | null>(null)
  const modeLabel =
    request.anchor.scope === 'selection'
      ? 'Replace selected text'
      : request.cursorInsert
        ? 'Insert at cursor'
        : 'Replace document'
  const valid = content.trim().length > 0 && (request.cursorInsert || content !== request.defaultContent)

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      contentRef.current?.focus()
      contentRef.current?.select()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Suggest edit"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel()
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
      <form
        aria-label="Suggest edit"
        onSubmit={event => {
          event.preventDefault()
          if (valid && !loading) onSubmit(content, body)
        }}
        style={{
          width: 'min(620px, calc(100vw - 32px))',
          maxHeight: 'min(760px, calc(100vh - 32px))',
          overflow: 'auto',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-panel)',
          boxShadow: '0 24px 80px var(--overlay-heavy)',
          padding: 16,
        }}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'start' }}>
            <NotePencil size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--text-primary)' }}>Suggest edit</div>
              <div
                style={{
                  marginTop: 3,
                  color: 'var(--text-muted)',
                  fontSize: 12,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {modeLabel} in {request.noteTitle}
              </div>
            </div>
          </div>

          {request.selectedText && (
            <div
              style={{
                borderLeft: '2px solid var(--accent-dim)',
                background: 'var(--bg-white-02)',
                color: 'var(--text-muted)',
                fontSize: 12,
                lineHeight: 1.45,
                maxHeight: 110,
                overflow: 'auto',
                padding: '7px 9px',
                whiteSpace: 'pre-wrap',
              }}
            >
              {request.selectedText}
            </div>
          )}

          <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>
            Suggested Markdown
            <textarea
              ref={contentRef}
              value={content}
              onChange={event => setContent(event.target.value)}
              rows={9}
              aria-label="Suggested Markdown"
              placeholder={request.cursorInsert ? 'Markdown to insert...' : 'Replacement Markdown...'}
              style={{
                width: '100%',
                minWidth: 0,
                resize: 'vertical',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                padding: '8px 9px',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                lineHeight: 1.5,
                outline: 'none',
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>
            Suggestion note
            <textarea
              value={body}
              onChange={event => setBody(event.target.value)}
              rows={3}
              aria-label="Suggestion note"
              placeholder="Optional note for reviewers..."
              style={{
                width: '100%',
                minWidth: 0,
                resize: 'vertical',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                padding: '8px 9px',
                font: 'inherit',
                fontSize: 13,
                lineHeight: 1.45,
                outline: 'none',
              }}
            />
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: loading ? 'default' : 'pointer',
                padding: '7px 11px',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || loading}
              style={{
                border: '1px solid var(--accent-a20)',
                borderRadius: 'var(--radius-sm)',
                background: valid && !loading ? 'var(--accent-a12)' : 'var(--bg-muted)',
                color: valid && !loading ? 'var(--accent)' : 'var(--text-muted)',
                cursor: valid && !loading ? 'pointer' : 'not-allowed',
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              {loading ? 'Saving...' : 'Create suggestion'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function WritingAssistDialog({
  request,
  defaultControls,
  loading,
  error,
  onControlsChange,
  onCreate,
  onCancel,
}: {
  request: WritingAssistRequest
  defaultControls: WritingAssistControls
  loading: boolean
  error: string | null
  onControlsChange: (controls: WritingAssistControls) => void
  onCreate: (option: WritingAssistOption) => void
  onCancel: () => void
}) {
  const [selectedId, setSelectedId] = useState(request.draft.options[0]?.id ?? '')
  const [controls, setControls] = useState<WritingAssistControls>(defaultControls)
  const firstButtonRef = useRef<HTMLButtonElement | null>(null)
  const selectedBase = request.draft.options.find(option => option.id === selectedId) ?? request.draft.options[0]
  const selected = selectedBase ? applyWritingAssistControls(selectedBase, controls) : undefined
  const modeLabel =
    request.draft.anchor.scope === 'selection'
      ? 'Selection'
      : request.draft.cursorInsert
        ? 'Cursor'
        : 'Document'

  useEffect(() => {
    const timeout = window.setTimeout(() => firstButtonRef.current?.focus(), 0)
    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => {
    setControls(defaultControls)
  }, [defaultControls, request.noteId])

  const updateControls = (patch: Partial<WritingAssistControls>) => {
    const next = { ...controls, ...patch }
    setControls(next)
    onControlsChange(next)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Writing assistant"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel()
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
        aria-label="Writing assistant"
        style={{
          width: 'min(720px, calc(100vw - 32px))',
          maxHeight: 'min(760px, calc(100vh - 32px))',
          overflow: 'auto',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-panel)',
          boxShadow: '0 24px 80px var(--overlay-heavy)',
          padding: 16,
        }}
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'start' }}>
            <PenNib size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--text-primary)' }}>Writing assistant</div>
              <div
                style={{
                  marginTop: 3,
                  color: 'var(--text-muted)',
                  fontSize: 12,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {modeLabel} suggestion for {request.noteTitle}
              </div>
            </div>
          </div>

          {request.draft.sourceText && (
            <div
              aria-label="Writing assistant source"
              style={{
                borderLeft: '2px solid var(--accent-dim)',
                background: 'var(--bg-white-02)',
                color: 'var(--text-muted)',
                fontSize: 12,
                lineHeight: 1.45,
                maxHeight: 110,
                overflow: 'auto',
                padding: '7px 9px',
                whiteSpace: 'pre-wrap',
              }}
            >
              {request.draft.sourceText}
            </div>
          )}

          <div role="radiogroup" aria-label="Writing assistant options" style={{ display: 'grid', gap: 8 }}>
            {request.draft.options.map((option, index) => (
              <button
                key={option.id}
                ref={index === 0 ? firstButtonRef : undefined}
                type="button"
                role="radio"
                aria-checked={selected?.id === option.id}
                onClick={() => setSelectedId(option.id)}
                style={{
                  textAlign: 'left',
                  border: selected?.id === option.id ? '1px solid var(--accent-a40)' : '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: selected?.id === option.id ? 'var(--accent-a08)' : 'var(--bg-base)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  padding: 10,
                }}
              >
                <span style={{ display: 'block', fontSize: 13, fontWeight: 650 }}>{option.label}</span>
                <span style={{ display: 'block', marginTop: 3, fontSize: 12, color: 'var(--text-muted)' }}>{option.detail}</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <label style={{ display: 'grid', gap: 5, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>
              Provider
              <select
                aria-label="Writing assistant provider"
                value={controls.provider}
                onChange={event => updateControls({ provider: event.target.value as WritingAssistProvider })}
                style={{
                  minWidth: 0,
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-base)',
                  color: 'var(--text-primary)',
                  padding: '7px 8px',
                  font: 'inherit',
                  fontSize: 12,
                }}
              >
                <option value="local">{writingAssistProviderLabel('local')}</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 5, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>
              Tone
              <select
                aria-label="Writing assistant tone"
                value={controls.tone}
                onChange={event => updateControls({ tone: event.target.value as WritingAssistTone })}
                style={{
                  minWidth: 0,
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-base)',
                  color: 'var(--text-primary)',
                  padding: '7px 8px',
                  font: 'inherit',
                  fontSize: 12,
                }}
              >
                <option value="neutral">Neutral</option>
                <option value="direct">Direct</option>
                <option value="friendly">Friendly</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 5, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>
              Length
              <select
                aria-label="Writing assistant length"
                value={controls.length}
                onChange={event => updateControls({ length: event.target.value as WritingAssistLength })}
                style={{
                  minWidth: 0,
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-base)',
                  color: 'var(--text-primary)',
                  padding: '7px 8px',
                  font: 'inherit',
                  fontSize: 12,
                }}
              >
                <option value="standard">Standard</option>
                <option value="short">Short</option>
              </select>
            </label>
          </div>
          <div
            role="note"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-white-02)',
              color: 'var(--text-muted)',
              fontSize: 12,
              lineHeight: 1.4,
              padding: '7px 9px',
            }}
          >
            {writingAssistPrivacySummary(controls)}
          </div>

          <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>
            Suggested Markdown
            <textarea
              readOnly
              value={selected?.content ?? ''}
              rows={9}
              aria-label="Writing assistant suggestion"
              style={{
                width: '100%',
                minWidth: 0,
                resize: 'vertical',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                padding: '8px 9px',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                lineHeight: 1.5,
                outline: 'none',
              }}
            />
          </label>

          {error && (
            <div role="alert" style={{ color: 'var(--danger)', fontSize: 12 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 2 }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: loading ? 'default' : 'pointer',
                padding: '7px 11px',
                fontSize: 12,
              }}
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => selected && onCreate(selected)}
              disabled={!selected || loading}
              style={{
                border: '1px solid var(--accent-a20)',
                borderRadius: 'var(--radius-sm)',
                background: selected && !loading ? 'var(--accent-a12)' : 'var(--bg-muted)',
                color: selected && !loading ? 'var(--accent)' : 'var(--text-muted)',
                cursor: selected && !loading ? 'pointer' : 'not-allowed',
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              {loading ? 'Saving...' : 'Create suggestion'}
            </button>
          </div>
        </div>
      </section>
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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown save error'
}

function QueuedEditsDialog({
  edits,
  online,
  saving,
  onRetry,
  onOpenNote,
  onOpenDiagnostics,
  onClose,
}: {
  edits: QueuedLocalEdit[]
  online: boolean
  saving: boolean
  onRetry: () => void
  onOpenNote: (noteId: string) => void
  onOpenDiagnostics: () => void
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
      aria-label="Queued local edits"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.34)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <section
        style={{
          width: 'min(680px, calc(100vw - 32px))',
          maxHeight: 'min(720px, calc(100vh - 32px))',
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
            <Cloud size={18} style={{ color: online ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--text-primary)' }}>Queued local edits</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Local-only changes waiting for a successful vault save
              </div>
            </div>
          </div>
        </div>
        <div style={{ overflow: 'auto', padding: 16, display: 'grid', gap: 10 }}>
          {edits.length === 0 ? (
            <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>
              No queued local edits.
            </div>
          ) : (
            edits.map(edit => {
              const lineCount = Math.max(1, edit.content.split('\n').length)
              const previewLines = edit.content.trim().split('\n').filter(Boolean)
              const preview = previewLines[previewLines.length - 1] || 'Empty note content'
              return (
                <div
                  key={edit.noteId}
                  style={{
                    border: `1px solid ${edit.error ? 'color-mix(in srgb, var(--red) 35%, var(--border))' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    background: edit.error ? 'color-mix(in srgb, var(--red) 7%, transparent)' : 'var(--bg-white-02)',
                    padding: 10,
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {edit.title}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {edit.folder} / {edit.noteId}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenNote(edit.noteId)}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'transparent',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        padding: '6px 8px',
                        fontSize: 12,
                      }}
                    >
                      Open note
                    </button>
                  </div>
                  {edit.error && (
                    <div style={{ color: 'var(--red)', fontSize: 11, lineHeight: 1.4 }}>
                      Save failed: {edit.error}
                    </div>
                  )}
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {lineCount} line{lineCount === 1 ? '' : 's'} local-only - {edit.content.length} chars
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {preview}
                  </div>
                </div>
              )
            })
          )}
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onOpenDiagnostics}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '7px 10px',
              fontSize: 12,
            }}
          >
            Sync diagnostics
          </button>
          <button
            type="button"
            onClick={onRetry}
            disabled={!online || saving || edits.length === 0}
            style={{
              border: '1px solid var(--accent-a30)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-a12)',
              color: !online || saving || edits.length === 0 ? 'var(--text-muted)' : 'var(--accent)',
              cursor: !online || saving || edits.length === 0 ? 'default' : 'pointer',
              padding: '7px 10px',
              fontSize: 12,
              fontWeight: 650,
            }}
          >
            {saving ? 'Retrying...' : 'Retry all queued edits'}
          </button>
          <button
            type="button"
            onClick={onClose}
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
            Close
          </button>
        </div>
      </section>
    </div>
  )
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
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
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

function AllPropertiesDialog({
  notes,
  onOpenNote,
  onEditProperty,
  onRenameProperty,
  onRemoveProperty,
  onClose,
}: {
  notes: VaultNote[]
  onOpenNote: (id: string) => void
  onEditProperty: (noteId: string, key: string) => void
  onRenameProperty: (noteId: string, key: string) => void
  onRemoveProperty: (noteId: string, key: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const entries = useMemo(() => buildVaultPropertyIndex(notes, query), [notes, query])
  const totalProperties = useMemo(() => buildVaultPropertyIndex(notes), [notes])

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
      aria-label="All properties"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.42)',
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <aside
        style={{
          width: 'min(760px, 100%)',
          maxHeight: '82vh',
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
          <Table size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>All properties</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              {totalProperties.length} property {totalProperties.length === 1 ? 'key' : 'keys'} across the vault
            </div>
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
        <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Filter by key, value, note, or folder"
            aria-label="Filter properties"
            autoFocus
            style={{
              width: '100%',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-base)',
              color: 'var(--text-primary)',
              padding: '8px 10px',
              font: 'inherit',
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>
        <div style={{ overflow: 'auto', padding: 14, display: 'grid', gap: 8 }}>
          {entries.length ? entries.map(entry => (
            <section
              key={entry.key}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-white-02)',
                padding: 10,
                display: 'grid',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 650 }}>{entry.key}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {entry.noteCount} {entry.noteCount === 1 ? 'note' : 'notes'} · {entry.kind}
                  </div>
                </div>
                <span
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-base)',
                    color: 'var(--text-muted)',
                    padding: '3px 6px',
                    fontSize: 10,
                    textTransform: 'capitalize',
                  }}
                >
                  {entry.kind}
                </span>
              </div>
              {entry.values.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {entry.values.map(value => (
                    <span
                      key={value}
                      title={value}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-base)',
                        color: 'var(--text-secondary)',
                        padding: '4px 6px',
                        fontSize: 11,
                        maxWidth: 180,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {value}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'grid', gap: 4 }}>
                {entry.notes.map(note => (
                  <div
                    key={note.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      gap: 6,
                      alignItems: 'center',
                    }}
                  >
                    <button
                      type="button"
                      className="hover-bg"
                      onClick={() => onOpenNote(note.id)}
                      style={{
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        background: 'transparent',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        padding: '5px 6px',
                        fontSize: 12,
                        textAlign: 'left',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {note.title} <span style={{ color: 'var(--text-muted)' }}>{note.folder}</span>
                      {note.value && <span style={{ color: 'var(--text-muted)' }}> · {note.value}</span>}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <PropertyIndexActionButton label={`Edit ${entry.key} in ${note.title}`} onClick={() => onEditProperty(note.id, entry.key)}>
                        Edit
                      </PropertyIndexActionButton>
                      <PropertyIndexActionButton label={`Rename ${entry.key} in ${note.title}`} onClick={() => onRenameProperty(note.id, entry.key)}>
                        Rename
                      </PropertyIndexActionButton>
                      <PropertyIndexActionButton label={`Remove ${entry.key} from ${note.title}`} onClick={() => onRemoveProperty(note.id, entry.key)}>
                        Remove
                      </PropertyIndexActionButton>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )) : (
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-white-02)',
                color: 'var(--text-muted)',
                padding: 14,
                fontSize: 12,
              }}
            >
              No properties match this filter.
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function AllTagsDialog({
  notes,
  onOpenNote,
  onRenameTag,
  onRemoveTag,
  currentNote,
  onApplyTagToCurrent,
  onFilterTag,
  onClose,
}: {
  notes: VaultNote[]
  onOpenNote: (id: string) => void
  onRenameTag: (tag: string) => void
  onRemoveTag: (tag: string) => void
  currentNote: VaultNote | null
  onApplyTagToCurrent: (tag: string) => void
  onFilterTag: (tag: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const entries = useMemo(() => buildTagIndex(notes, query), [notes, query])
  const totalTags = useMemo(() => buildTagIndex(notes), [notes])

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
      aria-label="All tags"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.42)',
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <aside
        style={{
          width: 'min(760px, 100%)',
          maxHeight: '82vh',
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
          <ListBullets size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>All tags</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              {totalTags.length} tag {totalTags.length === 1 ? 'path' : 'paths'} across the vault
            </div>
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
        <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Filter by tag, note, folder, or nested path"
            aria-label="Filter tags"
            autoFocus
            style={{
              width: '100%',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-base)',
              color: 'var(--text-primary)',
              padding: '8px 10px',
              font: 'inherit',
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>
        <div style={{ overflow: 'auto', padding: 14, display: 'grid', gap: 8 }}>
          {entries.length ? entries.map(entry => (
            <section
              key={entry.tag}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-white-02)',
                padding: 10,
                display: 'grid',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0, paddingLeft: entry.depth * 12 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    #{entry.tag}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {entry.directCount} direct · {entry.count} total
                    {entry.count !== entry.directCount && ` · ${entry.count - entry.directCount} inherited`}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <PropertyIndexActionButton label={`Filter notes by tag ${entry.tag}`} onClick={() => onFilterTag(entry.tag)}>
                    Filter
                  </PropertyIndexActionButton>
                  {entry.directCount > 0 && currentNote && !currentNote.tags.some(tag => tag === entry.tag) && (
                    <PropertyIndexActionButton label={`Apply tag ${entry.tag} to current note`} onClick={() => onApplyTagToCurrent(entry.tag)}>
                      Apply
                    </PropertyIndexActionButton>
                  )}
                  {entry.directCount > 0 && (
                    <>
                      <PropertyIndexActionButton label={`Rename tag ${entry.tag}`} onClick={() => onRenameTag(entry.tag)}>
                        Rename
                      </PropertyIndexActionButton>
                      <PropertyIndexActionButton label={`Remove tag ${entry.tag}`} onClick={() => onRemoveTag(entry.tag)}>
                        Remove
                      </PropertyIndexActionButton>
                    </>
                  )}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                {entry.notes.map(note => (
                  <div
                    key={note.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      gap: 6,
                      alignItems: 'center',
                    }}
                  >
                    <button
                      type="button"
                      className="hover-bg"
                      onClick={() => onOpenNote(note.id)}
                      style={{
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        background: 'transparent',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        padding: '5px 6px',
                        fontSize: 12,
                        textAlign: 'left',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {note.title} <span style={{ color: 'var(--text-muted)' }}>{note.folder}</span>
                    </button>
                    <span
                      style={{
                        color: 'var(--text-muted)',
                        fontSize: 11,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 220,
                      }}
                    >
                      {note.tags.map(tag => `#${tag}`).join(' ')}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )) : (
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-white-02)',
                color: 'var(--text-muted)',
                padding: 14,
                fontSize: 12,
              }}
            >
              No tags match this filter.
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function PropertyIndexActionButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="hover-bg"
      aria-label={label}
      onClick={onClick}
      style={{
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        background: 'transparent',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        padding: '4px 5px',
        fontSize: 11,
      }}
    >
      {children}
    </button>
  )
}

function TopBarWordCountDialog({
  stats,
  selectionStats,
  onClose,
}: {
  stats: DocumentStats
  selectionStats: DocumentStats | null
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => closeRef.current?.focus())
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
      aria-label="Word count"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.42)',
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <section
        style={{
          width: 'min(440px, 100%)',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>Word count</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Current note statistics</div>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 14 }}>
          <WordCountStatsSection title="Document" stats={stats} />
          <WordCountStatsSection title="Selection" stats={selectionStats} emptyLabel="No selected text" />
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            ref={closeRef}
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
      </section>
    </div>
  )
}

function ActiveNoteOutlineDialog({
  noteTitle,
  headings,
  onJump,
  onClose,
}: {
  noteTitle: string
  headings: MarkdownOutlineHeading[]
  onJump: (heading: MarkdownOutlineHeading) => void
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 220,
        background: 'rgba(0, 0, 0, 0.42)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '72px 16px 16px',
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Active note outline"
        style={{
          width: 'min(420px, 100%)',
          maxHeight: 'min(520px, calc(100vh - 96px))',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '13px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>Outline</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {noteTitle}
          </div>
        </div>
        <div style={{ overflow: 'auto', padding: 8, display: 'grid', gap: 2 }}>
          {headings.length === 0 ? (
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-white-02)',
                color: 'var(--text-muted)',
                padding: '10px 11px',
                fontSize: 12,
              }}
            >
              No headings in this note
            </div>
          ) : (
            headings.map((heading, index) => (
              <button
                key={`${heading.lineNumber}-${index}`}
                type="button"
                className="hover-bg"
                onClick={() => onJump(heading)}
                title={heading.text}
                style={{
                  minHeight: 28,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  background: 'transparent',
                  color: heading.level <= 2 ? 'var(--text-secondary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '5px 8px',
                  paddingLeft: 8 + Math.min(heading.level - 1, 4) * 14,
                  textAlign: 'left',
                  font: 'inherit',
                  fontSize: heading.level <= 2 ? 12 : 11,
                  fontWeight: heading.level === 1 ? 650 : 500,
                }}
              >
                <span style={{ color: 'var(--text-faint)', fontSize: 10, flex: '0 0 auto' }}>H{heading.level}</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {heading.text}
                </span>
                <span style={{ marginLeft: 'auto', color: 'var(--text-faint)', fontSize: 10, flex: '0 0 auto' }}>
                  {heading.lineNumber}
                </span>
              </button>
            ))
          )}
        </div>
        <div style={{ padding: 10, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            ref={closeRef}
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
      </section>
    </div>
  )
}

function WordCountStatsSection({
  title,
  stats,
  emptyLabel,
}: {
  title: string
  stats: DocumentStats | null
  emptyLabel?: string
}) {
  return (
    <section aria-label={`${title} word count`} style={{ display: 'grid', gap: 8 }}>
      <div style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 650 }}>{title}</div>
      {stats ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 10,
          }}
        >
          <WordCountMetric label="Words" value={stats.words} />
          <WordCountMetric label="Characters" value={stats.chars} />
          <WordCountMetric label="Characters no spaces" value={stats.charsNoSpaces} />
          <WordCountMetric label="Lines" value={stats.lines} />
          <WordCountMetric label="Paragraphs" value={stats.paragraphs} />
          <WordCountMetric label="Estimated pages" value={stats.estimatedPages} />
          <WordCountMetric label="Links" value={stats.links} />
          <WordCountMetric label="Tags" value={stats.tags} />
        </div>
      ) : (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-white-02)',
            color: 'var(--text-muted)',
            padding: '9px 10px',
            fontSize: 12,
          }}
        >
          {emptyLabel ?? 'No stats'}
        </div>
      )}
    </section>
  )
}

function WordCountMetric({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-white-02)',
        padding: '9px 10px',
      }}
    >
      <div style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 650, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  )
}

function DailyDatePickerDialog({
  preferences,
  onOpenDate,
  onClose,
}: {
  preferences: NotesEditorPreferences
  onOpenDate: (date: Date) => void
  onClose: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(() => dailyNoteDateInputValue(new Date()))
  const selectedDate = dailyNoteDateFromInput(value)
  const previewTitle = selectedDate ? buildDailyNoteTitle(preferences, selectedDate) : 'Invalid date'

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.42)',
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <form
        onSubmit={event => {
          event.preventDefault()
          if (selectedDate) onOpenDate(selectedDate)
        }}
        style={{
          width: 'min(420px, 100%)',
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
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>Daily note date</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Open or create one local calendar day</div>
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
            Cancel
          </button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Date</span>
            <input
              ref={inputRef}
              type="date"
              value={value}
              onChange={event => setValue(event.target.value)}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                padding: '8px 9px',
                font: 'inherit',
                fontSize: 13,
                minWidth: 0,
              }}
            />
          </label>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-white-02)',
              color: selectedDate ? 'var(--text-secondary)' : 'var(--red)',
              padding: '8px 10px',
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {previewTitle}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedDate}
              style={{
                border: '1px solid var(--accent-a20)',
                borderRadius: 'var(--radius-sm)',
                background: selectedDate ? 'var(--accent-a12)' : 'var(--bg-muted)',
                color: selectedDate ? 'var(--accent)' : 'var(--text-muted)',
                cursor: selectedDate ? 'pointer' : 'not-allowed',
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              Open daily note
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function ConfirmActionDialog({
  request,
  onCancel,
  onSettled,
}: {
  request: ConfirmActionRequest
  onCancel: () => void
  onSettled: () => void
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const [loading, setLoading] = useState(false)
  const danger = request.tone === 'danger'

  useEffect(() => {
    requestAnimationFrame(() => confirmRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [loading, onCancel])

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !loading) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.42)',
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <form
        aria-label={request.title}
        onSubmit={event => {
          event.preventDefault()
          if (loading) return
          setLoading(true)
          void Promise.resolve(request.onConfirm()).finally(onSettled)
        }}
        style={{
          width: 'min(440px, 100%)',
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
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>{request.title}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Confirm the vault action before continuing.</div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="hover-bg"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: loading ? 'default' : 'pointer',
              padding: '6px 10px',
              fontSize: 12,
              opacity: loading ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-white-02)',
              color: 'var(--text-secondary)',
              padding: '9px 10px',
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            {request.detail}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: loading ? 'default' : 'pointer',
                padding: '7px 11px',
                fontSize: 12,
                opacity: loading ? 0.5 : 1,
              }}
            >
              Cancel
            </button>
            <button
              ref={confirmRef}
              type="submit"
              disabled={loading}
              style={{
                border: danger ? '1px solid color-mix(in srgb, var(--red) 34%, var(--border))' : '1px solid var(--accent-a20)',
                borderRadius: 'var(--radius-sm)',
                background: danger ? 'color-mix(in srgb, var(--red) 11%, transparent)' : 'var(--accent-a12)',
                color: danger ? 'var(--red)' : 'var(--accent)',
                cursor: loading ? 'default' : 'pointer',
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 650,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Working...' : request.confirmLabel}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function NoticeDialog({
  request,
  onClose,
}: {
  request: NoticeRequest
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const toneColor = request.tone === 'danger'
    ? 'var(--red)'
    : request.tone === 'warning'
      ? 'var(--warning)'
      : 'var(--accent)'

  useEffect(() => {
    requestAnimationFrame(() => closeRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.42)',
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={request.title}
        style={{
          width: 'min(420px, 100%)',
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
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>{request.title}</div>
            <div style={{ color: toneColor, fontSize: 11 }}>Notes vault</div>
          </div>
          <button
            ref={closeRef}
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
            {request.actionLabel ?? 'Close'}
          </button>
        </div>
        <div style={{ padding: 16 }}>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-white-02)',
              color: 'var(--text-secondary)',
              padding: '9px 10px',
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            {request.detail}
          </div>
        </div>
      </section>
    </div>
  )
}

function TemplatePromptDialog({
  request,
  onSubmit,
  onCancel,
}: {
  request: TemplatePromptRequest
  onSubmit: (values: Record<string, string>) => void
  onCancel: () => void
}) {
  const firstInputRef = useRef<HTMLInputElement>(null)
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(request.prompts.map(prompt => [prompt.name, prompt.defaultValue])),
  )

  useEffect(() => {
    setValues(Object.fromEntries(request.prompts.map(prompt => [prompt.name, prompt.defaultValue])))
    requestAnimationFrame(() => firstInputRef.current?.focus())
  }, [request])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.42)',
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <form
        onSubmit={event => {
          event.preventDefault()
          onSubmit(values)
        }}
        style={{
          width: 'min(460px, 100%)',
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
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>Template values</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {request.templateLabel}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
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
            Cancel
          </button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          {request.prompts.map((prompt, index) => (
            <label key={prompt.name} style={{ display: 'grid', gap: 5 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>{prompt.name}</span>
              <input
                ref={index === 0 ? firstInputRef : undefined}
                type="text"
                value={values[prompt.name] ?? ''}
                placeholder={prompt.defaultValue}
                onChange={event => setValues(prev => ({ ...prev, [prompt.name]: event.target.value }))}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-base)',
                  color: 'var(--text-primary)',
                  padding: '8px 9px',
                  font: 'inherit',
                  fontSize: 13,
                  minWidth: 0,
                }}
              />
            </label>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                border: '1px solid var(--accent-a20)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-a12)',
                color: 'var(--accent)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              Apply
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function TemplateNameDialog({
  request,
  onSubmit,
  onCancel,
}: {
  request: TemplateNameRequest
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(request.defaultTitle)
  const trimmed = value.trim()

  useEffect(() => {
    setValue(request.defaultTitle)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [request.defaultTitle])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.42)',
        backdropFilter: 'blur(8px)',
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <form
        aria-label="Save current note as template"
        onSubmit={event => {
          event.preventDefault()
          if (trimmed) onSubmit(trimmed)
        }}
        style={{
          width: 'min(420px, 100%)',
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
          <FileText size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>Save as template</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              Store this note in the Templates folder for reuse.
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
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
            Cancel
          </button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Template name</span>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={event => setValue(event.target.value)}
              placeholder="Project brief template"
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                padding: '8px 9px',
                font: 'inherit',
                fontSize: 13,
                minWidth: 0,
                outline: 'none',
              }}
            />
          </label>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-white-02)',
              color: 'var(--text-secondary)',
              padding: '8px 10px',
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            The saved template keeps the current note body and adds template frontmatter.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!trimmed}
              style={{
                border: '1px solid var(--accent-a20)',
                borderRadius: 'var(--radius-sm)',
                background: trimmed ? 'var(--accent-a12)' : 'var(--bg-muted)',
                color: trimmed ? 'var(--accent)' : 'var(--text-muted)',
                cursor: trimmed ? 'pointer' : 'not-allowed',
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              Save template
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function TagRenameDialog({
  request,
  onSubmit,
  onCancel,
}: {
  request: TagRenameRequest
  onSubmit: (nextTag: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(request.tag)
  const normalized = normalizeTagInput(value)
  const unchanged = normalized === normalizeTagInput(request.tag)
  const valid = normalized.length > 0 && !/\s/.test(normalized) && !unchanged
  const affectedLabel = `${request.affectedCount} note${request.affectedCount === 1 ? '' : 's'}`

  useEffect(() => {
    setValue(request.tag)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [request])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.42)',
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <form
        aria-label="Rename tag"
        onSubmit={event => {
          event.preventDefault()
          if (valid) onSubmit(normalized)
        }}
        style={{
          width: 'min(420px, 100%)',
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
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>Rename tag</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              #{request.tag} in {affectedLabel}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
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
            Cancel
          </button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>New tag</span>
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-base)',
                display: 'flex',
                alignItems: 'center',
                minWidth: 0,
              }}
            >
              <span style={{ color: 'var(--text-muted)', paddingLeft: 9, fontSize: 13 }}>#</span>
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={event => setValue(event.target.value)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  padding: '8px 9px 8px 3px',
                  font: 'inherit',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>
          </label>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-white-02)',
              color: valid || unchanged ? 'var(--text-secondary)' : 'var(--red)',
              padding: '8px 10px',
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {unchanged
              ? 'Choose a different tag name.'
              : valid
                ? `Renames matching inline and frontmatter tags to #${normalized}.`
                : 'Tags cannot be empty or contain spaces.'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid}
              style={{
                border: '1px solid var(--accent-a20)',
                borderRadius: 'var(--radius-sm)',
                background: valid ? 'var(--accent-a12)' : 'var(--bg-muted)',
                color: valid ? 'var(--accent)' : 'var(--text-muted)',
                cursor: valid ? 'pointer' : 'not-allowed',
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              Rename tag
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function TagRemoveDialog({
  request,
  onSubmit,
  onCancel,
}: {
  request: TagRemoveRequest
  onSubmit: () => void
  onCancel: () => void
}) {
  const removeRef = useRef<HTMLButtonElement>(null)
  const affectedLabel = `${request.affectedCount} note${request.affectedCount === 1 ? '' : 's'}`

  useEffect(() => {
    requestAnimationFrame(() => removeRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.42)',
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <form
        aria-label="Remove tag"
        onSubmit={event => {
          event.preventDefault()
          onSubmit()
        }}
        style={{
          width: 'min(420px, 100%)',
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
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>Remove tag</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              #{request.tag} in {affectedLabel}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
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
            Cancel
          </button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-white-02)',
              color: 'var(--text-secondary)',
              padding: '8px 10px',
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            Removes matching inline and frontmatter tags from affected notes. Other nested tags and partial matches stay unchanged.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              ref={removeRef}
              type="submit"
              style={{
                border: '1px solid color-mix(in srgb, var(--red) 34%, var(--border))',
                borderRadius: 'var(--radius-sm)',
                background: 'color-mix(in srgb, var(--red) 11%, transparent)',
                color: 'var(--red)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              Remove tag
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function FolderNameDialog({
  mode,
  request,
  onSubmit,
  onCancel,
}: {
  mode: 'create' | 'rename'
  request: FolderCreateRequest | FolderRenameRequest
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const isRename = mode === 'rename'
  const renameRequest = isRename ? request as FolderRenameRequest : null
  const createRequest = isRename ? null : request as FolderCreateRequest
  const [value, setValue] = useState(isRename ? renameRequest?.path ?? '' : '')
  const normalized = normalizeFolderPath(value)
  const unchanged = !!renameRequest && normalized === renameRequest.path
  const insideSelf = !!renameRequest && normalized.startsWith(`${renameRequest.path}/`)
  const valid = normalized.length > 0 && !unchanged && !insideSelf
  const title = isRename ? 'Rename folder' : 'Create folder'
  const inputLabel = isRename ? 'Folder path' : 'Folder name'
  const detail = isRename
    ? `${renameRequest?.affectedNoteCount ?? 0} note${renameRequest?.affectedNoteCount === 1 ? '' : 's'} and ${renameRequest?.affectedFolderCount ?? 0} folder${renameRequest?.affectedFolderCount === 1 ? '' : 's'}`
    : createRequest?.parent
      ? `Inside ${createRequest.parent}`
      : 'Vault root'
  const helper = isRename
    ? insideSelf
      ? 'A folder cannot be renamed inside itself.'
      : unchanged
        ? 'Choose a different folder path.'
        : valid
          ? `Renames this folder to ${normalized}.`
          : 'Folder path cannot be empty.'
    : valid
      ? `Creates ${normalizeFolderPath(createRequest?.parent ? `${createRequest.parent}/${value}` : value)}.`
      : 'Folder name cannot be empty.'

  useEffect(() => {
    setValue(isRename ? renameRequest?.path ?? '' : '')
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [isRename, renameRequest?.path])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.42)',
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <form
        aria-label={title}
        onSubmit={event => {
          event.preventDefault()
          if (valid) onSubmit(isRename ? normalized : value)
        }}
        style={{
          width: 'min(420px, 100%)',
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
          <FolderPlus size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>{title}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {detail}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
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
            Cancel
          </button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>{inputLabel}</span>
            <input
              ref={inputRef}
              type="text"
              aria-label={inputLabel}
              value={value}
              onChange={event => setValue(event.target.value)}
              placeholder={isRename ? 'Projects/Archive' : 'Projects'}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                padding: '8px 9px',
                font: 'inherit',
                fontSize: 13,
                minWidth: 0,
                outline: 'none',
              }}
            />
          </label>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-white-02)',
              color: valid || unchanged ? 'var(--text-secondary)' : 'var(--red)',
              padding: '8px 10px',
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {helper}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid}
              style={{
                border: '1px solid var(--accent-a20)',
                borderRadius: 'var(--radius-sm)',
                background: valid ? 'var(--accent-a12)' : 'var(--bg-muted)',
                color: valid ? 'var(--accent)' : 'var(--text-muted)',
                cursor: valid ? 'pointer' : 'not-allowed',
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              {title}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function MoveNoteDialog({
  request,
  onSubmit,
  onCancel,
}: {
  request: MoveNoteRequest
  onSubmit: (folder: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const currentFolder = normalizeFolderPath(request.currentFolder)
  const folderOptions = useMemo(
    () => [...new Set(request.folders.map(folder => normalizeFolderPath(folder)).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [request.folders],
  )
  const [value, setValue] = useState(currentFolder)
  const normalized = normalizeFolderPath(value)
  const changed = normalized !== currentFolder
  const helper = changed
    ? normalized
      ? `Moves ${request.title} to ${normalized}.`
      : `Moves ${request.title} to the vault root.`
    : 'Choose a different destination folder.'

  useEffect(() => {
    setValue(currentFolder)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [currentFolder])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.42)',
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <form
        aria-label="Move note"
        onSubmit={event => {
          event.preventDefault()
          if (changed) onSubmit(normalized)
        }}
        style={{
          width: 'min(440px, 100%)',
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
          <FolderOpen size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>Move note</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {request.title} from {currentFolder || 'Vault root'}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
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
            Cancel
          </button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Existing folders</span>
            <select
              aria-label="Existing folders"
              value={folderOptions.includes(normalized) || normalized === '' ? normalized : '__custom__'}
              onChange={event => {
                if (event.currentTarget.value !== '__custom__') setValue(event.currentTarget.value)
              }}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                padding: '8px 9px',
                font: 'inherit',
                fontSize: 13,
                minWidth: 0,
                outline: 'none',
              }}
            >
              <option value="">Vault root</option>
              {folderOptions.map(folder => (
                <option key={folder} value={folder}>{folder}</option>
              ))}
              {!folderOptions.includes(normalized) && normalized && (
                <option value="__custom__">Custom: {normalized}</option>
              )}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Destination folder</span>
            <input
              ref={inputRef}
              type="text"
              aria-label="Destination folder"
              value={value}
              onChange={event => setValue(event.target.value)}
              placeholder="Leave blank for vault root"
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                padding: '8px 9px',
                font: 'inherit',
                fontSize: 13,
                minWidth: 0,
                outline: 'none',
              }}
            />
          </label>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-white-02)',
              color: changed ? 'var(--text-secondary)' : 'var(--text-muted)',
              padding: '8px 10px',
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {helper}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!changed}
              style={{
                border: '1px solid var(--accent-a20)',
                borderRadius: 'var(--radius-sm)',
                background: changed ? 'var(--accent-a12)' : 'var(--bg-muted)',
                color: changed ? 'var(--accent)' : 'var(--text-muted)',
                cursor: changed ? 'pointer' : 'not-allowed',
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              Move note
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function WorkspaceRenameDialog({
  request,
  onSubmit,
  onCancel,
}: {
  request: WorkspaceRenameRequest
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(request.currentName)
  const normalized = value.trim()
  const valid = normalized.length > 0 && normalized !== request.currentName

  useEffect(() => {
    setValue(request.currentName)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [request.currentName])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.42)',
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <form
        aria-label="Rename workspace"
        onSubmit={event => {
          event.preventDefault()
          if (valid) onSubmit(normalized)
        }}
        style={{
          width: 'min(420px, 100%)',
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
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>Rename workspace</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {viewModeLabel(request.viewMode)} layout preset
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
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
            Cancel
          </button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Workspace name</span>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={event => setValue(event.target.value)}
              style={{
                width: '100%',
                minWidth: 0,
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                padding: '8px 9px',
                font: 'inherit',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </label>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-white-02)',
              color: valid ? 'var(--text-secondary)' : 'var(--text-muted)',
              padding: '8px 10px',
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {normalized.length === 0
              ? 'Workspace names cannot be empty.'
              : valid
                ? 'Renames this local workspace preset without changing the layout.'
                : 'Choose a different workspace name.'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid}
              style={{
                border: '1px solid var(--accent-a20)',
                borderRadius: 'var(--radius-sm)',
                background: valid ? 'var(--accent-a12)' : 'var(--bg-muted)',
                color: valid ? 'var(--accent)' : 'var(--text-muted)',
                cursor: valid ? 'pointer' : 'not-allowed',
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              Rename workspace
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function normalizeTagInput(tag: string): string {
  return tag.trim().replace(/^#+/, '').replace(/^\/+|\/+$/g, '')
}

function NotesPreferencesDialog({
  preferences,
  providerStatuses,
  templates,
  syncLabel,
  syncDetail,
  syncError,
  onRetrySync,
  onConfirmAction,
  onNotice,
  onChange,
  onClose,
}: {
  preferences: NotesEditorPreferences
  providerStatuses: LocalCollabTransportStatus[]
  templates: NoteTemplate[]
  syncLabel: string
  syncDetail: string
  syncError: boolean
  onRetrySync: () => void
  onConfirmAction: (request: ConfirmActionRequest) => void
  onNotice: (request: NoticeRequest) => void
  onChange: (preferences: NotesEditorPreferences) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const [pairings, setPairings] = useState<VaultCollaborationPairing[]>([])
  const [pairingBusy, setPairingBusy] = useState(false)
  const [pairingError, setPairingError] = useState<string | null>(null)
  const [providerHealth, setProviderHealth] = useState<VaultCollaborationProviderHealth | null>(null)
  const [providerHealthBusy, setProviderHealthBusy] = useState(false)
  const [pairingInviteOutput, setPairingInviteOutput] = useState('')
  const [approveDeviceLabelOpen, setApproveDeviceLabelOpen] = useState(false)
  const [approveDeviceLabel, setApproveDeviceLabel] = useState('clawctrl Notes')
  const [acceptInviteOpen, setAcceptInviteOpen] = useState(false)
  const [acceptInviteValue, setAcceptInviteValue] = useState('')
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
        deviceLabel: 'clawctrl Notes',
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
      setPairingInviteOutput(encoded)
    } catch (error) {
      onNotice({
        title: 'Pairing invite failed',
        detail: error instanceof Error ? error.message : 'Could not create pairing invite',
        tone: 'danger',
      })
    } finally {
      setPairingBusy(false)
    }
  }

  const openApproveCurrentPairing = () => {
    if (!isNotesRemoteCollaborationPairingKey(preferences.remoteCollaborationPairingKey)) {
      setPairingError('Use a valid pairing key before approving this vault.')
      return
    }
    setApproveDeviceLabel('clawctrl Notes')
    setApproveDeviceLabelOpen(true)
  }

  const approveCurrentPairing = async (label: string) => {
    setPairingBusy(true)
    try {
      await approveVaultCollaborationPairing(preferences.remoteCollaborationPairingKey, label.trim() || 'clawctrl Notes')
      await refreshPairings()
      setApproveDeviceLabelOpen(false)
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
    onConfirmAction({
      title: 'Revoke pairing key',
      detail: 'Revoke this pairing key for the local vault. Remote collaboration will need a newly approved key before it can sync again.',
      confirmLabel: 'Revoke pairing',
      tone: 'danger',
      onConfirm: async () => {
        setPairingBusy(true)
        try {
          await revokeVaultCollaborationPairing({ pairingKey: preferences.remoteCollaborationPairingKey })
          await refreshPairings()
        } catch (error) {
          setPairingError(error instanceof Error ? error.message : 'Could not revoke pairing')
        } finally {
          setPairingBusy(false)
        }
      },
    })
  }

  const openAcceptPairingInvite = () => {
    setAcceptInviteValue('')
    setAcceptInviteOpen(true)
  }

  const acceptPairingInvite = async (raw: string) => {
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
      setAcceptInviteOpen(false)
      void checkProviderHealth(nextPreferences)
    } catch (error) {
      onNotice({
        title: 'Pairing invite failed',
        detail: error instanceof Error ? error.message : 'Could not accept pairing invite',
        tone: 'danger',
      })
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
    requestAnimationFrame(() => dialogRef.current?.focus())
  }, [])

  useEffect(() => {
    void refreshPairings()
  }, [refreshPairings])

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Editor preferences"
        tabIndex={-1}
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
            <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Editor, appearance, and periodic-note settings for this vault UI</div>
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
          <div
            style={{
              border: `1px solid ${syncError ? 'color-mix(in srgb, var(--red) 36%, var(--border))' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              background: syncError ? 'color-mix(in srgb, var(--red) 8%, transparent)' : 'var(--bg-white-02)',
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              minWidth: 0,
            }}
          >
            <span style={{ color: syncError ? 'var(--red)' : 'var(--text-muted)', display: 'inline-flex', flexShrink: 0 }}>
              {syncError ? <CloudSlash size={14} /> : <Cloud size={14} />}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 650 }}>{syncLabel}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.35 }}>{syncDetail}</div>
            </div>
            {syncError && (
              <button
                type="button"
                onClick={onRetrySync}
                className="hover-bg"
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '5px 8px',
                  fontSize: 11,
                  flexShrink: 0,
                }}
              >
                Retry
              </button>
            )}
          </div>
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
            <div>
              <div style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 650 }}>Vault appearance</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.35 }}>
                Local-only Notes theme and scoped CSS snippet for this vault workspace.
              </div>
            </div>
            <PreferenceSelect
              label="Appearance"
              value={preferences.appearanceMode}
              options={[
                ['system', 'Use app theme'],
                ['light', 'Light'],
                ['dark', 'Dark'],
              ]}
              onChange={value => update({ appearanceMode: value as NotesEditorPreferences['appearanceMode'] })}
            />
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 12 }}
            >
              <input
                type="checkbox"
                checked={preferences.cssSnippetEnabled}
                onChange={event => update({ cssSnippetEnabled: event.target.checked })}
              />
              Enable CSS snippet
            </label>
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>CSS snippet</span>
              <textarea
                aria-label="CSS snippet"
                value={preferences.cssSnippet}
                rows={6}
                spellCheck={false}
                placeholder=".tiptap-note-body { font-size: 15px; }"
                onChange={event => update({ cssSnippet: event.target.value })}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-base)',
                  color: 'var(--text-primary)',
                  padding: '7px 8px',
                  font: '12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  minWidth: 0,
                  resize: 'vertical',
                }}
              />
            </label>
          </div>
          <div
            style={{
              borderTop: '1px solid var(--border)',
              paddingTop: 12,
              display: 'grid',
              gap: 8,
            }}
          >
            <div>
              <div style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 650 }}>Daily notes</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.35 }}>
                Date tokens use formats like YYYY-MM-DD, dddd, MMMM D, HH:mm, and [literal text].
              </div>
            </div>
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Folder</span>
              <input
                type="text"
                value={preferences.dailyNoteFolder}
                placeholder="Daily"
                onChange={event => update({ dailyNoteFolder: event.target.value })}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-base)',
                  color: 'var(--text-primary)',
                  padding: '7px 8px',
                  font: 'inherit',
                  fontSize: 12,
                  minWidth: 0,
                }}
              />
            </label>
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Title format</span>
              <input
                type="text"
                value={preferences.dailyNoteTitleFormat}
                placeholder="[Daily] YYYY-MM-DD"
                onChange={event => update({ dailyNoteTitleFormat: event.target.value })}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-base)',
                  color: 'var(--text-primary)',
                  padding: '7px 8px',
                  font: 'inherit',
                  fontSize: 12,
                  minWidth: 0,
                }}
              />
            </label>
            <PreferenceSelect
              label="Template"
              value={preferences.dailyNoteTemplateId}
              options={templates.map(template => [
                template.id,
                template.source === 'vault' ? `${template.label} (vault)` : template.label,
              ])}
              onChange={value => update({ dailyNoteTemplateId: value })}
            />
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 12 }}
            >
              <input
                type="checkbox"
                checked={preferences.dailyNoteOpenExisting}
                onChange={event => update({ dailyNoteOpenExisting: event.target.checked })}
              />
              Open today's note if it already exists
            </label>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'grid', gap: 8 }}>
              <div style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 650 }}>Periodic notes</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
                <label style={{ display: 'grid', gap: 5 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Weekly folder</span>
                  <input
                    type="text"
                    value={preferences.weeklyNoteFolder}
                    placeholder="Weekly"
                    onChange={event => update({ weeklyNoteFolder: event.target.value })}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-base)',
                      color: 'var(--text-primary)',
                      padding: '7px 8px',
                      font: 'inherit',
                      fontSize: 12,
                      minWidth: 0,
                    }}
                  />
                </label>
                <label style={{ display: 'grid', gap: 5 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Monthly folder</span>
                  <input
                    type="text"
                    value={preferences.monthlyNoteFolder}
                    placeholder="Monthly"
                    onChange={event => update({ monthlyNoteFolder: event.target.value })}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-base)',
                      color: 'var(--text-primary)',
                      padding: '7px 8px',
                      font: 'inherit',
                      fontSize: 12,
                      minWidth: 0,
                    }}
                  />
                </label>
              </div>
              <PreferenceSelect
                label="Weekly template"
                value={preferences.weeklyNoteTemplateId}
                options={templates.map(template => [
                  template.id,
                  template.source === 'vault' ? `${template.label} (vault)` : template.label,
                ])}
                onChange={value => update({ weeklyNoteTemplateId: value })}
              />
              <PreferenceSelect
                label="Monthly template"
                value={preferences.monthlyNoteTemplateId}
                options={templates.map(template => [
                  template.id,
                  template.source === 'vault' ? `${template.label} (vault)` : template.label,
                ])}
                onChange={value => update({ monthlyNoteTemplateId: value })}
              />
            </div>
          </div>
          <div
            style={{
              borderTop: '1px solid var(--border)',
              paddingTop: 12,
              display: 'grid',
              gap: 8,
            }}
          >
            <div>
              <div style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 650 }}>Writing assistant</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.35 }}>
                Synced defaults for the local assistant dialog. Note text still stays on this device.
              </div>
            </div>
            <PreferenceSelect
              label="Provider"
              value={preferences.writingAssistProvider}
              options={[
                ['local', writingAssistProviderLabel('local')],
              ]}
              onChange={value => update({ writingAssistProvider: value as NotesEditorPreferences['writingAssistProvider'] })}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
              <PreferenceSelect
                label="Tone"
                value={preferences.writingAssistTone}
                options={[
                  ['neutral', 'Neutral'],
                  ['direct', 'Direct'],
                  ['friendly', 'Friendly'],
                ]}
                onChange={value => update({ writingAssistTone: value as NotesEditorPreferences['writingAssistTone'] })}
              />
              <PreferenceSelect
                label="Length"
                value={preferences.writingAssistLength}
                options={[
                  ['standard', 'Standard'],
                  ['short', 'Short'],
                ]}
                onChange={value => update({ writingAssistLength: value as NotesEditorPreferences['writingAssistLength'] })}
              />
            </div>
          </div>
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
                placeholder="https://your-clawctrl.example"
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
                onClick={openAcceptPairingInvite}
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
                onClick={openApproveCurrentPairing}
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
            {pairingInviteOutput && (
              <div
                role="group"
                aria-label="Pairing invite"
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-white-02)',
                  padding: 10,
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 650 }}>Pairing invite</div>
                <textarea
                  aria-label="Pairing invite text"
                  readOnly
                  value={pairingInviteOutput}
                  rows={4}
                  style={{
                    width: '100%',
                    minWidth: 0,
                    resize: 'vertical',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-base)',
                    color: 'var(--text-primary)',
                    padding: '7px 8px',
                    font: 'inherit',
                    fontSize: 12,
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard?.writeText(pairingInviteOutput)}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-white-04)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '6px 9px',
                      fontSize: 12,
                    }}
                  >
                    Copy invite
                  </button>
                  <button
                    type="button"
                    onClick={() => setPairingInviteOutput('')}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '6px 9px',
                      fontSize: 12,
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
            {approveDeviceLabelOpen && (
              <form
                aria-label="Approve local pairing"
                onSubmit={event => {
                  event.preventDefault()
                  void approveCurrentPairing(approveDeviceLabel)
                }}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-white-02)',
                  padding: 10,
                  display: 'grid',
                  gap: 8,
                }}
              >
                <label style={{ display: 'grid', gap: 5 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Device label</span>
                  <input
                    type="text"
                    aria-label="Device label"
                    value={approveDeviceLabel}
                    onChange={event => setApproveDeviceLabel(event.target.value)}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-base)',
                      color: 'var(--text-primary)',
                      padding: '7px 8px',
                      font: 'inherit',
                      fontSize: 12,
                      minWidth: 0,
                    }}
                  />
                </label>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setApproveDeviceLabelOpen(false)}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '6px 9px',
                      fontSize: 12,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={pairingBusy}
                    style={{
                      border: '1px solid var(--accent-a20)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--accent-a12)',
                      color: 'var(--accent)',
                      cursor: pairingBusy ? 'wait' : 'pointer',
                      padding: '6px 9px',
                      fontSize: 12,
                      fontWeight: 650,
                    }}
                  >
                    Approve pairing
                  </button>
                </div>
              </form>
            )}
            {acceptInviteOpen && (
              <form
                aria-label="Accept pairing invite"
                onSubmit={event => {
                  event.preventDefault()
                  void acceptPairingInvite(acceptInviteValue)
                }}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-white-02)',
                  padding: 10,
                  display: 'grid',
                  gap: 8,
                }}
              >
                <label style={{ display: 'grid', gap: 5 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Pairing invite</span>
                  <textarea
                    aria-label="Pairing invite"
                    value={acceptInviteValue}
                    onChange={event => setAcceptInviteValue(event.target.value)}
                    rows={4}
                    style={{
                      width: '100%',
                      minWidth: 0,
                      resize: 'vertical',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-base)',
                      color: 'var(--text-primary)',
                      padding: '7px 8px',
                      font: 'inherit',
                      fontSize: 12,
                    }}
                  />
                </label>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setAcceptInviteOpen(false)}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '6px 9px',
                      fontSize: 12,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={pairingBusy || !acceptInviteValue.trim()}
                    style={{
                      border: '1px solid var(--accent-a20)',
                      borderRadius: 'var(--radius-sm)',
                      background: acceptInviteValue.trim() ? 'var(--accent-a12)' : 'var(--bg-muted)',
                      color: acceptInviteValue.trim() ? 'var(--accent)' : 'var(--text-muted)',
                      cursor: pairingBusy ? 'wait' : acceptInviteValue.trim() ? 'pointer' : 'not-allowed',
                      padding: '6px 9px',
                      fontSize: 12,
                      fontWeight: 650,
                    }}
                  >
                    Accept pairing
                  </button>
                </div>
              </form>
            )}
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
  notes,
  loading,
  error,
  onRefresh,
  onOpenNote,
  onSuggestRemote,
  onReviewMerge,
  onKeepLocal,
  onClose,
}: {
  status: VaultStatus | null
  auditEvents: VaultAuditEvent[]
  syncLedger: VaultSyncLedger | null
  notes: VaultNote[]
  loading: boolean
  error: string | null
  onRefresh: () => void
  onOpenNote: (noteId: string) => void
  onSuggestRemote: (state: VaultSyncLedger['sync_states'][number]) => void
  onReviewMerge: (state: VaultSyncLedger['sync_states'][number]) => void
  onKeepLocal: (state: VaultSyncLedger['sync_states'][number]) => void
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
  const noteContentById = useMemo(() => {
    const byId = new Map<string, string>()
    for (const note of notes) {
      if (note.type === 'note') byId.set(note._id, note.content)
    }
    return byId
  }, [notes])
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
  const syncConflicts = (syncLedger?.sync_states ?? []).filter(state => isSyncConflictState(state))

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
              {syncConflicts.length > 0 && (
                <div
                  style={{
                    border: '1px solid var(--red-a20, var(--border))',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    background: 'var(--bg-white-02)',
                  }}
                >
                  <div
                    style={{
                      padding: '8px 10px',
                      color: 'var(--red)',
                      fontSize: 11,
                      fontWeight: 750,
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    Sync conflicts
                  </div>
                  <div style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.45 }}>
                    Review these before trusting remote sync. Local notes remain editable, but the remote provider has
                    unresolved state for the same document.
                  </div>
                  {syncConflicts.map(state => (
                    <SyncConflictRow
                      key={`${state.provider}:${state.remote_id}:${state.local_id}`}
                      state={state}
                      localContent={noteContentById.get(state.local_id) ?? null}
                      onOpenNote={onOpenNote}
                      onSuggestRemote={onSuggestRemote}
                      onReviewMerge={onReviewMerge}
                      onKeepLocal={onKeepLocal}
                    />
                  ))}
                </div>
              )}
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

function SyncConflictRow({
  state,
  localContent,
  onOpenNote,
  onSuggestRemote,
  onReviewMerge,
  onKeepLocal,
}: {
  state: VaultSyncLedger['sync_states'][number]
  localContent: string | null
  onOpenNote: (noteId: string) => void
  onSuggestRemote: (state: VaultSyncLedger['sync_states'][number]) => void
  onReviewMerge: (state: VaultSyncLedger['sync_states'][number]) => void
  onKeepLocal: (state: VaultSyncLedger['sync_states'][number]) => void
}) {
  const payload = JSON.stringify(state.conflict ?? {}, null, 2)
  const remoteContent = remoteConflictContent(state.conflict)
  const baseContent = baseConflictContent(state.conflict)
  const mergedContent = useMemo(
    () => (
      baseContent && remoteContent && localContent !== null
        ? mergeNonOverlappingLineChanges(baseContent, localContent, remoteContent)
        : null
    ),
    [baseContent, localContent, remoteContent],
  )
  const diffRows = useMemo(
    () => (remoteContent && localContent !== null ? buildVersionDiff(localContent, remoteContent) : []),
    [localContent, remoteContent],
  )
  const mergeDiffRows = useMemo(
    () => (mergedContent && localContent !== null ? buildVersionDiff(localContent, mergedContent) : []),
    [localContent, mergedContent],
  )
  const diffSummary = useMemo(() => summarizeVersionDiff(diffRows), [diffRows])
  const mergeDiffSummary = useMemo(() => summarizeVersionDiff(mergeDiffRows), [mergeDiffRows])
  const previewRows = diffRows.filter(row => row.kind !== 'same').slice(0, 8)
  const mergePreviewRows = mergeDiffRows.filter(row => row.kind !== 'same').slice(0, 6)
  return (
    <details
      style={{
        borderTop: '1px solid var(--border)',
        padding: '8px 10px',
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          listStyle: 'none',
          display: 'grid',
          gridTemplateColumns: 'minmax(120px, 1fr) minmax(0, 1.5fr) auto',
          gap: 10,
          alignItems: 'center',
        }}
      >
        <span
          style={{
            color: 'var(--text-secondary)',
            fontSize: 12,
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {state.provider}
        </span>
        <span
          style={{
            color: 'var(--text-muted)',
            fontSize: 11,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {state.local_id || 'vault'} {state.remote_id ? `-> ${state.remote_id}` : ''}
        </span>
        <span
          style={{
            border: '1px solid var(--red-a20, var(--border))',
            borderRadius: '999px',
            color: 'var(--red)',
            fontSize: 10,
            fontWeight: 750,
            padding: '2px 7px',
            whiteSpace: 'nowrap',
          }}
        >
          {state.conflict_state}
        </span>
      </summary>
      <div
        style={{
          display: 'grid',
          gap: 6,
          marginTop: 8,
          color: 'var(--text-muted)',
          fontSize: 11,
          lineHeight: 1.45,
        }}
      >
        <div>{formatSyncConflictSummary(state)}</div>
        <div>
          Remote revision: <strong style={{ color: 'var(--text-secondary)' }}>{state.remote_rev || 'unknown'}</strong>
        </div>
        <div>Last synced: {formatSyncLedgerTimestamp(state.last_synced_at)}</div>
        {baseContent && (
          <div>
            Base version: <strong style={{ color: 'var(--text-secondary)' }}>available for merge review</strong>
          </div>
        )}
        {remoteContent && localContent !== null && (
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              background: 'var(--bg-white-02)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                padding: '6px 8px',
                borderBottom: '1px solid var(--border)',
                color: 'var(--text-muted)',
                fontSize: 11,
                fontWeight: 650,
              }}
            >
              <span>Remote preview</span>
              <span>
                {diffSummary.added} added, {diffSummary.removed} removed
              </span>
            </div>
            <div style={{ display: 'grid' }}>
              {previewRows.length === 0 ? (
                <div style={{ padding: '6px 8px', color: 'var(--text-muted)', fontSize: 11 }}>
                  Remote content matches the local note text.
                </div>
              ) : (
                previewRows.map((row, index) => (
                  <div
                    key={`${row.kind}-${index}-${row.text}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '18px minmax(0, 1fr)',
                      gap: 6,
                      padding: '3px 8px',
                      color: row.kind === 'added' ? 'var(--green)' : 'var(--red)',
                      background:
                        row.kind === 'added'
                          ? 'color-mix(in srgb, var(--green) 9%, transparent)'
                          : 'color-mix(in srgb, var(--red) 8%, transparent)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                    }}
                  >
                    <span>{row.kind === 'added' ? '+' : '-'}</span>
                    <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.text || ' '}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        {mergedContent && localContent !== null && mergedContent !== remoteContent && mergedContent !== localContent && (
          <div
            style={{
              border: '1px solid var(--accent-a20)',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              background: 'color-mix(in srgb, var(--accent) 7%, transparent)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                padding: '6px 8px',
                borderBottom: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              <span>Auto-merge preview</span>
              <span>
                {mergeDiffSummary.added} added, {mergeDiffSummary.removed} removed
              </span>
            </div>
            <div style={{ display: 'grid' }}>
              {mergePreviewRows.length === 0 ? (
                <div style={{ padding: '6px 8px', color: 'var(--text-muted)', fontSize: 11 }}>
                  The merged version matches the local note text.
                </div>
              ) : (
                mergePreviewRows.map((row, index) => (
                  <div
                    key={`merge-${row.kind}-${index}-${row.text}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '18px minmax(0, 1fr)',
                      gap: 6,
                      padding: '3px 8px',
                      color: row.kind === 'added' ? 'var(--green)' : 'var(--red)',
                      background:
                        row.kind === 'added'
                          ? 'color-mix(in srgb, var(--green) 9%, transparent)'
                          : 'color-mix(in srgb, var(--red) 8%, transparent)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                    }}
                  >
                    <span>{row.kind === 'added' ? '+' : '-'}</span>
                    <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.text || ' '}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        {state.local_id && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              onClick={() => onOpenNote(state.local_id)}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '6px 8px',
                fontSize: 12,
              }}
            >
              Open local note
            </button>
            {remoteContent && (
              <button
                type="button"
                onClick={() => onSuggestRemote(state)}
                style={{
                  border: '1px solid var(--accent-a20)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent-a12)',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  padding: '6px 8px',
                  fontSize: 12,
                  fontWeight: 650,
                }}
              >
                Suggest remote version
              </button>
            )}
            {remoteContent && localContent !== null && (
              <button
                type="button"
                onClick={() => onReviewMerge(state)}
                style={{
                  border: '1px solid var(--accent-a20)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent-a12)',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  padding: '6px 8px',
                  fontSize: 12,
                  fontWeight: 650,
                }}
              >
                Review merge
              </button>
            )}
            <button
              type="button"
              onClick={() => onKeepLocal(state)}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-white-04)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '6px 8px',
                fontSize: 12,
              }}
            >
              Keep local version
            </button>
          </div>
        )}
        {payload !== '{}' && (
          <pre
            style={{
              margin: 0,
              maxHeight: 170,
              overflow: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-base)',
              color: 'var(--text-secondary)',
              padding: 8,
              fontSize: 11,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {payload}
          </pre>
        )}
      </div>
    </details>
  )
}

function SyncConflictMergeDialog({
  request,
  saving,
  onCreate,
  onCancel,
}: {
  request: MergeConflictReviewRequest
  saving: boolean
  onCreate: (content: string) => void
  onCancel: () => void
}) {
  const [content, setContent] = useState(request.initialContent)
  useEffect(() => {
    setContent(request.initialContent)
  }, [request])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const canCreate = content.trim().length > 0 && content.trimEnd() !== request.localContent.trimEnd()
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review sync merge"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'calc(var(--z-modal) + 1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <section
        style={{
          width: 'min(860px, calc(100vw - 32px))',
          maxHeight: 'min(820px, calc(100vh - 32px))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-panel)',
          boxShadow: '0 24px 80px var(--overlay-heavy)',
        }}
      >
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Review sync merge</div>
          <div style={{ marginTop: 3, color: 'var(--text-muted)', fontSize: 12 }}>
            {request.noteTitle} · {request.state.provider} · {request.state.remote_id}
          </div>
        </div>
        <div style={{ overflow: 'auto', padding: 14, display: 'grid', gap: 10 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 8,
            }}
          >
            <MergeSourcePreview label="Local" content={request.localContent} />
            <MergeSourcePreview label="Remote" content={request.remoteContent} />
            <MergeSourcePreview label="Base" content={request.baseContent ?? 'No base version in conflict payload.'} />
          </div>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700 }}>
              Merged Markdown
            </span>
            <textarea
              aria-label="Merged Markdown"
              value={content}
              autoFocus
              onChange={event => setContent(event.target.value)}
              style={{
                minHeight: 280,
                width: '100%',
                resize: 'vertical',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                padding: 10,
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                lineHeight: 1.55,
              }}
            />
          </label>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.45 }}>
            {request.autoMerged
              ? 'Started from an automatic non-overlapping line merge. Edit before creating the review suggestion.'
              : 'Started from local and remote conflict sections. Replace the markers with the final text before accepting later.'}
          </div>
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
            onClick={onCancel}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '7px 11px',
              fontSize: 12,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canCreate || saving}
            onClick={() => onCreate(content)}
            style={{
              border: '1px solid var(--accent-a20)',
              borderRadius: 'var(--radius-sm)',
              background: canCreate ? 'var(--accent-a12)' : 'var(--bg-muted)',
              color: canCreate ? 'var(--accent)' : 'var(--text-muted)',
              cursor: saving ? 'wait' : canCreate ? 'pointer' : 'not-allowed',
              padding: '7px 11px',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Create merge suggestion
          </button>
        </div>
      </section>
    </div>
  )
}

function MergeSourcePreview({ label, content }: { label: string; content: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, marginBottom: 5 }}>{label}</div>
      <pre
        style={{
          margin: 0,
          minHeight: 92,
          maxHeight: 130,
          overflow: 'auto',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-white-02)',
          color: 'var(--text-secondary)',
          padding: 8,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        {content}
      </pre>
    </div>
  )
}

function isSyncConflictState(state: VaultSyncLedger['sync_states'][number]): boolean {
  return state.conflict_state !== 'clean' || Object.keys(state.conflict ?? {}).length > 0
}

function formatSyncConflictSummary(state: VaultSyncLedger['sync_states'][number]): string {
  const conflict = state.conflict ?? {}
  const keys = Object.keys(conflict)
  if (keys.length === 0) return 'Remote sync reported a conflict without structured details.'
  const local = conflict.local_rev || conflict.local || conflict.localRevision
  const remote = conflict.remote_rev || conflict.remote || conflict.remoteRevision
  if (local || remote) {
    return `Conflict details include local ${String(local || 'unknown')} and remote ${String(remote || 'unknown')}.`
  }
  return `Conflict details: ${keys.slice(0, 4).join(', ')}${keys.length > 4 ? ', ...' : ''}.`
}

function formatSyncLedgerTimestamp(value: number | null | undefined): string {
  if (!value) return 'Not synced'
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function remoteConflictContent(conflict: Record<string, unknown>): string | null {
  const candidates = [
    conflict.remote_markdown,
    conflict.remoteMarkdown,
    conflict.remote_content,
    conflict.remoteContent,
    conflict.remote_content_markdown,
    conflict.remoteContentMarkdown,
    conflict.remote_body,
    conflict.remoteBody,
    objectValue(conflict.remote)?.content,
    objectValue(conflict.remote)?.content_markdown,
    objectValue(conflict.remote)?.markdown,
    objectValue(conflict.remote_document)?.content,
    objectValue(conflict.remote_document)?.content_markdown,
    objectValue(conflict.remoteDocument)?.content,
    objectValue(conflict.remoteDocument)?.content_markdown,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }
  return null
}

function baseConflictContent(conflict: Record<string, unknown>): string | null {
  const candidates = [
    conflict.base_markdown,
    conflict.baseMarkdown,
    conflict.base_content,
    conflict.baseContent,
    conflict.base_content_markdown,
    conflict.baseContentMarkdown,
    conflict.base_body,
    conflict.baseBody,
    conflict.ancestor_markdown,
    conflict.ancestorMarkdown,
    conflict.common_ancestor_markdown,
    conflict.commonAncestorMarkdown,
    objectValue(conflict.base)?.content,
    objectValue(conflict.base)?.content_markdown,
    objectValue(conflict.base)?.markdown,
    objectValue(conflict.ancestor)?.content,
    objectValue(conflict.ancestor)?.content_markdown,
    objectValue(conflict.ancestor)?.markdown,
    objectValue(conflict.common_ancestor)?.content,
    objectValue(conflict.common_ancestor)?.content_markdown,
    objectValue(conflict.common_ancestor)?.markdown,
    objectValue(conflict.commonAncestor)?.content,
    objectValue(conflict.commonAncestor)?.content_markdown,
    objectValue(conflict.commonAncestor)?.markdown,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }
  return null
}

function mergedSyncConflictContent(state: VaultSyncLedger['sync_states'][number], localContent: string): string | null {
  const baseContent = baseConflictContent(state.conflict)
  const remoteContent = remoteConflictContent(state.conflict)
  if (!baseContent || !remoteContent) return null
  const merged = mergeNonOverlappingLineChanges(baseContent, localContent, remoteContent)
  if (!merged || merged === localContent || merged === remoteContent) return null
  return merged
}

function conflictMarkedMergeContent(localContent: string, remoteContent: string, provider: string): string {
  return [
    '<<<<<<< LOCAL',
    localContent.trimEnd(),
    '=======',
    remoteContent.trimEnd(),
    `>>>>>>> REMOTE ${provider}`,
    '',
  ].join('\n')
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
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

function UnavailableNotesState({ count, onRetry }: { count: number; onRetry: () => void }) {
  return (
    <div
      data-testid="unavailable-notes-state"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 12,
        color: 'var(--text-muted)',
        padding: 28,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 10,
          background: 'var(--bg-white-02)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CloudSlash size={21} style={{ opacity: 0.45, color: 'var(--text-muted)' }} />
      </div>
      <div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, marginBottom: 5 }}>
          Note bodies are still loading
        </div>
        <div style={{ maxWidth: 400, fontSize: 12, lineHeight: 1.6, opacity: 0.72 }}>
          {count} cached title{count === 1 ? ' is' : 's are'} visible in the sidebar, but editing is locked until the local vault returns the real file content.
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          background: 'var(--bg-white-04)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          padding: '7px 13px',
          fontSize: 12,
        }}
      >
        <ArrowClockwise size={13} />
        Retry loading
      </button>
    </div>
  )
}
