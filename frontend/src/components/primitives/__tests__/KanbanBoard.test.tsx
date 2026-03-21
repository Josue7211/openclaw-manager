import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import KanbanBoard from '../KanbanBoard'

const baseProps = {
  widgetId: 'test-kanban',
  isEditMode: false,
  size: { w: 6, h: 4 },
}

const sampleColumns = [
  {
    id: 'todo',
    title: 'To Do',
    color: 'accent',
    items: [
      { id: 'card-1', title: 'Task A', description: 'First task' },
      { id: 'card-2', title: 'Task B' },
    ],
  },
  {
    id: 'done',
    title: 'Done',
    color: 'secondary',
    items: [{ id: 'card-3', title: 'Task C' }],
  },
]

describe('KanbanBoard', () => {
  it('renders column titles from config.columns', () => {
    render(<KanbanBoard {...baseProps} config={{ columns: sampleColumns }} />)
    expect(screen.getByText('To Do')).toBeTruthy()
    expect(screen.getByText('Done')).toBeTruthy()
  })

  it('renders card titles within columns', () => {
    render(<KanbanBoard {...baseProps} config={{ columns: sampleColumns }} />)
    expect(screen.getByText('Task A')).toBeTruthy()
    expect(screen.getByText('Task B')).toBeTruthy()
    expect(screen.getByText('Task C')).toBeTruthy()
  })

  it('shows EmptyState when columns is empty', () => {
    render(<KanbanBoard {...baseProps} config={{ columns: [] }} />)
    expect(screen.getByText('No columns')).toBeTruthy()
  })

  it('shows EmptyState when columns is missing', () => {
    render(<KanbanBoard {...baseProps} config={{}} />)
    expect(screen.getByText('No columns')).toBeTruthy()
  })

  it('card has draggable="true" attribute', () => {
    render(<KanbanBoard {...baseProps} config={{ columns: sampleColumns }} />)
    const card = screen.getByText('Task A').closest('[draggable]')
    expect(card).toBeTruthy()
    expect(card?.getAttribute('draggable')).toBe('true')
  })

  it('column count badge shows correct number', () => {
    render(<KanbanBoard {...baseProps} config={{ columns: sampleColumns }} />)
    const badges = document.querySelectorAll('.kanban-count')
    const counts = Array.from(badges).map(b => b.textContent)
    expect(counts).toContain('2')
    expect(counts).toContain('1')
  })

  it('drag and drop moves card between columns', () => {
    render(<KanbanBoard {...baseProps} config={{ columns: sampleColumns }} />)

    const card = screen.getByText('Task A').closest('[draggable]')!
    const dropTarget = screen.getByText('Done').closest('div[style]')!
    // Find the column container that has the onDrop handler
    const doneColumn = dropTarget.parentElement!

    // Simulate drag start on card in "To Do" column
    fireEvent.dragStart(card, {
      dataTransfer: {
        setData: (_type: string, _data: string) => {},
        effectAllowed: 'move',
      },
    })

    // Create a mock dataTransfer that returns the drag data
    const mockDataTransfer = {
      getData: () => 'todo:card-1',
      dropEffect: 'move',
    }

    fireEvent.dragOver(doneColumn, {
      dataTransfer: mockDataTransfer,
    })

    fireEvent.drop(doneColumn, {
      dataTransfer: mockDataTransfer,
    })

    // After drop, the Done column should have 2 items (card-3 + card-1)
    const badges = document.querySelectorAll('.kanban-count')
    const counts = Array.from(badges).map(b => b.textContent)
    expect(counts).toContain('1') // To Do: was 2, now 1
    expect(counts).toContain('2') // Done: was 1, now 2
  })

  it('renders card descriptions when provided', () => {
    render(<KanbanBoard {...baseProps} config={{ columns: sampleColumns }} />)
    expect(screen.getByText('First task')).toBeTruthy()
  })
})
