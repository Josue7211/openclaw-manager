import { useEffect, useRef, memo } from 'react'
import { EditorView, keymap, placeholder, drawSelection } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  HighlightStyle,
  bracketMatching,
  indentOnInput,
} from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import type { VaultNote } from './types'

const mcTheme = EditorView.theme(
  {
    '&': {
      fontSize: '14.5px',
      lineHeight: '1.7',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
      height: '100%',
      background: 'transparent',
    },
    '.cm-content': {
      caretColor: 'var(--accent)',
      padding: '24px 0 80px',
      maxWidth: '680px',
      margin: '0 auto',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--accent)',
      borderLeftWidth: '1.5px',
    },
    '.cm-selectionBackground': {
      background: 'rgba(167, 139, 250, 0.18) !important',
    },
    '&.cm-focused .cm-selectionBackground': {
      background: 'rgba(167, 139, 250, 0.25) !important',
    },
    '.cm-activeLine': {
      background: 'transparent',
    },
    '&.cm-focused .cm-activeLine': {
      background: 'rgba(255, 255, 255, 0.015)',
    },
    '.cm-gutters': {
      display: 'none',
    },
    '.cm-scroller': {
      overflow: 'auto',
      padding: '0 48px',
    },
    // Headings
    '.cm-header-1': {
      fontSize: '1.8em',
      fontWeight: '700',
      color: 'var(--text-primary)',
      lineHeight: '1.3',
      letterSpacing: '-0.02em',
    },
    '.cm-header-2': {
      fontSize: '1.4em',
      fontWeight: '600',
      color: 'var(--text-primary)',
      lineHeight: '1.35',
      letterSpacing: '-0.01em',
    },
    '.cm-header-3': {
      fontSize: '1.15em',
      fontWeight: '600',
      color: 'var(--text-primary)',
      lineHeight: '1.4',
    },
    '.cm-header-4, .cm-header-5, .cm-header-6': {
      fontSize: '1em',
      fontWeight: '600',
      color: 'var(--text-secondary)',
    },
    // Dim formatting markers
    '.cm-formatting': {
      opacity: '0.25',
    },
    // Bold & italic
    '.cm-strong': {
      fontWeight: '600',
      color: 'var(--text-primary)',
    },
    '.cm-emphasis': {
      fontStyle: 'italic',
      color: 'var(--text-primary)',
    },
    // Inline code
    '.cm-monospace': {
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", monospace',
      fontSize: '0.88em',
      background: 'var(--bg-white-04)',
      borderRadius: '3px',
      padding: '1px 5px',
      color: 'var(--accent-bright)',
    },
    // Links
    '.cm-link': {
      color: 'var(--accent)',
      textDecoration: 'none',
    },
    '.cm-url': {
      color: 'var(--text-muted)',
      fontSize: '0.85em',
      opacity: 0.6,
    },
    // Blockquote
    '.cm-quote': {
      color: 'var(--text-secondary)',
      fontStyle: 'italic',
      borderLeft: '2px solid var(--accent-dim)',
      paddingLeft: '14px',
    },
    // Placeholder
    '.cm-placeholder': {
      color: 'var(--text-muted)',
      fontStyle: 'italic',
      opacity: 0.4,
    },
    '.cm-selectionMatch': {
      background: 'rgba(167, 139, 250, 0.12)',
    },
  },
  { dark: true },
)

const mcHighlighting = HighlightStyle.define([
  { tag: tags.heading1, class: 'cm-header-1' },
  { tag: tags.heading2, class: 'cm-header-2' },
  { tag: tags.heading3, class: 'cm-header-3' },
  { tag: tags.heading4, class: 'cm-header-4' },
  { tag: tags.heading5, class: 'cm-header-5' },
  { tag: tags.heading6, class: 'cm-header-6' },
  { tag: tags.strong, class: 'cm-strong' },
  { tag: tags.emphasis, class: 'cm-emphasis' },
  { tag: tags.monospace, class: 'cm-monospace' },
  { tag: tags.link, class: 'cm-link' },
  { tag: tags.url, class: 'cm-url' },
  { tag: tags.quote, class: 'cm-quote' },
  { tag: tags.processingInstruction, class: 'cm-formatting' },
  { tag: tags.meta, class: 'cm-formatting' },
  { tag: tags.comment, color: 'var(--text-muted)' },
  // Code block syntax highlighting
  { tag: tags.keyword, color: '#c792ea' },
  { tag: tags.string, color: '#c3e88d' },
  { tag: tags.number, color: '#f78c6c' },
  { tag: tags.bool, color: '#ff5370' },
  { tag: tags.variableName, color: '#82aaff' },
  { tag: tags.function(tags.variableName), color: '#82aaff' },
  { tag: tags.typeName, color: '#ffcb6b' },
  { tag: tags.className, color: '#ffcb6b' },
  { tag: tags.propertyName, color: '#f07178' },
  { tag: tags.operator, color: '#89ddff' },
  { tag: tags.punctuation, color: '#89ddff' },
])

interface NoteEditorProps {
  note: VaultNote
  onChange: (content: string) => void
  onWikilinkClick: (link: string) => void
}

export default memo(function NoteEditor({ note, onChange, onWikilinkClick }: NoteEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onWikilinkClickRef = useRef(onWikilinkClick)
  const noteIdRef = useRef(note._id)

  onChangeRef.current = onChange
  onWikilinkClickRef.current = onWikilinkClick

  useEffect(() => {
    if (!containerRef.current) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString())
      }
    })

    const clickHandler = EditorView.domEventHandlers({
      click(event, view) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos === null) return false
        const line = view.state.doc.lineAt(pos)
        const col = pos - line.from
        const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
        let m
        while ((m = re.exec(line.text)) !== null) {
          if (col >= m.index && col <= m.index + m[0].length) {
            event.preventDefault()
            onWikilinkClickRef.current(m[1].trim())
            return true
          }
        }
        return false
      },
    })

    const state = EditorState.create({
      doc: note.content,
      extensions: [
        mcTheme,
        syntaxHighlighting(mcHighlighting),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        history(),
        drawSelection(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        highlightSelectionMatches(),
        placeholder('Start writing...'),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...closeBracketsKeymap,
          indentWithTab,
        ]),
        updateListener,
        clickHandler,
        EditorView.lineWrapping,
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view
    noteIdRef.current = note._id

    return () => { view.destroy(); viewRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note._id])

  useEffect(() => {
    const view = viewRef.current
    if (!view || note._id !== noteIdRef.current) return
    const currentContent = view.state.doc.toString()
    if (currentContent !== note.content) {
      view.dispatch({
        changes: { from: 0, to: currentContent.length, insert: note.content },
      })
    }
  }, [note.content, note._id])

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflow: 'hidden',
        background: 'var(--bg-base)',
        userSelect: 'text',
        WebkitUserSelect: 'text' as never,
      }}
    />
  )
})
