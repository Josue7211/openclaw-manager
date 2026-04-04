# Testing Patterns

**Analysis Date:** 2026-03-19

## Test Framework

**Runner:**
- Vitest 4.1.0
- Config: `frontend/vitest.config.ts`
- Environment: jsdom (DOM simulation)
- Globals: true (no import of describe/it/expect)

**Assertion Library:**
- Vitest built-in expect
- Testing Library: @testing-library/react, @testing-library/user-event
- @testing-library/jest-dom (for extended matchers like `toBeInTheDocument()`)

**Run Commands:**
```bash
cd frontend && npm test                 # Run all tests once
cd frontend && npm run test:watch       # Watch mode
cd frontend && npm run test:e2e         # End-to-end tests (Playwright)
cd frontend && npm run test:e2e:headed  # E2E tests with browser visible
```

**Coverage:**
- Provider: v8
- Reports: text, text-summary, json-summary
- Directory: `frontend/coverage/`
- Include: `src/**/*.{ts,tsx}`
- Exclude: test files, test-setup.ts, vite-env.d.ts

## Test File Organization

**Location:**
- **Co-located pattern**: tests live in `__tests__/` subdirectory next to source
- **Examples:**
  - Source: `frontend/src/lib/api.ts` → Test: `frontend/src/lib/__tests__/api.test.ts`
  - Source: `frontend/src/components/SecondsAgo.tsx` → Test: `frontend/src/components/__tests__/SecondsAgo.test.tsx`
  - Source: `frontend/src/pages/messages/utils.ts` → Test: `frontend/src/pages/messages/__tests__/utils.test.ts`

**Naming:**
- Test file: `{name}.test.ts` or `{name}.test.tsx`
- Test suite: one file per module/component
- Suite name: matches the thing being tested

**Directory Structure:**
```
frontend/src/
├── lib/
│   ├── api.ts
│   ├── keybindings.ts
│   ├── __tests__/
│   │   ├── api.test.ts
│   │   ├── keybindings.test.ts
│   │   ├── utils.test.ts
│   │   └── ...
│   └── ...
├── components/
│   ├── ContactAvatar.tsx
│   ├── Lightbox.tsx
│   ├── __tests__/
│   │   ├── ContactAvatar.test.tsx
│   │   ├── SecondsAgo.test.tsx
│   │   └── ...
│   └── ...
└── pages/
    └── messages/
        ├── utils.ts
        ├── MessageThread.tsx
        └── __tests__/
            ├── utils.test.ts
            └── ...
```

## Test Structure

**Suite Organization:**
Tests use `describe()` blocks for grouping, `it()` for individual test cases.

**Basic Pattern:**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-13T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "Never" for null input', () => {
    expect(timeAgo(null)).toBe('Never')
  })

  it('returns seconds ago for recent timestamps', () => {
    const thirtySecondsAgo = new Date('2026-03-13T11:59:30Z').toISOString()
    expect(timeAgo(thirtySecondsAgo)).toBe('30s ago')
  })
})
```

**React Component Pattern:**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { createElement } from 'react'

describe('SecondsAgo rendering', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
  })

  it('renders "0s ago" when sinceMs is now', () => {
    const now = Date.now()
    render(createElement(SecondsAgo, { sinceMs: now }))
    expect(screen.getByText('0s ago')).toBeTruthy()
  })

  it('updates display after the shared interval ticks', () => {
    const now = Date.now()
    render(createElement(SecondsAgo, { sinceMs: now }))
    expect(screen.getByText('0s ago')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText('3s ago')).toBeTruthy()
  })
})
```

**Setup:**
- File: `frontend/src/test-setup.ts`
- Imports: `@testing-library/jest-dom` (adds extended matchers)
- Referenced in vitest.config.ts via `setupFiles`

## Mocking

**Framework:** Vitest `vi` module

**Mock Patterns:**

**Module Mocks (spy on imports):**
```typescript
import { vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(async () => ({ data: [] })),
    post: vi.fn(),
  },
}))
```

