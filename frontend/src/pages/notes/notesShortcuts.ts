export interface NotesShortcut {
  keys: string
  action: string
  scope: 'Vault' | 'Editor' | 'Review'
}

export const NOTES_SHORTCUTS: NotesShortcut[] = [
  { keys: 'Ctrl/Cmd+P', action: 'Open command palette', scope: 'Vault' },
  { keys: 'Ctrl/Cmd+O', action: 'Open command palette', scope: 'Vault' },
  { keys: 'Ctrl/Cmd+S', action: 'Save and create manual version checkpoint', scope: 'Vault' },
  { keys: 'Ctrl/Cmd+N', action: 'Create note in current folder', scope: 'Vault' },
  { keys: 'Ctrl/Cmd+Shift+N', action: 'Create folder in current folder', scope: 'Vault' },
  { keys: 'Ctrl/Cmd+Alt+D', action: 'Create daily note', scope: 'Vault' },
  { keys: 'Ctrl/Cmd+Alt+P', action: 'Pin or unpin current note', scope: 'Vault' },
  { keys: 'Ctrl/Cmd+Shift+F', action: 'Toggle focus mode', scope: 'Vault' },
  { keys: 'Ctrl/Cmd+B', action: 'Bold selection', scope: 'Editor' },
  { keys: 'Ctrl/Cmd+I', action: 'Italic selection', scope: 'Editor' },
  { keys: 'Ctrl/Cmd+U', action: 'Underline selection', scope: 'Editor' },
  { keys: 'Ctrl/Cmd+K', action: 'Insert link', scope: 'Editor' },
  { keys: 'Ctrl/Cmd+F', action: 'Find and replace in document mode', scope: 'Editor' },
  { keys: 'Escape', action: 'Close dialogs, command palette, or find panel', scope: 'Review' },
]

export function groupedNotesShortcuts(shortcuts: NotesShortcut[] = NOTES_SHORTCUTS): Record<NotesShortcut['scope'], NotesShortcut[]> {
  return shortcuts.reduce((groups, shortcut) => {
    groups[shortcut.scope].push(shortcut)
    return groups
  }, {
    Vault: [],
    Editor: [],
    Review: [],
  } as Record<NotesShortcut['scope'], NotesShortcut[]>)
}
