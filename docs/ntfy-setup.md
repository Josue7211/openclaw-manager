# ntfy.sh Self-Hosted Setup

## Docker Compose

Add this to your homelab `docker-compose.yml`:

```yaml
services:
  ntfy:
    image: binwiederhier/ntfy
    container_name: ntfy
    command: serve
    environment:
      - NTFY_BASE_URL=http://10.0.0.SERVICES:2586
      - NTFY_LISTEN_HTTP=:80
    ports:
      - "2586:80"
    volumes:
      - ntfy-cache:/var/cache/ntfy
      - ntfy-etc:/etc/ntfy
    restart: unless-stopped

volumes:
  ntfy-cache:
  ntfy-etc:
```

Start it:

```bash
docker compose up -d ntfy
```

Verify it's running:

```bash
curl http://localhost:2586/health
```

## Mission Control configuration

In Mission Control → Settings → Notifications:

- **NTFY URL**: `http://10.0.0.SERVICES:2586`
- **Topic**: `mission-control`

Or set env vars in `.env.local`:

```
NTFY_URL=http://10.0.0.SERVICES:2586
NTFY_TOPIC=mission-control
```

## iOS / Android app setup

1. Install the ntfy app:
   - [iOS — App Store](https://apps.apple.com/us/app/ntfy/id1625396347)
   - [Android — Play Store / F-Droid](https://f-droid.org/en/packages/io.heckel.ntfy/)

2. Open the app → tap **+** → **Subscribe to topic**

3. Enter:
   - **Server URL**: `http://10.0.0.SERVICES:2586` (use your homelab IP)
   - **Topic**: `mission-control`

4. Tap **Subscribe**

Notifications from Mission Control will now appear on your phone.

## Events that trigger notifications

| Event | Priority | Tags |
|-------|----------|------|
| Mission complete | 3 (default) | `white_check_mark` |
| Mission failed | 4 (high) | `x` |
| Deploy succeeded | 3 (default) | `rocket` |
| Deploy failed | 5 (max) | `x` |
| Test notification | 3 (default) | `bell` |

## Priorities

| Value | Label |
|-------|-------|
| 1 | min |
| 2 | low |
| 3 | default |
| 4 | high |
| 5 | max |