**Function Mocks:**
```typescript
const mockFn = vi.fn()
mockFn.mockReturnValue('result')
mockFn.mockResolvedValue(data)
mockFn.mockRejectedValue(error)
expect(mockFn).toHaveBeenCalled()
expect(mockFn).toHaveBeenCalledWith(arg)
```

**Timer Mocks (for time-dependent code):**
```typescript
vi.useFakeTimers()
vi.setSystemTime(new Date('2026-03-13T12:00:00Z'))

// Advance time in test
act(() => {
  vi.advanceTimersByTime(3000)
})

vi.useRealTimers() // in afterEach
```

**Module Re-imports (for dynamic imports with mocks):**
```typescript
beforeEach(() => {
  vi.resetModules()
})

async function importSecondsAgo() {
  const mod = await import('../SecondsAgo')
  return mod.default
}

it('test', async () => {
  const SecondsAgo = await importSecondsAgo()
  // Use mocked version
})
```

**What to Mock:**
- External API calls (use `api.get()`, `api.post()`)
- Time-dependent logic (use `vi.useFakeTimers()`)
- Browser APIs (localStorage, window, fetch) when testing logic independent of actual DOM
- Third-party libraries with side effects

**What NOT to Mock:**
- React components under test
- HTML rendering (test what users see)
- Event handlers (test user interactions)
- localStorage directly (test via hooks like `useLocalStorageState`)

## Fixtures and Factories

**Test Data:**
No centralized fixture factory; tests create data inline as needed.

**Examples from tests:**
```typescript
// Simple inline data
const cache = new LRUCache<string, number>(3)
cache.set('a', 1)
cache.set('b', 2)

// Objects
const conversation = {
  guid: 'test-guid',
  chatId: 'test-chat',
  displayName: 'Test Chat',
  participants: [{ address: 'test@example.com', service: 'imessage' }],
}

// Async data
const result = await api.get<ResponseType>('/api/endpoint')
expect(result).toEqual(expectedData)
```

**Location:**
- Fixtures are inline within test files
- Share data between tests via `beforeEach` setup:
  ```typescript
  let cache: LRUCache<string, number>
  beforeEach(() => {
    cache = new LRUCache(3)
  })
  ```

## Coverage

**Requirements:** No hard enforcement; coverage is tracked via CI

**View Coverage:**
```bash
cd frontend && npm test                    # Generates coverage/ directory
cat frontend/coverage/text-summary.txt     # View coverage summary
```

**Typical Coverage:**
- Frontend: 1039 tests across 53 test files
- Rust backend: 231 tests
- E2E: 21 end-to-end tests (via Playwright)

## Test Types

**Unit Tests:**
- **Scope:** Single function or component in isolation
- **Approach:** Direct calls, no React rendering (for utilities)
- **Examples:**
  - `lib/__tests__/utils.test.ts` — utility functions
  - `lib/__tests__/keybindings.test.ts` — keybinding state management
  - `pages/messages/__tests__/utils.test.ts` — message formatting

**Component Tests:**
- **Scope:** React components with their event handlers and state
- **Approach:** Render with `@testing-library/react`, query with semantic selectors
- **Examples:**
  - `components/__tests__/SecondsAgo.test.tsx` — live-updating timer
  - `components/__tests__/PageErrorBoundary.test.tsx` — error UI
  - `pages/settings/__tests__/Toggle.test.tsx` — toggle control

**Integration Tests:**
- **Scope:** Multiple components or modules working together
- **Approach:** Render full page/feature, test user workflows
- **Examples:**
  - `pages/messages/__tests__/utils.test.ts` — message search + filtering
  - `pages/pipeline/__tests__/utils.test.ts` — pipeline event processing

**E2E Tests:**
- **Framework:** Playwright via `scripts/e2e.sh`
- **Scope:** Full app user journeys (login, navigate, interact)
- **21 tests:** covering critical user paths
- **Run:** `npm run test:e2e` or `npm run test:e2e:headed`

## Common Patterns

**Async Testing:**

Using `async/await` with Vitest:
```typescript
it('fetches data asynchronously', async () => {
  const result = await api.get('/api/todos')
  expect(result).toEqual(expectedData)
})
```

