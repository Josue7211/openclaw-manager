import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ChatInput from '../ChatInput'

vi.mock('@phosphor-icons/react', () => ({
  Image: (props: Record<string, unknown>) => <svg data-testid="icon-image" {...props} />,
  PaperPlaneTilt: (props: Record<string, unknown>) => <svg data-testid="icon-send" {...props} />,
  Square: (props: Record<string, unknown>) => <svg data-testid="icon-stop" {...props} />,
  X: (props: Record<string, unknown>) => <svg data-testid="icon-x" {...props} />,
}))

function renderChatInput(overrides: Partial<React.ComponentProps<typeof ChatInput>> = {}) {
  const props: React.ComponentProps<typeof ChatInput> = {
    input: 'hello',
    setInput: vi.fn(),
    images: [],
    setImages: vi.fn(),
    imagesRef: { current: [] },
    sending: false,
    onSend: vi.fn(),
    onStop: vi.fn(),
    onFileChange: vi.fn(),
    onDrop: vi.fn(),
    draftTimerRef: { current: null },
    ...overrides,
  }
  render(<ChatInput {...props} />)
  return props
}

describe('ChatInput', () => {
  it('renders T3-shaped provider choices without OpenClaw', () => {
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
          { id: 'hermes', name: 'Hermes', description: 'Codex LB', modelBacked: true, available: true },
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
    expect(picker).toHaveTextContent('Hermes')
    expect(picker).toHaveTextContent('GPT 5.5')

    fireEvent.click(picker)
    expect(screen.getByRole('dialog', { name: 'Provider and model picker' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hermes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Claude Code' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Codex CLI' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /openclaw/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Claude Code' }))
    expect(setProvider).toHaveBeenCalledWith('claudeAgent')
  })

  it('shows direct local providers without model selection', () => {
    render(
      <ChatInput.Header
        model="gpt-5.5"
        setModel={vi.fn()}
        models={[{ id: 'gpt-5.5', name: 'GPT 5.5' }]}
        provider="claudeAgent"
        setProvider={vi.fn()}
        providers={[
          { id: 'hermes', name: 'Hermes', description: 'Codex LB', modelBacked: true, available: true },
          { id: 'claudeAgent', name: 'Claude Code', description: 'Local Claude Code CLI', modelBacked: false, available: true },
        ]}
        connected
        wsConnected
        historyIsError={false}
        isDemo={false}
      />,
    )

    expect(screen.queryByLabelText('Select model')).not.toBeInTheDocument()
    const picker = screen.getByRole('button', { name: 'Select provider and model' })
    expect(picker).toHaveTextContent('Claude Code')
    expect(picker).not.toHaveTextContent('GPT 5.5')

    fireEvent.click(picker)
    expect(screen.getByText('Direct local provider')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Use Claude Code/i })).toBeInTheDocument()
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
          { id: 'hermes', name: 'Hermes', description: 'Codex LB', modelBacked: true, available: true },
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

  it('sends on Enter without Shift', () => {
    const props = renderChatInput()

    fireEvent.keyDown(screen.getByLabelText('Chat message'), { key: 'Enter' })

    expect(props.onSend).toHaveBeenCalledTimes(1)
  })

  it('keeps newline behavior on Shift+Enter', () => {
    const props = renderChatInput()

    fireEvent.keyDown(screen.getByLabelText('Chat message'), { key: 'Enter', shiftKey: true })

    expect(props.onSend).not.toHaveBeenCalled()
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

  it('shows a stop control while a response is in flight', () => {
    const props = renderChatInput({ sending: true })

    expect(screen.queryByLabelText('Send message')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Stop response' }))

    expect(props.onStop).toHaveBeenCalledTimes(1)
  })

  it('exposes stable responsive hooks for the composer shell and stop state', () => {
    renderChatInput({ sending: true, contextBar: <div data-testid="context-bar" /> })

    expect(screen.getByTestId('chat-input-dropzone')).toHaveClass('chat-input-dropzone')
    expect(screen.getByLabelText('Chat message')).toHaveClass('chat-input-textarea')
    expect(screen.getByRole('button', { name: 'Stop response' })).toHaveClass('chat-input-stop')
    expect(screen.getByText('Stop')).toHaveClass('chat-input-stop-label')
    expect(screen.getByTestId('context-bar').parentElement).toHaveClass('chat-input-context')
  })

  it('accepts dropped files on the composer area', () => {
    const props = renderChatInput()

    fireEvent.drop(screen.getByTestId('chat-input-dropzone'), {
      dataTransfer: {
        files: [new File(['png'], 'screen.png', { type: 'image/png' })],
        dropEffect: 'none',
      },
    })

    expect(props.onDrop).toHaveBeenCalledTimes(1)
  })

  it('shows attachment count, names previews, and disables attach at the image limit', () => {
    const images = Array.from({ length: 10 }, (_, index) => `data:image/png;base64,${index}`)
    renderChatInput({ images })

    expect(screen.getByText('10/10 images attached')).toBeInTheDocument()
    expect(screen.getByAltText('Attached image 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove image 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Attach image unavailable, image limit reached' })).toBeDisabled()
  })
})
