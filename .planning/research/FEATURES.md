# Feature Landscape

**Domain:** All-in-one life productivity desktop app with AI module builder
**Researched:** 2026-03-19
**Overall confidence:** HIGH (verified against multiple production apps and current documentation)

## Context: What Already Exists

OpenClaw Manager (v0.0.1) already ships: iMessage, AI chat, tasks, calendar, homelab monitoring, media tracking, notes (CouchDB/LiveSync), Apple Reminders, email digest, Pomodoro, agent dashboard, missions, pipeline, knowledge base, cron jobs, agent memory, notification center, global search, command palette, keyboard shortcuts, offline sync, OAuth+MFA auth, encrypted secrets, 17 toggleable modules, drag-and-drop sidebar with custom categories.

This research focuses on **what to build next** for the v1.0 publish milestone: features users expect from this category of app, features that differentiate it, and features to deliberately avoid.

---

## Table Stakes

Features users expect in a polished all-in-one productivity/command center app. Missing any of these and the product feels unfinished or amateur.

| # | Feature | Why Expected | Complexity | Notes |
|---|---------|--------------|------------|-------|
| T1 | **Setup wizard / onboarding flow** | Every serious desktop app guides first-run users through config. Without it, new users bounce immediately. Modern onboarding personalizes the app as it teaches — each step configures something real. | Med | Already planned. Must cover: service connections, module selection, theme pick, demo mode for those without infrastructure. Progressive disclosure, not a 20-step wall. |
| T2 | **Dark/light theme with system follow** | Non-negotiable baseline since 2023. Users expect three states: light, dark, system-auto. Raycast, Notion, Obsidian, Discord, VS Code all do this. | Low | Light theme exists (`[data-theme="light"]`). Need system-follow toggle and smooth transition. CSS `prefers-color-scheme` + localStorage override. |
| T3 | **Curated theme presets** | Home Assistant, Dashy, Discord, Obsidian all ship preset themes. Users expect at least 6-8 curated looks without touching CSS. Grafana ships 2 (dark/light) but allows custom. | Med | Presets = named bundles of CSS variable overrides. Ship 6-8: 2 lights, 2 darks, 2 high-contrast, 2 colorful accents. Store as JSON, apply by swapping CSS variables. |
| T4 | **Free-form dashboard grid** | Grafana, Home Assistant, Dashy, Homarr, iOS widgets all use drag-resize grids. Users expect to arrange their own view. This is the visual first impression of the app. | High | Use react-grid-layout (MIT, mature, responsive breakpoints). Three state layers: visual layout, widget config, persistence. Snap-to-grid with configurable column count. |
| T5 | **Dashboard edit mode** | Grafana and Home Assistant both separate view mode from edit mode. Prevents accidental moves, makes the editing intent clear. | Med | Enter/exit via button or keyboard shortcut. Edit mode shows: grid lines, resize handles, add widget button, remove widget X. Non-edit mode: clean, no handles. |
| T6 | **Loading states, error states, empty states** | Every page needs three states beyond "happy path." Apps without these feel broken (spinner forever, white screen on error, blank page when empty). Notion, Linear, Raycast all nail these. | Med | Systematic audit needed. Create shared components: `<LoadingState>`, `<ErrorState>`, `<EmptyState>` with consistent styling. Each page/widget must handle all three. |
| T7 | **Visual consistency / design system** | Users judge quality by visual coherence. Inconsistent spacing, different button styles, mixed icon sets = amateur. Notion, Linear, Raycast all enforce strict design systems. | High | Audit all 17+ pages for: consistent spacing scale, button hierarchy, typography scale, icon style, color usage, border radius, shadow depth. Create a component library doc. |
| T8 | **Responsive/adaptive layout** | Desktop apps get resized constantly. Multi-monitor setups (1080p laptop + 1440p external) are the norm for the target audience. Microsoft's Fluent, Grafana, and VS Code all handle this gracefully. | High | Define breakpoints: compact (<900px), default (900-1400px), wide (>1400px). Sidebar should collapse to icons at compact. Dashboard grid should reflow. Test at 1080p, 1440p, ultrawide. |
| T9 | **Seamless page transitions** | Users navigate between modules dozens of times per session. Full page reloads with spinners break flow. Notion, Discord, and Raycast all keep state when switching. | Med | Already lazy-loading pages. Need: keep previous page mounted (or cached) during transition, animate route changes, preserve scroll position on back-navigation. React Router + page cache. |
| T10 | **Unread badges / notification counts** | Discord, Slack, macOS dock badges, every messaging/productivity app shows unread counts per section. Without them, users don't know where to look. | Med | Already have NotificationCenter with grouping. Need: per-module unread count in sidebar, badge on app icon (Tauri tray), per-conversation badges for Messages. Derive from existing SSE + realtime subscriptions. |
| T11 | **Keyboard shortcuts (discoverable)** | Power users expect Cmd+K command palette (exists), but also discoverable shortcuts in menus, tooltips showing shortcuts on hover, and a shortcuts reference panel. Raycast, VS Code, Notion all do this. | Low | Already have `keybindings.ts` and KeyboardShortcutsModal. Need: show shortcuts in tooltips/menus, ensure all major actions have a shortcut, make shortcuts panel easily findable. |
| T12 | **Full-text search across modules** | GlobalSearch exists but needs to search across all data types: notes, tasks, messages, calendar events, knowledge entries. Notion and Obsidian both offer unified search. Raycast searches everything. | Med | Extend existing GlobalSearch to query all module backends. Rank results by type and recency. Show result previews inline. |
| T13 | **Data export / backup** | Open-source users expect data sovereignty. If the app stores their data, they need a way to get it out. Obsidian (plain files), Notion (export), Logseq (plain markdown) all do this. | Med | Export as: JSON dump of Supabase data, SQLite backup, notes as markdown files. Triggered from Settings. No cloud dependency for the export itself. |

