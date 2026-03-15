


import { useState, useCallback } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/utils'
import { SkeletonList } from '@/components/Skeleton'
import { PageHeader } from '@/components/PageHeader'

interface FileItem {
  name: string
  path: string
}

interface FileTree {
  coreFiles: FileItem[]
  memoryFiles: FileItem[]
}

export default function MemoryPage() {
  const queryClient = useQueryClient()
  const { data: treeData, isLoading: treeLoading } = useQuery<FileTree>({
    queryKey: ['workspace-files'],
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
      queryClient.invalidateQueries({ queryKey: ['workspace-files'] })
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
  const filteredCore = q
    ? tree.coreFiles.filter(f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
    : tree.coreFiles
  const filteredMemory = q
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

        <div style={{ padding: '0 0 8px 0' }}>
          <input
            type="text"
            placeholder="Search files..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search files"
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

        {/* Core files section */}
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
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '4px 12px' }}>{q ? 'No matches' : 'No files found'}</div>
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
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '4px 12px' }}>{q ? 'No matches' : 'No logs found'}</div>
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
                    color: mode === 'view' ? '#fff' : 'var(--text-secondary)',
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
                    color: mode === 'edit' ? '#fff' : 'var(--text-secondary)',
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
                        color: '#fff',
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
        color: active ? '#fff' : 'var(--text-secondary)',
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
