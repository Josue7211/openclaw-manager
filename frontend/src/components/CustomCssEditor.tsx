/**
 * CustomCssEditor — CodeMirror-based CSS editor for custom user CSS.
 *
 * Two-tab layout:
 *   Tab 1: Built-in CodeMirror editor with CSS syntax highlighting
 *   Tab 2: External file path with Tauri file watcher support
 *
 * CSS is injected via a <style id="custom-css"> element, always last in <head>.
 */

import { useState, useRef, useEffect, useCallback, memo } from 'react'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { css } from '@codemirror/lang-css'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  indentOnInput,
} from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { Warning } from '@phosphor-icons/react'

const STORAGE_KEY = 'custom-css'
const FILE_PATH_KEY = 'custom-css-file-path'
const STYLE_ID = 'custom-css'
const STYLE_EXTERNAL_ID = 'custom-css-external'

// ---------------------------------------------------------------------------
// CSS Injection helpers
// ---------------------------------------------------------------------------

function injectCustomCss(cssText: string, styleId: string = STYLE_ID): void {
  let el = document.getElementById(styleId) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = styleId
    document.head.appendChild(el)
  }
  el.textContent = cssText
  // Ensure it's the last child of <head> so it overrides everything
  if (el.parentNode && el !== el.parentNode.lastChild) {
    el.parentNode.appendChild(el)
  }
}

function removeCustomCss(styleId: string = STYLE_ID): void {
  const el = document.getElementById(styleId)
  if (el) el.remove()
}

// ---------------------------------------------------------------------------
// CodeMirror theme for the CSS editor
// ---------------------------------------------------------------------------

