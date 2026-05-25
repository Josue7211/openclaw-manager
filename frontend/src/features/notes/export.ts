import { marked } from 'marked'
import { sanitizeHtml } from '@/lib/sanitize'
import type { VaultNote } from './types'
import type { VaultComment, VaultSuggestion } from '@/lib/vault'
import { renderDataviewBlocks } from './dataview'
import { renderVaultPluginBlocks } from './vaultPlugins'

marked.use({ gfm: true, breaks: true })

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const PAGE_BREAK_MARKDOWN = '<!-- pagebreak -->'

export type DocumentPageSize = 'letter' | 'a4'
export type DocumentMarginPreset = 'compact' | 'normal' | 'roomy'
export type DocumentPageOrientation = 'portrait' | 'landscape'
export type DocumentPageNumbers = 'none' | 'footer-center' | 'footer-right'
export type DocumentPageColumns = 1 | 2 | 3
export type DocumentPageMode = 'pages' | 'pageless'

export interface DocumentPageSettings {
  mode: DocumentPageMode
  size: DocumentPageSize
  margins: DocumentMarginPreset
  orientation: DocumentPageOrientation
  header: string
  footer: string
  watermark: string
  pageNumbers: DocumentPageNumbers
  columns: DocumentPageColumns
}

export interface DocxImage {
  target: string
  relId: string
  fileName: string
  ext: string
  alt: string
  width?: number
  bytes: Uint8Array
}

export type ReviewPackagePermission = 'view' | 'comment' | 'suggest'

export interface ReviewPackageOptions {
  permission?: ReviewPackagePermission
  recipient?: string
}

export interface PublishedNotesSiteOptions {
  entryId?: string
  title?: string
  attachments?: PublishedNotesAttachment[]
}

export type PublishedNotesAttachmentStatus = 'bundled' | 'missing'

export interface PublishedNotesAttachment {
  id: string
  outputPath: string
  status: PublishedNotesAttachmentStatus
  size: number
  mime: string
}

export interface PublishedNotesSiteManifest {
  format: 'clawcontrol-published-notes-site'
  version: 1
  title: string
  entry_id: string | null
  generated_at: string
  notes: Array<{
    id: string
    title: string
    folder: string
    updated_at: number
  }>
  attachments: PublishedNotesAttachment[]
}

export interface PublishedNotesSiteBundle {
  html: string
  manifest: PublishedNotesSiteManifest
  files: Array<readonly [string, string | Uint8Array]>
}

export interface ReviewPackageVerification {
  ok: boolean
  errors: string[]
}

