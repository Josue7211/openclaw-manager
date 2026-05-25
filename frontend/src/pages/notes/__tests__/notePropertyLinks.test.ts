import { describe, expect, it } from 'vitest'
import { noteRelationshipTargets, propertyLinkTargets } from '../notePropertyLinks'

describe('note property links', () => {
  it('extracts Obsidian links and path-like property values without treating normal text as links', () => {
    expect(propertyLinkTargets({
      related: '[[Project Alpha|Alpha]]',
      parent: 'Projects/Roadmap.md',
      reviewers: ['Ada', '[[Project Brief#Scope]]'],
      status: 'ready',
    })).toEqual(['Project Alpha', 'Projects/Roadmap.md', 'Project Brief#Scope'])
  })

  it('combines body links with frontmatter property links without duplicates', () => {
    expect(noteRelationshipTargets({
      links: ['Project Alpha', 'Brief'],
      properties: {
        related: '[[Project Alpha]]',
        parent: 'Projects/Brief.md',
      },
    })).toEqual(['Project Alpha', 'Brief', 'Projects/Brief.md'])
  })
})
