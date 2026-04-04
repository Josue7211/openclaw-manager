# Technology Stack: Dead Code Detection & Cleanup

**Project:** OpenClaw Manager (mission-control)
**Milestone:** v0.0.4 -- Stabilize & Strip
**Researched:** 2026-03-24
**Scope:** Tools for dead code detection, unused export/import cleanup, and code quality auditing in React/TypeScript + Rust/Axum

## Recommended Stack

### Primary: Project-Wide Dead Code (TypeScript/React)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **knip** | 6.x | Detect unused files, exports, dependencies, types across entire project | Best-in-class project-wide dead code detector. v6 (released 2026-03-20) uses oxc-parser for 2-4x speedup over v5. Auto-detects Vite, Vitest, React Router plugins. Has `--fix` for auto-removal. ts-prune is deprecated and recommends knip as successor. |
| **eslint-plugin-unused-imports** | 4.x | Auto-remove unused imports within files | Knip explicitly does NOT remove unused imports inside files -- this plugin fills that gap. Has autofix (`--fix`). Complements knip perfectly: knip finds dead exports/files/deps, this cleans imports per-file. |

### Primary: Rust Dead Code & Dependencies

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **`cargo clippy` + `dead_code` lint** | (built-in) | Detect unused functions, structs, fields, methods | Already available -- zero install. Rust 1.94.0 (2026-03-05) improved dead_code with impl/trait lint inheritance, reducing false positives by ~15%. The codebase already has 13 `#[allow(dead_code)]` annotations across 7 files that should be audited. |
| **cargo-machete** | 0.9.x | Detect unused Cargo.toml dependencies (fast) | Runs in <1s, no nightly required, no compilation needed. Uses regex source scanning. Perfect for CI/pre-commit. False positives possible on macro-generated code but acceptable tradeoff for speed. |

### Supporting: TypeScript Strict Checking

| Technology | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **TypeScript `noUnusedLocals` + `noUnusedParameters`** | (built-in) | Flag unused variables and parameters | Currently `false` in tsconfig.app.json. Enable during cleanup phase, then keep enabled permanently. Free -- already installed, just flip the flags. |

## Tool Details

### knip v6 -- The Core Tool

**What it detects:**
- Unused files (never imported anywhere)
- Unused exports (exported but never consumed)
- Unused dependencies (in package.json but never imported)
- Unlisted dependencies (imported but not in package.json)
- Unused types/interfaces
- Unused enum members
- Unused namespace members (new in v6)
- Duplicate exports

**What it does NOT do:**
- Remove unused imports within files (use eslint-plugin-unused-imports)
- Add missing dependencies to package.json
- Fix duplicate exports

**Auto-fix capabilities:**
- `npx knip --fix` -- removes unused exports (strips `export` keyword), removes unused deps from package.json
- `npx knip --fix --allow-remove-files` -- also deletes unused files
- `npx knip --fix-type exports` -- restrict fixes to specific category (exports, dependencies, types, files)
- `npx knip --fix --format` -- auto-format modified files with project formatter (Prettier)

**Why v6 over v5:** Replaced TypeScript parser with oxc-parser. 2-4x faster (TypeScript repo: 3.7s down to 0.9s). Dropped Node 18 support (project uses Node 20+, so fine). Removed `classMembers` issue type (not relevant here).

**Plugin auto-detection:** Vite plugin activates when `vite` is in package.json (yes). Vitest plugin activates when `vitest` is in package.json (yes). React Router plugin requires `@react-router/dev` (NOT present -- project uses `react-router-dom` directly, so lazy-loaded route pages must be declared as entry points manually in knip config).

**Confidence:** HIGH -- verified against official knip.dev docs (2026-03-24), npm registry shows v6.0.4 published same day.

### eslint-plugin-unused-imports -- Per-File Import Cleanup

**What it detects:**
- `unused-imports/no-unused-imports` -- imports that are never used in the file (autofix: removes them)
- `unused-imports/no-unused-vars` -- variables that are never used (warning only, customizable)

