import { describe, expect, it } from 'vitest'
import { normalizeDocumentPropertyKey, removeDocumentProperty, upsertDocumentProperty } from '../documentProperties'

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
})
