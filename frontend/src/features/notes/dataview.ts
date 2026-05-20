import type { VaultNote } from './types'
import { buildVaultDataRows, type VaultDataRow } from './dataMode'

interface DataviewQuery {
  mode: 'list' | 'table'
  fields: string[]
  filter: string
  sortKey: string
  sortDir: 'asc' | 'desc'
  limit: number
}

const DEFAULT_FIELDS = ['title', 'folder', 'tags', 'tasks', 'updated']

export function renderDataviewBlocks(markdown: string, notes: VaultNote[], currentId?: string): string {
  if (!notes.length || !markdown.includes('```dataview')) return markdown
  return markdown.replace(/```dataview\s*\n([\s\S]*?)```/gi, (_match, source: string) => {
    const query = parseDataviewQuery(source)
    const rows = runDataviewQuery(notes, query, currentId)
    return query.mode === 'list' ? renderList(rows) : renderTable(rows, query.fields)
  })
}

export function parseDataviewQuery(source: string): DataviewQuery {
  const compact = source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
  const mode = compact.toUpperCase().startsWith('LIST') ? 'list' : 'table'
  const fieldsMatch = mode === 'table' ? compact.match(/^TABLE\s+(.+?)(?:\s+(?:FROM|WHERE|SORT|LIMIT)\b|$)/i) : null
  const filterMatch = compact.match(/\b(?:FROM|WHERE)\s+(.+?)(?:\s+SORT\b|\s+LIMIT\b|$)/i)
  const sortMatch = compact.match(/\bSORT\s+([\w-]+)(?:\s+(asc|desc))?/i)
  const limitMatch = compact.match(/\bLIMIT\s+(\d+)/i)

  return {
    mode,
    fields: fieldsMatch ? fieldsMatch[1].split(',').map((field) => field.trim()).filter(Boolean) : DEFAULT_FIELDS,
    filter: filterMatch?.[1]?.trim() ?? '',
    sortKey: sortMatch?.[1]?.toLowerCase() ?? 'updated',
    sortDir: (sortMatch?.[2]?.toLowerCase() === 'asc' ? 'asc' : 'desc'),
    limit: Math.max(1, Math.min(100, Number(limitMatch?.[1] ?? 25))),
  }
}

function runDataviewQuery(notes: VaultNote[], query: DataviewQuery, currentId?: string): VaultDataRow[] {
  const rows = buildVaultDataRows(notes, query.filter)
    .filter((row) => row.id !== currentId)
    .sort((a, b) => compareRows(a, b, query.sortKey, query.sortDir))
  return rows.slice(0, query.limit)
}

function compareRows(a: VaultDataRow, b: VaultDataRow, key: string, dir: 'asc' | 'desc'): number {
  const direction = dir === 'asc' ? 1 : -1
  const left = fieldValue(a, key)
  const right = fieldValue(b, key)
  if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction
  return String(left).localeCompare(String(right)) * direction
}

function renderList(rows: VaultDataRow[]): string {
  if (rows.length === 0) return '> No matching local notes.'
  return rows.map((row) => `- [[${row.id}|${escapeCell(row.title)}]]${row.folder ? ` · ${escapeCell(row.folder)}` : ''}`).join('\n')
}

function renderTable(rows: VaultDataRow[], fields: string[]): string {
  if (rows.length === 0) return '> No matching local notes.'
  const headers = fields.map(labelForField)
  const align = fields.map(() => '---')
  const body = rows.map((row) => fields.map((field) => escapeCell(String(fieldValue(row, field)))).join(' | '))
  return [
    `| ${headers.join(' | ')} |`,
    `| ${align.join(' | ')} |`,
    ...body.map((line) => `| ${line} |`),
  ].join('\n')
}

function fieldValue(row: VaultDataRow, rawField: string): string | number {
  const field = rawField.trim().toLowerCase()
  switch (field) {
    case 'title':
    case 'file':
    case 'name':
      return `[[${row.id}|${row.title}]]`
    case 'id':
    case 'path':
      return row.id
    case 'type':
      return row.type
    case 'folder':
      return row.folder || 'Vault root'
    case 'tags':
      return row.tags.map((tag) => `#${tag}`).join(', ')
    case 'tasks':
      return row.tasksTotal ? `${row.tasksDone}/${row.tasksTotal}` : '-'
    case 'task-total':
      return row.tasksTotal
    case 'task-done':
      return row.tasksDone
    case 'updated':
    case 'updated-at':
      return row.updatedAt
    case 'trash':
    case 'trashed':
      return row.trashed ? 'yes' : 'no'
    default: {
      const value = row.properties[field] ?? row.properties[rawField.trim()]
      if (!value) return ''
      return Array.isArray(value) ? value.join(', ') : value
    }
  }
}

function labelForField(field: string): string {
  return field.trim().replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}