const cssEditorTheme = EditorView.theme({
  '&': {
    fontSize: '13px',
    lineHeight: '1.6',
    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
    background: 'var(--bg-card-solid)',
    borderRadius: '8px',
    border: '1px solid var(--border)',
  },
  '.cm-content': {
    caretColor: 'var(--accent)',
    padding: '12px 0',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--accent)',
    borderLeftWidth: '1.5px',
  },
  '.cm-selectionBackground': {
    background: 'var(--accent-a15) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    background: 'var(--accent-a30) !important',
  },
  '.cm-activeLine': {
    background: 'var(--hover-bg)',
  },
  '.cm-gutters': {
    background: 'var(--bg-card-solid)',
    borderRight: '1px solid var(--border)',
    color: 'var(--text-muted)',
  },
  '.cm-scroller': {
    overflow: 'auto',
    maxHeight: '500px',
    minHeight: '400px',
  },
})

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CustomCssEditor = memo(function CustomCssEditor() {
  const [activeTab, setActiveTab] = useState<'editor' | 'external'>('editor')
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // External file state
  const [filePath, setFilePath] = useState(() => localStorage.getItem(FILE_PATH_KEY) || '')
  const [fileStatus, setFileStatus] = useState<'watching' | 'missing' | 'none'>('none')
  const fileContentRef = useRef<string>('')
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Apply saved CSS on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      injectCustomCss(saved)
    }
    return () => {
      // Don't remove CSS on unmount -- it should persist while the app is running
    }
  }, [])

  // Initialize CodeMirror editor
  useEffect(() => {
    if (activeTab !== 'editor' || !editorContainerRef.current) return
    if (editorViewRef.current) return // Already initialized

    const initialDoc = localStorage.getItem(STORAGE_KEY) || ''

    const updateListener = EditorView.updateListener.of(update => {
      if (update.docChanged) {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
          const value = update.state.doc.toString()
          localStorage.setItem(STORAGE_KEY, value)
          injectCustomCss(value)
        }, 500)
      }
    })

    const view = new EditorView({
      parent: editorContainerRef.current,
      state: EditorState.create({
        doc: initialDoc,
        extensions: [
          lineNumbers(),
          history(),
          bracketMatching(),
          indentOnInput(),
          closeBrackets(),
          css(),
          syntaxHighlighting(defaultHighlightStyle),
          keymap.of([...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap]),
          cssEditorTheme,
          updateListener,
        ],
      }),
    })

    editorViewRef.current = view

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      view.destroy()
      editorViewRef.current = null
    }
  }, [activeTab])

  const handleClear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    removeCustomCss()
    if (editorViewRef.current) {
      editorViewRef.current.dispatch({
        changes: {
          from: 0,
          to: editorViewRef.current.state.doc.length,
          insert: '',
        },
      })
    }
  }, [])

  // External file: browse handler
  const handleBrowse = useCallback(async () => {
    if (!window.__TAURI_INTERNALS__) return
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        filters: [{ name: 'CSS', extensions: ['css'] }],
        multiple: false,
      })
      if (selected && typeof selected === 'string') {
        setFilePath(selected)
        localStorage.setItem(FILE_PATH_KEY, selected)
      }
    } catch {
      // Dialog cancelled or error
    }
  }, [])

  // External file: poll for changes
  useEffect(() => {
    if (!filePath || activeTab !== 'external') {
      setFileStatus(filePath ? 'none' : 'none')
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      return
    }

    if (!window.__TAURI_INTERNALS__) {
      setFileStatus('none')
      return
    }

    const readFile = async () => {
      try {
        const { readTextFile } = await import('@tauri-apps/plugin-fs')
        const content = await readTextFile(filePath)
        if (content !== fileContentRef.current) {
          fileContentRef.current = content
          injectCustomCss(content, STYLE_EXTERNAL_ID)
        }
        setFileStatus('watching')
      } catch {
        setFileStatus('missing')
      }
    }

    // Initial read
    readFile()

    // Poll every 2 seconds
    pollIntervalRef.current = setInterval(readFile, 2000)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [filePath, activeTab])

  // Clean up external CSS when file path is cleared
  const handleClearFilePath = useCallback(() => {
    setFilePath('')
    localStorage.removeItem(FILE_PATH_KEY)
    removeCustomCss(STYLE_EXTERNAL_ID)
    setFileStatus('none')
    fileContentRef.current = ''
  }, [])

  const isTauri = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Warning banner */}
      <div
        role="alert"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: 'var(--warning-a12, rgba(251, 191, 36, 0.12))',
          border: '1px solid var(--warning-a30, rgba(251, 191, 36, 0.3))',
          borderRadius: '8px',
          fontSize: '13px',
          color: 'var(--warning)',
        }}
      >
        <Warning size={16} weight="fill" style={{ flexShrink: 0 }} />
        <span>Custom CSS can break the app's layout. Use Reset if something goes wrong.</span>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={() => setActiveTab('editor')}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'editor' ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeTab === 'editor' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'editor' ? 600 : 400,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Editor
        </button>
        <button
          onClick={() => setActiveTab('external')}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'external' ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeTab === 'external' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'external' ? 600 : 400,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          External File
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'editor' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div ref={editorContainerRef} aria-label="Custom CSS editor" />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleClear}
              style={{
                padding: '6px 14px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Clear Custom CSS
            </button>
          </div>
        </div>
      )}

      {activeTab === 'external' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              value={filePath}
              onChange={e => {
                setFilePath(e.target.value)
                localStorage.setItem(FILE_PATH_KEY, e.target.value)
              }}
              placeholder="Path to .css file..."
              aria-label="External CSS file path"
              style={{
                flex: 1,
                padding: '8px 12px',
                background: 'var(--bg-card-solid)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontFamily: 'var(--font-mono)',
              }}
            />
            <button
              onClick={handleBrowse}
              disabled={!isTauri}
              title={!isTauri ? 'Available in desktop app' : undefined}
              style={{
                padding: '8px 14px',
                background: 'var(--bg-card-solid)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: isTauri ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: '13px',
                cursor: isTauri ? 'pointer' : 'not-allowed',
                opacity: isTauri ? 1 : 0.6,
              }}
            >
              Browse...
            </button>
            {filePath && (
              <button
                onClick={handleClearFilePath}
                aria-label="Clear file path"
                style={{
                  padding: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                &times;
              </button>
            )}
          </div>

          {/* Status indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background:
                  fileStatus === 'watching'
                    ? 'var(--secondary)'
                    : fileStatus === 'missing'
                    ? 'var(--red)'
                    : 'var(--text-muted)',
                flexShrink: 0,
              }}
            />
            <span style={{ color: 'var(--text-secondary)' }}>
              {fileStatus === 'watching' && 'Watching for changes'}
              {fileStatus === 'missing' && 'File not found'}
              {fileStatus === 'none' && 'No file selected'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
})

export default CustomCssEditor
