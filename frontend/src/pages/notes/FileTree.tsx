import { useState, useMemo, useCallback, memo } from 'react'
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
} from '@phosphor-icons/react'
import { ContextMenu, type ContextMenuState, type ContextMenuItem } from '@/components/ContextMenu'
import type { VaultFolder, VaultNote, FolderNode } from './types'
import type { NoteTemplate } from './templates'
import { matchesNoteSearch, matchesNoteSearchFilters } from './searchFilters'
import { NOTES_TRASH_FOLDER, isNotesTrashPath, noteFolderPath, normalizeNotesFolderPath } from './trash'

interface FileTreeProps {
  notes: VaultNote[]
  folders?: VaultFolder[]
  templates?: NoteTemplate[]
  pinnedNoteIds?: Set<string>
  recentNoteIds?: string[]
  recentLimit?: number
  onRecentLimitChange?: (limit: number) => void
  selectedId: string | null
  onSelect: (id: string) => void
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
  searchQuery: string
  onSearchChange: (q: string) => void
  searchUsesBackend?: boolean
}

const TEMPLATE_CONTEXT_MENU_LIMIT = 8
const TRASH_FOLDER = NOTES_TRASH_FOLDER

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

export function buildTree(
  notes: VaultNote[],
  folders: VaultFolder[],
  options: { includeTrash?: boolean } = {},
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
    node.notes.sort((a, b) => b.updated_at - a.updated_at)
    node.children.forEach(sortNode)
  }
  sortNode(root)
  return root
}

