import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DataTable, { configSchema } from '../DataTable'

const baseProps = {
  widgetId: 'test-table',
  isEditMode: false,
  size: { w: 4, h: 4 },
}

const sampleColumns = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'count', label: 'Count', sortable: true },
]

const sampleRows = [
  { name: 'Alpha', status: 'Active', count: 10 },
  { name: 'Charlie', status: 'Idle', count: 5 },
  { name: 'Bravo', status: 'Active', count: 20 },
]

function makeRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    name: `Row ${String(i).padStart(2, '0')}`,
    status: i % 2 === 0 ? 'Active' : 'Idle',
    count: i * 10,
  }))
}

describe('DataTable', () => {
  it('renders table with correct column headers from config.columns', () => {
    render(
      <DataTable
        {...baseProps}
        config={{ columns: sampleColumns, rows: sampleRows }}
      />,
    )
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Count')).toBeInTheDocument()
  })

  it('renders row data from config.rows', () => {
    render(
      <DataTable
        {...baseProps}
        config={{ columns: sampleColumns, rows: sampleRows }}
      />,
    )
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Bravo')).toBeInTheDocument()
    expect(screen.getByText('Charlie')).toBeInTheDocument()
    expect(screen.getAllByText('Active')).toHaveLength(2)
  })

  it('shows EmptyState when rows is empty', () => {
    render(
      <DataTable
        {...baseProps}
        config={{ columns: sampleColumns, rows: [] }}
      />,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('No data')).toBeInTheDocument()
  })

  it('shows EmptyState when rows is missing', () => {
    render(
      <DataTable {...baseProps} config={{ columns: sampleColumns }} />,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('clicking sortable column header sorts rows ascending then descending', async () => {
    const user = userEvent.setup()
    render(
      <DataTable
        {...baseProps}
        config={{ columns: sampleColumns, rows: sampleRows, pageSize: 10 }}
      />,
    )

    // Click Name header to sort ascending
    const nameHeader = screen.getByRole('columnheader', { name: /name/i })
    await user.click(nameHeader)

    const getFirstColumnCells = () => {
      const tbody = screen.getByRole('table').querySelector('tbody')!
      const cells = within(tbody).getAllByRole('cell')
      // First column cells: every 3rd starting from 0
      return cells.filter((_, i) => i % 3 === 0).map((c) => c.textContent)
    }

    const ascending = getFirstColumnCells()
    expect(ascending[0]).toBe('Alpha')
    expect(ascending[1]).toBe('Bravo')
    expect(ascending[2]).toBe('Charlie')

    // Click again for descending
    await user.click(nameHeader)
    const descending = getFirstColumnCells()
    expect(descending[0]).toBe('Charlie')
    expect(descending[1]).toBe('Bravo')
    expect(descending[2]).toBe('Alpha')
  })

  it('sort direction toggles through asc -> desc -> unsorted on repeated clicks', async () => {
    const user = userEvent.setup()
    render(
      <DataTable
        {...baseProps}
        config={{ columns: sampleColumns, rows: sampleRows, pageSize: 10 }}
      />,
    )

    const nameHeader = screen.getByRole('columnheader', { name: /name/i })

    // Click 1: asc
    await user.click(nameHeader)
    // Click 2: desc
    await user.click(nameHeader)
    // Click 3: unsorted (back to original order)
    await user.click(nameHeader)

    const tbody = screen.getByRole('table').querySelector('tbody')!
    const cells = within(tbody).getAllByRole('cell')
    const firstCol = cells.filter((_, i) => i % 3 === 0).map((c) => c.textContent)
    // Original order: Alpha, Charlie, Bravo
    expect(firstCol[0]).toBe('Alpha')
    expect(firstCol[1]).toBe('Charlie')
    expect(firstCol[2]).toBe('Bravo')
  })

  it('pagination controls show correct page', () => {
    const rows = makeRows(15)
    render(
      <DataTable
        {...baseProps}
        config={{ columns: sampleColumns, rows, pageSize: 5 }}
      />,
    )

    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByText('Row 00')).toBeInTheDocument()
    expect(screen.getByText('Row 04')).toBeInTheDocument()
    expect(screen.queryByText('Row 05')).not.toBeInTheDocument()
  })

  it('pagination next/prev buttons work and disable at boundaries', async () => {
    const user = userEvent.setup()
    const rows = makeRows(15)
    render(
      <DataTable
        {...baseProps}
        config={{ columns: sampleColumns, rows, pageSize: 5 }}
      />,
    )

    const prevBtn = screen.getByRole('button', { name: /previous/i })
    const nextBtn = screen.getByRole('button', { name: /next/i })

    expect(prevBtn).toBeDisabled()
    expect(nextBtn).not.toBeDisabled()

    await user.click(nextBtn)
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()

    await user.click(nextBtn)
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument()
    expect(nextBtn).toBeDisabled()
    expect(prevBtn).not.toBeDisabled()
  })

  it('striped rows have alternating background when striped is true', () => {
    render(
      <DataTable
        {...baseProps}
        config={{ columns: sampleColumns, rows: sampleRows, striped: true }}
      />,
    )

    const tbody = screen.getByRole('table').querySelector('tbody')!
    const tableRows = tbody.querySelectorAll('tr')

    // Even rows (0-indexed) should have striped background
    expect(tableRows[1].style.background).toBeTruthy()
  })

  it('renders title when provided', () => {
    render(
      <DataTable
        {...baseProps}
        config={{ title: 'My Table', columns: sampleColumns, rows: sampleRows }}
      />,
    )
    expect(screen.getByText('My Table')).toBeInTheDocument()
  })

  it('exports configSchema with expected fields', () => {
    expect(configSchema.fields).toHaveLength(3)
    const keys = configSchema.fields.map((f) => f.key)
    expect(keys).toContain('title')
    expect(keys).toContain('pageSize')
    expect(keys).toContain('striped')
  })
})
