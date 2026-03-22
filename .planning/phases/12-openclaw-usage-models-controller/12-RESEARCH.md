# Phase 12: OpenClaw Usage + Models + Controller Page - Research

**Researched:** 2026-03-22
**Domain:** Frontend page architecture (React tab navigation, polling, data fetching) + Rust proxy routes
**Confidence:** HIGH

## Summary

Phase 12 unifies the existing separate Agents page (`/agents`) and CronJobs page (`/crons`) into a single OpenClaw controller page with five tabs: Agents, Crons, Usage, Models, and Tools. Three of these tabs (Usage, Models, Tools) require new backend proxy routes that forward to the OpenClaw gateway API and new frontend data fetching hooks. The Agents and Crons tabs already have fully implemented page components and hooks -- they just need to be embedded as tab content.

The codebase has a clear tab navigation pattern (Pipeline.tsx uses `useState<TabKey>` with conditional rendering) that the unified page should follow. Polling is handled via React Query's `refetchInterval` (30s is the standard for non-critical data). The app already has custom SVG chart primitives (LineChart, BarChart, StatCard) that can render usage data without adding any charting library. The OpenClaw gateway is an HTTP API on a remote VM that wraps LiteLLM and custom agent management -- it exposes `/usage`, `/models`, `/tools` endpoints that return JSON data.

**Primary recommendation:** Create an OpenClawPage.tsx at `/openclaw` using Pipeline.tsx's tab pattern, embed existing Agents and Crons content as tab children, add three new `gateway_forward()` proxy routes for usage/models/tools, and use `refetchInterval: 30_000` with React Query for polling. Build usage charts with the existing custom SVG primitives (StatCard, BarChart). Handle unknown API response shapes with flexible types and graceful empty states.

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MH-08 | Read-only usage dashboard (token counts, cost, model usage), model listing, tool registry, unified page shell with tab navigation | Tab pattern from Pipeline.tsx, proxy routes via gateway_forward(), StatCard/BarChart primitives for charts, refetchInterval polling |
| SH-01 | Agent memory browser -- view, edit, clear agent RAG memory context | Existing memory route at `/api/memory` + gateway proxy pattern; can be surfaced in agent detail panel or as sub-section |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x | UI framework | Already in use (package.json: ^19.2.4) |
| @tanstack/react-query | 5.x | Data fetching + polling | App standard for all data fetching |
| react-router-dom | 7.x | Page routing | App standard routing |
| @phosphor-icons/react | 2.x | Icons | App-wide icon library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| StatCard primitive | built-in | Single metric display (value + sparkline) | Usage tab: token counts, cost totals |
| BarChart primitive | built-in | Bar chart visualization (SVG) | Usage tab: model usage breakdown |
| LineChart primitive | built-in | Trend lines (SVG polyline) | Usage tab: usage over time |
| ProgressGauge primitive | built-in | Progress bars | Usage tab: budget progress if applicable |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom SVG charts (in-app) | recharts/nivo | Would add bundle size (~200KB+), app already has custom SVG primitives, CI bundle budget at 400KB/chunk |
| `refetchInterval` polling | setInterval + manual invalidation | refetchInterval is simpler, handles cleanup, already used by 20+ hooks |
| Separate routes (/agents, /crons, /openclaw) | Single route only | Keep old routes as redirects for backward compatibility |

**Installation:**
```bash
# No new packages needed -- everything is already installed
```

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
  pages/
    OpenClaw.tsx              # Unified page shell with tab navigation
    openclaw/                 # Tab content components (NEW directory)
      UsageTab.tsx            # Token counts, costs, model usage charts
      ModelsTab.tsx           # Available models list with configuration
      ToolsTab.tsx            # Tool registry display
      types.ts                # Shared types for usage/models/tools
  hooks/
    useOpenClawUsage.ts       # React Query hook for usage data
    useOpenClawModels.ts      # React Query hook for models data
    useOpenClawTools.ts       # React Query hook for tools data

src-tauri/src/routes/
  openclaw_data.rs            # NEW: usage, models, tools proxy routes
