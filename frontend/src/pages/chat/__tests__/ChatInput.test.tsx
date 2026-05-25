import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import ChatInput from '../ChatInput'
import {
  CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY,
  LEGACY_CHAT_COMPOSER_DRAFT_STORAGE_KEYS,
} from '../constants'

vi.mock('@phosphor-icons/react', () => ({
  ClipboardText: (props: Record<string, unknown>) => <svg data-testid="icon-copy" {...props} />,
  ClockCounterClockwise: (props: Record<string, unknown>) => <svg data-testid="icon-history" {...props} />,
  FileText: (props: Record<string, unknown>) => <svg data-testid="icon-file" {...props} />,
  FolderOpen: (props: Record<string, unknown>) => <svg data-testid="icon-folder" {...props} />,
  Image: (props: Record<string, unknown>) => <svg data-testid="icon-image" {...props} />,
  PaperPlaneTilt: (props: Record<string, unknown>) => <svg data-testid="icon-send" {...props} />,
  Square: (props: Record<string, unknown>) => <svg data-testid="icon-stop" {...props} />,
  X: (props: Record<string, unknown>) => <svg data-testid="icon-x" {...props} />,
}))

const clipboardWriteText = vi.fn(async () => {})

Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: {
    writeText: clipboardWriteText,
  },
})

function renderChatInputProps(overrides: Partial<React.ComponentProps<typeof ChatInput>> = {}): React.ComponentProps<typeof ChatInput> {
  return {
    input: 'hello',
    setInput: vi.fn(),
    images: [],
    setImages: vi.fn(),
    imagesRef: { current: [] },
    contextFiles: [],
    setContextFiles: vi.fn(),
    contextFilesRef: { current: [] },
    sending: false,
    onSend: vi.fn(),
    onStop: vi.fn(),
    onFileChange: vi.fn(),
    onContextFileChange: vi.fn(),
    onDrop: vi.fn(),
    draftTimerRef: { current: null },
    draftStorageKeys: LEGACY_CHAT_COMPOSER_DRAFT_STORAGE_KEYS,
    ...overrides,
  }
}

function renderChatInput(overrides: Partial<React.ComponentProps<typeof ChatInput>> = {}) {
  const props = renderChatInputProps(overrides)
  render(<ChatInput {...props} />)
  return props
}

