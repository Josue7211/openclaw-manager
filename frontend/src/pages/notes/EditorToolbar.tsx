import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { EditorView } from '@codemirror/view'
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  CaretDown,
  TextB,
  TextItalic,
  TextUnderline,
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
  FileText,
} from '@phosphor-icons/react'
import { redo, undo } from '@codemirror/commands'

const COMPACT_SOURCE_TOOLBAR_VIEWPORT_WIDTH = 760
const COMPACT_SOURCE_TOOLBAR_ACTUAL_WIDTH = 520
const MENU_VIEWPORT_MARGIN = 8

function viewportAnchoredMenuStyle(
  trigger: HTMLElement | null,
  menu: HTMLElement | null,
  fallbackWidth = 196,
): CSSProperties {
  if (typeof window === 'undefined' || !trigger) {
    return {
      position: 'absolute',
      top: 32,
      left: 0,
      right: 'auto',
    }
  }
  const triggerRect = trigger.getBoundingClientRect()
  const measuredWidth = menu?.getBoundingClientRect().width || fallbackWidth
  const width = Math.min(measuredWidth, window.innerWidth - MENU_VIEWPORT_MARGIN * 2)
  const alignRight = triggerRect.left + width > window.innerWidth - MENU_VIEWPORT_MARGIN
  const availableBelow = Math.max(160, window.innerHeight - triggerRect.bottom - MENU_VIEWPORT_MARGIN - 4)

  return {
    position: 'fixed',
    top: Math.min(triggerRect.bottom + 4, window.innerHeight - MENU_VIEWPORT_MARGIN),
    left: alignRight
      ? Math.max(MENU_VIEWPORT_MARGIN, window.innerWidth - width - MENU_VIEWPORT_MARGIN)
      : Math.max(MENU_VIEWPORT_MARGIN, triggerRect.left),
    right: 'auto',
    maxWidth: `min(240px, calc(100vw - ${MENU_VIEWPORT_MARGIN * 2}px))`,
    maxHeight: `min(320px, ${availableBelow}px)`,
  }
}

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

