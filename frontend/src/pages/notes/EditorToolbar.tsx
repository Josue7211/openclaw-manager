import { memo, type CSSProperties, type ReactNode } from 'react'
import type { EditorView } from '@codemirror/view'
import {
  TextB,
  TextItalic,
  TextStrikethrough,
  Code,
  CodeBlock,
  ListBullets,
  ListNumbers,
  ListChecks,
  LinkSimple,
  Quotes,
  Minus,
  Table,
  ImageSquare,
  Export,
} from '@phosphor-icons/react'

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Toggle a line prefix (e.g. `# `, `- `, `> `). Works on every line in the selection. */
function toggleLinePrefix(view: EditorView, prefix: string) {
  const { state } = view
  const { from, to } = state.selection.main
  const startLine = state.doc.lineAt(from)
  const endLine = state.doc.lineAt(to)

  const changes: { from: number; to: number; insert: string }[] = []
  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = state.doc.line(i)
    if (line.text.startsWith(prefix)) {
      changes.push({ from: line.from, to: line.from + prefix.length, insert: '' })
    } else {
      changes.push({ from: line.from, to: line.from, insert: prefix })
    }
  }

  view.dispatch({ changes })
  view.focus()
}

/** Toggle a heading prefix. Removes any existing heading prefix first. */
function toggleHeading(view: EditorView, level: number) {
  const { state } = view
  const line = state.doc.lineAt(state.selection.main.head)
  const prefix = '#'.repeat(level) + ' '

  // Strip any existing heading prefix
  const headingMatch = line.text.match(/^(#{1,6})\s/)
  if (headingMatch) {
    const existingPrefix = headingMatch[0]
    if (existingPrefix === prefix) {
      // Same level — remove it
      view.dispatch({ changes: { from: line.from, to: line.from + existingPrefix.length, insert: '' } })
    } else {
      // Different level — replace
      view.dispatch({ changes: { from: line.from, to: line.from + existingPrefix.length, insert: prefix } })
    }
  } else {
    // No heading — add it
    view.dispatch({ changes: { from: line.from, to: line.from, insert: prefix } })
  }
  view.focus()
}

/** Wrap the selection with inline markers (`**`, `*`, `~~`, `` ` ``). */
function toggleWrap(view: EditorView, wrapper: string) {
  const { state } = view
  const { from, to } = state.selection.main
  const selectedText = state.doc.sliceString(from, to)

  // Check if the surrounding text already has the wrapper
  const wLen = wrapper.length
  const beforeStart = Math.max(0, from - wLen)
  const afterEnd = Math.min(state.doc.length, to + wLen)
  const before = state.doc.sliceString(beforeStart, from)
  const after = state.doc.sliceString(to, afterEnd)

  if (before === wrapper && after === wrapper) {
    // Remove wrapper from surrounding context
    view.dispatch({
      changes: [
        { from: beforeStart, to: from, insert: '' },
        { from: to, to: afterEnd, insert: '' },
      ],
    })
  } else if (selectedText.startsWith(wrapper) && selectedText.endsWith(wrapper) && selectedText.length >= wLen * 2) {
    // Remove wrapper from within selection
    view.dispatch({
      changes: { from, to, insert: selectedText.slice(wLen, -wLen) },
    })
  } else if (selectedText.length > 0) {
    // Wrap the selection
    view.dispatch({
      changes: { from, to, insert: `${wrapper}${selectedText}${wrapper}` },
    })
  } else {
    // No selection — insert wrapper pair and place cursor between
    view.dispatch({
      changes: { from, to: from, insert: `${wrapper}${wrapper}` },
      selection: { anchor: from + wLen },
    })
  }
  view.focus()
}

/** Insert a link template, wrapping the selection as the link text. */
function insertLink(view: EditorView) {
  const { state } = view
  const { from, to } = state.selection.main
  const selectedText = state.doc.sliceString(from, to)

  if (selectedText) {
    const insert = `[${selectedText}](url)`
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + selectedText.length + 3, head: from + selectedText.length + 6 },
    })
  } else {
    const insert = '[text](url)'
    view.dispatch({
      changes: { from, to: from, insert },
      selection: { anchor: from + 1, head: from + 5 },
    })
  }
  view.focus()
}

