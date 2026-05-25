import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VaultDataView } from '../VaultDataView'
import { parseVaultDataViewPresetDocument, serializeVaultDataViewPresetDocument } from '../dataViewSync'
import type { VaultNote } from '../types'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: apiMock,
}))

function note(overrides: Partial<VaultNote>): VaultNote {
  return {
    _id: 'note.md',
    type: 'note',
    title: 'Note',
    content: '',
    folder: '',
    tags: [],
    links: [],
    aliases: [],
    properties: {},
    created_at: 1,
    updated_at: 1,
    ...overrides,
  }
}

describe('VaultDataView', () => {
  beforeEach(() => {
    localStorage.clear()
    apiMock.get.mockReset()
    apiMock.put.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const notes = [
    note({
      _id: 'Projects/alpha.md',
      title: 'Alpha',
      folder: 'Projects',
      tags: ['strategy'],
      properties: { status: 'active' },
      content: '- [ ] Ship',
      updated_at: 10,
    }),
    note({
      _id: 'Archive/beta.md',
      title: 'Beta',
      folder: 'Archive',
      tags: ['archive'],
      properties: { status: 'done' },
      content: '- [x] Done',
      updated_at: 20,
    }),
  ]

  it('filters and sorts metadata rows inside the data view surface', () => {
    render(<VaultDataView notes={notes} query="" onSelect={vi.fn()} onToggleTask={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Data view filter'), {
      target: { value: 'has:property' },
    })
    fireEvent.change(screen.getByLabelText('Data view sort'), {
      target: { value: 'property:status' },
    })
    fireEvent.change(screen.getByLabelText('Data view sort direction'), {
      target: { value: 'asc' },
    })

    const bodyRows = screen.getAllByRole('row').slice(1)
    expect(within(bodyRows[0]).getByText('Alpha')).toBeInTheDocument()
    expect(within(bodyRows[1]).getByText('Beta')).toBeInTheDocument()
  })

  it('switches to task rows with task-specific sorting controls', () => {
    render(<VaultDataView notes={notes} query="" onSelect={vi.fn()} onToggleTask={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }))
    fireEvent.change(screen.getByLabelText('Data view sort'), {
      target: { value: 'title' },
    })
    fireEvent.change(screen.getByLabelText('Data view sort direction'), {
      target: { value: 'asc' },
    })

    const bodyRows = screen.getAllByRole('row').slice(1)
    expect(within(bodyRows[0]).getByText('Ship')).toBeInTheDocument()
    expect(within(bodyRows[1]).getByText('Done')).toBeInTheDocument()
  })

  it('groups rows inside the data view table', () => {
    render(<VaultDataView notes={notes} query="" onSelect={vi.fn()} onToggleTask={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Data view group'), {
      target: { value: 'folder' },
    })

    expect(screen.getAllByText('Archive').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Projects').length).toBeGreaterThan(0)
    const groupRows = screen.getAllByText(/\(1\)/)
    expect(groupRows).toHaveLength(2)
  })

  it('switches metadata and task views into card layout', () => {
    render(<VaultDataView notes={notes} query="" onSelect={vi.fn()} onToggleTask={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Data view layout'), {
      target: { value: 'cards' },
    })

    expect(screen.queryByRole('columnheader', { name: 'Title' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Alpha/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Beta/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }))
    expect(screen.queryByRole('columnheader', { name: 'Task' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Toggle task Ship')).toBeInTheDocument()
    expect(screen.getByLabelText('Toggle task Done')).toBeInTheDocument()
  })

  it('shows formula fields in table and card layouts', () => {
    render(<VaultDataView notes={notes} query="" onSelect={vi.fn()} onToggleTask={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Data view formula'), {
      target: { value: 'taskPercent' },
    })

    expect(screen.getByRole('columnheader', { name: 'Task %' })).toBeInTheDocument()
    expect(screen.getAllByText('0%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Data view sort'), {
      target: { value: 'formula:taskPercent' },
    })
    fireEvent.change(screen.getByLabelText('Data view group'), {
      target: { value: 'formula:taskPercent' },
    })
    fireEvent.change(screen.getByLabelText('Data view layout'), {
      target: { value: 'cards' },
    })

    expect(screen.queryByRole('columnheader', { name: 'Task %' })).not.toBeInTheDocument()
    expect(screen.getAllByText('0%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0)
  })

  it('shows safe custom formula fields in table and card layouts', () => {
    render(<VaultDataView notes={notes} query="" onSelect={vi.fn()} onToggleTask={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Data view formula'), {
      target: { value: 'custom' },
    })
    fireEvent.change(screen.getByLabelText('Data view custom formula'), {
      target: { value: 'tagCount + propertyCount + tasksDone' },
    })

    expect(screen.getByLabelText('Data view formula validation')).toHaveTextContent('Formula ok')
    expect(screen.getByRole('columnheader', { name: 'Custom' })).toBeInTheDocument()
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)
    expect(screen.getAllByText('3').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Data view custom formula'), {
      target: { value: 'missingField + tagCount' },
    })
    expect(screen.getByLabelText('Data view formula validation')).toHaveTextContent('Unknown field: missingField')
    fireEvent.change(screen.getByLabelText('Data view custom formula'), {
      target: { value: 'tagCount + propertyCount + tasksDone' },
    })
    fireEvent.change(screen.getByLabelText('Data view formula builder'), {
      target: { value: 'prop("status")' },
    })
    expect(screen.getByLabelText('Data view custom formula')).toHaveValue('tagCount + propertyCount + tasksDone + prop("status")')
    fireEvent.change(screen.getByLabelText('Data view custom formula'), {
      target: { value: 'tagCount + propertyCount + tasksDone' },
    })

    fireEvent.change(screen.getByLabelText('Data view sort'), {
      target: { value: 'formula:custom' },
    })
    fireEvent.change(screen.getByLabelText('Data view group'), {
      target: { value: 'formula:custom' },
    })
    fireEvent.change(screen.getByLabelText('Data view layout'), {
      target: { value: 'cards' },
    })

    expect(screen.queryByRole('columnheader', { name: 'Custom' })).not.toBeInTheDocument()
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)
    expect(screen.getAllByText('3').length).toBeGreaterThan(0)
  })

  it('saves, reapplies, and deletes local data view presets', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-21T12:00:00Z'))
    render(<VaultDataView notes={notes} query="" onSelect={vi.fn()} onToggleTask={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Data view filter'), {
      target: { value: 'has:property' },
    })
    fireEvent.change(screen.getByLabelText('Data view sort'), {
      target: { value: 'property:status' },
    })
    fireEvent.change(screen.getByLabelText('Data view sort direction'), {
      target: { value: 'asc' },
    })
    fireEvent.change(screen.getByLabelText('Data view group'), {
      target: { value: 'property:status' },
    })
    fireEvent.change(screen.getByLabelText('Data view layout'), {
      target: { value: 'cards' },
    })
    fireEvent.change(screen.getByLabelText('Data view formula'), {
      target: { value: 'custom' },
    })
    fireEvent.change(screen.getByLabelText('Data view custom formula'), {
      target: { value: 'tagCount + propertyCount' },
    })
    fireEvent.change(screen.getByLabelText('Data view name'), {
      target: { value: 'Active status' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save view' }))

    const saved = JSON.parse(localStorage.getItem('mc-notes-data-view-presets') || '[]')
    expect(saved).toEqual([
      expect.objectContaining({
        name: 'Active status',
        mode: 'metadata',
        query: 'has:property',
        dataSortKey: 'property:status',
        sortDirection: 'asc',
        groupKey: 'property:status',
        layout: 'cards',
        formulaKey: 'custom',
        customFormula: 'tagCount + propertyCount',
      }),
    ])

    fireEvent.change(screen.getByLabelText('Data view filter'), {
      target: { value: 'tag:archive' },
    })
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Saved data view'), {
      target: { value: saved[0].id },
    })
    expect(screen.getByLabelText('Data view filter')).toHaveValue('has:property')
    expect(screen.getByLabelText('Data view group')).toHaveValue('property:status')
    expect(screen.getByLabelText('Data view layout')).toHaveValue('cards')
    expect(screen.getByLabelText('Data view formula')).toHaveValue('custom')
    expect(screen.getByLabelText('Data view custom formula')).toHaveValue('tagCount + propertyCount')
    expect(screen.queryByRole('columnheader', { name: 'Title' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Alpha/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Beta/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.queryByRole('option', { name: 'Active status' })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('mc-notes-data-view-presets') || '[]')).toEqual([])
  })

  it('loads and saves synced data view presets through the vault document', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        _id: '.clawcontrol/data-views.md',
        content: serializeVaultDataViewPresetDocument([
          {
            id: 'remote-status',
            name: 'Remote status',
            mode: 'metadata',
            query: 'has:property',
            dataSortKey: 'property:status',
            taskSortKey: 'done',
            sortDirection: 'asc',
            groupKey: 'property:status',
            layout: 'cards',
            formulaKey: 'tagCount',
            customFormula: '',
            updatedAt: 10,
          },
        ]),
      },
    })
    apiMock.put.mockResolvedValue({ data: { rev: '2-data-views' } })

    render(<VaultDataView syncPresets notes={notes} query="" onSelect={vi.fn()} onToggleTask={vi.fn()} />)

    await screen.findByRole('option', { name: 'Remote status' })
    expect(screen.getByText('Views synced')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Saved data view'), {
      target: { value: 'remote-status' },
    })
    expect(screen.getByLabelText('Data view filter')).toHaveValue('has:property')
    expect(screen.getByLabelText('Data view layout')).toHaveValue('cards')
    expect(screen.getByLabelText('Data view formula')).toHaveValue('tagCount')

    fireEvent.change(screen.getByLabelText('Data view name'), {
      target: { value: 'Remote status refined' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save view' }))

    await waitFor(() => expect(apiMock.put).toHaveBeenCalled())
    expect(apiMock.put.mock.calls[0][0]).toBe('/api/vault/local/doc?id=.clawcontrol%2Fdata-views.md')
    const savedDoc = apiMock.put.mock.calls[0][1] as { content: string; folder: string; properties: Record<string, string> }
    expect(savedDoc.folder).toBe('.clawcontrol')
    expect(savedDoc.properties).toEqual({ clawcontrol_internal: 'data-views' })
    expect(parseVaultDataViewPresetDocument(savedDoc.content)).toEqual([
      expect.objectContaining({
        id: 'remote-status',
        name: 'Remote status refined',
        formulaKey: 'tagCount',
        customFormula: '',
      }),
    ])
    expect(screen.getByText('Views synced')).toBeInTheDocument()
  })

  it('keeps saved data view presets local and exposes retry when vault sync fails', async () => {
    apiMock.get.mockResolvedValue({ data: { _id: '.clawcontrol/data-views.md', content: '' } })
    apiMock.put.mockResolvedValue({ data: { rev: 'initial' } })

    render(<VaultDataView syncPresets notes={notes} query="" onSelect={vi.fn()} onToggleTask={vi.fn()} />)

    await screen.findByText('Views local')
    apiMock.put.mockReset()
    apiMock.put.mockRejectedValueOnce(new Error('vault offline')).mockResolvedValueOnce({ data: { rev: '2-data-views' } })

    fireEvent.change(screen.getByLabelText('Data view name'), {
      target: { value: 'Offline view' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save view' }))

    await screen.findByText('Views unsynced')
    expect(JSON.parse(localStorage.getItem('mc-notes-data-view-presets') || '[]')).toEqual([
      expect.objectContaining({ name: 'Offline view' }),
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(apiMock.put).toHaveBeenCalledTimes(2))
    expect(screen.getByText('Views synced')).toBeInTheDocument()
    const retriedDoc = apiMock.put.mock.calls[1][1] as { content: string }
    expect(parseVaultDataViewPresetDocument(retriedDoc.content)).toEqual([
      expect.objectContaining({ name: 'Offline view' }),
    ])
  })

  it('backfills existing local data view presets into the synced vault document', async () => {
    localStorage.setItem('mc-notes-data-view-presets', JSON.stringify([
      {
        id: 'local-active',
        name: 'Local active',
        mode: 'metadata',
        query: 'tag:active',
        dataSortKey: 'updated',
        taskSortKey: 'done',
        sortDirection: 'desc',
        groupKey: 'none',
        layout: 'table',
        formulaKey: 'none',
        customFormula: '',
        updatedAt: 20,
      },
    ]))
    apiMock.get.mockResolvedValue({ data: { _id: '.clawcontrol/data-views.md', content: '' } })
    apiMock.put.mockResolvedValue({ data: { rev: '1-data-views' } })

    render(<VaultDataView syncPresets notes={notes} query="" onSelect={vi.fn()} onToggleTask={vi.fn()} />)

    await waitFor(() => expect(apiMock.put).toHaveBeenCalled())
    const savedDoc = apiMock.put.mock.calls[0][1] as { content: string }
    expect(parseVaultDataViewPresetDocument(savedDoc.content)).toEqual([
      expect.objectContaining({ id: 'local-active', name: 'Local active' }),
    ])
    expect(screen.getByText('Views synced')).toBeInTheDocument()
  })

  it('merges local and synced data view presets with newest updates winning', async () => {
    localStorage.setItem('mc-notes-data-view-presets', JSON.stringify([
      {
        id: 'status',
        name: 'Local status',
        mode: 'metadata',
        query: 'tag:active',
        dataSortKey: 'updated',
        taskSortKey: 'done',
        sortDirection: 'desc',
        groupKey: 'none',
        layout: 'table',
        formulaKey: 'tagCount',
        customFormula: 'tagCount + propertyCount',
        updatedAt: 30,
      },
    ]))
    apiMock.get.mockResolvedValue({
      data: {
        _id: '.clawcontrol/data-views.md',
        content: serializeVaultDataViewPresetDocument([
          {
            id: 'status',
            name: 'Remote status',
            mode: 'metadata',
            query: 'has:property',
            dataSortKey: 'property:status',
            taskSortKey: 'done',
            sortDirection: 'asc',
            groupKey: 'property:status',
            layout: 'cards',
            formulaKey: 'none',
            customFormula: '',
            updatedAt: 10,
          },
          {
            id: 'remote-only',
            name: 'Remote only',
            mode: 'tasks',
            query: '',
            dataSortKey: 'updated',
            taskSortKey: 'line',
            sortDirection: 'asc',
            groupKey: 'done',
            layout: 'table',
            formulaKey: 'none',
            customFormula: '',
            updatedAt: 20,
          },
        ]),
      },
    })
    apiMock.put.mockResolvedValue({ data: { rev: '2-data-views' } })

    render(<VaultDataView syncPresets notes={notes} query="" onSelect={vi.fn()} onToggleTask={vi.fn()} />)

    await screen.findByRole('option', { name: 'Local status' })
    expect(screen.getByRole('option', { name: 'Remote only' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Remote status' })).not.toBeInTheDocument()

    await waitFor(() => expect(apiMock.put).toHaveBeenCalled())
    const savedDoc = apiMock.put.mock.calls[0][1] as { content: string }
    expect(parseVaultDataViewPresetDocument(savedDoc.content)).toEqual([
      expect.objectContaining({ id: 'status', name: 'Local status', formulaKey: 'tagCount', customFormula: 'tagCount + propertyCount', updatedAt: 30 }),
      expect.objectContaining({ id: 'remote-only', name: 'Remote only', updatedAt: 20 }),
    ])
  })
})
