# Coding Conventions

**Analysis Date:** 2026-03-19

## Naming Patterns

**Files:**
- React components: PascalCase (e.g., `ContactAvatar.tsx`, `Lightbox.tsx`)
- Utilities/libraries: camelCase (e.g., `keybindings.ts`, `sidebar-settings.ts`, `error-reporter.ts`)
- Test files: `{name}.test.ts` or `{name}.test.tsx` (e.g., `utils.test.ts`, `SecondsAgo.test.tsx`)
- Test directories: `__tests__/` co-located with source code (e.g., `src/lib/__tests__/`, `src/components/__tests__/`)
- Page routes: camelCase directories with PascalCase components (e.g., `pages/messages/MessageThread.tsx`)

**Functions:**
- camelCase for all functions (exported and internal)
- Descriptive verb-first names: `timeAgo()`, `hashColor()`, `formatContactLabel()`, `reportError()`, `sanitizePostgrestValue()`
- Private functions use underscore prefix when module-scoped: `_apiKey`, `_bindings`, `_listeners`
- Getter functions: `get` prefix (e.g., `getKeybindings()`, `getModifierKey()`, `getBatchVersion()`)
- Handler/callback functions: `handle` or `on` prefix (e.g., `handleClose()`, `onload()`, `onMouseEnter()`)
- Predicates: `is` or `has` prefix (e.g., `isIMessage()`, `isGroupChat()`, `hasExplicitSms()`, `hasSavedName()`)

**Variables:**
- camelCase for all variables
- Constants: UPPER_SNAKE_CASE (e.g., `AVATAR_COLORS`, `STORAGE_KEY`, `MOD_KEY_STORAGE`)
- Module-level state prefixed with underscore: `_apiKey`, `_defaultMod`, `_bindings`, `_listeners`
- Event/listener names: `batchListeners`, `listeners`, `unsubscribe` (return value of listener registration)
- Type-qualified variables: use descriptors (e.g., `batchCheckPromise: Promise<void> | null`, `loupeRef: useRef<...>`)

**Types:**
- PascalCase for all types and interfaces (e.g., `Keybinding`, `ApiError`, `Conversation`, `Message`)
- Generic type parameters: single letters or PascalCase (e.g., `<T>`, `<K, V>`, `LRUCache<K, V>`)
- Union/discriminated types: use `| null` or `| undefined` rather than `?` for clarity in complex structures
- Interface vs Type: Prefer `interface` for object shapes, `type` for unions and aliases

**Rust Backend:**
- Functions: snake_case (e.g., `percent_encode()`, `random_uuid()`, `require_str()`)
- Types/Structs: PascalCase (e.g., `AppError`, `Conversation`)
- Enum variants: PascalCase (e.g., `AppError::NotFound`, `AppError::Unauthorized`)
- Module names: snake_case (e.g., `routes/messages.rs`, `routes/auth.rs`)
- Constants: UPPER_SNAKE_CASE (e.g., `AVATAR_COLORS`)

## Code Style

**Formatting:**
- Tool: Prettier
- Config: `.prettierrc`
- Settings:
  - `semi: false` — no semicolons
  - `singleQuote: true` — single quotes for strings
  - `trailingComma: 'all'` — trailing commas in multi-line structures
  - `printWidth: 120` — wrap at 120 characters
  - `tabWidth: 2` — 2 spaces per indent
  - `arrowParens: 'avoid'` — omit parens on single-arg arrows (e.g., `x => x * 2`)

**Linting:**
- Tool: ESLint (flat config)
- Config: `frontend/eslint.config.js`
- Extends: `@eslint/js`, `typescript-eslint`, `react-hooks`, `react-refresh`
- Rules enforced:
  - TypeScript strict checks (via `tseslint.configs.recommended`)
  - React Hooks rules (via `reactHooks.configs.flat.recommended`)
  - React Refresh safe component exports (via `reactRefresh.configs.vite`)

**TypeScript:**
- Target: ESNext
- Module: ESNext
- JSX: react-jsx (automatic runtime)
- Path aliases: `@/*` → `./src/*`
- Strict mode: enabled (via tsconfig.app.json)

**Rust:**
- Edition: 2021
- Linting: cargo clippy (part of test suite)
- Formatting: cargo fmt (part of pre-commit hook)

## Import Organization

**JavaScript/TypeScript Order:**
1. React and React libraries (e.g., `import { useEffect, useState }`)
2. Third-party libraries (e.g., `import { lucide-react }`, `@tanstack/react-query`)
3. Type definitions and utilities (e.g., `import { type Message } from './types'`)
4. Internal absolute imports using `@/` alias (e.g., `import { api } from '@/lib/api'`)
5. Relative imports (e.g., `import { ContactAvatar } from '../messages/ContactAvatar'`)
6. Styles (e.g., `import './styles.css'`)

