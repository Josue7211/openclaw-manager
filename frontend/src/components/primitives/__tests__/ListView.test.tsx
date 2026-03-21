import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ListView, { configSchema } from '../ListView'

const baseProps = {
  widgetId: 'test-list',
  isEditMode: false,
  size: { w: 3, h: 4 },
}

function makeItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    label: `Item ${String(i).padStart(2, '0')}`,
    value: `val-${i}`,
  }))
}

describe('ListView', () => {
  it('renders item labels from config.items', () => {
    const items = [
      { id: '1', label: 'Alpha', value: '100' },
      { id: '2', label: 'Beta', value: '200' },
    ]
    render(<ListView {...baseProps} config={{ items }} />)

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
  })

  it('shows EmptyState when items is empty', () => {
    render(<ListView {...baseProps} config={{ items: [] }} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('No items')).toBeInTheDocument()
  })

  it('shows EmptyState when items is missing', () => {
    render(<ListView {...baseProps} config={{}} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('filter input filters items by label (case-insensitive)', async () => {
    const user = userEvent.setup()
    const items = [
      { id: '1', label: 'Apple' },
      { id: '2', label: 'Banana' },
      { id: '3', label: 'Apricot' },
    ]
    render(<ListView {...baseProps} config={{ items, searchable: true }} />)

    const input = screen.getByRole('searchbox')
    await user.type(input, 'ap')

    expect(screen.getByText('Apple')).toBeInTheDocument()
    expect(screen.getByText('Apricot')).toBeInTheDocument()
    expect(screen.queryByText('Banana')).not.toBeInTheDocument()
  })

  it('hides filter input when searchable is false', () => {
    const items = [{ id: '1', label: 'Alpha' }]
    render(<ListView {...baseProps} config={{ items, searchable: false }} />)
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('sort toggles between ascending and descending', async () => {
    const user = userEvent.setup()
    const items = [
      { id: '1', label: 'Cherry' },
      { id: '2', label: 'Apple' },
      { id: '3', label: 'Banana' },
    ]
    render(<ListView {...baseProps} config={{ items, pageSize: 10 }} />)

    const sortBtn = screen.getByRole('button', { name: /sort/i })
    const listItems = () =>
      screen.getAllByTestId('list-item').map((el) => el.textContent)

    // Default sort direction is ascending
    const ascending = listItems()
    expect(ascending[0]).toContain('Apple')
    expect(ascending[1]).toContain('Banana')
    expect(ascending[2]).toContain('Cherry')

    // Click toggles to descending
    await user.click(sortBtn)
    const descending = listItems()
    expect(descending[0]).toContain('Cherry')
    expect(descending[1]).toContain('Banana')
    expect(descending[2]).toContain('Apple')

    // Click again toggles back to ascending
    await user.click(sortBtn)
    const ascAgain = listItems()
    expect(ascAgain[0]).toContain('Apple')
  })

  it('pagination shows correct page of items', () => {
    const items = makeItems(15)
    render(<ListView {...baseProps} config={{ items, pageSize: 5 }} />)

    // Page 1: items 0-4
    expect(screen.getByText('Item 00')).toBeInTheDocument()
    expect(screen.getByText('Item 04')).toBeInTheDocument()
    expect(screen.queryByText('Item 05')).not.toBeInTheDocument()
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
  })

  it('pagination buttons disable at boundaries', async () => {
    const user = userEvent.setup()
    const items = makeItems(15)
    render(<ListView {...baseProps} config={{ items, pageSize: 5 }} />)

    const prevBtn = screen.getByRole('button', { name: /previous/i })
    const nextBtn = screen.getByRole('button', { name: /next/i })

    // On first page, prev is disabled
    expect(prevBtn).toBeDisabled()
    expect(nextBtn).not.toBeDisabled()

    // Go to last page
    await user.click(nextBtn)
    await user.click(nextBtn)
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument()
    expect(nextBtn).toBeDisabled()
    expect(prevBtn).not.toBeDisabled()
  })

  it('renders title when provided', () => {
    render(
      <ListView
        {...baseProps}
        config={{ title: 'My List', items: [{ id: '1', label: 'A' }] }}
      />,
    )
    expect(screen.getByText('My List')).toBeInTheDocument()
  })

  it('resets to page 1 when search term changes', async () => {
    const user = userEvent.setup()
    const items = makeItems(20)
    render(
      <ListView {...baseProps} config={{ items, pageSize: 5, searchable: true }} />,
    )

    // Go to page 2
    const nextBtn = screen.getByRole('button', { name: /next/i })
    await user.click(nextBtn)
    expect(screen.getByText('Page 2 of 4')).toBeInTheDocument()

    // Type search -- should reset to page 1
    const input = screen.getByRole('searchbox')
    await user.type(input, 'Item 0')
    expect(screen.getByText(/Page 1 of/)).toBeInTheDocument()
  })

  it('exports configSchema with correct fields', () => {
    expect(configSchema.fields).toHaveLength(3)
    const keys = configSchema.fields.map((f) => f.key)
    expect(keys).toContain('title')
    expect(keys).toContain('pageSize')
    expect(keys).toContain('searchable')
  })
})
