import type { VaultNote } from './types'

export const NOTES_TRASH_FOLDER = 'Trash'

export function normalizeNotesFolderPath(path: string | null | undefined): string {
  return String(path ?? '')
    .normalize('NFC')
    .split('/')
    .map(part => part.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '').trim())
    .filter(Boolean)
    .join('/')
}

export function isNotesTrashPath(path: string | null | undefined): boolean {
  const normalized = normalizeNotesFolderPath(path).toLowerCase()
  return normalized === NOTES_TRASH_FOLDER.toLowerCase() || normalized.startsWith(`${NOTES_TRASH_FOLDER.toLowerCase()}/`)
}

export function noteFolderPath(note: Pick<VaultNote, '_id' | 'folder' | 'trash_origin_path' | 'trashed_at'>): string {
  if (note.trashed_at) {
    const trashFolder = normalizeNotesFolderPath(note.folder)
    if (isNotesTrashPath(trashFolder)) return trashFolder
    const origin = normalizeNotesFolderPath(note.trash_origin_path ?? note.folder)
    return origin ? `${NOTES_TRASH_FOLDER}/${origin}` : NOTES_TRASH_FOLDER
  }

  const folder = normalizeNotesFolderPath(note.folder)
  if (folder) return folder
  const parts = note._id.split('/')
  parts.pop()
  return normalizeNotesFolderPath(parts.join('/'))
}

export function isNoteInTrash(note: Pick<VaultNote, '_id' | 'folder' | 'trash_origin_path' | 'trashed_at'>): boolean {
  return Boolean(note.trashed_at) || isNotesTrashPath(noteFolderPath(note))
}