**Example from `MessageThread.tsx`:**
```typescript
import { useRef } from 'react'
import { Send, ArrowLeft, AlertCircle, Mic } from 'lucide-react'

import { API_BASE } from '@/lib/api'
import { formatContactLabel } from '@/lib/utils'
import LinkPreviewCard from '@/components/messages/LinkPreviewCard'
import AudioWaveform from '@/components/messages/AudioWaveform'

import type { Conversation, Message } from './types'
import { formatTime, isIMessage } from './utils'
```

**Path Aliases:**
- `@/` always refers to `frontend/src/`
- Never use relative paths like `../../../lib` — use `@/lib/...` instead
- Barrel files (`index.ts`) are not used; import directly from source files

## Error Handling

**JavaScript/TypeScript:**

**Custom Error Classes:**
Use named classes extending `Error` with public properties:
```typescript
export class ApiError extends Error {
  public service: ServiceName
  public serviceLabel: string
  public status: number
  public body: unknown

  constructor(public status: number, public body: unknown, path?: string) {
    super(label)
    this.name = 'ApiError'
  }
}
```

**Error Reporting:**
- Optional opt-in error reporting (disabled by default)
- Use `reportError(error, context)` from `@/lib/error-reporter`
- Redact sensitive data: never log URLs with credentials, API keys, contact names
- Use redaction utility `redact()` for any credential/URL logging

**Try-Catch Patterns:**
```typescript
try {
  const data = await operation()
  return data
} catch (err) {
  if (err instanceof SpecificError) {
    // Handle known error
  }
  const apiErr = new ApiError(0, err instanceof Error ? err.message : 'Unknown')
  reportError(apiErr, 'context-label')
  throw apiErr
}
```

**Error Boundaries:**
React components have an error boundary `PageErrorBoundary` that catches render errors, logs them, and shows a recovery UI. Import and wrap pages:
```typescript
<PageErrorBoundary>
  <YourPage />
</PageErrorBoundary>
```

**Rust:**
Use `AppError` enum for all endpoint responses:
```rust
pub enum AppError {
  NotFound(String),
  Unauthorized,
  Forbidden(String),
  BadRequest(String),
  Internal(anyhow::Error),
}
```

Implement `IntoResponse` to convert to standard JSON envelope:
```json
{ "ok": false, "error": "message", "code": "error_code" }
```

Use `?` operator with `From` trait implementations for error propagation.

## Logging

**Frontend:**
- Use `console.log()`, `console.error()`, `console.warn()` — no custom logging framework
- Optional error reporting via `reportError()` when enabled
- Always redact credentials and sensitive URLs before logging
- Image routes skip automatic logging (add explicit `tracing::info!` if needed)

**Rust Backend:**
- Structured logging via `tracing` crate
- Setup in `src/main.rs`: stdout + rotating daily log file
- Log level: `RUST_LOG=mission_control=info` (default)
- Log files: `{data_local_dir}/mission-control/logs/`
- Rotation: daily, with cleanup of files >7 days old
- Never log credentials: use `redact()` from `redact.rs` for URLs/keys

## Comments

**When to Comment:**
- Complex algorithms or non-obvious logic
- Security-sensitive code (e.g., crypto, validation)
- Workarounds or hacks (with issue links)
- Public API functions (via JSDoc/TSDoc)
- Disambiguate design intent when code alone doesn't explain "why"

**JSDoc/TSDoc:**
Use for public exports and exported types:
```typescript
/**
 * Fetch wrapper with 30s timeout, API key auth, and offline mutation queuing.
 * All methods throw `ApiError` on failure; mutations are queued when offline.
 */
export const api = { ... }

/**
 * Error thrown by the `api` fetch wrapper for HTTP failures and network errors.
 * Carries the upstream service name and a user-facing label for display in UI.
 */
export class ApiError extends Error { ... }
```

**Section Comments:**
Use `/* ─── Section Name ─────────────────────── */` to group related code:
```typescript
/* ─── Types used locally ─────────────────────────────────────────────── */

interface Participant { ... }
interface Conversation { ... }

/* ─── ContactAvatar ─────────────────────────────────────────────────────── */

export const ContactAvatar = memo(function ContactAvatar(...) { ... })
```

