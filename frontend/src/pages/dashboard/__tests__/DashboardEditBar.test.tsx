import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { DashboardEditBar, useLongPress } from '@/components/dashboard/DashboardEditBar'

/* ── Mock dashboard-store ──────────────────────────────────────────────── */

const mockSetEditMode = vi.fn()
const mockUndoDashboard = vi.fn()

vi.mock('@/lib/dashboard-store', () => ({
  setEditMode: (...args: unknown[]) => mockSetEditMode(...args),
  undoDashboard: (...args: unknown[]) => mockUndoDashboard(...args),
}))

/* ── Helpers ───────────────────────────────────────────────────────────── */

function renderBar(editMode: boolean, onOpenPicker = vi.fn()) {
  return render(
    <DashboardEditBar editMode={editMode} onOpenPicker={onOpenPicker} />,
  )
}

/* ── DashboardEditBar ──────────────────────────────────────────────────── */

describe('DashboardEditBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /* -- View mode (editMode=false) -- */

  it('renders pencil icon button when editMode is false', () => {
    renderBar(false)
    expect(screen.getByLabelText('Edit dashboard')).toBeInTheDocument()
  })

  it('clicking pencil button calls setEditMode(true)', () => {
    renderBar(false)
    fireEvent.click(screen.getByLabelText('Edit dashboard'))
    expect(mockSetEditMode).toHaveBeenCalledWith(true)
  })

  it('edit button has aria-label "Edit dashboard"', () => {
    renderBar(false)
    const btn = screen.getByLabelText('Edit dashboard')
    expect(btn.tagName).toBe('BUTTON')
  })

  it('"Add Widget" button is NOT visible in view mode', () => {
    renderBar(false)
    expect(screen.queryByLabelText('Add widget')).not.toBeInTheDocument()
  })

  it('Undo button is NOT visible in view mode', () => {
    renderBar(false)
    expect(screen.queryByLabelText('Undo last action')).not.toBeInTheDocument()
  })

  /* -- Edit mode (editMode=true) -- */

  it('renders "Done" button when editMode is true', () => {
    renderBar(true)
    expect(screen.getByLabelText('Save dashboard')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('clicking Done button calls setEditMode(false)', () => {
    renderBar(true)
    fireEvent.click(screen.getByLabelText('Save dashboard'))
    expect(mockSetEditMode).toHaveBeenCalledWith(false)
  })

  it('Done button has aria-label "Save dashboard"', () => {
    renderBar(true)
    const btn = screen.getByLabelText('Save dashboard')
    expect(btn.tagName).toBe('BUTTON')
  })

  it('"Add Widget" button visible only in edit mode', () => {
    renderBar(true)
    expect(screen.getByLabelText('Add widget')).toBeInTheDocument()
  })

  it('"Add Widget" button calls onOpenPicker callback', () => {
    const onOpenPicker = vi.fn()
    renderBar(true, onOpenPicker)
    fireEvent.click(screen.getByLabelText('Add widget'))
    expect(onOpenPicker).toHaveBeenCalledOnce()
  })

  it('Undo button visible only in edit mode', () => {
    renderBar(true)
    expect(screen.getByLabelText('Undo last action')).toBeInTheDocument()
  })

  it('Undo button calls undoDashboard()', () => {
    renderBar(true)
    fireEvent.click(screen.getByLabelText('Undo last action'))
    expect(mockUndoDashboard).toHaveBeenCalledOnce()
  })

  /* -- Keyboard shortcuts -- */

  it('Ctrl+E toggles edit mode to true when editMode is false', () => {
    renderBar(false)
    fireEvent.keyDown(document, { key: 'e', ctrlKey: true })
    expect(mockSetEditMode).toHaveBeenCalledWith(true)
  })

  it('Ctrl+E toggles edit mode to false when editMode is true', () => {
    renderBar(true)
    fireEvent.keyDown(document, { key: 'e', ctrlKey: true })
    expect(mockSetEditMode).toHaveBeenCalledWith(false)
  })

  it('Meta+E toggles edit mode (macOS)', () => {
    renderBar(false)
    fireEvent.keyDown(document, { key: 'e', metaKey: true })
    expect(mockSetEditMode).toHaveBeenCalledWith(true)
  })

  it('Ctrl+E does NOT toggle edit mode when component is unmounted', () => {
    const { unmount } = renderBar(false)
    unmount()
    mockSetEditMode.mockClear()
    fireEvent.keyDown(document, { key: 'e', ctrlKey: true })
    expect(mockSetEditMode).not.toHaveBeenCalled()
  })

  it('Escape exits edit mode when editMode is true', () => {
    renderBar(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockSetEditMode).toHaveBeenCalledWith(false)
  })

  it('Escape does nothing when editMode is false', () => {
    renderBar(false)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockSetEditMode).not.toHaveBeenCalled()
  })
})

/* ── useLongPress ──────────────────────────────────────────────────────── */

describe('useLongPress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns onPointerDown/onPointerUp/onPointerCancel/onPointerMove handlers', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress))
    expect(result.current.onPointerDown).toBeTypeOf('function')
    expect(result.current.onPointerUp).toBeTypeOf('function')
    expect(result.current.onPointerCancel).toBeTypeOf('function')
    expect(result.current.onPointerMove).toBeTypeOf('function')
  })

  it('long-press for 500ms calls onLongPress callback', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress))

    act(() => {
      result.current.onPointerDown()
    })
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(onLongPress).toHaveBeenCalledOnce()
  })

  it('short press (< 500ms) does not call onLongPress', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress))

    act(() => {
      result.current.onPointerDown()
    })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    act(() => {
      result.current.onPointerUp()
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('moving pointer during hold cancels long-press', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress))

    act(() => {
      result.current.onPointerDown()
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    act(() => {
      result.current.onPointerMove()
    })
    act(() => {
      vi.advanceTimersByTime(400)
    })

    expect(onLongPress).not.toHaveBeenCalled()
  })
})
