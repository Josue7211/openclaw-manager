# OpenClaw Manager — iOS Quick Capture Shortcut

Capture tasks, ideas, and notes from anywhere on your iPhone and send them straight into OpenClaw Manager.

---

## Prerequisites

- OpenClaw Manager running and reachable at `http://<your-server-ip>:3000` (or your server IP)
- `CAPTURE_API_KEY` set in your `.env.local` (see below)
- iOS Shortcuts app

---

## 1. Set the API Key (server side)

Add this to `/path/to/mission-control/.env.local`:

```
CAPTURE_API_KEY=your-secret-key-here
```

Restart the Next.js server after saving. If `CAPTURE_API_KEY` is **not set**, the endpoint accepts all requests (handy for local-only use, not recommended over a network).

---

## 2. Build the iOS Shortcut

Open the **Shortcuts** app → tap **+** to create a new shortcut.
Name it **"OpenClaw Manager Capture"**.

### Action 1 — Ask for Input
- Action: **Ask for Input**
- Prompt: `Capture`
- Input Type: Text
- Default Answer: *(leave blank)*

### Action 2 — Choose from Menu
- Action: **Choose from Menu**
- Prompt: `Type`
- Menu items (add exactly as shown):
  - `Task`
  - `Idea`
  - `Note`
  - `Decision`

### Action 3 — Get Contents of URL (add once per menu item, inside each branch)

Repeat this block inside **each** menu branch (Task, Idea, Note, Decision):

| Field | Value |
|---|---|
| Action | **Get Contents of URL** |
| URL | `http://<your-server-ip>:3000/api/quick-capture` |
| Method | `POST` |
| Request Body | JSON |
| **Body key** `content` | **Value** → *Provided Input* (the Ask for Input variable) |
| **Body key** `type` | **Value** → literal text matching the branch name (e.g. `Task`) |

**Headers** (tap "Headers" → add two rows):

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-Capture-Key` | `your-secret-key-here` |

> **Tip:** In the Shortcuts editor, set the JSON body using the "+" button to add key/value pairs. Set `content` to the variable from "Ask for Input" and `type` to the literal string for that branch.

### Action 4 — Show Notification
- Action: **Show Notification**
- Title: `OpenClaw Manager`
- Body: `Captured!`

---

## 3. Optional: Add to Home Screen

In the shortcut editor tap **⋯** → **Add to Home Screen** → give it an icon and name.

---

## 4. Test It

1. Run the shortcut
2. Type something like `Buy groceries` and pick **Task**
3. Check OpenClaw Manager → the item should appear in your Todos

---

## Routing Logic

| Type | Target table |
|---|---|
| Task | `todos` (title, completed=false) |
| Idea | `ideas` (title, status='pending') |
| Note / Decision | `captures` (if exists), else `todos` with `[Note]`/`[Decision]` prefix |

---

## API Reference

**POST** `/api/quick-capture`

```json
{
  "content": "Your captured text",
  "type": "Task",
  "source": "ios-shortcut"
}
```

Headers:
```
Content-Type: application/json
X-Capture-Key: your-secret-key-here
```

Response:
```json
{ "ok": true, "id": "uuid-or-int" }
```
