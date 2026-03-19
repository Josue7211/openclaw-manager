# Manual Testing Checklist

Use this checklist for end-to-end verification after major changes. Clear `localStorage` before a full pass to test fresh-install flows.

---

## App Launch

- [ ] App opens without errors (no console crashes)
- [ ] Sidebar renders with all nav items (Personal + Agent sections)
- [ ] Onboarding welcome wizard shows on first launch (clear `localStorage` key `onboarding-complete`)
- [ ] Onboarding dismiss button sets flag and closes overlay
- [ ] AuthGuard redirects to `/login` when unauthenticated
- [ ] AuthGuard shows loading spinner during session check
- [ ] MFA enforcement: partial `aal1` session is signed out

## Sidebar

- [ ] Resize by dragging the right edge handle
- [ ] Snap to icon-only mode when width < 110px on release
- [ ] Expand/collapse button toggles between 64px and 260px
- [ ] Typewriter animation on "MISSION CONTROL" text as sidebar widens
- [ ] Logo image renders with drop-shadow glow
- [ ] "Personal Dashboard" section toggle (chevron rotates, items collapse/expand)
- [ ] "Agent Dashboard" section toggle
- [ ] Module visibility: disabled modules are hidden from nav (toggle in Settings > Modules)
- [ ] Quick Capture opens/closes inline
- [ ] Quick Capture: type selector (Note/Task/Idea/Decision) toggles correctly
- [ ] Quick Capture: save button disabled when textarea empty
- [ ] Quick Capture: Cmd+Enter saves, Escape closes
- [ ] Quick Capture: Task type posts to `/api/todos`, others to `/api/capture`
- [ ] Quick Capture: success flash ("Saved!") then auto-close
- [ ] Notification bell shows unread count badge
- [ ] Notification bell click opens panel (portal, positioned relative to button)
- [ ] Connection status dots show correct colors (green/yellow/red)
- [ ] Connection status: click expands detail panel showing service names + latency
- [ ] Settings link at bottom works, shows active state when on `/settings`
- [ ] Hover prefetch: hovering Home prefetches todos + missions, hovering Settings prefetches status
- [ ] Nav items show staggered `fadeInUp` animation on mount
- [ ] Active nav item shows accent-colored left border and icon

## Global Search

- [ ] Search input visible in sidebar (compact mode)
- [ ] Typing triggers debounced search across todos, missions, calendar, email, reminders, knowledge
- [ ] Results render as flat list with icons per type
- [ ] Arrow keys navigate results, Enter navigates to selected item
- [ ] Escape or clear input closes results dropdown
- [ ] Focus trap keeps tab cycling within search dropdown when open

## Command Palette

- [ ] Cmd/Ctrl+K opens command palette
- [ ] Shows page navigation items with icons
- [ ] Shows action items: Toggle theme, Toggle DND, Mark all read, Export data
- [ ] Recent conversations appear as "conversation" category items
- [ ] Fuzzy search filters items in real time
- [ ] Arrow keys navigate, Enter executes action
- [ ] Escape closes palette
- [ ] Focus trap active while open

## Keyboard Shortcuts

- [ ] Cmd/Ctrl+/ opens keyboard shortcuts modal
- [ ] All default bindings listed (palette, shortcuts, nav-home, nav-dashboard, etc.)
- [ ] Cmd+H navigates to Home
- [ ] Cmd+D navigates to Dashboard
- [ ] Cmd+A navigates to Agents
- [ ] Cmd+M navigates to Missions
- [ ] Cmd+T navigates to Todos
- [ ] Cmd+E navigates to Email
- [ ] Cmd+I navigates to Messages
- [ ] Cmd+, navigates to Settings
- [ ] Shortcut display shows platform-correct modifier (Command on Mac, Ctrl on others)

## Messages

