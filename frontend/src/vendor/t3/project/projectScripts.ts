/*
 * Copied/adapted from T3 Code apps/web/src/projectScripts.ts (MIT License).
 * clawctrl keeps this helper layer as the canonical project action ID and
 * primary-action behavior instead of reimplementing it inline in Chat.tsx.
 */

import type { ProjectScript } from './ProjectScriptsControl'

const MAX_SCRIPT_ID_LENGTH = 64
const SCRIPT_RUN_COMMAND_PREFIX = 'script.'
const SCRIPT_RUN_COMMAND_SUFFIX = '.run'

function normalizeScriptId(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (cleaned.length === 0) return 'script'
  if (cleaned.length <= MAX_SCRIPT_ID_LENGTH) return cleaned
  return cleaned.slice(0, MAX_SCRIPT_ID_LENGTH).replace(/-+$/g, '') || 'script'
}

export const commandForProjectScript = (scriptId: string): string => (
  `${SCRIPT_RUN_COMMAND_PREFIX}${scriptId}${SCRIPT_RUN_COMMAND_SUFFIX}`
)

export function projectScriptIdFromCommand(command: string): string | null {
  const trimmed = command.trim()
  if (!trimmed.startsWith(SCRIPT_RUN_COMMAND_PREFIX) || !trimmed.endsWith(SCRIPT_RUN_COMMAND_SUFFIX)) {
    return null
  }
  return trimmed.slice(SCRIPT_RUN_COMMAND_PREFIX.length, -SCRIPT_RUN_COMMAND_SUFFIX.length)
}

export function nextProjectScriptId(name: string, existingIds: Iterable<string>): string {
  const taken = new Set(Array.from(existingIds))
  const baseId = normalizeScriptId(name)
  if (!taken.has(baseId)) return baseId

  let suffix = 2
  while (suffix < 10_000) {
    const candidate = `${baseId}-${suffix}`
    const safeCandidate = candidate.length <= MAX_SCRIPT_ID_LENGTH
      ? candidate
      : `${baseId.slice(0, Math.max(1, MAX_SCRIPT_ID_LENGTH - String(suffix).length - 1))}-${suffix}`
    if (!taken.has(safeCandidate)) return safeCandidate
    suffix += 1
  }

  return `${baseId}-${Date.now()}`.slice(0, MAX_SCRIPT_ID_LENGTH)
}

export function primaryProjectScript(scripts: ProjectScript[]): ProjectScript | null {
  const regular = scripts.find((script) => !script.runOnWorktreeCreate)
  return regular ?? scripts[0] ?? null
}

export { normalizeScriptId as normalizeProjectScriptId }
