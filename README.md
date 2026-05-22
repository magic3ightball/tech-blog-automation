# Tech Blog Automation

This repository contains a local pipeline for turning selected Codex conversations into Obsidian notes and, later, blog drafts.

Current MVP scope:

1. Index recent Codex session logs.
2. Show sessions in a local browser UI.
3. Preview a selected conversation before extraction.
4. Extract blog candidate sections from a selected session.
5. Save selected candidates as Obsidian Markdown notes.

The current implementation does not publish anything.

## Layout

```text
blog_pipeline/
  config/
    pipeline.yaml
  data/
    session_index.json
  app/
    server.py
    static/
      index.html
      styles.css
      app.js
  scripts/
    index_sessions.py
```

Obsidian output target:

```text
/Users/hyerimjeong/Obsidian/Vault/context/blog_pipeline
```

## Usage

Index sessions:

```sh
python3 blog_pipeline/scripts/index_sessions.py
```

Start the local UI:

```sh
python3 blog_pipeline/app/server.py
```

Then open `http://127.0.0.1:8765`.

From the UI, select a session, click `Extract candidates`, then save useful candidates to Obsidian.
