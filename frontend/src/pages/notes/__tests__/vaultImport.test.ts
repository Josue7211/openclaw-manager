import { describe, expect, it } from 'vitest'
import { folderAncestors, planMarkdownVaultImport, rewriteImportedAttachmentEmbeds } from '../vaultImport'

function vaultFile(path: string, content = 'body', type = 'text/plain'): File {
  const file = new File([content], path.split('/').pop() || path, { type })
  Object.defineProperty(file, 'webkitRelativePath', {
    value: path,
    configurable: true,
  })
  return file
}

describe('planMarkdownVaultImport', () => {
  it('strips the selected vault root and preserves nested note folders', () => {
    const plan = planMarkdownVaultImport([
      vaultFile('MyVault/Projects/Roadmap.md', '# Roadmap', 'text/markdown'),
      vaultFile('MyVault/People/Ada.markdown', '# Ada', 'text/markdown'),
    ])

    expect(plan.notes.map((note) => [note.title, note.folder, note.path])).toEqual([
      ['Roadmap', 'Projects', 'Projects/Roadmap.md'],
      ['Ada', 'People', 'People/Ada.markdown'],
    ])
  })

  it('keeps attachments with import-safe IDs and skips Obsidian internals', () => {
    const plan = planMarkdownVaultImport([
      vaultFile('Vault/Notes/Idea.md', '# Idea', 'text/markdown'),
      vaultFile('Vault/Assets/diagram.png', 'png', 'image/png'),
      vaultFile('Vault/.obsidian/workspace.json', '{}', 'application/json'),
    ])

    expect(plan.attachments).toHaveLength(1)
    expect(plan.attachments[0]).toMatchObject({
      folder: 'Assets',
      id: 'Assets/diagram.png',
      path: 'Assets/diagram.png',
    })
    expect(plan.skipped).toBe(1)
  })

  it('expands folder ancestors for import setup', () => {
    expect(folderAncestors('Projects/Alpha/Assets')).toEqual([
      'Projects',
      'Projects/Alpha',
      'Projects/Alpha/Assets',
    ])
  })

  it('rewrites Obsidian embeds to preserved imported attachment IDs', () => {
    const plan = planMarkdownVaultImport([
      vaultFile('Vault/Projects/Idea.md', '# Idea\n\n![[diagram.png]]\n![[../Assets/photo%201.png|300]]', 'text/markdown'),
      vaultFile('Vault/Projects/diagram.png', 'png', 'image/png'),
      vaultFile('Vault/Assets/photo 1.png', 'png', 'image/png'),
    ])

    const rewritten = rewriteImportedAttachmentEmbeds(
      '# Idea\n\n![[diagram.png]]\n![[../Assets/photo%201.png|300]]',
      plan.notes[0],
      plan.attachments,
    )

    expect(rewritten).toContain('![[Projects/diagram.png]]')
    expect(rewritten).toContain('![[Assets/photo 1.png|300]]')
  })

  it('converts imported Markdown image links into local vault embeds', () => {
    const plan = planMarkdownVaultImport([
      vaultFile('Vault/Projects/Idea.md', '# Idea\n\n![Diagram](diagram.png)', 'text/markdown'),
      vaultFile('Vault/Projects/diagram.png', 'png', 'image/png'),
    ])

    expect(rewriteImportedAttachmentEmbeds('![Diagram](diagram.png)', plan.notes[0], plan.attachments))
      .toBe('![[Projects/diagram.png|Diagram]]')
  })

  it('uses indexed attachment lookup for large vault imports and keeps ambiguous basenames unchanged', () => {
    const files = [
      vaultFile(
        'Vault/Projects/Idea.md',
        '# Idea\n\n![[Assets/image-499.png]]\n![[shared.png]]',
        'text/markdown',
      ),
      ...Array.from({ length: 500 }, (_, index) =>
        vaultFile(`Vault/Projects/Assets/image-${index}.png`, 'png', 'image/png'),
      ),
      vaultFile('Vault/Projects/Assets/shared.png', 'png', 'image/png'),
      vaultFile('Vault/Archive/shared.png', 'png', 'image/png'),
    ]
    const plan = planMarkdownVaultImport(files)

    const rewritten = rewriteImportedAttachmentEmbeds(
      '# Idea\n\n![[Assets/image-499.png]]\n![[shared.png]]',
      plan.notes[0],
      plan.attachments,
    )

    expect(plan.attachments).toHaveLength(502)
    expect(rewritten).toContain('![[Projects/Assets/image-499.png]]')
    expect(rewritten).toContain('![[shared.png]]')
  })
})