- [ ] Conversation list loads from API
- [ ] Click conversation: messages load in thread view
- [ ] Send a message (compose bar at bottom)
- [ ] Receive a message (SSE real-time updates)
- [ ] Pin/unpin conversation (context menu or button)
- [ ] Mute/unmute conversation
- [ ] Search within conversation (search icon in thread header)
- [ ] Drag-and-drop file attachment
- [ ] New conversation compose (PenSquare button)
- [ ] Delivery status indicators (Sent check / Delivered double-check / Read)
- [ ] Back button (ArrowLeft) returns to full conversation list
- [ ] URL preserves selected conversation via search params
- [ ] Reactions display via ReactionPills component
- [ ] Link previews render via LinkPreviewCard
- [ ] Audio messages render via AudioWaveform
- [ ] Video thumbnails render via VideoThumbnail
- [ ] Image attachments open in Lightbox on click
- [ ] Context menu (MessageMenu) shows on right-click or long-press
- [ ] Reply threading: threadOriginatorGuid links replies to parent
- [ ] Contact avatars render (ContactAvatar / GroupAvatar)
- [ ] Virtual scrolling (useVirtualizer) handles long message lists smoothly
- [ ] Skeleton loaders show while conversations/messages are loading
- [ ] Failed message indicator shows retry option
- [ ] Notification sound plays on new incoming message (when not muted/DND)

## Chat (AI)

- [ ] Send message to AI assistant
- [ ] Receive streamed response
- [ ] Model selector dropdown works (Sonnet 4.6, Opus 4.6, Haiku 4.5)
- [ ] System prompt saves to localStorage
- [ ] WebSocket connection indicator shows connected/disconnected state
- [ ] Image attachment: paste or click to add images
- [ ] Image preview with remove (X) button before sending
- [ ] Lightbox opens when clicking images in chat history
- [ ] Markdown rendering in assistant responses (ReactMarkdown + remarkGfm)
- [ ] Auto-scroll to bottom on new messages
- [ ] "Scroll to bottom" button appears when scrolled up
- [ ] Optimistic send: message appears immediately with "sending" status
- [ ] Error state shown when backend/OpenClaw is unreachable
- [ ] Message timestamps display correctly
- [ ] Chat history loads on mount from API

## Settings

### Navigation
- [ ] All 11 sections listed in left panel (Agent, Gateway, OpenClaw Manager, User, Connections, Display, Keybindings, Modules, Notifications, Account & Security, Data & Backup)
- [ ] Sections grouped under "General" and "App Settings"
- [ ] Arrow keys navigate section list (up/down)
- [ ] Click section: right panel shows section content
- [ ] Back arrow returns to section list

### Display
- [ ] Theme toggle (Dark / Light / System) applies immediately
- [ ] Accent color picker: preset swatches apply accent across entire UI
- [ ] Title bar visibility toggle
- [ ] Title bar auto-hide toggle
- [ ] Sidebar header ("MISSION CONTROL") visibility toggle

### Keybindings
- [ ] All default keybindings listed with current key assignments
- [ ] Click "Edit" on a binding, press new key to reassign
- [ ] Cancel button aborts rebind
- [ ] "Reset all" button restores defaults
- [ ] Changes persist in localStorage

### Modules
- [ ] All app modules listed with toggle switches
- [ ] Disabling a module hides it from sidebar nav
- [ ] Re-enabling a module restores it in sidebar nav

### Notifications
- [ ] DND (Do Not Disturb) toggle
- [ ] System notifications toggle
- [ ] In-app notifications toggle
- [ ] Notification sound toggle
- [ ] ntfy integration: URL and topic fields
- [ ] ntfy test button sends test notification and shows status

### Connections
- [ ] BlueBubbles URL field (loaded from Tauri keychain)
- [ ] OpenClaw API URL field (loaded from Tauri keychain)
- [ ] Expected hostname fields for peer verification
- [ ] Save button stores to keychain + user preferences
- [ ] Test Connections button: shows status, latency, and peer hostname for each service

