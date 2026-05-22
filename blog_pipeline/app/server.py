#!/usr/bin/env python3
from __future__ import annotations

import json
import mimetypes
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT_DIR = Path(__file__).resolve().parents[2]
BLOG_PIPELINE_DIR = ROOT_DIR / "blog_pipeline"
STATIC_DIR = BLOG_PIPELINE_DIR / "app" / "static"
SCRIPTS_DIR = BLOG_PIPELINE_DIR / "scripts"
CONFIG_PATH = BLOG_PIPELINE_DIR / "config" / "pipeline.yaml"

sys.path.insert(0, str(SCRIPTS_DIR))

from index_sessions import (  # noqa: E402
    is_context_message,
    iter_jsonl,
    load_config,
    main as rebuild_index,
    message_text,
)


def json_response(handler: BaseHTTPRequestHandler, payload: object, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def text_response(handler: BaseHTTPRequestHandler, text: str, status: int = 200) -> None:
    body = text.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "text/plain; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def load_index() -> list[dict[str, object]]:
    config = load_config(CONFIG_PATH)
    index_path = Path(str(config["session_index_path"])).expanduser()
    if not index_path.exists():
        rebuild_index()
    return json.loads(index_path.read_text(encoding="utf-8"))


def session_messages(path: Path) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    for record in iter_jsonl(path):
        if record.get("type") != "response_item":
            continue

        payload = record.get("payload", {})
        if payload.get("type") != "message":
            continue

        role = payload.get("role")
        if role not in {"user", "assistant"}:
            continue

        text = message_text(payload)
        if not text or is_context_message(text):
            continue

        messages.append({"role": role, "text": text})

    return messages


def find_session(session_id: str) -> dict[str, object] | None:
    for entry in load_index():
        if entry.get("session_id") == session_id:
            return entry
    return None


class BlogPipelineHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path == "/api/sessions":
            json_response(self, load_index())
            return

        if path.startswith("/api/sessions/"):
            session_id = path.removeprefix("/api/sessions/")
            entry = find_session(session_id)
            if not entry:
                json_response(self, {"error": "Session not found"}, HTTPStatus.NOT_FOUND)
                return

            session_path = Path(str(entry["path"]))
            payload = dict(entry)
            payload["messages"] = session_messages(session_path)
            json_response(self, payload)
            return

        self.serve_static(path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/reindex":
            rebuild_index()
            json_response(self, {"ok": True, "sessions": len(load_index())})
            return

        json_response(self, {"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def serve_static(self, path: str) -> None:
        if path in {"", "/"}:
            file_path = STATIC_DIR / "index.html"
        else:
            file_path = (STATIC_DIR / path.lstrip("/")).resolve()
            if STATIC_DIR.resolve() not in file_path.parents:
                text_response(self, "Forbidden", HTTPStatus.FORBIDDEN)
                return

        if not file_path.exists() or not file_path.is_file():
            text_response(self, "Not found", HTTPStatus.NOT_FOUND)
            return

        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        body = file_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        return


def main() -> None:
    host = "127.0.0.1"
    port = 8765
    server = ThreadingHTTPServer((host, port), BlogPipelineHandler)
    print(f"Blog Pipeline UI running at http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
