# Mission Control — Performance Autoresearch

You are running the autoresearch loop to reduce the JavaScript bundle size of the Mission Control app.

## Your goal
Reduce `total_gzip_kb` in `scripts/perf-research/baseline.json` as much as possible by making targeted optimizations to the frontend code.

## The loop — follow this exactly every iteration

1. **Read context:**
   - `scripts/perf-research/baseline.json` — current best score and top chunks
   - `scripts/perf-research/learnings.md` — what's been tried and what worked

2. **Pick ONE hypothesis** from the "Hypotheses to Try" list in learnings.md (highest priority first)

3. **Investigate before changing:**
   - Find the source file(s) responsible for the chunk you're targeting
   - Understand WHY it's large before touching anything
   - Use `grep`, `Glob`, `Read` to analyze imports

4. **Make ONE focused change:**
   - Lazy-load a heavy import with `React.lazy` + `Suspense`
   - Replace a wildcard import with named imports
   - Split a large component into smaller lazy-loaded pieces
   - Move a heavy library to a dynamic `import()` call
   - Remove an unused import or dependency

5. **Measure:**
   ```bash
   cd /home/josue/Documents/Projects/mission-control/scripts/perf-research
   bash measure.sh
   ```
   This takes ~30-60 seconds.

6. **Evaluate:**
   - If `total_gzip_kb` IMPROVED (lower is better):
     - Keep the change
     - Update `baseline.json` with new `total_gzip_kb`
     - Add entry to `learnings.md` under "Confirmed Improvements"
     - Commit with message: `perf: reduce bundle by Xkb (technique description)`
   - If `total_gzip_kb` SAME or WORSE:
     - Revert the change: `git checkout -- <changed files>`
     - Add entry to `learnings.md` under "Failed Experiments" with why it didn't work

7. **Update hypotheses list** — mark the tried hypothesis as done, add new ones discovered

8. **Loop** — go back to step 1

## Constraints

- Never break functionality — the app must still build without TypeScript errors
- Never change the Rust backend (src-tauri/) — frontend only
- Never modify test files
- Keep changes minimal — one idea per iteration
- The react chunk (70.57 kB) is hard to reduce — don't spend time there
- `query` chunk (React Query, 16.26 kB) — leave it, it's needed

## What good looks like

- **Win**: Any optimization that reduces total_gzip_kb by ≥ 1 kB
- **Big win**: Lazy-loading Chat or supabase chunks (potentially 10-50 kB savings)
- **Quick win**: Replacing `import * from 'lucide-react'` with named imports

## Key files to investigate first

- `frontend/src/pages/Chat.tsx` — what makes it 176 kB raw / 52 kB gzip?
- `frontend/src/lib/supabase/client.ts` — what's imported from supabase?
- `frontend/src/components/Sidebar.tsx` — is it in the main index chunk?
- `frontend/src/main.tsx` — what's eagerly loaded vs lazy?
- `frontend/vite.config.ts` — current chunk splitting config