/** Insert a fenced code block around selection or on a new line. */
function insertCodeBlock(view: EditorView) {
  const { state } = view
  const { from, to } = state.selection.main
  const selectedText = state.doc.sliceString(from, to)
  const line = state.doc.lineAt(from)

  if (selectedText) {
    const insert = `\`\`\`\n${selectedText}\n\`\`\``
    view.dispatch({ changes: { from, to, insert } })
  } else {
    // Insert on current line if empty, otherwise on new line
    const atLineStart = from === line.from && line.text.trim() === ''
    const insert = atLineStart ? '```\n\n```' : '\n```\n\n```'
    const cursorOffset = atLineStart ? 4 : 5
    view.dispatch({
      changes: { from, to: from, insert },
      selection: { anchor: from + cursorOffset },
    })
  }
  view.focus()
}

/** Insert a 3x3 markdown table template. */
function insertTable(view: EditorView) {
  const { state } = view
  const { from } = state.selection.main
  const line = state.doc.lineAt(from)
  const atLineStart = from === line.from && line.text.trim() === ''
  const table = [
    '| Header | Header | Header |',
    '| ------ | ------ | ------ |',
    '|        |        |        |',
    '|        |        |        |',
    '|        |        |        |',
  ].join('\n')
  const prefix = atLineStart ? '' : '\n'
  const insert = `${prefix}${table}\n`
  // Place cursor at first cell content (the first Header word)
  const cursorPos = from + prefix.length + 2
  view.dispatch({
    changes: { from, to: from, insert },
    selection: { anchor: cursorPos, head: cursorPos + 6 },
  })
  view.focus()
}

/** Prompt for an image URL and insert markdown image syntax. */
function insertImage(view: EditorView) {
  const url = window.prompt('Image URL:')
  if (!url) return
  const { state } = view
  const { from, to } = state.selection.main
  const selectedText = state.doc.sliceString(from, to)
  const alt = selectedText || 'image'
  const insert = `![${alt}](${url})`
  view.dispatch({
    changes: { from, to, insert },
  })
  view.focus()
}

/** Export the current document as a .md file download. */
function exportMarkdown(view: EditorView, title?: string) {
  const content = view.state.doc.toString()
  const filename = `${(title || 'note').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')}.md`
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Insert a horizontal rule on a new line. */
function insertHorizontalRule(view: EditorView) {
  const { state } = view
  const { from } = state.selection.main
  const line = state.doc.lineAt(from)
  const atLineStart = from === line.from && line.text.trim() === ''
  const insert = atLineStart ? '---\n' : '\n---\n'
  view.dispatch({
    changes: { from, to: from, insert },
    selection: { anchor: from + insert.length },
  })
  view.focus()
}

/** Toggle numbered list — adds `1. ` or removes existing `N. ` prefix. */
function toggleNumberedList(view: EditorView) {
  const { state } = view
  const { from, to } = state.selection.main
  const startLine = state.doc.lineAt(from)
  const endLine = state.doc.lineAt(to)

  const changes: { from: number; to: number; insert: string }[] = []
  let counter = 1
  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = state.doc.line(i)
    const numMatch = line.text.match(/^\d+\.\s/)
    if (numMatch) {
      changes.push({ from: line.from, to: line.from + numMatch[0].length, insert: '' })
    } else {
      changes.push({ from: line.from, to: line.from, insert: `${counter}. ` })
      counter++
    }
  }

  view.dispatch({ changes })
  view.focus()
}

// ---------------------------------------------------------------------------
// Toolbar button
// ---------------------------------------------------------------------------

const btnStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 600,
  padding: 0,
  lineHeight: 1,
  flexShrink: 0,
}

function ToolbarButton({
  label,
  title,
  onClick,
  children,
}: {
  label: string
  title: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      className="hover-bg"
      aria-label={label}
      title={title}
      onClick={onClick}
      style={btnStyle}
    >
      {children}
    </button>
  )
}