---

## Differentiators

Features that set OpenClaw Manager apart. Not expected by default, but create the "wow" factor and competitive moat. These are what make users choose this over stitching together Notion + Obsidian + Grafana + Home Assistant.

| # | Feature | Value Proposition | Complexity | Notes |
|---|---------|-------------------|------------|-------|
| D1 | **Bjorn module builder (AI-generated modules)** | The killer feature. Users describe what they want in natural language, the AI agent generates a working module, previews it in a sandbox, and hot-reloads it into the running app. No other desktop productivity app does this. Closest analogues are Notion AI (content only) and Lovable/Bolt (separate apps). | Very High | Requires: sandboxed React renderer, approval flow (preview -> approve -> install), component primitive library for Bjorn to compose from, persistence of generated modules, version history. This is the hardest feature but the entire differentiator. |
| D2 | **Pre-built module primitives** | A component library (charts, lists, forms, tables, stat cards, timers) that Bjorn composes from AND that users can manually configure. Like Grafana panels but for life data, not just metrics. | High | Build 10-15 primitives: bar chart, line chart, stat card, list view, kanban board, form, table, calendar widget, timer, progress bar, embed/iframe, markdown display, counter, toggle group, image gallery. Each has a config schema. |
| D3 | **Advanced theme editor (CSS variable editor)** | Beyond presets: a visual editor showing all CSS variables with color pickers, sliders for spacing/radius, live preview. Like Firefox DevTools but purpose-built. No productivity app offers this level of customization. | Med | Expose the ~40 CSS variables from globals.css in a GUI. Group by category (colors, spacing, typography, shadows, animations). Live preview as values change. Save as named custom theme. |
| D4 | **Theme import/export and community gallery** | Export themes as JSON, import from file or URL. Optional: a community gallery (GitHub repo or simple API) where users share themes. Obsidian and VS Code have theme marketplaces that drive ecosystem engagement. | Med | Export: JSON of CSS variable overrides + metadata. Import: file picker or paste URL. Gallery: static JSON index hosted on GitHub, fetched at runtime. No server needed. |
| D5 | **Notes overhaul: wiki-style [[linking]] with backlinks** | Obsidian's defining feature. Creating a knowledge graph from notes via bidirectional links. The types already define `links` array and `GraphData`. Making it actually work with rendered backlinks, autocomplete suggestions, and the graph view is the differentiator. | High | Parse `[[wikilinks]]` in note content, resolve to note IDs, build bidirectional index. Show backlinks panel on each note. Graph view already has types (`GraphNode`, `GraphLink`). Need: link autocomplete in editor, click-to-navigate, orphan detection. |
| D6 | **Notes overhaul: rich WYSIWYG editing** | Obsidian moved from pure markdown to a hybrid WYSIWYG editor. Notion is fully WYSIWYG. Users expect inline images, tables, code blocks, and formatting without memorizing markdown syntax. | High | Use TipTap (ProseMirror-based, MIT) or Milkdown. Must support: bold/italic/headings, inline images, tables, code blocks with syntax highlighting, checklists, callouts, embeds. Preserve markdown roundtrip for Obsidian compatibility. |
| D7 | **Embedded VM desktop viewer** | No productivity app embeds a live remote desktop view of a server. For homelab users, seeing the OpenClaw VM running in a panel is compelling. Proxmox noVNC already exists. | Med | Embed noVNC in an iframe/webview panel. Authenticate via Proxmox API token. Show in a dashboard widget or dedicated page. Already noted in project memory. |
| D8 | **AI-powered module suggestions** | Bjorn doesn't just build what you ask. It observes your usage patterns and suggests modules: "You check Plex every morning. Want a 'New Releases' widget?" This is proactive AI, not reactive. | High | Requires: usage telemetry (local only, never sent anywhere), pattern detection, suggestion UI (dismissable cards), and Bjorn integration to generate the suggested module. Build after D1 is stable. |
| D9 | **Finance / budgeting module** | Combining finance with tasks, calendar, and AI in one app is rare. Most budgeting apps (YNAB, Copilot Money) are standalone. Having it in the command center with AI categorization is novel. | High | Manual transaction entry + CSV/OFX import (no bank API -- security and maintenance burden). Categories, monthly budgets, spending charts, recurring transaction tracking. AI-assisted categorization via Bjorn. |
| D10 | **Health / fitness tracking module** | Combining health data with productivity context (correlating sleep with task completion) is a differentiator. Apple Health export, manual entry, Fitbit/Garmin API. | Med | Start with manual entry: weight, exercise, sleep, water, mood. Trend charts over time. CSV import for bulk historical data. API integrations later. |

