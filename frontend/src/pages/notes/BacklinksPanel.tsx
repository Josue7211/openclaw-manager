import { useMemo, memo } from 'react'
import { CaretRight } from '@phosphor-icons/react'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
import type { VaultNote } from './types'

interface BacklinksPanelProps {
  currentNoteTitle: string
  allNotes: VaultNote[]
  onNavigate: (noteId: string) => void
  onLinkMention?: (noteId: string) => void
}

export default memo(function BacklinksPanel({
  currentNoteTitle,
  allNotes,
  onNavigate,
  onLinkMention,
}: BacklinksPanelProps) {
  const [collapsed, setCollapsed] = useLocalStorageState('mc-backlinks-collapsed', true)

  const backlinks = useMemo(() => {
    const title = currentNoteTitle.toLowerCase()
    return allNotes.filter(
      (note) =>
        note.type === 'note' &&
        note.links.some((link) => link.toLowerCase() === title),
    )
  }, [currentNoteTitle, allNotes])

  const unlinkedMentions = useMemo(() => {
    const title = currentNoteTitle.trim().toLowerCase()
    if (!title) return []
    return allNotes.filter((note) => {
      if (note.type !== 'note') return false
      if (note.title.toLowerCase() === title) return false
      if (note.links.some((link) => link.toLowerCase() === title)) return false
      return note.content.toLowerCase().includes(title)
    })
  }, [currentNoteTitle, allNotes])

  const totalReferences = backlinks.length + unlinkedMentions.length

  return (
    <div
      style={{
        borderTop: '1px solid var(--border)',
        padding: '8px 16px',
        background: 'var(--bg-base)',
        flexShrink: 0,
      }}
    >
      <button
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        aria-label={`Backlinks (${totalReferences})`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          fontSize: 11,
          fontWeight: 500,
          padding: '2px 0',
          width: '100%',
          textAlign: 'left',
        }}
      >
        <CaretRight
          size={10}
          style={{
            transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
            transition: 'transform var(--duration-fast)',
            flexShrink: 0,
          }}
        />
        References ({totalReferences})
      </button>

      {!collapsed && (
        <div style={{ marginTop: 6 }}>
          {totalReferences === 0 ? (
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                opacity: 0.5,
                padding: '4px 0 2px 16px',
              }}
            >
              No references
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ReferenceList
                label={`Linked mentions (${backlinks.length})`}
                notes={backlinks}
                onNavigate={onNavigate}
              />
              <ReferenceList
                label={`Unlinked mentions (${unlinkedMentions.length})`}
                notes={unlinkedMentions}
                onNavigate={onNavigate}
                onLinkMention={onLinkMention}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
})

function ReferenceList({
  label,
  notes,
  onNavigate,
  onLinkMention,
}: {
  label: string
  notes: VaultNote[]
  onNavigate: (noteId: string) => void
  onLinkMention?: (noteId: string) => void
}) {
  if (notes.length === 0) return null

  return (
    <div>
      <div
        style={{
          padding: '2px 0 3px 16px',
          color: 'var(--text-muted)',
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {notes.map((note) => (
          <li key={note._id}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                width: '100%',
                paddingLeft: 8,
              }}
            >
              <button
                onClick={() => onNavigate(note._id)}
                className="hover-bg"
                style={{
                  display: 'block',
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {note.title || 'Untitled'}
                </div>
                {note.content && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      opacity: 0.6,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginTop: 1,
                    }}
                  >
                    {note.content.slice(0, 80)}
                  </div>
                )}
              </button>
              {onLinkMention && (
                <button
                  type="button"
                  onClick={() => onLinkMention(note._id)}
                  className="hover-bg"
                  title="Link mention"
                  aria-label={`Link mention in ${note.title || 'Untitled'}`}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    flexShrink: 0,
                    fontSize: 10,
                    padding: '3px 6px',
                  }}
                >
                  Link
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
