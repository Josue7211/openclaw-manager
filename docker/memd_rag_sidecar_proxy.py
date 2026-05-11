#!/usr/bin/env python3
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def base_url():
    value = os.environ.get("LIGHTRAG_BASE_URL", "").strip().rstrip("/")
    return value or None


def fetch_json(url, payload=None, timeout=45):
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    api_key = os.environ.get("LIGHTRAG_API_KEY", "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"response": raw}


def normalize_results(value, limit):
    if isinstance(value, str):
        source = value
        items = [{"content": source, "source": "LightRAG", "score": 1.0}]
        return items[:limit]
    if not isinstance(value, dict):
        return []
    source_items = value.get("items") or value.get("results")
    if isinstance(source_items, list):
        return source_items[:limit]
    text = value.get("response") or value.get("answer") or value.get("content")
    if isinstance(text, str):
        return [{"content": text, "source": "LightRAG", "score": 1.0}]
    return []


class Handler(BaseHTTPRequestHandler):
    server_version = "memd-rag-sidecar-proxy/0.1"

    def log_message(self, fmt, *args):
        return

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/healthz":
            target = base_url()
            reachable = False
            if target:
                try:
                    fetch_json(f"{target}/health", timeout=4)
                    reachable = True
                except Exception:
                    try:
                        fetch_json(f"{target}/documents/status_counts", timeout=4)
                        reachable = True
                    except Exception:
                        reachable = False
            self.send_json(200, {
                "status": "ok",
                "ok": True,
                "provider": "memd-rag-sidecar-proxy",
                "backend": {
                    "connected": reachable,
                    "name": "memd-rag-sidecar-proxy",
                    "multimodal": True,
                    "profile": "lightrag-proxy",
                },
                "lightrag": {"configured": bool(target), "reachable": reachable},
            })
            return

        target = base_url()
        if target and parsed.path in ("/graph/label/search", "/graph/label/popular", "/graphs"):
            try:
                value = fetch_json(f"{target}{self.path}", timeout=10)
                self.send_json(200, value)
            except urllib.error.HTTPError as error:
                self.send_json(error.code, {"ok": False, "error": str(error)})
            except Exception as error:
                self.send_json(502, {"ok": False, "error": str(error)})
            return

        self.send_json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length", "0") or "0")
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self.send_json(400, {"ok": False, "error": "invalid json"})
            return

        if parsed.path == "/v1/ingest":
            self._handle_ingest(payload)
            return

        if parsed.path != "/v1/retrieve":
            self.send_json(404, {"ok": False, "error": "not found"})
            return

        target = base_url()
        if not target:
            self.send_json(503, {"ok": False, "error": "LIGHTRAG_BASE_URL is not configured"})
            return

        limit = max(1, min(int(payload.get("limit") or 10), 50))
        query = str(payload.get("query") or "").strip()
        if not query:
            self.send_json(400, {"ok": False, "error": "query required"})
            return

        lightrag_payload = {
            "query": query,
            "mode": payload.get("mode") or "hybrid",
            "top_k": limit,
        }
        try:
            value = fetch_json(f"{target}/query", lightrag_payload)
            self.send_json(200, {"ok": True, "items": normalize_results(value, limit)})
        except urllib.error.HTTPError as error:
            self.send_json(error.code, {"ok": False, "error": str(error)})
        except Exception as error:
            self.send_json(502, {"ok": False, "error": str(error)})

    def _handle_ingest(self, payload):
        """Accept memd-server's RAG ingest request.

        memd-rag's RagIngestResponse expects {status, track_id, items}.
        We best-effort forward the document to LightRAG's /documents/text
        endpoint. If LightRAG isn't reachable or rejects, we still ack so
        memd-server's hot path doesn't spam warn logs and so its retries
        don't pile up — the local SQLite store remains authoritative.
        """
        source = payload.get("source") or {}
        content = str(source.get("content") or "").strip()
        track_id = str(source.get("id") or "")
        target = base_url()
        items_ingested = 0
        if target and content:
            lightrag_body = {
                "text": content,
                "description": ", ".join(filter(None, [
                    f"id={track_id}" if track_id else "",
                    f"kind={source.get('kind')}" if source.get("kind") else "",
                    f"project={payload.get('project')}" if payload.get("project") else "",
                ])) or None,
            }
            try:
                fetch_json(f"{target}/documents/text", lightrag_body, timeout=15)
                items_ingested = 1
            except Exception:
                # Best effort — local store is the source of truth, sidecar
                # is auxiliary. Ack with items=0 so callers know nothing was
                # indexed without treating it as an error.
                items_ingested = 0
        self.send_json(200, {
            "status": "accepted" if items_ingested else "skipped",
            "track_id": track_id or "00000000-0000-0000-0000-000000000000",
            "items": items_ingested,
        })


def main():
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "9000"))
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
