
import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Brain, MagnifyingGlass, Sparkle } from '@phosphor-icons/react'
import { api, ApiError } from '@/lib/api'
import { timeAgo } from '@/lib/utils'
import { queryKeys } from '@/lib/query-keys'
import { SkeletonList } from '@/components/Skeleton'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'

interface FileItem {
  name: string
  path: string
}

interface FileTree {
  coreFiles: FileItem[]
  memoryFiles: FileItem[]
  memdFiles: FileItem[]
}

interface SearchResult {
  path?: string
  name?: string
  content?: string
  score?: number
  snippet?: string
  [key: string]: unknown
}

interface MemdEntry {
  id: string
  title?: string
  name?: string
  path?: string
  content?: string
  summary?: string
  snippet?: string
  kind?: string
  status?: string
  score?: number
  updatedAt?: string
  createdAt?: string
}

interface MemdHealth {
  source?: string
  status?: string
  baseUrl?: string | null
  remoteHealthy?: boolean
  itemCount?: number
  localItemCount?: number
  latencyMs?: number
  checkedAt?: string
  error?: string
}

type MemdView = 'current' | 'inbox' | 'repair' | 'logs' | 'files'

interface MemdAuthorityWarning {
  severity?: string
  code?: string
  message?: string
  action?: string
}

interface MemdAuthority {
  ok?: boolean
  source?: string
  baseUrl?: string | null
  checkedAt?: string
  health?: MemdHealth & {
    pressure?: Record<string, number>
    rag?: { reachable?: boolean; url?: string | null; [key: string]: unknown } | null
    atlas?: { dormant?: boolean; [key: string]: unknown } | null
  }
  counts?: {
    total?: number
    active?: number
    stale?: number
    expired?: number
    candidates?: number
    sampleSize?: number
    partial?: boolean
    byKindSample?: Record<string, number>
    byStatusSample?: Record<string, number>
    byStageSample?: Record<string, number>
  }
  owner?: {
    mode?: string
    active?: string
    verified?: boolean
    portainerRequired?: boolean
  }
  authoritySearch?: {
    mode?: string
    configured?: boolean
    tokenRequired?: boolean
    endpoint?: string
    usedForInventory?: boolean
  }
  safety?: Record<string, unknown>
  operations?: Array<Record<string, unknown>>
  warnings?: MemdAuthorityWarning[]
}

function uniqueFiles(files: FileItem[]): FileItem[] {
  const seen = new Set<string>()
  return files.filter(file => {
    if (file.name.startsWith('._') || file.path.split('/').some(part => part.startsWith('._'))) return false
    if (seen.has(file.path)) return false
    seen.add(file.path)
    return true
  })
}

