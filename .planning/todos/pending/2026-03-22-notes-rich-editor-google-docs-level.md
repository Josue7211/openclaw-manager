---
created: 2026-03-22T17:40:00.000Z
title: Notes editor — Google Docs-level rich editing with full Obsidian features
area: ui
files:
  - frontend/src/pages/notes/NoteEditor.tsx
  - frontend/src/pages/notes/Notes.tsx
  - frontend/src/pages/notes/EditorToolbar.tsx
  - frontend/src/lib/vault.ts
---

## Problem

The notes editor is currently a basic CodeMirror markdown editor. It should be a rich document editing experience like Google Docs — so the user never has to leave the app to write documents. Should leverage everything Obsidian/CouchDB offers.

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
- Frontmatter/YAML metadata editor (properties panel)
- Dataview-style queries (render data from other notes)
- Mermaid diagram rendering
- Canvas/whiteboard mode
- Daily notes template
- Templates system (insert template into new note)
- Starred/pinned notes
- Note aliases
- Outline/TOC sidebar for current note

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
