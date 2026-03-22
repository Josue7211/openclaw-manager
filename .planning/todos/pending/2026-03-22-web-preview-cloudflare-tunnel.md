---
created: 2026-03-22T18:00:00.000Z
title: Web preview via Cloudflare tunnel for agent browser testing
area: tooling
files:
  - frontend/vite.config.ts
---

## Problem

No way for Claude to visually test the app — can only verify TypeScript compiles and tests pass. A web-accessible preview would let the agent browser find visual bugs, layout issues, and interaction problems.

## Solution

Expose the Vite dev server through a Cloudflare tunnel behind Cloudflare Access:
1. Run `cargo tauri dev` on user's machine (starts both Vite :5173 and Axum :3000)
2. Add a `mc-dev.aparcedo.org` tunnel pointing to `localhost:5173`
3. Protect with Cloudflare Access (same GitHub/Google OAuth)
4. The Vite proxy already forwards `/api/*` to `:3000`

Alternative: run `npm run dev` in frontend/ and point API calls to the Axum server via Tailscale IP instead of localhost. This would let the preview work even when the user's machine isn't running Tauri.