```

### Pattern 1: Tab Navigation (Pipeline.tsx pattern)
**What:** `useState<TabKey>` controlling which tab content renders, with a styled pill-tab bar
**When to use:** Always for multi-tab pages in this app
**Example:**
```typescript
// Source: frontend/src/pages/Pipeline.tsx (lines 10-58)
type TabKey = 'agents' | 'crons' | 'usage' | 'models' | 'tools'

const tabs: { key: TabKey; label: string }[] = [
  { key: 'agents', label: 'Agents' },
  { key: 'crons', label: 'Crons' },
  { key: 'usage', label: 'Usage' },
  { key: 'models', label: 'Models' },
  { key: 'tools', label: 'Tools' },
]

// Tab bar uses the same pill-style bg as Pipeline:
// background: 'var(--bg-white-03)', borderRadius: '10px', padding: '3px'
// Active tab: background: 'var(--purple-a15)', color: 'var(--accent-bright)'
// Inactive tab: background: 'transparent', color: 'var(--text-muted)'
// Transition: 'all 0.15s var(--ease-spring)'
```

### Pattern 2: Polling via refetchInterval
**What:** React Query `refetchInterval` for periodic data refresh
**When to use:** For all read-only dashboard data on this page
**Example:**
```typescript
// Source pattern: multiple hooks in lib/hooks/dashboard/
const { data } = useQuery({
  queryKey: queryKeys.openclawUsage,
  queryFn: () => api.get('/api/openclaw/usage'),
  refetchInterval: 30_000,   // 30s minimum per success criteria
  staleTime: 30_000,
})
```

React Query handles visibility-aware pausing through `refetchOnWindowFocus` (enabled globally in main.tsx). The `refetchInterval` stops when the browser tab is hidden by default. Page-level activation is naturally handled by conditional tab rendering -- unmounted tabs stop polling because their components unmount and React Query's `refetchInterval` stops.

### Pattern 3: Gateway Forward for Proxy Routes
**What:** All OpenClaw API access through `gateway_forward()` helper with credential protection
**When to use:** For every new OpenClaw API endpoint
**Example:**
```rust
// Source: src-tauri/src/routes/gateway.rs + crons.rs pattern
async fn get_usage(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let result = gateway_forward(&state, Method::GET, "/usage", None).await?;
    Ok(Json(result))
}
```

### Pattern 4: Full-Bleed Page Layout
**What:** The outer page shell uses `position: absolute; inset: 0; margin: '-20px -28px'` to fill the main area
**When to use:** Required for this page because the Agents tab uses split-pane full-bleed layout
**Key detail:** The OpenClawPage.tsx wrapper is the full-bleed container. Tab content fills within it.

```typescript
// Source: frontend/src/pages/Agents.tsx (line 92-93)
<div style={{
  position: 'absolute', inset: 0,
  margin: '-20px -28px',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
}}>
```

### Pattern 5: Embedding Existing Page Content as Tabs
**What:** The Agents and Crons pages already exist as full components. To embed them as tabs, extract their content into wrapper components that adapt the layout.
**Key consideration:** AgentsPage currently uses `position: absolute; inset: 0; margin: '-20px -28px'` for full-bleed. When embedded as a tab, it needs to use `height: 100%; display: flex` instead since the parent OpenClawPage.tsx is the full-bleed container.

Two approaches:
1. **Refactor the existing pages** to accept a `embedded` prop that changes the layout from absolute to flex
2. **Create thin wrapper components** (AgentsTabContent, CronsTabContent) that import the existing hooks and sub-components but with adapted layout

Approach 2 is safer because it does not modify the existing working pages.

### Anti-Patterns to Avoid
- **Separate routes for each tab:** Do NOT create /openclaw/agents, /openclaw/crons, etc. as separate React Router routes. Use tab state within one route component at `/openclaw`.
- **Custom polling with setInterval:** Use React Query's `refetchInterval` instead -- it handles cleanup, error backoff, and visibility pausing automatically.
- **Inline fetch calls:** Always use the `api` wrapper from `@/lib/api` -- never use raw `fetch` in frontend components.
- **Importing chart libraries:** The app has custom SVG charts (StatCard, BarChart, LineChart). Do NOT add recharts, nivo, or any external charting library. CI bundle budget is 400KB per chunk.
- **Mounting all tabs simultaneously:** Use conditional rendering (`{tab === 'usage' && <UsageTab />}`) not `display: none`. Unmounted tabs naturally stop polling.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token/cost charts | Custom SVG from scratch | StatCard + BarChart primitives | Already built, tested, themed, accessible |
| Data polling | setInterval + state | React Query refetchInterval | Handles cleanup, error retry, visibility pause |
| API proxying | Direct HTTP calls from frontend | gateway_forward() in Rust | Credential protection, error sanitization, SSRF safety |
| Loading states | Custom spinners | `<SkeletonList>` / `<SkeletonRows>` | Consistent app-wide skeleton pattern |
| Tab navigation | React Router nested routes | useState + conditional render | Matches Pipeline.tsx pattern, simpler for local tab state |
| Page header | Custom heading | `<PageHeader>` component | Editable titles, consistent styling across 16+ pages |
| Empty states | Inline "no data" text | `<EmptyState>` component | Consistent icon + title + description pattern |
| Confirmation dialogs | Custom modal logic | createPortal + useFocusTrap + useEscapeKey | Pattern used in CronJobs.tsx, Agents delete |

**Key insight:** The unified page consolidates existing functionality (Agents, Crons) with new read-only dashboards (Usage, Models, Tools). The existing components are complete and should be embedded directly, not rebuilt.

## Common Pitfalls

### Pitfall 1: Breaking Existing Routes
**What goes wrong:** Removing `/agents` and `/crons` routes breaks bookmarks, sidebar links, and any hardcoded references
**Why it happens:** Overzealous cleanup when consolidating into `/openclaw`
**How to avoid:** Keep `/agents` and `/crons` routes in main.tsx as `<Navigate to="/openclaw" replace />` redirects. Update nav-items.ts and modules.ts to point to `/openclaw`.
**Warning signs:** 404 errors after navigation, broken sidebar links

### Pitfall 2: Agents Tab Full-Bleed Layout Conflict
**What goes wrong:** The Agents page uses `position: absolute; inset: 0; margin: '-20px -28px'` for full-bleed layout. When embedded as a tab within a parent page, this breaks because the parent container has different dimensions.
**Why it happens:** The Agents page was designed as a standalone full-bleed page
**How to avoid:** Create an `AgentsTabContent` wrapper that uses `height: 100%; display: flex` within the tab container instead of absolute positioning with negative margins. The outer OpenClawPage.tsx should be the full-bleed component. Re-use existing sub-components (AgentList, AgentDetailPanel) without modifying them.
**Warning signs:** Agents tab overflows or appears mispositioned within the tab container

### Pitfall 3: Polling All Tabs Simultaneously
**What goes wrong:** All five tabs poll their APIs even when only one is visible, wasting bandwidth and server resources
**Why it happens:** All tab components are mounted simultaneously
**How to avoid:** Use conditional rendering (`{tab === 'usage' && <UsageTab />}`) not `display: none`. This unmounts inactive tabs and stops their polling.
**Warning signs:** Network tab shows requests for inactive tab data

### Pitfall 4: Query Key Collisions
**What goes wrong:** New query keys conflict with existing ones or each other
**Why it happens:** Ad-hoc key strings instead of centralized keys
**How to avoid:** Add all new keys to `lib/query-keys.ts`. Use namespaced keys like `['openclaw', 'usage']`, `['openclaw', 'models']`, `['openclaw', 'tools']`.
**Warning signs:** Stale data, unexpected cache invalidation

### Pitfall 5: OpenClaw API Not Configured
**What goes wrong:** Usage/Models/Tools tabs show errors when OpenClaw is not configured
**Why it happens:** Not handling the "not_configured" state from the health check
**How to avoid:** Check OpenClaw health status and show a friendly "Configure OpenClaw in Settings > Connections" message with a link. The gateway already returns `{ "ok": false, "status": "not_configured" }`.
**Warning signs:** Red error states instead of helpful configuration instructions

### Pitfall 6: Route Registration in Rust
**What goes wrong:** New Axum routes silently fail to register
**Why it happens:** Handler return type mismatch (`Result<Response, AppError>` vs `Result<Json<Value>, AppError>`)
**How to avoid:** Use `Result<Json<Value>, AppError>` for all handlers (matching the pattern in crons.rs, gateway.rs), test with curl immediately after adding. Add the router to `routes/mod.rs` with `.merge(openclaw_data::router())`.
**Warning signs:** 404 on new endpoints despite successful compilation

### Pitfall 7: Crons Tab Height Overflow
**What goes wrong:** CronsPage is not designed as full-bleed -- it uses normal padding + scrolling. When embedded in a full-bleed tab container, it may overflow.
**Why it happens:** CronsPage layout uses `height: '100%'` on its outer div and flexbox layout
**How to avoid:** Create a `CronsTabContent` wrapper with `overflow-y: auto; padding: 20px` to let it scroll within the tab area.
**Warning signs:** Cron content overflows the tab container boundary

## Code Examples

Verified patterns from source code inspection:

### Tab Navigation Shell (OpenClawPage.tsx)
```typescript
// Based on: frontend/src/pages/Pipeline.tsx (lines 10-58)
import { useState, lazy, Suspense } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Lazy-load new tab content (Agents/Crons already loaded by hooks)
const UsageTab = lazy(() => import('./openclaw/UsageTab'))
const ModelsTab = lazy(() => import('./openclaw/ModelsTab'))
const ToolsTab = lazy(() => import('./openclaw/ToolsTab'))

