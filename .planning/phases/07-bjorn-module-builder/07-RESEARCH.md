# Phase 07: Bjorn Module Builder - Research

**Researched:** 2026-03-21
**Domain:** AI code generation, iframe sandboxing, dynamic module loading, postMessage bridging
**Confidence:** MEDIUM-HIGH

## Summary

The Bjorn Module Builder introduces an AI-powered code generation pipeline where users describe modules in natural language, Bjorn generates React components using the 11 primitives library, and the result previews in a sandboxed iframe before approval installs it into the dashboard widget picker with hot-reload. This phase spans five technical domains: (1) Bjorn chat UI as a specialized tab in the Chat page, (2) static analysis security gate, (3) iframe sandbox with srcdoc + CSP for preview, (4) postMessage data bridge for live data access, and (5) persistence + hot-reload via SQLite/Supabase sync + blob URL dynamic imports.

The codebase already has strong foundations for every integration point: `registerWidget()` accepts `tier: 'ai'` and `category: 'custom'`, `useChatSocket` provides WebSocket + polling fallback to OpenClaw, `addWidgetToPage()` handles programmatic widget installation, and the SQLite migration + Supabase sync pattern is well-established. The primary unknowns are (a) WebKitGTK iframe sandbox behavior on Linux (Tauri cannot distinguish iframe requests from window requests on Linux/Android), and (b) prompt engineering quality for generating correct primitive compositions.