export default function MemoryPage() {
  const queryClient = useQueryClient()
  const { data: treeData, isLoading: treeLoading } = useQuery<FileTree>({
    queryKey: queryKeys.workspaceFiles,
    queryFn: async () => {
      const d = await api.get<{ coreFiles?: FileItem[]; memoryFiles?: FileItem[]; memdFiles?: FileItem[] }>('/api/workspace/files')
      const memdFiles = d.memdFiles ?? []
      const legacyMemoryFiles = d.memoryFiles ?? []
      return {
        coreFiles: d.coreFiles || [],
        memoryFiles: legacyMemoryFiles.filter(file => !file.path.startsWith('.memd/')),
        memdFiles: uniqueFiles([
          ...memdFiles,
          ...legacyMemoryFiles.filter(file => file.path.startsWith('.memd/')),
        ]),
      }
    },
  })

  const tree = {
    coreFiles: treeData?.coreFiles ?? [],
    memoryFiles: treeData?.memoryFiles ?? [],
    memdFiles: treeData?.memdFiles ?? [],
  }

  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [activeTitle, setActiveTitle] = useState<string | null>(null)
  const [activeReadOnly, setActiveReadOnly] = useState(false)
  const [content, setContent] = useState('')
  const [editContent, setEditContent] = useState('')
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [loading, setLoading] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [search, setSearch] = useState('')
  const [searchMode, setSearchMode] = useState<'files' | 'semantic'>('files')
  const [semanticQuery, setSemanticQuery] = useState('')
  const [memdView, setMemdView] = useState<MemdView>('current')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadRequestRef = useRef(0)

  const { data: memdHealth } = useQuery<MemdHealth | null>({
    queryKey: ['memd-health'],
    queryFn: async () => {
      const resp = await api.get<{ ok?: boolean; data?: MemdHealth }>('/api/memd/health')
      return resp?.ok ? (resp.data ?? null) : null
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const { data: memdAuthority, isLoading: memdAuthorityLoading } = useQuery<MemdAuthority | null>({
    queryKey: ['memd-authority'],
    queryFn: async () => {
      const resp = await api.get<{ ok?: boolean; data?: MemdAuthority }>('/api/memd/authority')
      return resp?.ok ? (resp.data ?? null) : null
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const { data: memdEntriesData, isLoading: memdEntriesLoading } = useQuery<MemdEntry[]>({
    queryKey: [...queryKeys.memory, memdView],
    queryFn: async () => {
      const filters = memdQueryForView(memdView)
      const resp = await api.post<{ ok?: boolean; data?: { entries?: MemdEntry[] } }>('/api/memd/query', {
        limit: 30,
        ...filters,
      })
      return resp?.ok ? (resp.data?.entries ?? []) : []
    },
    enabled: searchMode === 'files' && memdView !== 'files',
    staleTime: 30_000,
  })
  const memdEntries = memdEntriesData ?? []

  // Debounce semantic search input
  const handleSemanticInput = useCallback((value: string) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSemanticQuery(value.trim())
    }, 300)
  }, [])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Semantic search query
  const { data: searchResults, isLoading: searchLoading, error: searchError } = useQuery<SearchResult[]>({
    queryKey: queryKeys.memorySearch(semanticQuery),
    queryFn: async () => {
      const resp = await api.post<{ ok: boolean; results?: SearchResult[]; data?: { results?: SearchResult[] } & Record<string, unknown> }>('/api/rag/search', {
        query: semanticQuery,
        limit: 20,
      })
      if (Array.isArray(resp?.results)) return resp.results
      // The gateway returns { ok, data } where data is the raw payload
      // The payload shape may vary — try common fields
      const payload = resp?.data
      if (Array.isArray(payload)) return payload as SearchResult[]
      if (payload?.results && Array.isArray(payload.results)) return payload.results
      // If it's an object with entries
      if (payload && typeof payload === 'object') {
        const entries = (payload as Record<string, unknown>).entries
        if (Array.isArray(entries)) return entries as SearchResult[]
      }
      return []
    },
    enabled: searchMode === 'semantic' && semanticQuery.length >= 2,
    staleTime: 60_000,
  })

  const loadFile = useCallback(async (filePath: string) => {
    const requestId = ++loadRequestRef.current
    setActiveFile(filePath)
    setActiveTitle(null)
    setActiveReadOnly(false)
    setMode('view')
    setLoading(true)
    setContent('')
    try {
      let lastError: unknown = null
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const data = await api.get<{ content?: string }>(`/api/workspace/file?path=${encodeURIComponent(filePath)}`)
          if (loadRequestRef.current !== requestId) return
          const nextContent = data.content || ''
          setContent(nextContent)
          setEditContent(nextContent)
          return
        } catch (err) {
          lastError = err
          if (attempt === 0) {
            await new Promise(resolve => setTimeout(resolve, 250))
            if (loadRequestRef.current !== requestId) return
            continue
          }
        }
      }
      if (loadRequestRef.current !== requestId) return
      if (lastError instanceof ApiError) {
        setContent(`Error loading file: ${lastError.message}`)
      } else {
        setContent('Error loading file.')
      }
    } finally {
      if (loadRequestRef.current === requestId) {
        setLoading(false)
      }
    }
  }, [])

  const loadMemdEntry = useCallback((entry: MemdEntry) => {
    const title = (entry.title || entry.name || 'memd memory').toString()
    const path = entry.path || `memd/${entry.kind || 'memory'}/${entry.id}`
    const body = [
      `# ${title}`,
      '',
      entry.summary || entry.snippet ? `Summary: ${entry.summary || entry.snippet}` : '',
      entry.kind ? `Kind: ${entry.kind}` : '',
      entry.status ? `Status: ${entry.status}` : '',
      entry.score != null ? `Score: ${entry.score}` : '',
      entry.updatedAt ? `Updated: ${entry.updatedAt}` : '',
      '',
      entry.content || entry.summary || entry.snippet || '',
    ].filter(Boolean).join('\n')
    setActiveFile(path)
    setActiveTitle(title)
    setActiveReadOnly(true)
    setMode('view')
    setLoading(false)
    setContent(body)
    setEditContent(body)
  }, [])

  const saveMutation = useMutation({
    mutationFn: async ({ path, content: fileContent }: { path: string; content: string }) => {
      await api.post('/api/workspace/file', { path, content: fileContent })
    },
    onSuccess: () => {
      setContent(editContent)
      setLastSaved(new Date())
      setMode('view')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (path: string) => {
      await api.del(`/api/workspace/file?path=${encodeURIComponent(path)}`)
    },
    onSuccess: () => {
      setActiveFile(null)
      setContent('')
      setEditContent('')
      setMode('view')
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceFiles })
    },
  })

  const saveFile = async () => {
    if (!activeFile || activeReadOnly) return
    await saveMutation.mutateAsync({ path: activeFile, content: editContent })
  }

  const deleteFile = async () => {
    if (!activeFile || activeReadOnly) return
    if (!confirm(`Delete "${activeFile}"? This cannot be undone.`)) return
    await deleteMutation.mutateAsync(activeFile)
  }

  const fileName = activeFile ? activeFile.split('/').pop() : null

  const q = search.toLowerCase().trim()
  const filteredCore = q && searchMode === 'files'
    ? tree.coreFiles.filter(f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
    : tree.coreFiles
  const filteredMemory = q && searchMode === 'files'
    ? tree.memoryFiles.filter(f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
    : tree.memoryFiles
  const filteredMemd = q && searchMode === 'files'
    ? tree.memdFiles.filter(f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
    : tree.memdFiles
  const filteredMemdEntries = q && searchMode === 'files'
    ? memdEntries.filter(entry => {
      const haystack = [
        entry.title,
        entry.name,
        entry.path,
        entry.summary,
        entry.snippet,
        entry.content,
        entry.kind,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
    : memdEntries

  return (
    <div style={{ display: 'flex', gap: 0, height: 'calc(100vh - 120px)', minHeight: 0 }}>
      {/* Left panel */}
      <div style={{
        width: '33%',
        minWidth: 200,
        borderRight: '1px solid var(--border)',
        overflowY: 'auto',
        padding: '0 16px',
        flexShrink: 0,
      }}>
        <div style={{ padding: '0 0 8px 0', marginBottom: 8 }}>
          <PageHeader defaultTitle="Memory" defaultSubtitle="agent files + memory stores" />
        </div>

        <MemoryAuthorityPanel
          authority={memdAuthority}
          fallbackHealth={memdHealth}
          authorityLoading={memdAuthorityLoading}
        />

        {/* Search mode toggle */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
          <button
            onClick={() => { setSearchMode('files'); setSemanticQuery('') }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'inherit',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: searchMode === 'files' ? 'var(--accent)' : 'transparent',
              color: searchMode === 'files' ? 'var(--text-on-color)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            <MagnifyingGlass size={13} />
            Files
          </button>
          <button
            onClick={() => setSearchMode('semantic')}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'inherit',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: searchMode === 'semantic' ? 'var(--accent)' : 'transparent',
              color: searchMode === 'semantic' ? 'var(--text-on-color)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            <Sparkle size={13} />
            Semantic
          </button>
        </div>

        <div style={{ padding: '0 0 8px 0' }}>
          <input
            type="text"
            placeholder={searchMode === 'files' ? 'Search files...' : 'Search memory semantically...'}
            value={search}
            onChange={e => searchMode === 'semantic' ? handleSemanticInput(e.target.value) : setSearch(e.target.value)}
            aria-label={searchMode === 'files' ? 'Search files' : 'Semantic search'}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '12px',
              fontFamily: 'monospace',
              background: 'var(--bg-base)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: 'var(--text-primary)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Semantic search results */}
        {searchMode === 'semantic' && (
          <div>
            {searchLoading && semanticQuery.length >= 2 && (
              <SkeletonList count={3} lines={2} />
            )}
            {searchError && (
              <div style={{ padding: '12px', fontSize: '12px', color: 'var(--red-500)' }}>
                Search unavailable. Check the backend route.
              </div>
            )}
            {!searchLoading && !searchError && semanticQuery.length >= 2 && searchResults && searchResults.length === 0 && (
              <div style={{ padding: '8px 0' }}>
                <EmptyState icon={Sparkle} title="No semantic matches" />
              </div>
            )}
            {!searchLoading && searchResults && searchResults.length > 0 && (
              <div>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  padding: '8px 12px 4px',
                }}>
                  Results ({searchResults.length})
                </div>
                {searchResults.map((result, i) => {
                  const resultPath = result.path || result.name || `result-${i}`
                  const resultName = (result.name || result.path || '').split('/').pop() || `Result ${i + 1}`
                  const snippet = result.snippet || result.content || ''
                  const score = result.score
                  return (
                    <SearchResultCard
                      key={`${resultPath}-${i}`}
                      name={resultName}
                      snippet={snippet}
                      score={score}
                      active={activeFile === resultPath}
                      query={semanticQuery}
                      onClick={() => {
                        if (result.path) loadFile(result.path)
                      }}
                    />
                  )
                })}
              </div>
            )}
            {semanticQuery.length < 2 && !searchLoading && (
              <div style={{ padding: '16px 12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                Type at least 2 characters to search
              </div>
            )}
          </div>
        )}

        {/* File list (shown in files mode) */}
        {searchMode === 'files' && (
          <>
            {treeLoading ? (
              <SkeletonList count={2} lines={2} />
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    padding: '8px 12px 4px',
                  }}>
                    Agent Files
                  </div>
                  {filteredCore.length === 0 && (
                    <div style={{ padding: '8px 0' }}>
                      <EmptyState icon={Brain} title={q ? 'No matches' : 'No files found'} />
                    </div>
                  )}
                  {filteredCore.map(f => (
                    <FileRow
                      key={f.path}
                      file={f}
                      active={activeFile === f.path}
                      onClick={() => loadFile(f.path)}
                    />
                  ))}
                </div>

                {(filteredMemory.length > 0 || q) && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      padding: '8px 12px 4px',
                    }}>
                      Legacy Memory Logs
                    </div>
                    {filteredMemory.length === 0 && (
                      <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--text-muted)' }}>
                        No legacy log matches
                      </div>
                    )}
                    {filteredMemory.map(f => (
                      <FileRow
                        key={f.path}
                        file={f}
                        active={activeFile === f.path}
                        onClick={() => loadFile(f.path)}
                      />
                    ))}
                  </div>
                )}

                <div>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    padding: '8px 12px 4px',
                  }}>
                    memd
                  </div>
                  <MemdViewTabs value={memdView} onChange={setMemdView} counts={memdAuthority?.counts} />
                  {memdView === 'files' && filteredMemd.length === 0 && (
                    <div style={{ padding: '8px 0' }}>
                      <EmptyState icon={Brain} title={q ? 'No file matches' : 'No memd files found'} />
                    </div>
                  )}
                  {memdView !== 'files' && filteredMemdEntries.length === 0 && !memdEntriesLoading && (
                    <div style={{ padding: '8px 0' }}>
                      <EmptyState icon={Brain} title={q ? 'No memory matches' : emptyTitleForMemdView(memdView)} />
                    </div>
                  )}
                  {memdView !== 'files' && memdEntriesLoading && (
                    <SkeletonList count={2} lines={2} />
                  )}
                  {memdView !== 'files' && filteredMemdEntries.length > 0 && (
                    <div style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      padding: '6px 12px 3px',
                    }}>
                      {labelForMemdView(memdView)}
                    </div>
                  )}
                  {memdView !== 'files' && filteredMemdEntries.map(entry => (
                    <MemdEntryRow
                      key={entry.id}
                      entry={entry}
                      active={activeFile === (entry.path || `memd/${entry.kind || 'memory'}/${entry.id}`)}
                      onClick={() => loadMemdEntry(entry)}
                    />
                  ))}
                  {memdView === 'files' && filteredMemd.length > 0 && (
                    <div style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      padding: '8px 12px 3px',
                    }}>
                      Files
                    </div>
                  )}
                  {memdView === 'files' && filteredMemd.map(f => (
                    <FileRow
                      key={f.path}
                      file={f}
                      active={activeFile === f.path}
                      onClick={() => loadFile(f.path)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', paddingLeft: 24 }}>
        {!activeFile ? (
          <div className="card" style={{ padding: '48px', textAlign: 'center', marginTop: 8 }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>📄</div>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              Select a file or memory from the left panel to view it.
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexShrink: 0 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                  {activeTitle || fileName}
                </div>
                {lastSaved && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>
                    Last saved {timeAgo(lastSaved.getTime())}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { setMode('view'); setEditContent(content) }}
                  style={{
                    padding: '5px 14px',
                    fontSize: '12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: mode === 'view' ? 'var(--accent)' : 'transparent',
                    color: mode === 'view' ? 'var(--text-on-color)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  View
                </button>
                {!activeReadOnly && (
                  <button
                    onClick={() => setMode('edit')}
                    style={{
                      padding: '5px 14px',
                      fontSize: '12px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: mode === 'edit' ? 'var(--accent)' : 'transparent',
                      color: mode === 'edit' ? 'var(--text-on-color)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Edit
                  </button>
                )}
                {mode === 'edit' && (
                  <>
                    <button
                      onClick={saveFile}
                      disabled={saveMutation.isPending}
                      style={{
                        padding: '5px 16px',
                        fontSize: '12px',
                        borderRadius: 6,
                        border: 'none',
                        background: saveMutation.isPending ? 'var(--text-muted)' : 'var(--accent-dim)',
                        color: 'var(--text-on-color)',
                        cursor: saveMutation.isPending ? 'not-allowed' : 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      {saveMutation.isPending ? 'Saving…' : 'Save'}
                    </button>
                    {activeFile?.startsWith('memory/') && (
                      <button
                        onClick={deleteFile}
                        disabled={deleteMutation.isPending}
                        style={{
                          padding: '5px 14px',
                          fontSize: '12px',
                          borderRadius: 6,
                          border: '1px solid var(--red-500)',
                          background: 'transparent',
                          color: 'var(--red-500)',
                          cursor: deleteMutation.isPending ? 'not-allowed' : 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Content */}
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[80, 60, 90, 50, 70].map((w, i) => (
                  <div key={i} style={{
                    height: 14,
                    width: `${w}%`,
                    borderRadius: 4,
                    background: 'var(--border)',
                    opacity: 0.5,
                  }} />
                ))}
              </div>
            ) : mode === 'view' ? (
              <div className="card" style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                <pre style={{
                  margin: 0,
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.6,
                }}>
                  {content}
                </pre>
              </div>
            ) : (
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                aria-label="Edit file content"
                style={{
                  flex: 1,
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  padding: 16,
                  minHeight: 500,
                  resize: 'vertical',
                  borderRadius: 8,
                  lineHeight: 1.6,
                  outline: 'none',
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function memdQueryForView(view: MemdView): Record<string, unknown> {
  switch (view) {
    case 'inbox':
      return { includeArchived: true, stages: ['candidate'] }
    case 'repair':
      return { includeArchived: true, statuses: ['stale', 'contested', 'superseded'] }
    case 'logs':
      return { includeArchived: true, statuses: ['expired'] }
    case 'files':
      return { includeArchived: true }
    case 'current':
    default:
      return { includeArchived: false, statuses: ['active'] }
  }
}

function labelForMemdView(view: MemdView): string {
  switch (view) {
    case 'inbox':
      return 'Inbox / Candidates'
    case 'repair':
      return 'Repair Queue'
    case 'logs':
      return 'Memory Logs'
    case 'files':
      return 'Files'
    case 'current':
    default:
      return 'Current Memories'
  }
}

function emptyTitleForMemdView(view: MemdView): string {
  switch (view) {
    case 'inbox':
      return 'No candidate memories'
    case 'repair':
      return 'No stale memories'
    case 'logs':
      return 'No log memories'
    case 'current':
    default:
      return 'No active memories'
  }
}

function formatCount(value?: number): string {
  if (value == null) return '0'
  return value.toLocaleString()
}

function MemoryAuthorityPanel({
  authority,
  fallbackHealth,
  authorityLoading = false,
}: {
  authority?: MemdAuthority | null
  fallbackHealth?: MemdHealth | null
  authorityLoading?: boolean
}) {
  const health = authority?.health ?? fallbackHealth
  const counts = authority?.counts
  const healthy = Boolean(health?.remoteHealthy)
  const status = authorityLoading && !authority ? 'checking' : health?.status || 'checking'
  const source = authority?.source || fallbackHealth?.source || 'memd'
  const count = counts?.total ?? health?.itemCount ?? 0
  const pressure = authority?.health?.pressure
  const expired = counts?.expired ?? pressure?.expired ?? 0
  const stale = counts?.stale ?? pressure?.stale ?? 0
  const active = counts?.active ?? Math.max(0, count - expired - stale)
  const candidates = counts?.candidates ?? pressure?.candidates ?? 0
  const latency = health?.latencyMs != null ? `${health.latencyMs}ms` : null
  const baseUrl = authority?.baseUrl || fallbackHealth?.baseUrl || 'local bundle'
  const ragOk = authority?.health?.rag?.reachable
  const authorityMode = Boolean(authority?.authoritySearch?.configured)
  const primaryWarning = authority?.warnings?.find(w => w.severity === 'error' || w.severity === 'warning')
  const displayWarning = authorityLoading && !authority ? undefined : primaryWarning
  const dotColor = healthy ? 'var(--green-500)' : status === 'checking' ? 'var(--text-muted)' : 'var(--amber)'

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '10px',
      marginBottom: 8,
      background: 'var(--bg-elevated)',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: dotColor,
          flexShrink: 0,
        }} />
        <div style={{
          minWidth: 0,
          flex: 1,
          color: 'var(--text-primary)',
          fontSize: 12,
          fontWeight: 700,
          fontFamily: 'monospace',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {source} · {formatCount(count)} items
        </div>
        <div style={{
          color: healthy ? 'var(--green-500)' : 'var(--text-muted)',
          fontSize: 10,
          fontFamily: 'monospace',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}>
          {status}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 7, minWidth: 0 }}>
        <StatusBadge
          label={authorityMode ? 'authority' : 'standard'}
          tone={authorityMode ? 'good' : 'muted'}
          title={authorityMode ? 'Token-gated memd authority search is configured' : 'Using normal memd search only'}
        />
        <StatusBadge
          label={ragOk == null ? 'rag n/a' : ragOk ? 'rag ok' : 'rag down'}
          tone={ragOk ? 'good' : ragOk === false ? 'warn' : 'muted'}
        />
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 6,
        marginTop: 8,
      }}>
        <AuthorityMetric label="active" value={active} />
        <AuthorityMetric label="logs" value={expired} />
        <AuthorityMetric label="inbox" value={candidates} />
      </div>
      <div style={{
        marginTop: 7,
        color: primaryWarning ? 'var(--amber)' : 'var(--text-muted)',
        fontSize: 10,
        fontFamily: 'monospace',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
          {displayWarning?.message || [baseUrl, latency, ragOk == null ? null : `rag ${ragOk ? 'ok' : 'down'}`].filter(Boolean).join(' · ')}
      </div>
    </div>
  )
}

function StatusBadge({ label, tone, title }: { label: string; tone: 'good' | 'warn' | 'muted'; title?: string }) {
  const color = tone === 'good' ? 'var(--green-500)' : tone === 'warn' ? 'var(--amber)' : 'var(--text-muted)'
  return (
    <span
      title={title}
      style={{
        minWidth: 0,
        border: '1px solid var(--border)',
        borderRadius: 999,
        padding: '2px 7px',
        color,
        fontSize: 9,
        fontWeight: 800,
        fontFamily: 'monospace',
        textTransform: 'uppercase',
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

function AuthorityMetric({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '5px 6px',
      minWidth: 0,
      background: 'var(--bg-base)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
        {formatCount(value)}
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'monospace' }}>
        {label}
      </div>
    </div>
  )
}

function MemdViewTabs({
  value,
  onChange,
  counts,
}: {
  value: MemdView
  onChange: (value: MemdView) => void
  counts?: MemdAuthority['counts']
}) {
  const tabs: Array<{ value: MemdView; label: string; count?: number }> = [
    { value: 'current', label: 'Current', count: counts?.active },
    { value: 'inbox', label: 'Inbox', count: counts?.candidates },
    { value: 'repair', label: 'Repair', count: counts?.stale },
    { value: 'logs', label: 'Logs', count: counts?.expired },
    { value: 'files', label: 'Files' },
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
      gap: 3,
      padding: '4px 0 8px',
    }}>
      {tabs.map(tab => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          style={{
            minWidth: 0,
            padding: '5px 4px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: value === tab.value ? 'var(--accent)' : 'transparent',
            color: value === tab.value ? 'var(--text-on-color)' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 10,
            fontFamily: 'monospace',
            fontWeight: 700,
          }}
          title={labelForMemdView(tab.value)}
        >
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tab.label}</span>
          {tab.count != null && (
            <span style={{ display: 'block', fontSize: 9, opacity: 0.75 }}>{formatCount(tab.count)}</span>
          )}
        </button>
      ))}
    </div>
  )
}

function FileRow({ file, active, onClick }: { file: FileItem; active: boolean; onClick: () => void }) {
  const showPath = file.path.includes('/')
  return (
    <button
      onClick={onClick}
      className={active ? undefined : 'hover-bg'}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: active ? 'var(--active-bg)' : 'transparent',
        border: 'none',
        borderRadius: 8,
        padding: showPath ? '7px 12px' : '8px 12px',
        marginBottom: 2,
        cursor: 'pointer',
        color: active ? 'var(--text-on-color)' : 'var(--text-secondary)',
        fontSize: '13px',
        fontFamily: 'monospace',
        fontWeight: active ? 600 : 400,
        transition: 'background 0.15s ease',
      }}
    >
      <span style={{ display: 'block' }}>{file.name}</span>
      {showPath && (
        <span style={{
          display: 'block',
          marginTop: 2,
          color: active ? 'var(--text-on-color)' : 'var(--text-muted)',
          fontSize: '10px',
          fontWeight: 400,
          opacity: 0.78,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {file.path}
        </span>
      )}
    </button>
  )
}

function MemdEntryRow({ entry, active, onClick }: { entry: MemdEntry; active: boolean; onClick: () => void }) {
  const title = (entry.title || entry.name || 'memd memory').toString()
  const preview = (entry.snippet || entry.summary || entry.content || entry.path || '').toString()
  const truncated = preview.length > 160 ? preview.slice(0, 160) + '...' : preview

  return (
    <button
      onClick={onClick}
      className={active ? undefined : 'hover-bg'}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: active ? 'var(--active-bg)' : 'transparent',
        border: 'none',
        borderRadius: 8,
        padding: '8px 12px',
        marginBottom: 2,
        cursor: 'pointer',
        color: active ? 'var(--text-on-color)' : 'var(--text-secondary)',
        fontSize: '13px',
        fontFamily: 'monospace',
        fontWeight: active ? 600 : 400,
        transition: 'background 0.15s ease',
      }}
    >
      <span style={{ display: 'block' }}>{title}</span>
      {truncated && (
        <span style={{
          marginTop: 3,
          color: active ? 'var(--text-on-color)' : 'var(--text-muted)',
          fontSize: '10px',
          fontWeight: 400,
          opacity: 0.78,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          lineHeight: 1.35,
        }}>
          {truncated}
        </span>
      )}
    </button>
  )
}

/** Highlight matching portions of text based on query words */
function highlightText(text: string, query: string): React.ReactNode {
  if (!query || !text) return text
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 1)
  if (words.length === 0) return text

  // Build a regex matching any query word
  const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(pattern)

  return parts.map((part, i) => {
    if (pattern.test(part)) {
      pattern.lastIndex = 0 // reset regex state
      return (
        <mark key={i} style={{
          background: 'var(--accent-dim)',
          color: 'var(--text-primary)',
          borderRadius: '2px',
          padding: '0 1px',
        }}>
          {part}
        </mark>
      )
    }
    return part
  })
}

function SearchResultCard({
  name,
  snippet,
  score,
  active,
  query,
  onClick,
}: {
  name: string
  snippet: string
  score?: number
  active: boolean
  query: string
  onClick: () => void
}) {
  const truncatedSnippet = snippet.length > 200 ? snippet.slice(0, 200) + '...' : snippet

  return (
    <button
      onClick={onClick}
      className={active ? undefined : 'hover-bg'}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: active ? 'var(--active-bg)' : 'transparent',
        border: 'none',
        borderRadius: 10,
        padding: '10px 12px',
        marginBottom: 4,
        cursor: 'pointer',
        transition: 'background 0.15s ease',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '4px',
      }}>
        <span style={{
          fontSize: '13px',
          fontWeight: 600,
          fontFamily: 'monospace',
          color: active ? 'var(--text-on-color)' : 'var(--text-primary)',
        }}>
          {highlightText(name, query)}
        </span>
        {score != null && (
          <span style={{
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: '999px',
            background: 'var(--hover-bg)',
            color: 'var(--text-muted)',
            fontFamily: 'monospace',
            flexShrink: 0,
          }}>
            {(score * 100).toFixed(0)}%
          </span>
        )}
      </div>
      {truncatedSnippet && (
        <div style={{
          fontSize: '11px',
          color: active ? 'var(--text-on-color)' : 'var(--text-secondary)',
          lineHeight: 1.4,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
        }}>
          {highlightText(truncatedSnippet, query)}
        </div>
      )}
    </button>
  )
}
