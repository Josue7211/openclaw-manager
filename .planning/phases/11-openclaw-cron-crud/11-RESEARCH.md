# Phase 11: OpenClaw Agent Calendar - Research

**Researched:** 2026-03-22
**Domain:** Cron schedule CRUD + calendar visualization (frontend-heavy, backend thin)
**Confidence:** HIGH

## Summary

Phase 11 adds CRUD operations for OpenClaw cron jobs with a calendar-based visual schedule editor. The codebase already has significant existing infrastructure: a read-only `CronsPage` with `WeekGrid`, `FrequentBar`, and `JobList` components, a `GET /api/crons` backend route that reads from the `openclaw` CLI, typed `CronJob`/`CronSchedule` interfaces, and comprehensive unit tests. The existing calendar page (`pages/calendar/`) provides reusable patterns for `WeekView` and `MonthView` components.

The backend currently reads cron data via `openclaw cron list --json` (CLI-based, read-only). For CRUD, the backend needs new routes that proxy through `gateway_forward()` to the OpenClaw API (same pattern as `agents.rs`). Cron jobs should be stored locally in SQLite (like agents) with sync mutations logged, plus optionally forwarded to the OpenClaw gateway for execution control.

**Primary recommendation:** Extend the existing `CronsPage` with CRUD capabilities following the `Agents` page pattern -- split-pane layout with job list on left and detail/edit panel on right, backed by a new `useCrons` hook mirroring `useAgents`, with a new `crons.rs` backend route for CRUD operations using SQLite storage + `gateway_forward()` for enable/disable/delete forwarding.

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MH-07 | OpenClaw Cron CRUD - Full create/update/delete for cron jobs with human-readable schedule editor and enable/disable toggle | Existing `CronJob` type, `WeekGrid`/`JobList` components, `gateway_forward()` proxy, `useAgents` CRUD pattern all directly enable implementation |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| croner | 10.0.1 | Parse cron expressions + compute next fire times | Zero deps, 8KB gzip, works in browser, computes next occurrences for calendar rendering |
| cronstrue | 2.53.0 | Human-readable cron descriptions | Zero deps, 5.7KB gzip, converts `0 9 * * 1-5` to "At 09:00 AM, Monday through Friday" |

### Already In Codebase (no new deps needed)
| Library | Purpose | Usage |
|---------|---------|-------|
| @tanstack/react-query 5.x | Data fetching + optimistic updates | `useQuery`, `useMutation` -- same as `useAgents` |
| @phosphor-icons/react | Icons | `Clock`, `Play`, `Pause`, `Trash`, `Plus`, `CalendarDots` |
| React 19 | UI framework | Components, hooks, portals for dialogs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| croner | cron-parser | cron-parser is more popular but has dependencies and requires Node 18+; croner is zero-dep and browser-native |
| cronstrue | Manual formatting | cronstrue handles all edge cases in cron expression descriptions; hand-rolling is error-prone |
| SQLite local storage | Gateway-only | SQLite gives offline-first capability matching the agents pattern; gateway-only fails when OpenClaw is unreachable |

**Installation:**
```bash
cd frontend && npm install croner cronstrue
```

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
  pages/
    crons/
      types.ts             # (EXISTS) CronJob, CronSchedule -- extend with CreateCronPayload
      WeekGrid.tsx          # (EXISTS) Week calendar grid -- add onClick for event selection
      FrequentBar.tsx       # (EXISTS) High-frequency job display
      JobList.tsx           # (EXISTS) All jobs list -- add onClick + enabled toggle
      CronDetailPanel.tsx   # (NEW) Right-side edit panel (mirrors AgentDetailPanel)
      __tests__/
        types.test.ts       # (EXISTS) 404 lines of tests
  pages/
    CronJobs.tsx            # (EXISTS) Refactor to split-pane layout
  hooks/
    useCrons.ts             # (NEW) CRUD hook mirroring useAgents
  lib/
    query-keys.ts           # (UPDATE) Add `crons` key

src-tauri/src/
  routes/
    crons.rs                # (NEW) CRUD routes with SQLite + gateway_forward
    mod.rs                  # (UPDATE) Register crons router
  migrations/
    0010_cron_jobs.sql       # (NEW) SQLite table for cron jobs
