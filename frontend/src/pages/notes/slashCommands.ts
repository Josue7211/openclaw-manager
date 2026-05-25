import type { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'

interface SlashCommand {
  label: string
  detail: string
  apply: (view: EditorView, from: number, to: number) => void
}

interface AtCommand {
  label: string
  detail: string
  apply: (view: EditorView, from: number, to: number) => void
}

interface AtCompletionNote {
  _id?: string
  title: string
  folder?: string
  type?: string
  aliases?: string[]
  tags?: string[]
  properties?: Record<string, string | string[]>
}

function insertWithSelection(view: EditorView, from: number, to: number, insert: string, anchorOffset: number, headOffset = anchorOffset) {
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + anchorOffset, head: from + headOffset },
  })
}

function insertTemplateWithSelection(view: EditorView, from: number, to: number, insert: string, selectedText: string) {
  const selectedStart = insert.indexOf(selectedText)
  const anchorOffset = selectedStart >= 0 ? selectedStart : insert.length
  const headOffset = selectedStart >= 0 ? selectedStart + selectedText.length : insert.length
  insertWithSelection(view, from, to, insert, anchorOffset, headOffset)
}

function todayFormatted(): string {
  return dateOffsetFormatted(0)
}

function dateOffsetFormatted(offsetDays: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    label: '/table',
    detail: 'Insert a 3x3 table',
    apply: (view, from, to) => {
      const table = [
        '| Header | Header | Header |',
        '| ------ | ------ | ------ |',
        '|        |        |        |',
        '|        |        |        |',
        '|        |        |        |',
      ].join('\n')
      insertWithSelection(view, from, to, table, 2, 8)
    },
  },
  {
    label: '/heading',
    detail: 'Insert heading',
    apply: (view, from, to) => {
      insertWithSelection(view, from, to, '## ', 3)
    },
  },
  {
    label: '/todo',
    detail: 'Insert checkbox',
    apply: (view, from, to) => {
      insertWithSelection(view, from, to, '- [ ] ', 6)
    },
  },
  {
    label: '/divider',
    detail: 'Insert horizontal rule',
    apply: (view, from, to) => {
      insertWithSelection(view, from, to, '---\n', 4)
    },
  },
  {
    label: '/date',
    detail: 'Insert current date',
    apply: (view, from, to) => {
      const date = todayFormatted()
      insertWithSelection(view, from, to, date, date.length)
    },
  },
  {
    label: '/code',
    detail: 'Insert code block',
    apply: (view, from, to) => {
      const insert = '```\n\n```'
      insertWithSelection(view, from, to, insert, 4)
    },
  },
  {
    label: '/quote',
    detail: 'Insert blockquote',
    apply: (view, from, to) => {
      insertWithSelection(view, from, to, '> ', 2)
    },
  },
  {
    label: '/meeting-notes',
    detail: 'Insert Google Docs-style meeting notes',
    apply: (view, from, to) => {
      const insert = [
        '## Meeting notes',
        '',
        `**Date:** ${todayFormatted()}`,
        '**Attendees:** Name, Name',
        '',
        '### Agenda',
        '- Topic',
        '',
        '### Notes',
        '- ',
        '',
        '### Action items',
        '- [ ] Owner - Task',
      ].join('\n')
      insertTemplateWithSelection(view, from, to, insert, 'Meeting notes')
    },
  },
  {
    label: '/decision-log',
    detail: 'Insert decision log building block',
    apply: (view, from, to) => {
      const insert = [
        '## Decision log',
        '',
        '| Date | Decision | Owner | Status |',
        '| ---- | -------- | ----- | ------ |',
        `| ${todayFormatted()} | Decision | Owner | Proposed |`,
      ].join('\n')
      insertTemplateWithSelection(view, from, to, insert, 'Decision log')
    },
  },
  {
    label: '/bullet',
    detail: 'Insert bullet list',
    apply: (view, from, to) => {
      insertWithSelection(view, from, to, '- ', 2)
    },
  },
  {
    label: '/embed',
    detail: 'Insert Obsidian note embed',
    apply: (view, from, to) => {
      const insert = '![[Note]]'
      insertWithSelection(view, from, to, insert, 3, 7)
    },
  },
  {
    label: '/wikilink',
    detail: 'Insert Obsidian wikilink',
    apply: (view, from, to) => {
      const insert = '[[Note]]'
      insertWithSelection(view, from, to, insert, 2, 6)
    },
  },
  {
    label: '/callout',
    detail: 'Insert Obsidian callout',
    apply: (view, from, to) => {
      const insert = '> [!note] Title\n> '
      insertWithSelection(view, from, to, insert, 10, 15)
    },
  },
  {
    label: '/comment',
    detail: 'Insert Obsidian comment',
    apply: (view, from, to) => {
      const insert = '%% Comment %%'
      insertWithSelection(view, from, to, insert, 3, 10)
    },
  },
  {
    label: '/footnote',
    detail: 'Insert Obsidian footnote',
    apply: (view, from, to) => {
      const insert = '[^1]\n\n[^1]: Footnote text'
      insertWithSelection(view, from, to, insert, 12, insert.length)
    },
  },
  {
    label: '/folded-callout',
    detail: 'Insert folded Obsidian callout',
    apply: (view, from, to) => {
      const insert = '> [!tip]- Title\n> '
      insertWithSelection(view, from, to, insert, 10, 15)
    },
  },
  {
    label: '/block-id',
    detail: 'Insert Obsidian block ID',
    apply: (view, from, to) => {
      const insert = '^block-id'
      insertWithSelection(view, from, to, insert, 1, insert.length)
    },
  },
]

