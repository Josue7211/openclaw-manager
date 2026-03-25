# Plan 96-02 Summary: Frontend Session CRUD UI

**Status:** COMPLETE
**Commit:** feat(96-02): session rename, delete, compact UI

## What was built

### useSessionMutations hook
- `renameMutation`: calls `api.patch(/api/gateway/sessions/{key})` with optimistic cache update + rollback
- `deleteMutation`: calls `api.del(/api/gateway/sessions/{key})` with optimistic removal + rollback
- `compactMutation`: calls `api.post(/api/gateway/sessions/{key}/compact)` with toast feedback
- All three invalidate `queryKeys.gatewaySessions` on settlement
- 10 unit tests covering API calls, optimistic updates, rollback, toast feedback, and cache invalidation

### SessionCard enhancements
- Right-click context menu with Rename, Compact, Delete options (portal-rendered with backdrop)
- Three-dot button in top-right corner (visible on hover, triggers same context menu)
- Double-click label to enter inline rename mode (Enter confirms, Escape cancels, blur commits)
- "Compacting..." indicator replaces message count during compact mutation
- Context menu uses proper ARIA roles (role="menu", role="menuitem")

### SessionList updates
- Wires `useSessionMutations` to pass callbacks through to each `SessionCard`
- Delete confirmation dialog: modal with backdrop, session label shown, Cancel/Delete buttons
- Dialog has `role="dialog"`, `aria-modal="true"`, Escape key support
- `onDeleteSelected` callback notifies parent when a session is deleted

### SessionsPage
- Passes `onDeleteSelected` to clear the detail panel (set `selectedId` to null) when the currently-viewed session is deleted

### Test infrastructure
- Added `ToastProvider` to module-smoke.test.tsx `TestWrapper` so pages using `useToast` don't crash the error boundary

## Verification

- TypeScript: zero errors
- Vitest: 2532/2532 passing (129 test files)
- Cargo test: 288/288 passing
- Production build: passes, within bundle budget
