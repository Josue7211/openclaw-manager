# Phase 12: OpenClaw Usage + Models + Controller Page - Research

**Researched:** 2026-03-22
**Domain:** Frontend page architecture (React tab navigation, polling, data fetching) + Rust proxy routes
**Confidence:** HIGH

## Summary

Phase 12 unifies the existing separate Agents page (`/agents`) and CronJobs page (`/crons`) into a single OpenClaw controller page with five tabs: Agents, Crons, Usage, Models, and Tools. Three of these tabs (Usage, Models, Tools) require new backend proxy routes that forward to the OpenClaw gateway API and new frontend data fetching hooks. The Agents and Crons tabs already have fully implemented page components and hooks -- they just need to be embedded as tab content.

The codebase has a clear tab navigation pattern (Pipeline.tsx uses `useState<TabKey>` with conditional rendering) that the unified page should follow. Polling is handled via React Query's `refetchInterval` throughout the app (30s is the standard for non-critical data). The app already has custom SVG chart primitives (LineChart, BarChart, StatCard) that can be used for the Usage dashboard without adding any charting library.

**Primary recommendation:** Create an OpenClawPage.tsx at `/openclaw` using Pipeline.tsx's tab pattern, embed existing AgentsPage and CronsPage content as tab children, add three new `gateway_forward()` proxy routes for usage/models/tools, and use `refetchInterval: 30_000` with React Query for polling.

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MH-08 | Read-only usage dashboard (token counts, cost, model usage), model listing, tool registry, unified page shell with tab navigation | Tab pattern from Pipeline.tsx, proxy routes via gateway_forward(), StatCard/BarChart primitives for charts, refetchInterval polling |
| SH-01 | Agent memory browser -- view, edit, clear agent RAG memory context | Existing memory route at `/api/memory`, can be surfaced in agent detail or as sub-tab |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18 | UI framework | Already in use |
| @tanstack/react-query | (installed) | Data fetching + polling | App standard for all data fetching |
| react-router-dom | (installed) | Page routing | App standard routing |
| @phosphor-icons/react | (installed) | Icons | App-wide icon library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| StatCard primitive | built-in | Single metric display | Usage tab: token counts, cost |
| BarChart primitive | built-in | Bar chart visualization | Usage tab: model usage breakdown |
| LineChart primitive | built-in | Trend lines | Usage tab: usage over time (if data available) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom SVG charts (in-app) | recharts/nivo | Would add bundle size, app already has custom SVG primitives |
| `refetchInterval` polling | setInterval + manual invalidation | refetchInterval is simpler, handles cleanup, already used by 20+ hooks |
| Separate routes (/agents, /crons, /openclaw) | Single route only | Keep old routes as redirects for backward compatibility |

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
**What:** `useState<TabKey>` controlling which tab content renders, with a styled tab bar
**When to use:** Always for multi-tab pages in this app
**Example:**
```typescript
// Source: frontend/src/pages/Pipeline.tsx
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
```

### Pattern 2: Polling via refetchInterval
**What:** React Query `refetchInterval` for periodic data refresh, only when page is active
**When to use:** For all read-only dashboard data
**Example:**
```typescript
// Source: multiple hooks in lib/hooks/dashboard/
const { data } = useQuery({
  queryKey: ['openclaw', 'usage'],
  queryFn: () => api.get('/api/openclaw/usage'),
  refetchInterval: 30_000,   // 30s minimum as per success criteria
  staleTime: 30_000,
})
```

Note: React Query already handles visibility-aware pausing through `refetchOnWindowFocus` (enabled globally in `main.tsx`). The `refetchInterval` stops when the browser tab is hidden by default. For page-level activation (not just window focus), the `enabled` option can be combined with a `useLocation` check or simply rely on component mounting/unmounting (tabs render conditionally so unmounted tabs naturally stop polling).

### Pattern 3: Gateway Forward for Proxy Routes
**What:** All OpenClaw API access through `gateway_forward()` helper
**When to use:** For every OpenClaw API endpoint
**Example:**
```rust
// Source: src-tauri/src/routes/gateway.rs
let result = gateway_forward(&state, Method::GET, "/usage", None).await?;
Ok(Json(result))
```

### Pattern 4: Full-Bleed Page Layout
**What:** Agents page uses `position: absolute; inset: 0; margin: '-20px -28px'` for full-bleed
**When to use:** When the page needs to fill the entire main area (like Settings, Messages, Agents)
**Consideration:** The unified OpenClaw page should be full-bleed since the Agents tab already uses full-bleed layout. The page shell manages its own scrolling.