### Account & Security
- [ ] User email displayed
- [ ] Password change form (new + confirm)
- [ ] MFA (TOTP) enrollment flow: QR code display, secret display, verification code entry
- [ ] MFA unenroll/disable
- [ ] Logout button signs out via Supabase

### Data & Backup
- [ ] Export data button (downloads JSON)
- [ ] Import data: file picker triggers import
- [ ] Import status message shown after completion
- [ ] User name / avatar editing with save confirmation

### User
- [ ] Name field editable with save
- [ ] Avatar field editable with save
- [ ] Saved state shows brief flash confirmation

## Notifications

- [ ] System notification (browser Notification API) fires on new message when `system-notifs` enabled
- [ ] In-app toast/notification center shows new notification when `in-app-notifs` enabled
- [ ] Notification sound (tri-tone chime via Web Audio API) plays when `notif-sound` enabled
- [ ] DND silences all notifications (system, in-app, sound)
- [ ] Per-conversation mute suppresses notifications from that conversation
- [ ] Notification center panel: grouped notifications with expand/collapse
- [ ] "Mark all read" clears unread state on all notifications
- [ ] "Clear all" removes all notifications from the list
- [ ] Individual notification click: marks as read + navigates to route
- [ ] Unread dot pulses with animation
- [ ] Notification center closes on outside click
- [ ] Notification center closes on Escape
- [ ] Notification count badge caps at "99+"
- [ ] Focus trap active inside notification panel

## Offline & Error Handling

- [ ] Offline banner shows when `navigator.onLine` is false
- [ ] Online restoration triggers offline queue replay (`processQueue`)
- [ ] Pending offline mutations count shown in UI
- [ ] Page error boundary catches component crashes, shows "This page crashed" card
- [ ] "Try again" button re-renders the failed component
- [ ] "Reload page" button does a full page reload
- [ ] API errors from `ApiError` show meaningful error messages
- [ ] Chat exponential backoff on polling failures (2s to 30s)

## Authentication

- [ ] Login page renders at `/login`
- [ ] Successful login redirects to `?next=` param or `/`
- [ ] Demo mode bypasses auth entirely (`isDemoMode()`)
- [ ] Demo mode banner visible when active
- [ ] Session expiry triggers redirect to login

## Performance

- [ ] Page transitions are smooth (no visible jank)
- [ ] Sidebar resize is smooth (CSS transition disabled during drag, enabled on release)
- [ ] Message scrolling is smooth (virtual scrolling for long lists)
- [ ] Theme switch is instant (no flash of unstyled content)
- [ ] Lazy-loaded components (CommandPalette, KeyboardShortcutsModal, OnboardingWelcome) load on demand via Suspense
- [ ] Hover prefetch warms React Query cache for target pages
- [ ] Nav sections use `memo` to avoid unnecessary re-renders

## Cross-Platform (Tauri)

- [ ] App runs in Tauri desktop shell without errors
- [ ] Tauri keychain read/write works for connection secrets (`get_secret` / `set_secret`)
- [ ] `openInBrowser` opens URLs in system browser via `@tauri-apps/plugin-shell`
- [ ] Non-Tauri (browser) environment: Tauri-specific features gracefully no-op
- [ ] Custom title bar renders correctly on macOS (traffic light buttons area)
- [ ] Title bar auto-hide behavior works (hides when not hovered)

## Other Pages (Smoke Tests)

- [ ] Dashboard (`/dashboard`) loads and renders
- [ ] Missions (`/missions`) loads and renders
- [ ] Agents (`/agents`) loads and renders
- [ ] Memory (`/memory`) loads and renders
- [ ] Todos (`/todos`) loads and renders
- [ ] Pipeline (`/pipeline`) loads and renders
- [ ] Email (`/email`) loads and renders
- [ ] Personal home (`/`) loads and renders
- [ ] Login (`/login`) loads and renders
- [ ] Search (`/search`) loads and renders
