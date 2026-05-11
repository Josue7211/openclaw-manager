import { useState, useCallback, useRef, useEffect, useMemo, lazy, Suspense, type ElementType, type ReactNode } from 'react'
import { Trash, ShareNetwork, PenNib, Cloud, CloudSlash, GitBranch, MagnifyingGlass, NotePencil, FolderPlus, Star, UploadSimple, Copy, FileDoc, FileHtml, FilePdf, FileText } from '@phosphor-icons/react'
import { useVault } from '@/hooks/notes/useVault'
import { linkFirstPlainMention, noteIdFromTitle, normalizeFolderPath, rewriteWikilinks } from '@/lib/vault'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
import { api } from '@/lib/api'
import FileTree from './FileTree'
import NoteEditor from './NoteEditor'
import BacklinksPanel from './BacklinksPanel'
import { NOTE_TEMPLATES, applyTemplate } from './templates'
import { downloadDocx, downloadHtml, downloadMarkdown, printNotePdf } from './export'

const GraphView = lazy(() => import('./GraphView'))

type ViewMode = 'editor' | 'graph'

interface CommandAction {
  id: string
  label: string
  detail?: string
  icon: ElementType
  onRun: () => void
}

export default function NotesPage() {
  const { notes, folders, loading, syncing, error, refresh, createNote, createFolder, updateNote, moveNote, deleteNote, deleteFolder } = useVault()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('graph')
  const [searchQuery, setSearchQuery] = useState('')
  const [treeWidth, setTreeWidth] = useState(220)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [focusMode, setFocusMode] = useLocalStorageState('mc-notes-focus-mode', false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [pinnedNoteIds, setPinnedNoteIds] = useLocalStorageState<string[]>('mc-pinned-note-ids', [])
  const [recentNoteIds, setRecentNoteIds] = useLocalStorageState<string[]>('mc-recent-note-ids', [])
  const [recentLimit, setRecentLimit] = useLocalStorageState('mc-notes-recent-limit', 5)
  const titleRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingContentRef = useRef<Map<string, string>>(new Map())

  const selected = notes.find((n) => n._id === selectedId) ?? null
  const pinnedNoteSet = useMemo(() => new Set(pinnedNoteIds), [pinnedNoteIds])

  const allNoteTitles = useMemo(
    () => notes
      .filter((n) => n.type === 'note')
      .flatMap((n) => [n.title, ...(n.aliases ?? [])]),
    [notes],
  )

  const normalizedRecentLimit = Math.max(1, Math.min(10, Number(recentLimit) || 5))

  useEffect(() => {
    if (!selectedId) return
    setRecentNoteIds((prev) => [selectedId, ...prev.filter((id) => id !== selectedId)].slice(0, 24))
  }, [selectedId, setRecentNoteIds])

  useEffect(() => {
    if (!editingTitle) setTitleDraft(selected?.title ?? '')
  }, [editingTitle, selected?.title])

  const handleCreate = useCallback(
    async (folder?: string, title = 'Untitled', content = '') => {
      const note = await createNote(title, folder, content)
      setSelectedId(note._id)
      setViewMode('editor')
      setTitleDraft(note.title)
      setTimeout(() => {
        setEditingTitle(true)
        titleRef.current?.select()
      }, 50)
    },
    [createNote],
  )

  const handleCreateDailyNote = useCallback(
    async (folder?: string) => {
      const daily = NOTE_TEMPLATES.find((template) => template.id === 'daily')
      const iso = new Date().toISOString().slice(0, 10)
      await handleCreate(folder, `Daily ${iso}`, daily ? applyTemplate(daily) : `# ${iso}\n\n`)
    },
    [handleCreate],
  )

  const handleCreateTemplate = useCallback(
    async (folder: string | undefined, templateId: string) => {
      const template = NOTE_TEMPLATES.find((item) => item.id === templateId)
      if (!template) return
      const title = template.id === 'meeting'
        ? 'Meeting Note'
        : template.id === 'project'
          ? 'Project Brief'
          : template.label
      await handleCreate(folder, title, applyTemplate(template))
    },
    [handleCreate],
  )

  const handleCreateFolder = useCallback(
    async (parent?: string) => {
      const name = window.prompt(parent ? `New folder in ${parent}` : 'New folder')
      if (!name) return
      const nextPath = normalizeFolderPath(parent ? `${parent}/${name}` : name)
      if (!nextPath) return
      await createFolder(nextPath)
    },
    [createFolder],
  )

  const handleDeleteNote = useCallback(async (id?: string) => {
    const targetId = id ?? selectedId
    if (!targetId) return
    const note = notes.find((n) => n._id === targetId)
    const label = note?.title || targetId
    if (!window.confirm(`Delete "${label}"?`)) return

    const idx = notes.findIndex((n) => n._id === targetId)
    await deleteNote(targetId)
    setPinnedNoteIds((prev) => prev.filter((noteId) => noteId !== targetId))
    setRecentNoteIds((prev) => prev.filter((noteId) => noteId !== targetId))
    const next = notes[idx + 1] ?? notes[idx - 1] ?? null
    if (selectedId === targetId) setSelectedId(next?._id ?? null)
  }, [selectedId, notes, deleteNote, setPinnedNoteIds, setRecentNoteIds])

  const handleDeleteFolder = useCallback(
    async (path: string) => {
      if (!path) return
      const hasContents = notes.some((note) => note.folder === path || note.folder.startsWith(`${path}/`))
      const hasChildFolder = folders.some((folder) => folder.path !== path && folder.path.startsWith(`${path}/`))
      if (hasContents || hasChildFolder) {
        window.alert('Only empty folders can be deleted.')
        return
      }
      if (!window.confirm(`Delete folder "${path}"?`)) return
      await deleteFolder(path)
    },
    [deleteFolder, folders, notes],
  )

  const handleRenameFolder = useCallback(
    async (path: string) => {
      if (!path) return
      const raw = window.prompt('Rename folder', path)
      if (!raw) return
      const nextPath = normalizeFolderPath(raw)
      if (!nextPath || nextPath === path) return
      if (nextPath.startsWith(`${path}/`)) {
        window.alert('Folder cannot be renamed inside itself.')
        return
      }

      const affectedFolders = folders
        .filter((folder) => folder.path === path || folder.path.startsWith(`${path}/`))
        .sort((a, b) => a.path.length - b.path.length)
      const affectedNotes = notes.filter((note) => note.folder === path || note.folder.startsWith(`${path}/`))

      for (const folder of affectedFolders) {
        const suffix = folder.path === path ? '' : folder.path.slice(path.length)
        await createFolder(`${nextPath}${suffix}`)
      }

      for (const note of affectedNotes) {
        const suffix = note.folder === path ? '' : note.folder.slice(path.length)
        const moved = await moveNote(note._id, `${nextPath}${suffix}`)
        setPinnedNoteIds((prev) => prev.map((noteId) => (noteId === note._id ? moved._id : noteId)))
        setRecentNoteIds((prev) => prev.map((noteId) => (noteId === note._id ? moved._id : noteId)))
        if (selectedId === note._id) setSelectedId(moved._id)
      }

      for (const folder of [...affectedFolders].sort((a, b) => b.path.length - a.path.length)) {
        await deleteFolder(folder.path)
      }
      await refresh()
    },
    [createFolder, deleteFolder, folders, moveNote, notes, refresh, selectedId, setPinnedNoteIds, setRecentNoteIds],
  )

  const handleRenameNote = useCallback((id: string) => {
    const note = notes.find((item) => item._id === id)
    setSelectedId(id)
    setViewMode('editor')
    setTitleDraft(note?.title ?? '')
    setTimeout(() => {
      setEditingTitle(true)
      titleRef.current?.select()
    }, 50)
  }, [notes])

  const handleDuplicateNote = useCallback(
    async (id: string) => {
      const note = notes.find((n) => n._id === id)
      if (!note || note.type === 'attachment') return
      const duplicate = await createNote(`${note.title || 'Untitled'} Copy`, note.folder, note.content)
      setSelectedId(duplicate._id)
      setViewMode('editor')
    },
    [createNote, notes],
  )

  const handleMoveNote = useCallback(
    async (id: string) => {
      const note = notes.find((n) => n._id === id)
      if (!note || note.type === 'attachment') return
      const folderList = folders.map((folder) => folder.path).join(', ')
      const raw = window.prompt(
        folderList
          ? `Move to folder. Leave blank for vault root.\nExisting folders: ${folderList}`
          : 'Move to folder. Leave blank for vault root.',
        note.folder,
      )
      if (raw === null) return
      const moved = await moveNote(id, normalizeFolderPath(raw))
      setPinnedNoteIds((prev) => prev.map((noteId) => (noteId === id ? moved._id : noteId)))
      setRecentNoteIds((prev) => prev.map((noteId) => (noteId === id ? moved._id : noteId)))
      if (selectedId === id) setSelectedId(moved._id)
    },
    [folders, moveNote, notes, selectedId, setPinnedNoteIds, setRecentNoteIds],
  )

  const handleMoveNoteToFolder = useCallback(
    async (id: string, folder: string) => {
      const moved = await moveNote(id, normalizeFolderPath(folder))
      setPinnedNoteIds((prev) => prev.map((noteId) => (noteId === id ? moved._id : noteId)))
      setRecentNoteIds((prev) => prev.map((noteId) => (noteId === id ? moved._id : noteId)))
      if (selectedId === id) setSelectedId(moved._id)
    },
    [moveNote, selectedId, setPinnedNoteIds, setRecentNoteIds],
  )

  const handleTogglePin = useCallback(
    (id: string) => {
      setPinnedNoteIds((prev) =>
        prev.includes(id) ? prev.filter((noteId) => noteId !== id) : [id, ...prev],
      )
    },
    [setPinnedNoteIds],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      const key = event.key.toLowerCase()

      if ((key === 'p' && !event.altKey) || key === 'o') {
        event.preventDefault()
        setCommandOpen(true)
        setCommandQuery('')
        return
      }

      if (key === 'n' && event.shiftKey) {
        event.preventDefault()
        void handleCreateFolder(selected?.folder)
        return
      }

      if (key === 'n') {
        event.preventDefault()
        void handleCreate(selected?.folder)
        return
      }

      if (key === 'd' && event.altKey) {
        event.preventDefault()
        void handleCreateDailyNote(selected?.folder)
        return
      }

      if (key === 'p' && event.altKey && selectedId) {
        event.preventDefault()
        handleTogglePin(selectedId)
        return
      }

      if (key === 'f' && event.shiftKey) {
        event.preventDefault()
        setFocusMode((prev) => !prev)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleCreate, handleCreateDailyNote, handleCreateFolder, handleTogglePin, selected?.folder, selectedId, setFocusMode])

  const handleCopyMarkdown = useCallback(
    (id: string) => {
      const note = notes.find((n) => n._id === id)
      if (!note || note.type === 'attachment') return
      void navigator.clipboard?.writeText(note.content)
    },
    [notes],
  )

  const handleExportMarkdown = useCallback(
    (id: string) => {
      const note = notes.find((n) => n._id === id)
      if (!note || note.type === 'attachment') return
      downloadMarkdown(note)
    },
    [notes],
  )

  const handleExportDocx = useCallback(
    (id: string) => {
      const note = notes.find((n) => n._id === id)
      if (!note || note.type === 'attachment') return
      void downloadDocx(note)
    },
    [notes],
  )

  const handleExportPdf = useCallback(
    (id: string) => {
      const note = notes.find((n) => n._id === id)
      if (!note || note.type === 'attachment') return
      printNotePdf(note)
    },
    [notes],
  )

  const handleExportHtml = useCallback(
    (id: string) => {
      const note = notes.find((n) => n._id === id)
      if (!note || note.type === 'attachment') return
      downloadHtml(note)
    },
    [notes],
  )

  const handleExportVault = useCallback(async () => {
    const data = await api.get<{ data?: { notes?: Array<{ id: string; content: string }> }, notes?: Array<{ id: string; content: string }> }>('/api/export/notes')
    const payload = data?.data || data
    const exportBlob = new Blob([JSON.stringify({
      exported_at: new Date().toISOString(),
      notes: payload.notes || [],
    }, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(exportBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `clawcontrol-notes-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }, [])

  const handleImportMarkdownFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return
      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith('.md') && file.type && !file.type.includes('markdown') && !file.type.includes('text')) {
          continue
        }
        const content = await file.text()
        const relativePath = ('webkitRelativePath' in file && typeof file.webkitRelativePath === 'string' && file.webkitRelativePath)
          ? file.webkitRelativePath
          : file.name
        const parts = relativePath.split('/').filter(Boolean)
        const name = parts.pop() || file.name
        const folder = normalizeFolderPath(parts.join('/'))
        const title = name.replace(/\.md$/i, '') || 'Imported note'
        await createNote(title, folder, content)
      }
      await refresh()
    },
    [createNote, refresh],
  )

  const handleCopyCurrentWikilink = useCallback(() => {
    if (!selected || selected.type === 'attachment') return
    void navigator.clipboard?.writeText(`[[${selected.title || selected._id.replace(/\.md$/, '')}]]`)
  }, [selected])

  const handleContentChange = useCallback(
    (content: string) => {
      if (!selected) return
      pendingContentRef.current.set(selected._id, content)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(async () => {
        const pending = pendingContentRef.current.get(selected._id)
        if (pending !== undefined) {
          pendingContentRef.current.delete(selected._id)
          await updateNote({ ...selected, content: pending })
        }
      }, 600)
    },
    [selected, updateNote],
  )

  const handleTitleCommit = useCallback(
    async () => {
      if (!selected || selected.type === 'attachment') {
        setEditingTitle(false)
        return
      }
      const nextTitle = titleDraft.trim() || 'Untitled'
      const previousTitle = selected.title
      setEditingTitle(false)
      if (nextTitle === previousTitle) return

      await updateNote({ ...selected, title: nextTitle })

      const changedNotes = notes.filter((note) => {
        if (note.type !== 'note' || note._id === selected._id) return false
        return rewriteWikilinks(note.content, previousTitle, nextTitle) !== note.content
      })

      for (const note of changedNotes) {
        await updateNote({
          ...note,
          content: rewriteWikilinks(note.content, previousTitle, nextTitle),
        })
      }
    },
    [notes, selected, titleDraft, updateNote],
  )

  const handleLinkUnlinkedMention = useCallback(
    async (sourceNoteId: string) => {
      if (!selected) return
      const source = notes.find((note) => note._id === sourceNoteId)
      if (!source || source.type !== 'note') return
      const linked = linkFirstPlainMention(source.content, selected.title)
      if (linked === source.content) return
      await updateNote({ ...source, content: linked })
    },
    [notes, selected, updateNote],
  )

  const handleWikilinkClick = useCallback(
    async (link: string) => {
      const targetId = noteIdFromTitle(link, notes)
      if (targetId) {
        setSelectedId(targetId)
        setViewMode('editor')
      } else {
        const note = await createNote(link)
        setSelectedId(note._id)
        setViewMode('editor')
      }
    },
    [notes, createNote],
  )

  const handleGraphSelect = useCallback((id: string) => {
    setSelectedId(id)
    setViewMode('editor')
  }, [])

  const commandItems = useMemo<CommandAction[]>(() => {
    const baseActions: CommandAction[] = [
      {
        id: 'new-note',
        label: 'New note',
        detail: selected?.folder ? `Create in ${selected.folder}` : 'Create in vault root',
        icon: NotePencil,
        onRun: () => { void handleCreate(selected?.folder) },
      },
      {
        id: 'new-daily-note',
        label: 'New daily note',
        detail: selected?.folder ? `Create in ${selected.folder}` : 'Create in vault root',
        icon: NotePencil,
        onRun: () => { void handleCreateDailyNote(selected?.folder) },
      },
      {
        id: 'new-folder',
        label: 'New folder',
        detail: selected?.folder ? `Create in ${selected.folder}` : 'Create in vault root',
        icon: FolderPlus,
        onRun: () => { void handleCreateFolder(selected?.folder) },
      },
      {
        id: 'graph-view',
        label: 'Open graph view',
        detail: 'Knowledge graph',
        icon: GitBranch,
        onRun: () => setViewMode('graph'),
      },
      {
        id: 'toggle-focus-mode',
        label: focusMode ? 'Exit focus mode' : 'Enter focus mode',
        detail: 'Hide or show the notes sidebar',
        icon: PenNib,
        onRun: () => setFocusMode((prev) => !prev),
      },
      {
        id: 'export-vault',
        label: 'Export vault notes',
        detail: 'Download via /api/export/notes',
        icon: ShareNetwork,
        onRun: () => { void handleExportVault() },
      },
      {
        id: 'import-markdown',
        label: 'Import markdown files',
        detail: 'Create vault notes from local .md files',
        icon: UploadSimple,
        onRun: () => fileInputRef.current?.click(),
      },
    ]

    if (selectedId) {
      baseActions.push({
        id: 'toggle-pin',
        label: pinnedNoteSet.has(selectedId) ? 'Unpin current note' : 'Pin current note',
        detail: selected?.title || selectedId,
        icon: Star,
        onRun: () => handleTogglePin(selectedId),
      })
      baseActions.push({
        id: 'copy-current-wikilink',
        label: 'Copy current wikilink',
        detail: selected?.title || selectedId,
        icon: Copy,
        onRun: handleCopyCurrentWikilink,
      })
      baseActions.push({
        id: 'export-current-docx',
        label: 'Export current note as DOCX',
        detail: selected?.title || selectedId,
        icon: FileDoc,
        onRun: () => handleExportDocx(selectedId),
      })
      baseActions.push({
        id: 'export-current-pdf',
        label: 'Export current note as PDF',
        detail: 'Opens print dialog',
        icon: FilePdf,
        onRun: () => handleExportPdf(selectedId),
      })
      baseActions.push({
        id: 'export-current-markdown',
        label: 'Export current note as Markdown',
        detail: selected?.title || selectedId,
        icon: FileText,
        onRun: () => handleExportMarkdown(selectedId),
      })
      baseActions.push({
        id: 'export-current-html',
        label: 'Export current note as HTML',
        detail: selected?.title || selectedId,
        icon: FileHtml,
        onRun: () => handleExportHtml(selectedId),
      })
    }

    const noteActions = notes
      .filter((note) => note.type === 'note')
      .map<CommandAction>((note) => ({
        id: `note:${note._id}`,
        label: note.title || 'Untitled',
        detail: [note.folder || 'Vault root', ...(note.aliases?.map((alias) => `@${alias}`) ?? [])].join(' '),
        icon: NotePencil,
        onRun: () => {
          setSelectedId(note._id)
          setViewMode('editor')
        },
      }))

    return [...baseActions, ...noteActions]
  }, [focusMode, handleCopyCurrentWikilink, handleCreate, handleCreateDailyNote, handleCreateFolder, handleExportDocx, handleExportHtml, handleExportMarkdown, handleExportPdf, handleExportVault, handleTogglePin, notes, pinnedNoteSet, selected?.folder, selected?.title, selectedId, setFocusMode])

  const handleResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = treeWidth
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      setTreeWidth(Math.max(160, Math.min(startWidth + delta, 360)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [treeWidth])

  if (loading) {
    return (
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontSize: 13,
      }}>
        Loading vault...
      </div>
    )
  }

  if (error && notes.length === 0) {
    return (
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12,
        color: 'var(--text-muted)', fontSize: 13,
      }}>
        <div style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
          Notes sync unavailable
        </div>
        <div style={{ maxWidth: 420, textAlign: 'center', lineHeight: 1.5 }}>
          {error}
        </div>
        <button
          type="button"
          onClick={refresh}
          style={{
            background: 'var(--bg-white-04)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '7px 14px',
            fontSize: 12,
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <>
    <input
      ref={fileInputRef}
      type="file"
      accept=".md,text/markdown,text/plain"
      multiple
      style={{ display: 'none' }}
      onChange={(event) => {
        void handleImportMarkdownFiles(event.target.files)
        event.target.value = ''
      }}
    />
    <div style={{
      flex: 1,
      minHeight: 0,
      margin: '-20px -28px',
      display: 'flex', overflow: 'hidden',
      userSelect: 'text', WebkitUserSelect: 'text',
    }}>
      {!focusMode && (
        <>
          {/* File tree */}
          <div style={{
            width: treeWidth, minWidth: treeWidth,
            borderRight: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <FileTree
              notes={notes}
              folders={folders}
              pinnedNoteIds={pinnedNoteSet}
              recentNoteIds={recentNoteIds}
              recentLimit={normalizedRecentLimit}
              onRecentLimitChange={setRecentLimit}
              selectedId={selectedId}
              onSelect={(id) => { setSelectedId(id); setViewMode('editor') }}
              onCreate={handleCreate}
              onCreateFolder={handleCreateFolder}
              onDelete={handleDeleteNote}
              onDeleteFolder={handleDeleteFolder}
              onRename={handleRenameNote}
              onRenameFolder={handleRenameFolder}
              onDuplicate={handleDuplicateNote}
              onMove={handleMoveNote}
              onMoveToFolder={handleMoveNoteToFolder}
              onCreateDailyNote={handleCreateDailyNote}
              onCreateTemplate={handleCreateTemplate}
              onCopyMarkdown={handleCopyMarkdown}
              onExportMarkdown={handleExportMarkdown}
              onTogglePin={handleTogglePin}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          </div>

          {/* Resize handle */}
          <div
            onMouseDown={handleResize}
            style={{
              width: 4, cursor: 'col-resize',
              background: 'transparent', flexShrink: 0,
              marginLeft: -2, marginRight: -2, zIndex: 10,
              position: 'relative',
            }}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize file tree"
          />
        </>
      )}

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '0 16px', gap: 2, flexShrink: 0, height: 40,
          borderBottom: '1px solid var(--border)',
        }}>
          {/* Breadcrumb / Title */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0, gap: 6 }}>
            {selected ? (
              <>
                {selected.folder && (
                  <span style={{
                    fontSize: 11, color: 'var(--text-muted)', opacity: 0.5,
                    whiteSpace: 'nowrap',
                  }}>
                    {selected.folder} /
                  </span>
                )}
                {editingTitle ? (
                  <input
                    ref={titleRef}
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={() => { void handleTitleCommit() }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void handleTitleCommit()
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault()
                        setTitleDraft(selected.title)
                        setEditingTitle(false)
                      }
                    }}
                    aria-label="Note title"
                    autoFocus
                    style={{
                      background: 'transparent', border: 'none',
                      color: 'var(--text-primary)', fontSize: 13,
                      fontWeight: 500, fontFamily: 'inherit',
                      flex: 1, padding: '2px 0',
                    }}
                  />
                ) : (
                  <button
                    onClick={() => {
                      setTitleDraft(selected.title)
                      setEditingTitle(true)
                      setTimeout(() => titleRef.current?.select(), 20)
                    }}
                    style={{
                      background: 'transparent', border: 'none',
                      color: 'var(--text-primary)', fontSize: 13,
                      fontWeight: 500, cursor: 'text',
                      padding: '2px 4px', borderRadius: 'var(--radius-sm)',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', textAlign: 'left',
                    }}
                  >
                    {selected.title || 'Untitled'}
                  </button>
                )}
              </>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: 13, opacity: 0.5 }}>
                Select a note
              </span>
            )}
          </div>

          {/* Sync indicator */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              color: syncing ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: 10, marginRight: 4, opacity: syncing ? 1 : 0.4,
            }}
            title={syncing ? 'Syncing...' : 'Synced'}
          >
            {syncing ? <Cloud size={12} /> : <CloudSlash size={12} />}
          </div>

          {selected?.type === 'note' && (
            <div style={{
              display: 'flex',
              background: 'var(--bg-white-02)',
              borderRadius: 'var(--radius-sm)',
              padding: 2,
              gap: 1,
              border: '1px solid var(--border)',
            }}>
              <IconButton label="Download DOCX" onClick={() => handleExportDocx(selected._id)}>
                <FileDoc size={12} />
              </IconButton>
              <IconButton label="Print or save PDF" onClick={() => handleExportPdf(selected._id)}>
                <FilePdf size={12} />
              </IconButton>
              <IconButton label="Download Markdown" onClick={() => handleExportMarkdown(selected._id)}>
                <FileText size={12} />
              </IconButton>
              <IconButton label="Download HTML" onClick={() => handleExportHtml(selected._id)}>
                <FileHtml size={12} />
              </IconButton>
            </div>
          )}

          {/* View toggle */}
          <div style={{
            display: 'flex',
            background: 'var(--bg-white-02)',
            borderRadius: 'var(--radius-sm)',
            padding: 2, gap: 1,
            border: '1px solid var(--border)',
          }}>
            <button
              onClick={() => setViewMode('editor')}
              aria-label="Editor view"
              style={{
                background: viewMode === 'editor' ? 'var(--bg-white-04)' : 'transparent',
                border: 'none',
                color: viewMode === 'editor' ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                padding: '3px 8px',
                borderRadius: 'calc(var(--radius-sm) - 2px)',
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: viewMode === 'editor' ? 500 : 400,
                transition: 'all var(--duration-fast)',
              }}
            >
              <PenNib size={11} />
              Edit
            </button>
            <button
              onClick={() => setViewMode('graph')}
              aria-label="Graph view"
              style={{
                background: viewMode === 'graph' ? 'var(--bg-white-04)' : 'transparent',
                border: 'none',
                color: viewMode === 'graph' ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                padding: '3px 8px',
                borderRadius: 'calc(var(--radius-sm) - 2px)',
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: viewMode === 'graph' ? 500 : 400,
                transition: 'all var(--duration-fast)',
              }}
            >
              <GitBranch size={11} />
              Graph
            </button>
          </div>

          {/* Delete */}
          {selected && (
            <button
              onClick={() => handleDeleteNote()}
              className="hover-bg"
              aria-label="Delete note"
              style={{
                background: 'transparent', border: 'none',
                color: 'var(--text-muted)', cursor: 'pointer',
                padding: 5, borderRadius: 'var(--radius-sm)',
                display: 'flex', opacity: 0.5,
                transition: 'opacity var(--duration-fast)',
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.opacity = '1'
                ;(e.target as HTMLButtonElement).style.color = 'var(--red)'
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.opacity = '0.5'
                ;(e.target as HTMLButtonElement).style.color = 'var(--text-muted)'
              }}
            >
              <Trash size={13} />
            </button>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {viewMode === 'editor' ? (
            selected ? (
              selected.type === 'attachment' ? (
                <AttachmentPreview id={selected._id} />
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <NoteEditor
                    note={selected}
                    onChange={handleContentChange}
                    onWikilinkClick={handleWikilinkClick}
                    allNoteTitles={allNoteTitles}
                    allNotes={notes}
                  />
                  <BacklinksPanel
                    currentNoteTitle={selected.title}
                    allNotes={notes}
                    onNavigate={(id) => { setSelectedId(id); setViewMode('editor') }}
                    onLinkMention={handleLinkUnlinkedMention}
                  />
                </div>
              )
            ) : (
              <EmptyState onCreateNote={() => handleCreate()} />
            )
          ) : (
            <Suspense fallback={
              <div style={{
                flex: 1, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-muted)', fontSize: 12,
              }}>
                Loading graph...
              </div>
            }>
              <GraphView
                notes={notes}
                selectedId={selectedId}
                onSelectNote={handleGraphSelect}
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
    {commandOpen && (
      <NotesCommandPalette
        query={commandQuery}
        items={commandItems}
        onQueryChange={setCommandQuery}
        onClose={() => setCommandOpen(false)}
      />
    )}
    </>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="hover-bg"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: 24,
        height: 24,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: 'calc(var(--radius-sm) - 2px)',
        background: 'transparent',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {children}
    </button>
  )
}

function NotesCommandPalette({
  query,
  items,
  onQueryChange,
  onClose,
}: {
  query: string
  items: CommandAction[]
  onQueryChange: (query: string) => void
  onClose: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items.slice(0, 24)
    return items
      .filter((item) =>
        item.label.toLowerCase().includes(q) ||
        item.detail?.toLowerCase().includes(q),
      )
      .slice(0, 24)
  }, [items, query])

  const run = useCallback(
    (item: CommandAction) => {
      item.onRun()
      onClose()
    },
    [onClose],
  )

  useEffect(() => {
    inputRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
      if (event.key === 'Enter' && filtered[0]) {
        event.preventDefault()
        run(filtered[0])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filtered, onClose, run])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Notes command palette"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '12vh',
        background: 'rgba(0, 0, 0, 0.36)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div
        style={{
          width: 'min(680px, calc(100vw - 32px))',
          maxHeight: '72vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-panel)',
          boxShadow: '0 24px 80px var(--overlay-heavy)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '13px 14px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <MagnifyingGlass size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search notes or run a command..."
            aria-label="Search notes or run a command"
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-primary)',
              font: 'inherit',
              fontSize: 14,
              outline: 'none',
            }}
          />
        </div>

        <div style={{ overflowY: 'auto', padding: 6 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '26px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
              No commands or notes found
            </div>
          ) : (
            filtered.map((item, index) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => run(item)}
                  className="hover-bg"
                  style={{
                    width: '100%',
                    minHeight: 42,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    background: index === 0 ? 'var(--bg-white-04)' : 'transparent',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    padding: '7px 10px',
                    textAlign: 'left',
                  }}
                >
                  <Icon size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.label}
                    </span>
                    {item.detail && (
                      <span style={{ display: 'block', marginTop: 1, fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.detail}
                      </span>
                    )}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function AttachmentPreview({ id }: { id: string }) {
  const name = id.split('/').pop() || id
  const ext = name.split('.').pop()?.toLowerCase() || 'png'
  const mimeMap: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
  }
  const mime = mimeMap[ext] || 'image/png'
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setBlobUrl(null)
    setError(null)

    // Use the EXISTING /vault/notes/{id} endpoint — it fetches any CouchDB doc
    // and assembles chunks. For images, the "content" field is base64 image data.
    async function load(retries = 3) {
      for (let i = 0; i < retries; i++) {
        try {
          const resp = await api.get<any>(
            `/api/vault/doc?id=${encodeURIComponent(id)}`,
          )
          if (cancelled) return
          const doc = resp?.data || resp
          const content = (doc?.content || '').replace(/\s/g, '')
          if (content) {
            setBlobUrl(`data:${mime};base64,${content}`)
            return
          }
          throw new Error('No content in response')
        } catch {
          if (cancelled) return
          if (i < retries - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)))
        }
      }
      if (!cancelled) setError('Failed to load image')
    }
    load()

    return () => {
      cancelled = true
      setBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null })
    }
  }, [id, attempt])

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      overflow: 'auto', padding: 32,
      background: 'var(--bg-base)',
    }}>
      {blobUrl && (
        <img
          src={blobUrl}
          alt={name}
          style={{
            maxWidth: '100%', maxHeight: '80vh',
            objectFit: 'contain', borderRadius: 8,
            boxShadow: '0 2px 16px var(--overlay-light)',
          }}
        />
      )}
      {error && (
        <button
          onClick={() => { setError(null); setAttempt(a => a + 1) }}
          style={{
            background: 'var(--bg-white-04)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
            cursor: 'pointer', padding: '8px 16px', fontSize: 12,
          }}
        >
          Retry loading image
        </button>
      )}
      {!blobUrl && !error && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading...</div>
      )}
      <div style={{
        marginTop: 12, fontSize: 12,
        color: 'var(--text-muted)', opacity: 0.6,
      }}>
        {name}
      </div>
    </div>
  )
}

function EmptyState({ onCreateNote }: { onCreateNote: () => void }) {
  return (
    <div style={{
      flex: 1, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 12,
      color: 'var(--text-muted)',
    }}>
      <div style={{
        width: 48, height: 48,
        borderRadius: 12,
        background: 'var(--bg-white-02)',
        border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <ShareNetwork size={22} style={{ opacity: 0.3, color: 'var(--accent)' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 14, fontWeight: 500, marginBottom: 4,
          color: 'var(--text-secondary)',
        }}>
          Your knowledge graph awaits
        </div>
        <div style={{ fontSize: 12, maxWidth: 280, lineHeight: 1.6, opacity: 0.6 }}>
          Create notes and link them with [[wikilinks]]
        </div>
      </div>
      <button
        onClick={onCreateNote}
        style={{
          background: 'var(--accent-dim)',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-on-color)',
          cursor: 'pointer',
          padding: '7px 18px',
          fontSize: 12, fontWeight: 500,
          transition: 'opacity var(--duration-fast)',
        }}
        onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.opacity = '0.85' }}
        onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.opacity = '1' }}
      >
        Create first note
      </button>
    </div>
  )
}
