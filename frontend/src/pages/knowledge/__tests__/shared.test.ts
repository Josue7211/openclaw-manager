import { describe, it, expect } from 'vitest'
import type { KnowledgeEntry } from '../shared'

/* ─── KnowledgeEntry type structural validation ──────────────────────── */

describe('KnowledgeEntry type', () => {
  it('is structurally valid with all fields', () => {
    const entry: KnowledgeEntry = {
      id: 'ke-1',
      title: 'React Query best practices',
      content: 'Always use query keys from a centralized file...',
      source_url: 'https://tanstack.com/query',
      tags: ['react', 'query', 'data-fetching'],
      created_at: '2026-03-15T12:00:00Z',
      updated_at: '2026-03-15T14:30:00Z',
    }
    expect(entry.id).toBeTruthy()
    expect(entry.title).toBe('React Query best practices')
    expect(entry.tags).toHaveLength(3)
  })

  it('allows optional content to be undefined', () => {
    const entry: KnowledgeEntry = {
      id: 'ke-2',
      title: 'Bookmark',
      tags: [],
      created_at: '2026-03-15T12:00:00Z',
      updated_at: '2026-03-15T12:00:00Z',
    }
    expect(entry.content).toBeUndefined()
  })

  it('allows optional source_url to be undefined', () => {
    const entry: KnowledgeEntry = {
      id: 'ke-3',
      title: 'Local note',
      content: 'Some text',
      tags: ['note'],
      created_at: '2026-03-15T12:00:00Z',
      updated_at: '2026-03-15T12:00:00Z',
    }
    expect(entry.source_url).toBeUndefined()
  })

  it('supports empty tags array', () => {
    const entry: KnowledgeEntry = {
      id: 'ke-4',
      title: 'Untagged',
      tags: [],
      created_at: '2026-03-15T12:00:00Z',
      updated_at: '2026-03-15T12:00:00Z',
    }
    expect(entry.tags).toEqual([])
  })

  it('supports multiple tags', () => {
    const entry: KnowledgeEntry = {
      id: 'ke-5',
      title: 'Well tagged entry',
      tags: ['rust', 'tauri', 'backend', 'performance', 'security'],
      created_at: '2026-03-15T12:00:00Z',
      updated_at: '2026-03-16T10:00:00Z',
    }
    expect(entry.tags).toHaveLength(5)
    expect(entry.tags).toContain('rust')
    expect(entry.tags).toContain('security')
  })

  it('has required id, title, tags, created_at, updated_at fields', () => {
    const entry: KnowledgeEntry = {
      id: 'ke-6',
      title: 'Minimal',
      tags: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(typeof entry.id).toBe('string')
    expect(typeof entry.title).toBe('string')
    expect(Array.isArray(entry.tags)).toBe(true)
    expect(typeof entry.created_at).toBe('string')
    expect(typeof entry.updated_at).toBe('string')
  })
})
