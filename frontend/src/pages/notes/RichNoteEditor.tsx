import { memo, useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import {
  Code,
  LinkSimple,
  ListChecks,
  ListBullets,
  ListNumbers,
  Minus,
  PaintBucket,
  Quotes,
  Table,
  TextAlignCenter,
  TextAlignJustify,
  TextAlignLeft,
  TextAlignRight,
  TextB,
  TextIndent,
  TextItalic,
  TextOutdent,
  TextStrikethrough,
  TextUnderline,
  Warning,
} from '@phosphor-icons/react'
import { markdownToSafeHtml } from './export'

interface RichNoteEditorProps {
  content: string
  onChange: (content: string) => void
  onWikilinkClick: (link: string) => void
}

const buttonStyle: CSSProperties = {
  width: 28,
  height: 28,
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  flexShrink: 0,
}

const selectStyle: CSSProperties = {
  height: 28,
  maxWidth: 110,
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-white-02)',
  color: 'var(--text-secondary)',
  font: 'inherit',
  fontSize: 12,
  padding: '0 8px',
  outline: 'none',
  flexShrink: 0,
}

export default memo(function RichNoteEditor({ content, onChange, onWikilinkClick }: RichNoteEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const isFocusedRef = useRef(false)
  const lastHtmlRef = useRef('')
  const savedRangeRef = useRef<Range | null>(null)

  const html = useMemo(() => markdownToSafeHtml(content), [content])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || isFocusedRef.current) return
    if (lastHtmlRef.current === html && editor.innerHTML) return
    editor.innerHTML = html || '<p><br></p>'
    lastHtmlRef.current = html
  }, [html])

  const saveSelection = () => {
    const editor = editorRef.current
    const selection = window.getSelection()
    if (!editor || !selection?.rangeCount || !selection.anchorNode || !editor.contains(selection.anchorNode)) return
    savedRangeRef.current = selection.getRangeAt(0).cloneRange()
  }

  const prepareEditor = () => {
    const editor = editorRef.current
    if (!editor) return null
    if (!editor.innerHTML.trim()) editor.innerHTML = '<p><br></p>'
    editor.focus()
    const selection = window.getSelection()
    if (selection && savedRangeRef.current) {
      selection.removeAllRanges()
      selection.addRange(savedRangeRef.current)
    }
    return editor
  }

  const emitChange = () => {
    const editor = editorRef.current
    if (!editor) return
    lastHtmlRef.current = editor.innerHTML
    saveSelection()
    onChange(htmlToMarkdown(editor))
  }

  const runCommand = (command: string, value?: string) => {
    prepareEditor()
    document.execCommand(command, false, value)
    emitChange()
  }

  const makeHeading = (level: 0 | 1 | 2 | 3) => {
    runCommand('formatBlock', level === 0 ? 'p' : `h${level}`)
  }

  const insertHtml = (html: string) => {
    prepareEditor()
    document.execCommand('insertHTML', false, html)
    emitChange()
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div
        role="toolbar"
        aria-label="Document formatting"
        style={{
          minHeight: 38,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '4px 10px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-card-solid)',
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        <select
          aria-label="Paragraph style"
          onMouseDown={saveSelection}
          onChange={(event) => makeHeading(Number(event.target.value) as 0 | 1 | 2 | 3)}
          defaultValue="0"
          style={{
            height: 28,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-white-02)',
            color: 'var(--text-secondary)',
            font: 'inherit',
            fontSize: 12,
            padding: '0 8px',
            outline: 'none',
          }}
        >
          <option value="0">Paragraph</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
        </select>
        <select
          aria-label="Font family"
          onMouseDown={saveSelection}
          onChange={(event) => runCommand('fontName', event.target.value)}
          defaultValue=""
          style={selectStyle}
        >
          <option value="">Font</option>
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
          <option value="Helvetica">Helvetica</option>
          <option value="Times New Roman">Times</option>
          <option value="monospace">Mono</option>
        </select>
        <select
          aria-label="Font size"
          onMouseDown={saveSelection}
          onChange={(event) => runCommand('fontSize', event.target.value)}
          defaultValue=""
          style={{ ...selectStyle, width: 58 }}
        >
          <option value="">Size</option>
          <option value="2">12</option>
          <option value="3">14</option>
          <option value="4">16</option>
          <option value="5">20</option>
          <option value="6">24</option>
          <option value="7">32</option>
        </select>
        <Separator />
        <ToolbarButton label="Bold" onClick={() => runCommand('bold')}>
          <TextB size={14} weight="bold" />
        </ToolbarButton>
        <ToolbarButton label="Italic" onClick={() => runCommand('italic')}>
          <TextItalic size={14} />
        </ToolbarButton>
        <ToolbarButton label="Underline" onClick={() => runCommand('underline')}>
          <TextUnderline size={14} />
        </ToolbarButton>
        <ToolbarButton label="Strikethrough" onClick={() => runCommand('strikeThrough')}>
          <TextStrikethrough size={14} />
        </ToolbarButton>
        <ColorButton label="Text color" onMouseDown={saveSelection} onChange={(value) => runCommand('foreColor', value)} />
        <ColorButton label="Highlight" icon={<PaintBucket size={14} />} onMouseDown={saveSelection} onChange={(value) => runCommand('hiliteColor', value)} />
        <Separator />
        <ToolbarButton label="Bullet list" onClick={() => runCommand('insertUnorderedList')}>
          <ListBullets size={14} />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" onClick={() => runCommand('insertOrderedList')}>
          <ListNumbers size={14} />
        </ToolbarButton>
        <ToolbarButton label="Checklist" onClick={() => insertHtml('<ul><li><input type="checkbox"> Task</li></ul>')}>
          <ListChecks size={14} />
        </ToolbarButton>
        <ToolbarButton label="Blockquote" onClick={() => makeBlockquote(editorRef.current, emitChange)}>
          <Quotes size={14} />
        </ToolbarButton>
        <ToolbarButton label="Inline code" onClick={() => runCommand('fontName', 'monospace')}>
          <Code size={14} />
        </ToolbarButton>
        <ToolbarButton label="Link" onClick={() => createLink(prepareEditor, emitChange)}>
          <LinkSimple size={14} />
        </ToolbarButton>
        <ToolbarButton label="Table" onClick={() => insertHtml('<table><thead><tr><th>Column</th><th>Column</th><th>Column</th></tr></thead><tbody><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><p><br></p>')}>
          <Table size={14} />
        </ToolbarButton>
        <ToolbarButton label="Insert row" onClick={() => insertTableRow(editorRef.current, emitChange)}>
          <span style={{ fontSize: 11, fontWeight: 700 }}>R+</span>
        </ToolbarButton>
        <ToolbarButton label="Insert column" onClick={() => insertTableColumn(editorRef.current, emitChange)}>
          <span style={{ fontSize: 11, fontWeight: 700 }}>C+</span>
        </ToolbarButton>
        <ToolbarButton label="Delete row" onClick={() => deleteTableRow(editorRef.current, emitChange)}>
          <span style={{ fontSize: 11, fontWeight: 700 }}>R-</span>
        </ToolbarButton>
        <ToolbarButton label="Delete column" onClick={() => deleteTableColumn(editorRef.current, emitChange)}>
          <span style={{ fontSize: 11, fontWeight: 700 }}>C-</span>
        </ToolbarButton>
        <ToolbarButton label="Divider" onClick={() => insertHtml('<hr><p><br></p>')}>
          <Minus size={14} />
        </ToolbarButton>
        <ToolbarButton label="Callout" onClick={() => insertHtml('<div class="note-callout note-callout-note"><div class="note-callout-title">Note</div><div class="note-callout-body"><p>Write callout text...</p></div></div><p><br></p>')}>
          <Warning size={14} />
        </ToolbarButton>
        <ToolbarButton label="Comment" onClick={() => insertComment(prepareEditor, emitChange)}>
          <span style={{ fontSize: 11, fontWeight: 700 }}>C</span>
        </ToolbarButton>
        <Separator />
        <ToolbarButton label="Align left" onClick={() => runCommand('justifyLeft')}>
          <TextAlignLeft size={14} />
        </ToolbarButton>
        <ToolbarButton label="Align center" onClick={() => runCommand('justifyCenter')}>
          <TextAlignCenter size={14} />
        </ToolbarButton>
        <ToolbarButton label="Align right" onClick={() => runCommand('justifyRight')}>
          <TextAlignRight size={14} />
        </ToolbarButton>
        <ToolbarButton label="Justify" onClick={() => runCommand('justifyFull')}>
          <TextAlignJustify size={14} />
        </ToolbarButton>
        <select
          aria-label="Line spacing"
          onMouseDown={saveSelection}
          onChange={(event) => {
            prepareEditor()
            applyBlockStyle(editorRef.current, 'line-height', event.target.value, emitChange)
          }}
          defaultValue=""
          style={{ ...selectStyle, width: 78 }}
        >
          <option value="">Spacing</option>
          <option value="1.2">1.2</option>
          <option value="1.5">1.5</option>
          <option value="1.8">1.8</option>
          <option value="2">2.0</option>
        </select>
        <ToolbarButton label="Outdent" onClick={() => runCommand('outdent')}>
          <TextOutdent size={14} />
        </ToolbarButton>
        <ToolbarButton label="Indent" onClick={() => runCommand('indent')}>
          <TextIndent size={14} />
        </ToolbarButton>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          background: 'var(--bg-base)',
          padding: '26px 48px 80px',
        }}
      >
        <div
          ref={editorRef}
          className="rich-note-doc"
          contentEditable
          spellCheck
          suppressContentEditableWarning
          role="textbox"
          aria-label="Document editor"
          onFocus={() => {
            isFocusedRef.current = true
            saveSelection()
          }}
          onBlur={() => {
            saveSelection()
            isFocusedRef.current = false
            emitChange()
          }}
          onInput={emitChange}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          onPaste={(event) => {
            const image = Array.from(event.clipboardData.files).find((file) => file.type.startsWith('image/'))
            if (!image) return
            event.preventDefault()
            void insertImageFile(image, editorRef.current, emitChange)
          }}
          onDragOver={(event) => {
            if (Array.from(event.dataTransfer.items).some((item) => item.type.startsWith('image/'))) {
              event.preventDefault()
            }
          }}
          onDrop={(event) => {
            const image = Array.from(event.dataTransfer.files).find((file) => file.type.startsWith('image/'))
            if (!image) return
            event.preventDefault()
            void insertImageFile(image, editorRef.current, emitChange)
          }}
          onClick={(event) => {
            saveSelection()
            const target = event.target as HTMLElement
            if (target instanceof HTMLInputElement && target.type === 'checkbox') {
              setTimeout(emitChange, 0)
              return
            }
            const link = target.closest('a.note-wikilink')
            if (link instanceof HTMLAnchorElement && link.getAttribute('href')?.startsWith('#note:')) {
              event.preventDefault()
              onWikilinkClick(decodeURIComponent(link.getAttribute('href')!.slice('#note:'.length)))
              return
            }
            const text = target.textContent || ''
            const match = text.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/)
            if (!match) return
            event.preventDefault()
            onWikilinkClick(match[1].trim())
          }}
          style={{
            boxSizing: 'border-box',
            maxWidth: 820,
            minHeight: 'calc(100vh - 250px)',
            margin: '0 auto',
            padding: '54px 64px',
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--bg-card-solid)',
            boxShadow: '0 18px 48px rgba(0, 0, 0, 0.18)',
            color: 'var(--text-primary)',
            fontSize: 15,
            lineHeight: 1.68,
            outline: 'none',
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}
        />
      </div>
    </div>
  )
})

