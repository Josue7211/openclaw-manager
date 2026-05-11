---
created: 2026-03-22T17:40:00.000Z
title: /goal — Notes must reach 1:1 Obsidian functionality plus Word-class editing
area: ui
files:
  - frontend/src/pages/notes/NoteEditor.tsx
  - frontend/src/pages/notes/Notes.tsx
  - frontend/src/pages/notes/EditorToolbar.tsx
  - frontend/src/lib/vault.ts
---

## /goal

Make ClawControl Notes a first-class Obsidian replacement inside the app: 1:1 daily vault functionality, folder/file operations, command palette, links/backlinks/unlinked mentions, graph, aliases/properties/frontmatter, templates, daily notes, attachments/embeds, import/export, keyboard shortcuts, and markdown compatibility. Then layer Word-class editing on top without breaking Obsidian/CouchDB data compatibility.

Work rule: keep using CLI and API verification. Do not count the goal as done because one UI pass compiles; each feature should be checked through typecheck/tests/build and relevant backend API probes where possible.

Canonical execution plan: `.planning/GOAL-notes-25-star-docs-vault.md`.

## Problem

The notes editor is still below the user target. It should feel like Obsidian for vault workflows and like Word/Google Docs for authoring, so the user never has to leave the app to write, organize, connect, and export documents. It should leverage everything Obsidian/CouchDB offers.

## What's Missing (Google Docs-level)

### Rich Text Editing
- WYSIWYG mode (not just raw markdown) — see rendered output as you type
- Inline images (paste, drag-drop, resize)
- Tables (insert, resize columns, add/remove rows)
- Embeds (YouTube, tweets, iframes)
- Callout/admonition blocks (info, warning, tip, danger)
- Checklists with proper checkbox rendering
- Horizontal rules rendered as visual dividers
- Code blocks with syntax highlighting AND execution preview
- Math/LaTeX rendering (inline and block)
- Footnotes
- Table of contents auto-generation

### Document Features
- Page margins and document-like layout (not code editor feel)
- Headers rendered at proper visual hierarchy (H1 huge, H2 large, etc.)
- Font size and family options
- Text color and highlight color
- Alignment (left, center, right, justify)
- Indentation levels
- Line spacing control

### Obsidian-Specific Features
- `[[wikilinks]]` rendered as clickable pills (done: autocomplete exists)
- `![[embeds]]` rendered inline (images done, need note embeds)
- Tags (`#tag`) rendered as colored pills
- Frontmatter/YAML metadata editor (properties panel) (in progress)
- Dataview-style queries (render data from other notes)
- Mermaid diagram rendering
- Canvas/whiteboard mode
- Daily notes template (done)
- Templates system (insert template into new note) (started)
- Starred/pinned notes (done)
- Note aliases (in progress)
- Outline/TOC sidebar for current note (done)
- Command palette / quick switcher (done)
- Linked and unlinked mentions with one-click link promotion (in progress)
- Rename notes updates existing wikilinks (in progress)
- Sidebar right-click parity for notes/folders (done)

### Collaboration & Productivity
- Comments/annotations on text
- Version history (CouchDB revisions are already tracked)
- Word count, reading time
- Focus mode (hide everything except the editor)
- Typewriter mode (keep cursor centered)
- Spell check integration
- Find and replace (CodeMirror has search, but needs UI)
- Export to PDF, DOCX, HTML

### Organization
- Nested folders with create/rename/delete
- Drag-and-drop file organization
- Sort by: name, date modified, date created, size
- Bulk operations (move, delete, tag)
- Recent files list
- Favorites/starred

## Solution

### Phase approach (don't try to build all at once):

**Phase A: WYSIWYG foundation**
- Switch from CodeMirror to a rich text editor (TipTap/ProseMirror or keep CodeMirror with WYSIWYG decorations)
- TipTap is the strongest candidate — built on ProseMirror, has extensions for everything
- OR: Keep CodeMirror but add live preview decorations (like Obsidian's Live Preview mode)
- The CodeMirror approach is more Obsidian-faithful; TipTap is more Google Docs-like

**Phase B: Document chrome**
- Table of contents sidebar
- Properties/frontmatter panel
- Word count bar
- Focus/typewriter mode

**Phase C: Rich content**
- Tables, callouts, embeds, math
- Mermaid diagrams
- Image resize and drag

**Phase D: Organization**
- Folder CRUD, drag-drop, sorting
- Templates, daily notes
- Version history viewer

### Recommendation
TipTap (ProseMirror) with markdown serialization — gives Google Docs UX while maintaining markdown compatibility with Obsidian. Can render markdown from CouchDB as rich text, serialize back to markdown on save.
