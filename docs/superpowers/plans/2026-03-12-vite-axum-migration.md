# Vite + Axum Migration Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Next.js + Node.js sidecar with Vite + Axum embedded in Tauri — producing a single binary with no Node.js dependency.

**Architecture:**
- React 19 + Vite + React Router v7 for the frontend (static bundle, no server)
- Axum HTTP server embedded in Tauri (127.0.0.1:3000) replaces Node.js sidecar
- Supabase JS called directly from React for auth, realtime, and CRUD operations
- Axum handles all external API calls, local I/O, process management, and secrets

**Tech Stack:** Vite, React Router v7, React Query, Axum 0.7, sqlx (SQLite), reqwest, Tauri 2

---

## File Structure Overview

### New Frontend Files (`frontend/`)
```
frontend/
├── index.html
├── package.json
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── .env.local
├── public/                          # copied from current public/
│   └── ...
└── src/
    ├── main.tsx                     # App entry: React Router + QueryClient + globals.css
    ├── globals.css                  # copied verbatim from app/globals.css
    ├── test-setup.ts                # vitest jsdom setup
    ├── pages/
    │   ├── Dashboard.tsx            # from app/page.tsx
    │   ├── Personal.tsx             # from app/personal/page.tsx
    │   ├── Chat.tsx                 # from app/chat/page.tsx
    │   ├── Todos.tsx                # from app/todos/page.tsx
    │   ├── Calendar.tsx             # from app/calendar/page.tsx
    │   ├── Reminders.tsx            # from app/reminders/page.tsx
    │   ├── Messages.tsx             # from app/messages/page.tsx
    │   ├── Pomodoro.tsx             # from app/pomodoro/page.tsx
    │   ├── Email.tsx                # from app/email/page.tsx
    │   ├── HomeLab.tsx              # from app/homelab/page.tsx
    │   ├── MediaRadar.tsx           # from app/media/page.tsx
    │   ├── Missions.tsx             # from app/missions/page.tsx
    │   ├── Agents.tsx               # from app/agents/page.tsx
    │   ├── Memory.tsx               # from app/memory/page.tsx
    │   ├── CronJobs.tsx             # from app/crons/page.tsx (may not exist, check)
    │   ├── Pipeline.tsx             # from app/pipeline/page.tsx
    │   ├── KnowledgeBase.tsx        # from app/knowledge/page.tsx
    │   ├── Ideas.tsx                # from app/ideas/page.tsx
    │   ├── Capture.tsx              # from app/capture/page.tsx
    │   ├── Settings.tsx             # from app/settings/page.tsx
    │   ├── Search.tsx               # from app/search/page.tsx
    │   ├── Login.tsx                # from app/login/page.tsx
    │   ├── NotFound.tsx             # from app/not-found.tsx
    │   └── Error.tsx                # from app/error.tsx
    ├── components/
    │   ├── LayoutShell.tsx          # modified: useNavigate, useLocation, <Outlet />
    │   ├── Sidebar.tsx              # modified: Link from react-router-dom
    │   ├── CommandPalette.tsx       # modified: useNavigate
    │   ├── GlobalSearch.tsx         # modified: useNavigate
    │   ├── QuickCaptureWidget.tsx   # minimal changes
    │   ├── KeyboardShortcutsModal.tsx
    │   └── Skeleton.tsx
    ├── lib/
    │   ├── supabase.ts              # client-only (no server.ts)
    │   ├── nav-items.ts             # copied verbatim
    │   ├── page-cache.ts            # copied verbatim
    │   ├── constants.ts             # copied verbatim
    │   ├── utils.ts                 # copied verbatim
    │   ├── tauri.ts                 # copied verbatim
    │   ├── redact.ts                # copied verbatim
    │   ├── usePrefs.ts              # modified: direct supabase query
    │   ├── pipeline.ts              # stripped to client-safe exports only (constants, types)
    │   │                              # server functions (spawn, log parse) moved to Axum
    │   │                              # ROUTING_TABLE, AGENT_STATUS, MISSION_STATUS → lib/constants.ts
    │   └── openclaw.ts              # modified: invoke() for OPENCLAW_DIR
    └── hooks/
        ├── useSupabaseQuery.ts      # thin wrapper for React Query + Supabase
        └── useTauriQuery.ts         # thin wrapper for React Query + fetch to Axum
```

### New/Modified Rust Files (`src-tauri/src/`)
```
src-tauri/
├── Cargo.toml                       # updated dependencies
├── migrations/
│   └── 0001_init.sql                # SQLite schema
├── src/
│   ├── main.rs                      # modified: spawn Axum instead of sidecar
│   ├── secrets.rs                   # unchanged (already loads secrets to env)
│   ├── sidecar.rs                   # DELETED
│   ├── server.rs                    # NEW: Axum server setup + AppState
│   ├── db.rs                        # NEW: SQLite pool init + migrations
│   ├── error.rs                     # NEW: AppError enum
│   ├── redact.rs                    # NEW: secret redaction
│   ├── commands.rs                  # NEW: get_openclaw_dir Tauri command
│   └── routes/
│       ├── mod.rs                   # Router nesting
│       ├── auth.rs                  # tauri-session OAuth pickup
│       ├── chat.rs                  # OpenClaw chat send/history/stream/image
│       ├── calendar.rs              # CalDAV via reqwest
│       ├── email.rs                 # IMAP (via async-imap or lettre)
│       ├── homelab.rs               # Proxmox + OPNsense
│       ├── media.rs                 # Plex, Sonarr, Radarr
│       ├── messages.rs              # BlueBubbles + Mac Bridge
│       ├── workspace.rs             # OpenClaw workspace files
│       ├── status.rs                # IDENTITY.md, HEARTBEAT.md, processes
│       ├── pipeline.rs              # spawn, complete, events
│       ├── missions.rs              # mission-events ingestion, mission side effects
│       ├── agents.rs                # active-coders (ps aux), agent status sync
│       ├── notify.rs                # ntfy.sh
│       ├── search.rs                # aggregated search
│       ├── openclaw_cli.rs          # sessions, subagents, crons (shell out)
│       ├── reminders.rs             # Mac Bridge API (NOT Supabase — uses external API)
│       ├── habits.rs                # habits + entries CRUD (uses service-role key)
│       ├── reviews.rs               # daily-review, weekly-review, retrospectives
│       └── misc.rs                  # dns, deploy, dust, stale, link-preview, cache-refresh, quick-capture, decisions, workflow-notes, email-accounts
```

### Route Classification: Axum vs Supabase Direct

**All routes that use `supabaseAdmin` (service-role key) MUST go through Axum** until RLS policies are verified for their tables. Routes can be migrated to direct Supabase calls only AFTER RLS policies are confirmed.

**Axum routes** (external APIs, local I/O, service-role key, process management):
- chat, workspace, status, heartbeat, processes, sessions, subagents, crons, auth
- homelab, proxmox, opnsense, messages/\*, calendar, email, media, reminders
- pipeline/spawn, pipeline/complete, pipeline/review, pipeline-events
- missions (PATCH side effects), mission-events, mission-events/bjorn, missions/sync-agents
- agents, agents/active-coders, subagents/active
- notify, search, dns, deploy, dust, stale, cache-refresh, cache-refresh-slow
- quick-capture (has API key check), email-accounts (stores passwords)
- habits, decisions, daily-review, weekly-review, retrospectives, workflow-notes

**Supabase direct from React** (ONLY after RLS is verified for these tables):
- todos (simple CRUD, single table)
- capture (simple CRUD)
- prefs (after RLS policy added per spec)
- knowledge (simple CRUD)
- cache (read-only)

### Files to Delete (Phase 3)
```
app/                                 # all Next.js pages + API routes
scripts/openclaw-api.mjs             # Node.js sidecar (replaced by Axum workspace routes)
next.config.ts
proxy.ts
next-env.d.ts
postcss.config.mjs
src-tauri/src/sidecar.rs
```

---

## Chunk 1: Vite Frontend Scaffold

### Task 1: Create Vite project

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/index.html`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`

- [ ] **Step 1: Scaffold Vite project**

```bash
cd <project-root>
npm create vite@latest frontend -- --template react-ts
```

- [ ] **Step 2: Install dependencies**