---

## Anti-Features

Features to explicitly NOT build. Each would seem like a good idea but would hurt the product, distract from the core, or create unsustainable maintenance burden.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Bank API integration (Plaid/Teller)** | Security liability, requires PCI compliance considerations, API costs, constantly breaking connections, massive support burden. Every fintech startup that does this spends 40% of engineering on bank connectivity. | Manual transaction entry + CSV/OFX file import. Let users export from their bank and import. Zero security risk, zero API cost, always works. |
| **Native mobile app** | Doubles the codebase, different platform constraints, Tauri doesn't target mobile well. The target audience (homelab power users) primarily uses desktop. | Web-responsive design for occasional tablet use. Mobile deferred to post-v1.0. If needed, a lightweight companion PWA for notifications only. |
| **Real-time collaboration (Google Docs style)** | CRDT-based real-time editing is an enormous engineering challenge. Obsidian's LiveSync already handles note sync. Building collaborative editing from scratch would consume months. | Notes sync via CouchDB LiveSync (already works). Sharing = export note as markdown/PDF. Collaboration deferred to Matrix integration later. |
| **Plugin/extension marketplace** | Plugin ecosystems require: sandboxing, API stability guarantees, review processes, versioning, dependency management. Obsidian and VS Code have entire teams for this. | Bjorn module builder IS the extensibility system. AI generates modules instead of users writing plugins. Custom modules are first-class but generated, not manually coded by third parties. |
| **Email client (full IMAP/SMTP)** | Building a real email client is a multi-year project (Thunderbird has 20 years of development). IMAP quirks, MIME parsing, threading, attachments, spam filtering. | Email digest module (already exists): show recent emails, mark read, quick reply. Not a replacement for a dedicated email client. |
| **Social media integration** | API instability (Twitter/X changes constantly), content moderation liability, privacy concerns with OAuth tokens for social platforms. | If users want social feeds, Bjorn can generate an RSS-based widget that aggregates public feeds without API dependencies. |
| **Telemetry / analytics** | The project explicitly prohibits phone-home. Adding opt-in telemetry creates trust issues for an open-source privacy-focused app. The target audience will audit the code and call it out. | Local-only usage stats (stored in SQLite, never transmitted) for AI suggestions (D8). Usage data never leaves the machine. |
| **Auto-updating without consent** | Desktop app auto-updates that happen without user approval are hostile UX for power users who pin specific versions. | Check for updates on launch, show a notification with changelog, let the user decide when to update. Tauri's built-in updater supports this. |
| **Calendar as primary scheduler** | Building a full calendar with event creation, invitations, recurring events, and timezone handling is enormous. CalDAV sync already exists for viewing. | CalDAV read + display (already works). Event creation via CalDAV write. Don't rebuild Google Calendar. Link to external calendar for complex scheduling. |

