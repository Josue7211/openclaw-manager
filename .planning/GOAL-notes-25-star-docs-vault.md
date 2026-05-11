---
created: 2026-05-09T16:30:00-04:00
title: Notes 25-Star Docs + Obsidian Vault Plan
area: notes
status: active-plan
owners:
  - frontend/src/pages/notes
  - frontend/src/lib/vault.ts
  - src-tauri/src/routes/vault.rs
---

# Notes 25-Star Docs + Obsidian Vault Plan

## Honest State

The current Notes page is a useful v1, not 25-star.

What exists:
- CouchDB/Obsidian LiveSync-backed markdown notes.
- File tree, folders, recent/pinned notes, graph, backlinks, command palette, templates/daily note basics.
- CodeMirror markdown source mode.
- A first-pass rich document mode that renders markdown as editable HTML and serializes back to markdown.
- Basic exports: markdown, HTML, PDF print flow, simple DOCX generation.
- Basic toolbar controls: headings, font, size, bold/italic/underline, lists, table insert, callouts, colors, alignment.

Main gaps:
- Rich editor is not a real ProseMirror/TipTap document model yet.
- Toolbar behavior depends too much on browser `execCommand`.
- Tables, images, comments, links, embeds, and metadata are not deep enough.
- Export is functional but not Word-grade.
- Sync conflict/revision UX is missing.
- Obsidian parity is partial.
- Visual polish is below the "Google Docs replacement" bar.

Rule: Do not call this 25-star because a patch compiles. Each phase needs explicit acceptance checks.

## Product Bar

25-star means the user can write a school essay, technical design doc, daily note, research note, or reference-heavy knowledge note without opening Google Docs or Obsidian.

The page must feel like:
- Google Docs for writing.
- Obsidian for vault, links, tags, backlinks, embeds, graph, properties, and markdown compatibility.
- ClawControl-native for command palette, AI help, exports, and cross-app links.

Default state:
- Clean writing canvas.
- No permanent metadata rail.
- Tooling appears only when useful.
- Source markdown remains available, but the primary mode is a polished document editor.

## Non-Negotiables

- Markdown remains the storage format.
- Obsidian-compatible constructs must round-trip:
  - YAML frontmatter.
  - `[[wikilinks]]` and `[[target|alias]]`.
  - `![[embeds]]`.
  - `#tags`.
  - `> [!callout]`.
  - markdown tables, task lists, code blocks, math, footnotes.
- CouchDB/LiveSync credentials never reach frontend.
- Source mode must never corrupt content created in doc mode.
- A user can always recover source markdown.
- Inspector panels are optional, not permanent.
- Tests cover parser/serializer round trips before shipping each editor feature.

## Architecture Decision

Move from the current contentEditable + `execCommand` bridge to a proper editor core.

Preferred core: TipTap/ProseMirror.

Why:
- Strong document model.
- Selection handling is real.
- Commands are testable.
- Extensions exist for tables, task lists, links, images, placeholders, history, collaboration-style comments, math, and keyboard shortcuts.
- Markdown serialization can be explicit instead of DOM scraping.

Keep CodeMirror:
- Source markdown mode.
- Split mode.
- Advanced find/replace in source.

Bridge:
- Markdown -> MDAST/remark -> ProseMirror document.
- ProseMirror document -> markdown serializer.
- Markdown source edits update doc mode after save/debounce.

## Milestone 0: Stop The Bleeding

Goal: Make the current v1 less annoying while the proper editor migration happens.

Tasks:
- Inspector closed by default.
- Metadata/tags/outline/backlinks behind one inspector toggle.
- Toolbar buttons preserve selection.
- Empty notes show a real page with a visible caret.
- Add visible labels/tooltips for ambiguous controls.
- Add "Doc", "Markdown", "Split", "Read" mode labels where space allows.
- Add smoke tests for no always-visible inspector.

Acceptance:
- Opening a note shows only the document surface and toolbar.
- Clicking bullet/number/list applies at the cursor.
- Metadata can be edited, but only after opening the inspector.
- No `##` markdown visible in doc mode for normal headings.

## Milestone 1: Editor Core Rebuild

Goal: Replace fragile rich editing with a real document model.

Tasks:
- Add TipTap dependencies:
  - core/react starter kit.
  - table extension.
  - task list/task item.
  - link.
  - image.
  - placeholder.
  - typography.
  - underline/text style/color/highlight.
  - gap cursor/drop cursor.