```bash
cd frontend
npm install react-router-dom @tanstack/react-query @supabase/supabase-js
npm install @tauri-apps/api@2 @tauri-apps/plugin-notification
npm install lucide-react react-markdown remark-gfm
```

- [ ] **Step 3: Configure vite.config.ts**

Replace `frontend/vite.config.ts` with:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  },
  server: { port: 5173, strictPort: true },
  build: { target: 'esnext' },
  envPrefix: 'VITE_'
})
```

- [ ] **Step 4: Update tsconfig.json**

Set `compilerOptions.paths` for `@/*` alias, `jsx: "react-jsx"`, `target: "ESNext"`.

- [ ] **Step 5: Create .env.local**

Copy from project root `.env.local`, renaming all `NEXT_PUBLIC_` prefixes to `VITE_`:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

- [ ] **Step 6: Verify Vite starts**

```bash
cd frontend && npm run dev
```
Expected: Dev server on http://localhost:5173

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat: vite frontend scaffold"
```

---

### Task 2: Copy globals.css and public assets

**Files:**
- Copy: `app/globals.css` → `frontend/src/globals.css`
- Copy: `public/*` → `frontend/public/`

- [ ] **Step 1: Copy files**

```bash
cp app/globals.css frontend/src/globals.css
cp -r public/* frontend/public/ 2>/dev/null || true
```

- [ ] **Step 2: Update index.html**

Replace `frontend/index.html` — add Google Fonts links in `<head>` (matching current `app/layout.tsx`):
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mission Control — Bjorn</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&family=JetBrains+Mono:wght@300;400;500;600&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Verify fonts load**

Open http://localhost:5173, inspect — fonts should load correctly.

---

### Task 3: Copy lib files

**Files:**
- Copy: `lib/nav-items.ts` → `frontend/src/lib/nav-items.ts`
- Copy: `lib/page-cache.ts` → `frontend/src/lib/page-cache.ts`
- Copy: `lib/constants.ts` → `frontend/src/lib/constants.ts`
- Copy: `lib/utils.ts` → `frontend/src/lib/utils.ts`
- Copy: `lib/tauri.ts` → `frontend/src/lib/tauri.ts`
- Copy: `lib/redact.ts` → `frontend/src/lib/redact.ts`
- Copy: `lib/usePrefs.ts` → `frontend/src/lib/usePrefs.ts`
- Create: `frontend/src/lib/supabase.ts` (client-only version)
- Copy: `lib/openclaw.ts` → `frontend/src/lib/openclaw.ts`

- [ ] **Step 1: Copy verbatim files**

```bash
mkdir -p frontend/src/lib
cp lib/nav-items.ts lib/page-cache.ts lib/constants.ts lib/utils.ts \
   lib/tauri.ts lib/redact.ts lib/usePrefs.ts \
   frontend/src/lib/
```

- [ ] **Step 2: Create client-only supabase.ts**

`frontend/src/lib/supabase.ts`:
```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

This replaces both `lib/supabase.ts` and `lib/supabase/client.ts`. No server client needed — Axum handles server-side Supabase operations.

- [ ] **Step 3: Fix import paths**

In all copied lib files, replace `@/` imports that reference server-only modules. Remove any `next/headers` or `next/navigation` imports. Replace `process.env.NEXT_PUBLIC_*` with `import.meta.env.VITE_*`.

- [ ] **Step 4: Modify openclaw.ts for Tauri**

Remove hardcoded path constants (`OPENCLAW_DIR`, `OPENCLAW_WS` etc.) that read `process.env`. Replace with an async getter:
```ts
import { invoke } from '@tauri-apps/api/core'

let _openclawDir: string | null = null

export async function getOpenclawDir(): Promise<string> {
  if (_openclawDir) return _openclawDir
  if (window.__TAURI_INTERNALS__) {
    _openclawDir = await invoke<string>('get_openclaw_dir')
  } else {
    _openclawDir = '~/.openclaw'
  }
  return _openclawDir
}
```

Remove server-only functions (`getSessionFile`, `saveImageToDisk`, `openclawChatSend`) — these move to Axum.

- [ ] **Step 5: Verify no TypeScript errors in lib/**

```bash
cd frontend && npx tsc --noEmit --pretty
```

---

### Task 4: Copy and adapt components

**Files:**
- Copy: `components/Skeleton.tsx` → `frontend/src/components/Skeleton.tsx`
- Copy: `components/KeyboardShortcutsModal.tsx` → `frontend/src/components/KeyboardShortcutsModal.tsx`
- Copy: `components/QuickCaptureWidget.tsx` → `frontend/src/components/QuickCaptureWidget.tsx`
- Copy: `components/CommandPalette.tsx` → `frontend/src/components/CommandPalette.tsx`
- Modify: `components/Sidebar.tsx` → `frontend/src/components/Sidebar.tsx`
- Modify: `components/LayoutShell.tsx` → `frontend/src/components/LayoutShell.tsx`

- [ ] **Step 1: Copy verbatim components**

```bash
mkdir -p frontend/src/components
cp components/Skeleton.tsx components/KeyboardShortcutsModal.tsx \
   components/QuickCaptureWidget.tsx components/GlobalSearch.tsx \
   frontend/src/components/
```

- [ ] **Step 2: Adapt GlobalSearch.tsx**

Copy `components/GlobalSearch.tsx` → `frontend/src/components/GlobalSearch.tsx`.

Replacements:
- `import { useRouter } from 'next/navigation'` → `import { useNavigate } from 'react-router-dom'`
- `const router = useRouter()` → `const navigate = useNavigate()`
- `router.push(path)` → `navigate(path)`
- Remove `'use client'`

- [ ] **Step 3: Adapt Sidebar.tsx**

Copy `components/Sidebar.tsx` → `frontend/src/components/Sidebar.tsx`.

Replacements:
- `import Link from 'next/link'` → `import { Link } from 'react-router-dom'`
- `import { usePathname } from 'next/navigation'` → `import { useLocation } from 'react-router-dom'`
- `const pathname = usePathname()` → `const { pathname } = useLocation()`
- Remove `'use client'` directive

- [ ] **Step 4: Adapt CommandPalette.tsx**

Copy `components/CommandPalette.tsx` → `frontend/src/components/CommandPalette.tsx`.

Replacements:
- `import { useRouter } from 'next/navigation'` → `import { useNavigate } from 'react-router-dom'`
- `const router = useRouter()` → `const navigate = useNavigate()`
- `router.push(path)` → `navigate(path)`
- Remove `'use client'`

- [ ] **Step 5: Adapt LayoutShell.tsx**

Copy `components/LayoutShell.tsx` → `frontend/src/components/LayoutShell.tsx`.

Major changes:
1. Replace imports:
   - `import { usePathname, useRouter } from 'next/navigation'` → `import { useLocation, useNavigate, Outlet } from 'react-router-dom'`
2. Replace hooks:
   - `const pathname = usePathname()` → `const { pathname } = useLocation()`
   - `const router = useRouter()` → `const navigate = useNavigate()`
3. Replace navigation:
   - `router.push(route)` → `navigate(route)`
4. Replace children with Outlet:
   - Remove `{ children }: { children: React.ReactNode }` from props → `export default function LayoutShell()`
   - Replace `{children}` in JSX with `<Outlet />`
5. Remove the `<body>` wrapper — the `<body>` tag is in `index.html` now
   - Replace outer `<body style={...}>` with `<div style={...}>`
6. Remove `'use client'`

- [ ] **Step 6: Fix import paths in all components**

Replace `@/components/` → `@/components/`, `@/lib/` → `@/lib/` (should work with Vite alias).

- [ ] **Step 7: Verify components compile**

```bash
cd frontend && npx tsc --noEmit --pretty
```

---

### Task 5: Copy and adapt page components

**Files:**
- Copy all 22 page files from `app/*/page.tsx` → `frontend/src/pages/*.tsx`

- [ ] **Step 1: Copy all pages**

For each page, copy and rename:
```bash
mkdir -p frontend/src/pages
cp app/page.tsx frontend/src/pages/Dashboard.tsx
cp app/personal/page.tsx frontend/src/pages/Personal.tsx
cp app/chat/page.tsx frontend/src/pages/Chat.tsx
cp app/todos/page.tsx frontend/src/pages/Todos.tsx
cp app/calendar/page.tsx frontend/src/pages/Calendar.tsx
cp app/reminders/page.tsx frontend/src/pages/Reminders.tsx
cp app/messages/page.tsx frontend/src/pages/Messages.tsx
cp app/pomodoro/page.tsx frontend/src/pages/Pomodoro.tsx
cp app/email/page.tsx frontend/src/pages/Email.tsx
cp app/homelab/page.tsx frontend/src/pages/HomeLab.tsx
cp app/media/page.tsx frontend/src/pages/MediaRadar.tsx
cp app/missions/page.tsx frontend/src/pages/Missions.tsx
cp app/agents/page.tsx frontend/src/pages/Agents.tsx
cp app/memory/page.tsx frontend/src/pages/Memory.tsx
cp app/pipeline/page.tsx frontend/src/pages/Pipeline.tsx
cp app/knowledge/page.tsx frontend/src/pages/KnowledgeBase.tsx
cp app/ideas/page.tsx frontend/src/pages/Ideas.tsx
cp app/capture/page.tsx frontend/src/pages/Capture.tsx
cp app/settings/page.tsx frontend/src/pages/Settings.tsx
cp app/search/page.tsx frontend/src/pages/Search.tsx
cp app/login/page.tsx frontend/src/pages/Login.tsx
cp app/not-found.tsx frontend/src/pages/NotFound.tsx
cp app/error.tsx frontend/src/pages/Error.tsx
```

Check if `app/crons/page.tsx` exists — if so, copy to `frontend/src/pages/CronJobs.tsx`.

- [ ] **Step 2: Mechanical replacements across ALL page files**

Run these replacements on every file in `frontend/src/pages/`:

| Find | Replace |
|------|---------|
| `'use client'` | (delete line) |
| `import { useRouter } from 'next/navigation'` | `import { useNavigate } from 'react-router-dom'` |
| `import { usePathname } from 'next/navigation'` | `import { useLocation } from 'react-router-dom'` |
| `const router = useRouter()` | `const navigate = useNavigate()` |
| `router.push(` | `navigate(` |
| `router.replace(` | `navigate(` |
| `const pathname = usePathname()` | `const { pathname } = useLocation()` |
| `import Link from 'next/link'` | `import { Link } from 'react-router-dom'` |
| `import Image from 'next/image'` | (delete — use `<img>` instead) |
| `<Image ` | `<img ` (remove `width`, `height`, `priority` props if static) |
| `process.env.NEXT_PUBLIC_` | `import.meta.env.VITE_` |

- [ ] **Step 3: Fix default exports**

Each page should have `export default function PageName()`. The current Next.js pages export anonymous or named functions — ensure they're proper default exports.

- [ ] **Step 4: Fix `@/` import paths**

All `@/lib/...`, `@/components/...` imports should resolve via Vite alias. Verify with `tsc --noEmit`.

- [ ] **Step 5: Remove server-only imports**

Any page importing from `lib/supabase/server`, `lib/http`, `lib/pipeline` server functions, or `next/headers` — remove those imports and the code that uses them. Data fetching will be refactored in the next task.

---

### Task 6: Create main.tsx with routing

**Files:**
- Create: `frontend/src/main.tsx`

- [ ] **Step 1: Write main.tsx**

```tsx
import './globals.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import LayoutShell from './components/LayoutShell'

import Dashboard from './pages/Dashboard'
import Personal from './pages/Personal'
import Chat from './pages/Chat'
import Todos from './pages/Todos'
import Calendar from './pages/Calendar'
import Reminders from './pages/Reminders'
import Messages from './pages/Messages'
import Pomodoro from './pages/Pomodoro'
import Email from './pages/Email'
import HomeLab from './pages/HomeLab'
import MediaRadar from './pages/MediaRadar'
import Missions from './pages/Missions'
import Agents from './pages/Agents'
import Memory from './pages/Memory'
import CronJobs from './pages/CronJobs'
import Pipeline from './pages/Pipeline'
import KnowledgeBase from './pages/KnowledgeBase'
import Ideas from './pages/Ideas'
import Capture from './pages/Capture'
import Settings from './pages/Settings'
import Search from './pages/Search'
import Login from './pages/Login'
import NotFound from './pages/NotFound'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 2,
    }
  }
})

// Tie React Query focus refetching to Tauri window focus events
if (window.__TAURI_INTERNALS__) {
  import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
    focusManager.setEventListener((handleFocus) => {
      let unlisten: (() => void) | undefined
      getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        handleFocus(focused)
      }).then(fn => { unlisten = fn })
      return () => unlisten?.()
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<LayoutShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/personal" element={<Personal />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/todos" element={<Todos />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/reminders" element={<Reminders />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/pomodoro" element={<Pomodoro />} />
            <Route path="/email" element={<Email />} />
            <Route path="/homelab" element={<HomeLab />} />
            <Route path="/media" element={<MediaRadar />} />
            <Route path="/missions" element={<Missions />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/memory" element={<Memory />} />
            <Route path="/crons" element={<CronJobs />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/knowledge" element={<KnowledgeBase />} />
            <Route path="/ideas" element={<Ideas />} />
            <Route path="/capture" element={<Capture />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/search" element={<Search />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
```

- [ ] **Step 2: Verify app loads in browser**

```bash
cd frontend && npm run dev
```
Navigate to http://localhost:5173 — should render Dashboard inside LayoutShell.

- [ ] **Step 3: Verify all routes navigate correctly**

Click through sidebar links — each route should render the correct page component.

- [ ] **Step 4: Commit**

```bash
git add frontend/
git commit -m "feat: vite frontend scaffold + routing"
```

---

## Chunk 2: React Query Data Fetching

### Task 7: Convert data fetching to React Query

**Files:**
- Modify: every page in `frontend/src/pages/` that uses `useEffect` + `fetch` + `useState`

- [ ] **Step 1: Identify all data-fetching pages**

Read every page in `frontend/src/pages/` and list which ones have the pattern:
```tsx
const [data, setData] = useState(...)
const [loading, setLoading] = useState(true)
useEffect(() => { fetch('/api/...').then(...) }, [])
```

- [ ] **Step 2: Create useTauriQuery hook**

`frontend/src/hooks/useTauriQuery.ts`:
```ts
import { useQuery, UseQueryOptions } from '@tanstack/react-query'

const API_BASE = 'http://127.0.0.1:3000'

export function useTauriQuery<T>(
  key: string[],
  path: string,
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>
) {
  return useQuery<T>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}${path}`)
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    },
    ...options,
  })
}
```

- [ ] **Step 3: Convert each page**

For each page, replace the `useEffect` + `fetch` + `useState` pattern with `useQuery`:

Before:
```tsx
const [todos, setTodos] = useState([])
const [loading, setLoading] = useState(true)
useEffect(() => {
  fetch('/api/todos').then(r => r.json()).then(d => {
    setTodos(d)
    setLoading(false)
  })
}, [])
```

After:
```tsx
import { useQuery } from '@tanstack/react-query'

const { data: todos = [], isLoading: loading } = useQuery({
  queryKey: ['todos'],
  queryFn: () => fetch('http://127.0.0.1:3000/api/todos').then(r => r.json())
})
```

Keep the same variable names (`loading`, `data`) to minimize diff. The fetch URLs stay pointing to `http://127.0.0.1:3000/api/...` — they'll work with both the Node sidecar (during dev migration) and Axum (after Phase 2).

- [ ] **Step 4: Handle mutations**

For pages with POST/PATCH/DELETE operations (todos, ideas, missions, capture, etc.), use `useMutation` + `queryClient.invalidateQueries`:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'

const queryClient = useQueryClient()

const addTodo = useMutation({
  mutationFn: (text: string) =>
    fetch('http://127.0.0.1:3000/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    }).then(r => r.json()),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] })
})
```

- [ ] **Step 5: Handle SSE streams**

For pages that use EventSource (chat stream, messages stream, pipeline events):
- Keep the existing EventSource patterns — these work the same with Vite
- Just update the URL base if needed

- [ ] **Step 6: Verify all pages load data correctly**

Start the Node sidecar alongside the Vite dev server:
```bash
# Terminal 1: Node sidecar (existing)
npm run dev

# Terminal 2: Vite frontend
cd frontend && npm run dev
```

Open http://localhost:5173 and check each page loads data.

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat: react query data fetching"
```

---

## Chunk 3: Axum Server Scaffold

### Task 8: Update Cargo.toml

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add Axum and supporting dependencies**

Add to `[dependencies]`:
```toml
axum = { version = "0.7", features = ["ws", "macros"] }
axum-extra = { version = "0.9", features = ["typed-header"] }
tokio = { version = "1", features = ["full"] }
tower = "0.4"
tower-http = { version = "0.5", features = ["cors", "trace"] }
reqwest = { version = "0.12", features = ["json", "stream", "rustls-tls"], default-features = false }
sqlx = { version = "0.7", features = ["runtime-tokio", "sqlite", "chrono"] }
chrono = { version = "0.4", features = ["serde"] }
dirs = "5"
anyhow = "1"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
futures = "0.3"
async-stream = "0.3"
tokio-stream = "0.1"
regex = "1"
tokio-tungstenite = { version = "0.21", features = ["native-tls"] }
ical = "0.11"
async-imap = "0.9"
async-native-tls = "0.5"
image = { version = "0.25", default-features = false, features = ["jpeg", "png"] }
```

- [ ] **Step 2: Verify it compiles**

```bash
cd src-tauri && cargo check
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: add axum dependencies to Cargo.toml"
```

---

### Task 9: Create AppError

**Files:**
- Create: `src-tauri/src/error.rs`

- [ ] **Step 1: Write error.rs**

```rust
use axum::{http::StatusCode, response::{IntoResponse, Response}, Json};
use serde_json::json;

pub enum AppError {
    NotFound(String),
    Unauthorized,
    BadRequest(String),
    Internal(anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match self {
            AppError::NotFound(m) => (StatusCode::NOT_FOUND, "not_found", m),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized", "Unauthorized".into()),
            AppError::BadRequest(m) => (StatusCode::BAD_REQUEST, "bad_request", m),
            AppError::Internal(e) => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()),
        };
        (status, Json(json!({ "ok": false, "error": message, "code": code }))).into_response()
    }
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        AppError::Internal(e)
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        AppError::Internal(e.into())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        AppError::Internal(e.into())
    }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd src-tauri && cargo check
```

---

### Task 10: Create SQLite setup

**Files:**
- Create: `src-tauri/src/db.rs`
- Create: `src-tauri/migrations/0001_init.sql`

- [ ] **Step 1: Write migrations**

`src-tauri/migrations/0001_init.sql`:
```sql
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    event_type TEXT NOT NULL,
    resource_id TEXT,
    resource_type TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    action TEXT NOT NULL,
    resource TEXT,
    result TEXT NOT NULL,
    metadata TEXT
);

CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);
```

- [ ] **Step 2: Write db.rs**

```rust
use sqlx::SqlitePool;

pub async fn init() -> anyhow::Result<SqlitePool> {
    let db_path = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("mission-control")
        .join("local.db");

    std::fs::create_dir_all(db_path.parent().unwrap())?;

    let url = format!("sqlite://{}?mode=rwc", db_path.display());
    let pool = SqlitePool::connect(&url).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd src-tauri && cargo check
```

---

### Task 11: Create redact.rs

**Files:**
- Create: `src-tauri/src/redact.rs`

- [ ] **Step 1: Write redact.rs**

Port logic from `lib/redact.ts` — **use the same partial-reveal strategy** (first 4 + `***` + last 4 chars) to match the existing TypeScript implementation:
```rust
use regex::Regex;

/// Patterns that look like secrets — matches the TypeScript lib/redact.ts patterns
const SECRET_PATTERNS: &[&str] = &[
    r"(?:api[_-]?key|token|secret|password|bearer)\s*[:=]\s*[\"']?([a-zA-Z0-9_\-./+]{20,})[\"']?",
    r"\b(sk-[a-zA-Z0-9]{20,})\b",                     // OpenAI-style keys
    r"\b(eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]+)\b",   // JWT tokens
    r"\b([a-f0-9]{32,})\b",                             // Long hex strings
];

pub fn redact(input: &str) -> String {
    let mut result = input.to_string();
    for pattern_str in SECRET_PATTERNS {
        if let Ok(re) = Regex::new(pattern_str) {
            result = re.replace_all(&result, |caps: &regex::Captures| {
                let full = caps.get(0).unwrap().as_str();
                if let Some(group) = caps.get(1) {
                    let g = group.as_str();
                    if g.len() > 8 {
                        let redacted = format!("{}***{}", &g[..4], &g[g.len()-4..]);
                        return full.replace(g, &redacted);
                    }
                }
                // Fallback: redact middle of any 4+ char alphanumeric runs
                let re2 = Regex::new(r"[a-zA-Z0-9]{4,}").unwrap();
                re2.replace_all(full, |m: &regex::Captures| {
                    let s = m.get(0).unwrap().as_str();
                    format!("{}***", &s[..2])
                }).into_owned()
            }).into_owned();
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_redacts_openai_key_partial_reveal() {
        let input = "key: sk-abcdefghij1234567890extra";
        let result = redact(input);
        // Should keep first 4 and last 4 chars of the key
        assert!(result.contains("***"));
        assert!(!result.contains("abcdefghij1234567890"));
    }

    #[test]
    fn test_redacts_jwt_partial_reveal() {
        let input = "token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjg";
        let result = redact(input);
        assert!(result.contains("***"));
    }

    #[test]
    fn test_redacts_hex_string() {
        let hex = "a".repeat(42);
        let result = redact(&hex);
        assert!(result.contains("***"));
        assert!(!result.contains(&hex));
    }

    #[test]
    fn test_preserves_normal_text() {
        let input = "Hello, this is a normal message.";
        assert_eq!(redact(input), input);
    }
}
```

- [ ] **Step 2: Run tests**

```bash
cd src-tauri && cargo test redact
```
Expected: All 4 tests pass.

---

### Task 12: Create commands.rs

**Files:**
- Create: `src-tauri/src/commands.rs`

- [ ] **Step 1: Write commands.rs**

```rust
#[tauri::command]
pub fn get_openclaw_dir() -> String {
    std::env::var("OPENCLAW_DIR").unwrap_or_else(|_| {
        dirs::home_dir()
            .map(|h| h.join(".openclaw").to_string_lossy().into_owned())
            .unwrap_or_else(|| ".openclaw".to_string())
    })
}
```

---

### Task 13: Create Axum server + route scaffold

**Files:**
- Create: `src-tauri/src/server.rs`
- Create: `src-tauri/src/routes/mod.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Write server.rs**

```rust
use axum::Router;
use std::net::SocketAddr;
use tokio::net::TcpListener;
use tower_http::cors::{CorsLayer, Any};
use crate::routes;

#[derive(Clone)]
pub struct AppState {
    pub app: tauri::AppHandle,
    pub db: sqlx::SqlitePool,
    pub http: reqwest::Client,
}

pub async fn start(app_handle: tauri::AppHandle) -> anyhow::Result<()> {
    let state = AppState {
        app: app_handle,
        db: crate::db::init().await?,
        http: reqwest::Client::new(),
    };

    let app = Router::new()
        .nest("/api", routes::router())
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    let listener = TcpListener::bind(addr).await?;
    tracing::info!("Axum listening on {}", addr);
    axum::serve(listener, app).await?;
    Ok(())
}
```

- [ ] **Step 2: Write routes/mod.rs (scaffold with status route only)**

```rust
use axum::{Router, routing::get, Json};
use serde_json::{json, Value};
use crate::server::AppState;

pub mod status;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .nest("/status", status::router())
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}
```

`src-tauri/src/routes/status.rs`:
```rust
use axum::{Router, routing::get, Json, extract::State};
use serde_json::{json, Value};
use crate::server::AppState;
use crate::error::AppError;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_status))
}

async fn get_status(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    // Read IDENTITY.md from OpenClaw workspace
    let openclaw_dir = std::env::var("OPENCLAW_DIR").unwrap_or_else(|_| {
        dirs::home_dir()
            .map(|h| h.join(".openclaw").to_string_lossy().into_owned())
            .unwrap_or_else(|| ".openclaw".to_string())
    });
    let identity_path = std::path::Path::new(&openclaw_dir).join("workspace").join("IDENTITY.md");

    let (name, emoji) = if identity_path.exists() {
        let content = tokio::fs::read_to_string(&identity_path).await
            .unwrap_or_default();
        let name = content.lines()
            .find(|l| l.starts_with("Name:"))
            .map(|l| l.trim_start_matches("Name:").trim().to_string())
            .unwrap_or_else(|| "Bjorn".to_string());
        let emoji = content.lines()
            .find(|l| l.starts_with("Emoji:"))
            .map(|l| l.trim_start_matches("Emoji:").trim().to_string())
            .unwrap_or_else(|| "🦬".to_string());
        (name, emoji)
    } else {
        ("Bjorn".to_string(), "🦬".to_string())
    };

    Ok(Json(json!({ "name": name, "emoji": emoji })))
}
```

- [ ] **Step 3: Update main.rs — replace sidecar with Axum**

Read current `src-tauri/src/main.rs`. Replace sidecar spawn logic:

1. Remove `mod sidecar;` and `SidecarState`
2. Add new modules: `mod server; mod db; mod error; mod redact; mod commands; mod routes;`
3. In `.setup()`:
   ```rust
   .setup(|app| {
       let handle = app.handle().clone();
       crate::secrets::load_env_vars(); // load secrets into env

       #[cfg(target_os = "linux")]
       {
           std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
           if std::env::var("WAYLAND_DISPLAY").is_ok() {
               std::env::set_var("GDK_BACKEND", "wayland");
           }
       }

       tauri::async_runtime::spawn(async move {
           if let Err(e) = crate::server::start(handle).await {
               tracing::error!("Server error: {}", e);
           }
       });

       Ok(())
   })
   ```
4. Add `commands::get_openclaw_dir` to `invoke_handler`
5. Remove `on_window_event` sidecar kill (Axum stops when Tauri stops)

- [ ] **Step 4: Update secrets.rs — add load_env_vars function**

The current `secrets.rs` has `load_env_vars()` that returns a HashMap. Add a version that sets env vars directly:
```rust
pub fn load_all(handle: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let vars = load_env_vars();
    for (key, value) in vars {
        std::env::set_var(&key, &value);
    }
    ensure_api_key();
    Ok(())
}
```

Read the existing `secrets.rs` to check the exact function signature. The `load_env_vars()` function already returns a HashMap — we just need to call it in setup and set each var.

**IMPORTANT:** The current `secrets.rs` KEY_ENV_MAP uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as env var names. Update these mappings to use non-prefixed names that both Axum and the frontend can use:
- `("supabase.url", "SUPABASE_URL")` — Axum reads this directly
- `("supabase.anon-key", "SUPABASE_ANON_KEY")` — Axum reads this directly
- Frontend uses `VITE_SUPABASE_URL` from `.env.local` (Vite prefix for browser access)
- Keep the service-role key as `SUPABASE_SERVICE_ROLE_KEY` (Axum only, never exposed to browser)

- [ ] **Step 5: Update tauri.conf.json**

```json
{
  "build": {
    "beforeDevCommand": "cd frontend && npm run dev",
    "beforeBuildCommand": "cd frontend && npm run build",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../frontend/dist"
  }
}
```

Remove `externalBin` (no more Node sidecar).
Update CSP:
- `connect-src`: add `http://localhost:5173 ws://localhost:5173` (Vite HMR uses WebSockets)
- `font-src`: ensure `https://fonts.gstatic.com` is allowed
- `style-src`: ensure `https://fonts.googleapis.com` is allowed

- [ ] **Step 6: Update capabilities/default.json**

Remove `shell:allow-execute` and `shell:allow-kill` if no other shell commands are needed.
Keep `core:default` and `notification:default`.

- [ ] **Step 7: Verify Axum starts with Tauri**

```bash
cd <project-root> && npm run tauri:dev
```

Expected: Tauri opens, Vite frontend loads on :5173, Axum responds on :3000 (`curl http://127.0.0.1:3000/api/health` returns `{"ok":true}`).

- [ ] **Step 8: Commit**

```bash
git add src-tauri/ frontend/
git commit -m "feat: axum server embedded in tauri"
```

---

## Chunk 4: Port Routes — Local I/O & OpenClaw

**Porting rules for ALL routes:**
1. Read the existing JS handler (`app/api/*/route.ts`) fully before writing Rust
2. Preserve exact response shape — the frontend expects it
3. Use `reqwest` for all outbound HTTP
4. Get secrets via `std::env::var("SECRET_NAME")`
5. Return `Result<Json<T>, AppError>`
6. Call `redact()` on strings from external APIs before returning

### Task 14: Port workspace routes

**Files:**
- Create: `src-tauri/src/routes/workspace.rs`
- Reference: `app/api/workspace/file/route.ts`, `app/api/workspace/files/route.ts`, `app/api/workspace/_lib.ts`

- [ ] **Step 1: Read the existing handlers**

Read all three files to understand:
- Path validation (symlink resolution, prefix check)
- Remote mode (OPENCLAW_API_URL proxying)
- File size limits (5MB)
- Response shapes

- [ ] **Step 2: Write workspace.rs**

Implement:
- `GET /files` → list core + memory files
- `GET /file?path=...` → read file (local or remote proxy)
- `POST /file` → write file (local or remote proxy)

Safety: validate paths with `std::fs::canonicalize()`, ensure within workspace dir.

- [ ] **Step 3: Register in routes/mod.rs**

```rust
pub mod workspace;
// in router():
.nest("/workspace", workspace::router())
```

- [ ] **Step 4: Test manually**

```bash
curl http://127.0.0.1:3000/api/workspace/files
curl "http://127.0.0.1:3000/api/workspace/file?path=SOUL.md"
```

---

### Task 15: Port chat routes

**Files:**
- Create: `src-tauri/src/routes/chat.rs`
- Reference: `app/api/chat/route.ts`, `app/api/chat/history/route.ts`, `app/api/chat/stream/route.ts`, `app/api/chat/image/route.ts`

- [ ] **Step 1: Read all 4 chat handlers**

Key complexity:
- `POST /chat`: WebSocket send to OpenClaw (challenge-response auth)
- `GET /chat/history`: Parse JSONL session file, extract user/assistant messages
- `GET /chat/stream`: SSE endpoint, poll session file every 1s for new messages
- `GET /chat/image?path=...`: Serve images from allowed directories

- [ ] **Step 2: Implement chat.rs**

For WebSocket client: use `tokio-tungstenite` (add to Cargo.toml).
For SSE: use `axum::response::Sse` with `async-stream`.
For JSONL parsing: use `serde_json` line-by-line.

- [ ] **Step 3: Register and test**

Test chat history loads correctly, SSE stream works, image serving works.

---

### Task 16: Port status/heartbeat/processes routes

**Files:**
- Create: `src-tauri/src/routes/status.rs` (extend existing)
- Reference: `app/api/status/route.ts`, `app/api/heartbeat/route.ts`, `app/api/processes/route.ts`

- [ ] **Step 1: Read existing handlers**

- `/api/status`: Read IDENTITY.md, extract Name/Emoji
- `/api/heartbeat`: Read HEARTBEAT.md mtime + task lines
- `/api/processes`: Run `ps aux`, match PIDs to registry, `top` for CPU/mem

- [ ] **Step 2: Extend status.rs with heartbeat + processes**

For process management: use `tokio::process::Command` to run `ps aux` and `top`.

- [ ] **Step 3: Test**

```bash
curl http://127.0.0.1:3000/api/status
curl http://127.0.0.1:3000/api/heartbeat
curl http://127.0.0.1:3000/api/processes
```

---

### Task 17: Port OpenClaw CLI routes

**Files:**
- Create: `src-tauri/src/routes/openclaw_cli.rs`
- Reference: `app/api/sessions/route.ts`, `app/api/subagents/route.ts`, `app/api/crons/route.ts`

- [ ] **Step 1: Read existing handlers**

All three shell out to `openclaw` CLI:
- `openclaw sessions list --json`
- `openclaw subagents list --json`
- `openclaw cron list --json`

- [ ] **Step 2: Write openclaw_cli.rs**

Use `tokio::process::Command` to run CLI commands. Parse JSON output. Return as-is.

- [ ] **Step 3: Register and test**

---

### Task 18: Port auth route

**Files:**
- Create: `src-tauri/src/routes/auth.rs`
- Reference: `app/api/auth/tauri-session/route.ts`

- [ ] **Step 1: Read handler**

OAuth code pickup — reads a one-time file with access/refresh tokens.

- [ ] **Step 2: Write auth.rs**

File I/O for token exchange. Return tokens to frontend.

- [ ] **Step 3: Commit all local I/O routes**

```bash
git add src-tauri/src/routes/
git commit -m "feat: port workspace/chat/status/processes/sessions/auth to axum"
```

---

## Chunk 5: Port Routes — External API Integrations

### Task 19: Port homelab routes

**Files:**
- Create: `src-tauri/src/routes/homelab.rs`
- Reference: `app/api/homelab/route.ts`, `app/api/proxmox/route.ts`, `app/api/opnsense/route.ts`

- [ ] **Step 1: Read existing handlers**

Key complexity:
- Proxmox: API token auth, TLS with custom CA, cluster/resources endpoint + per-node fallback
- OPNsense: API key/secret auth, diagnostic endpoints for CPU/mem/uptime/WAN
- Custom TLS: `HOMELAB_CA_CERT` env var for self-signed certs
- Falls back to mock data if not configured

- [ ] **Step 2: Write homelab.rs**

Use `reqwest::Client` with custom TLS config:
```rust
let client = reqwest::Client::builder()
    .danger_accept_invalid_certs(true) // or add custom CA
    .build()?;