function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="hover-bg"
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      style={buttonStyle}
    >
      {children}
    </button>
  )
}

function ColorButton({
  label,
  icon,
  onMouseDown,
  onChange,
}: {
  label: string
  icon?: ReactNode
  onMouseDown?: () => void
  onChange: (value: string) => void
}) {
  return (
    <label className="hover-bg" title={label} onMouseDown={onMouseDown} style={{ ...buttonStyle, position: 'relative' }}>
      {icon ?? <span style={{ fontSize: 13, fontWeight: 700 }}>A</span>}
      <input
        aria-label={label}
        type="color"
        onChange={(event) => onChange(event.target.value)}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0,
          cursor: 'pointer',
        }}
      />
    </label>
  )
}

function Separator() {
  return <div aria-hidden style={{ width: 1, height: 16, margin: '0 4px', background: 'var(--border)', flexShrink: 0 }} />
}

function createLink(prepareEditor: () => HTMLDivElement | null, emitChange: () => void) {
  const url = window.prompt('Link URL')
  if (!url) return
  prepareEditor()
  document.execCommand('createLink', false, url)
  emitChange()
}

async function insertImageFile(file: File, editor: HTMLDivElement | null, emitChange: () => void) {
  if (!editor || file.size > 100000) {
    window.alert('Image is too large for inline note embedding. Use an Obsidian attachment for larger images.')
    return
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  editor.focus()
  document.execCommand('insertHTML', false, `<img src="${dataUrl}" alt="${escapeHtmlAttr(file.name)}"><p><br></p>`)
  emitChange()
}

function makeBlockquote(editor: HTMLDivElement | null, emitChange: () => void) {
  editor?.focus()
  document.execCommand('formatBlock', false, 'blockquote')
  emitChange()
}

function insertComment(prepareEditor: () => HTMLDivElement | null, emitChange: () => void) {
  const note = window.prompt('Comment')
  if (!note) return
  const editor = prepareEditor()
  if (!editor) return
  const selection = window.getSelection()?.toString() || 'Comment'
  document.execCommand(
    'insertHTML',
    false,
    `<mark title="${escapeHtmlAttr(note)}">${escapeHtmlAttr(selection)}</mark>`,
  )
  emitChange()
}

function applyBlockStyle(editor: HTMLDivElement | null, property: string, value: string, emitChange: () => void) {
  const block = closestEditableBlock(editor)
  if (!block || !value) return
  block.style.setProperty(property, value)
  emitChange()
}

function closestEditableBlock(editor: HTMLDivElement | null): HTMLElement | null {
  if (!editor) return null
  const selection = window.getSelection()
  let node = selection?.anchorNode || null
  if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement
  if (!(node instanceof HTMLElement) || !editor.contains(node)) return null
  return node.closest('p, div, li, h1, h2, h3, h4, h5, h6, blockquote') as HTMLElement | null
}

function selectedTableCell(editor: HTMLDivElement | null): HTMLTableCellElement | null {
  if (!editor) return null
  const selection = window.getSelection()
  let node = selection?.anchorNode || null
  if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement
  if (!(node instanceof HTMLElement) || !editor.contains(node)) return null
  return node.closest('td, th') as HTMLTableCellElement | null
}

function insertTableRow(editor: HTMLDivElement | null, emitChange: () => void) {
  const cell = selectedTableCell(editor)
  const row = cell?.parentElement as HTMLTableRowElement | null
  if (!row) return
  const clone = row.cloneNode(true) as HTMLTableRowElement
  Array.from(clone.cells).forEach((item) => {
    item.innerHTML = '<br>'
  })
  row.after(clone)
  emitChange()
}

function insertTableColumn(editor: HTMLDivElement | null, emitChange: () => void) {
  const cell = selectedTableCell(editor)
  if (!cell) return
  const table = cell.closest('table')
  if (!table) return
  const targetIndex = cell.cellIndex + 1
  Array.from(table.rows).forEach((row) => {
    const newCell = document.createElement(row.parentElement?.tagName.toLowerCase() === 'thead' ? 'th' : 'td')
    newCell.innerHTML = '<br>'
    if (row.children[targetIndex]) {
      row.children[targetIndex].before(newCell)
    } else {
      row.appendChild(newCell)
    }
  })
  emitChange()
}

function deleteTableRow(editor: HTMLDivElement | null, emitChange: () => void) {
  const cell = selectedTableCell(editor)
  const row = cell?.parentElement as HTMLTableRowElement | null
  const table = cell?.closest('table')
  if (!row || !table || table.rows.length <= 1) return
  row.remove()
  emitChange()
}

function deleteTableColumn(editor: HTMLDivElement | null, emitChange: () => void) {
  const cell = selectedTableCell(editor)
  const table = cell?.closest('table')
  if (!cell || !table || table.rows[0]?.cells.length <= 1) return
  const index = cell.cellIndex
  Array.from(table.rows).forEach((row) => {
    row.cells[index]?.remove()
  })
  emitChange()
}

function htmlToMarkdown(root: HTMLElement): string {
  const blocks = Array.from(root.childNodes).flatMap((node) => nodeToMarkdown(node, 0))
  return blocks.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

function nodeToMarkdown(node: Node, depth: number): string[] {
  if (node.nodeType === Node.TEXT_NODE) return [node.textContent || '']
  if (!(node instanceof HTMLElement)) return []

  const tag = node.tagName.toLowerCase()
  if (tag === 'br') return ['']
  if (tag === 'h1') return [`# ${inlineMarkdown(node)}`]
  if (tag === 'h2') return [`## ${inlineMarkdown(node)}`]
  if (tag === 'h3') return [`### ${inlineMarkdown(node)}`]
  if (tag === 'h4') return [`#### ${inlineMarkdown(node)}`]
  if (tag === 'h5') return [`##### ${inlineMarkdown(node)}`]
  if (tag === 'h6') return [`###### ${inlineMarkdown(node)}`]
  if (tag === 'blockquote') {
    const text = childBlocks(node, depth).join('\n')
    return text.split('\n').map((line) => `> ${line}`)
  }
  if (tag === 'ul') {
    return Array.from(node.children).flatMap((child) => listItemMarkdown(child, depth, false))
  }
  if (tag === 'ol') {
    return Array.from(node.children).flatMap((child, index) => listItemMarkdown(child, depth, true, index + 1))
  }
  if (tag === 'pre') return [`\`\`\`\n${node.textContent || ''}\n\`\`\``]
  if (tag === 'hr') return ['---']
  if (tag === 'table') return tableToMarkdown(node)
  if (node.classList.contains('note-callout')) return calloutToMarkdown(node)
  if (tag === 'p' || tag === 'div') {
    const text = inlineMarkdown(node)
    const style = markdownSafeStyle(node)
    if (style && text) return [`<p style="${style}">${text}</p>`]
    return [text || '']
  }
  return [inlineMarkdown(node)]
}

function calloutToMarkdown(node: HTMLElement): string[] {
  const typeClass = Array.from(node.classList).find((item) => item.startsWith('note-callout-') && item !== 'note-callout-title' && item !== 'note-callout-body')
  const type = typeClass?.replace('note-callout-', '') || 'note'
  const title = node.querySelector('.note-callout-title')?.textContent?.trim() || type
  const body = node.querySelector('.note-callout-body') as HTMLElement | null
  const lines = body ? childBlocks(body, 0).join('\n').split('\n') : []
  return [`> [!${type}] ${title}`, ...lines.map((line) => `> ${line}`)]
}

function childBlocks(element: HTMLElement, depth: number): string[] {
  return Array.from(element.childNodes).flatMap((node) => nodeToMarkdown(node, depth + 1))
}

function listItemMarkdown(child: Element, depth: number, ordered: boolean, index = 1): string[] {
  if (!(child instanceof HTMLElement) || child.tagName.toLowerCase() !== 'li') return []
  const checkbox = child.querySelector('input[type="checkbox"]') as HTMLInputElement | null
  if (checkbox) {
    const clone = child.cloneNode(true) as HTMLElement
    clone.querySelector('input[type="checkbox"]')?.remove()
    const checked = checkbox.checked || checkbox.hasAttribute('checked')
    return [`${'  '.repeat(depth)}- [${checked ? 'x' : ' '}] ${inlineMarkdown(clone).replace(/\n+/g, ' ').trim()}`]
  }
  const marker = ordered ? `${index}. ` : '- '
  const text = inlineMarkdown(child).replace(/\n+/g, ' ').trim()
  return [`${'  '.repeat(depth)}${marker}${text}`]
}

function inlineMarkdown(element: HTMLElement): string {
  return Array.from(element.childNodes).map(inlineNodeMarkdown).join('').replace(/\u00a0/g, ' ').trim()
}

function inlineNodeMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
  if (!(node instanceof HTMLElement)) return ''
  const text = Array.from(node.childNodes).map(inlineNodeMarkdown).join('')
  const tag = node.tagName.toLowerCase()
  if (tag === 'span' && node.classList.contains('note-tag')) return node.textContent || text
  if (tag === 'strong' || tag === 'b') return `**${text}**`
  if (tag === 'em' || tag === 'i') return `*${text}*`
  if (tag === 'u') return `<u>${text}</u>`
  if (tag === 'mark') {
    const title = node.getAttribute('title')
    return title ? `<mark title="${escapeHtmlAttr(title)}">${text}</mark>` : `<mark>${text}</mark>`
  }
  if (tag === 's' || tag === 'del' || tag === 'strike') return `~~${text}~~`
  if (tag === 'code') return `\`${text}\``
  if (tag === 'img') return `![${node.getAttribute('alt') || 'image'}](${node.getAttribute('src') || ''})`
  if (tag === 'font') {
    const style = [
      node.getAttribute('color') ? `color: ${node.getAttribute('color')}` : '',
      node.getAttribute('face') ? `font-family: ${node.getAttribute('face')}` : '',
      fontSizeFromLegacyValue(node.getAttribute('size')),
    ].filter(Boolean).join('; ')
    return style ? `<span style="${style}">${text}</span>` : text
  }
  if (tag === 'span') {
    const style = markdownSafeStyle(node)
    if (style && text) return `<span style="${style}">${text}</span>`
  }
  if (tag === 'a') {
    const href = node.getAttribute('href') || ''
    if (node.classList.contains('note-wikilink') && href.startsWith('#note:')) {
      const target = decodeURIComponent(href.slice('#note:'.length))
      return text && text !== target ? `[[${target}|${text}]]` : `[[${target}]]`
    }
    return `[${text || href || 'link'}](${href})`
  }
  if (tag === 'br') return '\n'
  return text
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function markdownSafeStyle(node: HTMLElement): string {
  const style = node.getAttribute('style') || ''
  return style
    .split(';')
    .map((part) => part.trim())
    .filter((part) => /^(color|background-color|font-size|font-family|text-align|line-height|margin-left)\s*:/i.test(part))
    .filter((part) => !/url\s*\(|expression\s*\(/i.test(part))
    .join('; ')
}

function fontSizeFromLegacyValue(value: string | null): string {
  const sizes: Record<string, string> = {
    '1': 'font-size: 10px',
    '2': 'font-size: 12px',
    '3': 'font-size: 14px',
    '4': 'font-size: 16px',
    '5': 'font-size: 20px',
    '6': 'font-size: 24px',
    '7': 'font-size: 32px',
  }
  return value ? sizes[value] ?? '' : ''
}

function tableToMarkdown(table: HTMLElement): string[] {
  const rows = Array.from(table.querySelectorAll('tr')).map((row) =>
    Array.from(row.children).map((cell) => inlineMarkdown(cell as HTMLElement)),
  )
  if (!rows.length) return []
  const first = rows[0]
  return [
    `| ${first.join(' | ')} |`,
    `| ${first.map(() => '---').join(' | ')} |`,
    ...rows.slice(1).map((row) => `| ${row.join(' | ')} |`),
  ]
}