- Build `DocumentEditor` separate from `NoteEditor`.
- Build markdown parser/serializer layer:
  - headings.
  - paragraphs.
  - bold/italic/underline/strike.
  - ordered/unordered/task lists.
  - blockquote.
  - code and fenced code.
  - horizontal rule.
  - tables.
  - links.
  - images.
  - callouts.
  - wikilinks.
  - tags.
  - frontmatter preserved outside editor body.
- Add deterministic round-trip tests.
- Keep old rich editor behind a temporary feature flag until parity passes.

Acceptance:
- 50 fixture markdown docs round-trip without destructive changes.
- Toolbar commands work after typing, selecting, clicking, keyboard navigation.
- Undo/redo works for every command.
- Switching doc/source/doc preserves content.

## Milestone 2: Real Docs Toolbar

Goal: Toolbar feels like a writing app, not debug buttons.

Controls:
- Paragraph style dropdown.
- Font family.
- Font size.
- Bold/italic/underline/strike.
- Text color.
- Highlight.
- Clear formatting.
- Link/unlink.
- Bullet list.
- Number list.
- Checklist.
- Quote.
- Code block.
- Inline code.
- Table menu.
- Image menu.
- Callout menu.
- Alignment.
- Indent/outdent.
- Line spacing.
- More menu for advanced blocks.

Behavior:
- Toolbar reflects current selection state.
- Disabled states when commands are invalid.
- Keyboard shortcuts shown in tooltips.
- No unlabeled cryptic controls.
- Menus, not permanent clutter, for advanced table/image/comment controls.

Acceptance:
- Every visible toolbar button has a working command and tooltip.
- Button active states update when cursor moves.
- Table controls appear only when cursor is in a table.
- Image controls appear only when image selected.

## Milestone 3: Page Canvas Polish

Goal: It looks and behaves like a document.

Tasks:
- Page width presets: narrow, normal, wide.
- Page margin presets.
- Full-page light/dark-safe styling.
- Optional pageless mode.
- Print/PDF preview style matches editor.
- Typewriter mode.
- Focus mode.
- Mobile/tablet layout.
- Empty note state with title + first paragraph affordance.

Acceptance:
- Desktop screenshot looks like a proper document editor, not a text box.
- Narrow and wide windows have no overlap.
- Toolbar remains usable at 1280px and 1024px.
- Mobile layout hides side panels by default.

## Milestone 4: Obsidian Parity

Goal: A real Obsidian replacement.

Features:
- Wikilinks:
  - rendered pills.
  - autocomplete.
  - create missing note from link.
  - rename updates links.
  - aliases resolved.
  - heading links resolved.
- Embeds:
  - images.
  - note embeds.
  - headings/block embeds.
  - PDFs/audio/video as previews.
- Tags:
  - inline tag pills.
  - tag autocomplete.
  - tag browser.
  - nested tags.
- Properties/frontmatter:
  - optional inspector.
  - typed fields: text, date, number, checkbox, list.
  - no permanent rail.
  - YAML round-trip.
- Backlinks:
  - linked mentions.
  - unlinked mentions.
  - one-click promote mention to wikilink.
- Graph:
  - local graph.
  - filters by tag/folder/link depth.
- Templates:
  - insert template.
  - create note from template.
  - daily note template.
- Search:
  - title/content/tag/path.
  - highlighted matches.
  - saved filters.

Acceptance:
- A real Obsidian vault with mixed notes loads without data loss.
- Editing in ClawControl then opening in Obsidian shows expected markdown.
- Editing in Obsidian then opening in ClawControl shows expected rendered doc.

## Milestone 5: Rich Blocks

Goal: Docs-grade content blocks.

Blocks:
- Tables:
  - insert.
  - add/delete rows/columns.
  - header row toggle.
  - column resize.
  - cell background.
  - alignment per cell.
  - markdown table serialization.
- Images:
  - paste.
  - drag/drop.
  - upload to vault attachments.
  - resize.
  - caption.
  - alt text.
  - copy/export.
- Callouts:
  - info, note, tip, warning, danger, quote.
  - icon and color.
  - round-trip to Obsidian callout syntax.
- Math:
  - inline `$x$`.
  - block `$$`.
  - KaTeX render.
- Diagrams:
  - Mermaid blocks with preview/edit toggle.
- Code:
  - language picker.
  - syntax highlighting.
  - copy button.
- Footnotes:
  - insert.
  - jump.
  - markdown footnote syntax.

