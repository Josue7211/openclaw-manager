import { useCallback, useEffect, useMemo, memo } from 'react'
import { CaretRight } from '@phosphor-icons/react'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
import type { VaultNote } from './types'
import { buildBacklinkReferences, type BacklinkReference } from './backlinks'

interface BacklinksPanelProps {
  currentNoteTitle: string
  allNotes: VaultNote[]
  onNavigate: (noteId: string) => void
  onLinkMention?: (noteId: string, mentionText?: string) => void
  onLinkAllMentions?: (references: BacklinkReference[]) => void
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  openRequest?: number
}

export default memo(function BacklinksPanel({
  currentNoteTitle,
  allNotes,
  onNavigate,
  onLinkMention,
  onLinkAllMentions,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  openRequest = 0,
}: BacklinksPanelProps) {
  const [localCollapsed, setLocalCollapsed] = useLocalStorageState('mc-backlinks-collapsed', true)
  const collapsed = controlledCollapsed ?? localCollapsed
  const setCollapsed = useCallback((next: boolean | ((current: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(collapsed) : next
    if (controlledCollapsed === undefined) {
      setLocalCollapsed(value)
      return
    }
    onCollapsedChange?.(value)
  }, [collapsed, controlledCollapsed, onCollapsedChange, setLocalCollapsed])

  useEffect(() => {
    if (openRequest > 0) setCollapsed(false)
  }, [openRequest, setCollapsed])

  const { linked: backlinks, unlinked: unlinkedMentions } = useMemo(
    () => buildBacklinkReferences(currentNoteTitle, allNotes),
    [currentNoteTitle, allNotes],
  )

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
                references={backlinks}
                onNavigate={onNavigate}
              />
              <ReferenceList
                label={`Unlinked mentions (${unlinkedMentions.length})`}
                references={unlinkedMentions}
                onNavigate={onNavigate}
                onLinkMention={onLinkMention}
                onLinkAllMentions={onLinkAllMentions}
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
  references,
  onNavigate,
  onLinkMention,
  onLinkAllMentions,
}: {
  label: string
  references: BacklinkReference[]
  onNavigate: (noteId: string) => void
  onLinkMention?: (noteId: string, mentionText?: string) => void
  onLinkAllMentions?: (references: BacklinkReference[]) => void
}) {
  if (references.length === 0) return null

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '2px 0 3px 16px',
        }}
      >
        <div
          style={{
            color: 'var(--text-muted)',
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </div>
        {onLinkAllMentions && (
          <button
            type="button"
            onClick={() => onLinkAllMentions(references)}
            className="hover-bg"
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
            Link all
          </button>
        )}
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
        {references.map((reference) => (
          <li key={reference.note._id}>
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
                onClick={() => onNavigate(reference.note._id)}
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
                  {reference.note.title || 'Untitled'}
                </div>
                {reference.snippet && (
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
                    {reference.snippet}
                  </div>
                )}
              </button>
              {onLinkMention && (
                <button
                  type="button"
                  onClick={() => onLinkMention(reference.note._id, reference.matchedText)}
                  className="hover-bg"
                  title="Link mention"
                  aria-label={`Link mention in ${reference.note.title || 'Untitled'}`}
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