```

### Pattern 1: CRUD Hook (mirrors useAgents)
**What:** A `useCrons()` hook providing `{ crons, loading, createMutation, updateMutation, deleteMutation, toggleMutation }`
**When to use:** All cron data access from any component
**Example:**
```typescript
// Follows the exact pattern from hooks/useAgents.ts
export function useCrons() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<CronsResponse>({
    queryKey: queryKeys.crons,
    queryFn: () => api.get<CronsResponse>('/api/crons'),
    enabled: !isDemoMode(),
  })

  const createMutation = useMutation({
    mutationFn: async (payload: CreateCronPayload) => {
      return api.post<{ job: CronJob }>('/api/crons', payload)
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.crons })
      const prev = queryClient.getQueryData<CronsResponse>(queryKeys.crons)
      // Optimistic add
      queryClient.setQueryData<CronsResponse>(queryKeys.crons, (old) => ({
        ...old,
        jobs: [...(old?.jobs || []), { id: 'temp-' + Date.now(), ...payload, enabled: true }],
      }))
      return { prev }
    },
    onError: (_err, _payload, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.crons, ctx.prev)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.crons }),
  })

  // ... update, delete, toggle mutations follow same pattern
}
```

### Pattern 2: Split-Pane Layout (mirrors AgentsPage)
**What:** Left panel with job list/calendar, right panel with detail editor, drag-resizable divider
**When to use:** The CronJobs page refactored from single-column to split-pane
**Example:**
```typescript
// Same pattern as pages/Agents.tsx
<div style={{ position: 'absolute', inset: 0, margin: '-20px -28px', display: 'flex', overflow: 'hidden' }}>
  {/* Left: Calendar + job list */}
  <div style={{ width: listWidth, minWidth: listWidth, borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
    <WeekGrid ... onSelectJob={setSelectedId} />
    <JobList ... onSelectJob={setSelectedId} />
  </div>
  {/* Resize handle */}
  <div onMouseDown={handleResize} role="separator" aria-orientation="vertical" ... />
  {/* Right: Detail panel or empty state */}
  <div style={{ flex: 1, overflow: 'hidden' }}>
    {selectedJob ? <CronDetailPanel job={selectedJob} ... /> : <EmptyState />}
  </div>
</div>
```

### Pattern 3: Backend CRUD via SQLite + Gateway Forward
**What:** Store cron jobs in local SQLite (like agents) for offline resilience, forward lifecycle commands to OpenClaw gateway
**When to use:** All cron CRUD routes
**Example:**
```rust
// Mirrors agents.rs exactly
async fn create_cron(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<CreateCronBody>,
) -> Result<Json<Value>, AppError> {
    let id = crate::routes::util::random_uuid();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query("INSERT INTO cron_jobs ...")
        .bind(&id).bind(&session.user_id)
        .execute(&state.db).await?;

    crate::sync::log_mutation(&state.db, "cron_jobs", &id, "INSERT", Some(&payload)).await?;

    // Optional: forward to OpenClaw gateway
    if let Ok(_) = gateway_forward(&state, Method::POST, "/crons", Some(body_json)).await {
        // synced
    }

    Ok(Json(json!({ "job": job_val })))
}
```

### Pattern 4: Cron Expression to Calendar Events
**What:** Convert cron expressions to visual calendar events using croner's next-occurrence computation
**When to use:** Rendering cron jobs on the WeekGrid/calendar
**Example:**
```typescript
import { Cron } from 'croner'

function getCronFireTimesInWeek(expr: string, weekStart: Date): FireTime[] {
  const fires: FireTime[] = []
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000)

  try {
    const cron = new Cron(expr)
    let next = cron.nextRun(weekStart)
    while (next && next < weekEnd) {
      fires.push({
        ms: next.getTime(),
        dayIndex: next.getDay(),
        top: next.getHours() * 60 + next.getMinutes(),
      })
      next = cron.nextRun(new Date(next.getTime() + 1000))
    }
  } catch { /* invalid expression */ }

  return fires
}
```

### Anti-Patterns to Avoid
- **Cron-only storage (no SQLite):** If OpenClaw is unreachable, the entire page would break. SQLite storage provides offline-first resilience matching the agents pattern.
- **Inline onMouseEnter/onMouseLeave for hover:** Use CSS class `.hover-bg` per project conventions.
- **Raw crontab input only:** Users need a human-readable schedule builder, not just a text field. Use cronstrue for display and provide preset schedule options.
- **Custom cron parser:** Do not hand-roll cron expression parsing. Use croner -- it handles all edge cases (L, W, #, second fields, DST).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron expression parsing | Regex-based parser | `croner` (8KB, zero deps) | DST handling, L/W/# flags, second/year fields, timezone support |
| Human-readable cron descriptions | String concatenation | `cronstrue` (5.7KB, zero deps) | 30+ edge cases in cron descriptions, i18n support |
| Next fire time computation | Manual date arithmetic | `croner.nextRun()` | DST transitions, month-end handling, February leap year |
| Confirmation dialogs | Custom modal from scratch | Existing pattern from `AgentDetailPanel` | Uses `useFocusTrap`, `useEscapeKey`, portal, ARIA attributes |
| Optimistic mutation | Manual state management | React Query `onMutate` pattern | Snapshot/rollback proven in `useAgents` |
| Calendar week grid | New grid implementation | Existing `WeekGrid.tsx` | Already handles overlap layout, time axis, current-time indicator |

**Key insight:** The existing codebase has ~80% of the UI components already built. The WeekGrid, FrequentBar, JobList, and calendar patterns are all in place. This phase is primarily about wiring CRUD operations and adding an edit panel, not building calendar UI from scratch.

## Common Pitfalls

### Pitfall 1: Cron Expression Rendering Gap
**What goes wrong:** The existing `getFireTimesInWeek()` only handles `kind: 'every'` (interval-based) jobs. Jobs with `kind: 'cron'` (expression-based) currently return an empty array and show nothing on the calendar.
**Why it happens:** The original implementation deferred cron expression parsing.
**How to avoid:** Use `croner` to compute fire times for `kind: 'cron'` jobs, extending `getFireTimesInWeek()` with a cron-expression branch.
**Warning signs:** Cron jobs appearing in the JobList but not on the WeekGrid.

### Pitfall 2: Two Data Sources
**What goes wrong:** The existing `GET /api/crons` reads from the `openclaw` CLI (`openclaw cron list --json`). If CRUD writes go only to SQLite, the read path would not see them. If CRUD writes go only to the gateway, local storage is out of sync.
**Why it happens:** Dual storage (local SQLite + remote OpenClaw) creates consistency challenges.
**How to avoid:** Primary source of truth is SQLite (for UI responsiveness). On create/update/delete, also fire-and-forget to the OpenClaw gateway (like `agents.rs` does for model sync). On read, merge CLI results with local SQLite data, or migrate fully to SQLite as primary with periodic sync.
**Warning signs:** Jobs created in the UI not appearing after page refresh, or vice versa.

### Pitfall 3: Missing CLI Binary
**What goes wrong:** The `openclaw` CLI may not be installed on the user's machine. The current `openclaw_cli.rs` handles this gracefully (returns empty array), but CRUD operations would fail silently.
**Why it happens:** `openclaw_available()` checks once at startup and caches the result.
**How to avoid:** CRUD routes should store in SQLite unconditionally (always works) and treat gateway forwarding as best-effort. UI should show connection status (same pattern as `openclawHealthy` in AgentsPage).
**Warning signs:** Create/toggle operations appearing to work but not persisting.

### Pitfall 4: Bundle Size Regression
**What goes wrong:** Adding `croner` (8KB) + `cronstrue` (5.7KB) pushes a chunk over the 400KB CI budget.
**Why it happens:** Both are small, but if they land in the main chunk rather than the lazy-loaded CronJobs chunk, they inflate the common bundle.
**How to avoid:** Import these libraries only inside `pages/crons/` components (which are lazy-loaded via `React.lazy`). Never import from shared hooks or lib files.
**Warning signs:** CI bundle check failing after adding dependencies.

### Pitfall 5: Week Start Inconsistency
**What goes wrong:** The existing crons `WeekGrid` uses Sunday-start weeks (`getWeekStart` returns Sunday), while the calendar `WeekView` uses Monday-start weeks (`weekStart` returns Monday). Mixing these in a unified view creates confusion.
**Why it happens:** Different developers authored these components independently.
**How to avoid:** Decide on one convention (the crons page already uses Sunday-start, keep it). Do not mix calendar and crons week-start logic.
**Warning signs:** Events appearing on the wrong day column.

## Code Examples

### Example 1: CronDetailPanel Structure (mirrors AgentDetailPanel)
```typescript
// Source: Derived from pages/agents/AgentDetailPanel.tsx pattern
interface CronDetailPanelProps {
  job: CronJob
  onUpdate: (id: string, fields: Partial<CronJob>) => void
  onDelete: (id: string) => void
  onToggle: (id: string, enabled: boolean) => void
}

export function CronDetailPanel({ job, onUpdate, onDelete, onToggle }: CronDetailPanelProps) {
  const [name, setName] = useState(job.name)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Debounced update (600ms) -- same pattern as AgentDetailPanel
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ... form fields: name, description, schedule picker, enabled toggle
  // ... delete button with confirmation dialog using useFocusTrap + useEscapeKey
}
```

### Example 2: Schedule Picker Presets
```typescript
// Source: Original design based on MH-07 requirement
const SCHEDULE_PRESETS = [
  { label: 'Every hour',     schedule: { kind: 'every', everyMs: 3600000 } },
  { label: 'Every 6 hours',  schedule: { kind: 'every', everyMs: 21600000 } },
  { label: 'Every 12 hours', schedule: { kind: 'every', everyMs: 43200000 } },
  { label: 'Daily',          schedule: { kind: 'every', everyMs: 86400000 } },
  { label: 'Every weekday at 9am', schedule: { kind: 'cron', expr: '0 9 * * 1-5' } },
  { label: 'Weekly (Sunday)', schedule: { kind: 'cron', expr: '0 0 * * 0' } },
  { label: 'Custom cron...',  schedule: null }, // Opens cron expression input
] as const
```

### Example 3: Backend Route Registration
```rust
// Source: Derived from routes/mod.rs + routes/agents.rs patterns
// In routes/crons.rs:
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/crons", get(get_crons).post(create_cron).patch(update_cron).delete(delete_cron))
        .route("/crons/toggle", post(toggle_cron))
}

