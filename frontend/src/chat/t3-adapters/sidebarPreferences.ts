/*
 * Copied/adapted from T3 Code's persisted sidebar/project view settings.
 * clawctrl keeps localStorage keys and normalization here so Chat.tsx and
 * the copied sidebar consume the same project-first preferences.
 */

import type {
  ChatProjectGroupingMode,
  ChatProjectSortOrder,
} from './projectWorkspace'

export const CHAT_SIDEBAR_COLLAPSED_KEY = 'chat-sidebar-collapsed'
export const CHAT_SELECTED_PROJECT_PATH_KEY = 'chat-selected-project-path'
export const CHAT_SELECTED_PROJECT_ENVIRONMENT_KEY = 'chat-selected-project-environment'
export const CHAT_SELECTED_RUNTIME_KEY = 'chat-selected-runtime'
export const CHAT_SELECTED_BRANCH_KEY = 'chat-selected-branch'
export const CHAT_PROJECT_GROUPING_MODE_KEY = 'chat-project-grouping-mode'
export const CHAT_PROJECT_SORT_ORDER_KEY = 'chat-project-sort-order'

export function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(CHAT_SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function saveSidebarCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(CHAT_SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // ignore storage access failures
  }
}

export function loadStoredValue(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

export function hasStoredValue(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null
  } catch {
    return false
  }
}

export function saveStoredValue(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore storage access failures
  }
}

export function loadProjectGroupingMode(): ChatProjectGroupingMode {
  const value = loadStoredValue(CHAT_PROJECT_GROUPING_MODE_KEY, 'repository')
  return value === 'repository' || value === 'repository-path' || value === 'separate'
    ? value
    : 'repository'
}

export function saveProjectGroupingMode(value: ChatProjectGroupingMode) {
  saveStoredValue(CHAT_PROJECT_GROUPING_MODE_KEY, value)
}

export function loadProjectSortOrder(): ChatProjectSortOrder {
  const value = loadStoredValue(CHAT_PROJECT_SORT_ORDER_KEY, 'name')
  return value === 'name' || value === 'machine' || value === 'recent' ? value : 'name'
}

export function saveProjectSortOrder(value: ChatProjectSortOrder) {
  saveStoredValue(CHAT_PROJECT_SORT_ORDER_KEY, value)
}
