# API Reference

All endpoints are served by the embedded Axum server at `http://127.0.0.1:3000/api/`.
Every request (except auth-exempt paths) requires an `X-API-Key` header matching the `MC_API_KEY` stored in the OS keychain.

---

## Health

### GET /api/health
Server liveness check.
**Response:** `{ "ok": true }`

---

## Messages (iMessage via BlueBubbles)

### GET /api/messages
List conversations or fetch messages for a specific conversation.
**Query:** `?conversation=<chatGuid>&limit=25&before=<guid>&since=<epochMs>&offset=0&filter=all|junk|unfiltered`
**Response (conversations):** `{ "conversations": Conversation[] }`
**Response (messages):** `{ "messages": Message[] }`

### POST /api/messages
Send an iMessage.
**Body:** `{ "chatGuid": string, "text": string, "selectedMessageGuid"?: string }`
**Response:** `{ "status": 200 }` (proxied from BlueBubbles)

### GET /api/messages/avatar
Get a contact's avatar image by phone/email address.
**Query:** `?address=<phone_or_email>`
**Response:** JPEG image bytes (or 404)

### POST /api/messages/avatar
Batch-fetch avatar availability for multiple addresses.
**Body:** `{ "addresses": string[] }`
**Response:** `{ "<address>": true|false, ... }`

### GET /api/messages/link-preview
Fetch OpenGraph metadata for a URL.
**Query:** `?url=<url>`
**Response:** `{ "title": string, "description": string, "image": string, "url": string }`

### GET /api/messages/attachment
Download a message attachment by GUID.
**Query:** `?guid=<attachment_guid>&uti=<optional_uti>`
**Response:** Binary file data with appropriate Content-Type

### POST /api/messages/react
Add or remove a tapback reaction.
**Body:** `{ "chatGuid": string, "selectedMessageGuid": string, "reaction": string }`
**Reactions:** `love`, `like`, `dislike`, `laugh`, `emphasize`, `question` (prefix `-` to remove)

### POST /api/messages/read
Mark a conversation as read or unread.
**Body:** `{ "chatGuid": string, "action"?: "read" | "unread" }`

### POST /api/messages/send-attachment
Send a file attachment in a conversation.
**Body:** `{ "chatGuid": string, "message"?: string, "selectedMessageGuid"?: string, "fileData": string (base64), "fileName": string, "fileContentType"?: string }`

### GET /api/messages/stream
SSE stream of new iMessage events (real-time message delivery).
**Response:** Server-Sent Events with message JSON payloads

### GET /api/messages/debug *(debug builds only)*
Diagnostic info about the messages subsystem.

---

## Chat (AI via OpenClaw)

### POST /api/chat
Send a message to the AI assistant.
**Body:** `{ "text"?: string, "images"?: string[] (data URLs) }`
**Response:** `{ "ok": true }`

### GET /api/chat/history
Fetch chat message history.
**Response:** `{ "messages": [{ "id": string, "role": string, "text": string, "timestamp": string, "images"?: string[] }] }`

### GET /api/chat/stream
SSE stream of new chat messages (polls session file or remote API).
**Response:** Server-Sent Events with ChatMessage JSON payloads

