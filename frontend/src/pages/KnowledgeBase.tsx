


import { useState, useRef, useCallback } from 'react'
import { BookOpen, Plus, MagnifyingGlass } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { SkeletonList } from '@/components/Skeleton'
import { PageHeader } from '@/components/PageHeader'
import type { KnowledgeEntry } from './knowledge/shared'
import { TagChip } from './knowledge/TagChip'
import { SlidePanel } from './knowledge/SlidePanel'
import { AddEntryModal } from './knowledge/AddEntryModal'
import { EntryCard } from './knowledge/EntryCard'

export default function KnowledgePage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [selected, setSelected] = useState<KnowledgeEntry | null>(null)
  const [showModal, setShowModal] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: entriesData, isLoading } = useQuery<{ entries: KnowledgeEntry[] }>({
    queryKey: ['knowledge', debouncedSearch, tagFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('q', debouncedSearch)
      if (tagFilter) params.set('tag', tagFilter)
      return api.get<{ entries: KnowledgeEntry[] }>(`/api/knowledge?${params}`)
    },
  })

  const entries = entriesData?.entries ?? []

  const handleSearchChange = (val: string) => {
    setSearch(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300)
  }

  const handleTagFilter = (tag: string) => {
    const next = tagFilter === tag ? null : tag
    setTagFilter(next)
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.del(`/api/knowledge?id=${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] })
    },
  })

  const handleDelete = async (id: string) => {
    setSelected(null)
    await deleteMutation.mutateAsync(id)
  }

  const handleSelectEntry = useCallback((entry: KnowledgeEntry) => {
    setSelected(entry)
  }, [])

  const allTags = Array.from(new Set(entries.flatMap(e => e.tags || [])))

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BookOpen size={20} style={{ color: 'var(--accent)' }} />
          <PageHeader defaultTitle="Knowledge" defaultSubtitle="Notes · Articles · Links · Learnings" />
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            background: 'var(--purple-a20)',
            color: 'var(--accent-bright)',
            fontWeight: 600,
            fontSize: '13px',
            whiteSpace: 'nowrap',
          }}
        >
          <Plus size={14} />
          Add Entry
        </button>
      </div>

      {/* MagnifyingGlass */}
      <div style={{ position: 'relative', marginBottom: '14px' }}>
        <MagnifyingGlass size={14} style={{
          position: 'absolute',
          left: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-muted)',
          pointerEvents: 'none',
        }} />
        <input
          type="search"
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
          placeholder="MagnifyingGlass title, content..."
          aria-label="MagnifyingGlass knowledge base"
          style={{
            width: '100%',
            padding: '10px 14px 10px 36px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '13px',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Tag filter chips */}
      {allTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' }}>
          {tagFilter && (
            <TagChip
              tag={`\u2715 ${tagFilter}`}
              active
              onClick={() => setTagFilter(null)}
            />
          )}
          {allTags.filter(t => t !== tagFilter).map(tag => (
            <TagChip key={tag} tag={tag} onClick={() => handleTagFilter(tag)} />
          ))}
        </div>
      )}

      {/* Grid */}
      <div aria-live="polite" aria-busy={isLoading}>
      {isLoading ? (
        <SkeletonList count={3} lines={3} layout="grid" />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={search || tagFilter ? 'No entries match your filters' : 'Knowledge base is empty'}
          description={search || tagFilter ? 'Try adjusting your filters.' : 'Save articles, links, and snippets here.'}
          action={!search && !tagFilter ? { label: 'Add Entry', onClick: () => setShowModal(true) } : undefined}
        />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '12px',
        }}>
          {entries.map(entry => (
            <EntryCard key={entry.id} entry={entry} onSelect={handleSelectEntry} />
          ))}
        </div>
      )}
      </div>

      {/* Slide-in panel */}
      {selected && (
        <SlidePanel
          entry={selected}
          onClose={() => setSelected(null)}
          onDelete={() => handleDelete(selected.id)}
        />
      )}

      {/* Add modal */}
      {showModal && (
        <AddEntryModal
          onClose={() => setShowModal(false)}
          onAdded={() => queryClient.invalidateQueries({ queryKey: ['knowledge'] })}
        />
      )}
    </div>
  )
}