type TabKey = 'agents' | 'crons' | 'usage' | 'models' | 'tools'

const tabs: { key: TabKey; label: string }[] = [
  { key: 'agents', label: 'Agents' },
  { key: 'crons', label: 'Crons' },
  { key: 'usage', label: 'Usage' },
  { key: 'models', label: 'Models' },
  { key: 'tools', label: 'Tools' },
]

export default function OpenClawPage() {
  const [tab, setTab] = useState<TabKey>('agents')

  // Health check -- shared across all tabs
  const { data: healthData } = useQuery({
    queryKey: ['openclaw', 'health'],
    queryFn: () => api.get<{ ok: boolean; status: string }>('/api/openclaw/health'),
    staleTime: 30_000,
  })
  const healthy = healthData?.ok ?? false

  return (
    <div style={{
      position: 'absolute', inset: 0,
      margin: '-20px -28px',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header + tabs */}
      <div style={{
        padding: '16px 20px',
        flexShrink: 0,
        borderBottom: '1px solid var(--border)',
      }}>
        <PageHeader defaultTitle="OpenClaw" defaultSubtitle="agent management + usage + tools" />
        <div style={{
          display: 'flex', gap: '2px', marginTop: '16px',
          background: 'var(--bg-white-03)', borderRadius: '10px',
          padding: '3px', width: 'fit-content',
        }}>
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '6px 14px',
              background: tab === t.key ? 'var(--purple-a15)' : 'transparent',
              border: 'none', borderRadius: '8px',
              color: tab === t.key ? 'var(--accent-bright)' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: '12px',
              fontWeight: tab === t.key ? 600 : 450,
              transition: 'all 0.15s var(--ease-spring)',
            }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {tab === 'agents' && <AgentsTabContent />}
        {tab === 'crons' && <CronsTabContent />}
        {tab === 'usage' && (
          <Suspense fallback={<SectionFallback />}>
            <UsageTab healthy={healthy} />
          </Suspense>
        )}
        {tab === 'models' && (
          <Suspense fallback={<SectionFallback />}>
            <ModelsTab healthy={healthy} />
          </Suspense>
        )}
        {tab === 'tools' && (
          <Suspense fallback={<SectionFallback />}>
            <ToolsTab healthy={healthy} />
          </Suspense>
        )}
      </div>
    </div>
  )
}
```

### Rust Proxy Routes (openclaw_data.rs)
```rust
// Source pattern: src-tauri/src/routes/crons.rs + gateway.rs
use axum::{extract::State, routing::get, Json, Router};
use reqwest::Method;
use serde_json::Value;
use crate::error::AppError;
use crate::server::{AppState, RequireAuth};
use super::gateway::gateway_forward;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/openclaw/usage", get(get_usage))
        .route("/openclaw/models", get(get_models))
        .route("/openclaw/tools", get(get_tools))
}