**Primary recommendation:** Build the static analysis gate first as the security foundation, then layer the sandbox iframe, Bjorn chat tab, persistence, and finally the data bridge -- each layer depends on the previous being secure.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Preview runs in sandboxed iframe with `sandbox="allow-scripts"` -- no DOM access, no cookies, no Tauri IPC
- Strict static analysis blocklist: fetch, XMLHttpRequest, WebSocket, eval, Function, document.cookie, window.parent, window.top, localStorage, sessionStorage, importScripts -- rejected before rendering
- Approved modules escape the sandbox and run as normal React components (same as primitives) -- sandbox is preview-only
- Preview iframe CSP: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'` -- zero network, zero external resources
- Bjorn composes modules from the 11 primitives API -- prompt includes primitive schemas + WidgetProps interface, assembles using only primitives library + standard React
- OpenClaw gateway powers generation (user's configured model) -- uses same chat infrastructure, Bjorn is a specialized system prompt
- Tool manifest file at `~/.config/mission-control/tools.json` lists available CLIs with commands, descriptions, and examples -- Bjorn reads this at generation time
- Approved modules access live data via a data bridge -- postMessage API where parent app proxies requests through Axum. Module requests data, parent resolves via CLI/API. No direct network from module code.
- Generated modules stored in local SQLite table (`bjorn_modules`) with source, config schema, metadata, version history -- synced to Supabase for cross-device
- 5 versions per module -- oldest pruned on new save
- Approval flow: Preview > Approve/Reject/Edit -- sandboxed preview shown, user approves (installs to dashboard), rejects (discards), or requests changes (new generation round)
- Hot-reload via dynamic import with cache-busting -- approved modules as JS blobs loaded via `() => import(blobURL)` in registerWidget, re-registration replaces component without restart
- Builder lives in Chat page as Bjorn tab -- reuses existing chat infrastructure
- Side-by-side split: chat left, preview right -- user sees generation and result simultaneously
- Module management in Settings > Modules -- shows Bjorn-created modules with enable/disable/delete/rollback
- Bjorn explains generation failures in chat with suggested fixes

### Claude's Discretion
- Prompt engineering details for Bjorn's system prompt
- Exact postMessage bridge protocol
- SQLite schema field naming
- Preview iframe HTML template structure
- Cache-busting strategy for blob URLs

### Deferred Ideas (OUT OF SCOPE)
- Bjorn module marketplace/sharing between users
- Bjorn learning from user feedback to improve generation quality
- Module dependency chains (one module depending on another)
- CLI wrapper generation (Bjorn creates new CLIs)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BJORN-01 | User can describe a module in natural language via chat with Bjorn | Chat page Bjorn tab reusing useChatSocket + specialized system prompt; existing ChatThread/ChatInput components |
| BJORN-02 | Bjorn generates a React component using module primitives | OpenClaw gateway with Bjorn system prompt containing primitive schemas + WidgetProps interface |
| BJORN-03 | Generated module renders in sandboxed iframe (srcdoc, sandbox="allow-scripts", no allow-same-origin) | srcdoc iframe with CSP meta tag; see Architecture Patterns for HTML template |
| BJORN-04 | Dev preview panel shows generated module alongside the main app | Side-by-side split layout in Bjorn tab: chat left, preview right |
| BJORN-05 | User can approve, reject, or request changes to generated module | Approval toolbar below preview; approve triggers registerWidget + addWidgetToPage, reject discards, edit sends follow-up message |
| BJORN-06 | Approved module installs into Widget Registry and appears in dashboard widget picker | registerWidget() with tier:'ai', category:'custom'; WidgetPicker already shows 'custom' category |
| BJORN-07 | Hot-reload: approved module appears without app restart | Blob URL dynamic import with cache-busting; registerWidget replaces entry in _registry Map |
| BJORN-08 | Static analysis gate rejects generated code containing network calls, DOM access, or disallowed APIs | Regex-based static analysis on raw source before rendering; blocklist of identifiers |
| BJORN-09 | Module sandbox has no access to parent DOM, localStorage, cookies, or Tauri IPC | sandbox="allow-scripts" without allow-same-origin; CSP blocks all external resources |
| BJORN-10 | Generated module persisted (survives app restart) | bjorn_modules SQLite table + Supabase sync; modules re-registered at startup |
| BJORN-11 | User can delete/disable generated modules | Settings > Modules management with soft-delete pattern; unregister from widget registry |
| BJORN-12 | Version history for generated modules (rollback to previous version) | bjorn_module_versions table with max 5 versions per module; rollback re-registers old version |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18 | Component rendering for generated modules + preview UI | Already in project stack |
| Tauri v2 | current | Webview host, SQLite (sqlx), Axum server | Already in project stack |
| sqlx | current | SQLite persistence for bjorn_modules | Already used for all local persistence |
| OpenClaw gateway | current | AI model for code generation via existing chat infra | Locked decision -- no alternatives |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| useSyncExternalStore | React 18 | Reactive bjorn-module-store for UI updates | Module state management |
| React Query | existing | Fetch module list, manage async states | Data fetching for module management UI |
| postMessage API | Web standard | Data bridge between sandbox iframe and parent | Live data access for approved modules |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Regex static analysis | AST parser (acorn/esprima) | Regex is simpler, catches 95% of cases, zero dependencies; AST adds complexity for edge cases like property access chains |
| Blob URL import | Module Federation | Blob URL is simpler, no build step, works with existing registerWidget; MF adds webpack/vite dependency |
| srcdoc iframe | Web Worker sandbox | iframe provides visual preview; Web Worker cannot render UI |

**Installation:**
No new dependencies required. All capabilities exist in the current stack.

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── lib/
│   ├── bjorn-store.ts          # useSyncExternalStore module state + persistence
│   ├── bjorn-static-analysis.ts # Blocklist checker for generated code
│   ├── bjorn-sandbox.ts        # Iframe HTML template + postMessage bridge (parent side)
│   └── __tests__/
│       ├── bjorn-store.test.ts
│       ├── bjorn-static-analysis.test.ts
│       └── bjorn-sandbox.test.ts
├── pages/
│   └── chat/
│       ├── BjornTab.tsx         # Bjorn builder tab (chat + preview split)
│       ├── BjornPreview.tsx     # Sandboxed iframe preview component
│       ├── BjornApprovalBar.tsx # Approve/Reject/Edit toolbar
│       └── bjorn-types.ts      # Bjorn-specific types
├── pages/settings/
│   └── SettingsModules.tsx      # Extended with Bjorn module management

src-tauri/
├── migrations/
│   └── 0009_bjorn_modules.sql  # bjorn_modules + bjorn_module_versions tables
├── src/routes/
│   └── bjorn.rs                # CRUD endpoints for bjorn_modules + data bridge proxy
```

### Pattern 1: Static Analysis Gate
**What:** Regex-based blocklist check on generated source code before it enters the sandbox
**When to use:** Every time Bjorn generates code, before rendering in iframe
**Example:**
```typescript
// lib/bjorn-static-analysis.ts
const BLOCKLIST: RegExp[] = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  /\bnew\s+Function\b/,
  /\bdocument\.cookie\b/,
  /\bwindow\.parent\b/,
  /\bwindow\.top\b/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bimportScripts\b/,
  /\bnavigator\.sendBeacon\b/,
  /\bwindow\.open\b/,
  /\bdocument\.domain\b/,
  /\b__tauri\b/,
  /\bwindow\.__TAURI\b/,
]

