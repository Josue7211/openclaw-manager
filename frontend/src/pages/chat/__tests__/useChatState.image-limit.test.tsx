import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatState } from '../useChatState'
import {
  CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY,
  CHAT_CONTEXT_FILE_LIMIT,
  CHAT_IMAGE_LIMIT,
  chatComposerDraftStorageKeys,
} from '../constants'

const { mockApiGet, mockApiPost } = vi.hoisted(() => ({
  mockApiGet: vi.fn(async () => ({ models: [] })),
  mockApiPost: vi.fn(async () => ({})),
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: mockApiGet,
    post: mockApiPost,
    patch: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    serviceLabel = 'Chat unavailable'
  },
  getRequestApiKeyForPath: () => '',
  getRequestBaseForPath: () => '',
}))

vi.mock('@/lib/hooks/useChatSocket', () => ({
  useChatSocket: () => ({ connected: false, usingFallback: false }),
}))

class FileReaderMock {
  onload: ((event: { target: { result: string } }) => void) | null = null
  onerror: (() => void) | null = null

  readAsDataURL(file: File) {
    this.onload?.({ target: { result: `data:${file.type};base64,${file.name}` } })
  }

  readAsText(file: File) {
    this.onload?.({ target: { result: `contents:${file.name}` } })
  }
}

class DeferredTextFileReaderMock {
  static readers: DeferredTextFileReaderMock[] = []

  onload: ((event: { target: { result: string } }) => void) | null = null
  onerror: (() => void) | null = null
  file: File | null = null

  readAsDataURL(file: File) {
    this.onload?.({ target: { result: `data:${file.type};base64,${file.name}` } })
  }

  readAsText(file: File) {
    this.file = file
    DeferredTextFileReaderMock.readers.push(this)
  }

  resolve() {
    this.onload?.({ target: { result: `contents:${this.file?.name || 'unknown'}` } })
  }

  reject() {
    this.onerror?.()
  }
}

class LargeImageFileReaderMock {
  onload: ((event: { target: { result: string } }) => void) | null = null
  onerror: (() => void) | null = null

  readAsDataURL(file: File) {
    this.onload?.({
      target: {
        result: `data:${file.type};base64,${'x'.repeat((4 * 1024 * 1024) + 1)}`,
      },
    })
  }

