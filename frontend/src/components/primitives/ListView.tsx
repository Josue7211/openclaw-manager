/**
 * ListView primitive -- sortable, filterable, paginated list widget.
 *
 * Renders items from config.items array. Each item has a label (required),
 * optional value, and optional icon. Supports text search filtering,
 * ascending/descending sort by label, and pagination.
 *
 * Pure render component -- data comes from config, not internal fetching.
 */

import React, { useState, useEffect, useMemo } from 'react'
import {
  List,
  MagnifyingGlass,
  SortAscending,
  SortDescending,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react'
import type { WidgetProps, WidgetConfigSchema } from '@/lib/widget-registry'
import { configString, configNumber, configBool, configArray } from './shared'
import { EmptyState } from '@/components/ui/EmptyState'

// ---------------------------------------------------------------------------
// Config schema -- drives the config editor in WidgetPicker
// ---------------------------------------------------------------------------

export const configSchema: WidgetConfigSchema = {
  fields: [
    { key: 'title', label: 'Title', type: 'text', default: '' },
    { key: 'pageSize', label: 'Page Size', type: 'number', default: 10, min: 5, max: 50 },
    { key: 'searchable', label: 'Show Search', type: 'toggle', default: true },
  ],
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ListItem {
  id: string
  label: string
  value?: string
  icon?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ListView = React.memo(function ListView({
  config,
}: WidgetProps) {
  const title = configString(config, 'title', '')
  const pageSize = configNumber(config, 'pageSize', 10)
  const searchable = configBool(config, 'searchable', true)
  const items = configArray<ListItem>(config, 'items')

  const [searchTerm, setSearchTerm] = useState('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(0)

  // Reset to first page when search term changes
  useEffect(() => {
    setCurrentPage(0)
  }, [searchTerm])

  // Filter + sort + paginate
  const filtered = useMemo(() => {
    let result = items
    if (searchTerm) {
      const lower = searchTerm.toLowerCase()
      result = result.filter((item) =>
        (item.label ?? '').toLowerCase().includes(lower),
      )
    }
    return result
  }, [items, searchTerm])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      const cmp = (a.label ?? '').localeCompare(b.label ?? '')
      return sortDirection === 'asc' ? cmp : -cmp
    })
    return copy
  }, [filtered, sortDirection])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paged = sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

  // Empty state
  if (items.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {title && (
          <div style={titleStyle}>{title}</div>
        )}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <EmptyState icon={List} title="No items" description="No data to display" />
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Title */}
      {title && <div style={titleStyle}>{title}</div>}

      {/* Toolbar: search + sort */}
      <div style={{ display: 'flex', gap: '8px', padding: '8px 12px 4px', alignItems: 'center' }}>
        {searchable && (
          <div style={{ flex: 1, position: 'relative' }}>
            <MagnifyingGlass
              size={14}
              weight="bold"
              style={{
                position: 'absolute',
                left: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="search"
              role="searchbox"
              aria-label="Filter items"
              placeholder="Filter..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px 6px 28px',
                fontSize: 'var(--text-xs)',
                background: 'var(--bg-base)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
          </div>
        )}
        <button
          aria-label={sortDirection === 'asc' ? 'Sort descending' : 'Sort ascending'}
          onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
          style={iconBtnStyle}
        >
          {sortDirection === 'asc' ? (
            <SortAscending size={16} weight="bold" />
          ) : (
            <SortDescending size={16} weight="bold" />
          )}
        </button>
      </div>

      {/* Items */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {paged.map((item) => (
          <div
            key={item.id}
            data-testid="list-item"
            className="hover-bg"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
              {item.label}
            </span>
            {item.value != null && (
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                {item.value}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {sorted.length > pageSize && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '6px 12px',
            borderTop: '1px solid var(--border)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
          }}
        >
          <button
            aria-label="Previous page"
            disabled={currentPage === 0}
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            style={iconBtnStyle}
          >
            <CaretLeft size={14} weight="bold" />
          </button>
          <span>Page {currentPage + 1} of {totalPages}</span>
          <button
            aria-label="Next page"
            disabled={currentPage >= totalPages - 1}
            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
            style={iconBtnStyle}
          >
            <CaretRight size={14} weight="bold" />
          </button>
        </div>
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const titleStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
  color: 'var(--text-primary)',
  padding: '10px 12px 4px',
}

const iconBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4px',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  color: 'var(--text-muted)',
  cursor: 'pointer',
}

export default ListView
