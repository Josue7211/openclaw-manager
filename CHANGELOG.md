# Changelog

## [0.1.0] - 2026-03-12

### Added
- Tauri v2 desktop app with OS keychain secret management
- Supabase Auth with GitHub/Google OAuth and mandatory TOTP MFA
- Stale-while-revalidate page caching for instant navigation
- Avatar caching and batch checking
- "Not configured" banners for optional integrations
- Error boundary and 404 page
- Accessibility: aria-labels, focus rings, semantic landmarks
- Open source files: LICENSE (MIT), README, CONTRIBUTING, .env.example

### Security
- Path traversal protection with symlink resolution
- SSRF redirect blocking in link previews
- Timing-safe API key comparison
- Mandatory API_KEY for OpenClaw API server
- CSP policy for Tauri WebView
- Tauri shell permissions scoped to minimum required
- Keychain key allowlist for get/set operations
- Open redirect protection on login page

### Fixed
- Removed all hardcoded home directory paths
- Centralized EXEC_PATH and OPENCLAW_DIR configuration
- Standardized API error responses for unconfigured services

### Changed
- Consolidated workspace route utilities into shared _lib.ts
- Isolated SecondsAgo timer component to prevent dashboard re-renders
- Memoized heatmap and session map computations
