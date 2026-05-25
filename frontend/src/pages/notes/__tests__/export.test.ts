import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildPublishedNotesSiteBundle,
  buildPublishedNotesSite,
  buildReviewPackage,
  documentFooterXml,
  documentHtml,
  documentPageSettings,
  markdownToDocumentXml,
  markdownToSafeHtml,
  replaceMarkdownBody,
  setFrontmatterProperty,
  splitFrontmatter,
  verifyReviewPackage,
} from '../export'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('notes export markdown compatibility', () => {
  it('keeps frontmatter separate from the rich document body', () => {
    const markdown = ['---', 'aliases: [Roadmap Alpha]', 'tags:', '  - planning', '---', '', '## Plan', ''].join('\n')

    expect(splitFrontmatter(markdown)).toEqual({
      frontmatter: ['---', 'aliases: [Roadmap Alpha]', 'tags:', '  - planning', '---', '', ''].join('\n'),
      body: '## Plan\n',
    })
    expect(replaceMarkdownBody(markdown, '# Next\n')).toContain('aliases: [Roadmap Alpha]')
    expect(replaceMarkdownBody(markdown, '# Next\n')).toMatch(/---\n\n# Next\n$/)
  })

  it('renders Obsidian links, tags, and task checkboxes as document UI', () => {
    const html = markdownToSafeHtml('See [[Project Alpha|Alpha]] #planning\n\n- [x] Done\n- [ ] Next')

    expect(html).toContain('class="note-wikilink"')
    expect(html).toContain('href="#note:Project%20Alpha"')
    expect(html).toContain('>Alpha</a>')
    expect(html).toContain('class="note-tag"')
    expect(html).toContain('#planning')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('checked')
  })

  it('updates frontmatter properties without touching the document body', () => {
    const markdown = '---\nstatus: draft\n---\n\n# Body\n'

    expect(setFrontmatterProperty(markdown, 'status', 'ready')).toBe('---\nstatus: ready\n---\n\n# Body\n')
    expect(setFrontmatterProperty('# Body\n', 'tags', 'docs, writing')).toBe(
      '---\ntags:\n  - docs\n  - writing\n---\n\n# Body\n',
    )
  })

  it('renders Obsidian callouts as document blocks', () => {
    const html = markdownToSafeHtml('> [!warning] Watch this\n> Keep the source safe.')

    expect(html).toContain('note-callout note-callout-warning')
    expect(html).toContain('note-callout-title')
    expect(html).toContain('Watch this')
    expect(html).toContain('Keep the source safe.')
  })

  it('renders folded Obsidian callouts with collapsed preview state', () => {
    const html = markdownToSafeHtml('> [!tip]- Later\n> Hidden until expanded.')

    expect(html).toContain('note-callout note-callout-tip note-callout-fold-collapsed')
    expect(html).toContain('button type="button" class="note-callout-title" aria-expanded="false"')
    expect(html).toContain('Later')
    expect(html).toContain('Hidden until expanded.')
  })

  it('renders standard Obsidian callout aliases with stable classes', () => {
    const html = markdownToSafeHtml([
      '> [!todo] Next',
      '> Ship the smallest useful slice.',
      '',
      '> [!question] Why',
      '> Keep the answer close.',
      '',
      '> [!bug] Regression',
      '> Track the failing path.',
      '',
      '> [!example] Pattern',
      '> Reuse it.',
    ].join('\n'))

    expect(html).toContain('note-callout-todo')
    expect(html).toContain('note-callout-question')
    expect(html).toContain('note-callout-bug')
    expect(html).toContain('note-callout-example')
  })

  it('renders Obsidian image embeds through the vault media endpoint', () => {
    const html = markdownToSafeHtml('![[Media/diagram.png|Architecture diagram|420]]')

    expect(html).toContain('<img')
    expect(html).toContain('/api/vault/local/media?id=Media%2Fdiagram.png')
    expect(html).toContain('alt="Architecture diagram"')
    expect(html).toContain('width="420"')
  })

  it('keeps safe inline document styles for docs-grade formatting', () => {
    const html = markdownToSafeHtml(
      '<span style="color: #ff0000; background-color: #ffff00; background-image: url(bad)">Styled</span>',
    )

    expect(html).toContain('color: #ff0000')
    expect(html).toContain('background-color: #ffff00')
    expect(html).not.toContain('url(')
  })

  it('does not leak YAML frontmatter into exported document HTML', () => {
    const html = markdownToSafeHtml('---\nstatus: private\n---\n\n# Visible')

    expect(html).toContain('<h1>Visible</h1>')
    expect(html).not.toContain('status: private')
  })

  it('expands dataview blocks when export has vault context', () => {
    const html = markdownToSafeHtml(['```dataview', 'TABLE title, status FROM tag:strategy', '```'].join('\n'), {
      notes: [
        {
          _id: 'Projects/roadmap.md',
          type: 'note',
          title: 'Roadmap',
          content: '',
          folder: 'Projects',
          tags: ['strategy'],
          links: [],
          aliases: [],
          properties: { status: 'active' },
          created_at: 1,
          updated_at: 2,
        },
      ],
    })

    expect(html).toContain('<table>')
    expect(html).toContain('Roadmap')
    expect(html).toContain('active')
  })

  it('expands local vault plugin blocks when export has vault context', () => {
    const html = markdownToSafeHtml(['```claw-plugin', '{"plugin":"vault.stats"}', '```'].join('\n'), {
      notes: [
        {
          _id: 'Projects/roadmap.md',
          type: 'note',
          title: 'Roadmap',
          content: '- [x] Ship',
          folder: 'Projects',
          tags: ['strategy'],
          links: [],
          created_at: 1,
          updated_at: 2,
        },
      ],
    })

    expect(html).toContain('Vault stats')
    expect(html).toContain('<td>1/1</td>')
  })

  it('builds a local static publish site with note navigation and rewritten wikilinks', () => {
    const html = buildPublishedNotesSite(
      [
        {
          _id: 'Projects/brief.md',
          type: 'note',
          title: 'Brief',
          content: '# Brief\n\nSee [[Roadmap]]',
          folder: 'Projects',
          tags: [],
          links: ['Roadmap'],
          aliases: [],
          created_at: 1,
          updated_at: 2,
        },
        {
          _id: 'Projects/roadmap.md',
          type: 'note',
          title: 'Roadmap',
          content: '# Roadmap',
          folder: 'Projects',
          tags: [],
          links: [],
          aliases: ['Plan'],
          created_at: 1,
          updated_at: 3,
        },
        {
          _id: 'Media/image.png',
          type: 'attachment',
          title: 'image.png',
          content: '',
          folder: 'Media',
          tags: [],
          links: [],
          created_at: 1,
          updated_at: 3,
        },
      ],
      { entryId: 'Projects/brief.md', title: 'Project Docs' },
    )

    expect(html).toContain('<title>Project Docs</title>')
    expect(html).toContain('aria-label="Published notes"')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('Brief')
    expect(html).toContain('Roadmap')
    expect(html).not.toContain('image.png')
    expect(html).toContain('href="#note-Projects2Froadmap.md"')
  })

  it('publishes Obsidian callouts with folded-callout styles and behavior', () => {
    const html = buildPublishedNotesSite([
      {
        _id: 'Projects/brief.md',
        type: 'note',
        title: 'Brief',
        content: ['# Brief', '', '> [!warning] Watch', '> Keep visible.', '', '> [!tip]- Later', '> Hidden until expanded.'].join('\n'),
        folder: 'Projects',
        tags: [],
        links: [],
        aliases: [],
        created_at: 1,
        updated_at: 2,
      },
    ])

    expect(html).toContain('note-callout note-callout-warning')
    expect(html).toContain('note-callout note-callout-tip note-callout-fold-collapsed')
    expect(html).toContain('button type="button" class="note-callout-title" aria-expanded="false"')
    expect(html).toContain('.note-callout-fold-collapsed .note-callout-body')
    expect(html).toContain("callout.classList.toggle('note-callout-fold-collapsed'")
    expect(html).toContain("title.setAttribute('aria-expanded'")
  })

  it('builds a static publish bundle with local attachment files and a manifest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('Media%2Fdiagram.png')) {
          return {
            ok: true,
            headers: { get: () => 'image/png' },
            arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
          }
        }
        if (url.includes('Media%2Fphoto.jpg')) {
          return {
            ok: true,
            headers: { get: () => 'image/jpeg' },
            arrayBuffer: async () => new Uint8Array([5, 6]).buffer,
          }
        }
        return {
          ok: false,
          headers: { get: () => null },
          arrayBuffer: async () => new ArrayBuffer(0),
        }
      }),
    )

    const bundle = await buildPublishedNotesSiteBundle(
      [
        {
          _id: 'Projects/brief.md',
          type: 'note',
          title: 'Brief',
          content: [
            '# Brief',
            '',
            '![[Media/diagram.png|Architecture diagram|420]]',
            '',
            '![Markdown image](Media/photo.jpg)',
            '',
            '![[Media/missing.png|Missing diagram]]',
          ].join('\n'),
          folder: 'Projects',
          tags: [],
          links: [],
          aliases: [],
          created_at: 1,
          updated_at: 2,
        },
      ],
      { entryId: 'Projects/brief.md', title: 'Project Docs' },
    )

    expect(bundle.html).toContain('src="assets/Media/diagram.png"')
    expect(bundle.html).toContain('src="assets/Media/photo.jpg"')
    expect(bundle.html).toContain('width="420"')
    expect(bundle.html).not.toContain('/api/vault/local/media')
    expect(bundle.html).toContain('Missing attachment: Media/missing.png')
    expect(bundle.manifest).toEqual(
      expect.objectContaining({
        format: 'clawctrl-published-notes-site',
        title: 'Project Docs',
        entry_id: 'Projects/brief.md',
        attachments: [
          expect.objectContaining({
            id: 'Media/diagram.png',
            outputPath: 'assets/Media/diagram.png',
            status: 'bundled',
            size: 4,
            mime: 'image/png',
          }),
          expect.objectContaining({
            id: 'Media/missing.png',
            outputPath: 'assets/Media/missing.png',
            status: 'missing',
          }),
          expect.objectContaining({
            id: 'Media/photo.jpg',
            outputPath: 'assets/Media/photo.jpg',
            status: 'bundled',
            size: 2,
            mime: 'image/jpeg',
          }),
        ],
      }),
    )
    expect(bundle.files.map(([path]) => path)).toEqual([
      'index.html',
      'manifest.json',
      'assets/Media/diagram.png',
      'assets/Media/photo.jpg',
    ])
  })

  it('keeps tables, checkboxes, code blocks, and image captions in DOCX XML', () => {
    const xml = markdownToDocumentXml(
      'Report',
      [
        '- [x] Done',
        '',
        '| Name | Status |',
        '| --- | --- |',
        '| Roadmap | Active |',
        '',
        '```',
        'const local = true',
        '```',
        '',
        '![[Media/diagram.png|Architecture diagram]]',
      ].join('\n'),
    )

    expect(xml).toContain('<w:tbl>')
    expect(xml).toContain('Roadmap')
    expect(xml).toContain('☑ Done')
    expect(xml).toContain('CodeBlock')
    expect(xml).toContain('Image: Architecture diagram (Media/diagram.png)')
  })

  it('embeds available vault images in DOCX XML', () => {
    const xml = markdownToDocumentXml('Report', '![[Media/diagram.png|Architecture diagram]]', {
      images: [
        {
          target: 'Media/diagram.png',
          relId: 'rIdImage1',
          fileName: 'image1.png',
          ext: 'png',
          alt: 'Architecture diagram',
          width: 320,
          bytes: new Uint8Array([1, 2, 3]),
        },
      ],
    })

    expect(xml).toContain('<w:drawing>')
    expect(xml).toContain('r:embed="rIdImage1"')
    expect(xml).toContain('descr="Architecture diagram"')
    expect(xml).toContain('<wp:extent cx="3048000" cy="1714500"/>')
  })

  it('uses document-owned page setup in DOCX XML', () => {
    const markdown =
      '---\npage_size: a4\npage_margins: roomy\npage_orientation: landscape\ndocument_header: Private Draft\ndocument_footer: Local Copy\ndocument_watermark: Confidential\ndocument_page_numbers: footer-right\ndocument_columns: 2\n---\n\n# Body'
    const xml = markdownToDocumentXml('Report', markdown)

    expect(documentPageSettings(markdown)).toEqual({
      mode: 'pages',
      size: 'a4',
      margins: 'roomy',
      orientation: 'landscape',
      header: 'Private Draft',
      footer: 'Local Copy',
      watermark: 'Confidential',
      pageNumbers: 'footer-right',
      columns: 2,
    })
    expect(xml).toContain('<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>')
    expect(xml).toContain('<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"')
    expect(xml).toContain('<w:headerReference w:type="default" r:id="rIdHeader1"/>')
    expect(xml).toContain('<w:footerReference w:type="default" r:id="rIdFooter1"/>')
    expect(xml).toContain('<w:cols w:num="2" w:space="720"/>')
    expect(documentFooterXml('Local Copy', 'footer-right')).toContain('<w:jc w:val="right"/>')
    expect(documentFooterXml('Local Copy', 'footer-right')).toContain('<w:fldSimple w:instr="PAGE">')
  })

  it('uses document-owned page orientation in printable HTML', () => {
    const html = documentHtml('Report', '<p>Body</p>', false, {
      mode: 'pages',
      size: 'letter',
      margins: 'normal',
      orientation: 'landscape',
      header: 'Private Draft',
      footer: 'Page footer',
      watermark: 'Confidential',
      pageNumbers: 'footer-center',
      columns: 3,
    })

    expect(html).toContain('@page { size: Letter landscape; margin: 0.75in; }')
    expect(html).toContain('<body data-page-mode="pages">')
    expect(html).toContain('<header class="note-document-header">Private Draft</header>')
    expect(html).toContain('<footer class="note-document-footer" data-page-numbers="footer-center">')
    expect(html).toContain('<span class="note-document-footer-text">Page footer</span>')
    expect(html).toContain('<span class="note-document-page-number" data-position="footer-center">Page </span>')
    expect(html).toContain('<main data-columns="3"><p>Body</p></main>')
    expect(html).toContain('main[data-columns="3"]')
    expect(html).toContain('content: counter(page);')
    expect(html).toContain('<div class="note-document-watermark">Confidential</div>')
  })

  it('uses pageless document mode in HTML export without page chrome', () => {
    const markdown =
      '---\ndocument_page_mode: pageless\ndocument_header: Hidden Header\ndocument_footer: Hidden Footer\ndocument_watermark: Hidden\ndocument_page_numbers: footer-center\n---\n\n# Body'
    const page = documentPageSettings(markdown)
    const html = documentHtml('Report', '<p>Body</p><div class="note-page-break"></div>', false, page)

    expect(page).toMatchObject({ mode: 'pageless', header: 'Hidden Header', pageNumbers: 'footer-center' })
    expect(html).toContain('<body data-page-mode="pageless">')
    expect(html).toContain('body[data-page-mode="pageless"]')
    expect(html).toContain('body[data-page-mode="pageless"] .note-page-break')
    expect(html).not.toContain('note-document-header">Hidden Header')
    expect(html).not.toContain('<footer class="note-document-footer"')
    expect(html).not.toContain('<div class="note-document-watermark"')
    expect(html).not.toContain('<span class="note-document-page-number"')
  })

  it('exports document page breaks to HTML and DOCX', () => {
    const markdown = ['Before', '', '<!-- pagebreak -->', '', 'After'].join('\n')
    const html = markdownToSafeHtml(markdown)
    const xml = markdownToDocumentXml('Report', markdown)

    expect(html).toContain('class="note-page-break"')
    expect(xml).toContain('<w:br w:type="page"/>')
  })

  it('builds and verifies a private review package with permissions', () => {
    const pkg = buildReviewPackage(
      {
        _id: 'Projects/roadmap.md',
        type: 'note',
        title: 'Roadmap',
        content: '# Roadmap',
        folder: 'Projects',
        tags: ['strategy'],
        links: [],
        aliases: ['Plan'],
        properties: { status: 'draft' },
        created_at: 1,
        updated_at: 2,
      },
      [
        {
          id: 'comment-1',
          document_id: 'Projects/roadmap.md',
          anchor: { scope: 'document' },
          body: 'Clarify',
          status: 'open',
          created_at: 3,
          updated_at: 3,
        },
      ],
      [
        {
          id: 'suggestion-1',
          document_id: 'Projects/roadmap.md',
          anchor: { scope: 'document' },
          patch: { type: 'replace_document', content: '# Better' },
          status: 'open',
          created_at: 4,
        },
      ],
      {},
      { permission: 'comment', recipient: 'reviewer@example.test' },
    )

    expect(pkg).toEqual(
      expect.objectContaining({
        format: 'clawctrl-document-review-package',
        version: 1,
        privacy: expect.objectContaining({ remote_required: false, storage: 'local_package' }),
        share: expect.objectContaining({
          permission: 'comment',
          recipient: 'reviewer@example.test',
          allowed_actions: ['read', 'comment'],
        }),
        comments: [expect.objectContaining({ id: 'comment-1' })],
        suggestions: [expect.objectContaining({ id: 'suggestion-1' })],
      }),
    )
    expect(pkg.document).toEqual(
      expect.objectContaining({
        id: 'Projects/roadmap.md',
        markdown: '# Roadmap',
        properties: { status: 'draft' },
      }),
    )
    expect(verifyReviewPackage(pkg)).toEqual({ ok: true, errors: [] })
  })

  it('rejects review packages that require remote storage or cross-document review items', () => {
    const pkg = buildReviewPackage(
      {
        _id: 'Projects/roadmap.md',
        type: 'note',
        title: 'Roadmap',
        content: '# Roadmap',
        folder: 'Projects',
        tags: [],
        links: [],
        created_at: 1,
        updated_at: 2,
      },
      [
        {
          id: 'comment-1',
          document_id: 'Other.md',
          body: 'Wrong doc',
          status: 'open',
          created_at: 3,
          updated_at: 3,
        },
      ],
      [],
    ) as Record<string, unknown>
    pkg.privacy = { remote_required: true, storage: 'cloud_link' }

    expect(verifyReviewPackage(pkg).errors).toEqual(
      expect.arrayContaining([
        'Review package must not require remote storage',
        'Review package storage must be local_package',
        'Review comment targets a different document: comment-1',
      ]),
    )
  })
})
