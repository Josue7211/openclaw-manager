/*
 * Copied/adapted from T3 Code apps/web/src/lib/projectScriptKeybindings.ts
 * (MIT License). ClawControl currently uses this as a lightweight helper for
 * project action command/key display without importing @t3tools/contracts.
 */

export interface ProjectScriptKeybindingShortcut {
  modKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  key: string
}

export interface ProjectScriptKeybindingRule {
  key: string
  command: string
  shortcut?: ProjectScriptKeybindingShortcut
}

export type ResolvedProjectScriptKeybindingsConfig = readonly ProjectScriptKeybindingRule[]

export const PROJECT_SCRIPT_KEYBINDING_INVALID_MESSAGE = 'Invalid keybinding.'

function normalizeProjectScriptKeybindingInput(
  keybinding: string | null | undefined,
): string | null {
  const trimmed = keybinding?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

export function decodeProjectScriptKeybindingRule(input: {
  keybinding: string | null | undefined
  command: string
}): ProjectScriptKeybindingRule | null {
  const normalizedKey = normalizeProjectScriptKeybindingInput(input.keybinding)
  if (!normalizedKey) return null
  if (!/^[a-z0-9+ -]+$/iu.test(normalizedKey)) {
    throw new Error(PROJECT_SCRIPT_KEYBINDING_INVALID_MESSAGE)
  }
  return {
    key: normalizedKey,
    command: input.command,
  }
}

export function keybindingValueForCommand(
  keybindings: ResolvedProjectScriptKeybindingsConfig,
  command: string,
): string | null {
  for (let index = keybindings.length - 1; index >= 0; index -= 1) {
    const binding = keybindings[index]
    if (!binding || binding.command !== command) continue
    if (!binding.shortcut) return binding.key

    const parts: string[] = []
    if (binding.shortcut.modKey) parts.push('mod')
    if (binding.shortcut.ctrlKey) parts.push('ctrl')
    if (binding.shortcut.metaKey) parts.push('meta')
    if (binding.shortcut.altKey) parts.push('alt')
    if (binding.shortcut.shiftKey) parts.push('shift')
    const keyToken = binding.shortcut.key === ' '
      ? 'space'
      : binding.shortcut.key === 'escape'
        ? 'esc'
        : binding.shortcut.key
    parts.push(keyToken)
    return parts.join('+')
  }
  return null
}