// In routes/mod.rs:
pub mod crons;
// ...
.merge(crons::router())
```

### Example 4: SQLite Migration
```sql
-- 0010_cron_jobs.sql
CREATE TABLE IF NOT EXISTS cron_jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    schedule_kind TEXT NOT NULL DEFAULT 'every',
    schedule_every_ms INTEGER,
    schedule_expr TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    next_run_at TEXT,
    last_run_at TEXT,
    last_run_status TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_user ON cron_jobs(user_id);
```

### Example 5: Extending getFireTimesInWeek for Cron Expressions
```typescript
// Source: Extends existing pages/crons/types.ts getFireTimesInWeek
import { Cron } from 'croner'

export function getFireTimesInWeek(job: CronJob, weekStart: Date): FireTime[] {
  const fires: FireTime[] = []
  const weekStartMs = weekStart.getTime()
  const weekEndMs = weekStartMs + 7 * 24 * 3600000
  const s = job.schedule

  if (s.kind === 'every' && s.everyMs) {
    // ... existing interval logic (unchanged)
  }

  if (s.kind === 'cron' && s.expr) {
    try {
      const cron = new Cron(s.expr)
      let next = cron.nextRun(weekStart)
      while (next && next.getTime() < weekEndMs) {
        const ms = next.getTime()
        if (ms >= weekStartMs) {
          fires.push({
            ms,
            dayIndex: next.getDay(),
            top: next.getHours() * 60 + next.getMinutes(),
          })
        }
        next = cron.nextRun(new Date(ms + 1000))
      }
    } catch {
      // Invalid cron expression -- return empty
    }
  }

  return fires
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CLI-only cron read (`openclaw cron list`) | SQLite CRUD + gateway sync | This phase | Enables offline-first CRUD, UI responsiveness |
| Cron expressions only shown in JobList | Calendar visualization of fire times | This phase | Visual schedule management |
| No cron expression parsing in frontend | croner for fire-time computation | This phase | WeekGrid shows cron-expression jobs |

**Existing infrastructure preserved:**
- `WeekGrid.tsx` -- reused as-is with click handler added
- `FrequentBar.tsx` -- reused as-is
- `JobList.tsx` -- extended with toggle button and click handler
- `types.ts` -- extended with `CreateCronPayload` and new interfaces
- Unit tests in `__tests__/types.test.ts` -- extended, not rewritten

## Open Questions

1. **OpenClaw Gateway Cron API Endpoints**
   - What we know: `openclaw cron list --json` exists for reading. The gateway proxy pattern is established.
   - What's unclear: Exact POST/PATCH/DELETE endpoints on the OpenClaw API for cron management. The CLI uses `openclaw cron list` but CRUD may need different gateway paths.
   - Recommendation: Store in SQLite as primary. Forward to gateway as best-effort. If OpenClaw gateway exposes `/crons` REST endpoints, use them; if not, the CLI fallback (`openclaw cron create/update/delete`) can be used from the backend.

2. **Command Field**
   - What we know: MH-07 says "edit its command and schedule." The existing `CronJob` type has `name`, `description`, `schedule` but no `command` field.
   - What's unclear: What "command" means in the OpenClaw context -- is it an agent to invoke, a shell command, a task description?
   - Recommendation: Add a `command` text field to the SQLite schema and UI. Let users enter free-form text that gets forwarded to OpenClaw. The UI label can be "Task / Command" to be generic.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `frontend/vitest.config.ts` |
| Quick run command | `cd frontend && npx vitest run src/pages/crons/__tests__/` |
| Full suite command | `cd frontend && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MH-07-a | Calendar view shows cron schedules visually | unit | `cd frontend && npx vitest run src/pages/crons/__tests__/types.test.ts -x` | Partial (existing tests cover `getFireTimesInWeek` for `every` kind but not `cron` kind) |
| MH-07-b | Create cron job from calendar UI | unit | `cd frontend && npx vitest run src/hooks/__tests__/useCrons.test.ts -x` | No -- Wave 0 |
| MH-07-c | Toggle cron enabled/disabled | unit | `cd frontend && npx vitest run src/hooks/__tests__/useCrons.test.ts -x` | No -- Wave 0 |
| MH-07-d | Edit cron command and schedule | unit | `cd frontend && npx vitest run src/pages/crons/__tests__/CronDetailPanel.test.tsx -x` | No -- Wave 0 |
| MH-07-e | Delete cron with confirmation | unit | `cd frontend && npx vitest run src/pages/crons/__tests__/CronDetailPanel.test.tsx -x` | No -- Wave 0 |
| MH-07-f | Backend CRUD routes | unit | `cd src-tauri && cargo test routes::crons -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run src/pages/crons/__tests__/`
- **Per wave merge:** `cd frontend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/hooks/__tests__/useCrons.test.ts` -- covers MH-07-b, MH-07-c
- [ ] `frontend/src/pages/crons/__tests__/CronDetailPanel.test.tsx` -- covers MH-07-d, MH-07-e
- [ ] `frontend/src/pages/crons/__tests__/types.test.ts` -- extend existing to cover cron-expression fire times (croner integration)
- [ ] `src-tauri/src/routes/crons.rs` tests -- backend CRUD unit tests (inline `#[cfg(test)]` module)
- [ ] `npm install croner cronstrue` -- new dependencies

## Sources

### Primary (HIGH confidence)
- Codebase files: `src-tauri/src/routes/agents.rs` -- CRUD pattern reference
- Codebase files: `src-tauri/src/routes/gateway.rs` -- `gateway_forward()` proxy function
- Codebase files: `src-tauri/src/routes/openclaw_cli.rs` -- existing `GET /crons` via CLI
- Codebase files: `frontend/src/pages/crons/types.ts` -- existing CronJob types and helpers
- Codebase files: `frontend/src/pages/crons/WeekGrid.tsx` -- existing calendar grid
- Codebase files: `frontend/src/pages/CronJobs.tsx` -- existing crons page
- Codebase files: `frontend/src/hooks/useAgents.ts` -- CRUD hook pattern
- Codebase files: `frontend/src/pages/Agents.tsx` -- split-pane layout pattern
- Codebase files: `frontend/src/pages/agents/AgentDetailPanel.tsx` -- detail panel pattern
- Codebase files: `frontend/src/pages/calendar/shared.ts` -- CalendarEvent types and helpers

### Secondary (MEDIUM confidence)
- [croner npm](https://www.npmjs.com/package/croner) -- v10.0.1, 8KB gzip, zero deps
- [cronstrue npm](https://www.npmjs.com/package/cronstrue) -- v2.53.0, 5.7KB gzip, zero deps
- [croner GitHub](https://github.com/Hexagon/croner) -- API reference, browser support confirmed

### Tertiary (LOW confidence)
- OpenClaw gateway cron CRUD endpoints -- not verified, assumed REST pattern based on agent endpoints

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- croner and cronstrue are well-established, zero-dep libraries verified via npm and bundlephobia
- Architecture: HIGH -- follows established patterns from Phase 10 (agents CRUD), all reference code read directly from codebase
- Pitfalls: HIGH -- identified from direct codebase analysis (two data sources, missing CLI, week-start inconsistency)
- Backend: MEDIUM -- SQLite schema follows agents pattern exactly, but OpenClaw gateway cron endpoints are unverified

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable domain, existing patterns)