export function safeExportName(title: string, extension: string): string {
  const stem = title.replace(/[\\/:*?"<>|]/g, '').trim() || 'Untitled'
  return `${stem}.${extension}`
}

export function markdownToSafeHtml(
  markdown: string,
  context: { notes?: VaultNote[]; currentId?: string } = {},
): string {
  const pluginExpanded = renderVaultPluginBlocks(
    splitFrontmatter(markdown).body,
    context.notes ?? [],
    context.currentId,
  )
  const expanded = renderDataviewBlocks(pluginExpanded, context.notes ?? [], context.currentId)
  return sanitizeHtml(marked.parse(enhanceObsidianMarkdown(expanded)) as string)
}

export function downloadMarkdown(note: VaultNote) {
  downloadBlob(new Blob([note.content], { type: 'text/markdown;charset=utf-8' }), safeExportName(note.title, 'md'))
}

export function buildReviewPackage(
  note: VaultNote,
  comments: VaultComment[],
  suggestions: VaultSuggestion[],
  context: { notes?: VaultNote[] } = {},
  options: ReviewPackageOptions = {},
) {
  const permission = options.permission ?? 'suggest'
  return {
    format: 'clawcontrol-document-review-package',
    version: 1,
    exported_at: new Date().toISOString(),
    privacy: {
      remote_required: false,
      storage: 'local_package',
      cloud_owner: null,
    },
    share: {
      mode: 'offline_review',
      permission,
      recipient: options.recipient?.trim() || null,
      allowed_actions: reviewPackageActions(permission),
    },
    document: {
      id: note._id,
      title: note.title,
      folder: note.folder,
      markdown: note.content,
      html: markdownToSafeHtml(note.content, { notes: context.notes, currentId: note._id }),
      tags: note.tags,
      aliases: note.aliases ?? [],
      properties: note.properties ?? {},
      updated_at: note.updated_at,
    },
    comments,
    suggestions,
  }
}

export function verifyReviewPackage(input: unknown): ReviewPackageVerification {
  const errors: string[] = []
  if (!input || typeof input !== 'object') {
    return { ok: false, errors: ['Review package is not an object'] }
  }

  const pkg = input as Record<string, unknown>
  if (pkg.format !== 'clawcontrol-document-review-package') errors.push('Review package format is not supported')
  if (pkg.version !== 1) errors.push('Review package version is not supported')

  const privacy = objectValue(pkg.privacy)
  if (privacy?.remote_required !== false) errors.push('Review package must not require remote storage')
  if (privacy?.storage !== 'local_package') errors.push('Review package storage must be local_package')

  const share = objectValue(pkg.share)
  const permission = share?.permission
  if (!isReviewPackagePermission(permission)) errors.push('Review package permission is not supported')

  const document = objectValue(pkg.document)
  const documentId = typeof document?.id === 'string' ? document.id : ''
  if (!documentId) errors.push('Review package document id is missing')
  if (typeof document?.markdown !== 'string') errors.push('Review package document markdown is missing')
  if (typeof document?.html !== 'string') errors.push('Review package document HTML is missing')

  const comments = Array.isArray(pkg.comments) ? pkg.comments : null
  const suggestions = Array.isArray(pkg.suggestions) ? pkg.suggestions : null
  if (!comments) errors.push('Review package comments must be an array')
  if (!suggestions) errors.push('Review package suggestions must be an array')
  for (const comment of comments ?? []) {
    const item = objectValue(comment)
    if (item?.document_id !== documentId)
      errors.push(`Review comment targets a different document: ${String(item?.id ?? '')}`)
  }
  for (const suggestion of suggestions ?? []) {
    const item = objectValue(suggestion)
    if (item?.document_id !== documentId) {
      errors.push(`Review suggestion targets a different document: ${String(item?.id ?? '')}`)
    }
  }

  return { ok: errors.length === 0, errors }
}

export function downloadReviewPackage(
  note: VaultNote,
  comments: VaultComment[],
  suggestions: VaultSuggestion[],
  context: { notes?: VaultNote[] } = {},
  options: ReviewPackageOptions = {},
) {
  downloadBlob(
    new Blob([JSON.stringify(buildReviewPackage(note, comments, suggestions, context, options), null, 2)], {
      type: 'application/json;charset=utf-8',
    }),
    safeExportName(`${note.title || 'Untitled'} Private Share`, 'json'),
  )
}

function reviewPackageActions(permission: ReviewPackagePermission): string[] {
  if (permission === 'view') return ['read']
  if (permission === 'comment') return ['read', 'comment']
  return ['read', 'comment', 'suggest']
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function isReviewPackagePermission(value: unknown): value is ReviewPackagePermission {
  return value === 'view' || value === 'comment' || value === 'suggest'
}

export function downloadHtml(note: VaultNote, context: { notes?: VaultNote[] } = {}) {
  const html = markdownToSafeHtml(note.content, { notes: context.notes, currentId: note._id })
  downloadBlob(
    new Blob([documentHtml(note.title || 'Untitled', html, false, documentPageSettings(note.content))], {
      type: 'text/html;charset=utf-8',
    }),
    safeExportName(note.title, 'html'),
  )
}

export function buildPublishedNotesSite(notes: VaultNote[], options: PublishedNotesSiteOptions = {}): string {
  const publishable = notes
    .filter(note => note.type === 'note')
    .slice()
    .sort((a, b) => a.folder.localeCompare(b.folder) || a.title.localeCompare(b.title))
  const entry = publishable.find(note => note._id === options.entryId) ?? publishable[0] ?? null
  const title = options.title?.trim() || entry?.title || 'ClawControl Notes'
  const attachmentMap = new Map((options.attachments ?? []).map(attachment => [attachment.id, attachment]))
  const navItems = publishable
    .map(note => {
      const active = entry?._id === note._id ? ' aria-current="page"' : ''
      const folder = note.folder ? `<span>${escapeHtml(note.folder)}</span>` : ''
      return `<li><a href="#${publishedNoteAnchor(note._id)}"${active}>${escapeHtml(note.title || 'Untitled')}${folder}</a></li>`
    })
    .join('')
  const sections = publishable
    .map(note => {
      const html = rewritePublishedAttachmentLinks(
        rewritePublishedNoteLinks(markdownToSafeHtml(note.content, { notes: publishable, currentId: note._id }), publishable),
        attachmentMap,
      )
      const updated = Number.isFinite(note.updated_at) && note.updated_at > 0
        ? new Date(note.updated_at).toISOString()
        : ''
      const folder = note.folder ? `<span>${escapeHtml(note.folder)}</span>` : ''
      const updatedHtml = updated ? `<time datetime="${updated}">${updated.slice(0, 10)}</time>` : ''
      return `<article id="${publishedNoteAnchor(note._id)}">
  <header>
    <p>${folder}${updatedHtml}</p>
    <h2>${escapeHtml(note.title || 'Untitled')}</h2>
  </header>
  <div class="note-body">${html}</div>
</article>`
    })
    .join('\n')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="generator" content="ClawControl Notes" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; --ink: #111827; --muted: #6b7280; --line: #e5e7eb; --panel: #f9fafb; --accent: #2563eb; }
    * { box-sizing: border-box; }
    body { margin: 0; color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; background: #fff; }
    .site { display: grid; grid-template-columns: minmax(220px, 280px) minmax(0, 1fr); min-height: 100vh; }
    nav { border-right: 1px solid var(--line); background: var(--panel); padding: 24px 18px; position: sticky; top: 0; height: 100vh; overflow: auto; }
    nav h1 { font-size: 18px; line-height: 1.2; margin: 0 0 18px; }
    nav ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
    nav a { display: grid; gap: 1px; padding: 7px 9px; border-radius: 6px; color: var(--ink); text-decoration: none; }
    nav a[aria-current="page"], nav a:hover { background: #e0ecff; color: #1d4ed8; }
    nav span, article header p { color: var(--muted); font-size: 12px; }
    main { width: min(920px, 100%); padding: 32px clamp(18px, 4vw, 56px) 80px; }
    article { border-bottom: 1px solid var(--line); padding: 0 0 42px; margin: 0 0 42px; scroll-margin-top: 24px; }
    article:last-child { border-bottom: 0; }
    article h2 { font-size: clamp(28px, 5vw, 44px); line-height: 1.12; margin: 0 0 22px; }
    article header p { display: flex; gap: 12px; margin: 0 0 8px; }
    .note-body h1 { font-size: 30px; line-height: 1.18; }
    .note-body h2 { font-size: 24px; line-height: 1.25; margin-top: 30px; }
    .note-body img { max-width: 100%; }
    .note-body table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    .note-body th, .note-body td { border: 1px solid var(--line); padding: 8px; text-align: left; }
    .note-callout { --callout: var(--accent); margin: 16px 0; border: 1px solid color-mix(in srgb, var(--callout) 22%, var(--line)); border-left: 4px solid var(--callout); border-radius: 6px; background: color-mix(in srgb, var(--callout) 8%, white); padding: 10px 12px; }
    .note-callout-title { display: block; width: 100%; margin: 0 0 6px; border: 0; background: transparent; color: color-mix(in srgb, var(--callout) 72%, var(--ink)); font: inherit; font-size: 13px; font-weight: 700; text-align: left; }
    button.note-callout-title { cursor: pointer; padding: 0; }
    .note-callout-body > :first-child { margin-top: 0; }
    .note-callout-body > :last-child { margin-bottom: 0; }
    .note-callout-fold-collapsed .note-callout-body { display: none; }
    .note-callout-fold-collapsed .note-callout-title::before { content: "> "; }
    .note-callout-fold-expanded .note-callout-title::before { content: "v "; }
    .note-callout-abstract, .note-callout-summary, .note-callout-tldr { --callout: #0891b2; }
    .note-callout-info, .note-callout-todo { --callout: #2563eb; }
    .note-callout-tip, .note-callout-hint, .note-callout-important { --callout: #16a34a; }
    .note-callout-warning, .note-callout-caution, .note-callout-attention { --callout: #d97706; }
    .note-callout-question, .note-callout-help, .note-callout-faq { --callout: #7c3aed; }
    .note-callout-danger, .note-callout-error { --callout: #dc2626; }
    .note-callout-failure, .note-callout-fail, .note-callout-missing { --callout: #be123c; }
    .note-callout-bug { --callout: #e11d48; }
    .note-callout-success, .note-callout-check, .note-callout-done { --callout: #15803d; }
    .note-callout-example { --callout: #9333ea; }
    .note-callout-quote, .note-callout-cite { --callout: #64748b; }
    .note-wikilink, .note-tag { border-radius: 999px; background: #eef2ff; color: #3730a3; padding: 1px 6px; text-decoration: none; }
    .missing-attachment { border-radius: 4px; background: #fff7ed; color: #9a3412; padding: 2px 6px; }
    @media (max-width: 760px) {
      .site { display: block; }
      nav { position: relative; height: auto; border-right: 0; border-bottom: 1px solid var(--line); }
      main { padding-top: 24px; }
    }
  </style>
</head>
<body>
  <div class="site">
    <nav aria-label="Published notes">
      <h1>${escapeHtml(title)}</h1>
      <ul>${navItems}</ul>
    </nav>
    <main>${sections || '<p>No notes selected for publishing.</p>'}</main>
  </div>
  <script>
    document.addEventListener('click', function(event) {
      var title = event.target.closest && event.target.closest('.note-callout-title');
      if (!title || title.tagName !== 'BUTTON') return;
      var callout = title.closest('.note-callout');
      if (!callout) return;
      var collapsed = callout.classList.contains('note-callout-fold-collapsed');
      callout.classList.toggle('note-callout-fold-collapsed', !collapsed);
      callout.classList.toggle('note-callout-fold-expanded', collapsed);
      title.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
    });
  </script>
</body>
</html>`
}

export async function buildPublishedNotesSiteBundle(
  notes: VaultNote[],
  options: PublishedNotesSiteOptions = {},
): Promise<PublishedNotesSiteBundle> {
  const publishable = notes
    .filter(note => note.type === 'note')
    .slice()
    .sort((a, b) => a.folder.localeCompare(b.folder) || a.title.localeCompare(b.title))
  const entry = publishable.find(note => note._id === options.entryId) ?? publishable[0] ?? null
  const title = options.title?.trim() || entry?.title || 'ClawControl Notes'
  const attachmentFiles = await collectPublishedAttachmentFiles(publishable)
  const attachments = attachmentFiles.map(({ bytes: _bytes, ...attachment }) => attachment)
  const html = buildPublishedNotesSite(notes, { ...options, attachments })
  const manifest: PublishedNotesSiteManifest = {
    format: 'clawcontrol-published-notes-site',
    version: 1,
    title,
    entry_id: entry?._id ?? null,
    generated_at: new Date().toISOString(),
    notes: publishable.map(note => ({
      id: note._id,
      title: note.title,
      folder: note.folder,
      updated_at: note.updated_at,
    })),
    attachments,
  }
  const files: Array<readonly [string, string | Uint8Array]> = [
    ['index.html', html],
    ['manifest.json', JSON.stringify(manifest, null, 2)],
    ...attachmentFiles
      .filter(file => file.status === 'bundled' && file.bytes)
      .map(file => [file.outputPath, file.bytes as Uint8Array] as const),
  ]
  return { html, manifest, files }
}

export async function downloadPublishedNotesSite(notes: VaultNote[], options: PublishedNotesSiteOptions = {}) {
  const bundle = await buildPublishedNotesSiteBundle(notes, options)
  const zip = createStoredZip(bundle.files)
  const buffer = new ArrayBuffer(zip.byteLength)
  new Uint8Array(buffer).set(zip)
  downloadBlob(
    new Blob([buffer], { type: 'application/zip' }),
    safeExportName(options.title || 'ClawControl Notes Site', 'zip'),
  )
}

export function printNotePdf(note: VaultNote, context: { notes?: VaultNote[] } = {}) {
  const html = markdownToSafeHtml(note.content, { notes: context.notes, currentId: note._id })
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1100')
  if (!printWindow) return

  printWindow.document.write(documentHtml(note.title || 'Untitled', html, true, documentPageSettings(note.content)))
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

export function documentPageSettings(markdown: string): DocumentPageSettings {
  const properties = parseFrontmatterLines(splitFrontmatter(markdown).frontmatter)
  return {
    mode: normalizePageMode(properties.get('document_page_mode') || properties.get('page_mode') || properties.get('page-mode')),
    size: normalizePageSize(properties.get('page_size') || properties.get('page-size')),
    margins: normalizeMargins(properties.get('page_margins') || properties.get('page-margins')),
    orientation: normalizeOrientation(properties.get('page_orientation') || properties.get('page-orientation')),
    header: normalizePageText(
      properties.get('document_header') || properties.get('page_header') || properties.get('header'),
    ),
    footer: normalizePageText(
      properties.get('document_footer') || properties.get('page_footer') || properties.get('footer'),
    ),
    watermark: normalizePageText(
      properties.get('document_watermark') || properties.get('page_watermark') || properties.get('watermark'),
    ),
    pageNumbers: normalizePageNumbers(
      properties.get('document_page_numbers') || properties.get('page_numbers') || properties.get('page-number'),
    ),
    columns: normalizePageColumns(
      properties.get('document_columns') || properties.get('page_columns') || properties.get('columns'),
    ),
  }
}

function parseFrontmatterLines(frontmatter: string): Map<string, string> {
  const properties = new Map<string, string>()
  if (!frontmatter) return properties

  const lines = frontmatter
    .replace(/^---\n/, '')
    .replace(/\n---\n*$/, '')
    .split('\n')
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
      .map(item => item.trim())
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

function defaultPageSettings(): DocumentPageSettings {
  return {
    mode: 'pages',
    size: 'letter',
    margins: 'normal',
    orientation: 'portrait',
    header: '',
    footer: '',
    watermark: '',
    pageNumbers: 'none',
    columns: 1,
  }
}

function normalizePageMode(value: string | undefined): DocumentPageMode {
  const clean = value?.trim().toLowerCase()
  return clean === 'pageless' || clean === 'continuous' ? 'pageless' : 'pages'
}

function normalizePageSize(value: string | undefined): DocumentPageSize {
  return value?.trim().toLowerCase() === 'a4' ? 'a4' : 'letter'
}

function normalizeMargins(value: string | undefined): DocumentMarginPreset {
  const clean = value?.trim().toLowerCase()
  return clean === 'compact' || clean === 'roomy' ? clean : 'normal'
}

function normalizeOrientation(value: string | undefined): DocumentPageOrientation {
  return value?.trim().toLowerCase() === 'landscape' ? 'landscape' : 'portrait'
}

function normalizePageText(value: string | undefined): string {
  return (
    value
      ?.trim()
      .replace(/^["']|["']$/g, '')
      .slice(0, 240) || ''
  )
}

function normalizePageNumbers(value: string | undefined): DocumentPageNumbers {
  const clean = value?.trim().toLowerCase().replace(/_/g, '-')
  if (clean === 'footer-center' || clean === 'center' || clean === 'bottom-center') return 'footer-center'
  if (clean === 'footer-right' || clean === 'right' || clean === 'bottom-right') return 'footer-right'
  return 'none'
}

function normalizePageColumns(value: string | undefined): DocumentPageColumns {
  const parsed = Number(value?.trim())
  return parsed === 2 || parsed === 3 ? parsed : 1
}

function publishedNoteAnchor(id: string): string {
  return `note-${encodeURIComponent(id).replace(/%/g, '')}`
}

function rewritePublishedNoteLinks(html: string, notes: VaultNote[]): string {
  const anchorByTarget = new Map<string, string>()
  for (const note of notes) {
    const anchor = publishedNoteAnchor(note._id)
    anchorByTarget.set(note.title.toLowerCase(), anchor)
    anchorByTarget.set(note._id.toLowerCase(), anchor)
    for (const alias of note.aliases ?? []) anchorByTarget.set(alias.toLowerCase(), anchor)
  }
  return html.replace(/href="#note:([^"]+)"/g, (match, encodedTarget: string) => {
    const target = decodeURIComponent(encodedTarget).split('#')[0].trim().toLowerCase()
    const anchor = anchorByTarget.get(target)
    return anchor ? `href="#${anchor}"` : match
  })
}

function rewritePublishedAttachmentLinks(html: string, attachments: Map<string, PublishedNotesAttachment>): string {
  const withVaultMedia = html.replace(
    /<img\b([^>]*?)\bsrc="\/api\/vault\/local\/media\?id=([^"]+)"([^>]*)>/g,
    (match, before: string, encodedTarget: string, after: string) => {
      const target = decodeURIComponent(encodedTarget)
      const attachment = attachments.get(normalizePublishedAttachmentId(target))
      if (!attachment) return match
      if (attachment.status === 'bundled') {
        return `<img${before}src="${escapeHtml(attachment.outputPath)}"${after}>`
      }
      return `<span class="missing-attachment" role="note">Missing attachment: ${escapeHtml(target)}</span>`
    },
  )
  return withVaultMedia.replace(/<img\b([^>]*?)\bsrc="([^"]+)"([^>]*)>/g, (match, before: string, src: string, after: string) => {
    if (/^(?:https?:|data:|blob:|#|assets\/|\/)/i.test(src)) return match
    const target = normalizePublishedAttachmentId(decodeURIComponent(src))
    const attachment = attachments.get(target)
    if (!attachment) return match
    if (attachment.status === 'bundled') {
      return `<img${before}src="${escapeHtml(attachment.outputPath)}"${after}>`
    }
    return `<span class="missing-attachment" role="note">Missing attachment: ${escapeHtml(target)}</span>`
  })
}

async function collectPublishedAttachmentFiles(
  notes: VaultNote[],
): Promise<Array<PublishedNotesAttachment & { bytes?: Uint8Array }>> {
  const targets = new Map<string, { id: string; outputPath: string }>()
  const usedPaths = new Set<string>()
  for (const note of notes) {
    for (const target of collectPublishedAttachmentTargets(note.content)) {
      const id = normalizePublishedAttachmentId(target)
      if (!id || targets.has(id)) continue
      const outputPath = uniquePublishedAttachmentPath(id, usedPaths)
      targets.set(id, { id, outputPath })
    }
  }

  const files: Array<PublishedNotesAttachment & { bytes?: Uint8Array }> = []
  for (const target of targets.values()) {
    try {
      const res = await fetch(`/api/vault/local/media?id=${encodeURIComponent(target.id)}`)
      if (!res.ok) {
        files.push({ ...target, status: 'missing', size: 0, mime: '' })
        continue
      }
      const bytes = new Uint8Array(await res.arrayBuffer())
      files.push({
        ...target,
        status: 'bundled',
        size: bytes.byteLength,
        mime: res.headers.get('content-type') || imageContentType(imageExt(target.id)),
        bytes,
      })
    } catch {
      files.push({ ...target, status: 'missing', size: 0, mime: '' })
    }
  }
  return files
}

function collectPublishedAttachmentTargets(markdown: string): string[] {
  const targets = [
    ...[...markdown.matchAll(/!\[\[([^\]|]+\.(?:png|jpe?g|gif|webp|svg|bmp))(?:\|[^\]]+)?\]\]/gi)].map(match => match[1]),
    ...[...markdown.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)].map(match => match[1]),
  ]
  return targets
    .map(target => target.trim().replace(/^<|>$/g, '').split(/\s+["']/)[0])
    .filter(target => Boolean(target) && !/^(?:https?:|data:|blob:|\/)/i.test(target))
}

function normalizePublishedAttachmentId(target: string): string {
  return target
    .trim()
    .replace(/^\.\/+/, '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
}

function uniquePublishedAttachmentPath(target: string, usedPaths: Set<string>): string {
  const parts = normalizePublishedAttachmentId(target)
    .split('/')
    .map(part => part.trim().replace(/[^A-Za-z0-9._ -]/g, '-').replace(/\s+/g, '-'))
    .filter(part => part && part !== '.' && part !== '..')
  const fallback = `attachment-${usedPaths.size + 1}.${imageExt(target)}`
  const cleanPath = parts.length ? parts.join('/') : fallback
  const ext = cleanPath.includes('.') ? cleanPath.split('.').pop() || imageExt(target) : imageExt(target)
  const stem = cleanPath.endsWith(`.${ext}`) ? cleanPath.slice(0, -(ext.length + 1)) : cleanPath
  let candidate = `assets/${cleanPath}`
  let index = 2
  while (usedPaths.has(candidate)) {
    candidate = `assets/${stem}-${index}.${ext}`
    index += 1
  }
  usedPaths.add(candidate)
  return candidate
}

export function documentHtml(title: string, bodyHtml: string, autoPrint = false, page = defaultPageSettings()): string {
  const pageSize = `${page.size === 'a4' ? 'A4' : 'Letter'}${page.orientation === 'landscape' ? ' landscape' : ''}`
  const margin = page.margins === 'compact' ? '0.5in' : page.margins === 'roomy' ? '1in' : '0.75in'
  const paged = page.mode === 'pages'
  const headerHtml = paged && page.header ? `<header class="note-document-header">${escapeHtml(page.header)}</header>` : ''
  const pageNumberHtml = paged && page.pageNumbers !== 'none'
    ? `<span class="note-document-page-number" data-position="${page.pageNumbers}">Page </span>`
    : ''
  const footerHtml = paged && (page.footer || pageNumberHtml)
    ? `<footer class="note-document-footer" data-page-numbers="${page.pageNumbers}">${page.footer ? `<span class="note-document-footer-text">${escapeHtml(page.footer)}</span>` : ''}${pageNumberHtml}</footer>`
    : ''
  const watermarkHtml = paged && page.watermark ? `<div class="note-document-watermark">${escapeHtml(page.watermark)}</div>` : ''
  const mainColumns = page.columns > 1 ? ` data-columns="${page.columns}"` : ''
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: ${pageSize}; margin: ${margin}; }
    body {
      color: #111827;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11pt;
      line-height: 1.55;
      position: relative;
    }
    body[data-page-mode="pageless"] {
      max-width: 960px;
      margin: 32px auto;
      padding: 0 24px;
    }
    main,
    .note-document-header,
    .note-document-footer {
      position: relative;
      z-index: 1;
    }
    main[data-columns="2"],
    main[data-columns="3"] {
      column-gap: 28pt;
      column-rule: 1px solid transparent;
    }
    main[data-columns="2"] {
      column-count: 2;
    }
    main[data-columns="3"] {
      column-count: 3;
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
    .note-document-header,
    .note-document-footer {
      color: #6b7280;
      font-size: 9pt;
      letter-spacing: 0;
    }
    .note-document-header {
      border-bottom: 1px solid #e5e7eb;
      margin: 0 0 18pt;
      padding: 0 0 6pt;
    }
    .note-document-footer {
      border-top: 1px solid #e5e7eb;
      margin: 18pt 0 0;
      padding: 6pt 0 0;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 12pt;
    }
    .note-document-footer-text {
      grid-column: 1;
    }
    .note-document-page-number {
      color: #6b7280;
      font-size: 9pt;
      white-space: nowrap;
    }
    .note-document-page-number::after {
      content: counter(page);
    }
    .note-document-page-number[data-position="footer-center"] {
      grid-column: 2;
    }
    .note-document-page-number[data-position="footer-right"] {
      grid-column: 3;
      justify-self: end;
    }
    .note-document-watermark {
      position: fixed;
      inset: 0;
      z-index: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(107, 114, 128, 0.16);
      font-size: 54pt;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      transform: rotate(-32deg);
      pointer-events: none;
      user-select: none;
    }
    @media print {
      .note-document-header {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
      }
      .note-document-footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
      }
    }
    .note-wikilink, .note-tag {
      border-radius: 999px;
      background: #eef2ff;
      color: #3730a3;
      padding: 1pt 5pt;
      text-decoration: none;
    }
    .note-page-break {
      break-after: page;
      page-break-after: always;
      height: 0;
      margin: 0;
      border: 0;
    }
    body[data-page-mode="pageless"] .note-page-break {
      break-after: auto;
      page-break-after: auto;
      height: 1px;
      margin: 24pt 0;
      background: #e5e7eb;
    }
  </style>
</head>
<body data-page-mode="${page.mode}">
  ${watermarkHtml}
  ${headerHtml}
  <h1>${escapeHtml(title)}</h1>
  <main${mainColumns}>${bodyHtml}</main>
  ${footerHtml}
  ${
    autoPrint
      ? `<script>
    window.addEventListener('load', () => {
      setTimeout(() => { window.print(); }, 120);
    });
  </script>`
      : ''
  }
</body>
</html>`
}

export async function downloadDocx(note: VaultNote, context: { notes?: VaultNote[] } = {}) {
  const page = documentPageSettings(note.content)
  const images = await collectDocxImages(note.content)
  const paged = page.mode === 'pages'
  const hasHeader = paged && Boolean(page.header)
  const hasFooter = paged && (Boolean(page.footer) || page.pageNumbers !== 'none')
  const zip = createStoredZip([
    [
      '[Content_Types].xml',
      contentTypesXml(
        images.map(image => image.ext),
        { hasHeader, hasFooter },
      ),
    ],
    ['_rels/.rels', packageRelsXml()],
    ['word/_rels/document.xml.rels', documentRelsXml(images, { hasHeader, hasFooter })],
    [
      'word/document.xml',
      markdownToDocumentXml(note.title || 'Untitled', note.content, {
        notes: context.notes,
        currentId: note._id,
        page,
        images,
      }),
    ],
    ...(hasHeader ? [['word/header1.xml', headerFooterXml('hdr', page.header)] as const] : []),
    ...(hasFooter ? [['word/footer1.xml', documentFooterXml(page.footer, page.pageNumbers)] as const] : []),
    ['word/styles.xml', stylesXml()],
    ['docProps/core.xml', corePropsXml(note.title || 'Untitled')],
    ['docProps/app.xml', appPropsXml()],
    ...images.map(image => [`word/media/${image.fileName}`, image.bytes] as const),
  ])
  const buffer = new ArrayBuffer(zip.byteLength)
  new Uint8Array(buffer).set(zip)
  downloadBlob(new Blob([buffer], { type: MIME_DOCX }), safeExportName(note.title, 'docx'))
}

export function markdownToDocumentXml(
  title: string,
  markdown: string,
  context: { notes?: VaultNote[]; currentId?: string; page?: DocumentPageSettings; images?: DocxImage[] } = {},
): string {
  const { body: bodyMarkdown } = splitFrontmatter(markdown)
  const pluginExpanded = renderVaultPluginBlocks(bodyMarkdown, context.notes ?? [], context.currentId)
  const expandedBody = renderDataviewBlocks(pluginExpanded, context.notes ?? [], context.currentId)
  const page = context.page ?? documentPageSettings(markdown)
  const paged = page.mode === 'pages'
  const portraitPageSize = page.size === 'a4' ? { width: 11906, height: 16838 } : { width: 12240, height: 15840 }
  const pageSize =
    page.orientation === 'landscape'
      ? { width: portraitPageSize.height, height: portraitPageSize.width }
      : portraitPageSize
  const margin = page.margins === 'compact' ? 720 : page.margins === 'roomy' ? 1440 : 1080
  const headerRef = paged && page.header ? '<w:headerReference w:type="default" r:id="rIdHeader1"/>' : ''
  const footerRef = paged && (page.footer || page.pageNumbers !== 'none') ? '<w:footerReference w:type="default" r:id="rIdFooter1"/>' : ''
  const columnsXml = page.columns > 1 ? `<w:cols w:num="${page.columns}" w:space="720"/>` : ''
  const body = [paragraphXml(title, 'Title'), ...markdownBodyToDocumentXml(expandedBody, context.images ?? [])].join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${body}
    <w:sectPr>
      ${headerRef}
      ${footerRef}
      <w:pgSz w:w="${pageSize.width}" w:h="${pageSize.height}"${page.orientation === 'landscape' ? ' w:orient="landscape"' : ''}/>
      <w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="720" w:footer="720" w:gutter="0"/>
      ${columnsXml}
    </w:sectPr>
  </w:body>
</w:document>`
}

function enhanceObsidianMarkdown(markdown: string): string {
  return renderCallouts(markdown)
    .replace(/^\s*<!--\s*pagebreak\s*-->\s*$/gim, '<div class="note-page-break"></div>')
    .replace(/^\s*\[\[pagebreak\]\]\s*$/gim, '<div class="note-page-break"></div>')
    .replace(
      /!\[\[([^\]|]+\.(?:png|jpe?g|gif|webp|svg|bmp))(?:\|([^\]]+))?\]\]/gi,
      (_match, rawTarget: string, rawMeta: string = '') => {
        const image = parseImageExportParts(rawTarget, rawMeta)
        const width = image.width ? ` width="${image.width}"` : ''
        return `<img src="/api/vault/local/media?id=${encodeURIComponent(image.target)}" alt="${escapeHtml(image.alt)}" title="${escapeHtml(image.target)}"${width}>`
      },
    )
    .replace(
      /!\[([^\]]*)]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
      (match: string, rawAlt: string, rawTarget: string, rawTitle: string = '') => {
        const target = rawTarget.trim().replace(/^<|>$/g, '')
        if (!isLocalExportImageTarget(target)) return match
        const title = rawTitle.trim() || target
        return `<img src="/api/vault/local/media?id=${encodeURIComponent(target)}" alt="${escapeHtml(rawAlt.trim() || title)}" title="${escapeHtml(title)}">`
      },
    )
    .replace(/!\[\[([^\]]+)\]\]/g, (_match, rawTarget: string) => `[[${rawTarget}]]`)
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_match, target: string, label: string) => wikilinkHtml(target, label))
    .replace(/\[\[([^\]]+)\]\]/g, (_match, target: string) => wikilinkHtml(target, target))
    .replace(
      /(^|[\s(])#([A-Za-z][\w/-]*)/g,
      (match: string, prefix: string, tag: string, offset: number, source: string) => {
        const previous = source[offset - 1]
        const lastOpen = source.lastIndexOf('<', offset)
        const lastClose = source.lastIndexOf('>', offset)
        if (previous === ':' || lastOpen > lastClose) return match
        return `${prefix}<span class="note-tag">#${escapeHtml(tag)}</span>`
      },
    )
}

function isLocalExportImageTarget(target: string): boolean {
  return /\.(?:png|jpe?g|gif|webp|svg|bmp)$/i.test(target) && !/^(?:https?:|data:|blob:|\/)/i.test(target)
}

function renderCallouts(markdown: string): string {
  return markdown.replace(
    /^>\s*\[!([A-Za-z][\w-]*)\]([+-])?\s*(.*?)\n((?:>\s?.*(?:\n|$))*)/gm,
    (_match, type: string, foldMarker: string = '', title: string, body: string) => {
      const cleanType = type.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32)
      const cleanTitle = title.trim() || cleanType
      const foldClass = foldMarker === '-'
        ? ' note-callout-fold-collapsed'
        : foldMarker === '+'
          ? ' note-callout-fold-expanded'
          : ''
      const cleanBody = body
        .split('\n')
        .map(line => line.replace(/^>\s?/, ''))
        .join('\n')
        .trim()
      const parsedBody = cleanBody ? (marked.parse(cleanBody) as string) : ''
      const titleHtml = foldMarker
        ? `<button type="button" class="note-callout-title" aria-expanded="${foldMarker === '+' ? 'true' : 'false'}">${escapeHtml(cleanTitle)}</button>`
        : `<div class="note-callout-title">${escapeHtml(cleanTitle)}</div>`
      return `<div class="note-callout note-callout-${escapeHtml(cleanType)}${foldClass}">${titleHtml}<div class="note-callout-body">${parsedBody}</div></div>\n`
    },
  )
}

function wikilinkHtml(target: string, label: string): string {
  const cleanTarget = target.trim()
  const cleanLabel = label.trim() || cleanTarget
  return `<a class="note-wikilink" href="#note:${encodeURIComponent(cleanTarget)}" title="${escapeHtml(cleanTarget)}">${escapeHtml(cleanLabel)}</a>`
}

function markdownBodyToDocumentXml(markdown: string, images: DocxImage[] = []): string[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim().startsWith('```')) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index])
        index += 1
      }
      out.push(paragraphXml(code.join('\n'), 'CodeBlock'))
      continue
    }
    if (isMarkdownTableStart(lines, index)) {
      const tableLines = [line]
      index += 2
      while (index < lines.length && looksLikeTableRow(lines[index])) {
        tableLines.push(lines[index])
        index += 1
      }
      index -= 1
      out.push(tableXml(tableLines.map(parseMarkdownTableRow)))
      continue
    }
    out.push(...markdownLineToXml(line, images))
  }
  return out
}

function markdownLineToXml(line: string, images: DocxImage[] = []): string[] {
  if (!line.trim()) return [paragraphXml('', 'Normal')]
  if (isPageBreakLine(line.trim())) return [pageBreakXml()]
  const heading = line.match(/^(#{1,6})\s+(.+)$/)
  if (heading) {
    const style = (['Heading1', 'Heading2', 'Heading3'] as const)[Math.min(heading[1].length, 3) - 1]
    return [paragraphXml(cleanInline(heading[2]), style)]
  }
  const obsidianImage = line.match(/^\s*!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]\s*$/)
  const markdownImage = line.match(/^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/)
  if (obsidianImage || markdownImage) {
    const image = obsidianImage
      ? parseImageExportParts(obsidianImage[1], obsidianImage[2])
      : { target: (markdownImage?.[2] ?? '').trim(), alt: (markdownImage?.[1] ?? '').trim(), width: undefined }
    const target = image.target
    const label = image.alt || target
    const embedded = images.find(image => image.target === target)
    if (embedded) return [imageParagraphXml(embedded)]
    return [paragraphXml(`Image: ${cleanInline(label)}${target && target !== label ? ` (${target})` : ''}`, 'Caption')]
  }
  const checked = line.match(/^\s*[-*]\s+\[(x| )\]\s+(.+)$/i)
  if (checked)
    return [paragraphXml(`${checked[1].toLowerCase() === 'x' ? '☑' : '☐'} ${cleanInline(checked[2])}`, 'Normal')]
  const bullet = line.match(/^\s*[-*]\s+(.+)$/)
  if (bullet) return [paragraphXml(`• ${cleanInline(bullet[1])}`, 'Normal')]
  const numbered = line.match(/^\s*\d+\.\s+(.+)$/)
  if (numbered) return [paragraphXml(cleanInline(numbered[1]), 'Normal')]
  const quote = line.match(/^\s*>\s+(.+)$/)
  if (quote) return [paragraphXml(cleanInline(quote[1]), 'Quote')]
  const hr = line.match(/^\s*---+\s*$/)
  if (hr) return [paragraphXml('────────────', 'Normal')]
  return [paragraphXml(cleanInline(line), 'Normal')]
}

function isPageBreakLine(trimmed: string): boolean {
  return trimmed.toLowerCase() === PAGE_BREAK_MARKDOWN || trimmed.toLowerCase() === '[[pagebreak]]'
}

function pageBreakXml(): string {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
}

function isMarkdownTableStart(lines: string[], index: number): boolean {
  return (
    looksLikeTableRow(lines[index]) && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] ?? '')
  )
}

function looksLikeTableRow(line: string): boolean {
  return line.includes('|') && line.trim().replace(/^\|/, '').replace(/\|$/, '').includes('|')
}

function parseMarkdownTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cleanInline(cell.trim()))
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

function paragraphXml(
  text: string,
  style: 'Title' | 'Heading1' | 'Heading2' | 'Heading3' | 'Quote' | 'CodeBlock' | 'Caption' | 'Normal',
): string {
  const styleXml = style === 'Normal' ? '' : `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`
  const runs = text
    ? text
        .split('\n')
        .map((part, index) => `${index > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeXml(part)}</w:t>`)
        .join('')
    : ''
  return `<w:p>${styleXml}<w:r>${runs}</w:r></w:p>`
}

function tableXml(rows: string[][]): string {
  const columnCount = Math.max(1, ...rows.map(row => row.length))
  const width = Math.floor(9360 / columnCount)
  const grid = Array.from({ length: columnCount }, () => `<w:gridCol w:w="${width}"/>`).join('')
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D1D5DB"/><w:left w:val="single" w:sz="4" w:color="D1D5DB"/><w:bottom w:val="single" w:sz="4" w:color="D1D5DB"/><w:right w:val="single" w:sz="4" w:color="D1D5DB"/><w:insideH w:val="single" w:sz="4" w:color="D1D5DB"/><w:insideV w:val="single" w:sz="4" w:color="D1D5DB"/></w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows.map((row, rowIndex) => tableRowXml(row, columnCount, rowIndex === 0)).join('')}</w:tbl>`
}

function tableRowXml(row: string[], columnCount: number, header: boolean): string {
  const cells = Array.from({ length: columnCount }, (_unused, index) => row[index] ?? '')
  return `<w:tr>${cells.map(cell => tableCellXml(cell, header)).join('')}</w:tr>`
}

function tableCellXml(text: string, header: boolean): string {
  const fill = header ? '<w:tcPr><w:shd w:fill="F3F4F6"/></w:tcPr>' : ''
  const runProps = header ? '<w:rPr><w:b/></w:rPr>' : ''
  return `<w:tc>${fill}<w:p><w:r>${runProps}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p></w:tc>`
}

function imageParagraphXml(image: DocxImage): string {
  const cx = Math.round((image.width ?? 480) * 9525)
  const cy = Math.round(cx * 0.5625)
  return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${image.relId.replace(/\D/g, '') || '1'}" name="${escapeXml(image.alt)}" descr="${escapeXml(image.alt)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="${escapeXml(image.fileName)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${image.relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}

async function collectDocxImages(markdown: string): Promise<DocxImage[]> {
  const targets = [...markdown.matchAll(/!\[\[([^\]|]+\.(?:png|jpe?g|gif|webp))(?:\|([^\]]+))?\]\]/gi)].map(
    (match, index) => ({ ...parseImageExportParts(match[1], match[2]), index }),
  )
  const images: DocxImage[] = []
  for (const item of targets.slice(0, 20)) {
    try {
      const res = await fetch(`/api/vault/local/media?id=${encodeURIComponent(item.target)}`)
      if (!res.ok) continue
      const bytes = new Uint8Array(await res.arrayBuffer())
      const ext = imageExt(item.target)
      images.push({
        target: item.target,
        alt: item.alt,
        width: item.width,
        ext,
        relId: `rIdImage${images.length + 1}`,
        fileName: `image${images.length + 1}.${ext}`,
        bytes,
      })
    } catch {
      // Export keeps a readable caption when local image bytes are unavailable.
    }
  }
  return images
}

function parseImageExportParts(target: string, rawMeta = ''): { target: string; alt: string; width?: number } {
  const parts = rawMeta
    .split('|')
    .map(part => part.trim())
    .filter(Boolean)
  const widthPart = parts.find(part => normalizeImageWidth(part))
  const alt = parts.find(part => part !== widthPart) || target.trim()
  return {
    target: target.trim(),
    alt,
    width: normalizeImageWidth(widthPart),
  }
}

function normalizeImageWidth(value: string | undefined): number | undefined {
  const match = value?.trim().match(/^(\d{2,4})(?:px)?(?:x\d{2,4})?$/i)
  if (!match) return undefined
  return Math.max(80, Math.min(1400, Number(match[1])))
}

function imageExt(target: string): string {
  const ext = target.split('.').pop()?.toLowerCase() || 'png'
  return ext === 'jpg' ? 'jpeg' : ext
}

function contentTypesXml(imageExts: string[] = [], parts: { hasHeader?: boolean; hasFooter?: boolean } = {}): string {
  const imageDefaults = [...new Set(imageExts)]
    .map(ext => `<Default Extension="${escapeXml(ext)}" ContentType="${imageContentType(ext)}"/>`)
    .join('\n  ')
  const headerOverride = parts.hasHeader
    ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
    : ''
  const footerOverride = parts.hasFooter
    ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
    : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${imageDefaults}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  ${headerOverride}
  ${footerOverride}
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`
}

function imageContentType(ext: string): string {
  switch (ext) {
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    case 'bmp':
      return 'image/bmp'
    default:
      return 'image/png'
  }
}

function packageRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
}

function documentRelsXml(images: DocxImage[] = [], parts: { hasHeader?: boolean; hasFooter?: boolean } = {}): string {
  const imageRels = images
    .map(
      image =>
        `<Relationship Id="${image.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${escapeXml(image.fileName)}"/>`,
    )
    .join('\n  ')
  const headerRel = parts.hasHeader
    ? '<Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'
    : ''
  const footerRel = parts.hasFooter
    ? '<Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'
    : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  ${headerRel}
  ${footerRel}
  ${imageRels}
</Relationships>`
}

function headerFooterXml(kind: 'hdr' | 'ftr', text: string): string {
  const tag = kind === 'hdr' ? 'hdr' : 'ftr'
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:${tag} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:pStyle w:val="Caption"/></w:pPr>
    <w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>
  </w:p>
</w:${tag}>`
}

export function documentFooterXml(text: string, pageNumbers: DocumentPageNumbers): string {
  const textParagraph = text
    ? `
  <w:p>
    <w:pPr><w:pStyle w:val="Caption"/></w:pPr>
    <w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>
  </w:p>`
    : ''
  const pageNumberParagraph = pageNumbers === 'none'
    ? ''
    : `
  <w:p>
    <w:pPr><w:pStyle w:val="Caption"/><w:jc w:val="${pageNumbers === 'footer-right' ? 'right' : 'center'}"/></w:pPr>
    <w:r><w:t xml:space="preserve">Page </w:t></w:r>
    <w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple>
  </w:p>`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  ${textParagraph}
  ${pageNumberParagraph}
</w:ftr>`
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

function createStoredZip(files: Array<readonly [string, string | Uint8Array]>): Uint8Array {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  files.forEach(([name, content]) => {
    const nameBytes = encoder.encode(name)
    const data = typeof content === 'string' ? encoder.encode(content) : content
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
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
