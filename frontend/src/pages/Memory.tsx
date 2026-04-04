


import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Brain, Scroll, MagnifyingGlass, Sparkle } from '@phosphor-icons/react'
import { api } from '@/lib/api'
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
}

interface SearchResult {
  path?: string
  name?: string
  content?: string
  score?: number
  snippet?: string
  [key: string]: unknown
}

export default function MemoryPage() {
  const queryClient = useQueryClient()
  const { data: treeData, isLoading: treeLoading } = useQuery<FileTree>({
    queryKey: queryKeys.workspaceFiles,
    queryFn: async () => {
      const d = await api.get<{ coreFiles?: FileItem[]; memoryFiles?: FileItem[] }>('/api/workspace/files')
      return { coreFiles: d.coreFiles || [], memoryFiles: d.memoryFiles || [] }
    },
  })

  const tree = {
    coreFiles: treeData?.coreFiles ?? [],
    memoryFiles: treeData?.memoryFiles ?? [],
  }

  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [editContent, setEditContent] = useState('')
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [loading, setLoading] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [search, setSearch] = useState('')
  const [searchMode, setSearchMode] = useState<'files' | 'semantic'>('files')
  const [semanticQuery, setSemanticQuery] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      const resp = await api.post<{ ok: boolean; data?: { results?: SearchResult[] } & Record<string, unknown> }>('/api/gateway/memory/search', {
        query: semanticQuery,
        limit: 20,
      })
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
    setActiveFile(filePath)
    setMode('view')
    setLoading(true)
    setContent('')
    try {
      const data = await api.get<{ content?: string }>(`/api/workspace/file?path=${encodeURIComponent(filePath)}`)
      setContent(data.content || '')
      setEditContent(data.content || '')
    } catch {
      setContent('Error loading file.')
    } finally {
      setLoading(false)
    }
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
    if (!activeFile) return
    await saveMutation.mutateAsync({ path: activeFile, content: editContent })
  }

  const deleteFile = async () => {
    if (!activeFile) return
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
          <PageHeader defaultTitle="Memory" defaultSubtitle="workspace files + daily logs" />
        </div>

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
                Search unavailable. Check gateway connection.
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
                    Workspace Files
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

                {/* Memory logs section */}
                <div>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    padding: '8px 12px 4px',
                  }}>
                    Memory Logs
                  </div>
                  {filteredMemory.length === 0 && (
                    <div style={{ padding: '8px 0' }}>
                      <EmptyState icon={Scroll} title={q ? 'No matches' : 'No logs found'} />
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
              Select a file from the left panel to view or edit it.
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexShrink: 0 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                  {fileName}
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

function FileRow({ file, active, onClick }: { file: FileItem; active: boolean; onClick: () => void }) {
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
      {file.name}
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
