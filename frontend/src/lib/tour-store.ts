/**
 * Guided Tour State Store -- manages tour stops and progress via useSyncExternalStore.
 *
 * Follows the exact pattern from wizard-store.ts and theme-store.ts:
 *   - Module-level _state + _listeners
 *   - persist() writes to localStorage and notifies listeners
 *   - React components subscribe via useSyncExternalStore(subscribeTour, getTourState)
 *
 * Tour stops are data-driven (array of TourStop objects) across 3 sections.
 * The tour supports: next, skip-section, skip-tour, and resume-on-refresh.
 */

import { useSyncExternalStore } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TourStop {
  id: string
  target: string          // CSS selector for target element
  title: string
  body: string
  placement: 'top' | 'bottom' | 'left' | 'right'
  section?: string        // Tour section for skip-by-section
}

interface TourState {
  active: boolean
  currentStopIndex: number
  completedSections: string[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'tour-progress'

/** 8 tour stops across 3 sections */
export const TOUR_STOPS: readonly TourStop[] = [
  // Section: Navigation (3 stops)
  {
    id: 'sidebar',
    target: '[data-tour="sidebar"]',
    title: 'This is your Sidebar',
    body: 'Navigate between modules here. Drag to reorder, right-click for options.',
    placement: 'right',
    section: 'Navigation',
  },
  {
    id: 'module-list',
    target: '[data-tour="module-list"]',
    title: 'Your Modules',
    body: 'Each module is a separate app feature. Enable or disable them in Settings.',
    placement: 'right',
    section: 'Navigation',
  },
  {
    id: 'settings',
    target: '[data-tour="settings"]',
    title: 'Settings',
    body: 'Customize everything here -- themes, connections, modules, and more.',
    placement: 'right',
    section: 'Navigation',
  },

  // Section: Dashboard (2 stops)
  {
    id: 'dashboard-area',
    target: '[data-tour="dashboard"]',
    title: 'Your Dashboard',
    body: 'See all your important information at a glance. Widgets will be customizable soon.',
    placement: 'bottom',
    section: 'Dashboard',
  },
  {
    id: 'connection-status',
    target: '[data-tour="connection-status"]',
    title: 'Connection Status',
    body: 'Check the health of your connected services here.',
    placement: 'bottom',
    section: 'Dashboard',
  },

  // Section: Key Features (3 stops)
  {
    id: 'search',
    target: '[data-tour="search"]',
    title: 'Search Anything',
    body: 'Press Cmd+/ to search across all your data -- messages, notes, tasks, and more.',
    placement: 'bottom',
    section: 'Key Features',
  },
  {
    id: 'command-palette',
    target: '[data-tour="command-palette"]',
    title: 'Command Palette',
    body: 'Press Cmd+K for the command palette. Most actions have keyboard shortcuts.',
    placement: 'bottom',
    section: 'Key Features',
  },
  {
    id: 'shortcuts',
    target: '[data-tour="shortcuts"]',
    title: 'Keyboard Shortcuts',
    body: 'Press ? to see all keyboard shortcuts. Power users love these.',
    placement: 'bottom',
    section: 'Key Features',
  },
] as const

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

function createDefaultState(): TourState {
  return {
    active: false,
    currentStopIndex: 0,
    completedSections: [],
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function loadInitialState(): TourState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TourState>
      return { ...createDefaultState(), ...parsed }
    }
  } catch { /* fallback to default */ }
  return createDefaultState()
}

let _state: TourState = loadInitialState()
const _listeners = new Set<() => void>()

function persist(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_state))
  _listeners.forEach(fn => fn())
}

function notify(): void {
  _listeners.forEach(fn => fn())
}

// ---------------------------------------------------------------------------
// Read API
// ---------------------------------------------------------------------------

function getTourState(): TourState {
  return _state
}

function subscribeTour(fn: () => void): () => void {
  _listeners.add(fn)
  return () => { _listeners.delete(fn) }
}

// ---------------------------------------------------------------------------
// React Hook
// ---------------------------------------------------------------------------

export function useTourState(): TourState {
  return useSyncExternalStore(subscribeTour, getTourState)
}

// ---------------------------------------------------------------------------
// Derived getters
// ---------------------------------------------------------------------------

export function getCurrentStop(): TourStop | null {
  if (!_state.active) return null
  return TOUR_STOPS[_state.currentStopIndex] ?? null
}

/** Get the unique section names in order */
function getSections(): string[] {
  const seen = new Set<string>()
  const sections: string[] = []
  for (const stop of TOUR_STOPS) {
    if (stop.section && !seen.has(stop.section)) {
      seen.add(stop.section)
      sections.push(stop.section)
    }
  }
  return sections
}

// ---------------------------------------------------------------------------
// Mutation API
// ---------------------------------------------------------------------------

export function nextStop(): void {
  if (!_state.active) return
  const nextIdx = _state.currentStopIndex + 1
  if (nextIdx >= TOUR_STOPS.length) {
    endTour()
    return
  }

  // Track completed sections
  const currentStop = TOUR_STOPS[_state.currentStopIndex]
  const nextStopDef = TOUR_STOPS[nextIdx]
  let completedSections = _state.completedSections
  if (
    currentStop?.section &&
    nextStopDef?.section !== currentStop.section &&
    !completedSections.includes(currentStop.section)
  ) {
    completedSections = [...completedSections, currentStop.section]
  }

  _state = { ..._state, currentStopIndex: nextIdx, completedSections }
  persist()
}

export function skipSection(): void {
  if (!_state.active) return
  const currentStop = TOUR_STOPS[_state.currentStopIndex]
  if (!currentStop?.section) {
    nextStop()
    return
  }

  const currentSection = currentStop.section
  const sections = getSections()
  const currentSectionIdx = sections.indexOf(currentSection)
  const nextSection = sections[currentSectionIdx + 1]

  if (!nextSection) {
    // No more sections -- end tour
    endTour()
    return
  }

  // Find the first stop of the next section
  const nextIdx = TOUR_STOPS.findIndex(s => s.section === nextSection)
  if (nextIdx === -1) {
    endTour()
    return
  }

  const completedSections = _state.completedSections.includes(currentSection)
    ? _state.completedSections
    : [..._state.completedSections, currentSection]

  _state = { ..._state, currentStopIndex: nextIdx, completedSections }
  persist()
}

export function skipTour(): void {
  _state = createDefaultState()
  localStorage.removeItem(STORAGE_KEY)
  notify()
}

function endTour(): void {
  _state = createDefaultState()
  localStorage.removeItem(STORAGE_KEY)
  notify()
}