const STATIC_AT_COMMANDS: AtCommand[] = [
  {
    label: '@meeting-notes',
    detail: 'Insert Google Docs-style meeting notes',
    apply: (view, from, to) => {
      applySlashCommand('/meeting-notes', view, from, to)
    },
  },
  {
    label: '@decision-log',
    detail: 'Insert decision log building block',
    apply: (view, from, to) => {
      applySlashCommand('/decision-log', view, from, to)
    },
  },
  {
    label: '@today',
    detail: 'Insert today as a date smart insert',
    apply: (view, from, to) => {
      const date = todayFormatted()
      insertWithSelection(view, from, to, date, date.length)
    },
  },
  {
    label: '@tomorrow',
    detail: 'Insert tomorrow as a date smart insert',
    apply: (view, from, to) => {
      const date = dateOffsetFormatted(1)
      insertWithSelection(view, from, to, date, date.length)
    },
  },
  {
    label: '@placeholder',
    detail: 'Insert template placeholder',
    apply: (view, from, to) => {
      const insert = '{{placeholder}}'
      insertWithSelection(view, from, to, insert, 2, insert.length - 2)
    },
  },
]

const PEOPLE_PROPERTY_KEYS = ['author', 'owner', 'assignee', 'assignees', 'attendee', 'attendees', 'reviewer', 'reviewers', 'people']
const PLACE_PROPERTY_KEYS = ['location', 'locations', 'place', 'places', 'venue', 'venues', 'address', 'addresses', 'where']
const EVENT_PROPERTY_KEYS = ['event', 'events', 'meeting', 'meetings', 'calendar_event', 'calendar_events']

