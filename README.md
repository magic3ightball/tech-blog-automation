# Tech Blog Automation

This repository contains a local pipeline for turning selected Codex conversations into Obsidian notes and, later, blog drafts.

Current MVP scope:

1. Index recent Codex session logs.
2. Show enough metadata to choose useful sessions.
3. Use selected sessions for blog candidate extraction in the next step.

The first implementation only creates a session index. It does not publish anything.

## Layout

```text
blog_pipeline/
  config/
    pipeline.yaml
  data/
    session_index.json
  scripts/
    index_sessions.py
```

Obsidian output target:

```text
/Users/hyerimjeong/Obsidian/Vault/context/blog_pipeline
```

## Usage

```sh
python3 blog_pipeline/scripts/index_sessions.py
```

The script reads Codex JSONL session logs and writes:

```text
blog_pipeline/data/session_index.json
```
