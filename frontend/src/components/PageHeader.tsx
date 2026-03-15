import { useState, useCallback, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useSyncExternalStore } from 'react'
import { getSidebarConfig, setSidebarConfig, subscribeSidebarConfig } from '@/lib/sidebar-config'
import { renameItem } from '@/lib/sidebar-config'

/** Handle Ctrl+Z/Y in inputs via execCommand (works in WebKitGTK/Tauri) */
function handleInputKeyDown(
  e: React.KeyboardEvent<HTMLInputElement>,
  onSave: () => void,
  onCancel: () => void,
) {
  if (e.key === 'Enter') { onSave(); return }
  if (e.key === 'Escape') { onCancel(); return }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    e.stopPropagation()
    if (e.shiftKey) {
      document.execCommand('redo')
    } else {
      document.execCommand('undo')
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault()
    e.stopPropagation()
    document.execCommand('redo')
  }
}

/**
 * Editable page header with title and subtitle.
 * Double-click either to rename. Ctrl+Z works inside inputs.
 */
export function PageHeader({
  defaultTitle,
  defaultSubtitle,
  style,
}: {
  defaultTitle: string
  defaultSubtitle?: string
  style?: React.CSSProperties
}) {
  const { pathname } = useLocation()
  const config = useSyncExternalStore(subscribeSidebarConfig, getSidebarConfig)

  const title = config.customNames[pathname] || defaultTitle
  const subtitleKey = `${pathname}::subtitle`
  const subtitle = config.customNames[subtitleKey] || defaultSubtitle || ''

  const [editingTitle, setEditingTitle] = useState(false)
  const [editingSub, setEditingSub] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const subRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingTitle && titleRef.current) {
      titleRef.current.focus()
      titleRef.current.select()
    }
  }, [editingTitle])

  useEffect(() => {
    if (editingSub && subRef.current) {
      subRef.current.focus()
      subRef.current.select()
    }
  }, [editingSub])

  const saveTitle = useCallback(() => {
    setEditingTitle(false)
    const val = titleRef.current?.value.trim() || ''
    if (val && val !== defaultTitle) {
      renameItem(pathname, val)
    } else {
      const cfg = getSidebarConfig()
      const newNames = { ...cfg.customNames }
      delete newNames[pathname]
      setSidebarConfig({ ...cfg, customNames: newNames })
    }
  }, [defaultTitle, pathname])

  const saveSub = useCallback(() => {
    setEditingSub(false)
    const val = subRef.current?.value.trim() || ''
    const cfg = getSidebarConfig()
    const newNames = { ...cfg.customNames }
    if (!val || val === (defaultSubtitle || '')) {
      delete newNames[subtitleKey]
    } else {
      newNames[subtitleKey] = val
    }
    setSidebarConfig({ ...cfg, customNames: newNames })
  }, [defaultSubtitle, subtitleKey])

  return (
    <div style={{ minWidth: 0, ...style }}>
      {editingTitle ? (
        <input
          ref={titleRef}
          defaultValue={title}
          onBlur={saveTitle}
          onKeyDown={e => handleInputKeyDown(e, saveTitle, () => setEditingTitle(false))}
          style={{
            margin: 0,
            fontSize: 'var(--text-2xl)',
            fontWeight: 700,
            color: 'var(--text-primary)',
            background: 'transparent',
            border: 'none',
            borderBottom: '2px solid var(--accent)',
            outline: 'none',
            padding: '0 0 2px',
            width: '100%',
            fontFamily: 'inherit',
          }}
        />
      ) : (
        <h1
          onDoubleClick={() => setEditingTitle(true)}
          title="Double-click to rename"
          style={{
            margin: 0,
            fontSize: 'var(--text-2xl)',
            fontWeight: 700,
            color: 'var(--text-primary)',
            cursor: 'text',
          }}
        >
          {title}
        </h1>
      )}
      {editingSub ? (
        <input
          ref={subRef}
          defaultValue={subtitle}
          onBlur={saveSub}
          onKeyDown={e => handleInputKeyDown(e, saveSub, () => setEditingSub(false))}
          style={{
            margin: '4px 0 0',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            fontFamily: 'monospace',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--accent)',
            outline: 'none',
            padding: '1px 0',
            minWidth: '250px',
          }}
        />
      ) : (
        <p
          onDoubleClick={() => setEditingSub(true)}
          title="Double-click to edit"
          style={{
            margin: '4px 0 0',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            fontFamily: 'monospace',
            cursor: 'text',
            minHeight: '16px',
            whiteSpace: 'nowrap',
          }}
        >
          {subtitle || '\u00A0'}
        </p>
      )}
    </div>
  )
}