```

Implement Proxmox token auth via headers, OPNsense via basic auth.

- [ ] **Step 3: Test with actual homelab**

```bash
curl http://127.0.0.1:3000/api/homelab
```

---

### Task 20: Port messages routes

**Files:**
- Create: `src-tauri/src/routes/messages.rs`
- Reference: `app/api/messages/route.ts`, `app/api/messages/avatar/route.ts`, `app/api/messages/link-preview/route.ts`, and all other message sub-routes

- [ ] **Step 1: Read ALL message handlers**

This is the most complex route group:
- `GET /messages`: List conversations with deduplication, reaction processing, service priority
- `POST /messages`: Send message via BlueBubbles
- `GET /messages/avatar`: Fetch contact avatar from BlueBubbles/Mac Bridge
- `POST /messages/avatar`: Batch check avatars
- `GET /messages/link-preview`: Extract OpenGraph metadata (SSRF protection)
- `GET /messages/attachment`, `/read`, `/react`, `/send-attachment`, `/stream`
- Helper: `_lib/bb.ts` with BlueBubbles/Mac Bridge config, phone normalization, contact caching

- [ ] **Step 2: Write messages.rs**

Port all sub-routes. Key considerations:
- Phone normalization: strip non-digits, handle 11-digit US numbers
- GUID validation for BlueBubbles entities
- Contact cache (use in-memory HashMap with TTL)
- SSRF protection for link-preview (block private IPs)
- Avatar TIFF→JPEG conversion (use `image` crate if needed, or skip conversion since BlueBubbles may return JPEG)

- [ ] **Step 3: Test with BlueBubbles**

---

### Task 21: Port calendar route

**Files:**
- Create: `src-tauri/src/routes/calendar.rs`
- Reference: `app/api/calendar/route.ts`

- [ ] **Step 1: Read handler**

CalDAV fetch using tsdav library. In Rust, use `reqwest` with PROPFIND/REPORT methods against the CalDAV server. Parse iCalendar response.

- [ ] **Step 2: Write calendar.rs**

Use `reqwest` for CalDAV PROPFIND/REPORT. Parse iCal format (regex or a Rust iCal crate like `ical`).

---

### Task 22: Port email route

**Files:**
- Create: `src-tauri/src/routes/email.rs`
- Reference: `app/api/email/route.ts`

- [ ] **Step 1: Read handler**

IMAP via ImapFlow. In Rust, use `async-imap` crate.

- [ ] **Step 2: Add async-imap to Cargo.toml**

```toml
async-imap = "0.9"
async-native-tls = "0.5"
```

- [ ] **Step 3: Write email.rs**

Connect to IMAP, fetch messages (folder, limit, mark read options).

---

### Task 23: Port media route

**Files:**
- Create: `src-tauri/src/routes/media.rs`
- Reference: `app/api/media/route.ts`

- [ ] **Step 1: Read handler**

Fetches from Plex, Sonarr, Radarr APIs:
- Plex: recently added, on deck
- Sonarr: calendar (upcoming episodes)
- Radarr: calendar (upcoming movies)

- [ ] **Step 2: Write media.rs**

All three are simple REST API calls with API key auth. Use `reqwest`.

- [ ] **Step 3: Commit external API routes**

```bash
git add src-tauri/src/routes/
git commit -m "feat: port homelab/messages/calendar/email/media to axum"
```

---

## Chunk 6: Port Routes — Pipeline, Search, Notifications

### Task 24: Port pipeline routes

**Files:**
- Create: `src-tauri/src/routes/pipeline.rs`
- Create: `src-tauri/src/log_parser.rs` (shared module for log parsing)
- Reference: `app/api/pipeline/spawn/route.ts`, `app/api/pipeline/complete/route.ts`, `app/api/pipeline-events/route.ts`, `lib/pipeline.ts`, `lib/logParser.ts`

This is the most complex module in the codebase (~320+ lines of logic in pipeline.ts alone). Break into sub-steps.

- [ ] **Step 1: Read ALL pipeline-related source files**

Must read fully before writing any Rust:
- `lib/pipeline.ts` — routing table, spawn command builder, process spawning, agent status management
- `lib/logParser.ts` — JSONL log parser, event extraction, weighted time distribution
- `app/api/pipeline/spawn/route.ts` — spawn handler
- `app/api/pipeline/complete/route.ts` — completion handler with retry/escalation

- [ ] **Step 2: Create Supabase REST client helper**

Create a helper in `src-tauri/src/supabase.rs` for calling Supabase REST API with the service-role key:
```rust
pub struct SupabaseClient {
    http: reqwest::Client,
    url: String,
    service_key: String,
}

