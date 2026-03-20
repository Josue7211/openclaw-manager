import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Plus } from '@phosphor-icons/react'
import { Button } from '@/components/ui/Button'
import {
  addPage,
  removePage,
  renamePage,
  setActivePage,
} from '@/lib/dashboard-store'
import type { DashboardPage } from '@/lib/dashboard-store'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardTabsProps {
  pages: DashboardPage[]
  activePageId: string
  editMode: boolean
  dotIndicatorsEnabled: boolean
}

interface ContextMenuState {
  pageId: string
  x: number
  y: number
}

// ---------------------------------------------------------------------------
// DashboardTabs
// ---------------------------------------------------------------------------

export const DashboardTabs = React.memo(function DashboardTabs({
  pages,
  activePageId,
  editMode,
  dotIndicatorsEnabled,
}: DashboardTabsProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Auto-focus rename input when entering rename mode
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingId])

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu && !confirmDeleteId) return
    function handleClick() {
      setContextMenu(null)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [contextMenu, confirmDeleteId])

  const handleDoubleClick = useCallback((pageId: string, pageName: string) => {
    setRenamingId(pageId)
    setRenameValue(pageName)
  }, [])

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, pageId: string) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const trimmed = renameValue.trim()
        if (trimmed) {
          renamePage(pageId, trimmed)
        }
        setRenamingId(null)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setRenamingId(null)
      }
    },
    [renameValue],
  )

  const handleRenameBlur = useCallback(
    (pageId: string) => {
      const trimmed = renameValue.trim()
      if (trimmed) {
        renamePage(pageId, trimmed)
      }
      setRenamingId(null)
    },
    [renameValue],
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, pageId: string) => {
      e.preventDefault()
      setContextMenu({ pageId, x: e.clientX, y: e.clientY })
      setConfirmDeleteId(null)
    },
    [],
  )

  const handleDeleteClick = useCallback(() => {
    if (contextMenu) {
      setConfirmDeleteId(contextMenu.pageId)
      setContextMenu(null)
    }
  }, [contextMenu])

  const handleConfirmDelete = useCallback(() => {
    if (confirmDeleteId) {
      removePage(confirmDeleteId)
      setConfirmDeleteId(null)
    }
  }, [confirmDeleteId])

  const handleCancelDelete = useCallback(() => {
    setConfirmDeleteId(null)
  }, [])

  const confirmPage = confirmDeleteId
    ? pages.find(p => p.id === confirmDeleteId)
    : null

  return (
    <div style={{ position: 'relative' }}>
      <div
        role="tablist"
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: '2px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
      >
        {pages.map(page => {
          const isActive = page.id === activePageId
          const isRenaming = page.id === renamingId

          return (
            <button
              key={page.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => {
                if (!isRenaming) setActivePage(page.id)
              }}
              onDoubleClick={() => handleDoubleClick(page.id, page.name)}
              onContextMenu={e => handleContextMenu(e, page.id)}
              style={{
                padding: '8px 16px',
                fontSize: '15px',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: isActive ? 'var(--bg-card-solid)' : 'transparent',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                borderRadius: '10px 10px 0 0',
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                transition: 'background 0.15s ease, color 0.15s ease',
                minWidth: 0,
                flexShrink: 0,
              }}
              className={!isActive ? 'hover-bg' : undefined}
            >
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => handleRenameKeyDown(e, page.id)}
                  onBlur={() => handleRenameBlur(page.id)}
                  onClick={e => e.stopPropagation()}
                  maxLength={20}
                  aria-label={`Rename page ${page.name}`}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--accent)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'inherit',
                    font: 'inherit',
                    fontSize: 'inherit',
                    fontWeight: 'inherit',
                    padding: '0 4px',
                    width: `${Math.max(renameValue.length, 4)}ch`,
                    outline: 'none',
                  }}
                />
              ) : (
                page.name
              )}
            </button>
          )
        })}

        {/* Add page button */}
        <button
          aria-label="Add dashboard page"
          onClick={() => addPage('New Page')}
          className="hover-bg"
          style={{
            padding: '8px 16px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '10px 10px 0 0',
            fontFamily: 'inherit',
            flexShrink: 0,
          }}
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          role="menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '4px',
            zIndex: 'var(--z-modal)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            minWidth: '140px',
          } as React.CSSProperties}
        >
          {pages.length > 1 && (
            <button
              role="menuitem"
              onClick={e => {
                e.stopPropagation()
                handleDeleteClick()
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--red-500)',
                fontSize: 'var(--text-sm)',
                textAlign: 'left',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'inherit',
              }}
              className="hover-bg"
            >
              Delete page
            </button>
          )}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDeleteId && confirmPage && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)',
            zIndex: 'var(--z-modal)',
          } as React.CSSProperties}
          onClick={handleCancelDelete}
        >
          <div
            style={{
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              maxWidth: '360px',
              width: '90%',
              border: '1px solid var(--border)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
              Delete &apos;{confirmPage.name}&apos;?
            </p>
            <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              Widgets on this page will be moved to the recycle bin.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={handleCancelDelete}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleConfirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
