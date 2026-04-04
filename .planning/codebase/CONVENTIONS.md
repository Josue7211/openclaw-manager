# Coding Conventions

**Analysis Date:** 2026-04-03

## Naming Patterns

- React components use PascalCase filenames and exports.
- Utilities and hooks use camelCase filenames.
- Tests use `{name}.test.ts` or `{name}.test.tsx` and live under `__tests__/` when practical.
- Rust modules use snake_case names.
- Route pages and feature folders match the domain they represent.

## TypeScript And React

- Imports are grouped by framework, third-party, internal aliases, then relative imports.
- `@/` points to `frontend/src/`.
- The frontend prefers direct imports over barrel files.
- Shared connection metadata lives in `frontend/src/lib/service-registry.ts`.
- State machines often use `useSyncExternalStore` for local store patterns.

## Rust

- Functions are snake_case.
- Types and enums are PascalCase.
- Backend handlers return `Result<_, AppError>` and convert errors into JSON responses.
- Secrets are kept out of logs through explicit redaction and zeroization.

## Formatting

- Prettier is the source of truth for frontend formatting.
- ESLint enforces TypeScript and React hook correctness.
- Rust formatting uses `cargo fmt`.
- Rust linting uses `cargo clippy`.

## Error Handling

- Frontend API failures are wrapped in typed error objects.
- Backend route handlers validate inputs before forwarding requests.
- Gateway and service proxy routes prefer explicit bad-request messages for user errors.

## Security Conventions

- Do not store plaintext secrets in the browser.
- Do not write secrets into process-wide environment variables in production flow.
- Keep remote service calls behind the Rust gateway.
- Redact credentials in logs and serialized debug output.
