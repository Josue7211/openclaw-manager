#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import contextlib
import datetime as dt
import hmac
import json
import os
import pathlib
import sqlite3
import sys
import uuid
from collections import defaultdict
from typing import Any, Optional


DEFAULT_CHAT_SESSION_ID = "clawcontrol-chat"
DEFAULT_MODEL = "gpt-5.5"
DEFAULT_FAVORITE_MODELS = ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex"]
DEFAULT_AGENT_LABEL = "Hermes Agent"
AGENT_ALIAS_MODEL_IDS = {"hermes", "hermes-agent"}
DEFAULT_RUNTIME_FILENAME = "runtime-config.json"
MAX_WORKSPACE_FILE_SIZE = 5 * 1024 * 1024
CORE_WORKSPACE_FILES = [
    "SOUL.md",
    "memories/MEMORY.md",
    "memories/USER.md",
    ".hermes.md",
    "HERMES.md",
    "AGENTS.md",
    "CLAUDE.md",
    "agents.md",
    "claude.md",
    ".cursorrules",
]
HERMES_CURSOR_RULE_DIR = ".cursor/rules"
MEMD_WORKSPACE_FILES = [
    ".memd/README.md",
    ".memd/COMMANDS.md",
    ".memd/config.json",
    ".memd/wake.md",
    ".memd/mem.md",
    ".memd/events.md",
]
MEMD_WORKSPACE_DIRS = [
    ".memd/compiled/memory",
    ".memd/compiled/events",
]
HERMES_AGENT_FILE_DIRS = [
]
HERMES_AGENT_FILE_SUFFIXES = (".md", ".json", ".yaml", ".yml", ".toml")
HERMES_AGENT_EXCLUDED_PARTS = {".git", "__pycache__", "node_modules", "dist", "build", ".venv", "venv"}


