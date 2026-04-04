export interface NoteTemplate {
  id: string
  label: string
  icon: string
  content: string
}

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
