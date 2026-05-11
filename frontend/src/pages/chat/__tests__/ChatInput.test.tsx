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
    draftTimerRef: { current: null },
    ...overrides,
  }
  render(<ChatInput {...props} />)
  return props
}

describe('ChatInput', () => {
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

  it('sends from the send button', () => {
    const props = renderChatInput()

    fireEvent.click(screen.getByLabelText('Send message'))

    expect(props.onSend).toHaveBeenCalledTimes(1)
  })
})
