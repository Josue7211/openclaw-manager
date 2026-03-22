import { useMemo, memo } from 'react'
import { CaretRight } from '@phosphor-icons/react'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
import type { VaultNote } from './types'

interface BacklinksPanelProps {
  currentNoteTitle: string
  allNotes: VaultNote[]
  onNavigate: (noteId: string) => void
}

export default memo(function BacklinksPanel({
  currentNoteTitle,
  allNotes,
  onNavigate,
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
        aria-label={`Backlinks (${backlinks.length})`}
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
        Backlinks ({backlinks.length})
      </button>

      {!collapsed && (
        <div style={{ marginTop: 6 }}>
          {backlinks.length === 0 ? (
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                opacity: 0.5,
                padding: '4px 0 2px 16px',
              }}
            >
              No backlinks
            </div>
          ) : (
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
              {backlinks.map((note) => (
                <li key={note._id}>
                  <button
                    onClick={() => onNavigate(note._id)}
                    className="hover-bg"
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px 8px 4px 16px',
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
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
})
