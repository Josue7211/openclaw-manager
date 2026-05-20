export type VersionDiffKind = 'same' | 'removed' | 'added'

export interface VersionDiffRow {
  kind: VersionDiffKind
  text: string
}

export const VERSION_RESTORE_SAFETY_NOTE =
  'Restore creates a pre-restore safety version before replacing current content, so the restore can be undone.'

export function restoreRevisionConfirmMessage(rev: string, label?: string | null): string {
  const target = label?.trim() ? `"${label.trim()}"` : rev
  return `Restore revision ${target}? ${VERSION_RESTORE_SAFETY_NOTE}`
}

export function buildVersionDiff(previous: string, current: string): VersionDiffRow[] {
  const previousLines = previous.split('\n')
  const currentLines = current.split('\n')
  let start = 0
  while (start < previousLines.length && start < currentLines.length && previousLines[start] === currentLines[start]) {
    start += 1
  }

  let previousEnd = previousLines.length - 1
  let currentEnd = currentLines.length - 1
  while (previousEnd >= start && currentEnd >= start && previousLines[previousEnd] === currentLines[currentEnd]) {
    previousEnd -= 1
    currentEnd -= 1
  }

  const rows: VersionDiffRow[] = []
  for (let index = 0; index < start; index += 1) rows.push({ kind: 'same', text: previousLines[index] })
  for (let index = start; index <= previousEnd; index += 1) rows.push({ kind: 'removed', text: previousLines[index] })
  for (let index = start; index <= currentEnd; index += 1) rows.push({ kind: 'added', text: currentLines[index] })
  for (let index = previousEnd + 1; index < previousLines.length; index += 1) rows.push({ kind: 'same', text: previousLines[index] })
  return rows
}

export function summarizeVersionDiff(rows: VersionDiffRow[]): { added: number; removed: number; changed: number } {
  const added = rows.filter((row) => row.kind === 'added').length
  const removed = rows.filter((row) => row.kind === 'removed').length
  return { added, removed, changed: added + removed }
}
