import { useState, useMemo, useCallback, useEffect, useRef, memo, type ReactNode } from 'react'
import {
  CaretRight,
  CaretDown,
  FileText,
  FolderOpen,
  Folder,
  Plus,
  MagnifyingGlass,
  Image,
  FolderPlus,
  Trash,
  Copy,
  PencilSimple,
  NotePencil,
  Star,
  X,
  SlidersHorizontal,
  Cloud,
  CloudSlash,
  ArrowClockwise,
  SquaresFour,
} from '@phosphor-icons/react'
import { ContextMenu, type ContextMenuState, type ContextMenuItem } from '@/components/ContextMenu'
import type { VaultFolder, VaultNote, FolderNode } from './types'
import type { NoteTemplate } from './templates'
import type { NotesSavedSearch } from '@/features/notes/savedSearches'
import { buildTagRows } from '@/features/notes/tags'
import {
  matchesNoteSearch,
  matchesNoteSearchFilters,
  noteSearchMatchSummary,
  noteSearchRank,
  searchHighlightTerms,
} from './searchFilters'
import { NOTES_TRASH_FOLDER, isNotesTrashPath, noteFolderPath, normalizeNotesFolderPath } from './trash'

interface FileTreeProps {
  notes: VaultNote[]
  folders?: VaultFolder[]
  templates?: NoteTemplate[]
  pinnedNoteIds?: Set<string>
  unavailableNoteIds?: Set<string>
  recentNoteIds?: string[]
  recentLimit?: number
  onRecentLimitChange?: (limit: number) => void
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenInSidePane?: (id: string) => void
  onUnavailableNoteSelect?: (id: string) => void
  onCreate: (folder?: string) => void
  onCreateFolder: (parent?: string) => void
  onDelete: (id: string) => void
  onDeleteFolder: (path: string) => void
  onRestoreFolder: (path: string) => void
  onRename: (id: string) => void
  onRenameFolder: (path: string) => void
  onDuplicate: (id: string) => void
  onMove: (id: string) => void
  onMoveToFolder: (id: string, folder: string) => void
  onRestoreNoteToFolder: (id: string, folder: string) => void
  onCreateDailyNote: (folder?: string) => void
  onCreateTemplate: (folder: string | undefined, templateId: string) => void
  onCopyMarkdown: (id: string) => void
  onExportMarkdown: (id: string) => void
  onTogglePin: (id: string) => void
  onRenameTag?: (tag: string) => void
  expandedFolders?: Set<string>
  onExpandedFoldersChange?: (paths: string[]) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  searchUsesBackend?: boolean
  savedSearches?: NotesSavedSearch[]
  savedSearchSyncLabel?: string
  savedSearchSyncDetail?: string
  savedSearchSyncError?: boolean
  onSaveSearch?: () => void
  onRemoveSavedSearch?: (id: string) => void
  onRetrySavedSearchSync?: () => void
}

const TEMPLATE_CONTEXT_MENU_LIMIT = 8
const TRASH_FOLDER = NOTES_TRASH_FOLDER

function sameStringSet(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false
  for (const value of left) {
    if (!right.has(value)) return false
  }
  return true
}

export type NoteDropAction =
  | { type: 'ignore' }
  | { type: 'move'; id: string; folder: string }
  | { type: 'trash'; id: string }
  | { type: 'restore'; id: string; folder: string }

export type FolderDropAction = { type: 'ignore' } | { type: 'trash'; path: string }

export function resolveNoteDropAction(notes: VaultNote[], noteId: string, targetFolder: string): NoteDropAction {
  const note = notes.find(item => item._id === noteId)
  if (!note || note.type !== 'note') return { type: 'ignore' }

  const target = normalizeNotesFolderPath(targetFolder)
  const current = noteFolderPath(note)
  const targetIsTrash = isNotesTrashPath(target)
  const currentIsTrash = isNotesTrashPath(current)

  if (targetIsTrash) {
    if (currentIsTrash) return { type: 'ignore' }
    return { type: 'trash', id: noteId }
  }

  if (currentIsTrash) return { type: 'restore', id: noteId, folder: target }
  if (current === target) return { type: 'ignore' }
  return { type: 'move', id: noteId, folder: target }
}

export function resolveFolderDropAction(folderPath: string, targetFolder: string): FolderDropAction {
  const source = normalizeNotesFolderPath(folderPath)
  const target = normalizeNotesFolderPath(targetFolder)
  if (!source || !target || source === target) return { type: 'ignore' }
  if (isNotesTrashPath(source)) return { type: 'ignore' }
  if (!isNotesTrashPath(target)) return { type: 'ignore' }
  return { type: 'trash', path: source }
}

function ensureFolder(root: FolderNode, path: string): FolderNode {
  const parts = normalizeNotesFolderPath(path).split('/').filter(Boolean)
  let current = root
  for (const part of parts) {
    let child = current.children.find(c => c.name.toLowerCase() === part.toLowerCase())
    if (!child) {
      child = {
        name: part,
        path: current.path ? `${current.path}/${part}` : part,
        children: [],
        notes: [],
        isExpanded: true,
      }
      current.children.push(child)
    }
    current = child
  }
  return current
}

function folderAncestorPaths(path: string): string[] {
  const parts = normalizeNotesFolderPath(path).split('/').filter(Boolean)
  const paths = ['']
  let current = ''
  for (const part of parts) {
    current = current ? `${current}/${part}` : part
    paths.push(current)
  }
  return paths
}