async fn get_usage(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let result = gateway_forward(&state, Method::GET, "/usage", None).await?;
    Ok(Json(result))
}

async fn get_models(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    // Note: /v1/models is the LiteLLM-compatible path
    // The OpenClaw gateway may also expose /models
    let result = gateway_forward(&state, Method::GET, "/models", None).await?;
    Ok(Json(result))
}

async fn get_tools(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let result = gateway_forward(&state, Method::GET, "/tools", None).await?;
    Ok(Json(result))
}
```

### React Query Hook with Polling
```typescript
// Pattern from: frontend/src/hooks/useAgents.ts + useCrons.ts
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

export function useOpenClawUsage() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.openclawUsage,
    queryFn: () => api.get('/api/openclaw/usage'),
    refetchInterval: 30_000,
    staleTime: 30_000,
  })
  return { usage: data, loading: isLoading, error }
}
```

### Embedding Agents as Tab (AgentsTabContent pattern)
```typescript
// Re-use existing sub-components with adapted layout
import { useAgents } from '@/hooks/useAgents'
import { AgentList } from './agents/AgentList'
import { AgentDetailPanel } from './agents/AgentDetailPanel'

function AgentsTabContent() {
  // Same hooks and logic as Agents.tsx, but layout uses
  // height: '100%' + display: 'flex' instead of position: absolute
  const { agents, loading, ... } = useAgents()

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      overflow: 'hidden',
    }}>
      {/* Left panel: agent list */}
      <div style={{ width: listWidth, minWidth: listWidth, ... }}>
        <AgentList ... />
      </div>
      {/* Resize handle */}
      {/* Right panel: detail */}
    </div>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate /agents and /crons pages | Unified /openclaw with tabs | Phase 12 | Single entry point for all OpenClaw management |
