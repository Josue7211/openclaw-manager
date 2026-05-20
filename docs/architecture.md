# Architecture

## Frontend Boundaries

- `frontend/src/pages`: route shells and page-local composition.
- `frontend/src/features`: reusable domain contracts, selectors, and pure helpers.
- `frontend/src/hooks`: app data hooks. Hooks may import from `features`, `lib`, and `components`, but should not depend on page-owned modules.
- `frontend/src/components`: reusable UI components. Components may import from `features` and `lib`; page-specific UI stays under `pages/<feature>`.
- `frontend/src/lib`: cross-feature infrastructure and shared utilities.

Compatibility re-exports from `pages/<feature>/types.ts` or `pages/<feature>/utils.ts` are temporary migration shims. New shared code should import from `features/<feature>`.

Run `npm run check:architecture` after structural changes.

## Verification

- `npm run check` validates architecture, frontend typecheck, and the current bundle budget.
- `npm run check:all` adds the frontend test suite and Tauri backend `cargo check`.
- `npm --prefix frontend run build` must run before `npm run check:bundle` because the budget reads `frontend/dist`.