def isoformat_utc(value: Any) -> str:
    if value is None or value == "":
        return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    if isinstance(value, (int, float)):
        return dt.datetime.fromtimestamp(float(value), tz=dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return isoformat_utc(None)
        if raw.endswith("Z"):
            return raw
        with contextlib.suppress(ValueError):
            parsed = dt.datetime.fromisoformat(raw)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=dt.timezone.utc)
            return parsed.astimezone(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        with contextlib.suppress(ValueError):
            return isoformat_utc(float(raw))
    return isoformat_utc(None)


def millis_from_iso(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return int(float(value) * 1000)
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        with contextlib.suppress(ValueError):
            return int(float(raw) * 1000)
        normalized = raw[:-1] + "+00:00" if raw.endswith("Z") else raw
        with contextlib.suppress(ValueError):
            parsed = dt.datetime.fromisoformat(normalized)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=dt.timezone.utc)
            return int(parsed.timestamp() * 1000)
    return None


def schedule_to_hermes(schedule: dict[str, Any]) -> str:
    kind = str(schedule.get("kind") or "").strip()
    if kind == "cron":
        expr = str(schedule.get("expr") or "").strip()
        if not expr:
            raise ValueError("cron schedule requires expr")
        return expr
    if kind != "every":
        raise ValueError(f"unsupported schedule kind: {kind}")
    every_ms = int(schedule.get("everyMs") or 0)
    if every_ms <= 0:
        raise ValueError("every schedule requires positive everyMs")
    if every_ms % 86_400_000 == 0:
        return f"every {every_ms // 86_400_000}d"
    if every_ms % 3_600_000 == 0:
        return f"every {every_ms // 3_600_000}h"
    if every_ms % 60_000 == 0:
        return f"every {every_ms // 60_000}m"
    if every_ms % 1_000 == 0:
        return f"every {every_ms // 1_000}s"
    return f"every {every_ms}ms"


def hermes_schedule_to_openclaw(schedule: str) -> dict[str, Any]:
    text = (schedule or "").strip()
    lower = text.lower()
    if not lower.startswith("every "):
        return {"kind": "cron", "expr": text}
    amount = lower.removeprefix("every ").strip()
    multipliers = {
        "ms": 1,
        "s": 1_000,
        "m": 60_000,
        "h": 3_600_000,
        "d": 86_400_000,
    }
    for suffix, multiplier in multipliers.items():
        if amount.endswith(suffix):
            number = amount[: -len(suffix)].strip()
            if not number:
                break
            return {"kind": "every", "everyMs": int(float(number) * multiplier)}
    return {"kind": "cron", "expr": text}


def session_to_openclaw(row: dict[str, Any], *, status: Optional[str] = None) -> dict[str, Any]:
    title = (row.get("title") or row.get("label") or "").strip()
    inferred_status = status or ("running" if not row.get("ended_at") else "completed")
    return {
        "id": row.get("id"),
        "key": row.get("id"),
        "label": title,
        "agentKey": "hermes",
        "agentId": "hermes",
        "kind": "claude-code",
        "messageCount": int(row.get("message_count") or 0),
        "lastActivity": isoformat_utc(row.get("last_active") or row.get("started_at")),
        "status": inferred_status,
        "model": row.get("model") or DEFAULT_MODEL,
        "preview": row.get("preview") or "",
        "source": row.get("source") or "hermes",
    }


def messages_to_chat_history(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    for row in rows:
        role = row.get("role")
        if role not in {"user", "assistant"}:
            continue
        text = row.get("content") or ""
        if not text:
            continue
        messages.append(
            {
                "id": str(row.get("id") or uuid.uuid4()),
                "role": role,
                "text": text,
                "timestamp": isoformat_utc(row.get("timestamp")),
            }
        )
    return messages


def messages_to_session_history(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    for row in rows:
        role = row.get("role") or "assistant"
        content = row.get("content") or ""
        if not content and role != "tool":
            continue
        item = {
            "id": str(row.get("id") or uuid.uuid4()),
            "role": role if role in {"user", "assistant", "system", "tool"} else "assistant",
            "content": content,
            "timestamp": isoformat_utc(row.get("timestamp")),
        }
        if row.get("tool_name"):
            item["toolName"] = row["tool_name"]
        messages.append(item)
    return messages


def _raw_models(payload: dict[str, Any]) -> list[dict[str, Any]]:
    data = payload.get("data")
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    models = payload.get("models")
    if isinstance(models, list):
        return [item for item in models if isinstance(item, dict)]
    return []


def format_model_name(model_id: str) -> str:
    slug = (model_id or "").split("/")[-1].strip() or model_id
    return (
        slug.replace("-", " ")
        .replace("_", " ")
        .replace("gpt", "GPT")
        .replace("codex", "Codex")
        .replace("mini", "Mini")
        .replace("max", "Max")
        .strip()
    )


def is_agent_alias_model(model_id: str) -> bool:
    value = (model_id or "").strip().lower()
    return value in AGENT_ALIAS_MODEL_IDS or value.endswith("/hermes-agent")


def make_chat_model_option(model_id: str, item: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    item = item or {}
    return {
        "id": model_id,
        "name": str(item.get("name") or format_model_name(model_id) or model_id),
        "provider": str(item.get("provider") or "hermes"),
        "local": False,
        "contextWindow": item.get("context_window") or item.get("max_context_tokens"),
    }


def models_to_chat_payload(
    payload: dict[str, Any],
    *,
    current_model: str,
    favorite_models: Optional[list[str]] = None,
) -> dict[str, Any]:
    items = []
    seen_ids: set[str] = set()
    for item in _raw_models(payload):
        model_id = str(item.get("id") or "").strip()
        if not model_id or is_agent_alias_model(model_id):
            continue
        items.append(make_chat_model_option(model_id, item))
        seen_ids.add(model_id)

    seeded_items = []
    for seeded_id in [current_model, *(favorite_models or [])]:
        model_id = str(seeded_id or "").strip()
        if not model_id or model_id in seen_ids or is_agent_alias_model(model_id):
            continue
        seeded_items.append(make_chat_model_option(model_id))
        seen_ids.add(model_id)

    items = seeded_items + items
    selected = current_model or ((favorite_models or [items[0]["id"]])[0] if items else "")
    return {"models": items, "currentModel": selected, "agentLabel": DEFAULT_AGENT_LABEL}


def models_to_openclaw(payload: dict[str, Any]) -> dict[str, Any]:
    items = []
    for item in _raw_models(payload):
        model_id = str(item.get("id") or "").strip()
        if not model_id:
            continue
        items.append(
            {
                "id": model_id,
                "name": str(item.get("name") or model_id),
                "provider": str(item.get("provider") or "hermes"),
            }
        )
    return {"models": items}


def job_to_openclaw(job: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": job.get("id"),
        "name": job.get("name") or "Untitled job",
        "description": job.get("prompt") or job.get("description"),
        "schedule": hermes_schedule_to_openclaw(str(job.get("schedule") or "")),
        "enabled": bool(job.get("enabled", True)),
        "createdAt": job.get("created_at"),
        "createdAtMs": millis_from_iso(job.get("created_at")),
        "state": {
            "nextRunAtMs": millis_from_iso(job.get("next_run_at")),
            "lastRunAtMs": millis_from_iso(job.get("last_run_at")),
            "lastRunStatus": job.get("last_run_status"),
        },
    }


class CompatService:
    def __init__(self) -> None:
        self.http_host = os.environ.get("COMPAT_HTTP_HOST", "127.0.0.1")
        self.http_port = int(os.environ.get("COMPAT_HTTP_PORT", "3939"))
        self.ws_host = os.environ.get("COMPAT_WS_HOST", "127.0.0.1")
        self.ws_port = int(os.environ.get("COMPAT_WS_PORT", "18789"))
        self.hermes_api_base = os.environ.get("HERMES_API_BASE", "http://127.0.0.1:8642").rstrip("/")
        self.hermes_api_key = os.environ.get("HERMES_API_KEY", "")
        public_api_key = os.environ.get("OPENCLAW_API_KEY", "")
        public_ws_token = os.environ.get("OPENCLAW_PASSWORD", "")
        self.public_api_key = public_api_key or public_ws_token
        self.public_ws_token = public_ws_token or public_api_key
        self.default_chat_session_id = os.environ.get("COMPAT_CHAT_SESSION_ID", DEFAULT_CHAT_SESSION_ID)
        self.runtime_dir = pathlib.Path(
            os.environ.get("COMPAT_RUNTIME_DIR", str(pathlib.Path.home() / ".hermes" / "openclaw-compat"))
        )
        self.runtime_dir.mkdir(parents=True, exist_ok=True)
        self.logs_dir = self.runtime_dir / "logs"
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self.runtime_config_path = self.runtime_dir / DEFAULT_RUNTIME_FILENAME
        self._listeners: dict[str, set[asyncio.Queue[str]]] = defaultdict(set)
        self._active_tasks: dict[str, asyncio.Task[Any]] = {}
        self._session_states: dict[str, str] = {}
        self._session_db = None
        self._httpx = None

    @property
    def session_db(self):
        if self._session_db is None:
            hermes_code_home = self.hermes_code_home
            if str(hermes_code_home) not in sys.path:
                sys.path.insert(0, str(hermes_code_home))
            from hermes_state import SessionDB  # type: ignore

            self._session_db = SessionDB()
        return self._session_db

    @property
    def hermes_code_home(self) -> pathlib.Path:
        configured = os.environ.get("HERMES_CODE_HOME") or os.environ.get("HERMES_AGENT_HOME")
        if configured:
            return pathlib.Path(configured)
        raw_home = pathlib.Path(os.environ.get("HERMES_HOME", str(pathlib.Path.home() / ".hermes")))
        if raw_home.name == "hermes-agent":
            return raw_home
        nested = raw_home / "hermes-agent"
        if nested.exists():
            return nested
        return pathlib.Path.home() / ".hermes" / "hermes-agent"

    @property
    def hermes_home(self) -> pathlib.Path:
        return self._normalize_hermes_home(
            pathlib.Path(os.environ.get("HERMES_HOME", str(pathlib.Path.home() / ".hermes")))
        )

    def _normalize_hermes_home(self, path: pathlib.Path) -> pathlib.Path:
        if path.name == "hermes-agent":
            parent = path.parent
            if (parent / "SOUL.md").exists() or (parent / "memories").exists() or (parent / ".memd").exists():
                return parent
        return path

    @property
    def workspace_home(self) -> pathlib.Path:
        configured = os.environ.get("HERMES_WORKSPACE_HOME")
        if configured:
            return pathlib.Path(configured)
        hermes_home = self.hermes_home
        parent = hermes_home.parent
        if (parent / "SOUL.md").exists() or (parent / "memories").exists() or (parent / ".memd").exists():
            return parent
        return hermes_home

    def resolve_workspace_file(self, file_path: str) -> pathlib.Path:
        if "\0" in file_path:
            raise ValueError("invalid path")
        relative = file_path.strip().lstrip("/")
        if not relative or pathlib.PurePosixPath(relative).is_absolute() or ".." in pathlib.PurePosixPath(relative).parts:
            raise ValueError("invalid path")

        root = self.workspace_home.resolve(strict=False)
        resolved = (root / relative).resolve(strict=False)
        if resolved != root and root not in resolved.parents:
            raise ValueError("invalid path")
        return resolved

    def list_workspace_files(self) -> dict[str, list[dict[str, str]]]:
        root = self.workspace_home

        def entry(path: str) -> dict[str, str]:
            return {"name": pathlib.PurePosixPath(path).name, "path": path}

        core_seen = set()
        core_files = []
        for path in CORE_WORKSPACE_FILES:
            if (root / path).is_file() and path not in core_seen:
                core_files.append(entry(path))
                core_seen.add(path)
        cursor_rules = root / HERMES_CURSOR_RULE_DIR
        if cursor_rules.is_dir():
            for file in sorted(cursor_rules.glob("*.mdc"), key=lambda p: p.name):
                rel = f"{HERMES_CURSOR_RULE_DIR}/{file.name}"
                if rel not in core_seen:
                    core_files.append(entry(rel))
                    core_seen.add(rel)

        seen = set()
        memd_paths: list[str] = []
        for path in MEMD_WORKSPACE_FILES:
            if (root / path).is_file() and path not in seen:
                memd_paths.append(path)
                seen.add(path)
        for rel_dir in MEMD_WORKSPACE_DIRS:
            directory = root / rel_dir
            if not directory.is_dir():
                continue
            for file in sorted(directory.glob("*.md"), key=lambda p: p.name, reverse=True):
                rel = f"{rel_dir}/{file.name}"
                if rel not in seen:
                    memd_paths.append(rel)
                    seen.add(rel)

        memory_seen = set(core_seen)
        memory_paths: list[str] = []
        for rel_dir in HERMES_AGENT_FILE_DIRS:
            directory = root / rel_dir
            if not directory.is_dir():
                continue
            for file in sorted(directory.rglob("*"), key=lambda p: str(p.relative_to(root))):
                if not file.is_file():
                    continue
                rel = file.relative_to(root).as_posix()
                parts = set(pathlib.PurePosixPath(rel).parts)
                if parts & HERMES_AGENT_EXCLUDED_PARTS:
                    continue
                if not rel.endswith(HERMES_AGENT_FILE_SUFFIXES):
                    continue
                if rel not in memory_seen:
                    memory_paths.append(rel)
                    memory_seen.add(rel)

        return {
            "coreFiles": core_files,
            "memoryFiles": [entry(path) for path in memory_paths],
            "memdFiles": [entry(path) for path in memd_paths],
        }

    def read_workspace_file(self, file_path: str) -> str:
        resolved = self.resolve_workspace_file(file_path)
        if not resolved.is_file():
            raise FileNotFoundError(file_path)
        if resolved.stat().st_size > MAX_WORKSPACE_FILE_SIZE:
            raise ValueError("file too large")
        return resolved.read_text(encoding="utf-8")

    def write_workspace_file(self, file_path: str, content: str) -> None:
        if len(content.encode("utf-8")) > MAX_WORKSPACE_FILE_SIZE:
            raise ValueError("content too large")
        resolved = self.resolve_workspace_file(file_path)
        resolved.parent.mkdir(parents=True, exist_ok=True)
        resolved.write_text(content, encoding="utf-8")

    def delete_workspace_file(self, file_path: str) -> None:
        basename = pathlib.PurePosixPath(file_path).name
        if any(pathlib.PurePosixPath(path).name == basename for path in CORE_WORKSPACE_FILES):
            raise ValueError("cannot delete core workspace files")
        resolved = self.resolve_workspace_file(file_path)
        resolved.unlink()

    async def _http_client(self):
        if self._httpx is None:
            import httpx

            self._httpx = httpx.AsyncClient(timeout=180.0)
        return self._httpx

    async def close(self) -> None:
        if self._httpx is not None:
            await self._httpx.aclose()
            self._httpx = None

    def _compare_bearer(self, header: str) -> bool:
        if not self.public_api_key:
            return False
        expected = f"Bearer {self.public_api_key}"
        return hmac.compare_digest(header or "", expected)

    def _compare_ws_token(self, token: str) -> bool:
        if not self.public_ws_token:
            return False
        return hmac.compare_digest(token or "", self.public_ws_token)

    def log_path(self, session_id: str) -> pathlib.Path:
        safe = "".join(ch for ch in session_id if ch.isalnum() or ch in {"-", "_"})
        return self.logs_dir / f"{safe}.log"

    def load_runtime_config(self) -> dict[str, Any]:
        if not self.runtime_config_path.exists():
            return {
                "chatPrimaryModel": DEFAULT_MODEL,
                "heartbeatModel": DEFAULT_MODEL,
                "favoriteModels": list(DEFAULT_FAVORITE_MODELS),
                "chatSessionId": self.default_chat_session_id,
            }
        with contextlib.suppress(Exception):
            return json.loads(self.runtime_config_path.read_text())
        return {
            "chatPrimaryModel": DEFAULT_MODEL,
            "heartbeatModel": DEFAULT_MODEL,
            "favoriteModels": list(DEFAULT_FAVORITE_MODELS),
            "chatSessionId": self.default_chat_session_id,
        }

    def save_runtime_config(self, updates: dict[str, Any]) -> dict[str, Any]:
        config = self.load_runtime_config()
        for key, value in updates.items():
            if value is not None:
                config[key] = value
        config.setdefault("chatPrimaryModel", DEFAULT_MODEL)
        config.setdefault("heartbeatModel", config["chatPrimaryModel"])
        config.setdefault("favoriteModels", list(DEFAULT_FAVORITE_MODELS))
        config.setdefault("chatSessionId", self.default_chat_session_id)
        config["updatedAt"] = isoformat_utc(None)
        self.runtime_config_path.write_text(json.dumps(config, indent=2))
        return config

    def current_model(self) -> str:
        return str(self.load_runtime_config().get("chatPrimaryModel") or DEFAULT_MODEL)

    def favorite_models(self) -> list[str]:
        raw = self.load_runtime_config().get("favoriteModels") or DEFAULT_FAVORITE_MODELS
        if not isinstance(raw, list):
            return list(DEFAULT_FAVORITE_MODELS)
        values = []
        for item in raw:
            model_id = str(item or "").strip()
            if model_id and model_id not in values:
                values.append(model_id)
        return values or list(DEFAULT_FAVORITE_MODELS)

    def current_chat_session_id(self) -> str:
        return str(self.load_runtime_config().get("chatSessionId") or self.default_chat_session_id)

    async def hermes_request(
        self,
        method: str,
        path: str,
        *,
        json_body: Optional[dict[str, Any]] = None,
        extra_headers: Optional[dict[str, str]] = None,
        timeout: float = 180.0,
    ) -> tuple[int, Any]:
        client = await self._http_client()
        headers = dict(extra_headers or {})
        if self.hermes_api_key:
            headers["Authorization"] = f"Bearer {self.hermes_api_key}"
        response = await client.request(method, f"{self.hermes_api_base}{path}", json=json_body, headers=headers, timeout=timeout)
        with contextlib.suppress(Exception):
            return response.status_code, response.json()
        return response.status_code, response.text

    def _extract_assistant_text(self, payload: dict[str, Any]) -> str:
        choices = payload.get("choices") or []
        if not choices:
            return ""
        message = choices[0].get("message") or {}
        content = message.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, dict) and item.get("type") in {"text", "output_text"}:
                    text = item.get("text")
                    if text:
                        parts.append(str(text))
            return "\n".join(parts).strip()
        return ""

    async def fetch_models(self) -> dict[str, Any]:
        status, payload = await self.hermes_request("GET", "/v1/models", timeout=15.0)
        if status >= 400 or not isinstance(payload, dict):
            return {"data": []}
        return payload

    async def send_chat(
        self,
        *,
        message: str,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> dict[str, Any]:
        session = session_id or self.current_chat_session_id()
        chosen_model = model or self.current_model()
        if model:
            self.save_runtime_config({"chatPrimaryModel": chosen_model})
        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": message})
        status, payload = await self.hermes_request(
            "POST",
            "/v1/chat/completions",
            json_body={"model": chosen_model, "messages": messages},
            extra_headers={"X-Hermes-Session-Id": session},
        )
        if status >= 400:
            raise RuntimeError(payload.get("error", {}).get("message", payload) if isinstance(payload, dict) else str(payload))
        text = self._extract_assistant_text(payload if isinstance(payload, dict) else {})
        return {"ok": True, "sessionKey": session, "model": chosen_model, "text": text}

    def _query_usage(self) -> dict[str, Any]:
        db_path = getattr(self.session_db, "db_path", None)
        if not db_path:
            return {"total_tokens": 0, "total_cost": 0, "models": [], "period": "all", "daily": []}
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        try:
            totals = conn.execute(
                """
                SELECT
                  COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + reasoning_tokens), 0) AS total_tokens,
                  COALESCE(SUM(COALESCE(actual_cost_usd, estimated_cost_usd, 0)), 0) AS total_cost
                FROM sessions
                """
            ).fetchone()
            by_model = conn.execute(
                """
                SELECT
                  COALESCE(model, 'unknown') AS model,
                  COUNT(*) AS requests,
                  COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + reasoning_tokens), 0) AS tokens,
                  COALESCE(SUM(COALESCE(actual_cost_usd, estimated_cost_usd, 0)), 0) AS cost
                FROM sessions
                GROUP BY COALESCE(model, 'unknown')
                ORDER BY requests DESC
                """
            ).fetchall()
            by_day = conn.execute(
                """
                SELECT
                  strftime('%Y-%m-%d', datetime(started_at, 'unixepoch')) AS date,
                  COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + reasoning_tokens), 0) AS tokens,
                  COALESCE(SUM(COALESCE(actual_cost_usd, estimated_cost_usd, 0)), 0) AS cost
                FROM sessions
                GROUP BY date
                ORDER BY date DESC
                LIMIT 30
                """
            ).fetchall()
        finally:
            conn.close()
        return {
            "total_tokens": int(totals["total_tokens"] or 0),
            "total_cost": float(totals["total_cost"] or 0),
            "models": [dict(row) for row in by_model],
            "period": "all",
            "daily": [dict(row) for row in by_day],
        }

    def list_sessions(self) -> list[dict[str, Any]]:
        rows = self.session_db.list_sessions_rich(limit=200)
        sessions = []
        for row in rows:
            state = self._session_states.get(row["id"])
            sessions.append(session_to_openclaw(dict(row), status=state))
        return sessions

    def get_session(self, session_id: str) -> dict[str, Any]:
        row = self.session_db.get_session(session_id)
        if not row:
            raise KeyError(session_id)
        row["last_active"] = row.get("ended_at") or row.get("started_at")
        return session_to_openclaw(row, status=self._session_states.get(session_id))

    def rename_session(self, session_id: str, label: str) -> dict[str, Any]:
        self.session_db.set_session_title(session_id, label)
        return self.get_session(session_id)

    def delete_session(self, session_id: str) -> bool:
        task = self._active_tasks.pop(session_id, None)
        if task:
            task.cancel()
        self._session_states.pop(session_id, None)
        return bool(self.session_db.delete_session(session_id))

    def session_history(self, session_id: str, limit: int) -> dict[str, Any]:
        rows = self.session_db.get_messages(session_id)
        trimmed = rows[-limit:] if limit > 0 else rows
        total = len(rows)
        return {
            "messages": messages_to_session_history(trimmed),
            "hasMore": total > len(trimmed),
            "total": total,
        }

    def chat_history(self) -> dict[str, Any]:
        rows = self.session_db.get_messages(self.current_chat_session_id())
        return {"messages": messages_to_chat_history(rows)}

    async def list_jobs(self) -> list[dict[str, Any]]:
        status, payload = await self.hermes_request("GET", "/api/jobs", timeout=15.0)
        if status >= 400 or not isinstance(payload, dict):
            return []
        jobs = payload.get("jobs")
        if not isinstance(jobs, list):
            return []
        return [job_to_openclaw(item) for item in jobs if isinstance(item, dict)]

    async def create_job(self, body: dict[str, Any]) -> dict[str, Any]:
        prompt = (body.get("description") or "").strip() or f"Run scheduled Hermes task: {(body.get('name') or 'Untitled').strip()}"
        schedule = schedule_to_hermes(body.get("schedule") or {})
        status, payload = await self.hermes_request(
            "POST",
            "/api/jobs",
            json_body={
                "name": body.get("name"),
                "schedule": schedule,
                "prompt": prompt,
                "deliver": "local",
            },
            timeout=30.0,
        )
        if status >= 400 or not isinstance(payload, dict):
            raise RuntimeError(payload if isinstance(payload, str) else json.dumps(payload))
        return job_to_openclaw(payload.get("job") or {})

    async def update_job(self, body: dict[str, Any]) -> dict[str, Any]:
        job_id = str(body.get("id") or "")
        if not job_id:
            raise ValueError("id required")
        enabled = body.get("enabled")
        if enabled is False:
            await self.hermes_request("POST", f"/api/jobs/{job_id}/pause", timeout=30.0)
        elif enabled is True:
            await self.hermes_request("POST", f"/api/jobs/{job_id}/resume", timeout=30.0)
        patch: dict[str, Any] = {}
        if body.get("name"):
            patch["name"] = body["name"]
        if body.get("description"):
            patch["prompt"] = body["description"]
        if body.get("schedule"):
            patch["schedule"] = schedule_to_hermes(body["schedule"])
        if patch:
            status, payload = await self.hermes_request("PATCH", f"/api/jobs/{job_id}", json_body=patch, timeout=30.0)
            if status >= 400 or not isinstance(payload, dict):
                raise RuntimeError(payload if isinstance(payload, str) else json.dumps(payload))
            return job_to_openclaw(payload.get("job") or {})
        jobs = await self.list_jobs()
        for job in jobs:
            if job["id"] == job_id:
                return job
        raise KeyError(job_id)

    async def delete_job(self, job_id: str) -> dict[str, Any]:
        status, payload = await self.hermes_request("DELETE", f"/api/jobs/{job_id}", timeout=30.0)
        if status >= 400:
            raise RuntimeError(payload if isinstance(payload, str) else json.dumps(payload))
        return {"ok": True}

    async def append_log(self, session_id: str, chunk: str) -> None:
        if not chunk:
            return
        with self.log_path(session_id).open("a", encoding="utf-8") as handle:
            handle.write(chunk)
        listeners = list(self._listeners.get(session_id, set()))
        for queue in listeners:
            await queue.put(chunk)

    async def spawn_session(self, *, task: str, model: Optional[str], working_dir: Optional[str]) -> dict[str, Any]:
        session_id = f"spawn-{uuid.uuid4().hex[:12]}"
        chosen_model = model or self.current_model()
        title = task.strip().splitlines()[0][:100]
        self.session_db.create_session(session_id, source="clawcontrol", model=chosen_model)
        if title:
            with contextlib.suppress(Exception):
                self.session_db.set_session_title(session_id, title)
        self._session_states[session_id] = "running"
        self.log_path(session_id).write_text("", encoding="utf-8")
        run_task = asyncio.create_task(self._run_spawned_session(session_id, task, chosen_model, working_dir))
        self._active_tasks[session_id] = run_task
        return self.get_session(session_id)

    async def _run_spawned_session(self, session_id: str, task: str, model: str, working_dir: Optional[str]) -> None:
        try:
            await self.append_log(session_id, f"Hermes session {session_id}\r\n")
            await self.append_log(session_id, f"Model: {model}\r\n")
            if working_dir:
                await self.append_log(session_id, f"Working directory: {working_dir}\r\n")
            await self.append_log(session_id, "\r\n")
            prompt = task
            if working_dir:
                prompt = f"Working directory: {working_dir}\n\nTask:\n{task}"
            result = await self.send_chat(message=prompt, model=model, session_id=session_id)
            text = result.get("text") or "(Hermes returned no text)"
            await self.append_log(session_id, f"{text}\r\n")
            self.session_db.end_session(session_id, "completed")
            self._session_states[session_id] = "completed"
        except asyncio.CancelledError:
            self.session_db.end_session(session_id, "cancelled")
            self._session_states[session_id] = "failed"
            await self.append_log(session_id, "\r\nSession cancelled.\r\n")
            raise
        except Exception as exc:
            self.session_db.end_session(session_id, "failed")
            self._session_states[session_id] = "failed"
            await self.append_log(session_id, f"\r\nERROR: {exc}\r\n")
        finally:
            self._active_tasks.pop(session_id, None)

    async def subscribe(self, session_id: str) -> asyncio.Queue[str]:
        queue: asyncio.Queue[str] = asyncio.Queue()
        self._listeners[session_id].add(queue)
        return queue

    def unsubscribe(self, session_id: str, queue: asyncio.Queue[str]) -> None:
        listeners = self._listeners.get(session_id)
        if not listeners:
            return
        listeners.discard(queue)
        if not listeners:
            self._listeners.pop(session_id, None)


def create_app(service: CompatService):
    from aiohttp import WSMsgType, web

    def json_error(message: str, *, status: int) -> web.Response:
        return web.json_response({"error": message}, status=status)

    def require_auth(request: web.Request) -> Optional[web.Response]:
        if service._compare_bearer(request.headers.get("Authorization", "")):
            return None
        return json_error("Unauthorized", status=401)

    async def read_json(request: web.Request) -> dict[str, Any]:
        try:
            data = await request.json()
        except Exception:
            raise ValueError("invalid json")
        if not isinstance(data, dict):
            raise ValueError("json body must be an object")
        return data

    async def health(_request: web.Request) -> web.Response:
        return web.json_response({"status": "ok", "provider": "hermes-openclaw-compat"})

    async def list_files(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        return web.json_response(service.list_workspace_files())

    async def read_file(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        file_path = request.query.get("path", "")
        try:
            return web.json_response({"content": service.read_workspace_file(file_path)})
        except FileNotFoundError:
            return json_error("File not found", status=404)
        except ValueError as exc:
            return json_error(str(exc), status=400)

    async def write_file(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        try:
            body = await read_json(request)
            file_path = body.get("path")
            content = body.get("content")
            if not isinstance(file_path, str) or not isinstance(content, str):
                return json_error("path and content required", status=400)
            service.write_workspace_file(file_path, content)
            return web.json_response({"ok": True})
        except ValueError as exc:
            return json_error(str(exc), status=400)
        except Exception as exc:
            return json_error(str(exc), status=500)

    async def delete_file(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        file_path = request.query.get("path", "")
        try:
            service.delete_workspace_file(file_path)
            return web.json_response({"ok": True})
        except FileNotFoundError:
            return json_error("File not found", status=404)
        except ValueError as exc:
            return json_error(str(exc), status=400)

    async def chat_history(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        return web.json_response(service.chat_history())

    async def chat_session_history(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        session_id = request.match_info["session_id"]
        limit = max(1, min(int(request.query.get("limit", "50")), 500))
        try:
            return web.json_response(service.session_history(session_id, limit))
        except KeyError:
            return json_error(f"Not found: {session_id}", status=404)

    async def chat_send(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        try:
            body = await read_json(request)
        except ValueError as exc:
            return json_error(str(exc), status=400)
        text = str(body.get("text") or "").strip()
        if not text:
            return json_error("text required", status=400)
        try:
            payload = await service.send_chat(
                message=text,
                model=body.get("model"),
                system_prompt=body.get("systemPrompt"),
                session_id=body.get("sessionKey"),
            )
        except Exception as exc:
            return json_error(str(exc), status=502)
        return web.json_response(payload)

    async def chat_models(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        return web.json_response(
            models_to_chat_payload(
                await service.fetch_models(),
                current_model=service.current_model(),
                favorite_models=service.favorite_models(),
            )
        )

    async def set_chat_model(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        try:
            body = await read_json(request)
        except ValueError as exc:
            return json_error(str(exc), status=400)
        model = str(body.get("model") or "").strip()
        if not model:
            return json_error("model required", status=400)
        config = service.save_runtime_config({"chatPrimaryModel": model})
        return web.json_response({"ok": True, "currentModel": config["chatPrimaryModel"]})

    async def models(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        return web.json_response(models_to_openclaw(await service.fetch_models()))

    async def usage(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        return web.json_response(service._query_usage())

    async def logs(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        return web.json_response({"events": []})

    async def sessions(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        return web.json_response({"sessions": service.list_sessions()})

    async def session_detail(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        session_id = request.match_info["session_id"]
        try:
            return web.json_response(service.get_session(session_id))
        except KeyError:
            return json_error(f"Not found: {session_id}", status=404)

    async def patch_session(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        session_id = request.match_info["session_id"]
        try:
            body = await read_json(request)
            return web.json_response(service.rename_session(session_id, str(body.get("label") or "").strip()))
        except KeyError:
            return json_error(f"Not found: {session_id}", status=404)
        except Exception as exc:
            return json_error(str(exc), status=400)

    async def delete_session(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        session_id = request.match_info["session_id"]
        if not service.delete_session(session_id):
            return json_error(f"Not found: {session_id}", status=404)
        return web.json_response({"ok": True})

    async def compact_session(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        session_id = request.match_info["session_id"]
        try:
            service.get_session(session_id)
        except KeyError:
            return json_error(f"Not found: {session_id}", status=404)
        return web.json_response({"ok": True, "tokensSaved": 0, "message": "Hermes compatibility layer does not compact sessions."})

    async def spawn_session(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        try:
            body = await read_json(request)
        except ValueError as exc:
            return json_error(str(exc), status=400)
        task = str(body.get("task") or "").strip()
        if not task:
            return json_error("task required", status=400)
        payload = await service.spawn_session(task=task, model=body.get("model"), working_dir=body.get("workingDir"))
        return web.json_response(payload)

    async def get_runtime_config(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        return web.json_response(service.load_runtime_config())

    async def patch_runtime_config(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        try:
            body = await read_json(request)
        except ValueError as exc:
            return json_error(str(exc), status=400)
        config = service.save_runtime_config(
            {
                "chatPrimaryModel": body.get("chatPrimaryModel"),
                "heartbeatModel": body.get("heartbeatModel"),
                "favoriteModels": body.get("favoriteModels"),
            }
        )
        return web.json_response({"ok": True, **config, "appliedChatModel": True})

    async def list_crons(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        return web.json_response({"jobs": await service.list_jobs()})

    async def create_cron(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        try:
            body = await read_json(request)
            return web.json_response({"job": await service.create_job(body)})
        except ValueError as exc:
            return json_error(str(exc), status=400)
        except Exception as exc:
            return json_error(str(exc), status=502)

    async def patch_cron(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        job_id = request.match_info["job_id"]
        try:
            body = await read_json(request)
            payload = dict(body)
            payload["id"] = job_id
            return web.json_response({"job": await service.update_job(payload)})
        except KeyError:
            return json_error(f"Not found: {job_id}", status=404)
        except ValueError as exc:
            return json_error(str(exc), status=400)
        except Exception as exc:
            return json_error(str(exc), status=502)

    async def delete_cron(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        job_id = request.match_info["job_id"]
        try:
            return web.json_response(await service.delete_job(job_id))
        except Exception as exc:
            return json_error(str(exc), status=502)

    async def approvals(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        return web.json_response({"approvals": []})

    async def approve(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        return web.json_response({"ok": True})

    async def reject(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        return web.json_response({"ok": True})

    async def memory_search(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        return web.json_response({"results": []})

    async def tools(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        return web.json_response({"tools": []})

    async def skills(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        return web.json_response({"skills": []})

    async def tools_invoke(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        return web.json_response({"ok": False, "error": "Tool invocation is not exposed by the Hermes compatibility layer."})

    async def agent_action(request: web.Request) -> web.Response:
        if auth := require_auth(request):
            return auth
        agent_id = request.match_info["agent_id"]
        try:
            body = await read_json(request)
        except ValueError:
            body = {}
        return web.json_response({"ok": True, "agentId": agent_id, "action": body.get("action"), "supported": False})

    async def session_stream(request: web.Request) -> web.StreamResponse:
        session_id = request.match_info["session_id"]
        ws = web.WebSocketResponse(heartbeat=20.0)
        await ws.prepare(request)
        log_path = service.log_path(session_id)
        if log_path.exists():
            await ws.send_str(log_path.read_text(encoding="utf-8"))
        queue = await service.subscribe(session_id)
        recv_task = asyncio.create_task(ws.receive())
        try:
            while True:
                queue_task = asyncio.create_task(queue.get())
                done, pending = await asyncio.wait({queue_task, recv_task}, return_when=asyncio.FIRST_COMPLETED)
                if queue_task in done:
                    await ws.send_str(queue_task.result())
                if recv_task in done:
                    msg = recv_task.result()
                    if msg.type in {WSMsgType.CLOSE, WSMsgType.CLOSED, WSMsgType.CLOSING, WSMsgType.ERROR}:
                        break
                    recv_task = asyncio.create_task(ws.receive())
                for task in pending:
                    task.cancel()
        finally:
            recv_task.cancel()
            service.unsubscribe(session_id, queue)
            await ws.close()
        return ws

    app = web.Application()
    app.router.add_get("/health", health)
    app.router.add_get("/files", list_files)
    app.router.add_get("/file", read_file)
    app.router.add_post("/file", write_file)
    app.router.add_delete("/file", delete_file)
    app.router.add_get("/chat/history", chat_history)
    app.router.add_get("/chat/history/{session_id}", chat_session_history)
    app.router.add_post("/chat/send", chat_send)
    app.router.add_get("/chat/models", chat_models)
    app.router.add_post("/chat/model", set_chat_model)
    app.router.add_get("/models", models)
    app.router.add_get("/usage", usage)
    app.router.add_get("/logs", logs)
    app.router.add_get("/sessions", sessions)
    app.router.add_get("/sessions/{session_id}", session_detail)
    app.router.add_patch("/sessions/{session_id}", patch_session)
    app.router.add_delete("/sessions/{session_id}", delete_session)
    app.router.add_post("/sessions/{session_id}/compact", compact_session)
    app.router.add_post("/sessions/spawn", spawn_session)
    app.router.add_get("/runtime-config", get_runtime_config)
    app.router.add_patch("/runtime-config", patch_runtime_config)
    app.router.add_get("/crons", list_crons)
    app.router.add_post("/crons", create_cron)
    app.router.add_patch("/crons/{job_id}", patch_cron)
    app.router.add_delete("/crons/{job_id}", delete_cron)
    app.router.add_get("/approvals", approvals)
    app.router.add_post("/approvals/{approval_id}/approve", approve)
    app.router.add_post("/approvals/{approval_id}/reject", reject)
    app.router.add_post("/memory/search", memory_search)
    app.router.add_get("/tools", tools)
    app.router.add_get("/skills", skills)
    app.router.add_post("/tools/invoke", tools_invoke)
    app.router.add_post("/agents/{agent_id}/action", agent_action)
    app.router.add_get("/sessions/{session_id}/stream", session_stream)
    return app


async def run_openclaw_ws(service: CompatService) -> None:
    from websockets.exceptions import ConnectionClosed
    from websockets.legacy.server import serve

    async def handler(websocket, path):
        if path != "/ws":
            await websocket.close(code=1008, reason="unsupported path")
            return
        try:
            async for raw in websocket:
                try:
                    frame = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                frame_id = frame.get("id")
                method = frame.get("method")
                if method == "connect":
                    token = ((frame.get("params") or {}).get("auth") or {}).get("token", "")
                    ok = service._compare_ws_token(token)
                    await websocket.send(json.dumps({"type": "res", "id": frame_id, "ok": ok, "error": None if ok else "Unauthorized"}))
                    if not ok:
                        await websocket.close(code=4401, reason="unauthorized")
                        return
                    continue
                if method == "chat.abort":
                    await websocket.send(json.dumps({"type": "res", "id": frame_id, "ok": True, "payload": {"aborted": False}}))
                    continue
                await websocket.send(json.dumps({"type": "res", "id": frame_id, "ok": True, "payload": {"supported": False}}))
        except ConnectionClosed:
            return

    async with serve(handler, service.ws_host, service.ws_port, ping_interval=20, ping_timeout=20):
        await asyncio.Future()


async def serve_forever(service: CompatService) -> None:
    from aiohttp import web

    app = create_app(service)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host=service.http_host, port=service.http_port)
    ws_task = asyncio.create_task(run_openclaw_ws(service))
    await site.start()
    try:
        await asyncio.Future()
    finally:
        ws_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await ws_task
        await runner.cleanup()
        await service.close()


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Hermes to OpenClaw compatibility layer")
    parser.add_argument("command", choices=["serve"])
    return parser


def main() -> int:
    parser = build_arg_parser()
    args = parser.parse_args()
    service = CompatService()
    if args.command == "serve":
        asyncio.run(serve_forever(service))
        return 0
    parser.error(f"unsupported command: {args.command}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