impl SupabaseClient {
    pub fn from_env() -> anyhow::Result<Self> { ... }
    pub async fn select(&self, table: &str, query: &str) -> Result<Value> { ... }
    pub async fn insert(&self, table: &str, body: &Value) -> Result<Value> { ... }
    pub async fn update(&self, table: &str, query: &str, body: &Value) -> Result<Value> { ... }
}
```

This will be shared by pipeline, missions, agents, and other routes that need service-role access.

- [ ] **Step 3: Port agent routing table**

Hardcode the same routing table from `lib/pipeline.ts`:
- roman (Haiku): complexity 0-40
- sonnet: complexity 41-70
- jiraiya (Opus): complexity 71+
- gunther (Opus): code tasks
- codex (Haiku): reviewer

- [ ] **Step 4: Port spawn command builder**

Port `buildSpawnCommand()` — generates claude CLI invocation with:
- `--dangerously-skip-permissions`
- `--mcp-config`
- Auto-complete hook for mission completion
- Workdir validation (safe path, no traversal)

- [ ] **Step 5: Port process spawning**

Port `spawnAgentProcess()`:
- `tokio::process::Command` with `.spawn()` (detached)
- Clean environment (strip secrets except ANTHROPIC_API_KEY and MC_API_KEY)
- Registry file management (`/tmp/agent-registry.json`)
- Fire-and-forget notification

- [ ] **Step 6: Port pipeline complete handler**

Port the completion logic:
- Guards against double-completion (skip if done/approved/rejected)
- Failure handling: retry counter, escalation chain (roman → sonnet → jiraiya)
- Code tasks: auto-spawn Codex reviewer
- Non-code tasks: mark done immediately
- Log ingestion (fire-and-forget)

- [ ] **Step 7: Port log parser to Rust module**

Create `src-tauri/src/log_parser.rs` porting `lib/logParser.ts`:
- Parse stream-json JSONL format
- Event types: write, edit, bash, read, think, result, glob, grep, user
- Weighted time distribution across events
- Max 500 events per mission
- Call `redact()` on all parsed content

- [ ] **Step 8: Implement pipeline-events SSE endpoint**

`GET /api/pipeline-events` — SSE stream for pipeline status updates.

- [ ] **Step 9: Test pipeline spawn end-to-end**

---

### Task 25: Port mission-events route

**Files:**
- Create: `src-tauri/src/routes/missions.rs`
- Reference: `app/api/mission-events/route.ts`, `app/api/missions/route.ts`

- [ ] **Step 1: Read handlers**

Mission events ingestion: parse logs, redact, store in mission_events table.
Missions CRUD: Supabase operations with side effects on PATCH (notifications, log ingestion).

- [ ] **Step 2: Write missions.rs**

Port log parser integration. Use `redact()` on parsed content. Use `SupabaseClient` for CRUD.

- [ ] **Step 3: Handle PATCH side effects**

When mission status changes:
- Trigger notifications via notify route
- Auto-ingest logs when mission completes
- Fire complete hook

---

### Task 26: Port agents routes

**Files:**
- Create: `src-tauri/src/routes/agents.rs`
- Reference: `app/api/agents/route.ts`, `app/api/agents/active-coders/route.ts`

- [ ] **Step 1: Write agents.rs**

- `GET /agents`: query Supabase agents table
- `PATCH /agents`: update agent fields
- `GET /agents/active-coders`: `ps aux | grep claude`, parse output

---

### Task 27: Port notify route

**Files:**
- Create: `src-tauri/src/routes/notify.rs`
- Reference: `app/api/notify/route.ts`

- [ ] **Step 1: Write notify.rs**

POST to ntfy.sh with SSRF protection. Read ntfy config from Supabase prefs (cache 60s).

---

### Task 28: Port search route

**Files:**
- Create: `src-tauri/src/routes/search.rs`
- Reference: `app/api/search/route.ts`

- [ ] **Step 1: Read handler**

Aggregated search across todos, missions, calendar, email, reminders, knowledge. Uses `Promise.all()` for parallel fetches.

- [ ] **Step 2: Write search.rs**

Use `tokio::join!()` for parallel queries. Query Supabase directly via REST API for text search.

---

### Task 29: Port remaining misc routes

**Files:**
- Create: `src-tauri/src/routes/misc.rs`
- Create: `src-tauri/src/routes/reminders.rs`
- Create: `src-tauri/src/routes/habits.rs`
- Create: `src-tauri/src/routes/reviews.rs`
- Reference: various small route files

- [ ] **Step 1: Port misc routes**

- `GET /api/dns` - DNS query
- `GET /api/deploy` - External API
- `GET /api/dust` - Stale items (Supabase query, time-based filtering across 3 tables)
- `GET /api/stale` - Similar stale items query
- `GET /api/cache-refresh` - Cache refresh trigger
- `GET /api/cache-refresh-slow` - Background cache refresh
- `GET /api/memory` - Remote proxy OR local memory dir
- `GET /api/changelog` - Supabase query
- `POST /api/quick-capture` - Has API key check (`CAPTURE_API_KEY`), routes to multiple tables
- `GET/PATCH /api/decisions` - Decision log CRUD (uses service-role key)
- `GET/POST/PATCH/DELETE /api/workflow-notes` - Workflow notes CRUD (uses service-role key)
- `GET/PATCH /api/email-accounts` - Email account management (**stores passwords — never expose to browser**)
- `GET /api/link-preview?url=...` - OpenGraph extraction with SSRF protection

- [ ] **Step 2: Port reminders route**

`app/api/reminders/route.ts` — this calls the **Mac Bridge API** (external HTTP), NOT Supabase. Must be an Axum route.

- [ ] **Step 3: Port habits routes**

- `GET/POST/PATCH /api/habits` - Habits CRUD (uses service-role key)
- `GET/POST /api/habits/entries` - Habit check-in entries (uses service-role key)

- [ ] **Step 4: Port review routes**

- `GET/POST /api/daily-review?date=YYYY-MM-DD` - Upsert daily review (uses service-role key)
- `GET /api/weekly-review` - Weekly review query (uses service-role key)
- `GET /api/retrospectives` - Retrospective query (uses service-role key)

- [ ] **Step 5: Port missing sub-routes**

These were not in the original plan but exist in the codebase:
- `POST /api/mission-events/bjorn` - Ingests events from Bjorn agent specifically
- `POST /api/missions/sync-agents` - Syncs agent status by checking running processes
- `POST /api/pipeline/review` - Code review verdict handler
- `GET /api/subagents/active` - Active Claude process detection (uses `execSync`)

- [ ] **Step 6: Register all new routes in routes/mod.rs**

- [ ] **Step 7: Commit all remaining routes**

```bash
git add src-tauri/src/routes/
git commit -m "feat: port remaining routes (reminders, habits, reviews, misc) to axum"
```

---

## Chunk 7: Supabase Direct Access + Frontend Integration

### Task 30: Audit RLS policies before direct Supabase access

**Files:**
- Supabase SQL migrations (run in Supabase dashboard or via CLI)

**SECURITY REQUIREMENT:** Before any table is accessed directly from the browser using the anon key, it MUST have RLS policies that scope access to the authenticated user. Without this, data is either inaccessible (RLS enabled but no policies) or completely open (RLS disabled).

- [ ] **Step 1: Audit which tables need RLS**

Tables that will be accessed directly from React via supabase-js:
- `todos` — needs `user_id` column + RLS policy
- `capture_inbox` — needs `user_id` column + RLS policy
- `prefs` — spec already requires this (add `user_id`, enable RLS)
- `knowledge_entries` — needs `user_id` column + RLS policy
- `cache` — read-only, may not need user scoping

- [ ] **Step 2: Create RLS migration**

For each table, run in Supabase:
```sql
-- Example for todos (repeat pattern for each table)
ALTER TABLE todos ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users DEFAULT auth.uid();
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own their todos" ON todos FOR ALL USING (auth.uid() = user_id);
```

- [ ] **Step 3: Verify RLS works**

Test with the anon key that queries return only the authenticated user's data.

- [ ] **Step 4: Commit migration**

```bash
git commit -m "fix: add RLS policies for supabase-direct tables"
```

---

### Task 31: Create Supabase direct hooks

**Files:**
- Create: `frontend/src/hooks/useSupabaseQuery.ts`
- Modify: pages that use pure Supabase CRUD

**Architecture rule:** ONLY tables with verified RLS policies can be accessed directly from React. All others must go through Axum.

- [ ] **Step 1: Create useSupabaseQuery hook**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useSupabaseQuery<T>(
  key: string[],
  table: string,
  options?: {
    select?: string
    order?: { column: string; ascending?: boolean }
    filter?: Record<string, unknown>
  }
) {
  return useQuery<T[]>({
    queryKey: key,
    queryFn: async () => {
      let query = supabase.from(table).select(options?.select || '*')
      if (options?.order) {
        query = query.order(options.order.column, { ascending: options.order.ascending ?? false })
      }
      if (options?.filter) {
        for (const [col, val] of Object.entries(options.filter)) {
          query = query.eq(col, val)
        }
      }
      const { data, error } = await query
      if (error) throw error
      return data as T[]
    },
  })
}
```