function propertyListValues(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.flatMap(item => propertyListValues(item))
  return (value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function atCommands(notesOrTitles: Array<string | AtCompletionNote> = []): AtCommand[] {
  const seen = new Set<string>()
  const tagCommands: AtCommand[] = []
  const seenTags = new Set<string>()
  const personCommands: AtCommand[] = []
  const seenPeople = new Set<string>()
  const placeCommands: AtCommand[] = []
  const seenPlaces = new Set<string>()
  const eventCommands: AtCommand[] = []
  const seenEvents = new Set<string>()
  const noteCommands = notesOrTitles.flatMap<AtCommand>((entry) => {
    const note = typeof entry === 'string' ? { title: entry, folder: '', aliases: [] } : entry
    for (const key of PEOPLE_PROPERTY_KEYS) {
      for (const rawName of propertyListValues(note.properties?.[key])) {
        const name = rawName.replace(/^@/, '').trim()
        if (!name || name.length > 80) continue
        const normalized = name.toLowerCase()
        if (seenPeople.has(normalized)) continue
        seenPeople.add(normalized)
        personCommands.push({
          label: `@${name}`,
          detail: `Mention person from ${key}`,
          apply: (view, from, to) => {
            const insert = `@${name}`
            insertWithSelection(view, from, to, insert, insert.length)
          },
        })
      }
    }
    for (const key of EVENT_PROPERTY_KEYS) {
      for (const rawEvent of propertyListValues(note.properties?.[key])) {
        const eventName = rawEvent.trim()
        if (!eventName || eventName.length > 120) continue
        const normalized = eventName.toLowerCase()
        if (seenEvents.has(normalized)) continue
        seenEvents.add(normalized)
        eventCommands.push({
          label: `@${eventName}`,
          detail: `Insert event from ${key}`,
          apply: (view, from, to) => {
            insertWithSelection(view, from, to, eventName, eventName.length)
          },
        })
      }
    }
    for (const key of PLACE_PROPERTY_KEYS) {
      for (const rawPlace of propertyListValues(note.properties?.[key])) {
        const place = rawPlace.trim()
        if (!place || place.length > 120) continue
        const normalized = place.toLowerCase()
        if (seenPlaces.has(normalized)) continue
        seenPlaces.add(normalized)
        placeCommands.push({
          label: `@${place}`,
          detail: `Insert place from ${key}`,
          apply: (view, from, to) => {
            insertWithSelection(view, from, to, place, place.length)
          },
        })
      }
    }
    for (const rawTag of note.tags ?? []) {
      const tag = rawTag.trim().replace(/^#/, '')
      if (!tag || /\s/.test(tag)) continue
      const normalized = tag.toLowerCase()
      if (seenTags.has(normalized)) continue
      seenTags.add(normalized)
      tagCommands.push({
        label: `@${tag}`,
        detail: `Insert #${tag} tag`,
        apply: (view, from, to) => {
          insertWithSelection(view, from, to, `#${tag}`, tag.length + 1)
        },
      })
    }
    if (note.type === 'attachment') {
      const title = note.title?.trim()
      const target = note._id?.trim() || [note.folder, title].filter(Boolean).join('/')
      if (!title || !target) return []
      const label = `@${title}`
      const key = `${label.toLowerCase()}\u0000${target.toLowerCase()}`
      if (seen.has(key)) return []
      seen.add(key)
      return [{
        label,
        detail: note.folder ? `Embed file from ${note.folder}` : 'Embed file',
        apply: (view, from, to) => {
          const insert = `![[${target}]]`
          insertWithSelection(view, from, to, insert, insert.length)
        },
      }]
    }
    const title = note.title?.trim()
    if (!title) return []

    const commands: AtCommand[] = []
    const addCommand = (labelText: string, detail: string, insert: string) => {
      const label = `@${labelText.trim()}`
      if (label === '@') return
      const key = `${label.toLowerCase()}\u0000${insert.toLowerCase()}`
      if (seen.has(key)) return
      seen.add(key)
      commands.push({
        label,
        detail,
        apply: (view, from, to) => {
          insertWithSelection(view, from, to, insert, insert.length)
        },
      })
    }

    addCommand(title, note.folder ? `Link note in ${note.folder}` : 'Link note', `[[${title}]]`)
    for (const alias of note.aliases ?? []) {
      const trimmedAlias = alias.trim()
      if (!trimmedAlias || trimmedAlias === title) continue
      addCommand(trimmedAlias, `Alias for ${title}`, `[[${title}|${trimmedAlias}]]`)
    }
    return commands
  })

  return [...STATIC_AT_COMMANDS, ...noteCommands, ...tagCommands, ...personCommands, ...placeCommands, ...eventCommands]
}

export function applySlashCommand(label: string, view: EditorView, from: number, to: number): boolean {
  const command = SLASH_COMMANDS.find((cmd) => cmd.label === label)
  if (!command) return false
  command.apply(view, from, to)
  return true
}

/**
 * CodeMirror CompletionSource that triggers on `/` at the start of a line.
 * Provides slash commands for quick markdown insertion.
 */
export function slashCommandCompletions(
  context: CompletionContext,
): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos)
  const textBefore = line.text.slice(0, context.pos - line.from)

  // Only trigger if `/` is at the start of the line (possibly with whitespace)
  const match = textBefore.match(/^(\s*)(\/\S*)$/)
  if (!match) return null

  const slashStart = line.from + (match[1]?.length ?? 0)
  const query = match[2].toLowerCase()

  const options: Completion[] = SLASH_COMMANDS
    .filter((cmd) => cmd.label.toLowerCase().startsWith(query))
    .map((cmd) => ({
      label: cmd.label,
      detail: cmd.detail,
      type: 'keyword' as const,
      apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
        applySlashCommand(cmd.label, view, from, to)
      },
    }))

  if (options.length === 0) return null

  return {
    from: slashStart,
    to: context.pos,
    options,
    filter: false,
  }
}

/**
 * Source-mode Google Docs-style @ smart inserts. These intentionally insert
 * Markdown fallbacks so source mode stays local-first and export-friendly.
 */
export function buildingBlockCompletions(context: CompletionContext): CompletionResult | null
export function buildingBlockCompletions(notesOrTitles: Array<string | AtCompletionNote>): (context: CompletionContext) => CompletionResult | null
export function buildingBlockCompletions(
  notesOrTitlesOrContext: Array<string | AtCompletionNote> | CompletionContext,
) {
  if ('state' in notesOrTitlesOrContext && 'pos' in notesOrTitlesOrContext) {
    return atCommandCompletionResult(notesOrTitlesOrContext, atCommands())
  }

  const commands = atCommands(notesOrTitlesOrContext)
  return (context: CompletionContext) => atCommandCompletionResult(context, commands)
}

function atCommandCompletionResult(
  context: CompletionContext,
  commands: AtCommand[],
): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos)
  const textBefore = line.text.slice(0, context.pos - line.from)
  const match = textBefore.match(/^(\s*)(@\S*)$/)
  if (!match) return null

  const blockStart = line.from + (match[1]?.length ?? 0)
  const query = match[2].toLowerCase()
  const options: Completion[] = commands
    .filter((cmd) => cmd.label.toLowerCase().startsWith(query))
    .map((cmd) => ({
      label: cmd.label,
      detail: cmd.detail,
      type: 'keyword' as const,
      apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
        cmd.apply(view, from, to)
      },
    }))

  if (options.length === 0) return null

  return {
    from: blockStart,
    to: context.pos,
    options,
    filter: false,
  }
}