### Anti-Patterns to Avoid
- **Separate routes for each tab:** Do NOT create /openclaw/agents, /openclaw/crons, etc. as separate routes. Use tab state within one route component at `/openclaw`.
- **Custom polling with setInterval:** Use React Query's `refetchInterval` instead -- it handles cleanup, error backoff, and visibility pausing automatically.
- **Inline fetch calls:** Always use the `api` wrapper from `@/lib/api` -- never use raw `fetch` in frontend components.
- **Importing chart libraries:** The app has custom SVG charts (StatCard, BarChart, LineChart). Do NOT add recharts, nivo, or any external charting library.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token/cost charts | Custom SVG from scratch | StatCard + BarChart primitives | Already built, tested, themed, accessible |
| Data polling | setInterval + state | React Query refetchInterval | Handles cleanup, error retry, visibility pause |
| API proxying | Direct HTTP calls from frontend | gateway_forward() in Rust | Credential protection, error sanitization, SSRF safety |
| Loading states | Custom spinners | `<SkeletonList>` / `<GenericPageSkeleton>` | Consistent app-wide skeleton pattern |
| Tab navigation | React Router nested routes | useState + conditional render | Matches Pipeline.tsx pattern, simpler for local tab state |

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
**How to avoid:** Refactor the agents tab content to use `height: 100%; display: flex` within the tab container instead of absolute positioning with negative margins. The outer OpenClawPage.tsx should be the full-bleed component.
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
**How to avoid:** Check OpenClaw health status and show a friendly "Configure OpenClaw in Settings > Connections" message. The gateway already returns `{ "ok": false, "status": "not_configured" }`.
**Warning signs:** Red error states instead of helpful configuration instructions

### Pitfall 6: Route Registration in Rust
**What goes wrong:** New Axum routes silently fail to register
**Why it happens:** Handler return type mismatch (`Result<Response, AppError>` vs `Result<Json<Value>, AppError>`)
**How to avoid:** Use `Result<Json<Value>, AppError>` for all handlers, test with curl immediately after adding
**Warning signs:** 404 on new endpoints despite successful compilation

## Code Examples

### Tab Navigation Shell (OpenClawPage.tsx)
```typescript
// Based on: frontend/src/pages/Pipeline.tsx
import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

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

  return (
    <div style={{ position: 'absolute', inset: 0, margin: '-20px -28px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header + tabs */}
      <div style={{ padding: '16px 20px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        <PageHeader defaultTitle="OpenClaw" defaultSubtitle="agent management + usage + tools" />
        <div style={{ display: 'flex', gap: '2px', marginTop: '16px', background: 'var(--bg-white-03)', borderRadius: '10px', padding: '3px', width: 'fit-content' }}>
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
        {tab === 'usage' && <UsageTab healthy={healthData?.ok ?? false} />}
        {tab === 'models' && <ModelsTab healthy={healthData?.ok ?? false} />}
        {tab === 'tools' && <ToolsTab healthy={healthData?.ok ?? false} />}
      </div>
    </div>
  )
}
```

### Rust Proxy Route (usage/models/tools)
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
// Pattern from: frontend/src/hooks/useAgents.ts + dashboard hooks
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

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate /agents and /crons pages | Unified /openclaw with tabs | Phase 12 | Single entry point for all OpenClaw management |
| No usage/models/tools visibility | Gateway proxy routes + read-only dashboard | Phase 12 | Users can monitor API usage and available models |
| Direct OpenClaw API calls | gateway_forward() proxy | Phase 9 | Credential protection, error sanitization |

## Existing Infrastructure to Reuse

### Already Complete (from Phases 9, 10, 11)
1. **`gateway_forward()`** -- proxy helper with credential protection and error sanitization (gateway.rs)
2. **`AgentsPage` + `useAgents` hook** -- full CRUD with optimistic updates, split-pane layout, detail panel
3. **`CronsPage` + `useCrons` hook** -- full CRUD with calendar view, form modal, job list
4. **`/api/openclaw/health`** -- health check endpoint already wired
5. **Chat models route** -- `/chat/models` already fetches models from OpenClaw (can reference pattern)

### Key Integration Points
- **main.tsx** -- add lazy import for OpenClawPage, add route at `/openclaw`, add redirects for `/agents` and `/crons`
- **nav-items.ts** -- update agent dashboard items to point `/agents` -> `/openclaw`, remove separate `/crons` entry
- **modules.ts** -- add `openclaw` module entry replacing `agents` and `crons` entries
- **query-keys.ts** -- add `openclawUsage`, `openclawModels`, `openclawTools` keys
- **routes/mod.rs** -- register new `openclaw_data` module router

