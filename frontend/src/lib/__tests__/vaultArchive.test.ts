import { describe, expect, it } from 'vitest'
import { verifyMarkdownVaultArchive } from '../vaultArchive'

describe('markdown vault archive verifier', () => {
  it('accepts a valid Markdown vault tar with manifest, notes, and attachments', () => {
    const archive = tar([
      [
        'vault-manifest.json',
        JSON.stringify({
          format: 'clawcontrol-markdown-vault-tar',
          version: 1,
          notes: 1,
          attachments: 1,
          plugin_metadata: {
            schema: 'clawcontrol-vault-plugin-index',
            version: 1,
            documents: [{ id: 'Projects/Roadmap.md', tags: ['strategy'] }],
            attachments: [{ id: 'Media/diagram.png', sha256: 'abc' }],
            tags: { strategy: 1 },
            property_keys: ['status'],
            links: [],
            backlinks: {},
            review: { comments: 0, suggestions: 0 },
          },
        }),
      ],
      ['Projects/Roadmap.md', '# Roadmap'],
      ['Media/diagram.png', 'png-bytes'],
    ])

    expect(verifyMarkdownVaultArchive(archive)).toEqual(
      expect.objectContaining({
        ok: true,
        manifest: expect.objectContaining({
          plugin_metadata: expect.objectContaining({
            schema: 'clawcontrol-vault-plugin-index',
            tags: { strategy: 1 },
          }),
        }),
        entries: ['vault-manifest.json', 'Projects/Roadmap.md', 'Media/diagram.png'],
        errors: [],
      }),
    )
  })

  it('rejects unsafe paths and manifest count mismatches', () => {
    const archive = tar([
      [
        'vault-manifest.json',
        JSON.stringify({
          format: 'clawcontrol-markdown-vault-tar',
          version: 1,
          notes: 2,
          attachments: 0,
        }),
      ],
      ['../secret.md', '# nope'],
    ])

    const result = verifyMarkdownVaultArchive(archive)

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Unsafe archive path: ../secret.md',
        'Manifest notes count 2 does not match archive count 1',
      ]),
    )
  })

  it('rejects unsupported plugin metadata indexes', () => {
    const archive = tar([
      [
        'vault-manifest.json',
        JSON.stringify({
          format: 'clawcontrol-markdown-vault-tar',
          version: 1,
          notes: 1,
          attachments: 0,
          plugin_metadata: {
            schema: 'other-index',
            version: 2,
            documents: [{ id: 'Projects/Roadmap.md' }],
            attachments: [],
          },
        }),
      ],
      ['Projects/Roadmap.md', '# Roadmap'],
    ])

    const result = verifyMarkdownVaultArchive(archive)

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Archive plugin metadata schema is not supported',
        'Archive plugin metadata version is not supported',
      ]),
    )
  })

  it('rejects manifest attachments that are absent from the archive', () => {
    const archive = tar([
      [
        'vault-manifest.json',
        JSON.stringify({
          format: 'clawcontrol-markdown-vault-tar',
          version: 1,
          notes: 1,
          attachments: 0,
          plugin_metadata: {
            schema: 'clawcontrol-vault-plugin-index',
            version: 1,
            attachments: [{ id: 'Media/missing.png' }],
          },
        }),
      ],
      ['Projects/Roadmap.md', '# Roadmap'],
    ])

    const result = verifyMarkdownVaultArchive(archive)

    expect(result.ok).toBe(false)
    expect(result.errors).toContain('Manifest attachment missing from archive: Media/missing.png')
  })

  it('rejects note entries that do not match manifest document metadata', () => {
    const archive = tar([
      [
        'vault-manifest.json',
        JSON.stringify({
          format: 'clawcontrol-markdown-vault-tar',
          version: 1,
          notes: 2,
          attachments: 0,
          plugin_metadata: {
            schema: 'clawcontrol-vault-plugin-index',
            version: 1,
            documents: [
              { id: 'Projects/Roadmap.md' },
              { id: 'Projects/Missing.md' },
            ],
            attachments: [],
          },
        }),
      ],
      ['Projects/Roadmap.md', '# Roadmap'],
      ['Projects/Undocumented.md', '# Not indexed'],
    ])

    const result = verifyMarkdownVaultArchive(archive)

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Manifest document missing from archive: Projects/Missing.md',
        'Archive note missing from manifest metadata: Projects/Undocumented.md',
      ]),
    )
  })

  it('rejects missing and unsafe manifest document metadata', () => {
    const archive = tar([
      [
        'vault-manifest.json',
        JSON.stringify({
          format: 'clawcontrol-markdown-vault-tar',
          version: 1,
          notes: 2,
          attachments: 0,
          plugin_metadata: {
            schema: 'clawcontrol-vault-plugin-index',
            version: 1,
            documents: [{ id: '../unsafe.md' }],
            attachments: [],
          },
        }),
      ],
      ['Projects/Roadmap.md', '# Roadmap'],
      ['Projects/Notes.md', '# Notes'],
    ])

    const result = verifyMarkdownVaultArchive(archive)

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Manifest document metadata count 1 does not match manifest notes count 2',
        'Unsafe manifest document path: ../unsafe.md',
        'Manifest document missing from archive: ../unsafe.md',
        'Archive note missing from manifest metadata: Projects/Roadmap.md',
        'Archive note missing from manifest metadata: Projects/Notes.md',
      ]),
    )
  })

  it('rejects duplicate manifest metadata paths and attachment size drift', () => {
    const archive = tar([
      [
        'vault-manifest.json',
        JSON.stringify({
          format: 'clawcontrol-markdown-vault-tar',
          version: 1,
          notes: 2,
          attachments: 2,
          plugin_metadata: {
            schema: 'clawcontrol-vault-plugin-index',
            version: 1,
            documents: [
              { id: 'Projects/Roadmap.md' },
              { id: 'Projects/Roadmap.md' },
            ],
            attachments: [
              { id: 'Media/diagram.png', size: 999 },
              { id: 'Media/diagram.png', size: 999 },
            ],
          },
        }),
      ],
      ['Projects/Roadmap.md', '# Roadmap'],
      ['Projects/Notes.md', '# Notes'],
      ['Media/diagram.png', 'png-bytes'],
      ['Media/photo.png', 'image-bytes'],
    ])

    const result = verifyMarkdownVaultArchive(archive)

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Manifest contains duplicate document metadata path: Projects/Roadmap.md',
        'Manifest contains duplicate attachment metadata path: Media/diagram.png',
        'Archive note missing from manifest metadata: Projects/Notes.md',
        'Archive attachment missing from manifest metadata: Media/photo.png',
        'Manifest attachment size 999 does not match archive size 9: Media/diagram.png',
      ]),
    )
  })

  it('rejects archive attachments that are not represented in manifest metadata', () => {
    const archive = tar([
      [
        'vault-manifest.json',
        JSON.stringify({
          format: 'clawcontrol-markdown-vault-tar',
          version: 1,
          notes: 1,
          attachments: 1,
          plugin_metadata: {
            schema: 'clawcontrol-vault-plugin-index',
            version: 1,
            attachments: [],
          },
        }),
      ],
      ['Projects/Roadmap.md', '# Roadmap'],
      ['Media/undocumented.png', 'png-bytes'],
    ])

    const result = verifyMarkdownVaultArchive(archive)

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Archive manifest is missing attachment metadata',
        'Archive attachment missing from manifest metadata: Media/undocumented.png',
      ]),
    )
  })

  it('rejects duplicate tar paths and unsafe manifest attachment paths', () => {
    const archive = tar([
      [
        'vault-manifest.json',
        JSON.stringify({
          format: 'clawcontrol-markdown-vault-tar',
          version: 1,
          notes: 1,
          attachments: 1,
          plugin_metadata: {
            schema: 'clawcontrol-vault-plugin-index',
            version: 1,
            attachments: [{ id: '../Media/diagram.png' }],
          },
        }),
      ],
      ['Projects/Roadmap.md', '# Roadmap'],
      ['Projects/Roadmap.md', '# Duplicate'],
      ['Media/diagram.png', 'png-bytes'],
    ])

    const result = verifyMarkdownVaultArchive(archive)

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Archive contains duplicate path: Projects/Roadmap.md',
        'Unsafe manifest attachment path: ../Media/diagram.png',
        'Manifest attachment missing from archive: ../Media/diagram.png',
        'Archive attachment missing from manifest metadata: Media/diagram.png',
      ]),
    )
  })

  it('rejects malformed non-tar bytes', () => {
    const result = verifyMarkdownVaultArchive(new TextEncoder().encode('not a tar'))

    expect(result.ok).toBe(false)
    expect(result.errors).toContain('Archive is not aligned to tar block size')
  })
})

function tar(files: Array<[string, string]>): Uint8Array {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  for (const [path, content] of files) {
    const data = encoder.encode(content)
    const header = new Uint8Array(512)
    writeString(header, 0, 100, path)
    writeOctal(header, 100, 8, 0o644)
    writeOctal(header, 108, 8, 0)
    writeOctal(header, 116, 8, 0)
    writeOctal(header, 124, 12, data.length)
    writeOctal(header, 136, 12, 0)
    header.fill(0x20, 148, 156)
    header[156] = '0'.charCodeAt(0)
    writeString(header, 257, 6, 'ustar')
    const checksum = header.reduce((sum, byte) => sum + byte, 0)
    writeOctal(header, 148, 8, checksum)
    chunks.push(header, data, new Uint8Array((512 - (data.length % 512)) % 512))
  }
  chunks.push(new Uint8Array(1024))
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

function writeString(target: Uint8Array, start: number, length: number, value: string) {
  target.set(new TextEncoder().encode(value).slice(0, length), start)
}

function writeOctal(target: Uint8Array, start: number, length: number, value: number) {
  const encoded = new TextEncoder().encode(value.toString(8).padStart(length - 1, '0'))
  target.set(encoded.slice(0, length - 1), start)
  target[start + length - 1] = 0
}