- [ ] **Step 2: Update pages to use direct Supabase**

For each page that currently fetches from `/api/todos`, `/api/ideas`, etc.:
- Replace `fetch('/api/todos')` with `supabase.from('todos').select('*')`
- Wrap in React Query for caching

Example for Todos page:
```tsx
const { data: todos = [], isLoading } = useQuery({
  queryKey: ['todos'],
  queryFn: async () => {
    const { data, error } = await supabase.from('todos').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data
  }
})
```

Pages to update (ONLY tables with verified RLS from Task 30):
- Todos, Capture, Knowledge, Settings/Prefs

All other pages (Ideas, Reminders, Missions, Agents, Memory, Habits, Decisions, etc.) continue to fetch from Axum because their tables use service-role key or call external APIs.

- [ ] **Step 3: Set up Supabase realtime subscriptions**

For Dashboard page, port the existing Supabase realtime subscriptions (agents, missions, activity_log). These already use supabase-js — just ensure they work with the new Supabase client.

- [ ] **Step 4: Verify all pages fetch data correctly**

Check every page loads data — some via Supabase direct, some via Axum (http://127.0.0.1:3000/api/...).

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: supabase direct access for CRUD operations"
```

---

## Chunk 8: Cleanup, Polish & Testing

### Task 32: Remove Next.js

**Files:**
- Delete: `app/`, `scripts/openclaw-api.mjs`, `next.config.ts`, `proxy.ts`, `next-env.d.ts`, `postcss.config.mjs`
- Delete: `src-tauri/src/sidecar.rs`
- Modify: root `package.json`

- [ ] **Step 1: Remove Next.js files**

```bash
rm -rf app/ .next/
rm next.config.ts proxy.ts next-env.d.ts postcss.config.mjs
rm scripts/openclaw-api.mjs
rm src-tauri/src/sidecar.rs
```

- [ ] **Step 2: Update root package.json**

Remove `next` from dependencies. Update scripts:
```json
{
  "scripts": {
    "dev": "cd frontend && npm run dev",
    "build": "cd frontend && npm run build",
    "tauri": "tauri",
    "tauri:dev": "WEBKIT_DISABLE_DMABUF_RENDERER=1 tauri dev",
    "tauri:build": "tauri build"
  }
}
```

Remove dependencies no longer needed at root level (next, postcss, tailwindcss, imapflow, tsdav, icloudjs, ical.js, socket.io-client, etc.) — these are now either in `frontend/package.json` or ported to Rust.

- [ ] **Step 3: Verify clean build**

```bash
cd frontend && npm run build
cd ../src-tauri && cargo build --release
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove next.js and node sidecar"
```

---

### Task 33: Add missing loading skeletons

**Files:**
- Create: `frontend/src/pages/CaptureLoading.tsx`
- Create: `frontend/src/pages/ChatLoading.tsx`
- Create: `frontend/src/pages/IdeasLoading.tsx`
- Create: `frontend/src/pages/PersonalLoading.tsx`
- Create: `frontend/src/pages/SearchLoading.tsx`
- Create: `frontend/src/pages/SettingsLoading.tsx`

**Note:** In Vite + React Router, there's no automatic `loading.tsx` convention. These loading states should be used inline via React Query's `isLoading` state or React Suspense. Create loading components that can be used as fallbacks.

- [ ] **Step 1: Create loading skeletons**

Use the existing `Skeleton` + `SkeletonCard` components. Match each page's layout structure.

- [ ] **Step 2: Wire up loading states in pages**

Each page should show its skeleton while React Query data is loading:
```tsx
if (isLoading) return <ChatLoading />
```

---

### Task 34: Hyprland support

**Files:**
- Create: `src-tauri/assets/mission-control.desktop`
- Create: `docs/HYPRLAND.md`

- [ ] **Step 1: Create .desktop file**

```ini
[Desktop Entry]
Name=Mission Control
Comment=Personal AI OS
Exec=env GDK_BACKEND=wayland mission-control
Icon=mission-control
Type=Application
Categories=Utility;
StartupWMClass=mission-control
```

- [ ] **Step 2: Create HYPRLAND.md**

Document Hyprland config for scratchpad mode (as specified in the migration spec).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/assets/ docs/HYPRLAND.md
git commit -m "feat: hyprland support + .desktop file"
```

---

### Task 35: Test framework setup

**Files:**
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test-setup.ts`
- Create: `frontend/src/lib/__tests__/redact.test.ts`
- Create: `frontend/src/lib/__tests__/page-cache.test.ts`
- Create: `frontend/src/lib/__tests__/utils.test.ts`

- [ ] **Step 1: Install test dependencies**

```bash
cd frontend
npm install -D vitest @testing-library/react @testing-library/user-event jsdom
```

- [ ] **Step 2: Create vitest config**

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts']
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  }
})
```

- [ ] **Step 3: Write test-setup.ts**

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Write tests for redact.ts**

```ts
import { describe, it, expect } from 'vitest'
import { redactSecrets } from '../redact'

describe('redactSecrets', () => {
  it('redacts OpenAI-style API keys', () => {
    const input = 'key: sk-abcdefghijklmnopqrstuvwxyz1234567890'
    const result = redactSecrets(input)
    expect(result).not.toContain('abcdefghijklmnopqrstuvwxyz')
  })

  it('redacts JWT tokens', () => {
    const input = 'token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjg'
    const result = redactSecrets(input)
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiJ9')
  })

  it('redacts long hex strings', () => {
    const hex = 'a'.repeat(40)
    const result = redactSecrets(hex)
    expect(result).not.toContain(hex)
  })

  it('preserves normal text', () => {
    expect(redactSecrets('hello world')).toBe('hello world')
  })
})
```

- [ ] **Step 5: Write tests for page-cache.ts**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCached, setCache } from '../page-cache'