---

## Feature Dependencies

```
T1 (Setup wizard) ---- standalone, no deps, should be FIRST
    |
    v
T2 (Dark/light/system) ---> T3 (Curated presets) ---> D3 (Advanced editor) ---> D4 (Import/export gallery)
    |
T4 (Dashboard grid) + T5 (Edit mode) ---> D2 (Module primitives) ---> D1 (Bjorn module builder)
    |                                                                       |
    v                                                                       v
T10 (Unread badges) ---- depends on existing notification infra       D8 (AI suggestions)
    |
T6 (Loading/error/empty states) ---- standalone, parallel with anything
T7 (Visual consistency) ---- standalone, parallel, should be EARLY
T8 (Responsive layout) ---- depends on T4 (grid must be responsive)
T9 (Page transitions) ---- standalone, parallel
T11 (Keyboard discoverability) ---- standalone, low effort
T12 (Full-text search) ---- depends on existing search infra
T13 (Data export) ---- standalone, parallel

D5 (Wiki linking) + D6 (WYSIWYG editor) ---- can be parallel, both touch notes
D7 (VM viewer) ---- standalone
D9 (Finance module) ---- standalone, but better after D2 (primitives) and D1 (Bjorn)
D10 (Health module) ---- standalone, but better after D2 (primitives) and D1 (Bjorn)
```

### Critical Path

```
T1 --> T2+T3 --> T4+T5 --> D2 --> D1 --> D8
                    \                 \
                     \--> T8           \--> D9, D10 (Bjorn can assist)
```

The critical path runs through: **onboarding --> theming --> dashboard grid --> primitives --> Bjorn module builder --> AI suggestions**. Everything else can be parallelized around this spine.

---

## MVP Recommendation

**Prioritize (ship before public v1.0):**

1. **T1 - Setup wizard** -- Without this, no new user can set up the app. Gating factor for open-source adoption.
2. **T6 - Loading/error/empty states** -- Low-hanging fruit that dramatically improves perceived quality. Systematic pass.
3. **T7 - Visual consistency** -- The app has 17+ pages with inconsistent styles. Unifying them is the single biggest quality-of-life improvement.
4. **T2+T3 - Theming (dark/light/system + presets)** -- Users expect theme choice on first launch. Part of the setup wizard flow.
5. **T4+T5 - Dashboard grid + edit mode** -- The dashboard is the home screen. Making it customizable is what turns a "collection of pages" into a "command center."
6. **T8 - Responsive layout** -- Target audience uses multi-monitor setups. Broken resizing = broken product.
7. **D2 - Module primitives** -- Foundation for both manual dashboard customization and Bjorn's code generation.
8. **D1 - Bjorn module builder** -- The differentiating feature. Ship a working version even if limited to simple modules at first.

**Defer to post-v1.0:**

- **D3/D4 - Advanced theme editor + gallery**: Nice-to-have. Presets are enough for launch.
- **D5/D6 - Notes overhaul**: The notes work today (CouchDB sync). Wiki linking and WYSIWYG are big investments better done as a focused follow-up.
- **D7 - VM viewer**: Cool but niche even within the target audience.
- **D8 - AI suggestions**: Requires D1 to be stable first, plus usage data collection.
- **D9/D10 - Finance + Health modules**: Standalone verticals that can ship as updates. Better yet, these are prime candidates for Bjorn to generate once D1 works.
- **T13 - Data export**: Important for trust but can ship shortly after v1.0.

---

## Competitive Landscape Summary

