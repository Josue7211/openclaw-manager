# Mission Control — CLAUDE.md

## What is this?
A Tauri v2 desktop app — personal command center combining iMessage (via BlueBubbles), AI chat, task management, homelab monitoring, and agent orchestration. Think Discord meets iOS Settings.

**Open source.** This app will be published publicly for anyone to replicate the setup. All integrations are modular — users enable only what they have (Messages requires a Mac with BlueBubbles, HomeLab requires Proxmox, etc.). The setup guide, architecture docs, and configuration should be clear enough for someone to go from zero to a working installation.

## Privacy & Security — CRITICAL

This is open source software that handles private data. **Zero private data may be committed or exposed:**

- **NEVER** commit `.env.local`, API keys, passwords, tokens, IPs, or Tailscale addresses
- **NEVER** hardcode any credential, URL, or personal identifier in source code
- **ALL** secrets go through the OS keychain (via `src-tauri/src/secrets.rs`) — never in env files, localStorage, or source
- **ALL** service URLs (BlueBubbles, OpenClaw, Supabase) come from user configuration (Settings → Connections or `.env.local`) — never hardcoded
- **Redact** credentials from all log output — use `redact_bb_url()` and never log raw URLs with passwords
- **No telemetry, no analytics, no phone-home** — the app is fully self-hosted and offline-capable
- `.gitignore` must exclude: `.env*`, `*.log`, `target/`, `node_modules/`, SQLite databases, keychain exports
- Screenshots in docs must have personal data (messages, contacts, IPs) redacted
- The `MC_API_KEY` is auto-generated per install and stored in the OS keychain — it is never shared or transmitted

- **NEVER upload files to the internet** — no pastebin, no 0x0.st, no file sharing services. EVER. This has happened before (env file uploaded to 0x0) and must NEVER happen again
- **NEVER use `curl` to upload**, `wget --post`, or any tool that sends local files to external servers
- **NEVER share file contents** via any online service — all debugging and sharing happens locally or via git

- **NEVER run `git checkout` on uncommitted work** — this destroys changes that cannot be recovered. If a file needs to be reverted, copy it first or ask the user. This has happened before and wiped hours of work on Sidebar.tsx and GlobalSearch.tsx.
- **NEVER run destructive git commands** (`git checkout --`, `git reset --hard`, `git clean -f`) without explicit user confirmation and a backup plan

When in doubt: **if it's personal data, it doesn't go in the repo. If it's a file, it doesn't get uploaded anywhere.**

## Infrastructure — CRITICAL CONTEXT

The system runs across multiple machines. The Tauri app must work on ANY machine.

```
┌─────────────────────────────────────────────────────────────┐
│  USER'S MACHINE (Linux CachyOS / macOS / Windows)           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Tauri App (Mission Control)                          │  │
│  │  ├── React frontend (Vite, port 5173)                 │  │
│  │  └── Embedded Axum server (localhost:3000)             │  │
│  │      ├── Proxies to BlueBubbles (macOS only)          │  │
│  │      ├── Proxies to OpenClaw VM                       │  │
│  │      └── Queries Supabase directly                    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌────────────────┐  ┌─────────────────────┐
│  MACBOOK         │  │  OPENCLAW VM   │  │  SERVICES VM        │
│  (macOS)         │  │  (Linux)       │  │  (Linux)            │
│                  │  │                │  │                     │
│  BlueBubbles     │  │  AI agents     │  │  Supabase (self-    │
│  iMessage bridge │  │  running       │  │    hosted PostgreSQL│
│  on personal Mac │  │  missions,     │  │    + Realtime       │
│                  │  │  coding tasks  │  │    + Auth)          │
│  Tailscale IP:   │  │                │  │                     │
│  100.x.x.x:1234 │  │  Tailscale IP: │  │  Vaultwarden,      │
│                  │  │  100.x.x.x     │  │  Minecraft, etc.   │
└─────────────────┘  └────────────────┘  └─────────────────────┘
```

**Key implications:**
- Mission log files (`/tmp/*.log`) exist on the OpenClaw VM, NOT on the user's machine
- Mission events are ingested INTO Supabase FROM the OpenClaw VM
- The Tauri app reads mission events FROM Supabase — it never reads log files directly
- BlueBubbles runs on a Mac — Messages only work when that Mac is reachable via Tailscale
- Supabase is self-hosted on a separate services VM
- The app connects to all services via Tailscale IPs, configured in `.env.local`
- ALL data flows through APIs — no local file access for remote data