  readAsText(file: File) {
    this.onload?.({ target: { result: `contents:${file.name}` } })
  }
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function folderFile(path: string, content = 'x', type = 'text/typescript') {
  const name = path.split('/').pop() || path
  const file = new File([content], name, { type })
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}

describe('useChatState image limit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('FileReader', FileReaderMock)
    sessionStorage.clear()
    localStorage.clear()
  })

  it('caps file attachments and shows a clear limit message', async () => {
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })
    const files = Array.from({ length: CHAT_IMAGE_LIMIT + 2 }, (_, index) => (
      new File(['png'], `shot-${index}.png`, { type: 'image/png' })
    ))

    act(() => {
      result.current.handleFileChange({
        target: { files, value: '' },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    await waitFor(() => {
      expect(result.current.images).toHaveLength(CHAT_IMAGE_LIMIT)
    })
    expect(result.current.systemMsg).toBe(`You can attach up to ${CHAT_IMAGE_LIMIT} images at once.`)
  })

  it('reads dropped text files as structured chat context', async () => {
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })

    act(() => {
      result.current.onDrop({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          dropEffect: 'none',
          files: [new File(['export const x = 1'], 'source.ts', { type: 'text/typescript' })],
        },
      } as unknown as React.DragEvent)
    })

    await waitFor(() => {
      expect(result.current.contextFiles).toHaveLength(1)
    })
    expect(result.current.contextFiles[0]).toMatchObject({
      name: 'source.ts',
      path: 'source.ts',
      content: 'contents:source.ts',
    })
  })

  it('reads pasted text files as structured chat context', async () => {
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })
    const file = new File(['export const pasted = true'], 'pasted.ts', { type: 'text/typescript' })
    const paste = new Event('paste') as ClipboardEvent
    Object.defineProperty(paste, 'clipboardData', {
      value: {
        items: [{
          type: 'text/typescript',
          getAsFile: () => file,
        }],
      },
    })

    act(() => {
      window.dispatchEvent(paste)
    })

    await waitFor(() => {
      expect(result.current.contextFiles).toHaveLength(1)
    })
    expect(result.current.contextFiles[0]).toMatchObject({
      name: 'pasted.ts',
      path: 'pasted.ts',
      content: 'contents:pasted.ts',
    })
  })

  it('ignores pasted files while a pending attachment send is queued', async () => {
    DeferredTextFileReaderMock.readers = []
    vi.stubGlobal('FileReader', DeferredTextFileReaderMock)
    localStorage.setItem('demo-mode', 'true')
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })
    const pastedFile = new File(['export const late = true'], 'late.ts', { type: 'text/typescript' })
    const paste = new Event('paste') as ClipboardEvent
    Object.defineProperty(paste, 'clipboardData', {
      value: {
        items: [{
          type: 'text/typescript',
          getAsFile: () => pastedFile,
        }],
      },
    })

    act(() => {
      result.current.handleContextFileChange({
        target: {
          files: [new File(['export const queued = true'], 'queued.ts', { type: 'text/typescript' })],
          value: '',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
      result.current.setInput('review queued context')
    })
    expect(DeferredTextFileReaderMock.readers).toHaveLength(1)

    act(() => {
      result.current.send()
    })
    expect(result.current.pendingQueuedSend).toBe(true)

    act(() => {
      window.dispatchEvent(paste)
    })

    expect(DeferredTextFileReaderMock.readers).toHaveLength(1)

    act(() => {
      DeferredTextFileReaderMock.readers[0].resolve()
    })

    await waitFor(() => {
      expect(result.current.messages).toContainEqual(expect.objectContaining({
        role: 'user',
        text: 'review queued context',
        contextFiles: [expect.objectContaining({
          name: 'queued.ts',
          content: 'contents:queued.ts',
        })],
      }))
    })
    expect(result.current.pendingQueuedSend).toBe(false)
    expect(result.current.messages).not.toContainEqual(expect.objectContaining({
      contextFiles: [expect.objectContaining({ name: 'late.ts' })],
    }))
  })

  it('ignores pasted files while attachment inputs are externally locked', async () => {
    DeferredTextFileReaderMock.readers = []
    vi.stubGlobal('FileReader', DeferredTextFileReaderMock)
    const { result } = renderHook(() => useChatState(null, {
      blank: true,
      attachmentInputLocked: true,
    }), { wrapper })
    const file = new File(['export const ignored = true'], 'locked.ts', { type: 'text/typescript' })
    const paste = new Event('paste') as ClipboardEvent
    Object.defineProperty(paste, 'clipboardData', {
      value: {
        items: [{
          type: 'text/typescript',
          getAsFile: () => file,
        }],
      },
    })

    act(() => {
      window.dispatchEvent(paste)
    })

    expect(DeferredTextFileReaderMock.readers).toHaveLength(0)
    expect(result.current.contextFiles).toEqual([])
  })

	  it('ignores pasted files from unrelated text inputs outside the chat composer', async () => {
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })
    const input = document.createElement('input')
    document.body.appendChild(input)
    const file = new File(['export const ignored = true'], 'ignored.ts', { type: 'text/typescript' })
    const paste = new Event('paste', { bubbles: true }) as ClipboardEvent
    Object.defineProperty(paste, 'clipboardData', {
      value: {
        items: [{
          type: 'text/typescript',
          getAsFile: () => file,
        }],
      },
    })

    act(() => {
      input.dispatchEvent(paste)
    })

    expect(result.current.contextFiles).toEqual([])
    input.remove()
  })

  it('accepts pasted files from the marked chat composer surface', async () => {
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })
    const composer = document.createElement('div')
    composer.setAttribute('data-chat-composer', 'true')
    document.body.appendChild(composer)
    const file = new File(['export const accepted = true'], 'accepted.ts', { type: 'text/typescript' })
    const paste = new Event('paste', { bubbles: true }) as ClipboardEvent
    Object.defineProperty(paste, 'clipboardData', {
      value: {
        items: [{
          type: 'text/typescript',
          getAsFile: () => file,
        }],
      },
    })

    act(() => {
      composer.dispatchEvent(paste)
    })

    await waitFor(() => {
      expect(result.current.contextFiles).toHaveLength(1)
    })
    expect(result.current.contextFiles[0]).toMatchObject({
      name: 'accepted.ts',
      path: 'accepted.ts',
      content: 'contents:accepted.ts',
    })
    composer.remove()
  })

  it('prioritizes useful project files before generated or vendored folder files', async () => {
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })

    act(() => {
      result.current.handleContextFileChange({
        target: {
          files: [
            folderFile('project/node_modules/pkg/index.ts'),
            folderFile('project/dist/bundle.js', 'bundle', 'text/javascript'),
            folderFile('project/frontend/src/vendor/t3/ProjectSidebar.tsx'),
            folderFile('project/logs/session.log', 'log', 'text/plain'),
            folderFile('project/frontend/src/pages/Chat.tsx'),
            folderFile('project/frontend/src/pages/chat/useChatState.ts'),
            folderFile('project/frontend/src/components/MarkdownBubble.tsx'),
            folderFile('project/frontend/src/lib/api.ts'),
            folderFile('project/src-tauri/src/routes/chat.rs'),
            folderFile('project/README.md', '# Readme', 'text/markdown'),
            folderFile('project/package.json', '{}', 'application/json'),
            folderFile('project/tauri.conf.json', '{}', 'application/json'),
          ],
          value: '',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    await waitFor(() => {
      expect(result.current.contextFiles).toHaveLength(CHAT_CONTEXT_FILE_LIMIT)
    })
    expect(result.current.contextFiles.map(file => file.path)).toEqual([
      'project/frontend/src/components/MarkdownBubble.tsx',
      'project/frontend/src/lib/api.ts',
      'project/frontend/src/pages/Chat.tsx',
      'project/frontend/src/pages/chat/useChatState.ts',
      'project/src-tauri/src/routes/chat.rs',
      'project/package.json',
      'project/README.md',
      'project/tauri.conf.json',
    ])
    expect(result.current.contextFiles.map(file => file.path)).not.toEqual(expect.arrayContaining([
      expect.stringContaining('node_modules'),
      expect.stringContaining('/dist/'),
      expect.stringContaining('/vendor/'),
      expect.stringContaining('/logs/'),
    ]))
  })

  it('surfaces when folder context selection only contains generated files', async () => {
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })

    act(() => {
      result.current.handleContextFileChange({
        target: {
          files: [
            folderFile('project/node_modules/pkg/index.ts'),
            folderFile('project/dist/bundle.js', 'bundle', 'text/javascript'),
          ],
          value: '',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    expect(result.current.contextFiles).toEqual([])
    expect(result.current.systemMsg).toBe('Skipped 2 generated or dependency context files.')
  })

  it('surfaces generated files skipped during drag and drop context attachment', async () => {
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })

    act(() => {
      result.current.onDrop({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          dropEffect: 'none',
          files: [
            folderFile('project/.git/config', 'config', 'text/plain'),
            folderFile('project/target/debug/build.rs'),
          ],
        },
      } as unknown as React.DragEvent)
    })

    expect(result.current.contextFiles).toEqual([])
    expect(result.current.systemMsg).toBe('Skipped 2 generated or dependency context files.')
  })

  it('dedupes repeated context file attachments by path and size', async () => {
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })
    const makeFile = () => new File(['export const x = 1'], 'source.ts', { type: 'text/typescript' })

    act(() => {
      result.current.handleContextFileChange({
        target: {
          files: [makeFile(), makeFile()],
          value: '',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    await waitFor(() => {
      expect(result.current.contextFiles).toHaveLength(1)
    })

    act(() => {
      result.current.onDrop({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          dropEffect: 'none',
          files: [makeFile()],
        },
      } as unknown as React.DragEvent)
    })

    await waitFor(() => {
      expect(result.current.contextFiles).toHaveLength(1)
    })
    expect(JSON.parse(sessionStorage.getItem(CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY) || '[]')).toHaveLength(1)
  })

  it('stores normalized context file paths for chips, drafts, and transcript payloads', async () => {
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })
    const file = new File(['export const x = 1'], 'source.ts', { type: 'text/typescript' })
    Object.defineProperty(file, 'webkitRelativePath', { value: String.raw`./project\\src//source.ts` })

    act(() => {
      result.current.handleContextFileChange({
        target: {
          files: [file],
          value: '',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    await waitFor(() => {
      expect(result.current.contextFiles).toHaveLength(1)
    })
    expect(result.current.contextFiles[0].path).toBe('project/src/source.ts')
    expect(JSON.parse(sessionStorage.getItem(CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY) || '[]')[0]).toMatchObject({
      path: 'project/src/source.ts',
    })
  })

  it('appends native desktop context file attachments through the same draft path', async () => {
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })

    act(() => {
      result.current.appendContextFileAttachments([
        {
          id: 'native-1',
          name: 'App.tsx',
          path: './src/App.tsx',
          content: 'export default function App() { return null }',
          size: 43,
        },
        {
          id: 'native-duplicate',
          name: 'App.tsx',
          path: 'src/App.tsx',
          content: 'export default function App() { return null }',
          size: 43,
        },
      ])
    })

    await waitFor(() => {
      expect(result.current.contextFiles).toHaveLength(1)
    })
    expect(result.current.contextFiles[0]).toMatchObject({
      name: 'App.tsx',
      path: 'src/App.tsx',
    })
    expect(result.current.systemMsg).toBe('Skipped 1 duplicate context file.')
    expect(JSON.parse(sessionStorage.getItem(CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY) || '[]')).toEqual([
      expect.objectContaining({ path: 'src/App.tsx' }),
    ])
  })

  it('surfaces duplicate browser context file selections instead of silently ignoring them', async () => {
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })
    const sourceFile = new File(['export const value = true'], 'source.ts', { type: 'text/typescript' })

    act(() => {
      result.current.handleContextFileChange({
        target: {
          files: [sourceFile],
          value: '',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    await waitFor(() => {
      expect(result.current.contextFiles).toHaveLength(1)
    })

    act(() => {
      result.current.handleContextFileChange({
        target: {
          files: [sourceFile],
          value: '',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    expect(result.current.contextFiles).toHaveLength(1)
    expect(result.current.systemMsg).toBe('Skipped 1 duplicate context file.')
  })

  it('reserves context file slots while file reads are pending', async () => {
    DeferredTextFileReaderMock.readers = []
    vi.stubGlobal('FileReader', DeferredTextFileReaderMock)
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })
    const pendingFiles = Array.from({ length: CHAT_CONTEXT_FILE_LIMIT }, (_, index) => (
      new File([`export const value${index} = true`], `source-${index}.ts`, { type: 'text/typescript' })
    ))

    act(() => {
      result.current.handleContextFileChange({
        target: {
          files: pendingFiles,
          value: '',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })
    act(() => {
      result.current.handleContextFileChange({
        target: {
          files: [new File(['export const extra = true'], 'extra.ts', { type: 'text/typescript' })],
          value: '',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    expect(DeferredTextFileReaderMock.readers).toHaveLength(CHAT_CONTEXT_FILE_LIMIT)
    expect(result.current.pendingAttachmentReads).toBe(CHAT_CONTEXT_FILE_LIMIT)
    expect(result.current.systemMsg).toBe(`You can attach up to ${CHAT_CONTEXT_FILE_LIMIT} context files at once.`)

    act(() => {
      DeferredTextFileReaderMock.readers.forEach(reader => reader.resolve())
    })

    await waitFor(() => {
      expect(result.current.contextFiles).toHaveLength(CHAT_CONTEXT_FILE_LIMIT)
    })
    expect(result.current.pendingAttachmentReads).toBe(0)
    expect(result.current.contextFiles.map(file => file.name)).not.toContain('extra.ts')
  })

  it('does not count pending context file reads against image attachment slots', async () => {
    DeferredTextFileReaderMock.readers = []
    vi.stubGlobal('FileReader', DeferredTextFileReaderMock)
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })

    act(() => {
      result.current.handleContextFileChange({
        target: {
          files: [new File(['export const pending = true'], 'pending.ts', { type: 'text/typescript' })],
          value: '',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    expect(DeferredTextFileReaderMock.readers).toHaveLength(1)
    expect(result.current.pendingAttachmentReads).toBe(1)

    const images = Array.from({ length: CHAT_IMAGE_LIMIT }, (_, index) => (
      new File(['png'], `shot-${index}.png`, { type: 'image/png' })
    ))

    act(() => {
      result.current.handleFileChange({
        target: { files: images, value: '' },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    await waitFor(() => {
      expect(result.current.images).toHaveLength(CHAT_IMAGE_LIMIT)
    })
    expect(result.current.pendingAttachmentReads).toBe(1)
    expect(result.current.systemMsg).not.toBe(`You can attach up to ${CHAT_IMAGE_LIMIT} images at once.`)
  })

  it('persists context file attachments as reloadable composer drafts', async () => {
    const first = renderHook(() => useChatState(null, { blank: true }), { wrapper })

    act(() => {
      first.result.current.handleContextFileChange({
        target: {
          files: [new File(['export const x = 1'], 'source.ts', { type: 'text/typescript' })],
          value: '',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    await waitFor(() => {
      expect(first.result.current.contextFiles).toHaveLength(1)
    })
    expect(sessionStorage.getItem(CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY)).toContain('source.ts')

    first.unmount()
    const second = renderHook(() => useChatState(null, { blank: true }), { wrapper })

    await waitFor(() => {
      expect(second.result.current.contextFiles).toEqual([
        expect.objectContaining({
          name: 'source.ts',
          path: 'source.ts',
          content: 'contents:source.ts',
        }),
      ])
    })
  })

  it('removes stale image drafts when the current attachment set is too large to persist', async () => {
    vi.stubGlobal('FileReader', LargeImageFileReaderMock)
    sessionStorage.setItem('chat-draft-images', JSON.stringify(['data:image/png;base64,old']))
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })

    act(() => {
      result.current.handleFileChange({
        target: {
          files: [new File(['png'], 'large.png', { type: 'image/png' })],
          value: '',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    await waitFor(() => {
      expect(result.current.images.length).toBeGreaterThan(1)
    })
    expect(sessionStorage.getItem('chat-draft-images')).toBeNull()
  })

  it('dedupes stale context file drafts when reloading the composer', async () => {
    sessionStorage.setItem(CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY, JSON.stringify([
      {
        id: 'ctx-1',
        name: 'source.ts',
        path: 'src\\source.ts',
        size: 25,
        content: 'export const value = true',
      },
      {
        id: 'ctx-2',
        name: 'source.ts',
        path: 'src/source.ts',
        size: 25,
        content: 'duplicate content',
      },
      {
        id: 'ctx-3',
        name: 'other.ts',
        path: 'src/other.ts',
        size: 24,
        content: 'export const other = true',
      },
    ]))

    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })

    await waitFor(() => {
      expect(result.current.contextFiles.map(file => file.name)).toEqual(['source.ts', 'other.ts'])
    })
    const saved = JSON.parse(sessionStorage.getItem(CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY) || '[]')
    expect(saved).toHaveLength(2)
    expect(saved.map((file: { content: string }) => file.content)).not.toContain('duplicate content')
  })

  it('loads composer drafts from the selected project scope instead of the legacy global keys', async () => {
    const scopedKeys = chatComposerDraftStorageKeys('project:desktop:/tmp/project-a')
    const scopedContextFile = {
      id: 'ctx-project',
      name: 'app.ts',
      path: 'src/app.ts',
      content: 'export const project = "a"',
    }
    sessionStorage.setItem('chat-draft', 'legacy global prompt')
    sessionStorage.setItem('chat-draft-images', JSON.stringify(['data:image/png;base64,legacy']))
    sessionStorage.setItem(CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY, JSON.stringify([{
      id: 'ctx-legacy',
      name: 'legacy.ts',
      content: 'export const legacy = true',
    }]))
    sessionStorage.setItem(scopedKeys.text, 'project scoped prompt')
    sessionStorage.setItem(scopedKeys.images, JSON.stringify(['data:image/png;base64,project']))
    sessionStorage.setItem(scopedKeys.contextFiles, JSON.stringify([scopedContextFile]))

    const { result } = renderHook(() => useChatState(null, {
      blank: true,
      context: {
        environmentId: 'desktop',
        workingDir: '/tmp/project-a',
      },
    }), { wrapper })

    await waitFor(() => {
      expect(result.current.input).toBe('project scoped prompt')
      expect(result.current.images).toEqual(['data:image/png;base64,project'])
      expect(result.current.contextFiles).toEqual([scopedContextFile])
    })
    expect(result.current.draftStorageKeys).toEqual(scopedKeys)
  })

  it('ignores legacy global composer drafts for a project without its own scoped draft', async () => {
    sessionStorage.setItem('chat-draft', 'legacy global prompt')
    sessionStorage.setItem('chat-draft-images', JSON.stringify(['data:image/png;base64,legacy']))
    sessionStorage.setItem(CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY, JSON.stringify([{
      id: 'ctx-legacy',
      name: 'legacy.ts',
      content: 'export const legacy = true',
    }]))

    const { result } = renderHook(() => useChatState(null, {
      blank: true,
      context: {
        environmentId: 'desktop',
        workingDir: '/tmp/project-b',
      },
    }), { wrapper })

    await waitFor(() => {
      expect(result.current.draftStorageKeys).toEqual(chatComposerDraftStorageKeys('project:desktop:/tmp/project-b'))
    })
    expect(result.current.input).toBe('')
    expect(result.current.images).toEqual([])
    expect(result.current.contextFiles).toEqual([])
  })

  it('clears corrupt scoped image drafts instead of keeping images from a previous project', async () => {
    const first = renderHook(() => useChatState(null, {
      blank: true,
      context: {
        environmentId: 'desktop',
        workingDir: '/tmp/project-a',
      },
    }), { wrapper })
    act(() => {
      first.result.current.imagesRef.current = ['data:image/png;base64,previous']
      first.result.current.setImages(['data:image/png;base64,previous'])
    })
    await waitFor(() => {
      expect(first.result.current.images).toEqual(['data:image/png;base64,previous'])
    })
    first.unmount()

    const corruptKeys = chatComposerDraftStorageKeys('project:desktop:/tmp/project-b')
    sessionStorage.setItem(corruptKeys.images, '{not json')

    const second = renderHook(() => useChatState(null, {
      blank: true,
      context: {
        environmentId: 'desktop',
        workingDir: '/tmp/project-b',
      },
    }), { wrapper })

    await waitFor(() => {
      expect(second.result.current.draftStorageKeys).toEqual(corruptKeys)
    })
    expect(second.result.current.images).toEqual([])
    expect(second.result.current.imagesRef.current).toEqual([])
    expect(sessionStorage.getItem(corruptKeys.images)).toBeNull()
  })

  it('discards stale composer drafts for explicit new chats', async () => {
    sessionStorage.setItem('chat-draft', 'old prompt')
    sessionStorage.setItem('chat-draft-images', JSON.stringify(['data:image/png;base64,old']))
    sessionStorage.setItem(CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY, JSON.stringify([{
      id: 'ctx-1',
      name: 'old.ts',
      content: 'export const old = true',
    }]))

    const { result } = renderHook(() => useChatState(null, { blank: true, newChat: true }), { wrapper })

    await waitFor(() => {
      expect(sessionStorage.getItem('chat-draft')).toBeNull()
      expect(sessionStorage.getItem('chat-draft-images')).toBeNull()
      expect(sessionStorage.getItem(CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY)).toBeNull()
    })
    expect(result.current.input).toBe('')
    expect(result.current.images).toEqual([])
    expect(result.current.contextFiles).toEqual([])
  })

  it('keeps attachments on demo-mode user messages and clears composer drafts after send', async () => {
    localStorage.setItem('demo-mode', 'true')
    sessionStorage.setItem('chat-draft', 'review attachments')
    sessionStorage.setItem('chat-draft-images', JSON.stringify(['data:image/png;base64,shot']))
    sessionStorage.setItem(CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY, JSON.stringify([{
      id: 'ctx-1',
      name: 'source.ts',
      path: 'src/source.ts',
      content: 'export const value = true',
    }]))

    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })
    const contextFile = {
      id: 'ctx-1',
      name: 'source.ts',
      path: 'src/source.ts',
      content: 'export const value = true',
    }

    act(() => {
      result.current.setInput('review attachments')
      result.current.imagesRef.current = ['data:image/png;base64,shot']
      result.current.contextFilesRef.current = [contextFile]
      result.current.setImages(['data:image/png;base64,shot'])
      result.current.setContextFiles([contextFile])
    })

    act(() => {
      result.current.send()
    })

    await waitFor(() => {
      expect(result.current.messages).toContainEqual(expect.objectContaining({
        role: 'user',
        text: 'review attachments',
        images: ['data:image/png;base64,shot'],
        contextFiles: [contextFile],
      }))
    })
    expect(result.current.imagesRef.current).toEqual([])
    expect(result.current.contextFilesRef.current).toEqual([])
    expect(result.current.images).toEqual([])
    expect(result.current.contextFiles).toEqual([])
    expect(sessionStorage.getItem('chat-draft')).toBeNull()
    expect(sessionStorage.getItem('chat-draft-images')).toBeNull()
    expect(sessionStorage.getItem(CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('handles demo-mode slash commands locally instead of appending them as chat messages', async () => {
    localStorage.setItem('demo-mode', 'true')
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })

    act(() => {
      result.current.setInput('/clear')
    })

    act(() => {
      result.current.send()
    })

    await waitFor(() => {
      expect(result.current.messages).toEqual([])
    })
    expect(result.current.input).toBe('')
    expect(result.current.systemMsg).toBe('\u2500\u2500 Chat view cleared \u2500\u2500')
  })

  it('handles slash commands when draft and session-start storage are unavailable', async () => {
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })

    act(() => {
      result.current.setInput('/clear')
    })

    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError')
    })
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError')
    })

    try {
      act(() => {
        result.current.send()
      })
    } finally {
      removeItemSpy.mockRestore()
      setItemSpy.mockRestore()
    }

    expect(result.current.input).toBe('')
    expect(result.current.images).toEqual([])
    expect(result.current.contextFiles).toEqual([])
    expect(result.current.messages).toEqual([])
    expect(result.current.optimistic).toEqual([])
    expect(result.current.systemMsg).toBe('\u2500\u2500 Chat view cleared \u2500\u2500')
  })

  it('waits for pending demo-mode context file reads before sending', async () => {
    DeferredTextFileReaderMock.readers = []
    vi.stubGlobal('FileReader', DeferredTextFileReaderMock)
    localStorage.setItem('demo-mode', 'true')
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })
    const initialMessageCount = result.current.messages.length

    act(() => {
      result.current.handleContextFileChange({
        target: {
          files: [new File(['export const x = 1'], 'source.ts', { type: 'text/typescript' })],
          value: '',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
      result.current.setInput('review pending context')
    })

    act(() => {
      result.current.send()
    })

    expect(result.current.messages).toHaveLength(initialMessageCount)
    expect(result.current.input).toBe('')
    expect(result.current.pendingAttachmentReads).toBe(1)
    expect(result.current.pendingQueuedSend).toBe(true)

    act(() => {
      DeferredTextFileReaderMock.readers.forEach(reader => reader.resolve())
    })

    await waitFor(() => {
      expect(result.current.messages).toContainEqual(expect.objectContaining({
        role: 'user',
        text: 'review pending context',
        contextFiles: [expect.objectContaining({
          name: 'source.ts',
          content: 'contents:source.ts',
        })],
      }))
    })
    expect(result.current.pendingAttachmentReads).toBe(0)
    expect(result.current.pendingQueuedSend).toBe(false)
  })

  it('does not send an empty queued message when attachment reads fail', async () => {
    DeferredTextFileReaderMock.readers = []
    vi.stubGlobal('FileReader', DeferredTextFileReaderMock)
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })

    act(() => {
      result.current.handleContextFileChange({
        target: {
          files: [new File(['export const fails = true'], 'fails.ts', { type: 'text/typescript' })],
          value: '',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })
    expect(DeferredTextFileReaderMock.readers).toHaveLength(1)
    expect(result.current.pendingAttachmentReads).toBe(1)

    act(() => {
      result.current.send()
    })
    expect(result.current.pendingQueuedSend).toBe(true)
    act(() => {
      DeferredTextFileReaderMock.readers[0].reject()
    })

    await waitFor(() => {
      expect(result.current.contextFiles).toEqual([])
    })
    expect(result.current.optimistic).toEqual([])
    expect(result.current.sending).toBe(false)
    expect(result.current.pendingAttachmentReads).toBe(0)
    expect(result.current.pendingQueuedSend).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('restores a queued prompt instead of sending it without failed file context', async () => {
    DeferredTextFileReaderMock.readers = []
    vi.stubGlobal('FileReader', DeferredTextFileReaderMock)
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })

    act(() => {
      result.current.handleContextFileChange({
        target: {
          files: [new File(['export const fails = true'], 'fails.ts', { type: 'text/typescript' })],
          value: '',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
      result.current.setInput('review the failed attachment')
    })

    act(() => {
      result.current.send()
    })

    expect(result.current.pendingQueuedSend).toBe(true)
    expect(result.current.input).toBe('')

    act(() => {
      DeferredTextFileReaderMock.readers[0].reject()
    })

    await waitFor(() => {
      expect(result.current.input).toBe('review the failed attachment')
    })
    expect(sessionStorage.getItem('chat-draft')).toBe('review the failed attachment')
    expect(result.current.contextFiles).toEqual([])
    expect(result.current.pendingAttachmentReads).toBe(0)
    expect(result.current.pendingQueuedSend).toBe(false)
    expect(result.current.systemMsg).toBe('Attachment failed to load. Check the files and send again.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('cancels a queued send while attachment reads continue', async () => {
    DeferredTextFileReaderMock.readers = []
    vi.stubGlobal('FileReader', DeferredTextFileReaderMock)
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })

    act(() => {
      result.current.handleContextFileChange({
        target: {
          files: [new File(['export const queued = true'], 'queued.ts', { type: 'text/typescript' })],
          value: '',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
      result.current.setInput('review queued context')
    })
    expect(DeferredTextFileReaderMock.readers).toHaveLength(1)

    act(() => {
      result.current.send()
    })

    expect(result.current.pendingQueuedSend).toBe(true)
    expect(result.current.input).toBe('')
    expect(sessionStorage.getItem('chat-draft')).toBeNull()

    act(() => {
      result.current.cancelQueuedSend()
    })

    expect(result.current.pendingQueuedSend).toBe(false)
    expect(result.current.pendingAttachmentReads).toBe(1)
    expect(result.current.input).toBe('review queued context')
    expect(sessionStorage.getItem('chat-draft')).toBe('review queued context')

    act(() => {
      DeferredTextFileReaderMock.readers[0].resolve()
    })

    await waitFor(() => {
      expect(result.current.contextFiles).toEqual([
        expect.objectContaining({
          name: 'queued.ts',
          content: 'contents:queued.ts',
        }),
      ])
    })
    expect(result.current.pendingAttachmentReads).toBe(0)
    expect(result.current.optimistic).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
