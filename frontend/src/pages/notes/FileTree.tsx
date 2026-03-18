import { useState, useMemo, useCallback, memo } from 'react'
import {
  ChevronRight,
  ChevronDown,
  FileText,
  FolderOpen,
  Folder,
  Plus,
  Search,
  Hash,
  Image,
} from 'lucide-react'
import type { VaultNote, FolderNode } from './types'

interface FileTreeProps {
  notes: VaultNote[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: (folder?: string) => void
  searchQuery: string
  onSearchChange: (q: string) => void
}

function buildTree(notes: VaultNote[]): FolderNode {
  const root: FolderNode = { name: 'vault', path: '', children: [], notes: [], isExpanded: true }

  for (const note of notes) {
    const parts = note._id.split('/')
    parts.pop()
    let current = root

    for (const part of parts) {
      let child = current.children.find((c) => c.name === part)
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
  expandedFolders,
  onToggle,
  onSelect,
}: {
  node: FolderNode
  depth: number
  selectedId: string | null
  expandedFolders: Set<string>
  onToggle: (path: string) => void
  onSelect: (id: string) => void
}) {
  const isExpanded = expandedFolders.has(node.path)
  const pl = 12 + depth * 14

  return (
    <>
      {depth > 0 && (
        <button
          onClick={() => onToggle(node.path)}
          className="hover-bg"
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.name}`}
          aria-expanded={isExpanded}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: '100%',
            padding: '4px 8px',
            paddingLeft: pl,
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
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
            <ChevronDown size={10} style={{ opacity: 0.5 }} />
          ) : (
            <ChevronRight size={10} style={{ opacity: 0.5 }} />
          )}
          {isExpanded ? (
            <FolderOpen size={12} style={{ opacity: 0.6 }} />
          ) : (
            <Folder size={12} style={{ opacity: 0.6 }} />
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.name}
          </span>
        </button>
      )}

      {(depth === 0 || isExpanded) && (
        <>
          {node.children.map((child) => (
            <FolderItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedFolders={expandedFolders}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
          {node.notes.map((note) => (
            <NoteItem
              key={note._id}
              note={note}
              depth={depth + 1}
              isSelected={selectedId === note._id}
              onSelect={onSelect}
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
  onSelect,
}: {
  note: VaultNote
  depth: number
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const pl = 12 + depth * 14
  const hasTags = note.tags.length > 0
  const hasLinks = note.links.length > 0
  const isAttachment = note.type === 'attachment'
  const ext = isAttachment ? note._id.split('.').pop()?.toUpperCase() : null
  const Icon = isAttachment ? Image : FileText

  return (
    <button
      onClick={() => onSelect(note._id)}
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
        <span style={{
          fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
          color: 'var(--text-muted)', opacity: 0.5,
          flexShrink: 0,
        }}>
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
    </button>
  )
})

export default function FileTree({
  notes,
  selectedId,
  onSelect,
  onCreate,
  searchQuery,
  onSearchChange,
}: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']))

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes
    const q = searchQuery.toLowerCase()
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }, [notes, searchQuery])

  const tree = useMemo(() => buildTree(filteredNotes), [filteredNotes])

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Search is the top element — no separate header needed */}

      {/* Search */}
      <div style={{ padding: '10px 10px 6px', flexShrink: 0 }}>
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
          <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0, opacity: 0.5 }} />
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search notes..."
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
        </div>
      </div>

      {/* Tree */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '2px 6px',
      }}>
        <FolderItem
          node={tree}
          depth={0}
          selectedId={selectedId}
          expandedFolders={expandedFolders}
          onToggle={toggleFolder}
          onSelect={onSelect}
        />

        {filteredNotes.length === 0 && (
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
      <div style={{
        padding: '6px 10px 10px',
        flexShrink: 0,
      }}>
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
      </div>
    </div>
  )
}
