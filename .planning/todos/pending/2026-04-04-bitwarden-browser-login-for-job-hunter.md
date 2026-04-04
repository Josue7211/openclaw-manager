---
created: 2026-04-04T03:07:37.251Z
title: Bitwarden browser login for job hunter
area: general
files:
  - README.md
  - docs/SECURITY.md
---

## Problem

Job Hunter may need a logged-in browser session for manual review of LinkedIn and Indeed results, but we do not yet have a dedicated, wired-up Bitwarden or secrets-broker path for launching that session safely from the app.

## Solution

Add a safe browser-login workflow that can pull session material from the existing secrets path or Bitwarden session when available, then open a logged-in browser for manual review, screenshots, and human-in-the-loop apply flows.
