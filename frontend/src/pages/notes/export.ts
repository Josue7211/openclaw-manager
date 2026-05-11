import { marked } from 'marked'
import { sanitizeHtml } from '@/lib/sanitize'
import type { VaultNote } from './types'

marked.use({ gfm: true, breaks: true })

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export function safeExportName(title: string, extension: string): string {
  const stem = title.replace(/[\\/:*?"<>|]/g, '').trim() || 'Untitled'
  return `${stem}.${extension}`
}

export function markdownToSafeHtml(markdown: string): string {
  return sanitizeHtml(marked.parse(enhanceObsidianMarkdown(splitFrontmatter(markdown).body)) as string)
}

export function downloadMarkdown(note: VaultNote) {
  downloadBlob(
    new Blob([note.content], { type: 'text/markdown;charset=utf-8' }),
    safeExportName(note.title, 'md'),
  )
}

export function downloadHtml(note: VaultNote) {
  const html = markdownToSafeHtml(note.content)
  downloadBlob(
    new Blob([documentHtml(note.title || 'Untitled', html)], { type: 'text/html;charset=utf-8' }),
    safeExportName(note.title, 'html'),
  )
}

export function printNotePdf(note: VaultNote) {
  const html = markdownToSafeHtml(note.content)
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1100')
  if (!printWindow) return

  printWindow.document.write(documentHtml(note.title || 'Untitled', html, true))
  printWindow.document.close()
}

export function splitFrontmatter(markdown: string): { frontmatter: string; body: string } {
  if (!markdown.startsWith('---\n')) return { frontmatter: '', body: markdown }
  const end = markdown.indexOf('\n---', 4)
  if (end === -1) return { frontmatter: '', body: markdown }
  const closeEnd = markdown.indexOf('\n', end + 4)
  let boundaryEnd = closeEnd === -1 ? markdown.length : closeEnd + 1
  if (markdown[boundaryEnd] === '\n') boundaryEnd += 1
  return {
    frontmatter: markdown.slice(0, boundaryEnd),
    body: markdown.slice(boundaryEnd),
  }
}

export function replaceMarkdownBody(existingMarkdown: string, nextBody: string): string {
  const { frontmatter } = splitFrontmatter(existingMarkdown)
  return `${frontmatter}${nextBody}`
}

export function setFrontmatterProperty(markdown: string, key: string, rawValue: string): string {
  const cleanKey = key.trim().replace(/[^\w-]/g, '')
  if (!cleanKey) return markdown

  const value = rawValue.trim()
  const { frontmatter, body } = splitFrontmatter(markdown)
  const properties = parseFrontmatterLines(frontmatter)

  if (value) {
    properties.set(cleanKey, value)
  } else {
    properties.delete(cleanKey)
  }

  const nextFrontmatter = serializeFrontmatter(properties)
  return `${nextFrontmatter}${body}`
}

function parseFrontmatterLines(frontmatter: string): Map<string, string> {
  const properties = new Map<string, string>()
  if (!frontmatter) return properties

  const lines = frontmatter.replace(/^---\n/, '').replace(/\n---\n*$/, '').split('\n')
  let currentKey: string | null = null
  for (const line of lines) {
    const listMatch = line.match(/^\s*-\s+(.+)$/)
    if (currentKey && listMatch) {
      const previous = properties.get(currentKey)
      const nextItem = listMatch[1].trim()
      properties.set(currentKey, previous ? `${previous}, ${nextItem}` : nextItem)
      continue
    }

    const pair = line.match(/^([\w-]+):\s*(.*)$/)
    if (!pair) {
      currentKey = null
      continue
    }
    currentKey = pair[1]
    const value = pair[2].trim()
    properties.set(pair[1], value.replace(/^\[(.*)\]$/, '$1'))
  }
  return properties
}

function serializeFrontmatter(properties: Map<string, string>): string {
  if (properties.size === 0) return ''
  const lines = ['---']
  for (const [key, value] of properties) {
    const items = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    if ((key === 'tags' || key === 'aliases') && items.length > 1) {
      lines.push(`${key}:`)
      for (const item of items) lines.push(`  - ${item}`)
    } else {
      lines.push(`${key}: ${value}`)
    }
  }
  lines.push('---', '')
  return `${lines.join('\n')}\n`
}

function documentHtml(title: string, bodyHtml: string, autoPrint = false): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 0.75in; }
    body {
      color: #111827;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11pt;
      line-height: 1.55;
    }
    h1 { font-size: 26pt; line-height: 1.15; margin: 0 0 18pt; }
    h2 { font-size: 18pt; line-height: 1.25; margin: 22pt 0 9pt; }
    h3 { font-size: 14pt; line-height: 1.3; margin: 18pt 0 7pt; }
    p { margin: 0 0 10pt; }
    ul, ol { margin: 0 0 10pt 24pt; padding: 0; }
    blockquote { border-left: 3px solid #d1d5db; color: #4b5563; margin: 12pt 0; padding-left: 12pt; }
    code { background: #f3f4f6; border-radius: 3px; font-family: "SF Mono", Consolas, monospace; padding: 1pt 3pt; }
    pre { background: #f3f4f6; border-radius: 6pt; padding: 10pt; white-space: pre-wrap; }
    table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
    th, td { border: 1px solid #d1d5db; padding: 6pt; text-align: left; }
    img { max-width: 100%; }
    .note-wikilink, .note-tag {
      border-radius: 999px;
      background: #eef2ff;
      color: #3730a3;
      padding: 1pt 5pt;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <main>${bodyHtml}</main>
  ${autoPrint ? `<script>
    window.addEventListener('load', () => {
      setTimeout(() => { window.print(); }, 120);
    });
  </script>` : ''}
</body>
</html>`
}

export async function downloadDocx(note: VaultNote) {
  const zip = createStoredZip([
    ['[Content_Types].xml', contentTypesXml()],
    ['_rels/.rels', packageRelsXml()],
    ['word/_rels/document.xml.rels', documentRelsXml()],
    ['word/document.xml', markdownToDocumentXml(note.title || 'Untitled', note.content)],
    ['word/styles.xml', stylesXml()],
    ['docProps/core.xml', corePropsXml(note.title || 'Untitled')],
    ['docProps/app.xml', appPropsXml()],
  ])
  const buffer = new ArrayBuffer(zip.byteLength)
  new Uint8Array(buffer).set(zip)
  downloadBlob(new Blob([buffer], { type: MIME_DOCX }), safeExportName(note.title, 'docx'))
}

function markdownToDocumentXml(title: string, markdown: string): string {
  const { body: bodyMarkdown } = splitFrontmatter(markdown)
  const body = [
    paragraphXml(title, 'Title'),
    ...bodyMarkdown
      .replace(/\r\n/g, '\n')
      .split('\n')
      .flatMap((line) => markdownLineToXml(line)),
  ].join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`
}

function enhanceObsidianMarkdown(markdown: string): string {
  return renderCallouts(markdown)
    .replace(/!\[\[([^\]|]+\.(?:png|jpe?g|gif|webp|svg|bmp))(?:\|([^\]]+))?\]\]/gi, (_match, rawTarget: string, rawLabel: string = '') => {
      const cleanTarget = rawTarget.trim()
      const cleanLabel = rawLabel.trim() || cleanTarget
      return `<img src="/api/vault/media?id=${encodeURIComponent(cleanTarget)}" alt="${escapeHtml(cleanLabel)}" title="${escapeHtml(cleanTarget)}">`
    })
    .replace(/!\[\[([^\]]+)\]\]/g, (_match, rawTarget: string) => `[[${rawTarget}]]`)
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_match, target: string, label: string) => wikilinkHtml(target, label))
    .replace(/\[\[([^\]]+)\]\]/g, (_match, target: string) => wikilinkHtml(target, target))
    .replace(/(^|[\s(])#([A-Za-z][\w/-]*)/g, (match: string, prefix: string, tag: string, offset: number, source: string) => {
      const previous = source[offset - 1]
      const lastOpen = source.lastIndexOf('<', offset)
      const lastClose = source.lastIndexOf('>', offset)
      if (previous === ':' || lastOpen > lastClose) return match
      return `${prefix}<span class="note-tag">#${escapeHtml(tag)}</span>`
    })
}