Acceptance:
- Every block has fixtures for markdown -> editor -> markdown.
- Export to HTML/PDF/DOCX preserves the block acceptably.

## Milestone 6: Comments, Revisions, And History

Goal: Serious writing workflow.

Tasks:
- Inline comments anchored to ranges.
- Resolved/unresolved comments.
- Comment sidebar only when opened.
- Track local unsaved changes.
- CouchDB revision history viewer.
- Diff two revisions.
- Restore revision.
- Conflict detection:
  - show remote changed warning.
  - merge or choose version.
- Autosave state indicator.

Acceptance:
- User can recover a previous version.
- Conflicting edits do not silently overwrite.
- Comments survive reload.

## Milestone 7: Export That Is Actually Good

Goal: Export is not a gimmick.

Exports:
- Markdown.
- HTML.
- PDF.
- DOCX.
- Full vault zip.

DOCX:
- Real document XML with:
  - headings.
  - paragraphs.
  - lists.
  - tables.
  - links.
  - images.
  - callouts approximated as styled boxes.
  - code blocks.
  - page margins.
  - metadata.

PDF:
- Print layout CSS.
- Page breaks.
- Image sizing.
- Tables not clipped.
- Headers/footers optional.

Acceptance:
- Exported DOCX opens in Word/Pages/Google Docs with correct structure.
- Exported PDF visually matches editor within reason.
- Attachments embed or link predictably.

## Milestone 8: Vault Operations

Goal: File management feels complete.

Tasks:
- Drag notes between folders.
- Multi-select notes.
- Bulk move/delete/tag/export.
- Sort by name/modified/created/path.
- Folder rename updates paths.
- Attachments browser.
- Broken link/attachment audit.
- Import markdown folder/zip.
- Export vault zip preserving folder structure.

Acceptance:
- User can reorganize a vault without opening Obsidian.
- Bulk operations have confirmation and undo/restore path.

## Milestone 9: AI-Assisted Writing

Goal: ClawControl advantage beyond Docs/Obsidian.

Features:
- Rewrite selected text.
- Continue draft.
- Create outline from prompt.
- Summarize note.
- Generate title/tags.
- Find contradictions.
- Cite linked notes.
- Turn note into tasks/reminders/calendar event.
- Ask questions over current note + linked notes.

Safety:
- AI edits are previews first.
- Accept/reject diff.
- Never silently rewrites note.

Acceptance:
- User can ask "make this essay stronger" and review a diff.
- Linked-note context is cited.

## Milestone 10: Verification Matrix

Required automated tests:
- Markdown fixture round trips.
- Toolbar command unit tests.
- Export snapshots.
- Vault API media tests.
- Frontmatter parser tests.
- Wikilink resolver tests.
- Rename/update tests.
- Conflict/revision tests.

Required browser tests:
- Create note.
- Type heading/body.
- Apply bullets/numbering.
- Insert table.
- Insert image.
- Add tag in inspector.
- Switch source/doc/source.
- Export PDF/DOCX.
- Open graph.
- Search note content.

Required visual checks:
- 1280x720 desktop.
- 1440x900 desktop.
- narrow sidebar.
- mobile width.
- dark theme.
- light theme if available.

## Execution Order

1. Finish Milestone 0 to remove current annoyances.
2. Build TipTap editor behind a feature flag.
3. Build markdown round-trip fixture suite.
4. Port toolbar commands to TipTap.
5. Replace current rich editor only after fixture suite passes.
6. Add Obsidian parity blocks.
7. Add real export.
8. Add revisions/conflicts.
9. Add AI writing layer.
10. Run full verification matrix.

## Definition Of 25-Star Done

All of these must be true:
- The default screen is a clean document page.
- Metadata is optional.
- The editor does not expose markdown syntax in doc mode.
- All toolbar controls work consistently.
- Markdown round-trip suite passes.
- Real vault opens without corrupting notes.
- Obsidian can still edit the same vault.
- PDF and DOCX exports are useful, not toy output.
- Images and attachments work.
- Tables are editable.
- Comments/history exist.
- Browser smoke tests pass.
- Full frontend build and cargo check pass, except explicitly unrelated known repo failures.

Until then, call it by its real level:
- v1: current patched rich editor.
- 5-star: clean default canvas + working basic toolbar.
- 10-star: reliable TipTap editor + markdown round-trip.
- 15-star: Obsidian parity.
- 20-star: Word-grade blocks/export/history.
- 25-star: polished, verified, default daily driver.