| No usage/models/tools visibility | Gateway proxy routes + read-only dashboard | Phase 12 | Users can monitor API usage and available models |
| Direct OpenClaw API calls | gateway_forward() proxy | Phase 9 | Credential protection, error sanitization |
| No charting library | Custom SVG primitives (StatCard, BarChart, LineChart) | v1.0 Phase 6 | Zero external dependency, themed, accessible |

## Existing Infrastructure to Reuse

### Already Complete (from Phases 9, 10, 11)
1. **`gateway_forward()`** -- proxy helper with credential protection and error sanitization (gateway.rs, lines 111-164)
2. **`AgentsPage` + sub-components** -- full CRUD with optimistic updates, split-pane layout, detail panel (pages/agents/)
3. **`useAgents` hook** -- React Query CRUD mutations with optimistic updates (hooks/useAgents.ts)
4. **`CronsPage` + sub-components** -- full CRUD with calendar view, form modal, job list (pages/crons/)
5. **`useCrons` hook** -- React Query CRUD mutations with optimistic updates (hooks/useCrons.ts)
6. **`/api/openclaw/health`** -- health check endpoint already wired (gateway.rs)
7. **Chat models route** -- `/api/chat/models` already fetches models from OpenClaw API (chat.rs, line 1299)
8. **SVG chart primitives** -- StatCard, BarChart, LineChart, ProgressGauge (components/primitives/)

### Key Integration Points
- **main.tsx** -- add lazy import for OpenClawPage, add route at `/openclaw`, add `<Navigate>` redirects for `/agents` and `/crons`
- **nav-items.ts** -- update agentDashboardItems: replace `/agents` and `/crons` entries with a single `/openclaw` entry (or keep them pointing to the new route)
- **modules.ts** -- add `openclaw` module entry; decide whether to keep or remove `agents` and `crons` module IDs
- **query-keys.ts** -- add `openclawUsage`, `openclawModels`, `openclawTools` keys
- **routes/mod.rs** -- add `pub mod openclaw_data;` and `.merge(openclaw_data::router())` to the router builder

### OpenClaw Gateway API Endpoints
The OpenClaw gateway is an HTTP API at `OPENCLAW_API_URL`. Based on the ARCHITECTURE.md research and existing usage patterns:

**Already proxied:**
- `GET /agents` -- list agents (agents.rs)
- `POST /agents` -- create agent (agents.rs)
- `PATCH /agents` -- update agent (agents.rs)
- `DELETE /agents` -- delete agent (agents.rs)
- `POST /agents/action` -- lifecycle control (agents.rs)
- `POST /crons`, `PUT /crons/{id}`, `DELETE /crons/{id}` -- cron CRUD (crons.rs)
- `GET /health` -- health check (gateway.rs)
- `GET /chat/models` -- model list for chat (chat.rs)

