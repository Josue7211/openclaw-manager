import { describe, expect, it } from 'vitest'
import {
  buildVaultDataRows,
  buildVaultTaskRows,
  evaluateVaultDataCustomFormula,
  formatVaultDataFormulaValue,
  groupVaultDataRows,
  groupVaultTaskRows,
  mergeVaultDataViewPresets,
  normalizeVaultDataViewPresets,
  setTaskLineDone,
  sortVaultDataRows,
  sortVaultTaskRows,
  validateVaultDataCustomFormula,
  vaultDataFormulaValue,
  vaultDataPropertyKeys,
} from '../dataMode'
import type { VaultNote } from '../types'

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

describe('vault data mode rows', () => {
  it('summarizes tasks, properties, and trash state', () => {
    const rows = buildVaultDataRows([
      note({
        _id: 'Projects/roadmap.md',
        title: 'Roadmap',
        content: '- [x] Ship\n- [ ] Polish',
        folder: 'Trash/Projects',
        tags: ['strategy'],
        properties: { status: 'active' },
        updated_at: 20,
      }),
    ])

    expect(rows).toEqual([
      expect.objectContaining({
        id: 'Projects/roadmap.md',
        tasksDone: 1,
        tasksTotal: 2,
        trashed: true,
        properties: { status: 'active' },
      }),
    ])
  })

  it('filters rows with notes query syntax and sorts newest first', () => {
    const rows = buildVaultDataRows([
      note({ _id: 'old.md', title: 'Old', folder: 'Archive', tags: ['archive'], updated_at: 1 }),
      note({ _id: 'new.md', title: 'New', folder: 'Projects', tags: ['strategy'], updated_at: 2 }),
    ], 'tag:strategy')

    expect(rows.map((row) => row.id)).toEqual(['new.md'])
  })

  it('builds an actionable task ledger from matching notes', () => {
    const rows = buildVaultTaskRows([
      note({
        _id: 'Projects/roadmap.md',
        title: 'Roadmap',
        content: '- [x] Ship\nNotes\n- [ ] Polish #next',
        folder: 'Projects',
        tags: ['strategy'],
        updated_at: 20,
      }),
      note({
        _id: 'Archive/old.md',
        title: 'Old',
        content: '- [ ] Ignore',
        folder: 'Archive',
        tags: ['archive'],
        updated_at: 30,
      }),
    ], 'tag:strategy')

    expect(rows).toEqual([
      expect.objectContaining({
        id: 'Projects/roadmap.md:3',
        noteId: 'Projects/roadmap.md',
        text: 'Polish #next',
        line: 3,
        done: false,
      }),
      expect.objectContaining({
        id: 'Projects/roadmap.md:1',
        text: 'Ship',
        done: true,
      }),
    ])
  })

  it('toggles a task line without touching neighboring markdown', () => {
    const content = '# Plan\n- [ ] Ship\n- [x] Keep'

    expect(setTaskLineDone(content, 2, true)).toBe('# Plan\n- [x] Ship\n- [x] Keep')
    expect(setTaskLineDone(content, 3, false)).toBe('# Plan\n- [ ] Ship\n- [ ] Keep')
    expect(setTaskLineDone(content, 1, true)).toBeNull()
  })

  it('sorts metadata rows by properties and task rows by selected fields', () => {
    const rows = buildVaultDataRows([
      note({ _id: 'b.md', title: 'Beta', properties: { status: 'review' }, content: '- [x] Done', updated_at: 2 }),
      note({ _id: 'a.md', title: 'Alpha', properties: { status: 'active' }, content: '- [ ] Todo\n- [x] Done', updated_at: 1 }),
    ])

    expect(vaultDataPropertyKeys(rows)).toEqual(['status'])
    expect(sortVaultDataRows(rows, 'property:status', 'asc').map(row => row.title)).toEqual(['Alpha', 'Beta'])
    expect(sortVaultDataRows(rows, 'tasks', 'desc').map(row => row.title)).toEqual(['Beta', 'Alpha'])

    const taskRows = buildVaultTaskRows([
      note({ _id: 'b.md', title: 'Beta', content: '- [ ] B', folder: 'B', updated_at: 2 }),
      note({ _id: 'a.md', title: 'Alpha', content: '- [ ] A', folder: 'A', updated_at: 1 }),
    ])
    expect(sortVaultTaskRows(taskRows, 'title', 'asc').map(row => row.title)).toEqual(['Alpha', 'Beta'])
  })

  it('groups metadata and task rows by local view fields', () => {
    const rows = buildVaultDataRows([
      note({ _id: 'a.md', title: 'Alpha', folder: 'Projects', properties: { status: 'active' }, content: '- [ ] A' }),
      note({ _id: 'b.md', title: 'Beta', folder: 'Archive', properties: { status: 'done' }, content: '- [x] B', updated_at: 2 }),
    ])
    const taskRows = buildVaultTaskRows([
      note({ _id: 'a.md', title: 'Alpha', folder: 'Projects', tags: ['strategy'], content: '- [ ] A' }),
      note({ _id: 'b.md', title: 'Beta', folder: 'Projects', tags: ['archive'], content: '- [x] B' }),
    ])

    expect(groupVaultDataRows(rows, 'folder').map(group => [group.label, group.rows.length])).toEqual([
      ['Archive', 1],
      ['Projects', 1],
    ])
    expect(groupVaultDataRows(rows, 'property:status').map(group => group.label)).toEqual(['done', 'active'])
    expect(groupVaultTaskRows(taskRows, 'done').map(group => [group.label, group.rows.length])).toEqual([
      ['Open', 1],
      ['Done', 1],
    ])
  })

  it('computes formula fields for metadata views', () => {
    const [row] = buildVaultDataRows([
      note({
        _id: 'Projects/a.md',
        title: 'Alpha',
        folder: 'Projects/Active',
        tags: ['strategy', 'next'],
        properties: { status: 'active', priority: 'high', score: '4.7', due: '2026-05-23', owners: ['Ada', 'Grace'] },
        content: '- [x] Done\n- [ ] Open',
        updated_at: Date.parse('2026-05-20T12:00:00Z'),
      }),
    ])
    const now = Date.parse('2026-05-21T12:00:00Z')

    expect(vaultDataFormulaValue(row, 'taskPercent')).toBe(50)
    expect(vaultDataFormulaValue(row, 'tagCount')).toBe(2)
    expect(vaultDataFormulaValue(row, 'propertyCount')).toBe(5)
    expect(vaultDataFormulaValue(row, 'pathDepth')).toBe(2)
    expect(vaultDataFormulaValue(row, 'staleDays', now)).toBe(1)
    expect(vaultDataFormulaValue(row, 'custom', now, 'tasksDone / tasksTotal * 100')).toBe(50)
    expect(evaluateVaultDataCustomFormula(row, 'priority + tagCount', now)).toBe(2)
    expect(evaluateVaultDataCustomFormula(row, 'round(score) + max(tasksDone, tagCount) + clamp(12, 0, 10)', now)).toBe(17)
    expect(evaluateVaultDataCustomFormula(row, 'upper(prop("status"))', now)).toBe('ACTIVE')
    expect(evaluateVaultDataCustomFormula(row, 'if(eq(prop("status"), "active"), "ship", "hold")', now)).toBe('ship')
    expect(evaluateVaultDataCustomFormula(row, 'daysUntil(prop("due"))', now)).toBe(2)
    expect(evaluateVaultDataCustomFormula(row, 'daysSince("2026-05-19")', now)).toBe(2)
    expect(evaluateVaultDataCustomFormula(row, 'formatDate(prop("due"))', now)).toBe('2026-05-23')
    expect(evaluateVaultDataCustomFormula(row, 'count(prop("owners")) + listContains(prop("owners"), "Grace")', now)).toBe(3)
    expect(evaluateVaultDataCustomFormula(row, 'first(prop("owners"))', now)).toBe('Ada')
    expect(formatVaultDataFormulaValue(row, 'taskPercent')).toBe('50%')
    expect(formatVaultDataFormulaValue(row, 'staleDays', now)).toBe('1d')
    expect(formatVaultDataFormulaValue(row, 'custom', now, 'tasksDone / tasksTotal * 100')).toBe('50')
    expect(formatVaultDataFormulaValue(row, 'custom', now, 'concat(prop("status"), " / ", tagCount)')).toBe('active / 2')
    expect(sortVaultDataRows([row], 'formula:tagCount', 'desc')).toEqual([row])
    expect(sortVaultDataRows([row], 'formula:custom', 'desc', { customFormula: 'tagCount + propertyCount' })).toEqual([row])
    expect(groupVaultDataRows([row], 'formula:taskPercent').map(group => group.label)).toEqual(['50%'])
    expect(groupVaultDataRows([row], 'formula:custom', { customFormula: 'tagCount + propertyCount' }).map(group => group.label)).toEqual(['7'])
    expect(groupVaultDataRows([row], 'formula:custom', { customFormula: 'prop("status")' }).map(group => group.label)).toEqual(['active'])
    expect(validateVaultDataCustomFormula('prop("status") + tagCount', ['status'])).toEqual({ ok: true, message: 'Formula ok' })
    expect(validateVaultDataCustomFormula('missingField + tagCount', ['status'])).toEqual({ ok: false, message: 'Unknown field: missingField' })
    expect(validateVaultDataCustomFormula('mystery(tagCount)', ['status'])).toEqual({ ok: false, message: 'Unknown helper: mystery' })
    expect(validateVaultDataCustomFormula('(tagCount + propertyCount', ['status'])).toEqual({ ok: false, message: 'Check parentheses' })
  })

  it('normalizes saved data view presets from local storage', () => {
    const presets = normalizeVaultDataViewPresets([
      {
        id: ' current ',
        name: ' Active work ',
        mode: 'tasks',
        query: 'tag:active',
        dataSortKey: 'property:status',
        taskSortKey: 'line',
        sortDirection: 'asc',
        groupKey: 'property:status',
        layout: 'cards',
        formulaKey: 'tagCount',
        customFormula: ' tasksDone / tasksTotal * 100 ',
        updatedAt: 20,
      },
      {
        id: 'legacy',
        name: 'Legacy',
        mode: 'bad',
        query: 12,
        dataSortKey: 'bad',
        taskSortKey: 'bad',
        sortDirection: 'bad',
        groupKey: 'bad',
        layout: 'bad',
        formulaKey: 'bad',
        customFormula: 42,
        updatedAt: Number.NaN,
      },
      { id: '', name: 'Missing id' },
      null,
    ])

    expect(presets).toEqual([
      expect.objectContaining({
        id: 'current',
        name: 'Active work',
        mode: 'tasks',
        query: 'tag:active',
        dataSortKey: 'property:status',
        taskSortKey: 'line',
        sortDirection: 'asc',
        groupKey: 'property:status',
        layout: 'cards',
        formulaKey: 'tagCount',
        customFormula: 'tasksDone / tasksTotal * 100',
        updatedAt: 20,
      }),
      expect.objectContaining({
        id: 'legacy',
        mode: 'metadata',
        query: '',
        dataSortKey: 'updated',
        taskSortKey: 'done',
        sortDirection: 'desc',
        groupKey: 'none',
        layout: 'table',
        formulaKey: 'none',
        customFormula: '',
        updatedAt: 0,
      }),
    ])
  })

  it('merges synced data view presets by newest updated timestamp', () => {
    const older = normalizeVaultDataViewPresets([
      { id: 'status', name: 'Status', updatedAt: 10, formulaKey: 'none' },
      { id: 'tasks', name: 'Tasks', mode: 'tasks', updatedAt: 12 },
    ])
    const newer = normalizeVaultDataViewPresets([
      { id: 'status', name: 'Status refined', updatedAt: 20, formulaKey: 'tagCount' },
    ])

    expect(mergeVaultDataViewPresets(older, newer)).toEqual([
      expect.objectContaining({ id: 'status', name: 'Status refined', formulaKey: 'tagCount', updatedAt: 20 }),
      expect.objectContaining({ id: 'tasks', name: 'Tasks', mode: 'tasks', updatedAt: 12 }),
    ])
  })
})
