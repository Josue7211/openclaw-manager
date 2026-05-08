import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ButtonHTMLAttributes } from 'react'

vi.mock('@phosphor-icons/react', () => ({
  Desktop: () => <svg data-testid="icon-desktop" />,
}))

vi.mock('@/hooks/useTauriQuery', () => ({
  useTauriQuery: () => ({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    dataUpdatedAt: 0,
  }),
}))

vi.mock('@/components/PageHeader', () => ({
  PageHeader: ({ defaultTitle }: { defaultTitle: string }) => <h1>{defaultTitle}</h1>,
}))

vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: () => <div data-testid="empty-state" />,
}))

vi.mock('@/components/ui/ErrorState', () => ({
  ErrorState: () => <div data-testid="error-state" />,
}))

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(async () => null),
    put: vi.fn(async () => ({ data: null })),
    post: vi.fn(async () => null),
  },
}))

const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')

afterEach(() => {
  if (localStorageDescriptor) {
    Object.defineProperty(window, 'localStorage', localStorageDescriptor)
  }
})

describe('HomeLab import safety', () => {
  it('renders when localStorage is unavailable', async () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('localStorage unavailable')
      },
    })

    const mod = await import('../../HomeLab')
    const HomeLab = mod.default

    expect(() => render(<HomeLab />)).not.toThrow()
  })
})