function renderCallouts(markdown: string): string {
  return markdown.replace(
    /^>\s*\[!(\w+)\]\s*(.*?)\n((?:>\s?.*(?:\n|$))*)/gm,
    (_match, type: string, title: string, body: string) => {
      const cleanType = type.toLowerCase()
      const cleanTitle = title.trim() || cleanType
      const cleanBody = body
        .split('\n')
        .map((line) => line.replace(/^>\s?/, ''))
        .join('\n')
        .trim()
      const parsedBody = cleanBody ? marked.parse(cleanBody) as string : ''
      return `<div class="note-callout note-callout-${escapeHtml(cleanType)}"><div class="note-callout-title">${escapeHtml(cleanTitle)}</div><div class="note-callout-body">${parsedBody}</div></div>\n`
    },
  )
}

function wikilinkHtml(target: string, label: string): string {
  const cleanTarget = target.trim()
  const cleanLabel = label.trim() || cleanTarget
  return `<a class="note-wikilink" href="#note:${encodeURIComponent(cleanTarget)}" title="${escapeHtml(cleanTarget)}">${escapeHtml(cleanLabel)}</a>`
}

function markdownLineToXml(line: string): string[] {
  if (!line.trim()) return [paragraphXml('', 'Normal')]
  const heading = line.match(/^(#{1,6})\s+(.+)$/)
  if (heading) {
    const style = (['Heading1', 'Heading2', 'Heading3'] as const)[Math.min(heading[1].length, 3) - 1]
    return [paragraphXml(cleanInline(heading[2]), style)]
  }
  const bullet = line.match(/^\s*[-*]\s+(.+)$/)
  if (bullet) return [paragraphXml(`• ${cleanInline(bullet[1])}`, 'Normal')]
  const checked = line.match(/^\s*[-*]\s+\[(x| )\]\s+(.+)$/i)
  if (checked) return [paragraphXml(`${checked[1].toLowerCase() === 'x' ? '☑' : '☐'} ${cleanInline(checked[2])}`, 'Normal')]
  const numbered = line.match(/^\s*\d+\.\s+(.+)$/)
  if (numbered) return [paragraphXml(cleanInline(numbered[1]), 'Normal')]
  const quote = line.match(/^\s*>\s+(.+)$/)
  if (quote) return [paragraphXml(cleanInline(quote[1]), 'Quote')]
  const hr = line.match(/^\s*---+\s*$/)
  if (hr) return [paragraphXml('────────────', 'Normal')]
  return [paragraphXml(cleanInline(line), 'Normal')]
}

function cleanInline(value: string): string {
  return value
    .replace(/!\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

function paragraphXml(text: string, style: 'Title' | 'Heading1' | 'Heading2' | 'Heading3' | 'Quote' | 'Normal'): string {
  const styleXml = style === 'Normal' ? '' : `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`
  const runs = text
    ? text.split('\n').map((part, index) => `${index > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeXml(part)}</w:t>`).join('')
    : ''
  return `<w:p>${styleXml}<w:r>${runs}</w:r></w:p>`
}

function contentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`
}

function packageRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
}

function documentRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:sz w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:after="240"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="52"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="320" w:after="160"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="34"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="260" w:after="140"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="220" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Quote">
    <w:name w:val="Quote"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:ind w:left="360"/><w:spacing w:before="120" w:after="120"/></w:pPr>
    <w:rPr><w:i/><w:color w:val="666666"/></w:rPr>
  </w:style>
</w:styles>`
}

function corePropsXml(title: string): string {
  const now = new Date().toISOString()
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>ClawControl Notes</dc:creator>
  <cp:lastModifiedBy>ClawControl Notes</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`
}

function appPropsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>ClawControl</Application>
</Properties>`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function createStoredZip(files: Array<[string, string]>): Uint8Array {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  files.forEach(([name, content]) => {
    const nameBytes = encoder.encode(name)
    const data = encoder.encode(content)
    const crc = crc32(data)
    const local = new Uint8Array(30 + nameBytes.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0, true)
    localView.setUint16(8, 0, true)
    localView.setUint16(10, 0, true)
    localView.setUint16(12, 0, true)
    localView.setUint32(14, crc, true)
    localView.setUint32(18, data.length, true)
    localView.setUint32(22, data.length, true)
    localView.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    chunks.push(local, data)

    const entry = new Uint8Array(46 + nameBytes.length)
    const entryView = new DataView(entry.buffer)
    entryView.setUint32(0, 0x02014b50, true)
    entryView.setUint16(4, 20, true)
    entryView.setUint16(6, 20, true)
    entryView.setUint16(8, 0, true)
    entryView.setUint16(10, 0, true)
    entryView.setUint16(12, 0, true)
    entryView.setUint16(14, 0, true)
    entryView.setUint32(16, crc, true)
    entryView.setUint32(20, data.length, true)
    entryView.setUint32(24, data.length, true)
    entryView.setUint16(28, nameBytes.length, true)
    entryView.setUint32(42, offset, true)
    entry.set(nameBytes, 46)
    central.push(entry)
    offset += local.length + data.length
  })

  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, files.length, true)
  endView.setUint16(10, files.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)

  const total = offset + centralSize + end.length
  const out = new Uint8Array(total)
  let cursor = 0
  for (const chunk of [...chunks, ...central, end]) {
    out.set(chunk, cursor)
    cursor += chunk.length
  }
  return out
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
