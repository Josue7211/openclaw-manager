import { useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import { getSidebarConfig, subscribeSidebarConfig } from '@/lib/sidebar-config'

/**
 * Returns the custom display name for the current page, or the default title.
 */
export function usePageTitle(defaultTitle: string): string {
  const { pathname } = useLocation()
  const config = useSyncExternalStore(subscribeSidebarConfig, getSidebarConfig)
  return config.customNames[pathname] || defaultTitle
}

