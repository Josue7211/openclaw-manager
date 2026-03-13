


import { useState, useCallback } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'

interface FileItem {
  name: string
  path: string
}

interface FileTree {
  coreFiles: FileItem[]
  memoryFiles: FileItem[]
}

const API_BASE = 'http://127.0.0.1:3000'

export default function MemoryPage() {
  const queryClient = useQueryClient()
  const { data: treeData } = useQuery<FileTree>({
    queryKey: ['workspace-files'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/workspace/files`)
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const d = await res.json()
      return { coreFiles: d.coreFiles || [], memoryFiles: d.memoryFiles || [] }
    },
  })

  const tree = treeData ?? { coreFiles: [], memoryFiles: [] }

  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [editContent, setEditContent] = useState('')
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [loading, setLoading] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  const loadFile = useCallback(async (filePath: string) => {
    setActiveFile(filePath)
    setMode('view')
    setLoading(true)
    setContent('')
    try {
      const res = await fetch(`${API_BASE}/api/workspace/file?path=${encodeURIComponent(filePath)}`)
      const data = await res.json()
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
      await fetch(`${API_BASE}/api/workspace/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content: fileContent }),
      })
    },
    onSuccess: () => {
      setContent(editContent)
      setLastSaved(new Date())
      setMode('view')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (path: string) => {
      const res = await fetch(`${API_BASE}/api/workspace/file?path=${encodeURIComponent(path)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Delete failed')
      }
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

  const timeSince = (date: Date) => {
    const s = Math.floor((Date.now() - date.getTime()) / 1000)
    if (s < 60) return `${s}s ago`
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    return `${Math.floor(s / 3600)}h ago`
  }

  const fileName = activeFile ? activeFile.split('/').pop() : null

  return (
    <div style={{ display: 'flex', gap: 0, height: 'calc(100vh - 120px)', minHeight: 0 }}>
      {/* Left panel */}
      <div style={{
        width: '33%',
        minWidth: 200,
        borderRight: '1px solid var(--border)',
        overflowY: 'auto',
        paddingRight: 0,
        flexShrink: 0,
      }}>
        <div style={{ padding: '0 0 8px 0', marginBottom: 8 }}>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>Memory</h1>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            workspace files + daily logs
          </p>
        </div>

        {/* Core files section */}
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
          {tree.coreFiles.length === 0 && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '4px 12px' }}>No files found</div>
          )}
          {tree.coreFiles.map(f => (
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
          {tree.memoryFiles.length === 0 && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '4px 12px' }}>No logs found</div>
          )}
          {tree.memoryFiles.map(f => (
            <FileRow
              key={f.path}
              file={f}
              active={activeFile === f.path}
              onClick={() => loadFile(f.path)}
            />
          ))}
        </div>
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
                    Last saved {timeSince(lastSaved)}
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
                        background: saveMutation.isPending ? 'var(--text-muted)' : '#7c3aed',
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
                          border: '1px solid #dc2626',
                          background: 'transparent',
                          color: '#dc2626',
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
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: active ? 'rgba(124, 58, 237, 0.1)' : 'transparent',
        border: 'none',
        borderLeft: active ? '3px solid #7c3aed' : '3px solid transparent',
        padding: '7px 12px 7px 10px',
        cursor: 'pointer',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: '13px',
        fontFamily: 'monospace',
        fontWeight: active ? 600 : 400,
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'
      }}
      onMouseLeave={e => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
      }}
    >
      {file.name}
    </button>
  )
}
