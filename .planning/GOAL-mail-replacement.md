# Goal: 10-Star Synced Mail Replacement

Make Email a real daily-driver inbox that syncs safely across every ClawControl
machine, not an AgentMail demo surface and not a single-Mac workaround.

## User Promise

- Show the user's real Proton inbox first.
- Sync mail account setup across Macs, Linux PCs, and laptops.
- Require a second unlock factor for synced secrets: account password today,
  recovery key / handoff flow now, and a short local PIN option as the target UX.
- Keep a local encrypted/keychain cache so one bad network call never bricks mail.
- Keep AgentMail as optional agent access, not the only source of mail truth.
- Add Gmail and Hotmail later through the same account model.
- Never leak stored mailbox passwords back to the frontend.
- Never let stale Supabase auth spam 401s across the app.

## 10-Star Bar

- Real inbox sync works from per-account IMAP settings.
- Proton setup is obvious: Proton Bridge host, port, username, and bridge password.
- Account records are encrypted into Supabase `user_secrets` for cross-device sync.
- Desktop startup validates restored Supabase sessions, refreshes good sessions,
  and clears revoked sessions before synced routes load.
- Local cache is only fallback/recovery; cloud sync is the source of portability.
- Linux/other laptops can hydrate the same mail account after login + second unlock.
- Account picker clearly separates real mailbox transport from AgentMail access.
- Empty/error states tell the user what exact connection piece is missing.
- Existing AgentMail routed messages still work.

## Current Gap

Email can now store per-account IMAP credentials, but a stale restored Supabase
session can prevent encrypted cloud sync from loading/saving and causes noisy 401s.
The local keychain cache keeps Proton working on this Mac, but that is not enough
for the cross-device promise.

## This Pass

- Keep encrypted per-account IMAP settings in mail account records.
- Save mail account records locally first, then encrypted to Supabase when account
  sync is unlocked.
- Make `/api/email` prefer direct IMAP when an account has IMAP credentials.
- Keep AgentMail fallback for agent-access-only accounts.
- Validate/refresh restored Supabase sessions before data routes use them.
- Clear bad restored sessions so all 401s become a clean login/sync-unlock state.
- Verify backend tests and live Proton Bridge IMAP.

## Next UX Pass

- Add a polished "Unlock sync" panel for account-sync key, recovery key, and handoff.
- Add a local PIN wrapper for the cached account-sync key so daily unlock is quick.
- Show sync state on Email accounts: local-only, synced, needs unlock, needs login.
- Add a one-click "Sync this mail account to my other devices" repair action.