**Avoid:**
- Obvious comments (e.g., `// increment counter` above `count++`)
- Commented-out code (delete it or document why it's kept)
- Vague TODOs (include GitHub issue link: `// TODO: #123`)

## Function Design

**Size:**
- Functions should be 20-40 lines on average
- Exceed 100 lines only for complex data transformations or hooks
- Extract to sub-functions if logic has multiple clear stages

**Parameters:**
- Prefer 1-3 parameters per function
- Use object destructuring for >3 related parameters:
  ```typescript
  function Avatar({ address, name, isImsg, size = 40 }: {
    address: string
    name?: string | null
    isImsg?: boolean
    size?: number
  })
  ```
- Default parameters for optional values

**Return Values:**
- Always declare return type explicitly (except React components)
- Return early to reduce nesting
- Use `null` for "no result", `undefined` for "not provided"
- For multiple return values, use object shorthand:
  ```typescript
  return { offset, limit, hasMore }
  ```

**React Components:**
- Components must be PascalCase and exported
- Use `function` declaration over arrow function for readability
- Export named, not default (improves IDE support)
- Wrap frequently-rendered components in `React.memo()` to prevent unnecessary re-renders

```typescript
export const ContactAvatar = memo(function ContactAvatar({ address, size = 40 }: Props) {
  // Component body
})
```

## Module Design

**Exports:**
- Export named items, not default (unless wrapper/page)
- Export types alongside implementations
- One responsibility per file (SRP)

**Example from `lib/keybindings.ts`:**
```typescript
export type ModifierKey = string
export interface Keybinding { ... }
export function getKeybindings(): Keybinding[] { ... }
export function updateKeybinding(id: string, update: {...}): void { ... }
```

**Barrel Files:**
- Not used in this codebase
- Import directly from source files (e.g., `@/lib/api` not `@/lib/`)

**Module-Level State:**
Use closure + subscriber pattern for reactive module state (via `useSyncExternalStore`):
```typescript
let _bindings: Keybinding[] = load()
const _listeners = new Set<() => void>()

function notifyListeners() {
  _listeners.forEach(fn => fn())
}

export function useKeybindings(): Keybinding[] {
  return useSyncExternalStore(subscribe, getKeybindings, getKeybindings)
}
```

## React Patterns

**State Management:**
- **Server state**: React Query (`useQuery`, `useMutation`) with keys from `queryKeys.ts`
- **URL state**: React Router (`useNavigate`, `useLocation`)
- **Local persistence**: `useLocalStorageState` hook from `lib/hooks/`
- **Cross-component reactive state**: `useSyncExternalStore` (see `keybindings.ts`, `sidebar-settings.ts`)
- **DO NOT**: custom DOM events (`window.dispatchEvent`) or reading localStorage directly in handlers

**Hooks:**
Always define custom hooks as standalone functions at module level, never inside components:
```typescript
export function useCustomHook() {
  // Implementation
}

function MyComponent() {
  const result = useCustomHook()
  // Use result
}
```

**Memoization:**
- Wrap list items and frequently-rendered components in `React.memo()`
- Example: `ContactAvatar`, `GroupAvatar`, `NavSection`, `SidebarQuickCapture`

**Effects:**
- Always include dependency array
- Prefer single-purpose effects
- Clean up subscriptions/listeners in return statement

## CSS & Styling

**CSS Variables:**
- All colors, z-indices, easing functions must use CSS variables from `globals.css`
- Never hardcode colors like `#fff`, `#000`, `#a78bfa`
- Pattern: `background: var(--accent)`, `color: var(--text-primary)`

**Key Variables:**
- Colors: `--accent`, `--accent-solid`, `--green`, `--green-solid`, `--red`, `--red-solid`
- Backgrounds: `--bg-base`, `--bg-panel`, `--bg-card`, `--bg-elevated`
- Text: `--text-primary`, `--text-secondary`, `--text-muted`
- Motion: `--ease-spring`, `--duration-fast`, `--duration-normal`
- Z-index: `--z-sidebar`, `--z-modal`, `--z-toast`

**Utility Classes:**
Use `.hover-bg` and `.hover-bg-bright` instead of inline event handlers:
```typescript
// Prefer:
<div className="hover-bg">Content</div>

// Avoid:
<div onMouseEnter={...} onMouseLeave={...}>Content</div>
```

**Tailwind:**
Primary styling tool alongside CSS variables. Combine for utility+system consistency:
```typescript
<div className="px-4 py-2 rounded-lg" style={{ background: 'var(--bg-card)' }}>
  Content
</div>
```

## Data Fetching

**API Client:**
All HTTP requests via `api` wrapper from `@/lib/api`:
```typescript
const data = await api.get<ResponseType>('/api/endpoint')
const result = await api.post('/api/endpoint', { body })
const updated = await api.patch('/api/endpoint', { changes })
await api.del('/api/endpoint')
```

**React Query:**
- Keys centralized in `lib/query-keys.ts`
- Pattern:
  ```typescript
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.todos,
    queryFn: () => api.get<Todo[]>('/api/todos'),
  })
  ```

**Supabase:**
- Client imported from `@/lib/supabase/client` (singleton)
- Never import `createAuthClient()` in components
- All frontend Supabase calls proxied through Axum backend (via `/api/*`)

---

*Convention analysis: 2026-03-19*
