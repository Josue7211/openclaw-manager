# Contributing to OpenClaw Manager

## Getting Started

1. Fork the repo and clone your fork
2. Install prerequisites: Node.js 20+, Rust stable, [Tauri v2 system deps](https://v2.tauri.app/start/prerequisites/)
3. Install dependencies and run:

```bash
cd frontend && npm install && cd ..
cargo tauri dev
```

## Setup git hooks

Install the pre-commit hook so checks run automatically on `git commit`:

```bash
ln -sf ../../scripts/pre-commit.sh .git/hooks/pre-commit
```

## Workflow

1. Sync the latest default branch:

```bash
git checkout main || git checkout master
git pull --ff-only
```

2. Create a focused branch for one fix or feature:

```bash
git checkout -b fix/short-description
```

3. Make your changes
4. The pre-commit hook runs checks automatically, or run manually: `./scripts/pre-commit.sh`
5. Push your branch and open a pull request against the default branch using the PR template in `.github/pull_request_template.md`

## Branch Strategy

- Keep the protected default branch as `main`
- Use short-lived topic branches: `fix/...`, `feat/...`, `docs/...`, `refactor/...`, `chore/...`
- Keep each PR scoped to one concern
- Rebase or merge `main` before opening the PR if your branch drifts
- Do not commit directly to the protected branch
- For roadmap work, keep one branch per workstream and link the PR to the matching phase number
- For autonomous / GSD runs, keep the branch order and PR order aligned with `.planning/ROADMAP.md`

If the repository still uses `master`, keep CI targeting both `main` and `master` during the transition, then switch the GitHub default branch to `main` and remove the legacy branch later.

## Testing

All tests must pass before submitting a PR.

```bash
cd frontend && npx vitest run          # Frontend unit tests
cd frontend && npx tsc --noEmit        # Type check
cd src-tauri && cargo test             # Rust tests
cd src-tauri && cargo clippy -- -D warnings  # Rust linting
./scripts/pre-commit.sh               # Runs everything
```

## Code Conventions

See [CLAUDE.md](CLAUDE.md) for the full style guide. Key points:

- **CSS**: Use variables (`--accent`, `--hover-bg`, `--ease-spring`), never hardcode colors
- **React**: Use `React.memo` for hot-path components, React Query for data fetching, shared hooks from `lib/hooks/`
- **Accessibility**: `<button>` not `<div onClick>`, `aria-label` on icon buttons, focus traps on modals
- **Rust**: Secrets via `AppState.secret()`, never `std::env::var()`. Never log credentials
- **Security**: No credentials in source code, no hardcoded URLs, no telemetry

## Pull Requests

- Keep PRs focused on a single feature or fix
- Describe what changed and why in the PR description
- Run `./scripts/pre-commit.sh` before submitting
- Test both browser mode and desktop app if touching Tauri code
- Include the roadmap phase, branch name, and verification commands in the PR body

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