### GET /api/chat/ws
WebSocket endpoint for real-time chat message delivery.
**Auth:** Pass `?apiKey=<key>` as query parameter (WS can't send custom headers).

### GET /api/chat/image
Serve an image from allowed OpenClaw directories.
**Query:** `?path=<file_path>`
**Response:** Image bytes with appropriate Content-Type

---

## Agents

### GET /api/agents
List all agents from Supabase.
**Response:** `{ "agents": Agent[] }`

### PATCH /api/agents
Update an agent's properties.
**Body:** `{ "id": string, "display_name"?: string, "emoji"?: string, "role"?: string, "status"?: string, "current_task"?: string, "color"?: string, "model"?: string, "sort_order"?: number }`
**Response:** `{ "agent": Agent }`

### GET /api/agents/active-coders
Detect running Claude processes via `ps aux`.
**Response:** `{ "total": number, "kodaActive": boolean, "subagents": [{ "id": string, "name": string, "model": string, "status": string }] }`

### GET /api/subagents/active
Detect active subagent processes (with --dangerously flag) plus OpenClaw sessions.
**Response:** `{ "active": boolean, "count": number, "tasks": [{ "id": string, "label": string, "agentId": string, "startedAt": string }] }`

---

## Auth (OAuth)

### GET /api/auth/nonce
Generate a fresh OAuth nonce for CSRF protection.
**Response:** `{ "nonce": string }`

### GET /api/auth/tauri-session
Poll for a pending OAuth authorization code.
**Response:** `{ "code": string | null }`

### POST /api/auth/tauri-session
Store an OAuth authorization code for the WebView to pick up.
**Body:** `{ "code": string }`
**Response:** `{ "ok": true }`

### GET /api/auth/callback
OAuth callback endpoint (browser redirect). Stores the authorization code and renders a success/error HTML page.
**Query:** `?code=<auth_code>&state=<nonce>&error=<err>&error_description=<desc>`
**Response:** HTML page

### GET /api/auth/favicon.png
Serve the app favicon (for OAuth callback page).

### GET /api/auth/logo.png
Serve the app logo (for OAuth callback page).

---

## Todos

### GET /api/todos
List all todos.
**Response:** `{ "todos": Todo[] }`

### POST /api/todos
Create a new todo.
**Body:** `{ "text": string }`
**Response:** `{ "todo": Todo }`

### PATCH /api/todos
Update a todo (toggle done, set due date).
**Body:** `{ "id": string, "done"?: boolean, "due_date"?: string | null }`
**Response:** `{ "todo": Todo }`

### DELETE /api/todos
Delete a todo.
**Body:** `{ "id": string }`
**Response:** `{ "ok": true }`

---

## Missions

### GET /api/missions
List all missions (with SQLite cache fallback).
**Response:** `{ "missions": Mission[] }`

### POST /api/missions
Create a new mission.
**Body:** `{ "title": string, "assignee"?: string }`
**Response:** `{ "mission": Mission }`

### PATCH /api/missions
Update a mission (status, assignee, progress, log_path).
**Body:** `{ "id": string, "status"?: string, "assignee"?: string, "progress"?: number, "log_path"?: string }`
**Statuses:** `pending`, `active`, `done`, `failed`, `awaiting_review`
**Response:** `{ "mission": Mission }`

### DELETE /api/missions
Delete a mission.
**Body:** `{ "id": string }`
**Response:** `{ "ok": true }`

### GET /api/mission-events
Fetch events for a mission. Also supports inline ingest via `?action=ingest`.
**Query:** `?mission_id=<uuid>` or `?action=ingest&mission_id=<uuid>&log_path=/tmp/foo.log`
**Response (fetch):** `{ "events": MissionEvent[] }`
**Response (ingest):** `{ "success": true, "events_inserted": number, "model_name"?: string }`

### POST /api/mission-events
Ingest log content as mission events.
**Body:** `{ "mission_id": string, "log_content": string, "mission_duration_seconds"?: number }`
**Response:** `{ "events_inserted": number }`

### POST /api/mission-events/bjorn
Insert a single real-time event for a mission (auto-increments seq).
**Body:** `{ "mission_id": string, "event_type": string, "content": string, "elapsed_seconds"?: number }`
**Response:** `{ "ok": true, "event": MissionEvent }`

### POST /api/missions/sync-agents
Detect running coding processes and reconcile agent mission status.
**Response:** `{ "ok": true, "processes": number }`

---

## Pipeline

### POST /api/pipeline/spawn
Route and spawn a new pipeline task to an agent.
**Body:** `{ "title": string, "complexity": number (0-100), "task_type": string (code|non-code|research|config), "description"?: string, "workdir"?: string, "images"?: string[] }`
**Response:** `{ "action": string, "mission_id": string, "agent": string }`

### POST /api/pipeline/complete
Mark a pipeline mission as complete or failed, with optional escalation/retry.
**Body:** `{ "mission_id": string, "status": "done" | "failed", "failure_reason"?: string }`
**Response:** `{ "action": string, ... }`

### POST /api/pipeline/review
Submit a review verdict for a completed pipeline mission.
**Body:** `{ "mission_id": string, "verdict": "approved" | "rejected", "notes"?: string }`
**Response:** `{ "action": string, ... }`

### GET /api/pipeline-events
List recent pipeline events (limit 50, newest first).
**Response:** `{ "events": PipelineEvent[] }`

### POST /api/pipeline-events
Record a pipeline event.
**Body:** `{ "event_type": string, "description": string, "agent_id"?: string, "mission_id"?: string, "idea_id"?: string, "metadata"?: object }`
**Response:** `{ "event": PipelineEvent }`

---

## Ideas

### GET /api/ideas
List all ideas, optionally filtered by status.
**Query:** `?status=<pending|approved|rejected>`
**Response:** `{ "ideas": Idea[] }`

### POST /api/ideas
Create a new idea.
**Body:** `{ "title": string, "description"?: string, "why"?: string, "effort"?: string, "impact"?: string, "category"?: string }`
**Response:** `{ "idea": Idea }`

### PATCH /api/ideas
Update an idea's status or link to a mission. Approving auto-creates a mission.
**Body:** `{ "id": string, "status"?: string, "mission_id"?: string }`
**Response:** `{ "idea": Idea }`

### DELETE /api/ideas
Delete an idea.
**Query:** `?id=<uuid>`
**Response:** `{ "ok": true }`

---

## Decisions

### GET /api/decisions
List all decisions, optionally searched by keyword.
**Query:** `?q=<search_term>`
**Response:** `{ "decisions": Decision[] }`

### POST /api/decisions
Create a new decision.
**Body:** `{ "title": string, "decision": string, "rationale": string, "alternatives"?: string, "outcome"?: string, "tags"?: string[], "linked_mission_id"?: string }`
**Response:** `{ "decision": Decision }`

### PATCH /api/decisions
Update a decision.
**Body:** `{ "id": string, "title"?: string, "decision"?: string, "alternatives"?: string, "rationale"?: string, "outcome"?: string, "tags"?: string[], "linked_mission_id"?: string }`
**Response:** `{ "decision": Decision }`

### DELETE /api/decisions
Delete a decision.
**Body:** `{ "id": string }`
**Response:** `{ "ok": true }`

---

## Calendar (CalDAV)

### GET /api/calendar
Fetch calendar events from CalDAV (30-day window centered on today).
**Response:** `{ "events": [{ "id": string, "title": string, "start": string, "end": string, "allDay": boolean, "calendar": string }] }`

---

## Email (IMAP)

### GET /api/email
Fetch recent emails from an IMAP mailbox.
**Query:** `?folder=INBOX&account_id=<optional>`
**Response:** `{ "emails": [{ "id": string, "from": string, "subject": string, "date": string, "preview": string, "read": boolean, "folder": string }] }`

### PATCH /api/email
Mark an email as read or unread.
**Body:** `{ "id": string (format: "FOLDER:UID"), "read": boolean }`
**Response:** `{ "ok": true }`

---

## HomeLab (Proxmox + OPNsense)

### GET /api/homelab
Fetch Proxmox node/VM stats and OPNsense firewall status.
**Response:** `{ "proxmox": { "nodes": Node[], "vms": VM[] }, "opnsense": { "status": string, "cpu": number, "mem_used": number, "mem_total": number, "uptime": number, "wan_in": string, "wan_out": string }, "mock"?: boolean }`

---

## Media (Plex + Sonarr + Radarr)

### GET /api/media
Fetch media status: now playing, recently added, and upcoming episodes.
**Response:** `{ "now_playing": NowPlaying | null, "recently_added": RecentlyAdded[], "upcoming": Upcoming[], "mock": boolean }`

---

## Habits

### GET /api/habits
List all habits.
**Response:** `{ "habits": Habit[] }`

### POST /api/habits
Create a new habit.
**Body:** `{ "name": string, "emoji"?: string, "color"?: string }`
**Response:** `{ "habit": Habit }`

### DELETE /api/habits
Delete a habit.
**Body:** `{ "id": string }`
**Response:** `{ "ok": true }`

### GET /api/habits/entries
List habit completion entries.
**Query:** `?since=<date>`
**Response:** `{ "entries": HabitEntry[] }`

### POST /api/habits/entries
Toggle a habit entry for a date (creates if missing, deletes if exists).
**Body:** `{ "habit_id": string, "date": string }`
**Response:** `{ "done": boolean }`

---

## Knowledge Base

### GET /api/knowledge
List or search knowledge entries.
**Query:** `?q=<search>&tag=<tag>`
**Response:** `{ "entries": KnowledgeEntry[] }`

### POST /api/knowledge
Create a knowledge entry.
**Body:** `{ "title": string, "content"?: string, "tags"?: string[], "source_url"?: string, "source_type"?: string }`
**Response:** `{ "entry": KnowledgeEntry }`

### DELETE /api/knowledge
Delete a knowledge entry.
**Query:** `?id=<uuid>`
**Response:** `{ "ok": true }`

---

## Memory (OpenClaw)

### GET /api/memory
Fetch recent memory entries (from local filesystem or remote OpenClaw API).
**Response:** `{ "entries": [{ "date": string, "preview": string, "path": string }] }`

---

## Changelog

### GET /api/changelog
List all changelog entries.
**Response:** `{ "entries": ChangelogEntry[] }`

### POST /api/changelog
Create a changelog entry.
**Body:** `{ "title": string, "date": string, "description"?: string, "tags"?: string[] }`
**Response:** `{ "entry": ChangelogEntry }`

### DELETE /api/changelog
Delete a changelog entry.
**Body:** `{ "id": string }`
**Response:** `{ "ok": true }`

---

## Workflow Notes

### GET /api/workflow-notes
List workflow notes, optionally filtered by category.
**Query:** `?category=<category>`
**Response:** `{ "notes": WorkflowNote[] }`

### POST /api/workflow-notes
Create a workflow note.
**Body:** `{ "category": string, "note": string }`
**Response:** `{ "note": WorkflowNote }`

### PATCH /api/workflow-notes
Update a workflow note (mark as applied).
**Body:** `{ "id": string, "applied"?: boolean }`
**Response:** `{ "note": WorkflowNote }`

---

## Quick Capture

### POST /api/quick-capture
Create a quick capture item (routes to appropriate table based on type).
**Body:** `{ "content": string, "type": "Note" | "Task" | "Idea" | "Decision", "source"?: string }`
**Response:** `{ "ok": true, "id": string }`

---

## Reviews

### GET /api/daily-review
Fetch a daily review by date.
**Query:** `?date=YYYY-MM-DD`
**Response:** `{ "review": DailyReview | null }`

### POST /api/daily-review
Create or update a daily review (upserts by date).
**Body:** `{ "date": string, "accomplishments"?: string, "priorities"?: string, "notes"?: string }`
**Response:** `{ "review": DailyReview }`

### GET /api/weekly-review
Fetch weekly reviews.
**Query:** `?week_start=YYYY-MM-DD`
**Response:** `{ "reviews": WeeklyReview[] }`

### POST /api/weekly-review
Create or update a weekly review (upserts by week_start).
**Body:** `{ "week_start": string, "wins"?: any, "incomplete_count"?: any, "priorities"?: any, "reflection"?: any }`
**Response:** `{ "review": WeeklyReview }`

### GET /api/retrospectives
List all retrospectives.
**Response:** `{ "retrospectives": Retrospective[] }`

### POST /api/retrospectives
Create a retrospective for a mission.
**Body:** `{ "mission_id": string, "what_went_well"?: any, "what_went_wrong"?: any, "improvements"?: any, "tags"?: string[] }`
**Response:** `{ "retrospective": Retrospective }`

---

## Reminders (via Mac Bridge)

### GET /api/reminders
Fetch Apple Reminders via the Mac Bridge service.
**Query:** `?filter=all|incomplete|completed|today`
**Response:** `{ "reminders": Reminder[], "source": "bridge" }`

### PATCH /api/reminders
Mark a reminder as complete.
**Body:** `{ "id": string, "completed": true }`
**Response:** `{ "ok": true }`

---

## Notifications (ntfy)

### POST /api/notify
Send a push notification via ntfy.
**Body:** `{ "title": string, "message": string, "priority"?: number, "tags"?: string[] }`
**Response:** `{ "ok": true }`

---

## Deploy

### POST /api/deploy
Transition all agents with status `awaiting_deploy` to `active`.
**Response:** `{ "ok": true, "deployed": number }`

---

## Search

### GET /api/search
Search across todos and missions.
**Query:** `?q=<search_term>`
**Response:** `{ "todos": Todo[], "missions": Mission[] }`

---

## Stale Items

### GET /api/stale
List items untouched for 3+ days (todos, missions, ideas).
**Response:** `{ "items": [{ "id": string, "type": "todo" | "mission" | "idea", "staleSince": string, ... }] }`

### PATCH /api/stale
Mark a stale item as done or snooze it (resets updated_at).
**Body:** `{ "id": string, "type": "todo" | "mission" | "idea", "action": "done" | "snooze" }`
**Response:** `{ "ok": true }`

### DELETE /api/stale
Delete a stale item.
**Body:** `{ "id": string, "type": "todo" | "mission" | "idea" }`
**Response:** `{ "ok": true }`

---

## Status & Monitoring

### GET /api/status
Get the primary AI agent's identity and online status.
**Response:** `{ "name": string, "emoji": string, "model": string, "status": string, "lastActive": string, "host": string, "ip": string }`

### GET /api/status/connections
Test connectivity to BlueBubbles, OpenClaw, and Supabase (with Tailscale peer verification).
**Response:** `{ "bluebubbles": { "status": string, "latency_ms"?: number, "peer_hostname"?: string, "peer_verified"?: boolean }, "openclaw": { ... }, "supabase": { ... } }`

### GET /api/status/health
Comprehensive health snapshot: version, uptime, platform, SQLite stats, service connectivity.
**Response:** `{ "version": string, "uptime_seconds": number, "platform": string, "hostname": string, "sqlite_cache_entries": number, "sqlite_db_size_bytes": number, "services": { "bluebubbles": object, "openclaw": object, "supabase": object } }`

### GET /api/status/tailscale
List Tailscale peers.
**Response:** `{ "peers": [{ "ip": string, "hostname": string, "online": boolean }] }`

### GET /api/heartbeat
Fetch the AI agent's heartbeat (current tasks from HEARTBEAT.md).
**Response:** `{ "lastCheck": string | null, "status": string, "tasks": string[] }`

### GET /api/processes
List running Claude/AI coding processes with CPU/memory stats and registry metadata.
**Response:** `{ "processes": ProcessEntry[], "agents": [] }`

### POST /api/processes
Register a process in the agent registry.
**Body:** `{ "pid": string, "agentId"?: string, "agentName"?: string, "emoji"?: string, "task"?: string, "logFile"?: string, "mission_id"?: string, "mission_title"?: string, "started_at"?: string }`
**Response:** `{ "ok": true }`

### GET /api/feature-flags
Get the list of enabled app modules from user preferences.
**Response:** `{ "ok": true, "data": { "enabled_modules": string[] } }`

---

## Cache (Supabase)

### GET /api/cache
Read all Supabase cache entries as a key-value map.
**Response:** `{ "<key>": <value>, ... }`

### GET /api/cache-refresh
Read raw cache rows from Supabase.
**Response:** `{ "rows": CacheRow[] }`

### POST /api/cache-refresh
Refresh cache by fetching from local API endpoints and upserting to Supabase.
**Response:** `{ "ok": number, "total": number }`

---

## User Preferences

### GET /api/user-preferences
Get the current user's preferences object.
**Response:** `{ "ok": true, "data": { ... } }`

### PATCH /api/user-preferences
Shallow-merge new preferences into the existing object (upserts on first write).
**Body:** `{ "preferences": { "key": "value", ... } }`
**Response:** `{ "ok": true, "data": { ... } }`

---

## OpenClaw CLI

### GET /api/sessions
List OpenClaw sessions (via `openclaw sessions list --json`).
**Response:** `{ "sessions": Session[] }`

### GET /api/subagents
List OpenClaw subagents (via `openclaw subagents list --json`).
**Response:** `{ "count": number, "agents": Agent[] }`

### GET /api/crons
List OpenClaw cron jobs (via `openclaw cron list --json`).
**Response:** `{ "jobs": CronJob[] }`

---

## Workspace (OpenClaw files)

### GET /api/workspace/files
List core workspace files and memory files.
**Response:** `{ "coreFiles": [{ "name": string, "path": string }], "memoryFiles": [{ "name": string, "path": string }] }`

### GET /api/workspace/file
Read a workspace file.
**Query:** `?path=<relative_path>`
**Response:** `{ "content": string }`

### POST /api/workspace/file
Write content to a workspace file.
**Body:** `{ "path": string, "content": string }`
**Response:** `{ "ok": true }`

### DELETE /api/workspace/file
Delete a workspace file (core files are protected).
**Query:** `?path=<relative_path>`
**Response:** `{ "ok": true }`

---

**Total: 85 endpoints across 22 domain groups.**
