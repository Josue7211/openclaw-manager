# Hermes Mac Services Runbook

This records the current clawctrl/Hermes Mac integration state for BlueBubbles
and Mac Bridge.

## Current Self-Chat Test State

- Hermes is running on `agent-vm`.
- Discord remains connected through Hermes.
- BlueBubbles is currently enabled for a constrained self-chat test.
- Hermes listens for the BlueBubbles webhook only on `agent-vm`
  `127.0.0.1:8645`.
- BlueBubbles registers the desktop tunnel URL:
  - `http://100.97.74.2:48645/bluebubbles-webhook`
- The desktop tunnel unit is enabled and active:
  - `hermes-mac-services-tunnel.service`
- BlueBubbles env is configured with:
  - `BLUEBUBBLES_ALLOW_ALL_USERS=false`
  - `GATEWAY_ALLOW_ALL_USERS=false`
  - `BLUEBUBBLES_SEND_READ_RECEIPTS=false`
  - exact self-chat GUID in `BLUEBUBBLES_ALLOWED_CHATS`
  - exact self-chat GUID in `BLUEBUBBLES_ALLOW_FROM_ME_CHATS`
  - `/media,/hermes` in `BLUEBUBBLES_FROM_ME_PREFIXES`
- Hermes should only process messages in that self-chat when they start with
  `/media` or `/hermes`.

Disable with:

```bash
scripts/configure-hermes-bluebubbles-env.sh --disable --apply --restart
systemctl --user disable --now hermes-mac-services-tunnel.service
```

## Previous Safe State

- Hermes is running on `agent-vm`.
- Discord remains connected through Hermes.
- Hermes does not currently load BlueBubbles credentials at runtime.
- The `agent-vm` Hermes env files no longer contain `BLUEBUBBLES_*` entries.
- The Hermes BlueBubbles webhook is not registered in BlueBubbles.
- The only current BlueBubbles webhook points to local clawctrl:
  - `http://127.0.0.1:3010/api/messages/webhook`
- The desktop tunnel unit exists but is disabled and inactive:
  - `hermes-mac-services-tunnel.service`
- No process is listening on the `agent-vm` BlueBubbles tunnel or webhook ports
  (`41234`, `14100`, or `8645`) in the safe state.
- No outbound iMessage test should be run without explicit user approval.

## Stored Secrets

Current clawctrl keyring entries are present and nonempty:

- `bluebubbles.host`
- `bluebubbles.password`
- `hermes.bluebubbles-server-url`
- `hermes.bluebubbles-password`
- `mac-bridge.host`
- `mac-bridge.api-key`

Bitwarden login entries are verified to mirror the current keyring values when
the CLI is unlocked:

- `BlueBubbles`
- `Mac Bridge`

After unlocking Bitwarden, run:

```bash
scripts/check-hermes-mac-services.sh --check-bitwarden
```

The check confirms those item names exist and that their username/password
fields match the keyring values, without printing secret values.

## Network Layout

Direct TCP from `agent-vm` to the Mac Tailscale IP currently times out even
though Tailscale ping works. The working path is a desktop-hosted SSH tunnel:

```text
agent-vm 127.0.0.1:41234 -> josuesdesktop -> 100.89.236.13:1234 BlueBubbles
agent-vm 127.0.0.1:14100 -> josuesdesktop -> 100.89.236.13:4100 Mac Bridge
josuesdesktop 100.97.74.2:48645 -> agent-vm 127.0.0.1:8645 Hermes BlueBubbles webhook
```

The tunnel unit is intentionally disabled until iMessage/BlueBubbles is
explicitly re-enabled.

Install or refresh the unit without enabling it:

```bash
scripts/install-hermes-mac-tunnel-service.sh
```

Explicit approval is required before using:

```bash
scripts/install-hermes-mac-tunnel-service.sh --enable --start
```

## Safety Incident Notes

