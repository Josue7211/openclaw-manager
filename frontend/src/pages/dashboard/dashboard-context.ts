/**
 * Dashboard data context — shared between Dashboard page and widget cards.
 *
 * Lives in its own file to avoid circular imports: Dashboard.tsx provides the
 * context, and the widget cards (loaded lazily via widget-registry) consume it.
 */

import { createContext, useContext } from 'react'
import type { useDashboardData } from './useDashboardData'

export type DashboardDataContextType = ReturnType<typeof useDashboardData>

export const DashboardDataContext = createContext<DashboardDataContextType | null>(null)

export function useDashboardDataContext(): DashboardDataContextType {
  const ctx = useContext(DashboardDataContext)
  if (!ctx) throw new Error('useDashboardDataContext must be used within Dashboard')
  return ctx
}