export function buildTree(
  notes: VaultNote[],
  folders: VaultFolder[],
  options: { includeTrash?: boolean; sortNotes?: (a: VaultNote, b: VaultNote) => number } = {},
): FolderNode {
  const root: FolderNode = { name: 'vault', path: '', children: [], notes: [], isExpanded: true }
  const folderPaths = new Map<string, string>()
  const addFolderPath = (path: string) => {
    const normalized = normalizeNotesFolderPath(path)
    if (!normalized) return
    const key = normalized.toLowerCase()
    if (!folderPaths.has(key)) folderPaths.set(key, normalized)
  }

  for (const folder of folders) {
    addFolderPath(folder.path)
  }

  for (const note of notes) {
    addFolderPath(noteFolderPath(note))
  }

  if (options.includeTrash || [...folderPaths.values()].some(isNotesTrashPath)) {
    addFolderPath(TRASH_FOLDER)
  }

  for (const path of folderPaths.values()) {
    ensureFolder(root, path)
  }

  for (const note of notes) {
    const current = ensureFolder(root, noteFolderPath(note))
    current.notes.push(note)
  }

  const sortNode = (node: FolderNode) => {
    node.children.sort((a, b) => a.name.localeCompare(b.name))
    node.notes.sort(options.sortNotes ?? ((a, b) => b.updated_at - a.updated_at))
    node.children.forEach(sortNode)
  }
  sortNode(root)
  return root
}

function highlightedTitleParts(text: string, terms: string[]): ReactNode {
  const cleanTerms = terms.filter(Boolean)
  if (cleanTerms.length === 0 || !text) return text

  const ranges: Array<{ start: number; end: number }> = []
  const lower = text.toLowerCase()
  for (const term of cleanTerms) {
    let from = 0
    while (from < lower.length) {
      const start = lower.indexOf(term, from)
      if (start === -1) break
      ranges.push({ start, end: start + term.length })
      from = start + Math.max(1, term.length)
    }
  }
  if (ranges.length === 0) return text

  const merged = ranges
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .reduce<Array<{ start: number; end: number }>>((next, range) => {
      const previous = next[next.length - 1]
      if (!previous || range.start > previous.end) {
        next.push({ ...range })
      } else {
        previous.end = Math.max(previous.end, range.end)
      }
      return next
    }, [])

  const parts: ReactNode[] = []
  let cursor = 0
  for (const range of merged) {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start))
    parts.push(
      <mark
        key={`${range.start}-${range.end}`}
        style={{
          background: 'color-mix(in srgb, var(--accent) 22%, transparent)',
          color: 'inherit',
          borderRadius: 2,
          padding: '0 1px',
        }}
      >
        {text.slice(range.start, range.end)}
      </mark>,
    )
    cursor = range.end
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts
}

