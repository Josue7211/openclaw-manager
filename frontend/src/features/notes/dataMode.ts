import type { VaultNote } from './types'
import { matchesNoteSearch } from './searchFilters'

export interface VaultDataRow {
  id: string
  title: string
  type: VaultNote['type']
  folder: string
  tags: string[]
  properties: Record<string, string | string[]>
  tasksDone: number
  tasksTotal: number
  updatedAt: number
  trashed: boolean
}

export interface VaultTaskRow {
  id: string
  noteId: string
  title: string
  folder: string
  text: string
  line: number
  done: boolean
  tags: string[]
  updatedAt: number
  trashed: boolean
}

export function buildVaultDataRows(notes: VaultNote[], query = ''): VaultDataRow[] {
  const cleanQuery = query.trim()
  return notes
    .filter((note) => !cleanQuery || matchesNoteSearch(note, cleanQuery))
    .map((note) => {
      const tasks = taskStats(note.content)
      return {
        id: note._id,
        title: note.title || note._id,
        type: note.type,
        folder: note.folder,
        tags: note.tags,
        properties: note.properties ?? {},
        tasksDone: tasks.done,
        tasksTotal: tasks.total,
        updatedAt: note.updated_at,
        trashed: Boolean(note.trashed_at) || note.folder === 'Trash' || note.folder.startsWith('Trash/'),
      }
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function buildVaultTaskRows(notes: VaultNote[], query = ''): VaultTaskRow[] {
  const cleanQuery = query.trim()
  return notes
    .filter((note) => note.type === 'note')
    .filter((note) => !cleanQuery || matchesNoteSearch(note, cleanQuery))
    .flatMap((note) => extractTasks(note))
    .sort((a, b) => Number(a.done) - Number(b.done) || b.updatedAt - a.updatedAt || a.line - b.line)
}

export function setTaskLineDone(content: string, lineNumber: number, done: boolean): string | null {
  const lines = content.split('\n')
  const index = lineNumber - 1
  if (index < 0 || index >= lines.length) return null
  const nextLine = lines[index].replace(/^(\s*[-*]\s+\[)([ xX])(\]\s+.+)$/, `$1${done ? 'x' : ' '}$3`)
  if (nextLine === lines[index]) return null
  lines[index] = nextLine
  return lines.join('\n')
}

function taskStats(content: string): { done: number; total: number } {
  const matches = content.matchAll(/^\s*[-*]\s+\[([ xX])\]/gm)
  let done = 0
  let total = 0
  for (const match of matches) {
    total += 1
    if (match[1].toLowerCase() === 'x') done += 1
  }
  return { done, total }
}

function extractTasks(note: VaultNote): VaultTaskRow[] {
  const trashed = Boolean(note.trashed_at) || note.folder === 'Trash' || note.folder.startsWith('Trash/')
  return note.content.split('\n').flatMap((line, index) => {
    const match = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/)
    if (!match) return []
    return [{
      id: `${note._id}:${index + 1}`,
      noteId: note._id,
      title: note.title || note._id,
      folder: note.folder,
      text: match[2].trim(),
      line: index + 1,
      done: match[1].toLowerCase() === 'x',
      tags: note.tags,
      updatedAt: note.updated_at,
      trashed,
    }]
  })
}