describe('ChatInput', () => {
  beforeEach(() => {
    clipboardWriteText.mockClear()
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: undefined,
    })
  })

  it('renders Hermes-only provider choices even when stale local providers are present', () => {
    const setProvider = vi.fn()
    const setModel = vi.fn()

    render(
      <ChatInput.Header
        model="gpt-5.5"
        setModel={setModel}
        models={[{ id: 'gpt-5.5', name: 'GPT 5.5' }]}
        provider="hermes"
        setProvider={setProvider}
        providers={[
          { id: 'hermes', name: 'Hermes', description: 'Hermes Agent', modelBacked: true, available: true },
          { id: 'claudeAgent', name: 'Claude Code', description: 'Local Claude Code CLI', modelBacked: false, available: true },
          { id: 'codex-cli', name: 'Codex CLI', description: 'Local Codex CLI', modelBacked: false, available: true },
        ]}
        connected
        wsConnected
        historyIsError={false}
        isDemo={false}
      />,
    )

    const picker = screen.getByRole('button', { name: 'Select provider and model' })
    expect(picker).toHaveTextContent('Hermes Agent')
    expect(picker).toHaveTextContent('GPT 5.5')

    fireEvent.click(picker)
    expect(screen.getByRole('dialog', { name: 'Provider and model picker' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hermes Agent' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Claude Code' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Codex CLI' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /openclaw/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hermes Agent' }))
    expect(setProvider).not.toHaveBeenCalledWith('claudeAgent')
    expect(setProvider).not.toHaveBeenCalledWith('codex-cli')
  })

  it('normalizes stale backend agent labels in the chat header', () => {
    render(
      <ChatInput.Header
        model="gpt-5.5"
        setModel={vi.fn()}
        models={[{ id: 'gpt-5.5', name: 'GPT 5.5' }]}
        provider="hermes"
        setProvider={vi.fn()}
        providers={[
          { id: 'hermes', name: 'Hermes', description: 'Hermes Agent', modelBacked: true, available: true },
        ]}
        agentLabel="Codex LB"
        connected
        wsConnected
        historyIsError={false}
        isDemo={false}
      />,
    )

    expect(screen.getByLabelText('Active agent')).toHaveTextContent('Hermes Agent')
    expect(screen.queryByText('Codex LB')).not.toBeInTheDocument()
  })

  it('renders the provider picker as an opaque viewport-clamped overlay', () => {
    const originalInnerWidth = window.innerWidth
    const originalInnerHeight = window.innerHeight
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 220 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 260 })

    render(
      <ChatInput.Header
        model="gpt-5.5"
        setModel={vi.fn()}
        models={[{ id: 'gpt-5.5', name: 'GPT 5.5' }]}
        provider="hermes"
        setProvider={vi.fn()}
        providers={[
          { id: 'hermes', name: 'Hermes', description: 'Hermes Agent', modelBacked: true, available: true },
          { id: 'claudeAgent', name: 'Claude Code', description: 'Local Claude Code CLI', modelBacked: false, available: true },
        ]}
        connected
        wsConnected
        historyIsError={false}
        isDemo={false}
      />,
    )

    const picker = screen.getByRole('button', { name: 'Select provider and model' })
    vi.spyOn(picker, 'getBoundingClientRect').mockReturnValue({
      x: 190,
      y: 20,
      width: 90,
      height: 30,
      top: 20,
      right: 280,
      bottom: 50,
      left: 190,
      toJSON: () => ({}),
    } as DOMRect)

    fireEvent.click(picker)

    const dialog = screen.getByRole('dialog', { name: 'Provider and model picker' })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })

    expect(dialog).toHaveStyle({
      position: 'fixed',
      left: '8px',
      top: '8px',
      width: '204px',
      zIndex: '1100',
      opacity: '1',
      isolation: 'isolate',
      backdropFilter: 'none',
    })
    expect(dialog.style.background).toContain('--bg-card-solid')
    expect(dialog.style.background).toContain('--bg-base')
  })

  it('falls back to Hermes when a stale local provider is active', () => {
    render(
      <ChatInput.Header
        model="gpt-5.5"
        setModel={vi.fn()}
        models={[{ id: 'gpt-5.5', name: 'GPT 5.5' }]}
        provider="claudeAgent"
        setProvider={vi.fn()}
        providers={[
          { id: 'hermes', name: 'Hermes', description: 'Hermes Agent', modelBacked: true, available: true },
          { id: 'claudeAgent', name: 'Claude Code', description: 'Local Claude Code CLI', modelBacked: false, available: true },
        ]}
        connected
        wsConnected
        historyIsError={false}
        isDemo={false}
      />,
    )

    const picker = screen.getByRole('button', { name: 'Select provider and model' })
    expect(picker).toHaveTextContent('Hermes Agent')
    expect(picker).toHaveTextContent('GPT 5.5')

    fireEvent.click(picker)
    expect(screen.getByRole('listbox', { name: 'Hermes Agent models' })).toBeInTheDocument()
    expect(screen.queryByText('Direct local provider')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Use Claude Code/i })).not.toBeInTheDocument()
  })

  it('hides unavailable stale local providers instead of offering selection', () => {
    const setProvider = vi.fn()
    render(
      <ChatInput.Header
        model="gpt-5.5"
        setModel={vi.fn()}
        models={[{ id: 'gpt-5.5', name: 'GPT 5.5' }]}
        provider="hermes"
        setProvider={setProvider}
        providers={[
          { id: 'hermes', name: 'Hermes', description: 'Hermes Agent', modelBacked: true, available: true },
          {
            id: 'claudeAgent',
            name: 'Claude Code',
            description: 'Claude Code command not found',
            modelBacked: false,
            available: false,
            unavailableReason: 'Claude Code command not found',
          },
        ]}
        connected
        wsConnected
        historyIsError={false}
        isDemo={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Select provider and model' }))

    expect(screen.queryByRole('button', { name: 'Claude Code' })).not.toBeInTheDocument()
    expect(setProvider).not.toHaveBeenCalledWith('claudeAgent')
  })

  it('selects a Hermes model from the T3-style picker rows', () => {
    const setModel = vi.fn()

    render(
      <ChatInput.Header
        model="gpt-5.5"
        setModel={setModel}
        models={[
          { id: 'gpt-5.5', name: 'GPT 5.5' },
          { id: 'gpt-5.4', name: 'GPT 5.4' },
        ]}
        provider="hermes"
        setProvider={vi.fn()}
        providers={[
          { id: 'hermes', name: 'Hermes', description: 'Hermes Agent', modelBacked: true, available: true },
          { id: 'codex-cli', name: 'Codex CLI', description: 'Local Codex CLI', modelBacked: false, available: true },
        ]}
        connected
        wsConnected
        historyIsError={false}
        isDemo={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Select provider and model' }))
    fireEvent.click(screen.getByRole('option', { name: /GPT 5.4/i }))

    expect(setModel).toHaveBeenCalledWith('gpt-5.4')
  })

  it('selects a visible model from the T3-style numeric shortcuts', () => {
    const setModel = vi.fn()

    render(
      <ChatInput.Header
        model="gpt-5.5"
        setModel={setModel}
        models={[
          { id: 'gpt-5.5', name: 'GPT 5.5' },
          { id: 'gpt-5.4', name: 'GPT 5.4' },
        ]}
        provider="hermes"
        setProvider={vi.fn()}
        providers={[
          { id: 'hermes', name: 'Hermes', description: 'Hermes Agent', modelBacked: true, available: true },
        ]}
        connected
        wsConnected
        historyIsError={false}
        isDemo={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Select provider and model' }))
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Provider and model picker' }), { key: '2' })

    expect(setModel).toHaveBeenCalledWith('gpt-5.4')
  })

  it('opens the provider picker from the keyboard and selects models with roving focus', async () => {
    const setModel = vi.fn()

    render(
      <ChatInput.Header
        model="gpt-5.5"
        setModel={setModel}
        models={[
          { id: 'gpt-5.5', name: 'GPT 5.5' },
          { id: 'gpt-5.4', name: 'GPT 5.4' },
        ]}
        provider="hermes"
        setProvider={vi.fn()}
        providers={[
          { id: 'hermes', name: 'Hermes', description: 'Hermes Agent', modelBacked: true, available: true },
        ]}
        connected
        wsConnected
        historyIsError={false}
        isDemo={false}
      />,
    )

    const picker = screen.getByRole('button', { name: 'Select provider and model' })
    fireEvent.keyDown(picker, { key: 'ArrowDown' })

    const dialog = screen.getByRole('dialog', { name: 'Provider and model picker' })
    await waitFor(() => expect(dialog).toHaveFocus())
    expect(screen.getByRole('listbox', { name: 'Hermes Agent models' })).toHaveAttribute(
      'aria-activedescendant',
      'chat-model-picker-option-gpt-5.5',
    )

    fireEvent.keyDown(dialog, { key: 'ArrowDown' })
    expect(screen.getByRole('listbox', { name: 'Hermes Agent models' })).toHaveAttribute(
      'aria-activedescendant',
      'chat-model-picker-option-gpt-5.4',
    )
    fireEvent.keyDown(dialog, { key: 'Enter' })

    expect(setModel).toHaveBeenCalledWith('gpt-5.4')
    expect(picker).toHaveFocus()
  })

  it('keeps keyboard provider navigation scoped to Hermes', async () => {
    const setProvider = vi.fn()
    const setModel = vi.fn()

    render(
      <ChatInput.Header
        model="gpt-5.5"
        setModel={setModel}
        models={[{ id: 'gpt-5.5', name: 'GPT 5.5' }]}
        provider="hermes"
        setProvider={setProvider}
        providers={[
          { id: 'hermes', name: 'Hermes', description: 'Hermes Agent', modelBacked: true, available: true },
          { id: 'codex-cli', name: 'Codex CLI', description: 'Local Codex CLI', modelBacked: false, available: true },
        ]}
        connected
        wsConnected
        historyIsError={false}
        isDemo={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Select provider and model' }))
    const dialog = screen.getByRole('dialog', { name: 'Provider and model picker' })
    await waitFor(() => expect(dialog).toHaveFocus())

    fireEvent.keyDown(dialog, { key: 'ArrowRight' })

    expect(screen.getByRole('listbox', { name: 'Hermes Agent models' })).toBeInTheDocument()
    expect(screen.queryByText('Direct local provider')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Codex CLI' })).not.toBeInTheDocument()
    expect(setProvider).not.toHaveBeenCalled()

    fireEvent.keyDown(dialog, { key: 'Enter' })

    expect(setProvider).not.toHaveBeenCalledWith('codex-cli')
    expect(setModel).toHaveBeenCalledWith('gpt-5.5')
    expect(screen.queryByRole('dialog', { name: 'Provider and model picker' })).not.toBeInTheDocument()
  })

  it('sends on Enter without Shift', () => {
    const props = renderChatInput()

    fireEvent.keyDown(screen.getByLabelText('Chat message'), { key: 'Enter' })

    expect(props.onSend).toHaveBeenCalledTimes(1)
  })

  it('focuses the composer when the page sends a focus signal', () => {
    const { rerender } = render(<ChatInput {...renderChatInputProps({ focusSignal: 0 })} />)
    const textarea = screen.getByLabelText('Chat message')
    expect(textarea).not.toHaveFocus()

    rerender(<ChatInput {...renderChatInputProps({ focusSignal: 1 })} />)

    expect(textarea).toHaveFocus()
  })

  it('keeps newline behavior on Shift+Enter', () => {
    const props = renderChatInput()

    fireEvent.keyDown(screen.getByLabelText('Chat message'), { key: 'Enter', shiftKey: true })

    expect(props.onSend).not.toHaveBeenCalled()
  })

  it('recalls recent prompts with ArrowUp and restores the draft with ArrowDown', () => {
    const imagesRef = { current: [] as string[] }
    const contextFiles = [{
      id: 'ctx-history',
      name: 'History.ts',
      path: 'src/History.ts',
      content: 'export const history = true',
    }]
    const contextFilesRef = { current: [] as typeof contextFiles }
    const setInput = vi.fn()
    const setImages = vi.fn()
    const setContextFiles = vi.fn()
    renderChatInput({
      input: '',
      setInput,
      imagesRef,
      setImages,
      contextFilesRef,
      setContextFiles,
      promptHistory: [{
        text: 'previous prompt',
        images: ['data:image/png;base64,history'],
        contextFiles,
      }],
    })

    const textarea = screen.getByLabelText('Chat message')

    fireEvent.keyDown(textarea, { key: 'ArrowUp' })

    expect(setInput).toHaveBeenLastCalledWith('previous prompt')
    expect(setImages).toHaveBeenLastCalledWith(['data:image/png;base64,history'])
    expect(imagesRef.current).toEqual(['data:image/png;base64,history'])
    expect(setContextFiles).toHaveBeenLastCalledWith(contextFiles)
    expect(contextFilesRef.current).toEqual(contextFiles)
    expect(sessionStorage.getItem('chat-draft')).toBe('previous prompt')
    expect(JSON.parse(sessionStorage.getItem('chat-draft-images') || '[]')).toEqual(['data:image/png;base64,history'])
    expect(JSON.parse(sessionStorage.getItem(CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY) || '[]')).toEqual(contextFiles)

    fireEvent.keyDown(textarea, { key: 'ArrowDown' })

    expect(setInput).toHaveBeenLastCalledWith('')
    expect(setImages).toHaveBeenLastCalledWith([])
    expect(imagesRef.current).toEqual([])
    expect(setContextFiles).toHaveBeenLastCalledWith([])
    expect(contextFilesRef.current).toEqual([])
    expect(sessionStorage.getItem('chat-draft-images')).toBeNull()
    expect(sessionStorage.getItem(CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('does not overwrite staged attachments when ArrowUp prompt history recall starts', () => {
    const imagesRef = { current: ['data:image/png;base64,current'] }
    const contextFiles = [{
      id: 'ctx-current',
      name: 'Current.ts',
      path: 'src/Current.ts',
      content: 'export const current = true',
    }]
    const contextFilesRef = { current: contextFiles }
    const setInput = vi.fn()
    const setImages = vi.fn()
    const setContextFiles = vi.fn()
    renderChatInput({
      input: '',
      setInput,
      images: imagesRef.current,
      imagesRef,
      setImages,
      contextFiles,
      contextFilesRef,
      setContextFiles,
      promptHistory: [{
        text: 'previous prompt',
        images: ['data:image/png;base64,history'],
        contextFiles: [{
          id: 'ctx-history',
          name: 'History.ts',
          path: 'src/History.ts',
          content: 'export const history = true',
        }],
      }],
    })

    fireEvent.keyDown(screen.getByLabelText('Chat message'), { key: 'ArrowUp' })

    expect(setInput).not.toHaveBeenCalledWith('previous prompt')
    expect(setImages).not.toHaveBeenCalled()
    expect(imagesRef.current).toEqual(['data:image/png;base64,current'])
    expect(setContextFiles).not.toHaveBeenCalled()
    expect(contextFilesRef.current).toEqual(contextFiles)
  })

  it('restores recent prompts and attachments from the visible history menu', () => {
    const imagesRef = { current: ['data:image/png;base64,current'] }
    const historyContextFiles = [{
      id: 'ctx-history-menu',
      name: 'HistoryMenu.ts',
      path: 'src/HistoryMenu.ts',
      content: 'export const historyMenu = true',
    }]
    const contextFilesRef = { current: [] as typeof historyContextFiles }
    const setInput = vi.fn()
    const setImages = vi.fn()
    const setContextFiles = vi.fn()

    renderChatInput({
      input: 'current draft',
      setInput,
      images: imagesRef.current,
      imagesRef,
      setImages,
      contextFilesRef,
      setContextFiles,
      promptHistory: [{
        text: 'visible history prompt',
        images: ['data:image/png;base64,history-menu'],
        contextFiles: historyContextFiles,
      }],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Show prompt history' }))
    expect(screen.getByRole('menu', { name: 'Prompt history' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /visible history prompt/i })).toBeInTheDocument()
    expect(screen.getByText('1 image + 1 file')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: /visible history prompt/i }))

    expect(setInput).toHaveBeenLastCalledWith('visible history prompt')
    expect(setImages).toHaveBeenLastCalledWith(['data:image/png;base64,history-menu'])
    expect(imagesRef.current).toEqual(['data:image/png;base64,history-menu'])
    expect(setContextFiles).toHaveBeenLastCalledWith(historyContextFiles)
    expect(contextFilesRef.current).toEqual(historyContextFiles)
    expect(sessionStorage.getItem('chat-draft')).toBe('visible history prompt')
    expect(JSON.parse(sessionStorage.getItem('chat-draft-images') || '[]')).toEqual(['data:image/png;base64,history-menu'])
    expect(JSON.parse(sessionStorage.getItem(CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY) || '[]')).toEqual(historyContextFiles)
    expect(screen.queryByRole('menu', { name: 'Prompt history' })).not.toBeInTheDocument()
  })

  it('supports keyboard navigation in the visible prompt history menu', async () => {
    const setInput = vi.fn()
    renderChatInput({
      input: '',
      setInput,
      promptHistory: [
        { text: 'first prompt' },
        { text: 'second prompt' },
        { text: 'third prompt' },
      ],
    })

    const textarea = screen.getByLabelText('Chat message')
    fireEvent.click(screen.getByRole('button', { name: 'Show prompt history' }))
    const menu = screen.getByRole('menu', { name: 'Prompt history' })
    const first = screen.getByRole('menuitem', { name: /first prompt/i })
    const second = screen.getByRole('menuitem', { name: /second prompt/i })
    const third = screen.getByRole('menuitem', { name: /third prompt/i })

    await waitFor(() => expect(first).toHaveFocus())

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(second).toHaveFocus()

    fireEvent.keyDown(menu, { key: 'End' })
    expect(third).toHaveFocus()

    fireEvent.keyDown(menu, { key: 'Home' })
    expect(first).toHaveFocus()

    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Prompt history' })).not.toBeInTheDocument()
    await waitFor(() => expect(textarea).toHaveFocus())
    expect(setInput).not.toHaveBeenCalled()
  })

  it('closes the visible prompt history menu with Escape', () => {
    const onStop = vi.fn()
    renderChatInput({
      sending: true,
      onStop,
      promptHistory: [{ text: 'recent prompt' }],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Show prompt history' }))
    expect(screen.getByRole('menu', { name: 'Prompt history' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('menu', { name: 'Prompt history' })).not.toBeInTheDocument()
    expect(onStop).not.toHaveBeenCalled()
  })

  it('does not send while IME composition is active', () => {
    const props = renderChatInput()
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    Object.defineProperty(event, 'isComposing', { value: true })

    screen.getByLabelText('Chat message').dispatchEvent(event)

    expect(props.onSend).not.toHaveBeenCalled()
  })

  it('sends from the send button', () => {
    const props = renderChatInput()

    fireEvent.click(screen.getByLabelText('Send message'))

    expect(props.onSend).toHaveBeenCalledTimes(1)
  })

  it('allows an attachment-only send to queue while files are still reading', () => {
    const props = renderChatInput({
      input: '',
      pendingAttachmentReads: 2,
    })

    expect(screen.getByRole('status')).toHaveTextContent('Reading 2 attachments...')
    const sendButton = screen.getByLabelText('Send message')
    expect(sendButton).not.toBeDisabled()
    expect(sendButton).toHaveAttribute('title', 'Send after attachments finish reading')

    fireEvent.click(sendButton)

    expect(props.onSend).toHaveBeenCalledTimes(1)
  })

  it('shows a queued send state while pending attachment reads are already submitted', () => {
    const onCancelQueuedSend = vi.fn()
    const props = renderChatInput({
      input: '',
      pendingAttachmentReads: 1,
      pendingQueuedSend: true,
      onCancelQueuedSend,
    })

    expect(screen.getByRole('status')).toHaveTextContent('Queued send; reading 1 attachment...')
    const sendButton = screen.getByRole('button', { name: 'Send queued until attachments finish reading' })
    expect(sendButton).toBeDisabled()
    expect(sendButton).toHaveAttribute('title', 'Queued; sending after attachments finish reading')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel queued send' }))

    fireEvent.click(sendButton)

    expect(onCancelQueuedSend).toHaveBeenCalledTimes(1)
    expect(props.onSend).not.toHaveBeenCalled()
  })

  it('locks the composer text while a queued attachment send is pending', () => {
    const setInput = vi.fn()
    renderChatInput({
      input: '',
      setInput,
      pendingAttachmentReads: 1,
      pendingQueuedSend: true,
    })

    const textarea = screen.getByLabelText('Chat message')
    expect(textarea).toHaveAttribute('readonly')
    expect(textarea).toHaveAttribute('placeholder', 'Queued send will run after attachments finish reading')

    fireEvent.change(textarea, { target: { value: 'next draft while queued' } })
    fireEvent.keyDown(textarea, { key: 'ArrowUp' })

    expect(setInput).not.toHaveBeenCalled()
  })

  it('locks attachment controls while a queued attachment send is pending', () => {
    const setImages = vi.fn()
    const setContextFiles = vi.fn()
    const onDrop = vi.fn()
    const contextFiles = [{
      id: 'ctx-queued',
      name: 'Queued.ts',
      path: 'src/Queued.ts',
      content: 'export const queued = true',
    }]
    const props = renderChatInput({
      input: '',
      images: ['data:image/png;base64,queued'],
      setImages,
      imagesRef: { current: ['data:image/png;base64,queued'] },
      contextFiles,
      setContextFiles,
      contextFilesRef: { current: contextFiles },
      pendingAttachmentReads: 1,
      pendingQueuedSend: true,
      onDrop,
    })

    expect(screen.getByRole('button', { name: 'Attach image unavailable while send is queued' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Attach file context unavailable while send is queued' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Attach folder context unavailable while send is queued' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear all attachments' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove image 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove file Queued.ts' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Clear all attachments' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove image 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove file Queued.ts' }))
    fireEvent.drop(screen.getByTestId('chat-input-dropzone'), {
      dataTransfer: { files: [new File(['next'], 'next.ts', { type: 'text/typescript' })] },
    })

    expect(setImages).not.toHaveBeenCalled()
    expect(setContextFiles).not.toHaveBeenCalled()
    expect(props.onFileChange).not.toHaveBeenCalled()
    expect(props.onContextFileChange).not.toHaveBeenCalled()
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('blocks send while native desktop context attachments are loading', () => {
    const props = renderChatInput({
      input: 'review this folder',
      pendingAttachmentReads: 1,
      attachmentReadsBlockSend: true,
    })

    const sendButton = screen.getByRole('button', { name: 'Send unavailable while attachments are reading' })
    expect(screen.getByRole('status')).toHaveTextContent('Reading 1 attachment...')
    expect(sendButton).toBeDisabled()
    expect(sendButton).toHaveAttribute('title', 'Reading selected context before sending')

    fireEvent.keyDown(screen.getByLabelText('Chat message'), { key: 'Enter' })
    fireEvent.click(sendButton)

    expect(props.onSend).not.toHaveBeenCalled()
  })

  it('locks attachment controls while native desktop attachments are loading', () => {
    const setImages = vi.fn()
    const setContextFiles = vi.fn()
    const onDrop = vi.fn()
    const onBrowseImages = vi.fn()
    const contextFiles = [{
      id: 'ctx-native-read',
      name: 'Native.ts',
      path: 'src/Native.ts',
      content: 'export const native = true',
    }]
    renderChatInput({
      input: 'review this folder',
      images: ['data:image/png;base64,native'],
      setImages,
      imagesRef: { current: ['data:image/png;base64,native'] },
      contextFiles,
      setContextFiles,
      contextFilesRef: { current: contextFiles },
      pendingAttachmentReads: 1,
      attachmentReadsBlockSend: true,
      onDrop,
      onBrowseImages,
    })

    expect(screen.getByRole('button', { name: 'Attach image unavailable while attachments are reading' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Attach file context unavailable while attachments are reading' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Attach folder context unavailable while attachments are reading' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear all attachments' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove image 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove file Native.ts' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Attach image unavailable while attachments are reading' })).toHaveAttribute('title', 'Reading selected attachments')

    fireEvent.click(screen.getByRole('button', { name: 'Attach image unavailable while attachments are reading' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear all attachments' }))
    fireEvent.drop(screen.getByTestId('chat-input-dropzone'), {
      dataTransfer: { files: [new File(['next'], 'next.ts', { type: 'text/typescript' })] },
    })

    expect(onBrowseImages).not.toHaveBeenCalled()
    expect(setImages).not.toHaveBeenCalled()
    expect(setContextFiles).not.toHaveBeenCalled()
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('blocks sends with a visible provider readiness reason', () => {
    const onSendDisabledAction = vi.fn()
    const props = renderChatInput({
      input: 'run tests',
      sendDisabledReason: 'Hermes Agent needs a project folder. Select or add a project before sending.',
      sendDisabledActionLabel: 'Add project folder',
      onSendDisabledAction,
    })

    const sendButton = screen.getByRole('button', {
      name: 'Send unavailable: Hermes Agent needs a project folder. Select or add a project before sending.',
    })
    expect(sendButton).toBeDisabled()
    expect(sendButton).toHaveAttribute('title', 'Hermes Agent needs a project folder. Select or add a project before sending.')
    const sendStatus = screen.getByRole('status', { name: 'Send unavailable' })
    expect(sendStatus).toHaveTextContent('Hermes Agent needs a project folder')
    expect(sendStatus).toHaveAttribute('data-chat-send-disabled-status')
    expect(screen.getByLabelText('Chat message')).toHaveAttribute(
      'placeholder',
      'Hermes Agent needs a project folder. Select or add a project before sending.',
    )

    fireEvent.keyDown(screen.getByLabelText('Chat message'), { key: 'Enter' })
    fireEvent.click(sendButton)
    fireEvent.click(screen.getByRole('button', { name: 'Add project folder' }))

    expect(props.onSend).not.toHaveBeenCalled()
    expect(onSendDisabledAction).toHaveBeenCalledTimes(1)
  })

  it('surfaces slash commands and inserts the selected command', () => {
    const setInput = vi.fn()
    renderChatInput({ input: '/c', setInput })

    const menu = screen.getByRole('listbox', { name: 'Slash commands' })
    expect(menu).toBeInTheDocument()
    expect(menu).toHaveStyle({
      maxHeight: '220px',
      overflowY: 'auto',
      opacity: '1',
      isolation: 'isolate',
      backdropFilter: 'none',
    })
    expect(menu.style.background).toContain('--bg-panel-solid')
    expect(menu.style.background).toContain('--bg-base')
    expect(screen.getByRole('option', { name: /\/clear/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('option', { name: /\/clear/i }))

    expect(setInput).toHaveBeenCalledWith('/clear')
    expect(sessionStorage.getItem('chat-draft')).toBe('/clear')
  })

  it('inserts slash commands even when draft storage rejects writes', () => {
    sessionStorage.setItem('chat-draft', 'stale command')
    const setInput = vi.fn()
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })

    try {
      renderChatInput({ input: '/c', setInput })
      fireEvent.click(screen.getByRole('option', { name: /\/clear/i }))
    } finally {
      setItemSpy.mockRestore()
    }

    expect(setInput).toHaveBeenCalledWith('/clear')
    expect(sessionStorage.getItem('chat-draft')).toBeNull()
  })

  it('does not show slash command suggestions after normal prose', () => {
    renderChatInput({ input: 'please run /clear later' })

    expect(screen.queryByRole('listbox', { name: 'Slash commands' })).not.toBeInTheDocument()
  })

  it('keeps typing responsive when debounced draft storage rejects writes', () => {
    vi.useFakeTimers()
    sessionStorage.setItem('chat-draft', 'stale typed draft')
    const setInput = vi.fn()
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })

    try {
      renderChatInput({ input: '', setInput })
      fireEvent.change(screen.getByLabelText('Chat message'), {
        target: { value: 'new typed draft' },
      })
      act(() => {
        vi.advanceTimersByTime(300)
      })
    } finally {
      setItemSpy.mockRestore()
      vi.useRealTimers()
    }

    expect(setInput).toHaveBeenCalledWith('new typed draft')
    expect(sessionStorage.getItem('chat-draft')).toBeNull()
  })

  it('navigates slash commands from the keyboard before inserting one', () => {
    const setInput = vi.fn()
    const onSend = vi.fn()
    renderChatInput({ input: '/', setInput, onSend })

    const textarea = screen.getByLabelText('Chat message')
    expect(screen.getByRole('option', { name: /\/new/i })).toHaveAttribute('aria-selected', 'true')
    expect(textarea).toHaveAttribute('aria-activedescendant', 'chat-slash-command-new')

    fireEvent.keyDown(textarea, { key: 'ArrowDown' })

    expect(screen.getByRole('option', { name: /\/reset/i })).toHaveAttribute('aria-selected', 'true')
    expect(textarea).toHaveAttribute('aria-activedescendant', 'chat-slash-command-reset')

    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(setInput).toHaveBeenCalledWith('/reset')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('dismisses slash command suggestions with Escape until the query changes', () => {
    const setInput = vi.fn()

    function SlashComposer() {
      const [value, setValue] = useState('/c')
      return (
        <ChatInput
          input={value}
          setInput={(next) => {
            setInput(next)
            setValue(next)
          }}
          images={[]}
          setImages={vi.fn()}
          imagesRef={{ current: [] }}
          contextFiles={[]}
          setContextFiles={vi.fn()}
          contextFilesRef={{ current: [] }}
          sending={false}
          onSend={vi.fn()}
          onStop={vi.fn()}
          onFileChange={vi.fn()}
          onContextFileChange={vi.fn()}
          onDrop={vi.fn()}
          draftTimerRef={{ current: null }}
          draftStorageKeys={LEGACY_CHAT_COMPOSER_DRAFT_STORAGE_KEYS}
        />
      )
    }

    render(<SlashComposer />)

    const textarea = screen.getByLabelText('Chat message')
    expect(screen.getByRole('listbox', { name: 'Slash commands' })).toBeInTheDocument()

    fireEvent.keyDown(textarea, { key: 'Escape' })

    expect(screen.queryByRole('listbox', { name: 'Slash commands' })).not.toBeInTheDocument()
    expect(setInput).not.toHaveBeenCalled()

    fireEvent.change(textarea, { target: { value: '/cl' } })

    expect(screen.getByRole('listbox', { name: 'Slash commands' })).toBeInTheDocument()
    expect(setInput).toHaveBeenCalledWith('/cl')
  })

  it('sends an exact slash command on Enter', () => {
    const setInput = vi.fn()
    const onSend = vi.fn()
    renderChatInput({ input: '/clear', setInput, onSend })

    fireEvent.keyDown(screen.getByLabelText('Chat message'), { key: 'Enter' })

    expect(onSend).toHaveBeenCalledTimes(1)
    expect(setInput).not.toHaveBeenCalled()
  })

  it('allows exact slash commands while provider sends are blocked', () => {
    const onSend = vi.fn()
    renderChatInput({
      input: '/clear',
      onSend,
      sendDisabledReason: 'Hermes Agent needs a project folder. Select or add a project before sending.',
    })

    const sendButton = screen.getByLabelText('Send message')
    expect(sendButton).not.toBeDisabled()
    expect(sendButton).toHaveAttribute('title', 'Send')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    fireEvent.keyDown(screen.getByLabelText('Chat message'), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('shows a stop control while a response is in flight', () => {
    const props = renderChatInput({ sending: true })

    expect(screen.queryByLabelText('Send message')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Stop response' }))

    expect(props.onStop).toHaveBeenCalledTimes(1)
  })

  it('stops an in-flight response with Escape outside menus and dialogs', () => {
    const onStop = vi.fn()
    renderChatInput({ sending: true, onStop })

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('does not steal Escape from active dialogs while a response is in flight', () => {
    const onStop = vi.fn()
    render(
      <>
        <ChatInput
          input="hello"
          setInput={vi.fn()}
          images={[]}
          setImages={vi.fn()}
          imagesRef={{ current: [] }}
          contextFiles={[]}
          setContextFiles={vi.fn()}
          contextFilesRef={{ current: [] }}
          sending
          onSend={vi.fn()}
          onStop={onStop}
          onFileChange={vi.fn()}
          onContextFileChange={vi.fn()}
          onDrop={vi.fn()}
          draftTimerRef={{ current: null }}
          draftStorageKeys={LEGACY_CHAT_COMPOSER_DRAFT_STORAGE_KEYS}
        />
        <div role="dialog" aria-label="Open dialog">
          <button type="button">Dialog action</button>
        </div>
      </>,
    )

    fireEvent.keyDown(screen.getByRole('button', { name: 'Dialog action' }), { key: 'Escape' })

    expect(onStop).not.toHaveBeenCalled()
  })

  it('exposes stable responsive hooks for the composer shell and stop state', () => {
    renderChatInput({ sending: true, contextBar: <div data-testid="context-bar" /> })

    expect(screen.getByTestId('chat-input-dropzone')).toHaveClass('chat-input-dropzone')
    expect(screen.getByTestId('chat-input-dropzone')).toHaveAttribute('data-chat-composer', 'true')
    expect(screen.getByLabelText('Chat message')).toHaveClass('chat-input-textarea')
    expect(screen.getByRole('button', { name: 'Stop response' })).toHaveClass('chat-input-stop')
    expect(screen.getByText('Stop')).toHaveClass('chat-input-stop-label')
    expect(screen.getByTestId('context-bar').parentElement).toHaveClass('chat-input-context')
  })

  it('accepts dropped files on the composer area', () => {
    const props = renderChatInput()
    const dropzone = screen.getByTestId('chat-input-dropzone')

    fireEvent.dragEnter(dropzone)
    expect(dropzone).toHaveAttribute('data-dragging', 'true')

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [new File(['png'], 'screen.png', { type: 'image/png' })],
        dropEffect: 'none',
      },
    })

    expect(props.onDrop).toHaveBeenCalledTimes(1)
    expect(dropzone).toHaveAttribute('data-dragging', 'false')
  })

  it('shows attachment count, names previews, and disables attach at the image limit', () => {
    const images = Array.from({ length: 10 }, (_, index) => `data:image/png;base64,${index}`)
    renderChatInput({ images })

    expect(screen.getByText('10/10 images attached')).toBeInTheDocument()
    expect(screen.getByAltText('Attached image 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove image 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Attach image unavailable, image limit reached' })).toBeDisabled()
  })

  it('shows file context chips and disables file attach at the context file limit', () => {
    const contextFiles = Array.from({ length: 8 }, (_, index) => ({
      id: `file-${index}`,
      name: `source-${index}.ts`,
      path: `src/source-${index}.ts`,
      content: 'export const value = true',
      truncated: index === 0,
    }))
    renderChatInput({ contextFiles })

    expect(screen.getByText('8/8 context files attached')).toBeInTheDocument()
    expect(screen.getByText('src/source-0.ts (trimmed)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy attached file source-0.ts' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove file source-0.ts' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Attach file context unavailable, file limit reached' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Attach folder context unavailable, file limit reached' })).toBeDisabled()
  })

  it('copies composer context file content from file chips', async () => {
    const contextFiles = [{
      id: 'file-1',
      name: 'source.ts',
      path: 'src/source.ts',
      content: 'export const value = true',
    }]
    renderChatInput({ contextFiles })

    fireEvent.click(screen.getByRole('button', { name: 'Copy attached file source.ts' }))

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith([
      'File: src/source.ts',
      '',
      'export const value = true',
    ].join('\n')))
    expect(await screen.findByRole('button', { name: 'Copied attached file source.ts' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Copied attached file source.ts.')
  })

  it('shows a visible retry status when composer context file copy fails', async () => {
    clipboardWriteText.mockRejectedValueOnce(new Error('clipboard denied'))
    const contextFiles = [{
      id: 'file-1',
      name: 'source.ts',
      path: 'src/source.ts',
      content: 'export const value = true',
    }]
    renderChatInput({ contextFiles })

    fireEvent.click(screen.getByRole('button', { name: 'Copy attached file source.ts' }))

    expect(await screen.findByRole('button', { name: 'Retry copy attached file source.ts' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Could not copy attached file source.ts.')
  })

  it('copies all composer context files as one review bundle', async () => {
    const contextFiles = [
      {
        id: 'file-1',
        name: 'source.ts',
        path: 'src/source.ts',
        content: 'export const value = true',
      },
      {
        id: 'file-2',
        name: 'README.md',
        path: 'README.md',
        content: '# Project',
      },
    ]
    renderChatInput({ contextFiles })

    fireEvent.click(screen.getByRole('button', { name: 'Copy all context files' }))

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith([
      'File: src/source.ts',
      '',
      'export const value = true',
      '',
      '---',
      '',
      'File: README.md',
      '',
      '# Project',
    ].join('\n')))
    expect(await screen.findByRole('button', { name: 'Copied all context files' })).toBeInTheDocument()
  })

  it('previews and copies composer context file content from file chips', async () => {
    const contextFiles = [{
      id: 'file-1',
      name: 'source.ts',
      path: 'src/source.ts',
      content: 'export const value = true',
    }]
    renderChatInput({ contextFiles })

    fireEvent.click(screen.getByRole('button', { name: 'Preview attached file source.ts' }))

    expect(screen.getByRole('region', { name: 'Attached file preview source.ts' })).toHaveTextContent('src/source.ts')
    expect(screen.getByRole('region', { name: 'Attached file preview source.ts' })).toHaveTextContent('export const value = true')
    expect(screen.getByRole('button', { name: 'Hide attached file source.ts' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Copy preview file source.ts' }))
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith([
      'File: src/source.ts',
      '',
      'export const value = true',
    ].join('\n')))
    expect(await screen.findByRole('button', { name: 'Copied preview file source.ts' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close attached file preview source.ts' }))

    expect(screen.queryByRole('region', { name: 'Attached file preview source.ts' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview attached file source.ts' })).toBeInTheDocument()
  })

  it('closes the composer file preview with Escape', () => {
    const contextFiles = [{
      id: 'file-1',
      name: 'source.ts',
      path: 'src/source.ts',
      content: 'export const value = true',
    }]
    renderChatInput({ contextFiles })

    fireEvent.click(screen.getByRole('button', { name: 'Preview attached file source.ts' }))
    expect(screen.getByRole('region', { name: 'Attached file preview source.ts' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('region', { name: 'Attached file preview source.ts' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview attached file source.ts' })).toBeInTheDocument()
  })

  it('closes the composer file preview when that file is removed', () => {
    const contextFiles = [{
      id: 'file-1',
      name: 'source.ts',
      path: 'src/source.ts',
      content: 'export const value = true',
    }]
    const contextFilesRef = { current: contextFiles }
    const setContextFiles = vi.fn((updater: React.SetStateAction<typeof contextFiles>) => {
      if (typeof updater === 'function') return updater(contextFiles)
      return updater
    })
    renderChatInput({ contextFiles, contextFilesRef, setContextFiles })

    fireEvent.click(screen.getByRole('button', { name: 'Preview attached file source.ts' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove file source.ts' }))

    expect(contextFilesRef.current).toEqual([])
    expect(screen.queryByRole('region', { name: 'Attached file preview source.ts' })).not.toBeInTheDocument()
  })

  it('clears all composer attachments and saved attachment drafts at once', () => {
    const images = ['data:image/png;base64,one']
    const contextFiles = [{
      id: 'file-1',
      name: 'source.ts',
      path: 'src/source.ts',
      content: 'export const value = true',
    }]
    const imagesRef = { current: images }
    const contextFilesRef = { current: contextFiles }
    const setImages = vi.fn()
    const setContextFiles = vi.fn()
    sessionStorage.setItem('chat-draft-images', JSON.stringify(images))
    sessionStorage.setItem(CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY, JSON.stringify(contextFiles))

    renderChatInput({ images, imagesRef, setImages, contextFiles, contextFilesRef, setContextFiles })

    fireEvent.click(screen.getByRole('button', { name: 'Preview attached file source.ts' }))
    expect(screen.getByRole('region', { name: 'Attached file preview source.ts' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear all attachments' }))

    expect(setImages).toHaveBeenCalledWith([])
    expect(imagesRef.current).toEqual([])
    expect(setContextFiles).toHaveBeenCalledWith([])
    expect(contextFilesRef.current).toEqual([])
    expect(sessionStorage.getItem('chat-draft-images')).toBeNull()
    expect(sessionStorage.getItem(CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY)).toBeNull()
    expect(screen.queryByRole('region', { name: 'Attached file preview source.ts' })).not.toBeInTheDocument()
  })

  it('exposes a folder context picker for directory uploads', () => {
    renderChatInput()

    expect(screen.getByRole('button', { name: 'Attach folder context' })).toBeInTheDocument()
    const directoryInput = document.querySelector('input[webkitdirectory]')
    expect(directoryInput).toBeInstanceOf(HTMLInputElement)
    expect(directoryInput).toHaveAttribute('directory')
    expect(directoryInput).toHaveAttribute('multiple')
  })

  it('uses native desktop context pickers when running inside Tauri', () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    const onBrowseContextFiles = vi.fn()
    const onBrowseContextFolder = vi.fn()
    const onBrowseImages = vi.fn()
    const onFileChange = vi.fn()
    const onContextFileChange = vi.fn()
    renderChatInput({ onBrowseImages, onBrowseContextFiles, onBrowseContextFolder, onFileChange, onContextFileChange })

    fireEvent.click(screen.getByRole('button', { name: 'Attach image' }))
    fireEvent.click(screen.getByRole('button', { name: 'Attach file context' }))
    fireEvent.click(screen.getByRole('button', { name: 'Attach folder context' }))

    expect(onBrowseImages).toHaveBeenCalledTimes(1)
    expect(onBrowseContextFiles).toHaveBeenCalledTimes(1)
    expect(onBrowseContextFolder).toHaveBeenCalledTimes(1)
    expect(onFileChange).not.toHaveBeenCalled()
    expect(onContextFileChange).not.toHaveBeenCalled()
  })

  it('removes deleted context files from the saved draft', () => {
    const contextFiles = [{
      id: 'file-1',
      name: 'source.ts',
      path: 'src/source.ts',
      content: 'export const value = true',
    }]
    const contextFilesRef = { current: contextFiles }
    const setContextFiles = vi.fn((updater: React.SetStateAction<typeof contextFiles>) => {
      if (typeof updater === 'function') return updater(contextFiles)
      return updater
    })
    sessionStorage.setItem(CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY, JSON.stringify(contextFiles))

    renderChatInput({ contextFiles, contextFilesRef, setContextFiles })

    fireEvent.click(screen.getByRole('button', { name: 'Remove file source.ts' }))

    expect(setContextFiles).toHaveBeenCalled()
    expect(contextFilesRef.current).toEqual([])
    expect(sessionStorage.getItem(CHAT_CONTEXT_FILE_DRAFT_STORAGE_KEY)).toBeNull()
  })
})