/** Wrap selection with different opening/closing markers, used for small HTML spans. */
function toggleWrapPair(view: EditorView, open: string, close: string) {
  const { state } = view
  const { from, to } = state.selection.main
  const selectedText = state.doc.sliceString(from, to)
  const beforeStart = Math.max(0, from - open.length)
  const afterEnd = Math.min(state.doc.length, to + close.length)
  const before = state.doc.sliceString(beforeStart, from)
  const after = state.doc.sliceString(to, afterEnd)

  if (before === open && after === close) {
    view.dispatch({
      changes: [
        { from: beforeStart, to: from, insert: '' },
        { from: to, to: afterEnd, insert: '' },
      ],
    })
  } else if (selectedText.length > 0) {
    view.dispatch({
      changes: { from, to, insert: `${open}${selectedText}${close}` },
    })
  } else {
    view.dispatch({
      changes: { from, to: from, insert: `${open}${close}` },
      selection: { anchor: from + open.length },
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

/** Insert an Obsidian wikilink, using the selection as the target when present. */
function insertWikilink(view: EditorView, embed = false) {
  const { state } = view
  const { from, to } = state.selection.main
  const selectedText = state.doc.sliceString(from, to).trim()
  const target = selectedText || 'Note title'
  const insert = `${embed ? '!' : ''}[[${target}]]`
  const targetStart = from + (embed ? 3 : 2)
  const targetEnd = targetStart + target.length

  view.dispatch({
    changes: { from, to, insert },
    selection: selectedText ? { anchor: from + insert.length } : { anchor: targetStart, head: targetEnd },
  })
  view.focus()
}

/** Insert an Obsidian Markdown comment, wrapping selected text when present. */
function insertObsidianComment(view: EditorView) {
  const { state } = view
  const { from, to } = state.selection.main
  const selectedText = state.doc.sliceString(from, to).trim()
  const body = selectedText || 'Comment'
  const insert = `%% ${body} %%`
  const bodyStart = from + 3
  const bodyEnd = bodyStart + body.length

  view.dispatch({
    changes: { from, to, insert },
    selection: selectedText ? { anchor: from + insert.length } : { anchor: bodyStart, head: bodyEnd },
  })
  view.focus()
}

/** Insert an Obsidian block ID anchor, selecting the editable ID portion. */
function insertBlockId(view: EditorView) {
  const { state } = view
  const { from, to } = state.selection.main
  const insert = '^block-id'

  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + 1, head: from + insert.length },
  })
  view.focus()
}

/** Insert an Obsidian footnote reference and definition. */
function insertFootnote(view: EditorView) {
  const { state } = view
  const { from, to } = state.selection.main
  const selectedText = state.doc.sliceString(from, to).trim()
  const body = selectedText || 'Footnote text'
  const insert = `[^1]\n\n[^1]: ${body}`
  const bodyStart = from + '[^1]\n\n[^1]: '.length
  const bodyEnd = bodyStart + body.length

  view.dispatch({
    changes: { from, to, insert },
    selection: selectedText ? { anchor: from + insert.length } : { anchor: bodyStart, head: bodyEnd },
  })
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

/** Insert a compact Markdown table. */
function insertTable(view: EditorView) {
  const { state } = view
  const { from } = state.selection.main
  const line = state.doc.lineAt(from)
  const prefix = from === line.from && line.text.trim() === '' ? '' : '\n'
  const insert = `${prefix}| Column | Column | Column |\n| --- | --- | --- |\n|  |  |  |\n`
  view.dispatch({
    changes: { from, to: from, insert },
    selection: { anchor: from + prefix.length + 2, head: from + prefix.length + 8 },
  })
  view.focus()
}

/** Insert an Obsidian-style callout, wrapping the current selection when present. */
function insertCallout(view: EditorView, type: string, title: string, folded = false) {
  const { state } = view
  const { from, to } = state.selection.main
  const selectedText = state.doc.sliceString(from, to)
  const line = state.doc.lineAt(from)
  const prefix = from === line.from && line.text.trim() === '' ? '' : '\n'
  const foldMarker = folded ? '-' : ''
  const body = selectedText.trim()
    ? selectedText.split('\n').map(text => `> ${text}`).join('\n')
    : '> Content'
  const insert = `${prefix}> [!${type}]${foldMarker} ${title}\n${body}\n`
  const titleStart = from + prefix.length + `> [!${type}]${foldMarker} `.length
  const titleEnd = titleStart + title.length

  view.dispatch({
    changes: { from, to, insert },
    selection: selectedText.trim()
      ? { anchor: from + insert.length }
      : { anchor: titleStart, head: titleEnd },
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

function ToolbarMenu({
  label,
  text,
  icon,
  showText = true,
  open,
  onToggle,
  children,
}: {
  label: string
  text: string
  icon?: ReactNode
  showText?: boolean
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const pendingOpenFocusRef = useRef<'first' | 'last' | null>(null)
  const typeaheadRef = useRef('')
  const typeaheadTimerRef = useRef<number | null>(null)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const restoreTriggerFocus = () => requestAnimationFrame(() => triggerRef.current?.focus())

  const resetTypeahead = () => {
    typeaheadRef.current = ''
    if (typeaheadTimerRef.current) {
      window.clearTimeout(typeaheadTimerRef.current)
      typeaheadTimerRef.current = null
    }
  }

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle({})
      resetTypeahead()
      return
    }
    const updateMenuStyle = () => {
      setMenuStyle(viewportAnchoredMenuStyle(triggerRef.current, menuRef.current))
    }
    updateMenuStyle()
    window.addEventListener('resize', updateMenuStyle)
    window.addEventListener('scroll', updateMenuStyle, true)
    return () => {
      window.removeEventListener('resize', updateMenuStyle)
      window.removeEventListener('scroll', updateMenuStyle, true)
    }
  }, [open])

  useEffect(() => () => resetTypeahead(), [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && triggerRef.current?.contains(target)) return
      if (target instanceof Node && menuRef.current?.contains(target)) return
      onToggle()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onToggle()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onToggle, open])

  useEffect(() => {
    if (!open) return
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    if (pendingOpenFocusRef.current === 'last') {
      pendingOpenFocusRef.current = null
      items[items.length - 1]?.focus()
      return
    }
    pendingOpenFocusRef.current = null
    items[0]?.focus()
  }, [open])

  const focusItem = (direction: 'next' | 'previous' | 'first' | 'last') => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    if (items.length === 0) return
    if (direction === 'first') {
      items[0].focus()
      return
    }
    if (direction === 'last') {
      items[items.length - 1].focus()
      return
    }
    const currentIndex = Math.max(0, items.findIndex(item => item === document.activeElement))
    const nextIndex = direction === 'next'
      ? (currentIndex + 1) % items.length
      : (currentIndex - 1 + items.length) % items.length
    items[nextIndex].focus()
  }

  const focusItemByTypeahead = (key: string) => {
    typeaheadRef.current = `${typeaheadRef.current}${key.toLowerCase()}`.slice(0, 32)
    if (typeaheadTimerRef.current) window.clearTimeout(typeaheadTimerRef.current)
    typeaheadTimerRef.current = window.setTimeout(() => {
      typeaheadRef.current = ''
      typeaheadTimerRef.current = null
    }, 700)

    const query = typeaheadRef.current
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    if (items.length === 0) return
    const currentIndex = items.findIndex(item => item === document.activeElement)
    const orderedItems = [
      ...items.slice(Math.max(0, currentIndex + 1)),
      ...items.slice(0, Math.max(0, currentIndex + 1)),
    ]
    const match = orderedItems.find(item => item.textContent?.trim().toLowerCase().startsWith(query))
      ?? orderedItems.find(item => item.textContent?.trim().toLowerCase().includes(query))
    match?.focus()
    match?.scrollIntoView?.({ block: 'nearest' })
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        ref={triggerRef}
        type="button"
        className="hover-bg"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault()
            pendingOpenFocusRef.current = 'first'
            onToggle()
          }
          if (event.key === 'ArrowUp' && !open) {
            event.preventDefault()
            pendingOpenFocusRef.current = 'last'
            onToggle()
          }
          if (event.key === 'Escape' && open) {
            event.preventDefault()
            onToggle()
            restoreTriggerFocus()
          }
        }}
        style={{
          ...btnStyle,
          width: 'auto',
          minWidth: showText ? 48 : 28,
          padding: showText ? '0 7px' : 0,
          gap: 4,
        }}
      >
        {icon && <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>}
        {showText && <span>{text}</span>}
        {showText && <CaretDown size={11} aria-hidden style={{ color: 'var(--text-faint)', flexShrink: 0 }} />}
      </button>
      {open && typeof document !== 'undefined' && createPortal((
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('button[role="menuitem"]')) restoreTriggerFocus()
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              focusItem('next')
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              focusItem('previous')
            }
            if (event.key === 'Home') {
              event.preventDefault()
              focusItem('first')
            }
            if (event.key === 'End') {
              event.preventDefault()
              focusItem('last')
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              onToggle()
              restoreTriggerFocus()
            }
            if (
              event.key.length === 1 &&
              event.key.trim().length > 0 &&
              !event.altKey &&
              !event.ctrlKey &&
              !event.metaKey
            ) {
              event.preventDefault()
              focusItemByTypeahead(event.key)
            }
          }}
          style={{
            position: 'absolute',
            top: 32,
            left: 0,
            zIndex: 80,
            minWidth: 178,
            maxHeight: 320,
            overflow: 'auto',
            padding: 5,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-panel)',
            boxShadow: '0 14px 30px var(--overlay-heavy)',
            ...menuStyle,
          }}
        >
          {children}
        </div>
      ), document.body)}
    </div>
  )
}