**NEW - needs proxying:**
- `GET /usage` -- token counts, cost, model usage breakdown
- `GET /models` -- available models with configuration details (different from `/chat/models` which returns a simplified list)
- `GET /tools` -- tool registry listing

**LiteLLM-compatible endpoints (may also be available):**
- `GET /v1/models` -- OpenAI-compatible model listing
- `GET /model/info` -- detailed model info including pricing, max tokens, provider
- `GET /spend/logs` -- transaction-level spend logs with date filtering
- `GET /user/daily/activity` -- daily usage breakdown by model/provider

### Response Shape Strategy

The exact JSON shapes from `/usage`, `/models`, `/tools` depend on the OpenClaw gateway implementation (which wraps LiteLLM). The frontend MUST handle graceful degradation:

**For Usage data (likely shape based on LiteLLM patterns):**
```typescript
interface UsageData {
  total_tokens?: number
  prompt_tokens?: number
  completion_tokens?: number
  total_cost?: number
  models?: Array<{
    model: string
    tokens: number
    cost: number
    requests: number
  }>
  daily?: Array<{
    date: string
    tokens: number
    cost: number
  }>
}
```

**For Models data (likely shape based on LiteLLM /model/info):**
```typescript
interface ModelInfo {
  id: string
  model_name?: string
  litellm_params?: {
    model: string
    api_key?: string  // redacted server-side
    api_base?: string // redacted server-side
  }
  model_info?: {
    max_tokens?: number
    max_input_tokens?: number
    max_output_tokens?: number
    input_cost_per_token?: number
    output_cost_per_token?: number
    litellm_provider?: string
  }
}
```

**For Tools data (custom OpenClaw shape):**
```typescript
interface ToolInfo {
  name: string
  description?: string
  enabled?: boolean
  parameters?: Record<string, unknown>
}
```

**All types should use optional fields** and the frontend should display whatever is present with "N/A" or "No data" for missing fields.

## Open Questions

1. **Exact API response shapes for /usage, /models, /tools**
   - What we know: The gateway API exists and gateway_forward() can proxy to any path. LiteLLM has documented endpoints for spend/logs, model/info, user/daily/activity.
   - What's unclear: Whether the OpenClaw gateway wraps these directly or transforms them
   - Recommendation: Build flexible frontend types with all fields optional. Display whatever comes back. Fall back to LiteLLM endpoints (`/v1/models`, `/spend/logs`) if the OpenClaw-specific ones return errors.

2. **Memory browser (SH-01) scope**
   - What we know: Phase 12 includes SH-01 (Agent Memory Browser). An existing `/api/memory` route serves workspace memory files. The OpenClaw gateway likely exposes agent RAG memory via a different endpoint.
   - What's unclear: Whether this means the agent RAG memory on the OpenClaw VM (accessed via gateway) or the local workspace memory files
   - Recommendation: Add a gateway proxy for `GET /agents/{id}/memory` to fetch agent-specific RAG context. Surface it as a section in the agent detail panel (AgentDetailPanel.tsx) or as a sub-tab of the Agents tab.

3. **Should /agents and /crons module IDs be kept?**
   - What we know: Both exist in modules.ts and nav-items.ts. The sidebar configuration system allows users to customize module order and visibility.
   - What's unclear: Whether users have customized their sidebar to rely on these specific module IDs
   - Recommendation: Add a new `openclaw` module entry. Keep `agents` and `crons` module IDs in the array but point them to `/openclaw` route. This preserves any user sidebar customizations.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.x (jsdom environment) |
