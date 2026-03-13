.PHONY: dev dev-frontend dev-backend build test test-rust test-frontend lint lint-rust lint-frontend fmt fmt-check check clean setup

# ── Development ─────────────────────────────────────────────────────────────

dev: ## Run frontend + Tauri backend together
	cd src-tauri && cargo tauri dev

dev-frontend: ## Run only the Vite dev server
	cd frontend && npm run dev

dev-backend: ## Run only the Rust backend (cargo check loop)
	cd src-tauri && cargo watch -x check

# ── Build ───────────────────────────────────────────────────────────────────

build: ## Build the full Tauri app
	cd src-tauri && cargo tauri build

build-frontend: ## Build only the frontend
	cd frontend && npm run build

build-backend: ## Build only the Rust backend
	cd src-tauri && cargo build --release

# ── Test ────────────────────────────────────────────────────────────────────

test: test-rust test-frontend ## Run all tests

test-rust: ## Run Rust unit tests
	cd src-tauri && cargo test

test-frontend: ## Run frontend tests
	cd frontend && npx vitest run

# ── Lint / Check ────────────────────────────────────────────────────────────

lint: lint-rust lint-frontend ## Run all linters

lint-rust: ## Run clippy
	cd src-tauri && cargo clippy -- -D warnings

lint-frontend: ## Run ESLint + TypeScript type check
	cd frontend && npm run lint && npx tsc --noEmit

# ── Format ─────────────────────────────────────────────────────────────

fmt: ## Format all code
	cd frontend && npx prettier --write 'src/**/*.{ts,tsx}'
	cd src-tauri && cargo fmt

fmt-check: ## Check formatting (CI gate)
	cd frontend && npx prettier --check 'src/**/*.{ts,tsx}'
	cd src-tauri && cargo fmt --check

check: lint fmt-check test ## Lint + format check + test (CI gate)

# ── Setup ───────────────────────────────────────────────────────────────────

setup: ## Install all dependencies
	cd frontend && npm install
	cd src-tauri && cargo fetch
	@echo "Done. Copy .env.example to .env.local and fill in your values."

# ── Clean ───────────────────────────────────────────────────────────────────

clean: ## Remove build artifacts
	cd src-tauri && cargo clean
	rm -rf frontend/dist

# ── Help ────────────────────────────────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