function Separator() {
  return (
    <div
      aria-hidden
      style={{
        width: 1,
        height: 16,
        background: 'var(--border)',
        margin: '0 4px',
        flexShrink: 0,
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Toolbar component
// ---------------------------------------------------------------------------

interface EditorToolbarProps {
  viewRef: React.RefObject<EditorView | null>
  noteTitle?: string
}

function EditorToolbar({ viewRef, noteTitle }: EditorToolbarProps) {
  const run = (fn: (v: EditorView) => void) => {
    const v = viewRef.current
    if (v) fn(v)
  }

  const ICON = 14

  return (
    <div
      role="toolbar"
      aria-label="Formatting toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '4px 8px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card-solid)',
        flexShrink: 0,
      }}
    >
      {/* Headings */}
      <ToolbarButton label="Heading 1" title="Heading 1" onClick={() => run((v) => toggleHeading(v, 1))}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>H1</span>
      </ToolbarButton>
      <ToolbarButton label="Heading 2" title="Heading 2" onClick={() => run((v) => toggleHeading(v, 2))}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>H2</span>
      </ToolbarButton>
      <ToolbarButton label="Heading 3" title="Heading 3" onClick={() => run((v) => toggleHeading(v, 3))}>
        <span style={{ fontSize: 11, fontWeight: 700 }}>H3</span>
      </ToolbarButton>

      <Separator />

      {/* Inline formatting */}
      <ToolbarButton label="Bold" title="Bold (Ctrl+B)" onClick={() => run((v) => toggleWrap(v, '**'))}>
        <TextB size={ICON} weight="bold" />
      </ToolbarButton>
      <ToolbarButton label="Italic" title="Italic (Ctrl+I)" onClick={() => run((v) => toggleWrap(v, '*'))}>
        <TextItalic size={ICON} />
      </ToolbarButton>
      <ToolbarButton label="Strikethrough" title="Strikethrough (Ctrl+Shift+S)" onClick={() => run((v) => toggleWrap(v, '~~'))}>
        <TextStrikethrough size={ICON} />
      </ToolbarButton>
      <ToolbarButton label="Inline code" title="Inline code" onClick={() => run((v) => toggleWrap(v, '`'))}>
        <Code size={ICON} />
      </ToolbarButton>

      <Separator />

      {/* Lists */}
      <ToolbarButton label="Bullet list" title="Bullet list" onClick={() => run((v) => toggleLinePrefix(v, '- '))}>
        <ListBullets size={ICON} />
      </ToolbarButton>
      <ToolbarButton label="Numbered list" title="Numbered list" onClick={() => run((v) => toggleNumberedList(v))}>
        <ListNumbers size={ICON} />
      </ToolbarButton>
      <ToolbarButton label="Checklist" title="Checklist" onClick={() => run((v) => toggleLinePrefix(v, '- [ ] '))}>
        <ListChecks size={ICON} />
      </ToolbarButton>

      <Separator />

      {/* Block / insert */}
      <ToolbarButton label="Link" title="Link (Ctrl+K)" onClick={() => run(insertLink)}>
        <LinkSimple size={ICON} />
      </ToolbarButton>
      <ToolbarButton label="Blockquote" title="Blockquote" onClick={() => run((v) => toggleLinePrefix(v, '> '))}>
        <Quotes size={ICON} />
      </ToolbarButton>
      <ToolbarButton label="Code block" title="Code block" onClick={() => run(insertCodeBlock)}>
        <CodeBlock size={ICON} />
      </ToolbarButton>
      <ToolbarButton label="Horizontal rule" title="Horizontal rule" onClick={() => run(insertHorizontalRule)}>
        <Minus size={ICON} />
      </ToolbarButton>
      <ToolbarButton label="Insert table" title="Insert table" onClick={() => run(insertTable)}>
        <Table size={ICON} />
      </ToolbarButton>
      <ToolbarButton label="Insert image" title="Insert image from URL" onClick={() => run(insertImage)}>
        <ImageSquare size={ICON} />
      </ToolbarButton>

      <Separator />

      {/* Export */}
      <ToolbarButton label="Export as Markdown" title="Export as Markdown" onClick={() => run((v) => exportMarkdown(v, noteTitle))}>
        <Export size={ICON} />
      </ToolbarButton>
    </div>
  )
}

export default memo(EditorToolbar)

// Export formatting functions so NoteEditor can wire keyboard shortcuts
export { toggleWrap, insertLink, toggleLinePrefix, insertTable, exportMarkdown }