function ToolbarMenuItem({
  label,
  icon,
  onClick,
}: {
  label: string
  icon?: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="hover-bg"
      onClick={onClick}
      style={{
        width: '100%',
        minHeight: 28,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        background: 'transparent',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: 12,
        fontWeight: 550,
        padding: '0 9px 0 6px',
        textAlign: 'left',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden style={{ width: 14, display: 'inline-flex', justifyContent: 'center', color: 'var(--text-muted)' }}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  )
}

function ToolbarMenuDivider() {
  return <div role="separator" style={{ height: 1, margin: '5px 4px', background: 'var(--border)' }} />
}

function ToolbarMenuSection({ label }: { label: string }) {
  return (
    <div
      role="presentation"
      style={{
        padding: '7px 8px 4px',
        color: 'var(--text-faint)',
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toolbar component
// ---------------------------------------------------------------------------

interface EditorToolbarProps {
  viewRef: React.RefObject<EditorView | null>
  noteTitle?: string
}

function EditorToolbar({ viewRef }: EditorToolbarProps) {
  const [openMenu, setOpenMenu] = useState<'style' | 'inline' | 'blocks' | 'insert' | null>(null)
  const [compactToolbar, setCompactToolbar] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < COMPACT_SOURCE_TOOLBAR_VIEWPORT_WIDTH
  })
  const toolbarRef = useRef<HTMLDivElement>(null)
  const run = (fn: (v: EditorView) => void) => {
    const v = viewRef.current
    if (v) fn(v)
  }

  const runAndClose = (fn: (v: EditorView) => void) => {
    run(fn)
    setOpenMenu(null)
  }

  const ICON = 14

  useEffect(() => {
    const updateToolbarDensity = (observedWidth?: number) => {
      const measuredWidth = observedWidth ?? toolbarRef.current?.getBoundingClientRect().width ?? 0
      const nextCompactToolbar =
        window.innerWidth < COMPACT_SOURCE_TOOLBAR_VIEWPORT_WIDTH ||
        (measuredWidth > 0 && measuredWidth < COMPACT_SOURCE_TOOLBAR_ACTUAL_WIDTH)
      setCompactToolbar((previous) => {
        if (previous !== nextCompactToolbar) setOpenMenu(null)
        return nextCompactToolbar
      })
    }
    updateToolbarDensity()
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(entries => {
          updateToolbarDensity(entries[0]?.contentRect.width)
        })
    const handleWindowResize = () => updateToolbarDensity()
    if (toolbarRef.current) observer?.observe(toolbarRef.current)
    window.addEventListener('resize', handleWindowResize)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', handleWindowResize)
    }
  }, [])

  const styleItems = (
    <>
      <ToolbarMenuItem label="Heading 1" icon={<span style={{ fontWeight: 700 }}>H1</span>} onClick={() => runAndClose((v) => toggleHeading(v, 1))} />
      <ToolbarMenuItem label="Heading 2" icon={<span style={{ fontWeight: 700 }}>H2</span>} onClick={() => runAndClose((v) => toggleHeading(v, 2))} />
      <ToolbarMenuItem label="Heading 3" icon={<span style={{ fontWeight: 700 }}>H3</span>} onClick={() => runAndClose((v) => toggleHeading(v, 3))} />
    </>
  )

  const inlineItems = (
    <>
      <ToolbarMenuItem label="Bold" icon={<TextB size={ICON} weight="bold" />} onClick={() => runAndClose((v) => toggleWrap(v, '**'))} />
      <ToolbarMenuItem label="Italic" icon={<TextItalic size={ICON} />} onClick={() => runAndClose((v) => toggleWrap(v, '*'))} />
      <ToolbarMenuItem label="Underline" icon={<TextUnderline size={ICON} />} onClick={() => runAndClose((v) => toggleWrapPair(v, '<u>', '</u>'))} />
      <ToolbarMenuItem label="Strikethrough" icon={<TextStrikethrough size={ICON} />} onClick={() => runAndClose((v) => toggleWrap(v, '~~'))} />
      <ToolbarMenuItem label="Inline code" icon={<Code size={ICON} />} onClick={() => runAndClose((v) => toggleWrap(v, '`'))} />
    </>
  )

  const blockItems = (
    <>
      <ToolbarMenuItem label="Bullet list" icon={<ListBullets size={ICON} />} onClick={() => runAndClose((v) => toggleLinePrefix(v, '- '))} />
      <ToolbarMenuItem label="Numbered list" icon={<ListNumbers size={ICON} />} onClick={() => runAndClose(toggleNumberedList)} />
      <ToolbarMenuItem label="Checklist" icon={<ListChecks size={ICON} />} onClick={() => runAndClose((v) => toggleLinePrefix(v, '- [ ] '))} />
      <ToolbarMenuDivider />
      <ToolbarMenuItem label="Blockquote" icon={<Quotes size={ICON} />} onClick={() => runAndClose((v) => toggleLinePrefix(v, '> '))} />
      <ToolbarMenuItem label="Code block" icon={<CodeBlock size={ICON} />} onClick={() => runAndClose(insertCodeBlock)} />
    </>
  )

  const insertItems = (
    <>
      <ToolbarMenuItem label="Link" icon={<LinkSimple size={ICON} />} onClick={() => runAndClose(insertLink)} />
      <ToolbarMenuItem label="Wikilink" icon={<LinkSimple size={ICON} />} onClick={() => runAndClose((v) => insertWikilink(v))} />
      <ToolbarMenuItem label="Embed note" icon={<FileText size={ICON} />} onClick={() => runAndClose((v) => insertWikilink(v, true))} />
      <ToolbarMenuItem label="Comment" icon={<Code size={ICON} />} onClick={() => runAndClose(insertObsidianComment)} />
      <ToolbarMenuItem label="Block ID" icon={<Code size={ICON} />} onClick={() => runAndClose(insertBlockId)} />
      <ToolbarMenuItem label="Footnote" icon={<FileText size={ICON} />} onClick={() => runAndClose(insertFootnote)} />
      <ToolbarMenuItem label="Table" icon={<Table size={ICON} />} onClick={() => runAndClose(insertTable)} />
      <ToolbarMenuDivider />
      <ToolbarMenuItem label="Note callout" icon={<Quotes size={ICON} />} onClick={() => runAndClose((v) => insertCallout(v, 'note', 'Note'))} />
      <ToolbarMenuItem label="Warning callout" icon={<Quotes size={ICON} />} onClick={() => runAndClose((v) => insertCallout(v, 'warning', 'Warning'))} />
      <ToolbarMenuItem label="Folded tip callout" icon={<Quotes size={ICON} />} onClick={() => runAndClose((v) => insertCallout(v, 'tip', 'Tip', true))} />
      <ToolbarMenuDivider />
      <ToolbarMenuItem label="Horizontal rule" icon={<Minus size={ICON} />} onClick={() => runAndClose(insertHorizontalRule)} />
    </>
  )

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Formatting toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        height: 34,
        maxHeight: 34,
        padding: '3px 8px',
        borderBottom: '1px solid var(--border)',
        background: 'color-mix(in srgb, var(--bg-base, #0a0a0c) 96%, black)',
        flexShrink: 0,
        overflowX: 'visible',
        overflowY: 'visible',
        whiteSpace: 'nowrap',
        flexWrap: 'nowrap',
      }}
    >
      {/* History */}
      <ToolbarButton label="Undo" title="Undo (Ctrl+Z)" onClick={() => run((v) => undo(v))}>
        <ArrowCounterClockwise size={ICON} />
      </ToolbarButton>
      <ToolbarButton label="Redo" title="Redo (Ctrl+Y)" onClick={() => run((v) => redo(v))}>
        <ArrowClockwise size={ICON} />
      </ToolbarButton>

      <Separator />
      {compactToolbar ? (
        <ToolbarMenu
          label="Markdown formatting"
          text="Format"
          icon={<TextB size={14} weight="bold" />}
          showText={false}
          open={openMenu === 'insert'}
          onToggle={() => setOpenMenu(openMenu === 'insert' ? null : 'insert')}
        >
          <ToolbarMenuSection label="Style" />
          {styleItems}
          <ToolbarMenuSection label="Inline" />
          {inlineItems}
          <ToolbarMenuSection label="Blocks" />
          {blockItems}
          <ToolbarMenuSection label="Insert" />
          {insertItems}
        </ToolbarMenu>
      ) : (
        <>

          <ToolbarMenu
            label="Markdown style"
            text="Style"
            icon={<FileText size={14} />}
            open={openMenu === 'style'}
            onToggle={() => setOpenMenu(openMenu === 'style' ? null : 'style')}
          >
            {styleItems}
          </ToolbarMenu>

          <Separator />

          <ToolbarMenu
            label="Markdown inline formatting"
            text="Inline"
            icon={<TextB size={14} weight="bold" />}
            open={openMenu === 'inline'}
            onToggle={() => setOpenMenu(openMenu === 'inline' ? null : 'inline')}
          >
            {inlineItems}
          </ToolbarMenu>

          <Separator />

          <ToolbarMenu
            label="Markdown blocks"
            text="Blocks"
            icon={<ListBullets size={14} />}
            open={openMenu === 'blocks'}
            onToggle={() => setOpenMenu(openMenu === 'blocks' ? null : 'blocks')}
          >
            {blockItems}
          </ToolbarMenu>
          <ToolbarMenu
            label="Markdown insert"
            text="Insert"
            icon={<LinkSimple size={14} />}
            open={openMenu === 'insert'}
            onToggle={() => setOpenMenu(openMenu === 'insert' ? null : 'insert')}
          >
            {insertItems}
          </ToolbarMenu>
        </>
      )}
    </div>
  )
}

export default memo(EditorToolbar)

// Export formatting functions so NoteEditor can wire keyboard shortcuts
export { toggleWrap, toggleWrapPair, insertLink }
