/**
 * DataTable primitive -- sortable table with sticky header, row actions, and pagination.
 *
 * Renders an HTML table from config.columns (column definitions) and config.rows
 * (row data). Supports column sorting (asc/desc/unsorted cycle), striped rows,
 * sticky header, and pagination.
 *
 * Pure render component -- data comes from config, not internal fetching.
 */

import React, { useState, useMemo } from 'react'
import {
  Table,
  CaretUp,
  CaretDown,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react'
import type { WidgetProps, WidgetConfigSchema } from '@/lib/widget-registry'
import { configString, configNumber, configBool, configArray } from './shared'
import { EmptyState } from '@/components/ui/EmptyState'

// ---------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------

export const configSchema: WidgetConfigSchema = {
  fields: [
    { key: 'title', label: 'Title', type: 'text', default: '' },
    { key: 'pageSize', label: 'Page Size', type: 'number', default: 10, min: 5, max: 100 },
    { key: 'striped', label: 'Striped Rows', type: 'toggle', default: true },
  ],
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TableColumn {
  key: string
  label: string
  sortable?: boolean
}

type TableRow = Record<string, unknown>

type SortState = 'asc' | 'desc' | null

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DataTable = React.memo(function DataTable({
  config,
}: WidgetProps) {
  const title = configString(config, 'title', '')
  const pageSize = configNumber(config, 'pageSize', 10)
  const striped = configBool(config, 'striped', true)
  const columns = configArray<TableColumn>(config, 'columns')
  const rows = configArray<TableRow>(config, 'rows')

  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortState>(null)
  const [currentPage, setCurrentPage] = useState(0)

  // Sort cycle: null -> asc -> desc -> null
  function handleSort(colKey: string) {
    if (sortColumn !== colKey) {
      setSortColumn(colKey)
      setSortDirection('asc')
    } else if (sortDirection === 'asc') {
      setSortDirection('desc')
    } else if (sortDirection === 'desc') {
      setSortColumn(null)
      setSortDirection(null)
    }
    setCurrentPage(0)
  }

  // Sort rows
  const sorted = useMemo(() => {
    if (!sortColumn || !sortDirection) return rows

    const copy = [...rows]
    copy.sort((a, b) => {
      const aVal = a[sortColumn]
      const bVal = b[sortColumn]

      // Numeric comparison
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }

      // String comparison (fallback)
      const aStr = String(aVal ?? '')
      const bStr = String(bVal ?? '')
      const cmp = aStr.localeCompare(bStr)
      return sortDirection === 'asc' ? cmp : -cmp
    })
    return copy
  }, [rows, sortColumn, sortDirection])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paged = sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

  // Empty state
  if (rows.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {title && <div style={titleStyle}>{title}</div>}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <EmptyState icon={Table} title="No data" description="No rows to display" />
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Title */}
      {title && <div style={titleStyle}>{title}</div>}

      {/* Table wrapper */}
      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', minHeight: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }} role="table">
          <thead>
            <tr>
              {columns.map((col) => {
                const isSorted = sortColumn === col.key
                const isSortable = col.sortable !== false
                return (
                  <th
                    key={col.key}
                    role="columnheader"
                    aria-sort={
                      isSorted && sortDirection === 'asc'
                        ? 'ascending'
                        : isSorted && sortDirection === 'desc'
                          ? 'descending'
                          : 'none'
                    }
                    onClick={isSortable ? () => handleSort(col.key) : undefined}
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                      background: 'var(--bg-card-solid, var(--bg-card))',
                      padding: '8px 12px',
                      textAlign: 'left',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontWeight: 600,
                      borderBottom: '2px solid var(--border)',
                      cursor: isSortable ? 'pointer' : 'default',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {col.label}
                      {isSorted && sortDirection === 'asc' && (
                        <CaretUp size={12} weight="bold" />
                      )}
                      {isSorted && sortDirection === 'desc' && (
                        <CaretDown size={12} weight="bold" />
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                style={{
                  background:
                    striped && rowIdx % 2 === 1
                      ? 'var(--hover-bg)'
                      : 'transparent',
                }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: '8px 12px',
                      fontSize: 'var(--text-sm)',
                      color: 'var(--text-primary)',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    {String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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

export default DataTable