**ESLint 9 flat config integration:**
Works with the project's existing ESLint 9 + typescript-eslint setup. Version 4.x supports ESLint 9 with `@typescript-eslint/eslint-plugin` 5-8.

**Confidence:** HIGH -- npm registry, ESLint 9 migration guides verified.

### cargo-machete -- Fast Rust Dependency Audit

**How it works:** Searches `src/` directory for crate name mentions via regex. If a dependency name never appears in source code, flags it as unused. Does NOT compile anything.

**Tradeoffs vs cargo-udeps:**
- cargo-machete: fast (<1s), works on stable Rust, no compilation. May miss macro-generated usage (false positives). May miss transitive deps (but this is actually an advantage -- cargo-udeps misses them too).
- cargo-udeps: accurate, but requires nightly Rust, full compilation, slow. The project has no rust-toolchain.toml and likely uses stable.

**Recommendation:** Use cargo-machete for speed. If it flags something that looks wrong (e.g., crates used via derive macros), add to `[package.metadata.cargo-machete]` ignore list.

**Known false positive candidates in this project:**
- `serde` / `serde_json` -- used via `#[derive(Serialize, Deserialize)]` macros, but machete knows about serde specifically
- `sqlx` -- uses `sqlx::query!` macros and is imported directly in source, should be fine
- `tauri-build` -- only used in build.rs, not src/; will likely be flagged

**Confidence:** HIGH -- verified against GitHub repo README and crates.io (v0.9.1, August 2025).

### TypeScript Strict Flags -- Zero-Cost Wins

**Current state in tsconfig.app.json:**
```json
"noUnusedLocals": false,
"noUnusedParameters": false,
```

**Recommendation:** Flip both to `true` during cleanup. These are compiler-level checks that catch:
- Variables declared but never read
- Function parameters never used (prefix with `_` to suppress)

These run during `tsc --noEmit` which is already in the pre-commit hook, so zero additional tooling needed.

