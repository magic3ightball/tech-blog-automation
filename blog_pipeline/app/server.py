#!/usr/bin/env python3
from __future__ import annotations

import json
import mimetypes
import re
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
    normalize_preview,
    title_from_message,
)


PUBLISHABLE_KEYWORDS = {
    "automation",
    "blog",
    "draft",
    "extract",
    "mvp",
    "obsidian",
    "publish",
    "strategy",
    "workflow",
    "구현",
    "글감",
    "발행",
    "블로그",
    "선택",
    "자동화",
    "전략",
    "추출",
    "흐름",
}

RISK_KEYWORDS = {
    "api key",
    "password",
    "secret",
    "token",
    "계정",
    "비밀번호",
    "시크릿",
    "토큰",
}


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


def read_json_body(handler: BaseHTTPRequestHandler) -> dict[str, object]:
    length = int(handler.headers.get("Content-Length", "0"))
    if length <= 0:
        return {}
    body = handler.rfile.read(length).decode("utf-8")
    return json.loads(body)


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


def candidate_score(text: str) -> int:
    lower_text = text.lower()
    score = sum(1 for keyword in PUBLISHABLE_KEYWORDS if keyword in lower_text)
    if len(text) > 800:
        score += 2
    elif len(text) > 400:
        score += 1
    return score


def risk_level(text: str) -> str:
    lower_text = text.lower()
    if any(keyword in lower_text for keyword in RISK_KEYWORDS):
        return "medium"
    return "low"


def candidate_reason(score: int, text: str) -> str:
    if score >= 6:
        return "대화 안에 문제의식, 구조화, 실행 방향이 함께 있어 블로그 글감으로 쓰기 좋습니다."
    if "?" in text:
        return "질문에서 출발해 답변이 구조화되어 있어 짧은 설명형 글감으로 쓸 수 있습니다."
    return "하나의 주제로 이어지는 대화 구간이라 extracted 노트 후보로 볼 수 있습니다."


def candidate_topic_from_user_text(text: str) -> str:
    lines = [line.strip() for line in text.splitlines()]
    for index, line in enumerate(lines):
        if line.startswith("## My request"):
            for request_line in lines[index + 1 :]:
                if request_line and not request_line.startswith("#"):
                    return normalize_preview(request_line, 90)

    for line in lines:
        if not line or line.startswith("#") or line.startswith("<"):
            continue
        return normalize_preview(line, 90)

    return normalize_preview(text, 90)


def extract_candidates(entry: dict[str, object]) -> list[dict[str, object]]:
    messages = session_messages(Path(str(entry["path"])))
    raw_candidates: list[dict[str, object]] = []

    for index, message in enumerate(messages):
        if message["role"] != "user":
            continue

        window = messages[index : index + 4]
        if len(window) < 2:
            continue

        combined = "\n\n".join(f'{item["role"].upper()}: {item["text"]}' for item in window)
        score = candidate_score(combined)
        if score < 2 and len(combined) < 500:
            continue

        topic = candidate_topic_from_user_text(message["text"]) or title_from_message(message["text"])
        raw_candidates.append(
            {
                "turn_start": index + 1,
                "turn_end": index + len(window),
                "topic_hint": topic,
                "summary": normalize_preview(combined, 260),
                "why_publishable": candidate_reason(score, combined),
                "risk_level": risk_level(combined),
                "score": score,
                "raw_excerpt": combined,
            }
        )

    raw_candidates.sort(key=lambda item: int(item["score"]), reverse=True)
    selected = raw_candidates[:3]

    for index, candidate in enumerate(selected, start=1):
        candidate["candidate_id"] = f"cand_{index:03d}"
        candidate["source_session_id"] = entry["session_id"]
        candidate["source_path"] = entry["path"]
        candidate["source_date"] = str(entry.get("started_at", ""))[:10]
        candidate["publishable"] = candidate["risk_level"] == "low"

    return selected


def slugify(value: str) -> str:
    slug = re.sub(r"[^0-9A-Za-z가-힣]+", "_", value).strip("_").lower()
    return slug[:48] or "session"


def markdown_escape(value: object) -> str:
    return str(value).replace('"', '\\"')


def candidate_markdown(candidate: dict[str, object]) -> str:
    title = str(candidate["topic_hint"])
    return f"""---
type: blog_extract
status: extracted
source: codex
source_session_id: "{markdown_escape(candidate["source_session_id"])}"
source_path: "{markdown_escape(candidate["source_path"])}"
source_date: "{markdown_escape(candidate["source_date"])}"
candidate_id: "{markdown_escape(candidate["candidate_id"])}"
risk_level: "{markdown_escape(candidate["risk_level"])}"
publishable: {str(candidate["publishable"]).lower()}
tags:
  - blog_pipeline
  - codex
---

# {title}

## 핵심 요약
{candidate["summary"]}

## 왜 글감인가
{candidate["why_publishable"]}

## 추출된 구간
Turn {candidate["turn_start"]} to {candidate["turn_end"]}

## 원문 구간
````text
{candidate["raw_excerpt"]}
````

## 다음 액션
블로그 초안으로 변환할지 검토.
"""


def save_candidate(candidate: dict[str, object]) -> Path:
    config = load_config(CONFIG_PATH)
    obsidian_dir = Path(str(config["obsidian_blog_dir"])).expanduser()
    extracted_dir = obsidian_dir / "extracted"
    extracted_dir.mkdir(parents=True, exist_ok=True)

    date = str(candidate["source_date"]) or "unknown_date"
    session_id = str(candidate["source_session_id"])[:8]
    candidate_id = str(candidate["candidate_id"])
    slug = slugify(str(candidate["topic_hint"]))
    path = extracted_dir / f"{date}_{session_id}_{candidate_id}_{slug}.md"
    path.write_text(candidate_markdown(candidate), encoding="utf-8")
    return path


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

        if parsed.path.startswith("/api/sessions/") and parsed.path.endswith("/extract"):
            session_id = unquote(parsed.path.removeprefix("/api/sessions/").removesuffix("/extract"))
            entry = find_session(session_id)
            if not entry:
                json_response(self, {"error": "Session not found"}, HTTPStatus.NOT_FOUND)
                return

            json_response(self, {"candidates": extract_candidates(entry)})
            return

        if parsed.path == "/api/candidates/save":
            request = read_json_body(self)
            session_id = str(request.get("session_id", ""))
            candidate_id = str(request.get("candidate_id", ""))
            entry = find_session(session_id)
            if not entry:
                json_response(self, {"error": "Session not found"}, HTTPStatus.NOT_FOUND)
                return

            candidates = extract_candidates(entry)
            candidate = next((item for item in candidates if item["candidate_id"] == candidate_id), None)
            if not candidate:
                json_response(self, {"error": "Candidate not found"}, HTTPStatus.NOT_FOUND)
                return

            path = save_candidate(candidate)
            json_response(self, {"ok": True, "path": str(path)})
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