export interface AnalysisResult {
  safe: boolean
  violations: Array<{ pattern: string; line: number; snippet: string }>
}

export function analyzeCode(source: string): AnalysisResult {
  const lines = source.split('\n')
  const violations: AnalysisResult['violations'] = []
  for (let i = 0; i < lines.length; i++) {
    for (const re of BLOCKLIST) {
      if (re.test(lines[i])) {
        violations.push({
          pattern: re.source,
          line: i + 1,
          snippet: lines[i].trim().slice(0, 80),
        })
      }
    }
  }
  return { safe: violations.length === 0, violations }
}
```

### Pattern 2: Sandbox Preview Iframe (srcdoc)
**What:** Render generated React component in a sandboxed iframe using srcdoc
**When to use:** Showing the preview of Bjorn-generated code before approval
**Example:**
```typescript
// lib/bjorn-sandbox.ts
export function buildSandboxHTML(componentSource: string, themeVars: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; }
    ${themeVars}
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module">
    // Minimal React-like rendering shim for preview
    // (full React is too large for inline -- use a preact-like shim or
    //  inline a minimal createElement/render)
    ${componentSource}
  </script>
</body>
</html>`
}
```

### Pattern 3: postMessage Data Bridge
**What:** Structured request/response communication between iframe and parent
**When to use:** When a generated module needs live data from backend services
**Example:**
```typescript
// Parent side (BjornPreview.tsx)
const handleBridgeMessage = useCallback((event: MessageEvent) => {
  if (event.source !== iframeRef.current?.contentWindow) return
  const { type, requestId, source, command } = event.data
  if (type !== 'data-request') return

  // Validate against tool manifest allowlist
  api.post('/api/bjorn/bridge', { source, command })
    .then(result => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'data-response', requestId, data: result },
        '*' // srcdoc origin is 'null', must use '*'
      )
    })
    .catch(err => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'data-error', requestId, error: err.message },
        '*'
      )
    })
}, [])
```

### Pattern 4: Blob URL Hot-Reload Registration
**What:** Convert approved module source to a blob URL and register as a lazy-loadable widget
**When to use:** When user approves a generated module
**Example:**
```typescript
// lib/bjorn-store.ts
export function registerBjornModule(module: BjornModule): void {
  const blob = new Blob(
    [wrapAsESModule(module.source)],
    { type: 'application/javascript' }
  )
  const url = URL.createObjectURL(blob)

  registerWidget({
    id: `bjorn-${module.id}`,
    name: module.name,
    description: module.description,
    icon: module.icon || 'Cube',
    category: 'custom',
    tier: 'ai',
    defaultSize: module.defaultSize || { w: 3, h: 3 },
    configSchema: module.configSchema,
    component: () => import(/* @vite-ignore */ url),
    metadata: { author: 'Bjorn', version: String(module.version) },
  })
}

function wrapAsESModule(source: string): string {
  // Wrap the component source as an ES module with default export
  return `${source}\nexport default BjornWidget;`
}
```

### Pattern 5: Bjorn Module Persistence and Startup Loading
**What:** Save to SQLite, sync to Supabase, re-register all modules at app startup
**When to use:** Ensuring modules survive restart and sync across devices
**Example:**
```typescript
// In main.tsx (after registerPrimitives())
async function loadBjornModules() {
  try {
    const modules = await api.get<BjornModule[]>('/api/bjorn/modules')
    for (const mod of modules) {
      if (mod.enabled) registerBjornModule(mod)
    }
  } catch {
    // Non-fatal -- modules load on next successful fetch
  }
}
registerPrimitives()
loadBjornModules()
```