On May 23, 2026, Hermes briefly ran with BlueBubbles enabled while the tunnel
was being tested. The `agent-vm` journal shows incoming BlueBubbles events from
a redacted unauthorized phone number between 13:31 and 13:49, and Hermes logged
them as unauthorized. At 13:49 it also logged one BlueBubbles send failure. At
13:50 and 13:51, all `BLUEBUBBLES_*` entries were removed from the Hermes env
files and `hermes-api-server.service` was restarted.

Do not re-enable BlueBubbles for Hermes, create chats, mark chats read, send
typing indicators, send reactions, send attachments, unsend/delete messages, or
send iMessages without explicit user approval in the current turn.

## Verified Non-Message Probes

These checks do not send iMessages:

- Hermes BlueBubbles env planner:
  - `scripts/configure-hermes-bluebubbles-env.sh`
  - dry-run default; prints a redacted plan for `BLUEBUBBLES_*` env values
    without writing files or restarting Hermes.
  - enabling requires both `HERMES_BLUEBUBBLES_APPROVED=1` and a nonempty
    `BLUEBUBBLES_ALLOWED_USERS` value.
  - enabling also requires nonempty `BLUEBUBBLES_ALLOWED_CHATS`; Hermes will
    ignore BlueBubbles events from every other iMessage chat GUID.
  - optional self-chat command mode requires both
    `BLUEBUBBLES_ALLOW_FROM_ME_CHATS` and `BLUEBUBBLES_FROM_ME_PREFIXES`.
    This is only for the same-Apple-ID self-chat case where the user's phone
    messages arrive as `isFromMe`; Hermes still ignores all other `isFromMe`
    messages.
  - forces `BLUEBUBBLES_SEND_READ_RECEIPTS=false`.
  - keeps `bluebubbles.unauthorized_dm_behavior: ignore` in
    `~/.hermes/config.yaml`, so unknown iMessage DMs do not receive pairing
    replies.
  - `scripts/configure-hermes-bluebubbles-env.sh --disable --apply --restart`
    removes `BLUEBUBBLES_*` values from Hermes env files and restarts Hermes.
  - `scripts/configure-hermes-bluebubbles-env.sh --apply --restart` is gated
    by `HERMES_BLUEBUBBLES_APPROVED=1` and must not be run unless
    BlueBubbles/Hermes re-enable is explicitly approved.
- Safe-state verifier:
  - `scripts/check-hermes-mac-services.sh`
  - verifies Hermes is active, Hermes has no `BLUEBUBBLES_*` env, agent-vm
    BlueBubbles tunnel/webhook ports are closed, Mac Bridge health passes,
    BlueBubbles ping returns pong, and the BlueBubbles webhook list does not
    target Hermes.
- Redacted chat GUID lister:
  - `scripts/list-bluebubbles-chats-redacted.sh`
  - lists BlueBubbles chat GUIDs, redacted identifiers, participant counts, and
    timestamps without printing message text.
- Bitwarden mirror verifier:
  - `scripts/check-hermes-mac-services.sh --check-bitwarden`
  - requires an unlocked Bitwarden CLI session.
  - confirms `BlueBubbles` and `Mac Bridge` login items exactly mirror the
    keyring values without printing secret values.
- Temporary tunnel TCP verifier:
  - `scripts/check-hermes-mac-services.sh --probe-tunnel`
  - starts `hermes-mac-services-tunnel.service` only if needed, verifies
    `agent-vm` can open TCP connections to `127.0.0.1:14100` and
    `127.0.0.1:41234`, verifies the desktop reverse tunnel listener on
    `48645`, verifies Mac Bridge `/health` and BlueBubbles `/ping` through
    the forwarded `agent-vm` ports, then stops the tunnel again if the script
    started it.
  - Last verified successfully on May 23, 2026; the service ended
    `inactive` and `disabled`.
- Tunnel unit installer:
  - `scripts/install-hermes-mac-tunnel-service.sh`
  - refreshes `~/.config/systemd/user/hermes-mac-services-tunnel.service` and
    leaves it disabled unless `--enable` is explicitly supplied.
- Desktop to Mac Bridge health:
  - `GET /health` with `x-api-key`
  - returns `{"ok":true,"services":["reminders","calendar","notes","contacts","findmy"]}`
