import { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react'
import { Trash2, Network, PenLine, Cloud, CloudOff, GitBranch } from 'lucide-react'
import { useVault } from '@/hooks/notes/useVault'
import { noteIdFromTitle } from '@/lib/vault'
import FileTree from './FileTree'
import NoteEditor from './NoteEditor'
import type { VaultNote } from './types'

const GraphView = lazy(() => import('./GraphView'))

type ViewMode = 'editor' | 'graph'

export default function NotesPage() {
  const { notes, loading, syncing, createNote, updateNote, deleteNote } = useVault()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('editor')
  const [searchQuery, setSearchQuery] = useState('')
  const [treeWidth, setTreeWidth] = useState(220)
  const [editingTitle, setEditingTitle] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingContentRef = useRef<Map<string, string>>(new Map())

  const selected = notes.find((n) => n._id === selectedId) ?? null

  useEffect(() => {
    if (!selectedId && notes.length > 0) {
      setSelectedId(notes[0]._id)
    }
  }, [notes, selectedId])

  const handleCreate = useCallback(
    async (folder?: string) => {
      const note = await createNote('Untitled', folder)
      setSelectedId(note._id)
      setViewMode('editor')
      setTimeout(() => {
        setEditingTitle(true)
        titleRef.current?.select()
      }, 50)
    },
    [createNote],
  )

  const handleDelete = useCallback(async () => {
    if (!selectedId) return
    const idx = notes.findIndex((n) => n._id === selectedId)
    await deleteNote(selectedId)
    const next = notes[idx + 1] ?? notes[idx - 1] ?? null
    setSelectedId(next?._id ?? null)
  }, [selectedId, notes, deleteNote])

  const handleContentChange = useCallback(
    (content: string) => {
      if (!selected) return
      pendingContentRef.current.set(selected._id, content)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(async () => {
        const pending = pendingContentRef.current.get(selected._id)
        if (pending !== undefined) {
          pendingContentRef.current.delete(selected._id)
          await updateNote({ ...selected, content: pending })
        }
      }, 600)
    },
    [selected, updateNote],
  )

  const handleTitleChange = useCallback(
    async (title: string) => {
      if (!selected) return
      await updateNote({ ...selected, title })
    },
    [selected, updateNote],
  )

  const handleWikilinkClick = useCallback(
    async (link: string) => {
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
    [notes, createNote],
  )

  const handleGraphSelect = useCallback((id: string) => {
    setSelectedId(id)
    setViewMode('editor')
  }, [])

  const handleResize = useCallback((e: React.MouseEvent) => {
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
  }, [treeWidth])

  if (loading) {
    return (
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontSize: 13,
      }}>
        Loading vault...
      </div>
    )
  }

  return (
    <div style={{
      position: 'absolute', inset: 0,
      margin: '-20px -28px',
      display: 'flex', overflow: 'hidden',
      userSelect: 'text', WebkitUserSelect: 'text',
    }}>
      {/* File tree */}
      <div style={{
        width: treeWidth, minWidth: treeWidth,
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <FileTree
          notes={notes}
          selectedId={selectedId}
          onSelect={(id) => { setSelectedId(id); setViewMode('editor') }}
          onCreate={handleCreate}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleResize}
        style={{
          width: 4, cursor: 'col-resize',
          background: 'transparent', flexShrink: 0,
          marginLeft: -2, marginRight: -2, zIndex: 10,
          position: 'relative',
        }}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize file tree"
      />

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '0 16px', gap: 2, flexShrink: 0, height: 40,
          borderBottom: '1px solid var(--border)',
        }}>
          {/* Breadcrumb / Title */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0, gap: 6 }}>
            {selected ? (
              <>
                {selected.folder && (
                  <span style={{
                    fontSize: 11, color: 'var(--text-muted)', opacity: 0.5,
                    whiteSpace: 'nowrap',
                  }}>
                    {selected.folder} /
                  </span>
                )}
                {editingTitle ? (
                  <input
                    ref={titleRef}
                    value={selected.title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    onBlur={() => setEditingTitle(false)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setEditingTitle(false) }}
                    aria-label="Note title"
                    autoFocus
                    style={{
                      background: 'transparent', border: 'none',
                      color: 'var(--text-primary)', fontSize: 13,
                      fontWeight: 500, fontFamily: 'inherit',
                      flex: 1, padding: '2px 0',
                    }}
                  />
                ) : (
                  <button
                    onClick={() => {
                      setEditingTitle(true)
                      setTimeout(() => titleRef.current?.select(), 20)
                    }}
                    style={{
                      background: 'transparent', border: 'none',
                      color: 'var(--text-primary)', fontSize: 13,
                      fontWeight: 500, cursor: 'text',
                      padding: '2px 4px', borderRadius: 'var(--radius-sm)',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', textAlign: 'left',
                    }}
                  >
                    {selected.title || 'Untitled'}
                  </button>
                )}
              </>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: 13, opacity: 0.5 }}>
                Select a note
              </span>
            )}
          </div>

          {/* Sync indicator */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              color: syncing ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: 10, marginRight: 4, opacity: syncing ? 1 : 0.4,
            }}
            title={syncing ? 'Syncing...' : 'Synced'}
          >
            {syncing ? <Cloud size={12} /> : <CloudOff size={12} />}
          </div>

          {/* View toggle */}
          <div style={{
            display: 'flex',
            background: 'var(--bg-white-02)',
            borderRadius: 'var(--radius-sm)',
            padding: 2, gap: 1,
            border: '1px solid var(--border)',
          }}>
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
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: viewMode === 'editor' ? 500 : 400,
                transition: 'all var(--duration-fast)',
              }}
            >
              <PenLine size={11} />
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
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: viewMode === 'graph' ? 500 : 400,
                transition: 'all var(--duration-fast)',
              }}
            >
              <GitBranch size={11} />
              Graph
            </button>
          </div>

          {/* Delete */}
          {selected && (
            <button
              onClick={handleDelete}
              className="hover-bg"
              aria-label="Delete note"
              style={{
                background: 'transparent', border: 'none',
                color: 'var(--text-muted)', cursor: 'pointer',
                padding: 5, borderRadius: 'var(--radius-sm)',
                display: 'flex', opacity: 0.5,
                transition: 'opacity var(--duration-fast)',
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.opacity = '1'
                ;(e.target as HTMLButtonElement).style.color = 'var(--red)'
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.opacity = '0.5'
                ;(e.target as HTMLButtonElement).style.color = 'var(--text-muted)'
              }}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {viewMode === 'editor' ? (
            selected ? (
              <NoteEditor
                note={selected}
                onChange={handleContentChange}
                onWikilinkClick={handleWikilinkClick}
              />
            ) : (
              <EmptyState onCreateNote={() => handleCreate()} />
            )
          ) : (
            <Suspense fallback={
              <div style={{
                flex: 1, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-muted)', fontSize: 12,
              }}>
                Loading graph...
              </div>
            }>
              <GraphView
                notes={notes}
                selectedId={selectedId}
                onSelectNote={handleGraphSelect}
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyState({ onCreateNote }: { onCreateNote: () => void }) {
  return (
    <div style={{
      flex: 1, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 12,
      color: 'var(--text-muted)',
    }}>
      <div style={{
        width: 48, height: 48,
        borderRadius: 12,
        background: 'var(--bg-white-02)',
        border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Network size={22} style={{ opacity: 0.3, color: 'var(--accent)' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 14, fontWeight: 500, marginBottom: 4,
          color: 'var(--text-secondary)',
        }}>
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
          color: '#fff',
          cursor: 'pointer',
          padding: '7px 18px',
          fontSize: 12, fontWeight: 500,
          transition: 'opacity var(--duration-fast)',
        }}
        onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.opacity = '0.85' }}
        onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.opacity = '1' }}
      >
        Create first note
      </button>
    </div>
  )
}