## Tech Stack

```
Frontend: React 18 + Vite + TypeScript + TanStack React Query
Backend:  Rust (Tauri v2 + embedded Axum server on localhost:3000)
Database: Supabase (self-hosted PostgreSQL + Realtime + Auth)
Messages: BlueBubbles API (macOS iMessage bridge, remote via Tailscale)
AI Chat:  OpenClaw gateway (WebSocket + HTTP, remote VM)
Network:  Tailscale mesh VPN connecting all VMs
```

## Quick Start

```bash
cd frontend && npm install          # Install frontend deps
cargo tauri dev                     # Run full app (Tauri + Vite)
cd frontend && npm run dev          # Frontend only (browser mode at localhost:5173)
```

## Testing

```bash
cd frontend && npx vitest run       # 90 frontend tests (12 test files)
cd src-tauri && cargo test          # 50 Rust tests
./scripts/pre-commit.sh             # Run everything
```

## Development Workflow — SUBAGENT-DRIVEN

**Always use subagent-driven development.** Launch specialized agents in parallel to maximize throughput. The main conversation stays free to coordinate, launch more agents, and respond to the user.

### How to work:
1. **Break work into independent tasks** — each task gets its own agent
2. **Launch agents in parallel** — use `run_in_background: true` for all agents
3. **Use specialized agent types:**
   - `feature-dev:code-explorer` — understand codebase before making changes
   - `feature-dev:code-architect` — design architecture for new features
   - `feature-dev:code-reviewer` — review code for bugs, security, quality
   - `code-simplifier:code-simplifier` — clean up and simplify code
   - `/frontend-design` — UI/UX design and implementation
   - `/security-review` — security audit
   - `/simplify` — code quality review + fix
4. **Never do work inline** that an agent could do — delegate everything
5. **Report results** as agents complete — don't make the user wait
6. **Fix issues immediately** by launching fix agents when review agents find problems
7. **Run all review types** after major changes: security, quality, reuse, performance, accessibility, architecture, dead code, tests, API consistency, state management, UX consistency

### Agent launch pattern:
```
User asks for X
→ Launch 3-10 agents in parallel covering different aspects of X
→ Stay available to answer questions / launch more agents
→ Report each agent's results as they complete
→ Launch fix agents for any issues found
→ Run review agents after fixes
→ Final test suite verification
```

### DO NOT:
- Do inline research when an agent could explore
- Write code directly when an agent could implement
- Review code manually when a reviewer agent exists
- Make the user wait while you read files — launch an agent instead

## Network & Authentication

All inter-service communication runs over a **Tailscale mesh VPN** — nothing is exposed to the public internet. Authentication operates at two distinct layers:

### Layer 1: Local process isolation (MC_API_KEY)

The embedded Axum server listens on `127.0.0.1:3000` — it only accepts connections from the same machine. The `MC_API_KEY` (auto-generated, stored in OS keychain) prevents other local processes from accessing the API. This is defense-in-depth: even if malware runs on the same machine, it cannot call the API without the key.

- The Tauri webview sends `X-API-Key` on every request via the fetch wrapper in `lib/api.ts`
- In debug mode, requests from `localhost` origins are allowed without the key (developer convenience)
- Health, OAuth callback, and static resource paths are exempt from auth

### Layer 2: Network-level auth (Tailscale ACLs)

Remote services (BlueBubbles, OpenClaw, Supabase) are only reachable via Tailscale IPs (`100.x.x.x`). Tailscale provides:

- **Mutual authentication**: every node has a WireGuard identity verified by the coordination server
- **ACL enforcement**: only authorized nodes can reach specific services/ports
- **Encrypted transit**: all traffic is WireGuard-encrypted end-to-end
- **No port forwarding**: services bind to Tailscale IPs only, invisible to the public internet

This means the app does not need to manage tokens or API keys for service-to-service auth beyond what each service requires (e.g. BlueBubbles password). The network layer guarantees that only tailnet members can connect.

### Tailscale peer identity verification

Implemented in `src-tauri/src/tailscale.rs`:

1. On startup, `startup_verify()` validates that configured service IPs match expected Tailscale hostnames
2. `tailscale status --json` builds a local map of node name → IP for validation
3. Settings → Connections surfaces Tailscale peer verification status with expected hostname fields
4. `verify_peer()` checks IP matches expected hostname before sending credentials

## Key Design Decisions

### Full-bleed pages
Messages and Settings use `position: absolute; inset: 0` to fill the entire main area. The `<main>` has `overflow: hidden` — each page manages its own scrolling internally. Other pages (Personal, Dashboard) scroll via the inner wrapper div with padding.

### Data fetching
Use **React Query** for all data fetching. Query keys are centralized in `lib/query-keys.ts`. Supabase realtime subscriptions should invalidate queries via `queryClient.invalidateQueries()`, not call manual fetch functions.

### State management
- **Server state**: React Query (useQuery, useMutation)
- **URL state**: React Router
- **Local persistence**: `useLocalStorageState` hook from `lib/hooks/`
- **Cross-component reactive state**: `useSyncExternalStore` pattern (see `lib/keybindings.ts`, `lib/sidebar-settings.ts`)
- **DO NOT** use custom DOM events (`window.dispatchEvent`) for cross-component communication
- **DO NOT** read localStorage directly in event handlers — use the reactive store pattern

### Supabase client
Import `supabase` from `@/lib/supabase/client` — it's a singleton. Never call `createAuthClient()` in components.

### CSS & Styling
- Use CSS variables from `globals.css` — never hardcode colors, easings, or z-indices
- Key variables: `--accent`, `--hover-bg`, `--active-bg`, `--ease-spring`, `--z-sidebar`, `--z-modal`, `--apple-blue`, `--text-on-accent`, `--warning`
- Use hover utility classes (`.hover-bg`, `.hover-bg-bright`) instead of inline `onMouseEnter`/`onMouseLeave`
- Prefer `var(--ease-spring)` over hardcoded `cubic-bezier(0.22, 1, 0.36, 1)`
- Light theme: `[data-theme="light"]` overrides in globals.css

### Components
- Wrap frequently-rendered components in `React.memo` (avatars, list items, toggles)
- Shared components: `Lightbox`, `SecondsAgo`, `Toggle`, `PageErrorBoundary`
- Shared hooks: `useEscapeKey`, `useLocalStorageState`, `useFocusTrap`
- Message sub-components live in `components/messages/`
- Message hooks live in `hooks/messages/`

### Accessibility (non-negotiable)
- All buttons must be `<button>`, never `<div onClick>`
- Icon-only buttons need `aria-label`
- Modals need `role="dialog"`, `aria-modal="true"`, focus trap via `useFocusTrap`
- Toggles need `role="switch"`, `aria-checked`
- Inputs need `aria-label` or `<label>`
- Dynamic content needs `aria-live` regions

### Security
- Axum server has API key auth middleware — exempts health, OAuth callback, and static resources
- Never log credentials — use `redact_bb_url()` for BlueBubbles URLs
- Secrets flow through `AppState.secret()`, not `std::env::var()`
- CSP blocks `unsafe-eval` — no `eval()`, `Function()`, or string-based `setTimeout()`
- Shell permissions scoped to HTTPS/HTTP URLs only
- OAuth uses nonce verification to prevent code injection

### Notifications
- 4 independent toggles: DND, system, in-app, sound
- DND overrides all others
- Per-conversation mute stored in localStorage
- SSE messages deduplicated by GUID before notifying
- Contact names resolved via `contactLookupRef`

### Performance
- Conversation list is virtualized (`@tanstack/react-virtual`)
- Message thread is NOT virtualized (variable heights cause jank)
- Lazy-loaded modals: CommandPalette, KeyboardShortcutsModal, OnboardingWelcome
- Dashboard polling consolidated to 2 intervals (fast 10s, slow 30s)
- Bounded caches: avatar (500), link preview (500)
- `React.memo` on: ContactAvatar, GroupAvatar, NavSection, SidebarQuickCapture, Toggle

## File Structure

