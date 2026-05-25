import { describe, expect, it } from 'vitest'
import {
  formatDocumentPropertyInputValue,
  inferDocumentPropertyValueKind,
  normalizeDocumentPropertyKey,
  renameDocumentProperty,
  removeDocumentProperty,
  upsertDocumentProperty,
} from '../documentProperties'

describe('document properties', () => {
  it('normalizes property keys for frontmatter-safe storage', () => {
    expect(normalizeDocumentPropertyKey(' Review Status! ')).toBe('Review_Status')
    expect(normalizeDocumentPropertyKey('../bad/key')).toBe('badkey')
  })

  it('adds, updates, and removes document-owned frontmatter properties', () => {
    const markdown = '# Body\n'
    const withStatus = upsertDocumentProperty(markdown, 'status', 'draft')
    const withOwner = upsertDocumentProperty(withStatus, 'owner', 'local')

    expect(withOwner).toBe('---\nstatus: draft\nowner: local\n---\n\n# Body\n')
    expect(upsertDocumentProperty(withOwner, 'status', 'ready')).toBe('---\nstatus: ready\nowner: local\n---\n\n# Body\n')
    expect(removeDocumentProperty(withOwner, 'owner')).toBe('---\nstatus: draft\n---\n\n# Body\n')
  })

  it('renames a document property while preserving its value', () => {
    const markdown = ['---', 'status: draft', 'reviewers:', '  - Ada', '  - Ben', '---', '', '# Body', ''].join('\n')

    expect(renameDocumentProperty(markdown, 'status', 'review_status')).toBe(
      ['---', 'reviewers: Ada, Ben', 'review_status: draft', '---', '', '# Body', ''].join('\n'),
    )
    expect(renameDocumentProperty(markdown, 'reviewers', 'owners')).toBe(
      ['---', 'status: draft', 'owners: Ada, Ben', '---', '', '# Body', ''].join('\n'),
    )
    expect(renameDocumentProperty(markdown, 'missing', 'owner')).toBe(markdown)
  })

  it('formats typed property values for frontmatter storage', () => {
    expect(inferDocumentPropertyValueKind(['Ada', 'Ben'])).toBe('list')
    expect(inferDocumentPropertyValueKind('true')).toBe('checkbox')
    expect(inferDocumentPropertyValueKind('42.5')).toBe('number')
    expect(inferDocumentPropertyValueKind('2026-05-21')).toBe('date')
    expect(formatDocumentPropertyInputValue('list', 'Ada, Ben\nCyd')).toBe('Ada, Ben, Cyd')
    expect(formatDocumentPropertyInputValue('checkbox', 'done')).toBe('true')
    expect(formatDocumentPropertyInputValue('checkbox', '')).toBe('false')
    expect(formatDocumentPropertyInputValue('date', '2026-02-31')).toBe('2026-02-31')
  })
})
