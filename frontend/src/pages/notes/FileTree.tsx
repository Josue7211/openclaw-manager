import { useState, useMemo, useCallback, memo, useRef, useEffect, type ReactNode } from 'react'
import { CaretRight, CaretDown, FileText, FolderOpen, Folder, Plus, MagnifyingGlass, Hash, Image, CaretUp } from '@phosphor-icons/react'
import type { VaultNote, FolderNode } from './types'
import type { NoteTemplate } from './templates'
import { NOTE_TEMPLATES } from './templates'

/** Highlight matching substring in a title with a subtle accent background. */
function highlightText(text: string, query: string): ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{
        background: 'var(--accent-a30)',
        color: 'inherit',
        borderRadius: 2,
        padding: '0 1px',
      }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

interface FileTreeProps {
  notes: VaultNote[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: (folder?: string, template?: NoteTemplate) => void
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
  searchHighlight,
}: {
  node: FolderNode
  depth: number
  selectedId: string | null
  expandedFolders: Set<string>
  onToggle: (path: string) => void
  onSelect: (id: string) => void
  searchHighlight?: string
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
            <CaretDown size={10} style={{ opacity: 0.5 }} />
          ) : (
            <CaretRight size={10} style={{ opacity: 0.5 }} />
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
              searchHighlight={searchHighlight}
            />
          ))}
          {node.notes.map((note) => (
            <NoteItem
              key={note._id}
              note={note}
              depth={depth + 1}
              isSelected={selectedId === note._id}
              onSelect={onSelect}
              searchHighlight={searchHighlight}
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
  searchHighlight,
}: {
  note: VaultNote
  depth: number
  isSelected: boolean
  onSelect: (id: string) => void
  searchHighlight?: string
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
        {searchHighlight ? highlightText(note.title || 'Untitled', searchHighlight) : (note.title || 'Untitled')}
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

/** Template picker button that shows a dropdown above the button. */
function NewNoteButton({ onCreate }: { onCreate: (folder?: string, template?: NoteTemplate) => void }) {
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPicker])

  return (
    <div ref={pickerRef} style={{ padding: '6px 10px 10px', flexShrink: 0, position: 'relative' }}>
      {showPicker && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 10,
          right: 10,
          marginBottom: 4,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 8px 24px var(--overlay-heavy)',
          overflow: 'hidden',
          zIndex: 20,
        }}>
          <div style={{
            padding: '6px 10px 4px',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}>
            Template
          </div>
          {NOTE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              className="hover-bg"
              onClick={() => {
                setShowPicker(false)
                onCreate(undefined, t.id === 'blank' ? undefined : t)
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '6px 10px',
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 2 }}>
        <button
          onClick={() => onCreate()}
          className="hover-bg"
          aria-label="New note"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flex: 1,
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
          onClick={() => setShowPicker((v) => !v)}
          className="hover-bg"
          aria-label="Choose template"
          title="Create from template"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <CaretUp size={10} style={{ transform: showPicker ? 'rotate(180deg)' : undefined, transition: 'transform var(--duration-fast)' }} />
        </button>
      </div>
    </div>
  )
}

export default function FileTree({
  notes,
  selectedId,
  onSelect,
  onCreate,
  searchQuery,
  onSearchChange,
}: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']))
  const [activeTag, setActiveTag] = useState<string | null>(null)

  // Collect all unique tags across notes
  const allTags = useMemo(() => {
    const tagCounts = new Map<string, number>()
    for (const n of notes) {
      for (const t of n.tags) {
        tagCounts.set(t, (tagCounts.get(t) || 0) + 1)
      }
    }
    return [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag)
  }, [notes])

  const filteredNotes = useMemo(() => {
    let result = notes

    // Filter by active tag first
    if (activeTag) {
      result = result.filter((n) => n.tags.includes(activeTag))
    }

    // Then by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }

    return result
  }, [notes, searchQuery, activeTag])

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
      {/* MagnifyingGlass is the top element — no separate header needed */}

      {/* MagnifyingGlass */}
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
          <MagnifyingGlass size={12} style={{ color: 'var(--text-muted)', flexShrink: 0, opacity: 0.5 }} />
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

      {/* Tag pills */}
      {allTags.length > 0 && (
        <div style={{
          padding: '0 10px 6px',
          flexShrink: 0,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
        }}>
          {allTags.slice(0, 12).map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              aria-label={`Filter by tag ${tag}`}
              aria-pressed={activeTag === tag}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                padding: '2px 8px',
                fontSize: 10,
                fontWeight: 500,
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                background: activeTag === tag ? 'var(--accent-dim)' : 'var(--bg-white-04)',
                color: activeTag === tag ? 'var(--text-on-color)' : 'var(--text-muted)',
                transition: 'all var(--duration-fast)',
                lineHeight: '16px',
              }}
            >
              <Hash size={8} style={{ opacity: 0.6 }} />
              {tag}
            </button>
          ))}
        </div>
      )}

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
          searchHighlight={searchQuery.trim() || undefined}
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

      {/* New note with template picker */}
      <NewNoteButton onCreate={onCreate} />
    </div>
  )
}