| Competitor | What They Do Well | What OpenClaw Does Better |
|-----------|-------------------|---------------------------|
| **Notion** | All-in-one workspace, databases, AI content generation, collaboration | Local-first, self-hosted, no subscription, AI builds entire modules not just content, homelab integration |
| **Obsidian** | Local markdown, wiki links, graph view, plugin ecosystem | Unified dashboard (Obsidian is notes-only), AI module builder, integrated messaging + tasks + monitoring |
| **Raycast** | Fast launcher, extensions, AI chat, clipboard history | Full dashboard (Raycast is a launcher), persistent UI, deeper integrations (not just quick actions) |
| **Home Assistant** | Smart home dashboards, automations, huge device ecosystem | Broader scope (not just IoT), AI code generation, messaging, productivity tools |
| **Grafana** | Dashboard visualization, data sources, alerting | Consumer-friendly (Grafana targets DevOps), life data not just metrics, AI module generation |
| **Dashy/Homarr** | Self-hosted dashboard, service status, simple setup | Active modules (not just links/status), AI extensibility, integrated data (not just bookmarks) |
| **Notion AI** | AI writing, summarization, search across workspace | AI generates entire functional UI modules, not just text content |

---

## Sources

- [Notion vs Obsidian Comparison (2026)](https://productive.io/blog/notion-vs-obsidian/) - Feature comparison, MEDIUM confidence
- [Notion AI Features (2026)](https://www.notion.com/product/ai) - Official, HIGH confidence
- [Notion 3.2 Release Notes](https://www.notion.com/releases/2026-01-20) - Official, HIGH confidence
- [Raycast Features and Extensions](https://www.raycast.com/) - Official, HIGH confidence
- [Raycast Developer Program](https://www.raycast.com/developer-program) - Official, HIGH confidence
- [Home Assistant Dashboards (2026.1-2026.3)](https://www.home-assistant.io/dashboards/) - Official, HIGH confidence
- [Grafana Dynamic Dashboards (2026)](https://grafana.com/whats-new/2026-01-14-dynamic-dashboards-in-public-preview/) - Official, HIGH confidence
- [Grafana Dashboard Docs](https://grafana.com/docs/grafana/latest/visualizations/dashboards/) - Official, HIGH confidence
- [Dashy - Self-Hosted Dashboard](https://dashy.to/) - Official, HIGH confidence
- [Homarr v1.0 Features](https://github.com/Lissy93/dashy) - Community, MEDIUM confidence
- [React Grid Layout](https://medium.com/@antstack/building-customizable-dashboard-widgets-using-react-grid-layout-234f7857c124) - Technical reference, MEDIUM confidence
- [Gridstack.js](https://gridstackjs.com/) - Official, HIGH confidence
- [AI App Builders 2026 (Figma)](https://www.figma.com/resource-library/ai-app-builders/) - Industry overview, MEDIUM confidence
- [AI App Builders Comparison (tech.co)](https://tech.co/ai/vibe-coding/best-ai-app-builders) - Industry overview, MEDIUM confidence
- [Code Execution Sandboxes for AI Agents (2026)](https://northflank.com/blog/best-code-execution-sandbox-for-ai-agents) - Technical reference, MEDIUM confidence
- [Best Budget Apps (NerdWallet 2026)](https://www.nerdwallet.com/finance/learn/best-budget-apps) - Consumer review, MEDIUM confidence
- [Dark Mode Implementation Guide (2025)](https://medium.com/design-bootcamp/the-ultimate-guide-to-implementing-dark-mode-in-2025-bbf2938d2526) - Technical reference, MEDIUM confidence
- [CSS light-dark() Function](https://medium.com/front-end-weekly/forget-javascript-achieve-dark-mode-effortlessly-with-brand-new-css-function-light-dark-2024-94981c61756b) - Technical reference, MEDIUM confidence
- [Obsidian Guide (SitePoint)](https://www.sitepoint.com/obsidian-beginner-guide/) - Tutorial, MEDIUM confidence
- [Personal Wiki Software 2026](https://zipdo.co/best/personal-wiki-software/) - Comparison, MEDIUM confidence
- [Onboarding Wizard Best Practices](https://userguiding.com/blog/what-is-an-onboarding-wizard-with-examples) - UX reference, MEDIUM confidence
- [Fluent 2 Onboarding Design](https://fluent2.microsoft.design/onboarding) - Official design system, HIGH confidence
- [Notification Center Architecture (Courier)](https://www.courier.com/blog/how-to-build-a-notification-center-for-web-and-mobile-apps) - Technical reference, MEDIUM confidence
- [Self-Hosted Dashboards (XDA)](https://www.xda-developers.com/self-hosted-dashboards-that-can-change-your-life/) - Consumer review, MEDIUM confidence
