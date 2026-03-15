# Dead Code Baseline — 2026-03-15

Tool: `knip 5.86.0` + `depcheck 1.4.7`

## Summary

| Category              | Count |
|-----------------------|-------|
| Unused files          |     5 |
| Unused exports        |    12 |
| Unused exported types |     9 |
| Unused dependencies   |     1 |
| Unused devDependencies|     2 |
| Unlisted dependencies |     1 |
| **Total issues**      | **30** |

## Unused Files (5 files, 1582 lines)

| File | Lines | Notes |
|------|-------|-------|
| `src/components/ConnectionStatus.tsx` | 218 | NOT DEAD — needs route or Settings embed |
| `src/lib/database.types.ts` | 866 | Generated Supabase types, never imported |
| `src/lib/hooks/useEventBus.ts` | 15 | Only referenced by itself and event-bus.ts |
| `src/pages/Status.tsx` | 479 | NOT DEAD — working health dashboard, just needs a route (or embed in Settings → Connections) |
| `src/tauri.d.ts` | 4 | Ambient type declaration, unused |

## Unused Exports (12)

| File | Exports | Impact |
|------|---------|--------|
| `src/components/NotificationCenter.tsx` | `markRead`, `clearNotifications`, `useNotifications` | 3 exports — public API surface never consumed externally |
| `src/components/Skeleton.tsx` | `SkeletonCard` | 1 component |
| `src/components/messages/ContactAvatar.tsx` | `hashColor`, `avatarCache`, `MAX_AVATAR_CACHE`, `avatarCacheSet`, `batchCheckPromise` | 5 exports — internal cache details exposed but only used within the file itself |
| `src/components/messages/ReactionPills.tsx` | `REACTION_EMOJI` | 1 constant |
| `src/lib/api.ts` | `setApiKey` | 1 function |
| `src/lib/event-bus.ts` | `on`, `off` | 2 functions — entire event bus module may be dead code |
| `src/lib/hooks/useChatSocket.ts` | `setChatSocketApiKey` | 1 function |
| `src/lib/hooks/usePageTitle.ts` | `useEditablePageTitle`, `usePageSubtitle` | 2 hooks |
| `src/lib/offline-queue.ts` | `getQueue`, `clearQueue` | 2 functions |
| `src/lib/sidebar-config.ts` | `undoSidebarConfig`, `redoSidebarConfig`, `moveItemToCategory` | 3 functions |
| `src/lib/supabase/client.ts` | `createAuthClient` | 1 function — CLAUDE.md explicitly says "never call createAuthClient() in components" |
| `src/lib/utils.ts` | `formatDate` | 1 function |

## Unused Exported Types (9)

| File | Types |
|------|-------|
| `src/components/NotificationCenter.tsx` | `NotificationType`, `Notification` |
| `src/lib/api.ts` | `ServiceName` |
| `src/lib/demo-data.ts` | `DemoConversation` |
| `src/lib/event-bus.ts` | `EventType`, `AppEvent` |
| `src/lib/keybindings.ts` | `Keybinding` |
| `src/lib/modules.ts` | `AppModule` |
| `src/lib/offline-queue.ts` | `QueuedMutation` |
| `src/lib/sidebar-config.ts` | `SidebarCategory`, `CustomModule`, `DeletedItem`, `SidebarConfig` |
| `src/lib/themes.ts` | `AccentPreset` |

## Unused npm Dependencies

| Package | Type | Size in node_modules |
|---------|------|---------------------|
| `@tauri-apps/plugin-notification` | dependency | 60K — never imported in any source file |
| `@testing-library/user-event` | devDependency | 1.4M — no test file imports it |
| `@vitest/coverage-v8` | devDependency | 56K — coverage runner, possibly used via CLI only |
| `@types/dompurify` | dependency | — listed as unused by knip |

Note: `tailwindcss` was flagged by depcheck but is a **false positive** (imported in `globals.css` via `@import "tailwindcss/preflight"`).

### Unlisted (used but not in package.json)

| Package | Used in |
|---------|---------|
| `@tauri-apps/plugin-shell` | `src/lib/tauri.ts` |

## Top 5 Most Impactful Removals

1. **`src/pages/Status.tsx`** (479 lines) + **`src/components/ConnectionStatus.tsx`** (218 lines) — 697 lines of dead page + component with no route. Likely a deprecated status page that was replaced.

2. **`src/lib/database.types.ts`** (866 lines) — Generated Supabase type definitions that nothing imports. Either integrate into the codebase or remove until actually needed.

3. **ContactAvatar internal exports** (`hashColor`, `avatarCache`, `MAX_AVATAR_CACHE`, `avatarCacheSet`, `batchCheckPromise`) — 5 exports that are only used within the file. Remove `export` keyword to reduce public API surface and prevent accidental coupling.

4. **`src/lib/event-bus.ts`** + **`src/lib/hooks/useEventBus.ts`** (82 lines) — The event bus `on`/`off` functions and the `useEventBus` hook are unused. The typed pub/sub system may be entirely dead code (CLAUDE.md says "DO NOT use custom DOM events for cross-component communication").

5. **`@tauri-apps/plugin-notification`** — Listed as a dependency but never imported. Adds unnecessary weight to the dependency tree. Remove from `package.json`.
