# User Testing Bug Report — 2026-03-23

All bugs found during manual testing by user. EVERY one must be fixed.

## Critical Bugs (Pages Broken)

### 1. Notes page crashes
- Error: `Failed to execute 'addColorStop' on 'CanvasGradient': The value provided ('var(--accent-a30)') could not be parsed as a color.`
- Graph view uses CSS variables in Canvas API which doesn't support them
- Must resolve CSS var to actual color value before passing to Canvas

### 2. OpenClaw Models/Usage/Tools tabs show "not configured"
- Agents tab works fine — shows all agents (Bjorn, Roman, Sonnet, Jiraiya, Kimi, Gunther)
- But Models, Usage, and Tools tabs say "OpenClaw is not configured"
- The health check IS passing (agents load) — the tabs have a separate broken check
- Need to scrape OpenClaw gateway API for ALL features, not just agents/crons

### 3. Remote Desktop / Sunshine not working
- Shows "OpenClaw VM — Unknown — Set SUNSHINE_HOST in Settings > Connections"
- SUNSHINE_HOST not configured in .env.local or keychain
- Need to SSH to OpenClaw VM, verify Sunshine is running, get the URL, configure it
- Must actually connect and stream — not just show a status card

### 4. Chat defaults to Sonnet model
- Should default to qwen (user's local model via llama-desktop)
- Fallback should be Haiku, NEVER Sonnet
- Model selector shows "Sonnet 4.6" — needs to detect default from OpenClaw config

## UX Bugs

### 5. Search bar shows "MagnifyingGlass" instead of "Search"
- Placeholder text is the icon component name, not "Search"
- In sidebar search input

### 6. Homelab shows "not configured" banner despite loading real data
- Proxmox data loads (pve online, 3 VMs running, OPNsense router)
- But the demo-mode guard still shows "Homelab not configured" banner
- Remove the false-positive banner

### 7. Widget picker doesn't show already-placed widgets
- Adding a widget that's already on the page doesn't warn you
- Should indicate which widgets are already placed
- Second click adds duplicate — only then does it show

### 8. Widget gaps and no smart resize on add
- Adding widgets creates large gaps in the grid
- Widgets don't auto-compact or smart-resize when added
- Grid layout has visual spacing issues

### 9. Reminders widget shows skeleton loading forever
- Home page Reminders widget shows grey skeleton lines
- API returns data (4 reminders) but widget doesn't render them

### 10. Home page widget resize only from bottom-right corner
- User expects resize handles on all edges/corners
- react-grid-layout default is bottom-right only

## Feature Gaps (Must Build)

### 11. OpenClaw missing features
- Only Agents and Crons tabs are functional
- Models tab: needs to actually fetch and display model list from LiteLLM
- Usage tab: needs to show token usage, cost tracking from gateway
- Tools tab: needs to show tool registry from OpenClaw
- Must scrape OpenClaw gateway API to match ALL features

### 12. Notes editor is basic — needs Obsidian/Google Docs parity
- Current: basic markdown with H1-H3, bold, italic, strikethrough, code, lists, links, quotes, checkboxes, horizontal rule
- Missing: tables, images, embeds, tags, backlinks graph that works, search within notes, templates, slash commands, drag-drop reorder, export, keyboard shortcuts, split view
- User explicitly wants Obsidian + Google Docs feature parity
- This is a multi-phase effort

### 13. Dashboard edit mode UX issues
- Widgets don't compact properly when rearranged
- Need better visual feedback during drag
- Smart placement when adding new widgets
