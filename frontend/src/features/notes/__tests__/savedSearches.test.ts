import { describe, expect, it } from 'vitest'
import { mergeSavedSearches, normalizeSavedSearches, removeSavedSearch, upsertSavedSearch } from '../savedSearches'

describe('notes saved searches', () => {
  it('normalizes saved searches and removes invalid entries', () => {
    expect(normalizeSavedSearches([
      { id: 'a', label: ' Active ', query: ' tag:active ', createdAt: 10, updatedAt: 11 },
      { id: 'a', label: 'Duplicate', query: 'tag:other' },
      { label: '', query: 'task:todo' },
      { query: '' },
    ])).toEqual([
      { id: 'a', label: 'Active', query: 'tag:active', createdAt: 10, updatedAt: 11 },
      expect.objectContaining({ id: 'search:task:todo', label: 'task:todo', query: 'task:todo' }),
    ])
  })

  it('upserts by normalized query and keeps most recent first', () => {
    const first = upsertSavedSearch([], { label: 'Open tasks', query: ' task:todo ', now: 10 })
    const next = upsertSavedSearch(first, { label: 'Strategy', query: 'tag:strategy', now: 12 })
    const updated = upsertSavedSearch(next, { label: 'Todo', query: 'TASK:TODO', now: 14 })

    expect(updated.map(search => search.label)).toEqual(['Todo', 'Strategy'])
    expect(updated[0]).toEqual(expect.objectContaining({
      id: 'search:task:todo',
      query: 'TASK:TODO',
      createdAt: 10,
      updatedAt: 14,
    }))
  })

  it('removes by id', () => {
    const searches = upsertSavedSearch(upsertSavedSearch([], { query: 'tag:a', now: 1 }), { query: 'tag:b', now: 2 })

    expect(removeSavedSearch(searches, 'search:tag:a').map(search => search.query)).toEqual(['tag:b'])
  })

  it('merges synced and local searches with newer matching ids winning', () => {
    const synced = [
      { id: 'search:tag:active', label: 'Old active', query: 'tag:active', createdAt: 1, updatedAt: 10 },
      { id: 'search:path:projects', label: 'Projects', query: 'path:Projects', createdAt: 2, updatedAt: 20 },
    ]
    const local = [
      { id: 'search:tag:active', label: 'New active', query: 'tag:active', createdAt: 1, updatedAt: 30 },
    ]

    expect(mergeSavedSearches(synced, local)).toEqual([
      { id: 'search:tag:active', label: 'New active', query: 'tag:active', createdAt: 1, updatedAt: 30 },
      { id: 'search:path:projects', label: 'Projects', query: 'path:Projects', createdAt: 2, updatedAt: 20 },
    ])
  })
})
