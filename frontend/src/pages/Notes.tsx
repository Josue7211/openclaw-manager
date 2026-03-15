import { useState, useRef, useCallback, useEffect } from 'react'
import { Plus, Trash2, FileText } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'

interface Note {
  id: string
  title: string
  content: string
  updatedAt: number
}

const STORAGE_KEY = 'notes-data'

function loadNotes(): Note[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch { return [] }
}

function saveNotes(notes: Note[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>(loadNotes)
  const [selectedId, setSelectedId] = useState<string | null>(notes[0]?.id ?? null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const selected = notes.find(n => n.id === selectedId) ?? null

  useEffect(() => { saveNotes(notes) }, [notes])

  const createNote = useCallback(() => {
    const note: Note = {
      id: crypto.randomUUID(),
      title: 'Untitled',
      content: '',
      updatedAt: Date.now(),
    }
    setNotes(prev => [note, ...prev])
    setSelectedId(note.id)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }, [])

  const deleteNote = useCallback((id: string) => {
    setNotes(prev => {
      const next = prev.filter(n => n.id !== id)
      if (selectedId === id) setSelectedId(next[0]?.id ?? null)
      return next
    })
  }, [selectedId])

  const updateNote = useCallback((id: string, patch: Partial<Note>) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n))
  }, [])

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      overflow: 'hidden',
      userSelect: 'text',
      WebkitUserSelect: 'text',
    }}>
      {/* Note list sidebar */}
      <div style={{
        width: '240px',
        minWidth: '240px',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <PageHeader defaultTitle="Notes" />
          <button
            onClick={createNote}
            aria-label="New note"
            className="hover-bg"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
            }}
          >
            <Plus size={16} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {notes.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No notes yet
            </div>
          )}
          {notes.map(note => (
            <button
              key={note.id}
              onClick={() => setSelectedId(note.id)}
              className="hover-bg"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '10px 12px',
                background: selectedId === note.id ? 'var(--active-bg)' : 'transparent',
                border: 'none',
                borderRadius: '8px',
                color: selectedId === note.id ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
                textAlign: 'left',
                marginBottom: '2px',
                fontSize: '13px',
                fontWeight: selectedId === note.id ? 600 : 450,
              }}
            >
              <FileText size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {note.title || 'Untitled'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selected ? (
          <>
            <div style={{
              padding: '12px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <input
                value={selected.title}
                onChange={e => updateNote(selected.id, { title: e.target.value })}
                placeholder="Note title..."
                aria-label="Note title"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '18px',
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  flex: 1,
                  padding: 0,
                }}
              />
              <button
                onClick={() => deleteNote(selected.id)}
                aria-label="Delete note"
                className="hover-bg"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '6px',
                  display: 'flex',
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <textarea
              ref={textareaRef}
              value={selected.content}
              onChange={e => updateNote(selected.id, { content: e.target.value })}
              placeholder="Start writing..."
              aria-label="Note content"
              style={{
                flex: 1,
                padding: '20px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: '14px',
                lineHeight: 1.7,
                fontFamily: 'inherit',
                resize: 'none',
                caretColor: 'var(--accent)',
              }}
            />
          </>
        ) : (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '12px',
            color: 'var(--text-muted)',
          }}>
            <FileText size={32} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: '14px' }}>Select or create a note</span>
            <button
              onClick={createNote}
              className="hover-bg"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '8px 16px',
                fontSize: '13px',
              }}
            >
              New Note
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