**Confidence:** HIGH -- read directly from project's tsconfig.app.json.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Project-wide TS dead code | **knip** | ts-prune | ts-prune is deprecated, in maintenance mode. Author recommends knip. |
| Project-wide TS dead code | **knip** | ts-unused-exports | Narrower scope (exports only). Knip covers files, deps, types too. |
| Per-file import cleanup | **eslint-plugin-unused-imports** | ESLint `no-unused-vars` | Built-in rule cannot autofix import removal. The plugin can. |
| Rust unused deps | **cargo-machete** | cargo-udeps | Requires nightly compiler. Slower (full compilation). Project uses stable Rust. |
| Rust unused deps | **cargo-machete** | cargo-shear | Newer, less battle-tested (~2,320 downloads/month vs machete's much higher adoption). Also regex-based. No clear advantage for this use case. |
| Rust dead code | **clippy + dead_code lint** | warnalyzer | warnalyzer is for multi-crate workspaces. This project is a single crate. Built-in dead_code lint is sufficient. |

## NOT Recommended (Do Not Add)

| Tool | Why Not |
|------|---------|
| **SonarQube / SonarCloud** | Heavyweight server-based analysis. Overkill for dead code detection in a single project. |
| **Depcheck** | Knip supersedes it entirely. Depcheck only finds unused npm deps; knip does that plus files, exports, types. |
| **madge** | Circular dependency detection only. Not a dead code detector. Out of scope for this milestone. |
| **unimported** | Knip supersedes it. Less maintained, fewer framework plugins. |
| **cargo-minify** | Only removes unused derived traits. Too narrow for general dead code cleanup. |
| **ts-prune** | Deprecated. In maintenance mode. Author says use knip instead. |

## Installation

```bash
# Frontend: knip + eslint-plugin-unused-imports
cd frontend
npm install -D knip eslint-plugin-unused-imports

# Rust: cargo-machete (system-wide install)
cargo install cargo-machete
```

## Configuration

### knip.json (create in frontend/)

```json
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "entry": [
    "src/main.tsx",
    "src/vite-env.d.ts"
  ],
  "project": ["src/**/*.{ts,tsx}"],
  "ignore": [
    "src/**/__tests__/**",
    "src/**/__mocks__/**",
    "src/lib/database.types.ts"
  ],
  "ignoreDependencies": [
    "@types/novnc__novnc",
    "@types/dompurify",
    "@types/canvas-confetti",
    "@types/lz-string"
  ]
}
```

**Notes on this config:**
- `entry`: `src/main.tsx` is the app entry point. Vite/Vitest plugins auto-add their own entries (vite.config.ts, test files).
- `ignore`: Test files are handled by Vitest plugin automatically. `database.types.ts` is auto-generated by Supabase CLI.
- `ignoreDependencies`: `@types/*` packages are consumed by TypeScript implicitly via `types` in tsconfig, not via imports. Knip may flag them as unused.

### ESLint config update (frontend/eslint.config.js)

Add to the existing config array:

```js
import unusedImports from 'eslint-plugin-unused-imports'

// Add this object to the defineConfig array after the existing config:
{
  files: ['**/*.{ts,tsx}'],
  plugins: {
    'unused-imports': unusedImports,
  },
  rules: {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': [
      'warn',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
      },
    ],
  },
}
```

**Key:** Disable both `no-unused-vars` and `@typescript-eslint/no-unused-vars` to prevent rule conflicts. The plugin's rules replace them with autofix support.

### cargo-machete ignore list (src-tauri/Cargo.toml)

```toml
[package.metadata.cargo-machete]
ignored = ["tauri-build"]
```

Add crates here only after confirming they are used via build scripts that machete cannot detect. Start minimal and add as false positives surface.

### tsconfig.app.json changes

```json
"noUnusedLocals": true,
"noUnusedParameters": true,
```

### package.json scripts (frontend/)

```json
{
  "scripts": {
    "knip": "knip",
    "knip:fix": "knip --fix",
    "knip:fix-all": "knip --fix --allow-remove-files --format"
  }
}
```

## Workflow Integration

### Recommended cleanup sequence

1. **Run knip in report mode first** -- see the full picture before changing anything
   ```bash
   cd frontend && npx knip
   ```

2. **Auto-fix unused imports** (safe, auto-fixable, per-file)
   ```bash
   cd frontend && npx eslint --fix 'src/**/*.{ts,tsx}'
   ```

3. **Run knip --fix** (removes unused exports from source, strips unused deps from package.json)
   ```bash
   cd frontend && npx knip --fix
   ```

4. **Manually review and remove unused files** (knip reports them; manual delete is safer than `--allow-remove-files` for the first pass)

5. **Enable TypeScript strict flags** and fix resulting errors
   ```bash
   # Edit tsconfig.app.json: noUnusedLocals: true, noUnusedParameters: true
   cd frontend && npx tsc --noEmit
   # Fix errors by prefixing unused params with _ or removing dead variables
   ```

6. **Rust: run cargo clippy** with dead code warnings promoted
   ```bash
   cd src-tauri && cargo clippy -- -W dead_code -W unused_imports -W unused_variables
   ```

7. **Rust: run cargo-machete**
   ```bash
   cd src-tauri && cargo machete
   ```

8. **Audit existing `#[allow(dead_code)]` annotations** -- 13 across 7 files (supabase.rs: 3, media.rs: 5, terminal.rs: 1, bjorn.rs: 1, auth.rs: 1, pipeline/helpers.rs: 1, pipeline/agents.rs: 1). Each annotation is either genuinely needed (e.g., struct fields for deserialization) or suppressing a warning that hides actual dead code to remove.

### How the tools complement each other

```
                    SCOPE

  Within files      Across project      Dependencies
  ──────────────    ──────────────      ──────────────

  eslint-plugin-    knip                knip
  unused-imports    (unused exports,    (unused npm deps,
  (unused imports,   unused files,       unlisted deps)
   unused vars)      unused types)
                                        cargo-machete
  TypeScript                            (unused Cargo.toml
  noUnusedLocals                         deps)
  noUnusedParams
                    cargo clippy
  cargo clippy      dead_code lint
  unused_imports    (unused fns,
  unused_variables   structs, fields)
```

### Pre-commit hook integration

The existing `scripts/pre-commit.sh` runs tsc, vitest, and vite build. After cleanup stabilizes, add knip as a check:

```bash
# Add after the TypeScript type-check section in pre-commit.sh:
section "Dead Code"

step_start=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1e9))')
knip_output=$(cd "$FRONTEND" && npx knip --no-progress 2>&1) || knip_exit=$?
knip_exit=${knip_exit:-0}
ms=$(elapsed_ms "$step_start")

if [ "$knip_exit" -eq 0 ]; then
  pass "$ms" "Knip dead code check"
else
  warn "$ms" "Knip found unused code (non-blocking)"
  echo "$knip_output" | head -10 | while read -r line; do printf "      %s\n" "$line"; done
fi
```

**Start as a warning** (non-blocking) until all dead code is cleaned up, then promote to a blocking `fail` check.

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| knip v6 capabilities + config | HIGH | Official docs at knip.dev, npm registry (v6.0.4, 2026-03-24), multiple verified articles |
| eslint-plugin-unused-imports | HIGH | npm registry, GitHub repo, ESLint 9 flat config guides verified |
| cargo-machete | HIGH | GitHub README, crates.io (v0.9.1, August 2025), comparison articles |
| TypeScript strict flags | HIGH | Read directly from project's tsconfig.app.json |
| clippy dead_code improvements | MEDIUM | Web search results mention Rust 1.94.0 improvements but not verified against official release notes |
| Workflow integration | HIGH | Based on direct inspection of project's pre-commit.sh, eslint.config.js, package.json |

## Sources

### knip
- [knip.dev -- Official documentation](https://knip.dev/)
- [knip.dev -- Getting Started](https://knip.dev/overview/getting-started)
- [knip.dev -- Configuration](https://knip.dev/overview/configuration)
- [knip.dev -- Auto-fix](https://knip.dev/features/auto-fix)
- [knip.dev -- Vite plugin](https://knip.dev/reference/plugins/vite)
- [knip.dev -- Vitest plugin](https://knip.dev/reference/plugins/vitest)
- [knip.dev -- Announcing v6](https://knip.dev/blog/knip-v6)
- [npm: knip](https://www.npmjs.com/package/knip) -- v6.0.4
- [knip.dev -- Comparison & Migration](https://knip.dev/explanations/comparison-and-migration)

### eslint-plugin-unused-imports
- [GitHub: sweepline/eslint-plugin-unused-imports](https://github.com/sweepline/eslint-plugin-unused-imports)

### cargo-machete
- [GitHub: bnjbvr/cargo-machete](https://github.com/bnjbvr/cargo-machete) -- v0.9.1
- [crates.io: cargo-machete](https://crates.io/crates/cargo-machete)

### Rust dead_code
- [Rust by Example: dead_code](https://doc.rust-lang.org/rust-by-example/attribute/unused.html)
- [Rust Project Primer: Unused Dependencies](https://rustprojectprimer.com/checks/unused.html)

### General
- [Effective TypeScript: Use knip to detect dead code](https://effectivetypescript.com/2023/07/29/knip/)
- [Level Up Coding: Why We Chose Knip Over ts-prune](https://levelup.gitconnected.com/dead-code-detection-in-typescript-projects-why-we-chose-knip-over-ts-prune-8feea827da35)
- [DevTools Guide: Knip for finding dead code](https://www.devtoolsguide.com/knip-dead-code-detection/)
