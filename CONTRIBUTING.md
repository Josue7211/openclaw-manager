# Contributing to Mission Control

Thanks for your interest in contributing! Here's how to get started.

## Prerequisites

- **Node.js 20+**
- **Rust** (install via [rustup](https://rustup.rs/))
- **Tauri v2 system dependencies** -- see the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform

## Development Setup

1. **Clone the repo:**

   ```bash
   git clone https://github.com/your-username/mission-control.git
   cd mission-control
   ```

2. **Install frontend dependencies:**

   ```bash
   cd frontend && npm install
   ```

3. **Configure environment variables:**

   ```bash
   cp .env.example .env.local
   ```

   Open `.env.local` and fill in the required values. Most integrations are optional -- you only need Supabase credentials to get started.

4. **Run the development app:**

   ```bash
   cargo tauri dev
   ```

   The Vite frontend dev server runs at [http://localhost:5173](http://localhost:5173). The Axum backend runs at `localhost:3000`.

## Testing

```bash
# Frontend tests (Vitest)
cd frontend && npx vitest run

# Rust tests
cargo test --manifest-path src-tauri/Cargo.toml
```

## Code Style

- **Rust:** use standard formatting (`cargo fmt`) and lint with `cargo clippy`.
- **TypeScript:** follow the project's `tsconfig.json` settings. Run `cd frontend && npx tsc --noEmit` to type-check.

## Pull Request Guidelines

- Describe what changed and why.
- Keep PRs focused on a single feature or fix.
- Make sure the app builds without errors before submitting.
- If your change touches the Tauri layer, test both the web and desktop builds.
