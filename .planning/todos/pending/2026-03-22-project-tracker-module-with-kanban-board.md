---
created: 2026-03-22T17:16:24.037Z
title: Project tracker module with kanban board
area: ui
files:
  - frontend/src/lib/widget-registry.ts
  - frontend/src/components/widgets/
  - frontend/src/lib/vault.ts
---

## Problem

No way to track active projects (biometric auth, homelab NAS projects, scripts, etc.) inside Mission Control. Projects are scattered across vault notes, scripts dirs, and mental notes. Need a centralized view like GitHub Projects but integrated into the widget system.

Each project should have: title, status, description, links to relevant vault notes/scripts, and a kanban-style board for tracking progress. Should pull from the Obsidian vault's `projects/` folder for sync — another Claude session is setting up that folder structure now.

## Solution

1. **ProjectsWidget** — Dashboard widget showing active projects as cards with status badges
2. **Projects page** (`/projects`) — Full kanban board (Backlog → In Progress → Done) with project cards
3. **Vault integration** — Read project metadata from `projects/` folder in CouchDB vault (each project = a note with frontmatter)
4. **Kernel hook** — `useProjects()` to fetch/manage project data
5. **Project card** — Title, status pill, description preview, linked notes count, last activity date
6. **Examples to track:** biometric auth project, homelab infrastructure, mission-control itself, any personal/work projects
