# Repo Baseline

This cleanup intentionally narrows the repository to the active desktop app surface:

- root package scripts and automated checks
- `frontend/` React app
- `src-tauri/` desktop/backend app
- `shared/` runtime catalogs
- `scripts/` checks used by the current workflow
- `docs/architecture.md` and this baseline note

Historical planning, generated milestone notes, old deploy/docker/supabase examples, iOS experiments, and broad legacy docs were left deleted from the working tree. They can be recovered from Git history if needed, but they are not part of the active reusable baseline.

Current required checks:

- `npm run check`
- `npm --prefix frontend test`
- `npm run check:tauri`
