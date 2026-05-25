import { beforeEach, describe, expect, it } from 'vitest'
import {
  CHAT_PROJECT_GROUPING_MODE_KEY,
  CHAT_PROJECT_SORT_ORDER_KEY,
  CHAT_SIDEBAR_COLLAPSED_KEY,
  loadProjectGroupingMode,
  loadProjectSortOrder,
  loadSidebarCollapsed,
  loadStoredValue,
  hasStoredValue,
  saveProjectGroupingMode,
  saveProjectSortOrder,
  saveSidebarCollapsed,
  saveStoredValue,
} from '../sidebarPreferences'

describe('T3 sidebar preference adapter', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persists sidebar collapse and generic stored values', () => {
    expect(loadSidebarCollapsed()).toBe(false)
    saveSidebarCollapsed(true)
    expect(localStorage.getItem(CHAT_SIDEBAR_COLLAPSED_KEY)).toBe('1')
    expect(loadSidebarCollapsed()).toBe(true)

    saveStoredValue('chat-test-key', 'value')
    expect(loadStoredValue('chat-test-key', 'fallback')).toBe('value')
    expect(loadStoredValue('missing-key', 'fallback')).toBe('fallback')
    expect(hasStoredValue('chat-test-key')).toBe(true)
    expect(hasStoredValue('missing-key')).toBe(false)
  })

  it('normalizes project grouping and sort preferences', () => {
    localStorage.setItem(CHAT_PROJECT_GROUPING_MODE_KEY, 'bad')
    localStorage.setItem(CHAT_PROJECT_SORT_ORDER_KEY, 'bad')
    expect(loadProjectGroupingMode()).toBe('repository')
    expect(loadProjectSortOrder()).toBe('name')

    saveProjectGroupingMode('separate')
    saveProjectSortOrder('recent')
    expect(loadProjectGroupingMode()).toBe('separate')
    expect(loadProjectSortOrder()).toBe('recent')
  })
})
