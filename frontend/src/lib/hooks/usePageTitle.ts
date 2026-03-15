import { useSyncExternalStore, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { getSidebarConfig, setSidebarConfig, subscribeSidebarConfig } from '@/lib/sidebar-config'
import { renameItem } from '@/lib/sidebar-config'

/**
 * Returns the custom display name for the current page, or the default title.
 */
export function usePageTitle(defaultTitle: string): string {
  const { pathname } = useLocation()
  const config = useSyncExternalStore(subscribeSidebarConfig, getSidebarConfig)
  return config.customNames[pathname] || defaultTitle
}

/**
 * Returns the page title + inline editing state.
 */
export function useEditablePageTitle(defaultTitle: string) {
  const { pathname } = useLocation()
  const config = useSyncExternalStore(subscribeSidebarConfig, getSidebarConfig)
  const title = config.customNames[pathname] || defaultTitle

  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')

  const startEditing = useCallback(() => {
    setEditValue(title)
    setEditing(true)
  }, [title])

  const save = useCallback(() => {
    setEditing(false)
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== defaultTitle) {
      renameItem(pathname, trimmed)
    } else if (!trimmed || trimmed === defaultTitle) {
      // Reset to default
      const cfg = getSidebarConfig()
      const newNames = { ...cfg.customNames }
      delete newNames[pathname]
      setSidebarConfig({ ...cfg, customNames: newNames })
    }
  }, [editValue, defaultTitle, pathname])

  const cancel = useCallback(() => setEditing(false), [])

  return { title, editing, editValue, setEditValue, startEditing, save, cancel }
}

/**
 * Returns the subtitle for the current page + inline editing state.
 * Subtitles are stored in customNames with a `::subtitle` suffix.
 */
export function usePageSubtitle(defaultSubtitle: string) {
  const { pathname } = useLocation()
  const config = useSyncExternalStore(subscribeSidebarConfig, getSidebarConfig)
  const key = `${pathname}::subtitle`
  const subtitle = config.customNames[key] || defaultSubtitle

  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')

  const startEditing = useCallback(() => {
    setEditValue(subtitle)
    setEditing(true)
  }, [subtitle])

  const save = useCallback(() => {
    setEditing(false)
    const trimmed = editValue.trim()
    const cfg = getSidebarConfig()
    const newNames = { ...cfg.customNames }
    if (!trimmed || trimmed === defaultSubtitle) {
      delete newNames[key]
    } else {
      newNames[key] = trimmed
    }
    setSidebarConfig({ ...cfg, customNames: newNames })
  }, [editValue, defaultSubtitle, key])

  const cancel = useCallback(() => setEditing(false), [])

  return { subtitle, editing, editValue, setEditValue, startEditing, save, cancel }
}
