import { describe, expect, it } from 'vitest'
import {
  applyTemplate,
  applyTemplateVariables,
  appendTemplateToContent,
  extractTemplatePrompts,
  formatTemplateDate,
  isVaultTemplateNote,
  selectFolderTemplate,
  vaultTemplateId,
  vaultTemplatesFromNotes,
} from '../templates'

describe('vault templates', () => {
  it('discovers templates from the Templates folder or template property', () => {
    const notes = [
      {
        _id: 'Templates/Essay.md',
        type: 'note',
        title: 'Essay',
        folder: 'Templates',
        content: '---\ntemplate: true\n---\n\n# {{date}}\n',
      },
      {
        _id: 'Projects/Brief.md',
        type: 'note',
        title: 'Brief',
        folder: 'Projects',
        properties: { template: 'true', targetFolders: ['Projects', 'Work/*'] },
        content: '# Brief',
      },
      {
        _id: 'Projects/Normal.md',
        type: 'note',
        title: 'Normal',
        folder: 'Projects',
        content: '# Normal',
      },
    ]

    expect(isVaultTemplateNote(notes[0])).toBe(true)
    expect(vaultTemplateId(notes[0])).toBe('vault:Templates/Essay.md')
    expect(vaultTemplatesFromNotes(notes)).toEqual([
      expect.objectContaining({ id: 'vault:Templates/Essay.md', label: 'Essay', content: '# {{date}}\n', source: 'vault' }),
      expect.objectContaining({
        id: 'vault:Projects/Brief.md',
        label: 'Brief',
        content: '# Brief',
        source: 'vault',
        folderTemplates: ['Projects', 'Work/*'],
      }),
    ])
  })

  it('selects the most specific folder template', () => {
    const templates = vaultTemplatesFromNotes([
      {
        _id: 'Templates/Default.md',
        type: 'note',
        title: 'Default',
        folder: 'Templates',
        properties: { template: 'true', folderTemplate: '*' },
        content: '# Default',
      },
      {
        _id: 'Templates/Project.md',
        type: 'note',
        title: 'Project',
        folder: 'Templates',
        properties: { template: 'true', folderTemplate: 'Projects/*' },
        content: '# Project',
      },
      {
        _id: 'Templates/Client.md',
        type: 'note',
        title: 'Client',
        folder: 'Templates',
        properties: { template: 'true', folderTemplate: 'Projects/Clients' },
        content: '# Client',
      },
    ])

    expect(selectFolderTemplate(templates, 'Projects/Clients')?.label).toBe('Client')
    expect(selectFolderTemplate(templates, 'Projects/Internal')?.label).toBe('Project')
    expect(selectFolderTemplate(templates, 'Inbox')?.label).toBe('Default')
    expect(selectFolderTemplate(templates, undefined)?.label).toBe('Default')
  })

  it('applies date variables to vault templates', () => {
    const content = applyTemplate(
      { id: 'vault:x', label: 'X', icon: '', content: '# {{date}}', source: 'vault' },
      { now: new Date(2026, 4, 20, 9, 5, 7) },
    )

    expect(content).toBe('# May 20, 2026')
  })

  it('applies title, folder, date, time, and prompt variables', () => {
    const now = new Date(2026, 4, 20, 9, 5, 7)

    expect(applyTemplateVariables([
      '# {{title}}',
      'Folder: {{folder}}',
      'ISO: {{isoDate}}',
      'Date: {{date:YYYY-MM-DD}}',
      'Time: {{time:HH:mm}}',
      'Prompt: {{prompt:Mood|focused}}',
      'Unknown: {{unknown}}',
    ].join('\n'), {
      now,
      title: 'Daily 2026-05-20',
      folder: 'Journal',
      promptValues: { Mood: 'clear' },
    })).toBe([
      '# Daily 2026-05-20',
      'Folder: Journal',
      'ISO: 2026-05-20',
      'Date: 2026-05-20',
      'Time: 09:05',
      'Prompt: clear',
      'Unknown: {{unknown}}',
    ].join('\n'))
  })

  it('extracts prompt variables in first-seen order', () => {
    expect(extractTemplatePrompts([
      '# {{prompt:Project|ClawControl}}',
      'Status: {{prompt:Status|Draft}}',
      'Again: {{ prompt:Project|Ignored }}',
      'Nested separator: {{prompt:Notes|A|B}}',
    ].join('\n'))).toEqual([
      { name: 'Project', defaultValue: 'ClawControl' },
      { name: 'Status', defaultValue: 'Draft' },
      { name: 'Notes', defaultValue: 'A|B' },
    ])
  })

  it('appends template insertions with stable spacing', () => {
    expect(appendTemplateToContent('', '\n## Tasks\n')).toBe('## Tasks\n')
    expect(appendTemplateToContent('# Note\n\n', '\n## Tasks\n- [ ] One\n')).toBe('# Note\n\n## Tasks\n- [ ] One\n')
    expect(appendTemplateToContent('# Note', '   ')).toBe('# Note')
  })

  it('formats supported daily note tokens deterministically', () => {
    const now = new Date(2026, 4, 20, 21, 5, 7)

    expect(formatTemplateDate(now, 'YYYY/MM/DD ddd HH:mm:ss')).toBe('2026/05/20 Wed 21:05:07')
    expect(formatTemplateDate(now, 'dddd, MMMM D, YYYY h:mm A')).toBe('Wednesday, May 20, 2026 9:05 PM')
  })
})