const FolderItem = memo(function FolderItem({
  node,
  depth,
  selectedId,
  pinnedNoteIds,
  expandedFolders,
  onToggle,
  onSelect,
  onCreate,
  onCreateFolder,
  onDropNote,
  onDropFolder,
  onContextMenu,
  onNoteContextMenu,
}: {
  node: FolderNode
  depth: number
  selectedId: string | null
  pinnedNoteIds: Set<string>
  expandedFolders: Set<string>
  onToggle: (path: string) => void
  onSelect: (id: string) => void
  onCreate: (folder?: string) => void
  onCreateFolder: (parent?: string) => void
  onDropNote: (id: string, folder: string) => void
  onDropFolder: (path: string, folder: string) => void
  onContextMenu: (node: FolderNode, e: React.MouseEvent) => void
  onNoteContextMenu: (note: VaultNote, e: React.MouseEvent) => void
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
            event.dataTransfer.setData('application/x-clawcontrol-folder', node.path)
            event.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={event => {
            const hasNote = event.dataTransfer.types.includes('application/x-clawcontrol-note')
            const hasFolder = event.dataTransfer.types.includes('application/x-clawcontrol-folder')
            if (hasNote || (hasFolder && isNotesTrashPath(node.path))) event.preventDefault()
          }}
          onDrop={event => {
            const noteId = event.dataTransfer.getData('application/x-clawcontrol-note')
            const folderPath = event.dataTransfer.getData('application/x-clawcontrol-folder')
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
              expandedFolders={expandedFolders}
              onToggle={onToggle}
              onSelect={onSelect}
              onCreate={onCreate}
              onCreateFolder={onCreateFolder}
              onDropNote={onDropNote}
              onDropFolder={onDropFolder}
              onContextMenu={onContextMenu}
              onNoteContextMenu={onNoteContextMenu}
            />
          ))}
          {node.notes.map(note => (
            <NoteItem
              key={note._id}
              note={note}
              depth={depth + 1}
              isSelected={selectedId === note._id}
              isPinned={pinnedNoteIds.has(note._id)}
              onSelect={onSelect}
              onContextMenu={onNoteContextMenu}
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
  onSelect,
  onContextMenu,
}: {
  note: VaultNote
  depth: number
  isSelected: boolean
  isPinned?: boolean
  onSelect: (id: string) => void
  onContextMenu: (note: VaultNote, e: React.MouseEvent) => void
}) {
  const pl = 10 + depth * 16
  const hasTags = note.tags.length > 0
  const hasLinks = note.links.length > 0
  const isAttachment = note.type === 'attachment'
  const ext = isAttachment ? note._id.split('.').pop()?.toUpperCase() : null
  const Icon = isAttachment ? Image : FileText

  return (
    <button
      onClick={() => onSelect(note._id)}
      onContextMenu={e => onContextMenu(note, e)}
      draggable={note.type === 'note'}
      onDragStart={event => {
        if (note.type !== 'note') return
        event.dataTransfer.setData('application/x-clawcontrol-note', note._id)
        event.dataTransfer.effectAllowed = 'move'
      }}
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
        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
        cursor: 'pointer',
        textAlign: 'left',
        fontSize: 13,
        fontWeight: isSelected ? 500 : 400,
        marginBottom: 1,
        transition: 'background var(--duration-fast) var(--ease-spring)',
        position: 'relative',
      }}
    >
      <Icon
        size={14}
        style={{
          flexShrink: 0,
          opacity: isSelected ? 0.7 : 0.3,
          color: isAttachment ? 'var(--accent)' : 'var(--text-muted)',
        }}
      />
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}
      >
        {note.title || 'Untitled'}
      </span>
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
  recentNoteIds = [],
  recentLimit = 5,
  onRecentLimitChange,
  selectedId,
  onSelect,
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
  searchQuery,
  onSearchChange,
  searchUsesBackend = false,
}: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']))
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  const [recentSettingsOpen, setRecentSettingsOpen] = useState(false)
  const normalizedRecentLimit = Math.max(1, Math.min(10, Number(recentLimit) || 5))
  const menuTemplates = useMemo(
    () => templates.filter(template => template.source === 'vault').slice(0, TEMPLATE_CONTEXT_MENU_LIMIT),
    [templates],
  )

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes
    const matches = searchUsesBackend ? matchesNoteSearchFilters : matchesNoteSearch
    return notes.filter(note => matches(note, searchQuery))
  }, [notes, searchQuery, searchUsesBackend])

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const note of notes) {
      if (note.type !== 'note') continue
      for (const tag of note.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 18)
  }, [notes])

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
    () => buildTree(activeNotes, activeFolders),
    [activeFolders, activeNotes],
  )
  const trashTree = useMemo(
    () => buildTree(trashNotes, trashFolders, { includeTrash: true }),
    [trashFolders, trashNotes],
  )

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
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

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
      const folder = note.folder || undefined
      const inTrash = isNotesTrashPath(noteFolderPath(note))
      const isPinned = pinnedNoteIds.has(note._id)
      const items: ContextMenuItem[] = [
        {
          label: 'Open',
          icon: FileText,
          onClick: () => onSelect(note._id),
        },
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
      onRename,
      onSelect,
      onTogglePin,
      pinnedNoteIds,
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
          event.dataTransfer.types.includes('application/x-clawcontrol-note') ||
          event.dataTransfer.types.includes('application/x-clawcontrol-folder')
        )
          event.preventDefault()
      }}
      onDrop={event => {
        const noteId = event.dataTransfer.getData('application/x-clawcontrol-note')
        const folderPath = event.dataTransfer.getData('application/x-clawcontrol-folder')
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
        </div>
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
                onSelect={onSelect}
                onContextMenu={openNoteMenu}
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
                onSelect={onSelect}
                onContextMenu={openNoteMenu}
              />
            ))}
          </div>
        )}
        {!searchQuery.trim() && tagCounts.length > 0 && (
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 8px' }}>
              {tagCounts.map(([tag, count]) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onSearchChange(`#${tag}`)}
                  className="hover-bg"
                  title={`Filter #${tag}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    maxWidth: '100%',
                    minHeight: 22,
                    padding: '3px 7px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-white-02)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 11,
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>#{tag}</span>
                  <span style={{ opacity: 0.55 }}>{count}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <FolderItem
          node={tree}
          depth={0}
          selectedId={selectedId}
          pinnedNoteIds={pinnedNoteIds}
          expandedFolders={expandedFolders}
          onToggle={toggleFolder}
          onSelect={onSelect}
          onCreate={onCreate}
          onCreateFolder={onCreateFolder}
          onDropNote={handleDropNote}
          onDropFolder={handleDropFolder}
          onContextMenu={openFolderMenu}
          onNoteContextMenu={openNoteMenu}
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
            setExpandedFolders(prev => {
              const next = new Set([...prev, ''])
              if (next.has(TRASH_FOLDER)) next.delete(TRASH_FOLDER)
              else next.add(TRASH_FOLDER)
              return next
            })
          }}
          onDragOver={event => {
            if (
              event.dataTransfer.types.includes('application/x-clawcontrol-note') ||
              event.dataTransfer.types.includes('application/x-clawcontrol-folder')
            )
              event.preventDefault()
          }}
          onDrop={event => {
            const noteId = event.dataTransfer.getData('application/x-clawcontrol-note')
            const folderPath = event.dataTransfer.getData('application/x-clawcontrol-folder')
            if (!noteId && !folderPath) return
            event.preventDefault()
            onSearchChange('')
            setExpandedFolders(prev => new Set([...prev, '', TRASH_FOLDER]))
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
                expandedFolders={expandedFolders}
                onToggle={toggleFolder}
                onSelect={onSelect}
                onCreate={onCreate}
                onCreateFolder={onCreateFolder}
                onDropNote={handleDropNote}
                onDropFolder={handleDropFolder}
                onContextMenu={openFolderMenu}
                onNoteContextMenu={openNoteMenu}
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