- Desktop to BlueBubbles ping:
  - `GET /api/v1/ping?password=...`
  - returns `{"status":200,"message":"Ping received!","data":"pong"}`
- Temporary tunnel from `agent-vm` to Mac Bridge health:
  - `http://127.0.0.1:14100/health`
  - returns healthy JSON
- Temporary tunnel from `agent-vm` to BlueBubbles ping:
  - `http://127.0.0.1:41234/api/v1/ping?password=...`
  - returns BlueBubbles pong

## iMessage Group Creation Limitation

BlueBubbles rejected programmatic group creation with:

```text
Cannot create group chats on macOS Big Sur or newer!
```

That means the `media` iMessage group must be created manually in Messages or
BlueBubbles by adding real people. Hermes is not a separate iMessage contact;
Hermes watches and replies through the BlueBubbles bridge after it is explicitly
re-enabled.

## How To Contact Hermes

Current safe path:

1. Open Discord.
2. Use the server/channel where Hermes is installed, or DM the Hermes Discord
   bot if Discord allows it.
3. Mention Hermes or use its slash commands.

iMessage path:

- You cannot text `Hermes` directly in iMessage unless Hermes has its own real
  phone number or Apple ID.
- When BlueBubbles is re-enabled, Hermes reads and replies through the Mac's
  Messages account. It is bridge behavior, not a separate iMessage contact.
- Messages sent by the Mac's own iMessage account are ignored by Hermes to
  prevent reply loops. If you message the same account that BlueBubbles is
  bridging, Hermes will not behave like a separate person in that thread.
- A guarded self-chat mode exists for phone-to-own-Apple-ID testing. It only
  processes `isFromMe` messages when the exact chat GUID is in
  `BLUEBUBBLES_ALLOW_FROM_ME_CHATS` and the message starts with one of the
  prefixes in `BLUEBUBBLES_FROM_ME_PREFIXES`, for example `/media`.
  This lets the user type a command from their phone while preventing Hermes'
  own replies from recursively triggering another reply.
- Hermes can be restricted to exactly one iMessage chat by setting
  `BLUEBUBBLES_ALLOWED_CHATS` to that chat's GUID. Events from all other
  iMessage chats are acknowledged and ignored.
- To make iMessage work safely, provide the exact phone number or Apple ID that
  will send messages to Hermes and set it as `BLUEBUBBLES_ALLOWED_USERS`. Do
  not use anyone else's handle there.
- Unknown BlueBubbles DMs must stay ignored. If this is left at Hermes'
  default `pair` behavior, unauthorized people can receive pairing-code replies.
- A `media` iMessage group must be created manually with real participants in
  Messages or BlueBubbles. After the group exists, the group GUID can be
  discovered and configured, but only after explicit approval to re-enable the
  BlueBubbles bridge.

## Re-enable Checklist

Only do this after explicit user approval:

1. Start or enable `hermes-mac-services-tunnel.service`.
2. Restore `BLUEBUBBLES_*` runtime env values on `agent-vm`:
   - dry-run first: `scripts/configure-hermes-bluebubbles-env.sh`
   - list redacted chat GUID candidates:
     `scripts/list-bluebubbles-chats-redacted.sh`
   - apply only with approval:
     `BLUEBUBBLES_ALLOWED_USERS='<your-sender-phone-or-apple-id>' BLUEBUBBLES_ALLOWED_CHATS='<exact-chat-guid>' HERMES_BLUEBUBBLES_APPROVED=1 scripts/configure-hermes-bluebubbles-env.sh --apply --restart`
   - for self-chat testing, use the same exact self-chat GUID for both
     `BLUEBUBBLES_ALLOWED_CHATS` and `BLUEBUBBLES_ALLOW_FROM_ME_CHATS`, and set
     `BLUEBUBBLES_FROM_ME_PREFIXES=/media,/hermes`.
3. Restart `hermes-api-server.service`.
4. Register the Hermes webhook with BlueBubbles using the desktop-forwarded URL.
5. Verify with health/ping endpoints first.
6. Do not send an outbound iMessage unless explicitly requested.
