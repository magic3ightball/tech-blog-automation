#!/usr/bin/env python3
from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT_DIR / "blog_pipeline" / "config" / "pipeline.yaml"


@dataclass
class SessionIndexEntry:
    session_id: str
    started_at: str
    cwd: str
    path: str
    user_message_count: int
    assistant_message_count: int
    first_user_message: str
    title_hint: str
    has_blog_marker: bool


def load_config(path: Path) -> dict[str, str | int]:
    config: dict[str, str | int] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        key, value = line.split(":", 1)
        value = value.strip()
        if value.isdigit():
            config[key.strip()] = int(value)
        else:
            config[key.strip()] = value
    return config


def iter_jsonl(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return records


def message_text(payload: dict[str, Any]) -> str:
    parts: list[str] = []
    for item in payload.get("content", []):
        if item.get("type") in {"input_text", "output_text"}:
            text = item.get("text", "")
            if text:
                parts.append(text)
    return "\n".join(parts).strip()


def normalize_preview(text: str, limit: int = 220) -> str:
    preview = " ".join(text.split())
    if len(preview) <= limit:
        return preview
    return preview[: limit - 1].rstrip() + "…"


def title_from_message(text: str) -> str:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("<"):
            return normalize_preview(stripped, 90)
    return ""


def is_context_message(text: str) -> bool:
    stripped = text.strip()
    return (
        stripped.startswith("# AGENTS.md instructions")
        or stripped.startswith("<environment_context>")
        or stripped.startswith("<heartbeat>")
    )


def parse_session(path: Path) -> SessionIndexEntry | None:
    records = iter_jsonl(path)
    if not records:
        return None

    session_id = ""
    started_at = ""
    cwd = ""
    user_messages: list[str] = []
    assistant_count = 0

    for record in records:
        record_type = record.get("type")
        payload = record.get("payload", {})

        if record_type == "session_meta" and not session_id:
            session_id = payload.get("id", "")
            started_at = payload.get("timestamp", "")
            cwd = payload.get("cwd", "")
            continue

        if record_type != "response_item":
            continue

        if payload.get("type") != "message":
            continue

        role = payload.get("role")
        if role == "user":
            text = message_text(payload)
            if text and not is_context_message(text):
                user_messages.append(text)
        elif role == "assistant":
            assistant_count += 1

    if not session_id:
        session_id = path.stem

    if not started_at:
        started_at = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()

    first_user_message = user_messages[0] if user_messages else ""
    all_user_text = "\n".join(user_messages)

    return SessionIndexEntry(
        session_id=session_id,
        started_at=started_at,
        cwd=cwd,
        path=str(path),
        user_message_count=len(user_messages),
        assistant_message_count=assistant_count,
        first_user_message=normalize_preview(first_user_message),
        title_hint=title_from_message(first_user_message),
        has_blog_marker="[blog]" in all_user_text.lower(),
    )


def main() -> None:
    config = load_config(CONFIG_PATH)
    sessions_dir = Path(str(config["codex_sessions_dir"])).expanduser()
    output_path = Path(str(config["session_index_path"])).expanduser()
    max_sessions = int(config["max_sessions"])

    session_paths = sorted(
        sessions_dir.glob("**/rollout-*.jsonl"),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )[:max_sessions]

    entries = [entry for path in session_paths if (entry := parse_session(path))]
    entries.sort(key=lambda entry: entry.started_at, reverse=True)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps([asdict(entry) for entry in entries], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"Wrote {len(entries)} sessions to {output_path}")


if __name__ == "__main__":
    main()
