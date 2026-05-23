import test from "node:test";
import assert from "node:assert/strict";
import { collectGithubDocuments, isDocumentPath, upsertGithubFile } from "../src/github.js";

test("isDocumentPath accepts MVP wiki document extensions", () => {
  assert.equal(isDocumentPath("README.md"), true);
  assert.equal(isDocumentPath("docs/guide.mdx"), true);
  assert.equal(isDocumentPath("notes/runbook.txt"), true);
  assert.equal(isDocumentPath("src/app.js"), false);
});

test("collectGithubDocuments recursively collects document files", async () => {
  const responses = new Map([
    [
      ".",
      [
        { type: "dir", path: "docs" },
        { type: "file", path: "src/app.js", size: 10 }
      ]
    ],
    [
      "docs",
      [
        {
          type: "file",
          path: "docs/wiki.md",
          size: 10,
          sha: "abc",
          html_url: "https://github.test/docs/wiki.md"
        }
      ]
    ],
    [
      "docs/wiki.md",
      {
        type: "file",
        path: "docs/wiki.md",
        size: 10,
        sha: "abc",
        html_url: "https://github.test/docs/wiki.md",
        encoding: "base64",
        content: Buffer.from("hello wiki").toString("base64")
      }
    ]
  ]);

  const fetchImpl = async (url) => {
    const key = decodeURIComponent(url.pathname.split("/contents/")[1] || ".");
    return {
      ok: true,
      json: async () => responses.get(key)
    };
  };

  const documents = await collectGithubDocuments(
    {
      githubOwner: "org",
      githubRepo: "repo",
      githubBranch: "main",
      githubToken: "token"
    },
    fetchImpl
  );

  assert.deepEqual(documents, [
    {
      path: "docs/wiki.md",
      sha: "abc",
      url: "https://github.test/docs/wiki.md",
      content: "hello wiki"
    }
  ]);
});

test("upsertGithubFile creates a file when it does not exist", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });

    if (!options.method) {
      return { ok: false, status: 404 };
    }

    return {
      ok: true,
      status: 201,
      json: async () => ({ content: { path: "slack-archive/2026-05-22.md" } })
    };
  };

  const result = await upsertGithubFile(
    githubConfig(),
    "slack-archive/2026-05-22.md",
    "hello",
    fetchImpl
  );
  const body = JSON.parse(calls[1].options.body);

  assert.equal(calls[1].options.method, "PUT");
  assert.equal(body.branch, "main");
  assert.equal(body.content, Buffer.from("hello", "utf8").toString("base64"));
  assert.equal("sha" in body, false);
  assert.equal(result.content.path, "slack-archive/2026-05-22.md");
});

test("upsertGithubFile updates a file when it already exists", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });

    if (!options.method) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ sha: "existing-sha" })
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({ content: { sha: "new-sha" } })
    };
  };

  await upsertGithubFile(githubConfig(), "slack-archive/2026-05-22.md", "updated", fetchImpl);
  const body = JSON.parse(calls[1].options.body);

  assert.equal(body.sha, "existing-sha");
  assert.equal(body.content, Buffer.from("updated", "utf8").toString("base64"));
});

function githubConfig() {
  return {
    githubOwner: "org",
    githubRepo: "repo",
    githubBranch: "main",
    githubToken: "token"
  };
}
