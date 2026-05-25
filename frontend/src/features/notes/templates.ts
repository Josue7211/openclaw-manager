export interface NoteTemplate {
  id: string
  label: string
  icon: string
  content: string
  source?: 'built-in' | 'vault'
  noteId?: string
  folderTemplates?: string[]
}

export interface TemplateNote {
  _id: string
  title: string
  content: string
  folder: string
  properties?: Record<string, string | string[]>
  type?: string
}

export interface ApplyTemplateContext {
  now?: Date
  title?: string
  folder?: string
  promptValues?: Record<string, string>
}

export interface TemplatePrompt {
  name: string
  defaultValue: string
}

export const VAULT_TEMPLATES_FOLDER = 'Templates'

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
    id: 'weekly',
    label: 'Weekly Note',
    icon: '',
    content: `# {{title}}

## Focus
-

## Wins
-

## Next
- [ ]

`,
  },
  {
    id: 'monthly',
    label: 'Monthly Note',
    icon: '',
    content: `# {{title}}

## Themes
-

## Milestones
-

## Review

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

/** Replace template variables like {{date}}, {{date:YYYY-MM-DD}}, and {{title}} with actual values. */
export function applyTemplate(template: NoteTemplate, context: ApplyTemplateContext = {}): string {
  return applyTemplateVariables(template.content, context)
}

export function appendTemplateToContent(content: string, insertion: string): string {
  const trimmedInsertion = insertion.trim()
  if (!trimmedInsertion) return content
  if (!content.trim()) return `${trimmedInsertion}\n`
  return `${content.trimEnd()}\n\n${trimmedInsertion}\n`
}

export function applyTemplateVariables(content: string, context: ApplyTemplateContext = {}): string {
  const now = context.now ?? new Date()
  return content.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, rawVariable: string) => {
    const variable = rawVariable.trim()
    const [name, ...rest] = variable.split(':')
    const key = name.trim().toLowerCase()
    const value = rest.join(':').trim()

    if (key === 'date') return formatTemplateDate(now, value || 'MMMM D, YYYY')
    if (key === 'time') return formatTemplateDate(now, value || 'h:mm A')
    if (key === 'datetime') return formatTemplateDate(now, value || 'MMMM D, YYYY h:mm A')
    if (key === 'isodate') return formatTemplateDate(now, 'YYYY-MM-DD')
    if (key === 'year') return formatTemplateDate(now, 'YYYY')
    if (key === 'month') return formatTemplateDate(now, 'MM')
    if (key === 'day') return formatTemplateDate(now, 'DD')
    if (key === 'weekday') return formatTemplateDate(now, 'dddd')
    if (key === 'title') return context.title ?? ''
    if (key === 'folder') return context.folder ?? ''
    if (key === 'prompt') return promptTemplateValue(value, context.promptValues)

    return match
  })
}

export function extractTemplatePrompts(content: string): TemplatePrompt[] {
  const prompts: TemplatePrompt[] = []
  const seen = new Set<string>()
  for (const match of content.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const variable = match[1]?.trim() ?? ''
    const [name, ...rest] = variable.split(':')
    if (name.trim().toLowerCase() !== 'prompt') continue
    const prompt = parsePromptTemplateValue(rest.join(':').trim())
    if (!prompt || seen.has(prompt.name)) continue
    seen.add(prompt.name)
    prompts.push(prompt)
  }
  return prompts
}

export function formatTemplateDate(date: Date, format: string): string {
  const literals: string[] = []
  const maskedFormat = format.replace(/\[([^\]]*)\]/g, (_match, literal: string) => {
    const index = literals.push(literal) - 1
    return `\u0000${index}\u0000`
  })
  const year = String(date.getFullYear())
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours24 = date.getHours()
  const hours12 = hours24 % 12 || 12
  const minutes = date.getMinutes()
  const seconds = date.getSeconds()
  const replacements: Record<string, string> = {
    YYYY: year,
    YY: year.slice(-2),
    MMMM: date.toLocaleString('en-US', { month: 'long' }),
    MMM: date.toLocaleString('en-US', { month: 'short' }),
    MM: pad2(month),
    M: String(month),
    dddd: date.toLocaleString('en-US', { weekday: 'long' }),
    ddd: date.toLocaleString('en-US', { weekday: 'short' }),
    DD: pad2(day),
    D: String(day),
    HH: pad2(hours24),
    H: String(hours24),
    hh: pad2(hours12),
    h: String(hours12),
    mm: pad2(minutes),
    m: String(minutes),
    ss: pad2(seconds),
    s: String(seconds),
    A: hours24 >= 12 ? 'PM' : 'AM',
    a: hours24 >= 12 ? 'pm' : 'am',
  }

  return maskedFormat
    .replace(/YYYY|YY|MMMM|MMM|MM|M|dddd|ddd|DD|D|HH|H|hh|h|mm|m|ss|s|A|a/g, token => replacements[token] ?? token)
    .replace(/\u0000(\d+)\u0000/g, (_match, index: string) => literals[Number(index)] ?? '')
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
      folderTemplates: templateFolderTargets(note),
    }))
}

export function selectFolderTemplate(templates: NoteTemplate[], folder: string | undefined): NoteTemplate | null {
  const normalizedFolder = normalizeTemplateFolder(folder)
  let best: { template: NoteTemplate; score: number } | null = null
  for (const [index, template] of templates.entries()) {
    const score = Math.max(
      ...((template.folderTemplates ?? []).map(target => folderTemplateMatchScore(target, normalizedFolder))),
      0,
    )
    if (score <= 0) continue
    const rankedScore = score * 1000 - index
    if (!best || rankedScore > best.score) best = { template, score: rankedScore }
  }
  return best ? best.template : null
}

function stripTemplateFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---\n')) return markdown
  const end = markdown.indexOf('\n---', 4)
  if (end === -1) return markdown
  const closeEnd = markdown.indexOf('\n', end + 4)
  return markdown.slice(closeEnd === -1 ? markdown.length : closeEnd + 1).replace(/^\n/, '')
}

function templateFolderTargets(note: TemplateNote): string[] | undefined {
  const rawTargets = [
    ...propertyValues(note.properties?.folderTemplate),
    ...propertyValues(note.properties?.folderTemplates),
    ...propertyValues(note.properties?.targetFolder),
    ...propertyValues(note.properties?.targetFolders),
    ...propertyValues(note.properties?.appliesTo),
  ]
  const targets = rawTargets.map(normalizeTemplateFolderTarget).filter(Boolean)
  return targets.length > 0 ? Array.from(new Set(targets)) : undefined
}

function propertyValues(value: string | string[] | undefined): string[] {
  if (!value) return []
  const values = Array.isArray(value) ? value : [value]
  return values.flatMap(item => item.split(',')).map(item => item.trim()).filter(Boolean)
}

function folderTemplateMatchScore(target: string, folder: string): number {
  const normalizedTarget = normalizeTemplateFolderTarget(target)
  if (!normalizedTarget) return 0
  if (normalizedTarget === '*') return 1
  if (normalizedTarget.endsWith('/*')) {
    const parent = normalizeTemplateFolder(normalizedTarget.slice(0, -2))
    if (parent === folder || folder.startsWith(`${parent}/`)) return 100 + parent.length
    return 0
  }
  return normalizeTemplateFolder(normalizedTarget) === folder ? 200 + normalizedTarget.length : 0
}

function normalizeTemplateFolderTarget(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '*') return '*'
  if (trimmed.endsWith('/*')) return `${normalizeTemplateFolder(trimmed.slice(0, -2))}/*`
  return normalizeTemplateFolder(trimmed)
}

function normalizeTemplateFolder(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/')
}

function promptTemplateValue(rawPrompt: string, promptValues: Record<string, string> | undefined): string {
  const prompt = parsePromptTemplateValue(rawPrompt)
  if (!prompt) return ''
  return promptValues?.[prompt.name] ?? prompt.defaultValue
}

function parsePromptTemplateValue(rawPrompt: string): TemplatePrompt | null {
  const separatorIndex = rawPrompt.indexOf('|')
  const rawName = separatorIndex === -1 ? rawPrompt : rawPrompt.slice(0, separatorIndex)
  const rawDefault = separatorIndex === -1 ? '' : rawPrompt.slice(separatorIndex + 1)
  const name = rawName.trim()
  if (!name) return null
  return { name, defaultValue: rawDefault }
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}
