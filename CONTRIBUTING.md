# Contributing to Mission Control

## Development Setup

### Prerequisites
- Node.js 20+
- Rust stable toolchain ([rustup](https://rustup.rs/))
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform

### Getting Started

```bash
git clone https://github.com/your-username/mission-control.git
cd mission-control

# Install frontend dependencies
cd frontend && npm install && cd ..

# Run in development (Vite dev server + Tauri app)
cargo tauri dev

# Or frontend only (browser mode at localhost:5173)
cd frontend && npm run dev
```

### Running Tests

```bash
# Frontend tests (vitest)
cd frontend && npx vitest run

# Frontend type check
cd frontend && npm run typecheck

# Rust tests
cd src-tauri && cargo test

# Rust lint
cd src-tauri && cargo clippy -- -D warnings

# Run everything (pre-commit)
./scripts/pre-commit.sh
```

## Project Structure

```
mission-control/
├── frontend/src/
│   ├── components/          # Shared UI components
│   │   ├── messages/        # Messages sub-components (Avatar, Menu, etc.)
│   │   ├── Sidebar.tsx      # Resizable sidebar
│   │   ├── Lightbox.tsx     # Shared image/video viewer
│   │   └── PageErrorBoundary.tsx
│   ├── hooks/messages/      # Messages page custom hooks
│   ├── lib/
│   │   ├── types.ts         # Shared TypeScript interfaces
│   │   ├── api.ts           # API client (30s timeout, auth headers)
│   │   ├── keybindings.ts   # Configurable keyboard shortcuts
│   │   ├── query-keys.ts    # React Query key constants
│   │   ├── audio.ts         # Notification chime
│   │   ├── sidebar-settings.ts  # useSyncExternalStore for sidebar prefs
│   │   ├── migrations.ts    # localStorage version migrations
│   │   └── hooks/           # useEscapeKey, useLocalStorageState, useFocusTrap
│   ├── pages/               # Route pages (all lazy-loaded)
│   └── globals.css          # CSS variables, keyframes, hover utilities
├── src-tauri/src/
│   ├── main.rs              # Entry, secrets, Tauri setup
│   ├── server.rs            # Axum: AppState, auth/rate-limit/logging middleware
│   ├── routes/
│   │   ├── messages.rs      # iMessage via BlueBubbles
│   │   ├── chat.rs          # AI chat via OpenClaw
│   │   ├── auth.rs          # OAuth + nonce verification
│   │   ├── util.rs          # Shared: percent_encode, random_uuid, base64_decode
│   │   └── ...
│   └── secrets.rs           # OS keychain integration
├── .github/workflows/ci.yml
└── scripts/pre-commit.sh
```

## Code Conventions

### CSS
- Use variables: `var(--accent)`, `var(--hover-bg)`, `var(--ease-spring)`, `var(--z-modal)`, etc.
- Use hover classes (`.hover-bg`, `.hover-bg-bright`) instead of inline `onMouseEnter`/`onMouseLeave`
- Z-index scale: `--z-sidebar(100)`, `--z-modal(1000)`, `--z-toast(5000)`

### React
- Wrap hot render components in `React.memo`
- Use shared hooks: `useEscapeKey`, `useLocalStorageState`, `useFocusTrap`
- Use React Query with keys from `lib/query-keys.ts`
- Use shared types from `lib/types.ts`

### Accessibility
- Interactive elements: `<button>` or `<a>`, never `<div onClick>`
- Icon-only buttons: must have `aria-label`
- Modals: `role="dialog"`, `aria-modal="true"`, focus trap
- Inputs: `aria-label` or `<label>`
- Dynamic content: `aria-live` regions
- Toggles: `role="switch"`, `aria-checked`

### Rust
- Secrets via `AppState.secret()`, not `std::env::var()`
- Shared utils in `routes/util.rs`
- Input validation on all endpoints
- Never log credentials — use `redact_bb_url()`

## CI

GitHub Actions on push/PR:
- Frontend: `vitest` + `tsc --noEmit`
- Backend: `cargo test` + `cargo clippy`

## Pull Requests
- Describe what changed and why
- Keep PRs focused on a single feature or fix
- Run `./scripts/pre-commit.sh` before submitting
- Test both web and desktop if touching Tauri layer