const FolderItem = memo(function FolderItem({
  node,
  depth,
  selectedId,
  pinnedNoteIds,
  unavailableNoteIds,
  expandedFolders,
  onToggle,
  onSelect,
  onUnavailableNoteSelect,
  onCreate,
  onCreateFolder,
  onDropNote,
  onDropFolder,
  onContextMenu,
  onNoteContextMenu,
  highlightTerms,
  searchQuery,
}: {
  node: FolderNode
  depth: number
  selectedId: string | null
  pinnedNoteIds: Set<string>
  unavailableNoteIds: Set<string>
  expandedFolders: Set<string>
  onToggle: (path: string) => void
  onSelect: (id: string) => void
  onUnavailableNoteSelect?: (id: string) => void
  onCreate: (folder?: string) => void
  onCreateFolder: (parent?: string) => void
  onDropNote: (id: string, folder: string) => void
  onDropFolder: (path: string, folder: string) => void
  onContextMenu: (node: FolderNode, e: React.MouseEvent) => void
  onNoteContextMenu: (note: VaultNote, e: React.MouseEvent) => void
  highlightTerms: string[]
  searchQuery: string
}) {
  const isExpanded = expandedFolders.has(node.path)
  const pl = 10 + Math.max(0, depth - 1) * 16
  const inTrash = isNotesTrashPath(node.path)
  const FolderIcon = node.path === TRASH_FOLDER ? Trash : isExpanded ? FolderOpen : Folder

  return (
    <>
      {depth > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            borderRadius: 'var(--radius-sm)',
            marginBottom: 1,
            background: 'transparent',
          }}
          className="hover-bg"
          onContextMenu={e => onContextMenu(node, e)}
          draggable={!inTrash}
          onDragStart={event => {
            if (inTrash) return
            event.dataTransfer.setData('application/x-clawctrl-folder', node.path)
            event.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={event => {
            const hasNote = event.dataTransfer.types.includes('application/x-clawctrl-note')
            const hasFolder = event.dataTransfer.types.includes('application/x-clawctrl-folder')
            if (hasNote || (hasFolder && isNotesTrashPath(node.path))) event.preventDefault()
          }}
          onDrop={event => {
            const noteId = event.dataTransfer.getData('application/x-clawctrl-note')
            const folderPath = event.dataTransfer.getData('application/x-clawctrl-folder')
            if (!noteId && !folderPath) return
            if (noteId) {
              event.preventDefault()
              onDropNote(noteId, node.path)
              return
            }
            if (folderPath && isNotesTrashPath(node.path)) {
              event.preventDefault()
              onDropFolder(folderPath, node.path)
            }
          }}
        >
          <button
            onClick={() => onToggle(node.path)}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.name}`}
            aria-expanded={isExpanded}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flex: 1,
              minWidth: 0,
              padding: '5px 8px',
              paddingLeft: pl,
              background: 'transparent',
              border: 'none',
              borderRadius: 0,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
              textAlign: 'left',
            }}
          >
            {isExpanded ? (
              <CaretDown size={10} style={{ opacity: 0.5, flexShrink: 0 }} />
            ) : (
              <CaretRight size={10} style={{ opacity: 0.5, flexShrink: 0 }} />
            )}
            <FolderIcon size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
          </button>
          {!inTrash && (
            <>
              <button
                type="button"
                title="New note"
                aria-label={`New note in ${node.name}`}
                onClick={() => onCreate(node.path)}
                className="hover-bg"
                style={{
                  width: 24,
                  height: 24,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--radius-sm)',
                  flexShrink: 0,
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <NotePencil size={11} style={{ opacity: 0.45 }} />
              </button>
              <button
                type="button"
                title="New folder"
                aria-label={`New folder in ${node.name}`}
                onClick={() => onCreateFolder(node.path)}
                className="hover-bg"
                style={{
                  width: 24,
                  height: 24,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--radius-sm)',
                  flexShrink: 0,
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <FolderPlus size={11} style={{ opacity: 0.45 }} />
              </button>
            </>
          )}
        </div>
      )}

      {(depth === 0 || isExpanded) && (
        <>
          {node.children.map(child => (
            <FolderItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              pinnedNoteIds={pinnedNoteIds}
              unavailableNoteIds={unavailableNoteIds}
              expandedFolders={expandedFolders}
              onToggle={onToggle}
              onSelect={onSelect}
              onUnavailableNoteSelect={onUnavailableNoteSelect}
              onCreate={onCreate}
              onCreateFolder={onCreateFolder}
              onDropNote={onDropNote}
              onDropFolder={onDropFolder}
              onContextMenu={onContextMenu}
              onNoteContextMenu={onNoteContextMenu}
              highlightTerms={highlightTerms}
              searchQuery={searchQuery}
            />
          ))}
          {node.notes.map(note => (
            <NoteItem
              key={note._id}
              note={note}
              depth={depth + 1}
              isSelected={selectedId === note._id}
              isPinned={pinnedNoteIds.has(note._id)}
              isUnavailable={unavailableNoteIds.has(note._id)}
              onSelect={onSelect}
              onUnavailableSelect={onUnavailableNoteSelect}
              onContextMenu={onNoteContextMenu}
              highlightTerms={highlightTerms}
              searchQuery={searchQuery}
            />
          ))}
        </>
      )}
    </>
  )
})

const NoteItem = memo(function NoteItem({
  note,
  depth,
  isSelected,
  isPinned = false,
  isUnavailable = false,
  onSelect,
  onUnavailableSelect,
  onContextMenu,
  highlightTerms,
  searchQuery,
}: {
  note: VaultNote
  depth: number
  isSelected: boolean
  isPinned?: boolean
  isUnavailable?: boolean
  onSelect: (id: string) => void
  onUnavailableSelect?: (id: string) => void
  onContextMenu: (note: VaultNote, e: React.MouseEvent) => void
  highlightTerms: string[]
  searchQuery: string
}) {
  const pl = 10 + depth * 16
  const hasTags = note.tags.length > 0
  const hasLinks = note.links.length > 0
  const isAttachment = note.type === 'attachment'
  const ext = isAttachment ? note._id.split('.').pop()?.toUpperCase() : null
  const Icon = isAttachment ? Image : FileText
  const matchSummary = searchQuery.trim() ? noteSearchMatchSummary(note, searchQuery) : ''
  const noteTitle = note.title || 'Untitled'

  return (
    <button
      type="button"
      onClick={() => {
        if (isUnavailable) {
          onUnavailableSelect?.(note._id)
          return
        }
        onSelect(note._id)
      }}
      onContextMenu={e => onContextMenu(note, e)}
      draggable={note.type === 'note' && !isUnavailable}
      onDragStart={event => {
        if (note.type !== 'note' || isUnavailable) return
        event.dataTransfer.setData('application/x-clawctrl-note', note._id)
        event.dataTransfer.effectAllowed = 'move'
      }}
      aria-disabled={isUnavailable}
      aria-label={isUnavailable ? `${noteTitle} body unavailable` : undefined}
      title={isUnavailable ? 'Note title is cached, but the body is still loading from the local vault.' : undefined}
      className={isSelected ? '' : 'hover-bg'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '6px 10px',
        paddingLeft: pl,
        background: isSelected ? 'var(--bg-white-04)' : 'transparent',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        color: isUnavailable ? 'var(--text-muted)' : isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
        cursor: isUnavailable ? 'progress' : 'pointer',
        textAlign: 'left',
        fontSize: 13,
        fontWeight: isSelected ? 500 : 400,
        marginBottom: 1,
        opacity: isUnavailable ? 0.68 : 1,
        transition: 'background var(--duration-fast) var(--ease-spring)',
        position: 'relative',
      }}
    >
      <Icon
        size={14}
        style={{
          flexShrink: 0,
          opacity: isUnavailable ? 0.45 : isSelected ? 0.7 : 0.3,
          color: isUnavailable ? 'var(--amber)' : isAttachment ? 'var(--accent)' : 'var(--text-muted)',
        }}
      />
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          minWidth: 0,
        }}
      >
        {highlightedTitleParts(noteTitle, highlightTerms)}
      </span>
      {isUnavailable && (
        <span
          style={{
            flexShrink: 0,
            color: 'var(--amber)',
            fontSize: 9,
            fontWeight: 650,
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            opacity: 0.75,
          }}
        >
          loading
        </span>
      )}
      {matchSummary && (
        <span
          title={matchSummary}
          aria-hidden="true"
          style={{
            color: 'var(--text-muted)',
            flex: '0 1 42%',
            fontSize: 10.5,
            fontWeight: 500,
            minWidth: 24,
            opacity: 0.7,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {matchSummary}
        </span>
      )}
      {ext && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.04em',
            color: 'var(--text-muted)',
            opacity: 0.5,
            flexShrink: 0,
          }}
        >
          {ext}
        </span>
      )}
      {!isAttachment && (hasTags || hasLinks) && (
        <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          {hasLinks && (
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'var(--accent)',
                opacity: 0.4,
              }}
            />
          )}
        </span>
      )}
      {isPinned && (
        <Star
          size={11}
          weight="fill"
          style={{
            color: 'var(--amber)',
            opacity: 0.8,
            flexShrink: 0,
          }}
        />
      )}
    </button>
  )
})

export default function FileTree({
  notes,
  folders = [],
  templates = [],
  pinnedNoteIds = new Set(),
  unavailableNoteIds = new Set(),
  recentNoteIds = [],
  recentLimit = 5,
  onRecentLimitChange,
  selectedId,
  onSelect,
  onOpenInSidePane,
  onUnavailableNoteSelect,
  onCreate,
  onCreateFolder,
  onDelete,
  onDeleteFolder,
  onRestoreFolder,
  onRename,
  onRenameFolder,
  onDuplicate,
  onMove,
  onMoveToFolder,
  onRestoreNoteToFolder,
  onCreateDailyNote,
  onCreateTemplate,
  onCopyMarkdown,
  onExportMarkdown,
  onTogglePin,
  onRenameTag,
  expandedFolders: controlledExpandedFolders,
  onExpandedFoldersChange,
  searchQuery,
  onSearchChange,
  searchUsesBackend = false,
  savedSearches = [],
  savedSearchSyncLabel,
  savedSearchSyncDetail,
  savedSearchSyncError = false,
  onSaveSearch,
  onRemoveSavedSearch,
  onRetrySavedSearchSync,
}: FileTreeProps) {
  const [localExpandedFolders, setLocalExpandedFolders] = useState<Set<string>>(new Set(['']))
  const expandedFolders = controlledExpandedFolders ?? localExpandedFolders
  const seenUnavailableFolderPathsRef = useRef<Set<string>>(new Set(['']))
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  const [recentSettingsOpen, setRecentSettingsOpen] = useState(false)
  const normalizedRecentLimit = Math.max(1, Math.min(10, Number(recentLimit) || 5))
  const menuTemplates = useMemo(
    () => templates.filter(template => template.source === 'vault').slice(0, TEMPLATE_CONTEXT_MENU_LIMIT),
    [templates],
  )
  const highlightTerms = useMemo(() => searchHighlightTerms(searchQuery), [searchQuery])
  const searchNoteSort = useMemo(() => {
    if (!searchQuery.trim()) return undefined
    return (a: VaultNote, b: VaultNote) => {
      const rankDelta = noteSearchRank(b, searchQuery) - noteSearchRank(a, searchQuery)
      return rankDelta || b.updated_at - a.updated_at
    }
  }, [searchQuery])

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes
    const matches = searchUsesBackend ? matchesNoteSearchFilters : matchesNoteSearch
    return notes.filter(note => matches(note, searchQuery))
  }, [notes, searchQuery, searchUsesBackend])

  const tagRows = useMemo(() => buildTagRows(notes, 32), [notes])

  const visibleFolders = useMemo(() => {
    if (!searchQuery.trim()) return folders
    const q = searchQuery.toLowerCase()
    return folders.filter(f => f.path.toLowerCase().includes(q))
  }, [folders, searchQuery])
  const activeNotes = useMemo(
    () => filteredNotes.filter(note => !isNotesTrashPath(noteFolderPath(note))),
    [filteredNotes],
  )
  const activeFolders = useMemo(
    () => visibleFolders.filter(folder => !isNotesTrashPath(folder.path)),
    [visibleFolders],
  )
  const trashNotes = useMemo(
    () => notes.filter(note => isNotesTrashPath(noteFolderPath(note))),
    [notes],
  )
  const trashFolders = useMemo(
    () => folders.filter(folder => isNotesTrashPath(folder.path)),
    [folders],
  )

  const tree = useMemo(
    () => buildTree(activeNotes, activeFolders, { sortNotes: searchNoteSort }),
    [activeFolders, activeNotes, searchNoteSort],
  )
  const trashTree = useMemo(
    () => buildTree(trashNotes, trashFolders, { includeTrash: true }),
    [trashFolders, trashNotes],
  )

  const unavailableFolderPaths = useMemo(() => {
    const paths = new Set<string>([''])
    for (const note of notes) {
      if (!unavailableNoteIds.has(note._id)) continue
      const parts = noteFolderPath(note).split('/').filter(Boolean)
      let path = ''
      for (const part of parts) {
        path = path ? `${path}/${part}` : part
        paths.add(path)
      }
    }
    return paths
  }, [notes, unavailableNoteIds])

  const selectedFolderPaths = useMemo(() => {
    if (!selectedId) return []
    const selectedNote = notes.find(note => note._id === selectedId)
    if (!selectedNote) return []
    return folderAncestorPaths(noteFolderPath(selectedNote))
  }, [notes, selectedId])

  const updateExpandedFolders = useCallback(
    (updater: (previous: Set<string>) => Set<string>) => {
      const previous = controlledExpandedFolders ?? localExpandedFolders
      const next = updater(previous)
      if (sameStringSet(previous, next)) return
      if (controlledExpandedFolders) {
        onExpandedFoldersChange?.([...next].sort())
        return
      }
      setLocalExpandedFolders(next)
    },
    [controlledExpandedFolders, localExpandedFolders, onExpandedFoldersChange],
  )

  useEffect(() => {
    let hasNewPath = false
    for (const path of unavailableFolderPaths) {
      if (!seenUnavailableFolderPathsRef.current.has(path)) {
        seenUnavailableFolderPathsRef.current.add(path)
        hasNewPath = true
      }
    }
    if (!hasNewPath) return
    updateExpandedFolders(prev => {
      const next = new Set(prev)
      for (const path of unavailableFolderPaths) next.add(path)
      return next
    })
  }, [unavailableFolderPaths, updateExpandedFolders])

  useEffect(() => {
    if (selectedFolderPaths.length === 0) return
    updateExpandedFolders(prev => {
      let changed = false
      const next = new Set(prev)
      for (const path of selectedFolderPaths) {
        if (next.has(path)) continue
        next.add(path)
        changed = true
      }
      return changed ? next : prev
    })
  }, [selectedFolderPaths, updateExpandedFolders])

  const pinnedNotes = useMemo(
    () => notes.filter(note => pinnedNoteIds.has(note._id)).sort((a, b) => b.updated_at - a.updated_at),
    [notes, pinnedNoteIds],
  )

  const recentNotes = useMemo(() => {
    const byId = new Map(notes.map(note => [note._id, note]))
    return recentNoteIds
      .map(id => byId.get(id))
      .filter((note): note is VaultNote => !!note && !pinnedNoteIds.has(note._id))
      .slice(0, normalizedRecentLimit)
  }, [notes, pinnedNoteIds, normalizedRecentLimit, recentNoteIds])

  const trashCount = useMemo(
    () =>
      notes.filter(note => isNotesTrashPath(noteFolderPath(note))).length +
      folders.filter(folder => isNotesTrashPath(folder.path)).length,
    [folders, notes],
  )

  const toggleFolder = useCallback((path: string) => {
    updateExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [updateExpandedFolders])

  const copyText = useCallback((text: string) => {
    void navigator.clipboard?.writeText(text)
  }, [])

  const handleDropNote = useCallback(
    (noteId: string, folder: string) => {
      const action = resolveNoteDropAction(notes, noteId, folder)
      if (action.type === 'move') onMoveToFolder(action.id, action.folder)
      if (action.type === 'trash') onDelete(action.id)
      if (action.type === 'restore') onRestoreNoteToFolder(action.id, action.folder)
    },
    [notes, onDelete, onMoveToFolder, onRestoreNoteToFolder],
  )

  const handleDropFolder = useCallback(
    (folderPath: string, folder: string) => {
      const action = resolveFolderDropAction(folderPath, folder)
      if (action.type === 'trash') onDeleteFolder(action.path)
    },
    [onDeleteFolder],
  )

  const templateMenuItems = useCallback(
    (folder: string | undefined): ContextMenuItem[] => {
      const items = menuTemplates.map<ContextMenuItem>(template => ({
        label: `New from ${template.label}`,
        icon: FileText,
        onClick: () => onCreateTemplate(folder, template.id),
      }))

      if (templates.length > menuTemplates.length) {
        items.push({
          label: `${templates.length - menuTemplates.length} more templates in command palette`,
          onClick: () => {},
          disabled: true,
        })
      }

      return items
    },
    [menuTemplates, onCreateTemplate, templates.length],
  )

  const openFolderMenu = useCallback(
    (node: FolderNode, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const inTrash = isNotesTrashPath(node.path)
      const items: ContextMenuItem[] = [
        ...(!inTrash
          ? ([
              {
                label: 'New Note',
                icon: NotePencil,
                onClick: () => onCreate(node.path),
              },
              {
                label: 'New Daily Note',
                icon: FileText,
                onClick: () => onCreateDailyNote(node.path),
              },
              {
                label: 'New Meeting Note',
                icon: FileText,
                onClick: () => onCreateTemplate(node.path, 'meeting'),
              },
              {
                label: 'New Project Brief',
                icon: FileText,
                onClick: () => onCreateTemplate(node.path, 'project'),
              },
              ...templateMenuItems(node.path),
              {
                label: 'New Folder',
                icon: FolderPlus,
                onClick: () => onCreateFolder(node.path),
              },
            ] satisfies ContextMenuItem[])
          : []),
        {
          label: 'Rename Folder',
          icon: PencilSimple,
          onClick: () => onRenameFolder(node.path),
          disabled: inTrash,
        },
        {
          label: 'Copy Folder Path',
          icon: Copy,
          onClick: () => copyText(node.path),
        },
        ...(inTrash && node.path !== TRASH_FOLDER
          ? ([
              {
                label: 'Restore Folder',
                icon: FolderOpen,
                onClick: () => onRestoreFolder(node.path),
              },
            ] satisfies ContextMenuItem[])
          : []),
        {
          label:
            node.path === TRASH_FOLDER ? 'Empty Trash' : inTrash ? 'Permanently Delete Folder' : 'Move Folder to Trash',
          icon: Trash,
          onClick: () => onDeleteFolder(node.path),
          danger: true,
        },
      ]
      setCtxMenu({ x: e.clientX, y: e.clientY, items })
    },
    [
      copyText,
      onCreate,
      onCreateDailyNote,
      onCreateFolder,
      onCreateTemplate,
      onDeleteFolder,
      onRenameFolder,
      onRestoreFolder,
      templateMenuItems,
    ],
  )

  const openNoteMenu = useCallback(
    (note: VaultNote, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const isUnavailable = unavailableNoteIds.has(note._id)
      if (isUnavailable) {
        setCtxMenu({
          x: e.clientX,
          y: e.clientY,
          items: [
            {
              label: 'Body still loading',
              icon: CloudSlash,
              onClick: () => {},
              disabled: true,
            },
            {
              label: 'Retry loading body',
              icon: ArrowClockwise,
              onClick: () => onUnavailableNoteSelect?.(note._id),
            },
            {
              label: 'Copy Path',
              icon: Copy,
              onClick: () => copyText(note._id),
            },
          ],
        })
        return
      }
      const folder = note.folder || undefined
      const inTrash = isNotesTrashPath(noteFolderPath(note))
      const isPinned = pinnedNoteIds.has(note._id)
      const items: ContextMenuItem[] = [
        {
          label: 'Open',
          icon: FileText,
          onClick: () => onSelect(note._id),
        },
        ...(onOpenInSidePane
          ? [
              {
                label: 'Open in side pane',
                icon: SquaresFour,
                onClick: () => onOpenInSidePane(note._id),
                disabled: note.type === 'attachment',
              },
            ]
          : []),
        {
          label: 'Rename',
          icon: PencilSimple,
          onClick: () => onRename(note._id),
          disabled: note.type === 'attachment',
        },
        {
          label: 'New Note Here',
          icon: NotePencil,
          onClick: () => onCreate(folder),
        },
        {
          label: isPinned ? 'Unpin' : 'Pin',
          icon: Star,
          onClick: () => onTogglePin(note._id),
        },
        {
          label: 'Duplicate',
          icon: Copy,
          onClick: () => onDuplicate(note._id),
          disabled: note.type === 'attachment',
        },
        {
          label: 'Move...',
          icon: FolderOpen,
          onClick: () => onMove(note._id),
          disabled: note.type === 'attachment',
        },
        {
          label: 'Copy Wikilink',
          icon: Copy,
          onClick: () => copyText(`[[${note.title || note._id.replace(/\.md$/, '')}]]`),
          disabled: note.type === 'attachment',
        },
        {
          label: 'Copy Markdown',
          icon: Copy,
          onClick: () => onCopyMarkdown(note._id),
          disabled: note.type === 'attachment',
        },
        {
          label: 'Export Markdown',
          icon: FileText,
          onClick: () => onExportMarkdown(note._id),
          disabled: note.type === 'attachment',
        },
        {
          label: 'Copy Path',
          icon: Copy,
          onClick: () => copyText(note._id),
        },
        {
          label: inTrash ? 'Permanently Delete Note' : 'Move Note to Trash',
          icon: Trash,
          onClick: () => onDelete(note._id),
          danger: true,
        },
      ]
      setCtxMenu({ x: e.clientX, y: e.clientY, items })
    },
    [
      copyText,
      onCopyMarkdown,
      onCreate,
      onDelete,
      onDuplicate,
      onExportMarkdown,
      onMove,
      onOpenInSidePane,
      onRename,
      onSelect,
      onTogglePin,
      onUnavailableNoteSelect,
      pinnedNoteIds,
      unavailableNoteIds,
    ],
  )

  const openRootMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const items: ContextMenuItem[] = [
        {
          label: 'New Note',
          icon: NotePencil,
          onClick: () => onCreate(),
        },
        {
          label: 'New Daily Note',
          icon: FileText,
          onClick: () => onCreateDailyNote(),
        },
        {
          label: 'New Meeting Note',
          icon: FileText,
          onClick: () => onCreateTemplate(undefined, 'meeting'),
        },
        {
          label: 'New Project Brief',
          icon: FileText,
          onClick: () => onCreateTemplate(undefined, 'project'),
        },
        ...templateMenuItems(undefined),
        {
          label: 'New Folder',
          icon: FolderPlus,
          onClick: () => onCreateFolder(),
        },
      ]
      setCtxMenu({ x: e.clientX, y: e.clientY, items })
    },
    [onCreate, onCreateDailyNote, onCreateFolder, onCreateTemplate, templateMenuItems],
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
      onContextMenu={openRootMenu}
      onDragOver={event => {
        if (
          event.dataTransfer.types.includes('application/x-clawctrl-note') ||
          event.dataTransfer.types.includes('application/x-clawctrl-folder')
        )
          event.preventDefault()
      }}
      onDrop={event => {
        const noteId = event.dataTransfer.getData('application/x-clawctrl-note')
        const folderPath = event.dataTransfer.getData('application/x-clawctrl-folder')
        if (!noteId && !folderPath) return
        event.preventDefault()
        if (noteId) handleDropNote(noteId, '')
        if (folderPath) handleDropFolder(folderPath, '')
      }}
    >
      {/* MagnifyingGlass is the top element — no separate header needed */}

      {/* MagnifyingGlass */}
      <div style={{ padding: '10px 10px 6px', flexShrink: 0 }} onContextMenu={e => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            background: 'transparent',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            borderBottom: '1px solid var(--border)',
            transition: 'border-color var(--duration-fast)',
          }}
        >
          <MagnifyingGlass size={12} style={{ color: 'var(--text-muted)', flexShrink: 0, opacity: 0.5 }} />
          <input
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search, tag:, path:, content:..."
            aria-label="Search notes"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: 12,
              flex: 1,
              padding: 0,
              fontFamily: 'inherit',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear notes search"
              title="Clear search"
              style={{
                width: 18,
                height: 18,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: 0,
                flexShrink: 0,
              }}
            >
              <X size={11} />
            </button>
          )}
          {searchQuery.trim() && onSaveSearch && (
            <button
              type="button"
              onClick={onSaveSearch}
              aria-label="Save notes search"
              title="Save search"
              style={{
                width: 18,
                height: 18,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: 0,
                flexShrink: 0,
              }}
            >
              <Star size={11} />
            </button>
          )}
        </div>
        {savedSearches.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 5,
              overflowX: 'auto',
              paddingTop: 6,
              scrollbarWidth: 'none',
            }}
          >
            {savedSearches.slice(0, 8).map(search => {
              const active = searchQuery.trim() === search.query
              return (
              <div
                key={search.id}
                style={{
                  maxWidth: 140,
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: active ? 'var(--accent-a12)' : 'var(--bg-white-02)',
                  overflow: 'hidden',
                  flex: '0 0 auto',
                  display: 'inline-flex',
                  alignItems: 'center',
                  minWidth: 0,
                }}
              >
                <button
                  type="button"
                  onClick={() => onSearchChange(search.query)}
                  title={search.query}
                  style={{
                    minWidth: 0,
                    border: 'none',
                    background: 'transparent',
                    color: active ? 'var(--accent)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '3px 5px 3px 7px',
                    fontSize: 10,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {search.label}
                </button>
                {onRemoveSavedSearch && (
                  <button
                    type="button"
                    onClick={() => onRemoveSavedSearch(search.id)}
                    aria-label={`Remove saved search ${search.label}`}
                    title="Remove saved search"
                    style={{
                      width: 18,
                      height: 18,
                      border: 'none',
                      borderLeft: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
              )
            })}
          </div>
        )}
        {savedSearchSyncLabel && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              paddingTop: 6,
              color: savedSearchSyncError ? 'var(--red)' : 'var(--text-muted)',
              fontSize: 10,
              minWidth: 0,
            }}
          >
            {savedSearchSyncError ? <CloudSlash size={11} /> : <Cloud size={11} />}
            <span
              title={savedSearchSyncDetail}
              style={{
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {savedSearchSyncLabel}
            </span>
            {savedSearchSyncError && onRetrySavedSearchSync && (
              <button
                type="button"
                onClick={onRetrySavedSearchSync}
                aria-label="Retry saved search sync"
                title="Retry saved search sync"
                style={{
                  width: 18,
                  height: 18,
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <ArrowClockwise size={10} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tree */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '2px 6px',
        }}
      >
        {!searchQuery.trim() && pinnedNotes.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                color: 'var(--text-muted)',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              <Star size={11} weight="fill" style={{ color: 'var(--amber)' }} />
              Pinned
            </div>
            {pinnedNotes.map(note => (
              <NoteItem
                key={`pinned-${note._id}`}
                note={note}
                depth={0}
                isSelected={selectedId === note._id}
                isPinned
                isUnavailable={unavailableNoteIds.has(note._id)}
                onSelect={onSelect}
                onUnavailableSelect={onUnavailableNoteSelect}
                onContextMenu={openNoteMenu}
                highlightTerms={[]}
                searchQuery=""
              />
            ))}
          </div>
        )}
        {!searchQuery.trim() && recentNotes.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                color: 'var(--text-muted)',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              <span style={{ flex: 1 }}>Recent</span>
              {recentSettingsOpen && (
                <div
                  onContextMenu={event => event.stopPropagation()}
                  style={{
                    height: 22,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '0 7px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-white-02)',
                  }}
                >
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={normalizedRecentLimit}
                    aria-label="Recent notes count"
                    title={`Show ${normalizedRecentLimit} recent notes`}
                    onChange={event => onRecentLimitChange?.(Number(event.target.value))}
                    style={{
                      width: 58,
                      accentColor: 'var(--accent)',
                      cursor: 'pointer',
                    }}
                  />
                  <span style={{ minWidth: 12, textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {normalizedRecentLimit}
                  </span>
                </div>
              )}
              <button
                type="button"
                aria-label="Recent settings"
                title="Recent settings"
                onClick={() => setRecentSettingsOpen(open => !open)}
                onContextMenu={event => event.stopPropagation()}
                style={{
                  width: 22,
                  height: 22,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: recentSettingsOpen ? 'var(--bg-white-04)' : 'transparent',
                  color: recentSettingsOpen ? 'var(--text-secondary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <SlidersHorizontal size={12} />
              </button>
            </div>
            {recentNotes.map(note => (
              <NoteItem
                key={`recent-${note._id}`}
                note={note}
                depth={0}
                isSelected={selectedId === note._id}
                isPinned={pinnedNoteIds.has(note._id)}
                isUnavailable={unavailableNoteIds.has(note._id)}
                onSelect={onSelect}
                onUnavailableSelect={onUnavailableNoteSelect}
                onContextMenu={openNoteMenu}
                highlightTerms={[]}
                searchQuery=""
              />
            ))}
          </div>
        )}
        {!searchQuery.trim() && tagRows.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                padding: '4px 10px',
                color: 'var(--text-muted)',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              Tags
            </div>
            <div style={{ display: 'grid', gap: 2, padding: '0 6px' }}>
              {tagRows.map(row => (
                <div
                  key={row.tag}
                  className="hover-bg"
                  title={`Filter #${row.tag}`}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    minHeight: 22,
                    padding: `3px 7px 3px ${7 + row.depth * 14}px`,
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    background: row.depth === 0 ? 'var(--bg-white-02)' : 'transparent',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onSearchChange(`#${row.tag}`)}
                    aria-label={`Filter notes by tag #${row.tag} (${row.count})`}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      font: 'inherit',
                    }}
                  >
                    <span style={{ opacity: row.depth > 0 ? 0.45 : 0.7 }}>#</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                      {row.label}
                    </span>
                    <span style={{ opacity: 0.55 }}>{row.count}</span>
                  </button>
                  {onRenameTag && row.directCount > 0 && (
                    <button
                      type="button"
                      onClick={() => onRenameTag(row.tag)}
                      aria-label={`Rename tag ${row.tag}`}
                      title={`Rename #${row.tag}`}
                      style={{
                        width: 18,
                        height: 18,
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <PencilSimple size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <FolderItem
          node={tree}
          depth={0}
          selectedId={selectedId}
          pinnedNoteIds={pinnedNoteIds}
          unavailableNoteIds={unavailableNoteIds}
          expandedFolders={expandedFolders}
          onToggle={toggleFolder}
          onSelect={onSelect}
          onUnavailableNoteSelect={onUnavailableNoteSelect}
          onCreate={onCreate}
          onCreateFolder={onCreateFolder}
          onDropNote={handleDropNote}
          onDropFolder={handleDropFolder}
          onContextMenu={openFolderMenu}
          onNoteContextMenu={openNoteMenu}
          highlightTerms={highlightTerms}
          searchQuery={searchQuery}
        />

        {activeNotes.length === 0 && activeFolders.length === 0 && (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 12,
              opacity: 0.6,
            }}
          >
            {searchQuery ? 'No matches' : 'Empty vault'}
          </div>
        )}
      </div>

      {/* New note */}
      <div
        style={{
          padding: '6px 10px 10px',
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => onCreate()}
          className="hover-bg"
          aria-label="New note"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: '100%',
            padding: '6px 10px',
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 12,
            transition: 'color var(--duration-fast)',
          }}
        >
          <Plus size={13} />
          New Note
        </button>
        <button
          onClick={() => onCreateFolder()}
          className="hover-bg"
          aria-label="New folder"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: '100%',
            padding: '6px 10px',
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 12,
            transition: 'color var(--duration-fast)',
          }}
        >
          <FolderPlus size={13} />
          New Folder
        </button>
        <button
          onClick={() => {
            onSearchChange('')
            updateExpandedFolders(prev => {
              const next = new Set([...prev, ''])
              if (next.has(TRASH_FOLDER)) next.delete(TRASH_FOLDER)
              else next.add(TRASH_FOLDER)
              return next
            })
          }}
          onDragOver={event => {
            if (
              event.dataTransfer.types.includes('application/x-clawctrl-note') ||
              event.dataTransfer.types.includes('application/x-clawctrl-folder')
            )
              event.preventDefault()
          }}
          onDrop={event => {
            const noteId = event.dataTransfer.getData('application/x-clawctrl-note')
            const folderPath = event.dataTransfer.getData('application/x-clawctrl-folder')
            if (!noteId && !folderPath) return
            event.preventDefault()
            onSearchChange('')
            updateExpandedFolders(prev => new Set([...prev, '', TRASH_FOLDER]))
            if (noteId) handleDropNote(noteId, TRASH_FOLDER)
            if (folderPath) handleDropFolder(folderPath, TRASH_FOLDER)
          }}
          className="hover-bg"
          aria-label="Show Trash"
          title="Show Trash"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: '100%',
            padding: '6px 10px',
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 12,
            transition: 'color var(--duration-fast)',
          }}
        >
          <Trash size={13} />
          <span style={{ flex: 1, textAlign: 'left' }}>Trash</span>
          {trashCount > 0 && (
            <span
              style={{
                minWidth: 18,
                padding: '1px 6px',
                borderRadius: '999px',
                background: 'var(--bg-white-04)',
                color: 'var(--text-muted)',
                fontSize: 10,
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
              {trashCount}
            </span>
          )}
        </button>
        {expandedFolders.has(TRASH_FOLDER) && (
          <div style={{ marginTop: 4, maxHeight: 220, overflowY: 'auto' }} aria-label="Trash contents">
            {trashCount > 0 ? (
              <FolderItem
                node={trashTree}
                depth={0}
                selectedId={selectedId}
                pinnedNoteIds={pinnedNoteIds}
                unavailableNoteIds={unavailableNoteIds}
                expandedFolders={expandedFolders}
                onToggle={toggleFolder}
                onSelect={onSelect}
                onUnavailableNoteSelect={onUnavailableNoteSelect}
                onCreate={onCreate}
                onCreateFolder={onCreateFolder}
                onDropNote={handleDropNote}
                onDropFolder={handleDropFolder}
                onContextMenu={openFolderMenu}
                onNoteContextMenu={openNoteMenu}
                highlightTerms={[]}
                searchQuery=""
              />
            ) : (
              <div style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: 12, opacity: 0.65 }}>
                Trash is empty.
              </div>
            )}
          </div>
        )}
      </div>

      {ctxMenu && <ContextMenu {...ctxMenu} onClose={() => setCtxMenu(null)} />}
    </div>
  )
}
