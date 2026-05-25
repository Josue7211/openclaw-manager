#!/usr/bin/env bash
set -euo pipefail

secret() {
  secret-tool lookup service com.clawctrl.desktop username "$1"
}

BB_HOST="$(secret bluebubbles.host)"
BB_PASS="$(secret bluebubbles.password)"

[ -n "$BB_HOST" ] || {
  echo "missing bluebubbles.host in keyring" >&2
  exit 1
}
[ -n "$BB_PASS" ] || {
  echo "missing bluebubbles.password in keyring" >&2
  exit 1
}

python3 - "$BB_HOST" "$BB_PASS" <<'PY'
import sys
import urllib.parse
import requests

host = sys.argv[1].rstrip("/")
password = urllib.parse.quote(sys.argv[2])

response = requests.post(
    f"{host}/api/v1/chat/query?password={password}",
    json={"limit": 100, "offset": 0, "with": ["participants", "lastMessage"]},
    timeout=15,
)
response.raise_for_status()
payload = response.json()
chats = payload.get("data") or []

def redact(value):
    value = str(value or "")
    if not value:
        return ""
    if len(value) <= 8:
        return "<short>"
    return f"{value[:4]}...{value[-4:]}"

for idx, chat in enumerate(chats):
    guid = chat.get("guid") or chat.get("chatGuid") or ""
    identifier = chat.get("chatIdentifier") or chat.get("identifier") or ""
    display = chat.get("displayName") or ""
    participants = chat.get("participants") or []
    participant_count = len(participants) if isinstance(participants, list) else 0
    last = chat.get("lastMessage") if isinstance(chat.get("lastMessage"), dict) else {}
    date_created = last.get("dateCreated") or chat.get("dateCreated") or ""
    print(
        f"{idx:03d} guid={guid} identifier={redact(identifier)} "
        f"display={redact(display)} participants={participant_count} date={date_created}"
    )
PY