describe('page-cache', () => {
  beforeEach(() => {
    // Reset cache between tests by setting expired entries
  })

  it('returns null for missing keys', () => {
    expect(getCached('nonexistent')).toBeNull()
  })

  it('returns cached data within TTL', () => {
    setCache('test', { foo: 'bar' })
    expect(getCached('test')).toEqual({ foo: 'bar' })
  })

  it('returns null for expired entries', () => {
    setCache('test-expired', 'data')
    vi.advanceTimersByTime(6 * 60 * 1000) // past 5min TTL
    expect(getCached('test-expired')).toBeNull()
  })
})
```

- [ ] **Step 6: Write tests for utils.ts**

```ts
import { describe, it, expect } from 'vitest'
import { timeAgo, formatTime } from '../utils'

describe('timeAgo', () => {
  it('returns "Never" for null', () => {
    expect(timeAgo(null)).toBe('Never')
  })

  it('returns seconds ago for recent times', () => {
    const now = new Date(Date.now() - 30000).toISOString()
    expect(timeAgo(now)).toBe('30s ago')
  })

  it('returns minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    expect(timeAgo(fiveMinAgo)).toBe('5m ago')
  })
})

describe('formatTime', () => {
  it('returns dash for null', () => {
    expect(formatTime(null)).toBe('—')
  })

  it('formats ISO time to HH:MM', () => {
    const result = formatTime('2026-03-12T14:30:00Z')
    expect(result).toMatch(/\d{2}:\d{2}/)
  })
})
```

- [ ] **Step 7: Run vitest**

```bash
cd frontend && npx vitest run
```
Expected: All tests pass.

- [ ] **Step 8: Run Rust tests**

```bash
cd src-tauri && cargo test
```
Expected: `redact` tests pass.

- [ ] **Step 9: Commit**

```bash
git add frontend/ src-tauri/
git commit -m "test: vitest + rust unit tests"
```

---

### Task 36: Final verification

- [ ] **Step 1: Run full build**

```bash
cd frontend && npm run build
cd ../src-tauri && cargo build --release
```

- [ ] **Step 2: Check binary size**

```bash
ls -lh src-tauri/target/release/mission-control
```
Target: under 20MB.

- [ ] **Step 3: Cargo clippy**

```bash
cd src-tauri && cargo clippy -- -W warnings
```
Expected: zero warnings.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 5: Run all tests**

```bash
cd frontend && npx vitest run
cd ../src-tauri && cargo test
```

- [ ] **Step 6: Manual smoke test**

Launch `npm run tauri:dev` and verify:
1. All 22 pages load with correct data
2. Chat SSE streaming works
3. Supabase auth works (login, session persistence)
4. Secrets load from keychain on startup
5. SQLite DB initializes at correct path
6. Hyprland scratchpad mode works (focus pause/resume)

---

## Done Criteria

- [ ] Vite dev server runs on port 5173, all 22 routes work
- [ ] No Next.js dependency in package.json
- [ ] No Node.js sidecar — Axum handles all API routes
- [ ] All API routes ported (external APIs → Axum, verified CRUD → Supabase direct)
- [ ] RLS policies verified for all Supabase-direct tables (todos, capture, knowledge, prefs)
- [ ] `cargo build --release` produces a single binary under 20MB
- [ ] `cargo clippy` — zero warnings
- [ ] `tsc --noEmit` — zero errors
- [ ] All 22 pages load with correct data
- [ ] Chat SSE streaming works
- [ ] Supabase auth works (login, session persistence)
- [ ] Secrets still load from keychain on startup
- [ ] SQLite DB initializes at correct platform path
- [ ] Hyprland scratchpad mode works (focus pause/resume)
- [ ] Loading skeletons added for 6 missing pages
- [ ] Vitest passes
- [ ] Rust unit tests pass (`cargo test`)