| Config file | `frontend/vitest.config.ts` |
| Quick run command | `cd frontend && npx vitest run --reporter=verbose` |
| Full suite command | `cd frontend && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MH-08-a | Tab navigation renders 5 tabs with correct labels | unit | `cd frontend && npx vitest run src/pages/openclaw/__tests__/OpenClawPage.test.tsx -x` | No - Wave 0 |
| MH-08-b | Usage/models/tools types are structurally valid | unit | `cd frontend && npx vitest run src/pages/openclaw/__tests__/types.test.ts -x` | No - Wave 0 |
| MH-08-c | New query keys are unique and namespaced | unit | `cd frontend && npx vitest run src/lib/__tests__/query-keys.test.ts -x` | Exists but needs update |
| MH-08-d | Rust usage/models/tools routes compile and deserialize | unit | `cd src-tauri && cargo test routes::openclaw_data` | No - Wave 0 |
| MH-08-e | Polling interval is >= 30s (refetchInterval check) | unit | `cd frontend && npx vitest run src/hooks/__tests__/useOpenClawUsage.test.ts -x` | No - Wave 0 |
| SH-01 | Agent memory browser shows entries | manual-only | Manual -- requires running OpenClaw gateway | N/A |

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd frontend && npx vitest run && cd ../src-tauri && cargo test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/pages/openclaw/__tests__/types.test.ts` -- covers MH-08 types
- [ ] `frontend/src/pages/openclaw/__tests__/OpenClawPage.test.tsx` -- tab rendering
- [ ] `src-tauri/src/routes/openclaw_data.rs` -- route handler unit tests (compile + deserialization)

## Sources

### Primary (HIGH confidence)
- **Codebase direct inspection** -- all architecture patterns observed from actual source code
- `frontend/src/pages/Pipeline.tsx` -- tab navigation pattern (lines 1-61)
- `frontend/src/pages/Agents.tsx` -- full-bleed split-pane pattern (lines 91-149)
- `frontend/src/pages/CronJobs.tsx` -- cron page with calendar view (lines 1-187)
- `frontend/src/hooks/useAgents.ts` -- React Query CRUD hook pattern (lines 1-120)
- `frontend/src/hooks/useCrons.ts` -- React Query CRUD hook pattern (lines 1-109)
- `src-tauri/src/routes/gateway.rs` -- gateway_forward() proxy implementation (lines 98-164)
- `src-tauri/src/routes/crons.rs` -- gateway proxy route pattern (lines 1-93)
- `src-tauri/src/routes/chat.rs` -- get_models handler pattern (lines 1168-1206)
- `frontend/src/main.tsx` -- route registration pattern (lines 278-306)
- `frontend/src/lib/modules.ts` -- module registration (lines 1-69)
- `frontend/src/lib/nav-items.ts` -- sidebar navigation items (lines 1-43)
- `frontend/src/lib/query-keys.ts` -- centralized query keys (lines 1-35)
- `frontend/src/components/primitives/StatCard.tsx` -- stat display component
- `frontend/src/components/primitives/BarChart.tsx` -- bar chart SVG component
- `frontend/src/components/primitives/LineChart.tsx` -- line chart SVG component
- `frontend/src/pages/dashboard/useDashboardData.ts` -- visibility-aware polling pattern (lines 110-144)
- `src-tauri/src/routes/mod.rs` -- route registration in Axum (lines 47-90)
- `.planning/research/ARCHITECTURE.md` -- confirms gateway has /usage, /models, /tools endpoints (lines 296, 313-315, 340-343)

### Secondary (MEDIUM confidence)
- [LiteLLM Spend Tracking docs](https://docs.litellm.ai/docs/proxy/cost_tracking) -- `/spend/logs`, `/user/daily/activity` endpoint shapes
- [LiteLLM Model Management docs](https://docs.litellm.ai/docs/proxy/model_management) -- `/model/info`, `/v1/models` endpoint shapes
- OpenClaw gateway API endpoints (`/usage`, `/models`, `/tools`) -- confirmed in ARCHITECTURE.md but exact response shapes unknown

### Tertiary (LOW confidence)
- Exact JSON response shapes from OpenClaw `/usage`, `/models`, `/tools` -- inferred from LiteLLM patterns but depend on OpenClaw gateway implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, no new dependencies needed
- Architecture: HIGH - all patterns directly observed in the codebase (Pipeline tabs, gateway proxy, React Query polling)
- Pitfalls: HIGH - identified from actual code (full-bleed layout conflicts, route registration gotchas documented in CLAUDE.md)
- OpenClaw API shapes: LOW - the exact response format from /usage, /models, /tools depends on the remote gateway; flexible types with optional fields mitigate this risk

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable -- no external dependencies, all patterns from this codebase)