### Anti-Patterns to Avoid
- **allow-same-origin on sandbox iframe:** Allows embedded code to break out of the sandbox entirely. NEVER combine allow-scripts with allow-same-origin.
- **Direct network access from generated code:** Even with CSP, do not rely solely on CSP for network blocking. Static analysis gate is the primary defense; CSP is defense-in-depth.
- **AST-based analysis for this use case:** Over-engineering. Regex blocklist catches the blocked APIs directly. If a user is determined to bypass via string concatenation (`'ev'+'al'`), the CSP and sandbox are the fallback layers.
- **Full React bundle in iframe:** Shipping the full React 18 bundle (130KB+) into every srcdoc iframe is wasteful. Use a minimal rendering shim for preview. The approved module runs with full React when it exits the sandbox.
- **Synchronous data bridge:** Never block the parent frame waiting for bridge responses. Always use async request/response with requestId correlation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Widget registration | Custom module loader | Existing `registerWidget()` | Already supports tier:'ai', category:'custom', lazy component |
| Dashboard installation | Custom grid manipulation | Existing `addWidgetToPage()` | Handles breakpoints, configs, _pluginId resolution |
| Chat with OpenClaw | Custom WebSocket client | Existing `useChatSocket` + `api.post('/api/chat')` | Handles reconnection, fallback, model switching |
| Module persistence | Custom file storage | SQLite migration + existing sync engine | Pattern proven across 16+ synced tables |
| Reactive state | Custom event emitters | `useSyncExternalStore` pattern | Established pattern in theme-store, dashboard-store, sidebar-settings |
| Error boundaries | Per-module crash handling | Existing `WidgetWrapper` + `PageErrorBoundary` | Already wraps all widgets with Suspense + error boundary |

**Key insight:** The codebase already has every infrastructure piece needed. This phase is primarily integration and new UI, not infrastructure.

## Common Pitfalls

### Pitfall 1: WebKitGTK iframe Request Indistinguishability
**What goes wrong:** On Linux (and Android), Tauri/wry cannot distinguish between requests from an embedded `<iframe>` and the main window. This means CSP or security policies applied to the iframe might not be enforced differently from the main window at the native webview level.
**Why it happens:** WebKitGTK does not expose the frame origin to the Tauri request interceptor.
**How to avoid:** Rely on HTML-level sandbox attribute + CSP meta tag (both are enforced by WebKit's HTML parser, not Tauri's interceptor). The `sandbox="allow-scripts"` attribute is enforced at the browser engine level, independent of Tauri. Verify this works in the development environment early (Wave 0 testing).
**Warning signs:** Generated module code accessing parent window, localStorage, or making network requests despite sandbox attribute.

### Pitfall 2: srcdoc Origin is "null"
**What goes wrong:** When using srcdoc with sandbox (no allow-same-origin), the iframe's origin is the opaque origin `null`. postMessage targetOrigin cannot match "null" reliably.
**Why it happens:** Per HTML spec, sandboxed srcdoc frames have a unique opaque origin.
**How to avoid:** Use `'*'` as targetOrigin when posting from parent to srcdoc iframe. Validate messages by checking `event.source === iframeRef.current.contentWindow` instead of origin. This is safe because the iframe cannot access the parent's DOM or storage.
**Warning signs:** postMessage events not being received by the iframe; origin-based validation failing silently.

### Pitfall 3: Blob URL Revocation Timing
**What goes wrong:** If `URL.revokeObjectURL()` is called before React.lazy resolves the import, the widget fails to load.
**Why it happens:** React.lazy defers the actual import call until the component is first rendered.
**How to avoid:** Never revoke blob URLs for active modules. Maintain a Map of moduleId -> blobURL and only revoke when a module is deleted or a newer version replaces it. Memory impact is negligible (a few KB per module).
**Warning signs:** "Failed to fetch" errors when lazy-loading a Bjorn module that was previously working.

### Pitfall 4: Prompt Injection via User Description
**What goes wrong:** A user's module description could contain instructions that manipulate Bjorn into generating harmful code.
**Why it happens:** The user description is included in the prompt to the AI model.
**How to avoid:** The static analysis gate catches harmful code patterns regardless of how they were generated. The sandbox prevents execution of anything that slips through. This is defense-in-depth: even if prompt injection succeeds, the output is validated.
**Warning signs:** Generated code containing patterns from the blocklist despite seemingly innocent descriptions.

### Pitfall 5: Theme Variable Mismatch in Preview
**What goes wrong:** The preview iframe renders with default browser styles, looking nothing like the actual app.
**Why it happens:** The sandbox iframe has no access to the parent's CSS variables.
**How to avoid:** Extract current computed CSS variable values and inject them as a `<style>` block in the srcdoc HTML. Build a `getThemeVarsCSS()` function that reads all `--*` custom properties from `document.documentElement` and serializes them.
**Warning signs:** Preview looks completely different from the final widget on the dashboard.

