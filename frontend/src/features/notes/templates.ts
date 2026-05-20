export interface NoteTemplate {
  id: string
  label: string
  icon: string
  content: string
  source?: 'built-in' | 'vault'
  noteId?: string
}

export interface TemplateNote {
  _id: string
  title: string
  content: string
  folder: string
  properties?: Record<string, string | string[]>
  type?: string
}

export const VAULT_TEMPLATES_FOLDER = 'Templates'

function todayFormatted(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: 'blank',
    label: 'Blank Note',
    icon: '',
    content: '',
  },
  {
    id: 'daily',
    label: 'Daily Note',
    icon: '',
    content: `# {{date}}

## Tasks
- [ ]

## Notes

`,
  },
  {
    id: 'meeting',
    label: 'Meeting Note',
    icon: '',
    content: `# Meeting:

**Date:** {{date}}
**Attendees:**

## Agenda

## Notes

## Action Items
- [ ]
`,
  },
  {
    id: 'project',
    label: 'Project Brief',
    icon: '',
    content: `# Project:

## Goal

## Requirements

## Timeline

`,
  },
]

/** Replace template variables like {{date}} with actual values. */
export function applyTemplate(template: NoteTemplate): string {
  return template.content.replace(/\{\{date\}\}/g, todayFormatted())
}

export function isVaultTemplateNote(note: TemplateNote): boolean {
  if (note.type && note.type !== 'note') return false
  const templateProperty = note.properties?.template
  const markedTemplate = Array.isArray(templateProperty)
    ? templateProperty.some((value) => value.toLowerCase() === 'true')
    : String(templateProperty || '').toLowerCase() === 'true'
  return markedTemplate || note.folder === VAULT_TEMPLATES_FOLDER || note.folder.startsWith(`${VAULT_TEMPLATES_FOLDER}/`)
}

export function vaultTemplateId(note: TemplateNote): string {
  return `vault:${note._id}`
}

export function vaultTemplatesFromNotes(notes: TemplateNote[]): NoteTemplate[] {
  return notes
    .filter(isVaultTemplateNote)
    .map((note) => ({
      id: vaultTemplateId(note),
      label: note.title || note._id.split('/').pop()?.replace(/\.md$/, '') || 'Vault template',
      icon: '',
      content: stripTemplateFrontmatter(note.content),
      source: 'vault' as const,
      noteId: note._id,
    }))
}

function stripTemplateFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---\n')) return markdown
  const end = markdown.indexOf('\n---', 4)
  if (end === -1) return markdown
  const closeEnd = markdown.indexOf('\n', end + 4)
  return markdown.slice(closeEnd === -1 ? markdown.length : closeEnd + 1).replace(/^\n/, '')
}