Using `act()` for state updates:
```typescript
it('updates state after fetch', () => {
  const { rerender } = render(<Component />)

  act(() => {
    vi.advanceTimersByTime(1000)
  })

  expect(screen.getByText('updated')).toBeTruthy()
})
```

**Error Testing:**

Test error handling:
```typescript
it('throws ApiError on network failure', async () => {
  vi.mock('@/lib/api', () => ({
    api: {
      get: vi.fn(async () => {
        throw new ApiError(500, 'Internal Server Error')
      }),
    },
  }))

  await expect(api.get('/api/endpoint')).rejects.toThrow(ApiError)
})
```

Test error boundaries:
```typescript
it('catches and displays errors', () => {
  const Broken = () => {
    throw new Error('Render error')
  }

  render(
    <PageErrorBoundary>
      <Broken />
    </PageErrorBoundary>,
  )

  expect(screen.getByRole('alert')).toBeTruthy()
  expect(screen.getByText('This page crashed')).toBeTruthy()
})
```

**LRU Cache Test Pattern:**

Testing eviction and promotion:
```typescript
it('evicts the least recently used entry', () => {
  const cache = new LRUCache<string, number>(3)
  cache.set('a', 1)
  cache.set('b', 2)
  cache.set('c', 3)
  cache.set('d', 4)  // Evicts 'a'

  expect(cache.has('a')).toBe(false)
  expect(cache.has('d')).toBe(true)
})

it('promotes entries on access', () => {
  const cache = new LRUCache<string, number>(3)
  cache.set('a', 1)
  cache.set('b', 2)
  cache.set('c', 3)

  cache.get('a')  // Promote 'a' to most-recently-used
  cache.set('d', 4)  // Now 'b' is evicted, not 'a'

  expect(cache.has('a')).toBe(true)
  expect(cache.has('b')).toBe(false)
})
```

**Module State Test Pattern:**

Testing reactive state with subscribers:
```typescript
it('notifies subscribers when state changes', () => {
  const listener = vi.fn()
  const unsubscribe = subscribeToState(listener)

  updateState('new value')

  expect(listener).toHaveBeenCalled()

  unsubscribe()
  updateState('another value')

  // Not called again after unsubscribe
  expect(listener).toHaveBeenCalledOnce()
})
```

**Shared Interval Test Pattern (SecondsAgo):**

Testing components that share a module-level timer:
```typescript
it('multiple instances share one interval', async () => {
  const SecondsAgo = await importSecondsAgo()
  const now = Date.now()

  const { unmount: unmount1 } = render(
    createElement(SecondsAgo, { sinceMs: now }),
  )
  const { unmount: unmount2 } = render(
    createElement(SecondsAgo, { sinceMs: now - 10_000 }),
  )

  expect(screen.getByText('0s ago')).toBeTruthy()
  expect(screen.getByText('10s ago')).toBeTruthy()

  // One tick updates both
  act(() => {
    vi.advanceTimersByTime(1000)
  })

  expect(screen.getByText('1s ago')).toBeTruthy()
  expect(screen.getByText('11s ago')).toBeTruthy()

  unmount1()
  unmount2()
})
```

## Rust Testing

**Test Framework:** Cargo test (built-in)

**Run Commands:**
```bash
cd src-tauri && cargo test                 # Run all Rust tests
cd src-tauri && cargo test -- --nocapture # Show println! output
cd src-tauri && cargo clippy               # Lint
cd src-tauri && cargo fmt --check          # Format check
```

**Test Structure:**
```rust
#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn success_json_wraps_data() {
    let result = success_json(json!({ "items": [1, 2, 3] }));
    let value = result.0;
    assert_eq!(value["ok"], true);
    assert_eq!(value["data"]["items"], json!([1, 2, 3]));
  }
}
```

**231 total tests** covering:
- Utility functions (`percent_encode`, `random_uuid`, `base64_decode`)
- Error handling (`AppError` responses)
- Route handlers (auth, messages, missions)
- Database operations (SQLx migrations)

---

*Testing analysis: 2026-03-19*