### Pitfall 6: Module Source Contains Import Statements
**What goes wrong:** Generated code tries to `import` from `@/components/primitives/*` which doesn't exist in the blob URL context.
**Why it happens:** The AI model generates code that references project imports.
**How to avoid:** For preview: the iframe shim provides primitive-like components inline. For approved modules: wrap the source to inline the primitives API or use a different approach -- the approved module runs as a real React component with access to the bundled primitives. The blob URL module must be self-contained OR the wrapper must inject dependencies.
**Warning signs:** Import errors at blob URL load time; "Cannot find module" in console.

## Code Examples

### SQLite Migration (0009_bjorn_modules.sql)
```sql
-- Bjorn AI-generated modules with version history

CREATE TABLE IF NOT EXISTS bjorn_modules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT 'Cube',
    source TEXT NOT NULL,            -- current version source code
    config_schema TEXT DEFAULT '{}', -- JSON WidgetConfigSchema
    default_size_w INTEGER NOT NULL DEFAULT 3,
    default_size_h INTEGER NOT NULL DEFAULT 3,
    version INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS bjorn_module_versions (
    id TEXT PRIMARY KEY,
    module_id TEXT NOT NULL REFERENCES bjorn_modules(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    source TEXT NOT NULL,
    config_schema TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(module_id, version)
);

CREATE INDEX IF NOT EXISTS idx_bjorn_modules_user ON bjorn_modules(user_id);
CREATE INDEX IF NOT EXISTS idx_bjorn_modules_enabled ON bjorn_modules(enabled);
CREATE INDEX IF NOT EXISTS idx_bjorn_versions_module ON bjorn_module_versions(module_id);
```

### Supabase Migration (bjorn_modules)
```sql
-- Bjorn AI-generated modules (Supabase side)

CREATE TABLE IF NOT EXISTS bjorn_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT 'Cube',
    source TEXT NOT NULL,
    config_schema JSONB DEFAULT '{}',
    default_size_w INTEGER NOT NULL DEFAULT 3,
    default_size_h INTEGER NOT NULL DEFAULT 3,
    version INTEGER NOT NULL DEFAULT 1,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS bjorn_module_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL REFERENCES bjorn_modules(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    source TEXT NOT NULL,
    config_schema JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(module_id, version)
);

CREATE INDEX IF NOT EXISTS idx_bjorn_modules_user ON bjorn_modules(user_id);
ALTER TABLE bjorn_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE bjorn_module_versions ENABLE ROW LEVEL SECURITY;
```

### Bjorn System Prompt Structure
```
You are Bjorn, the module builder for OpenClaw Manager.

TASK: Generate a React component that can be rendered as a dashboard widget.

CONSTRAINTS:
- You MUST use ONLY the primitives API described below
- You MUST export a default function component named BjornWidget
- You MUST accept props: { widgetId, config, isEditMode, size }
- You MUST NOT use: fetch, XMLHttpRequest, WebSocket, eval, Function,
  document.cookie, window.parent, window.top, localStorage, sessionStorage
- You MUST NOT import from any external module
- For live data, use: window.requestData({ source, command }) which returns a Promise

PRIMITIVES API:
[Serialized configSchema objects for all 11 primitives]

WIDGET PROPS INTERFACE:
{ widgetId: string, config: Record<string, unknown>, isEditMode: boolean, size: { w: number, h: number } }

AVAILABLE DATA SOURCES (from tools.json):
[List of available CLIs/APIs with commands and descriptions]

USER REQUEST:
{user_message}
```

### Bjorn Tab Chat Component Structure
```typescript
// pages/chat/BjornTab.tsx (conceptual)
export default function BjornTab() {
  // Reuses useChatState pattern but with bjorn-specific system prompt
  // and adds preview panel
  return (
    <div style={{ display: 'flex', gap: '16px', height: '100%' }}>
      {/* Left: Chat */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <ChatThread ... />
        <ChatInput ... />
      </div>
      {/* Right: Preview */}
      {generatedCode && (
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <BjornPreview source={generatedCode} />
          <BjornApprovalBar onApprove={...} onReject={...} onEdit={...} />
        </div>
      )}
    </div>
  )
}
```

