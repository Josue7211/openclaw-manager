import { describe, expect, it } from 'vitest'
import { applyTemplate, isVaultTemplateNote, vaultTemplateId, vaultTemplatesFromNotes } from '../templates'

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
        properties: { template: 'true' },
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
      expect.objectContaining({ id: 'vault:Projects/Brief.md', label: 'Brief', content: '# Brief', source: 'vault' }),
    ])
  })

  it('applies date variables to vault templates', () => {
    const content = applyTemplate({ id: 'vault:x', label: 'X', icon: '', content: '# {{date}}', source: 'vault' })

    expect(content).toMatch(/^# [A-Z][a-z]+ \d{1,2}, \d{4}$/)
  })
})
