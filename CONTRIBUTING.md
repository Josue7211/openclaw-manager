# Contributing to Mission Control

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

1. Create a feature branch from `master`
2. Make your changes
3. The pre-commit hook runs checks automatically, or run manually: `./scripts/pre-commit.sh`
4. Open a pull request describing what changed and why

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

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