### OpenClaw Gateway API Endpoints
The OpenClaw gateway is an HTTP API running on the OpenClaw VM. Based on the existing `gateway_forward()` usage and test paths:
- `GET /agents` -- list agents (already proxied via agents.rs)
- `POST /agents/{id}/action` -- lifecycle control (already proxied)
- `POST /crons`, `PUT /crons/{id}`, `DELETE /crons/{id}` -- cron CRUD (already proxied)
- `GET /health` -- health check (already proxied via gateway.rs)
- `GET /usage` -- token counts, cost, model usage (NEW - needs proxy)
- `GET /models` -- available models list (NEW - needs proxy; note: `/chat/models` exists but hits a different endpoint)
- `GET /tools` -- tool registry (NEW - needs proxy)

**Important:** The exact response shapes from `/usage`, `/models`, `/tools` are unknown since they depend on the OpenClaw gateway implementation. The frontend should handle graceful degradation -- display whatever fields are present, show "No data" for missing fields.

## Open Questions

1. **OpenClaw API response shapes for /usage, /models, /tools**
   - What we know: The gateway API exists and gateway_forward() can proxy to any path
   - What's unclear: The exact JSON structure returned by each endpoint
   - Recommendation: Build flexible frontend types that handle optional fields. Use the `Value` type on the Rust side (already the pattern). Display whatever comes back, with graceful empty states.

2. **Memory browser (SH-01) scope**
   - What we know: Phase 12 requirements include SH-01 (Agent Memory Browser). There's an existing `/api/memory` route for workspace memory files.
   - What's unclear: Whether this means the agent RAG memory on the OpenClaw VM (accessed via gateway) or the local workspace memory files
   - Recommendation: If it's OpenClaw-side memory, add a `GET /memory/{agentId}` gateway proxy. If it's local memory, reuse the existing Memory page as a tab or sub-panel in the agent detail.

3. **Should /agents and /crons routes be removed or redirected?**
   - What we know: Both routes exist in main.tsx and nav-items.ts
   - What's unclear: Whether any deep links, bookmarks, or tests depend on the old URLs
   - Recommendation: Keep as `<Navigate to="/openclaw" replace />` redirects. Zero risk of breaking existing references.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (jsdom environment) |
| Config file | `frontend/vitest.config.ts` |
| Quick run command | `cd frontend && npx vitest run --reporter=verbose` |
| Full suite command | `cd frontend && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MH-08-a | Tab navigation renders 5 tabs | unit | `cd frontend && npx vitest run src/pages/openclaw/__tests__/OpenClawPage.test.tsx -x` | No - Wave 0 |
| MH-08-b | Usage types are structurally valid | unit | `cd frontend && npx vitest run src/pages/openclaw/__tests__/types.test.ts -x` | No - Wave 0 |
| MH-08-c | Query keys are unique and namespaced | unit | `cd frontend && npx vitest run src/lib/__tests__/query-keys.test.ts -x` | No - Wave 0 |
| MH-08-d | Rust usage/models/tools routes compile | unit | `cd src-tauri && cargo test routes::openclaw_data -x` | No - Wave 0 |
| SH-01 | Agent memory browser shows entries | manual-only | Manual -- requires running OpenClaw gateway | N/A |

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd frontend && npx vitest run && cd ../src-tauri && cargo test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/pages/openclaw/__tests__/types.test.ts` -- covers MH-08 types
- [ ] `src-tauri/src/routes/openclaw_data.rs` tests -- route handler unit tests

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
- `frontend/src/main.tsx` -- route registration pattern (lines 278-306)
- `frontend/src/lib/modules.ts` -- module registration (lines 1-69)
- `frontend/src/lib/nav-items.ts` -- sidebar navigation items (lines 1-43)
- `frontend/src/lib/query-keys.ts` -- centralized query keys (lines 1-35)
- `frontend/src/components/primitives/StatCard.tsx` -- stat display component (lines 1-211)
- `frontend/src/components/primitives/BarChart.tsx` -- bar chart component (lines 1-466)
- `frontend/src/lib/hooks/dashboard/` -- refetchInterval polling patterns (multiple files)
- `src-tauri/src/routes/mod.rs` -- route registration in Axum (lines 47-90)
- `frontend/src/pages/dashboard/useDashboardData.ts` -- visibility-aware polling pattern (lines 110-144)

### Secondary (MEDIUM confidence)
- OpenClaw gateway API endpoints (`/usage`, `/models`, `/tools`) -- inferred from existing gateway patterns and test assertions in gateway.rs (line 300 validates `/v1/models` path)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, no new dependencies needed
- Architecture: HIGH - all patterns directly observed in the codebase (Pipeline tabs, gateway proxy, React Query polling)
- Pitfalls: HIGH - identified from actual code (full-bleed layout conflicts, route registration gotchas documented in CLAUDE.md)
- OpenClaw API shapes: LOW - the exact response format from /usage, /models, /tools depends on the remote gateway

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable -- no external dependencies, all patterns from this codebase)