### Data Bridge Inside Sandbox
```javascript
// Injected into srcdoc iframe as a global helper
window.requestData = function(opts) {
  return new Promise(function(resolve, reject) {
    var id = 'req-' + Date.now() + '-' + Math.random()
    function handler(event) {
      if (event.data && event.data.requestId === id) {
        window.removeEventListener('message', handler)
        if (event.data.type === 'data-response') resolve(event.data.data)
        else reject(new Error(event.data.error || 'Bridge error'))
      }
    }
    window.addEventListener('message', handler)
    window.parent.postMessage({
      type: 'data-request',
      requestId: id,
      source: opts.source,
      command: opts.command
    }, '*')
    // Timeout after 10s
    setTimeout(function() {
      window.removeEventListener('message', handler)
      reject(new Error('Data request timed out'))
    }, 10000)
  })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Plugin marketplaces with manual install | AI-generated components from natural language | 2024-2025 | No manual coding or marketplace -- user describes, AI builds |
| iframe sandbox + allow-same-origin | sandbox="allow-scripts" only (opaque origin) | Always been best practice | True isolation -- iframe cannot escape sandbox |
| AST-based static analysis for sandboxing | Regex blocklist + CSP + sandbox defense-in-depth | N/A | Simpler, fewer dependencies, multiple layers compensate for regex limitations |

**Deprecated/outdated:**
- `react-hot-loader`: Deprecated in favor of React Fast Refresh. Not relevant here -- we use blob URL re-registration, not HMR.
- `window.postMessage` with origin checks for srcdoc: srcdoc has opaque "null" origin, so origin-based checks are replaced with source-based validation.

## Open Questions

1. **Minimal React Shim for Preview Iframe**
   - What we know: Full React 18 is ~130KB, too heavy for inline srcdoc. Preact is ~3KB but has subtle compatibility differences.
   - What's unclear: Whether a minimal createElement/render shim (custom ~1KB) is sufficient for previewing primitives, or if React features (useState, useEffect) are needed in preview.
   - Recommendation: Start with a static render shim (no hooks) for preview. If generated modules need interactivity in preview, inline a minimal Preact build. Approved modules run with full React.

2. **Approved Module Import Resolution**
   - What we know: Blob URL modules cannot use `import` statements to reference project files. The module source must be self-contained.
   - What's unclear: How to provide primitives API to approved modules running as real React components. Options: (a) inline all primitives in the blob, (b) use a global registry the blob reads from, (c) transpile imports to global lookups.
   - Recommendation: Use option (b) -- expose primitives on `window.__bjornAPI` that the blob module can reference. The wrapper function injects these before the module executes.

3. **Tool Manifest Auto-Discovery**
   - What we know: User has 8 CLIs available. Tool manifest at `~/.config/mission-control/tools.json`.
   - What's unclear: Whether auto-discovery from PATH is reliable across platforms (especially Windows).
   - Recommendation: Manual-only for v1. Provide a tools.json template with the 8 known CLIs. Auto-discovery is a v2 enhancement.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + @testing-library/react |
| Config file | `frontend/vitest.config.ts` |
| Quick run command | `cd frontend && npx vitest run --reporter=verbose` |
| Full suite command | `cd frontend && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BJORN-01 | Chat with Bjorn via tab | integration | `cd frontend && npx vitest run src/pages/chat/__tests__/BjornTab.test.tsx -x` | Wave 0 |
| BJORN-02 | Generate React component from primitives | unit | `cd frontend && npx vitest run src/lib/__tests__/bjorn-store.test.ts -x` | Wave 0 |
| BJORN-03 | Sandboxed iframe rendering | unit | `cd frontend && npx vitest run src/lib/__tests__/bjorn-sandbox.test.ts -x` | Wave 0 |
| BJORN-04 | Side-by-side preview panel | integration | `cd frontend && npx vitest run src/pages/chat/__tests__/BjornPreview.test.tsx -x` | Wave 0 |
| BJORN-05 | Approve/reject/edit workflow | unit | `cd frontend && npx vitest run src/lib/__tests__/bjorn-store.test.ts -x` | Wave 0 |
| BJORN-06 | Install to widget registry | unit | `cd frontend && npx vitest run src/lib/__tests__/widget-registry.test.ts -x` | Existing (extend) |
| BJORN-07 | Hot-reload without restart | unit | `cd frontend && npx vitest run src/lib/__tests__/bjorn-store.test.ts -x` | Wave 0 |
| BJORN-08 | Static analysis gate | unit | `cd frontend && npx vitest run src/lib/__tests__/bjorn-static-analysis.test.ts -x` | Wave 0 |
| BJORN-09 | Sandbox isolation | unit | `cd frontend && npx vitest run src/lib/__tests__/bjorn-sandbox.test.ts -x` | Wave 0 |
| BJORN-10 | Persistence across restart | unit | `cd frontend && npx vitest run src/lib/__tests__/bjorn-store.test.ts -x` | Wave 0 |
| BJORN-11 | Delete/disable modules | unit | `cd frontend && npx vitest run src/lib/__tests__/bjorn-store.test.ts -x` | Wave 0 |
| BJORN-12 | Version history + rollback | unit | `cd frontend && npx vitest run src/lib/__tests__/bjorn-store.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd frontend && npx vitest run && cd ../src-tauri && cargo test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/lib/__tests__/bjorn-static-analysis.test.ts` -- covers BJORN-08
- [ ] `frontend/src/lib/__tests__/bjorn-sandbox.test.ts` -- covers BJORN-03, BJORN-09
- [ ] `frontend/src/lib/__tests__/bjorn-store.test.ts` -- covers BJORN-02, BJORN-05, BJORN-07, BJORN-10, BJORN-11, BJORN-12
- [ ] `frontend/src/pages/chat/__tests__/BjornTab.test.tsx` -- covers BJORN-01
- [ ] `frontend/src/pages/chat/__tests__/BjornPreview.test.tsx` -- covers BJORN-04
- [ ] Extend `frontend/src/lib/__tests__/widget-registry.test.ts` -- covers BJORN-06 (tier:'ai' registration)
- [ ] Rust tests in `src-tauri/src/routes/bjorn.rs` -- covers CRUD endpoints, data bridge proxy
- [ ] SQLite migration `src-tauri/migrations/0009_bjorn_modules.sql` -- schema creation

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `lib/widget-registry.ts` -- registerWidget(), tier:'ai', category:'custom' already supported
- Codebase analysis: `lib/dashboard-store.ts` -- addWidgetToPage() with _pluginId pattern
- Codebase analysis: `pages/chat/useChatState.ts` -- existing chat infrastructure with useChatSocket
- Codebase analysis: `components/primitives/register.ts` -- 11 primitives with configSchema exports
- Codebase analysis: `src-tauri/migrations/0003_sync_tables.sql` -- SQLite sync pattern
- Codebase analysis: `src-tauri/src/routes/mod.rs` -- route registration pattern
- [MDN: iframe sandbox attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe) -- sandbox behavior spec
- [MDN: CSP sandbox directive](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox) -- CSP enforcement
- [MDN: dynamic import()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import) -- blob URL import support