```
frontend/src/
├── components/
│   ├── messages/           # ContactAvatar, AudioWaveform, MessageMenu, LinkPreviewCard, ReactionPills, VideoThumbnail
│   ├── Sidebar.tsx         # Resizable sidebar with typewriter animation, quick capture, notifications
│   ├── LayoutShell.tsx     # App shell: custom title bar, sidebar, main area, offline banner
│   ├── GlobalSearch.tsx    # Spotlight search with portal overlay + ARIA combobox
│   ├── CommandPalette.tsx  # Cmd+K command palette (lazy-loaded)
│   ├── Lightbox.tsx        # Shared image/video viewer with zoom
│   ├── NotificationCenter.tsx  # Bell icon + dropdown panel with grouping
│   ├── OnboardingWelcome.tsx   # Multi-step setup wizard (lazy-loaded)
│   ├── AuthGuard.tsx       # Route protection wrapper
│   ├── PageErrorBoundary.tsx
│   ├── ConnectionStatus.tsx    # Service health indicator
│   ├── DemoModeBanner.tsx  # Demo mode notification bar
│   └── SecondsAgo.tsx      # Live-updating relative timestamps
├── hooks/messages/         # useMessagesSSE, useMessageCompose, useConversationList
├── lib/
│   ├── api.ts              # Fetch wrapper with 30s timeout + API key + offline queue
│   ├── types.ts            # Shared interfaces (Todo, Mission, SearchResults, etc.)
│   ├── query-keys.ts       # Centralized React Query keys
│   ├── keybindings.ts      # Configurable Cmd+key shortcuts (useSyncExternalStore)
│   ├── audio.ts            # Notification chime
│   ├── sidebar-settings.ts # useSyncExternalStore for sidebar prefs
│   ├── titlebar-settings.ts # useSyncExternalStore for title bar visibility/auto-hide
│   ├── modules.ts          # 16 toggleable app modules (useSyncExternalStore)
│   ├── event-bus.ts        # Typed pub/sub: new-message, mission-updated, etc.
│   ├── offline-queue.ts    # Queue failed mutations, replay on reconnect
│   ├── preferences-sync.ts # Sync localStorage prefs to Supabase
│   ├── migrations.ts       # localStorage version migrations
│   ├── demo-data.ts        # Demo mode with fake data for open-source showcase
│   ├── error-reporter.ts   # Centralized error reporting
│   ├── themes.ts           # Theme definitions
│   ├── hooks/              # useEscapeKey, useLocalStorageState, useFocusTrap, useChatSocket, useTodos, useEventBus
│   └── __tests__/          # Unit tests for api, audio, keybindings, migrations, modules, sidebar-settings
├── pages/                  # All lazy-loaded route pages
└── globals.css             # CSS variables, keyframes, hover utilities, theme overrides

src-tauri/src/
├── main.rs                 # Entry, secrets, system tray, window management
├── server.rs               # Axum: AppState, auth/rate-limit/logging middleware, cache helpers
├── service_client.rs       # Unified HTTP client with timeout, retry, health checks
├── tailscale.rs            # Peer verification via `tailscale status --json`
├── secrets.rs              # OS keychain integration (no env vars)
├── logging.rs              # Structured logging setup
├── routes/
│   ├── messages.rs         # iMessage via BlueBubbles + SQLite cache + SSE
│   ├── chat.rs             # AI chat via OpenClaw (WebSocket + HTTP)
│   ├── auth.rs             # OAuth + nonce verification
│   ├── missions.rs         # Mission CRUD + event replay + SQLite cache
│   ├── preferences.rs      # Multi-device preference sync
│   ├── util.rs             # Shared: percent_encode, random_uuid, base64_decode
│   ├── pipeline/           # CI/CD pipeline management (spawn, review, complete, events, helpers)
│   └── ...                 # agents, calendar, email, homelab, knowledge, media, todos, etc.
└── supabase.rs             # Supabase client helpers

supabase/
├── migrations/001_initial.sql  # 19 tables, realtime publication, seeds
└── docker-compose.example.yml  # Self-hosted Supabase setup
```

## Commit Style
- No `Co-Authored-By: Claude` lines
- Short imperative subject line
- Body explains why, not what

## Platform
- Primary: Linux (CachyOS + Hyprland) and macOS
- Also targets: Windows
- BlueBubbles (iMessage) is macOS-only — Messages page only works with a Mac running BlueBubbles
- System tray integration via Tauri tray-icon feature (Waybar compatible)
- Custom title bar with traffic light buttons (auto-hide supported)