### Secondary (MEDIUM confidence)
- [Tauri v2 CSP docs](https://v2.tauri.app/security/csp/) -- CSP configuration in Tauri
- [Tauri v2 Isolation Pattern](https://v2.tauri.app/concept/inter-process-communication/isolation/) -- iframe sandboxing in Tauri context
- [wry issue #935](https://github.com/tauri-apps/wry/issues/935) -- WebKitGTK sandbox support discussion
- [Tauri issue #5755](https://github.com/tauri-apps/tauri/issues/5755) -- Network sandboxing for WebViews, confirms Linux limitation

### Tertiary (LOW confidence)
- WebSearch: "Tauri cannot distinguish iframe requests from window requests on Linux/Android" -- needs platform-specific validation during implementation
- WebSearch: blob URL dynamic import browser support -- confirmed for modern browsers but needs testing in WebKitGTK/Tauri webview

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new dependencies
- Architecture: MEDIUM-HIGH -- patterns follow established codebase conventions; blob URL import needs validation
- Pitfalls: HIGH -- well-documented iframe sandbox behaviors, confirmed by MDN and Tauri docs
- Static analysis: MEDIUM -- regex approach is simple but may miss obfuscated patterns; defense-in-depth compensates
- WebKitGTK compatibility: LOW -- iframe sandbox attribute should work at engine level, but Tauri's request interception limitation on Linux needs manual testing

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable -- iframe/sandbox specs don't change, codebase is under our control)
