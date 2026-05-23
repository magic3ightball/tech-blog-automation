import test from "node:test";
import assert from "node:assert/strict";
import { runSlackArchive } from "../src/archiveSlack.js";

test("runSlackArchive collects Slack messages and uploads markdown", async () => {
  const uploads = [];
  const notifications = [];
  const result = await runSlackArchive(
    {
      slackBotToken: "xoxb-token",
      slackArchiveChannelId: "C123",
      slackNotifyChannelId: "C123",
      slackNotifyOnSuccess: true,
      slackNotifyOnFailure: true,
      slackArchiveTargetDir: "slack-archive",
      githubToken: "github-token",
      githubOwner: "org",
      githubRepo: "repo",
      githubBranch: "main"
    },
    {
      getRange: () => ({
        date: "2026-05-22",
        oldest: "1779375600",
        latest: "1779461999.999",
        startLabel: "2026-05-22 00:00:00 KST",
        endLabel: "2026-05-22 23:59:59 KST"
      }),
      fetchMessages: async () => [
        {
          ts: "1779408720.000000",
          user: "U123",
          text: "hello"
        }
      ],
      upsertFile: async (config, path, markdown) => {
        uploads.push({ config, path, markdown });
        return { content: { html_url: "https://github.test/file" } };
      },
      postMessage: async (config, text) => {
        notifications.push({ config, text });
      }
    }
  );

  assert.equal(result.path, "slack-archive/2026-05-22.md");
  assert.equal(result.messageCount, 1);
  assert.equal(result.htmlUrl, "https://github.test/file");
  assert.equal(uploads[0].path, "slack-archive/2026-05-22.md");
  assert.match(uploads[0].markdown, /# Slack Archive 2026-05-22/);
  assert.match(uploads[0].markdown, /hello/);
  assert.match(notifications[0].text, /Slack archive completed: 2026-05-22/);
  assert.match(notifications[0].text, /1 messages uploaded to slack-archive\/2026-05-22\.md/);
  assert.match(notifications[0].text, /https:\/\/github.test\/file/);
});

test("runSlackArchive skips success notification when disabled", async () => {
  const notifications = [];

  await runSlackArchive(baseConfig({ slackNotifyOnSuccess: false }), {
    getRange: fixedRange,
    fetchMessages: async () => [],
    upsertFile: async () => ({ content: { html_url: "https://github.test/file" } }),
    postMessage: async (config, text) => {
      notifications.push({ config, text });
    }
  });

  assert.equal(notifications.length, 0);
});

test("runSlackArchive posts failure notification and rethrows the original error", async () => {
  const notifications = [];
  const failure = new Error("GitHub file upsert failed");

  await assert.rejects(
    () =>
      runSlackArchive(baseConfig({ githubActionsRunUrl: "https://github.test/actions/runs/123" }), {
        getRange: fixedRange,
        fetchMessages: async () => [],
        upsertFile: async () => {
          throw failure;
        },
        postMessage: async (config, text) => {
          notifications.push({ config, text });
        }
      }),
    failure
  );

  assert.equal(notifications.length, 1);
  assert.match(notifications[0].text, /Slack archive failed: 2026-05-22/);
  assert.match(notifications[0].text, /Step: github_upload/);
  assert.match(notifications[0].text, /Error: GitHub file upsert failed/);
  assert.match(notifications[0].text, /https:\/\/github.test\/actions\/runs\/123/);
});

test("runSlackArchive skips failure notification when disabled", async () => {
  const notifications = [];
  const failure = new Error("Slack history failed");

  await assert.rejects(
    () =>
      runSlackArchive(baseConfig({ slackNotifyOnFailure: false }), {
        getRange: fixedRange,
        fetchMessages: async () => {
          throw failure;
        },
        postMessage: async (config, text) => {
          notifications.push({ config, text });
        }
      }),
    failure
  );

  assert.equal(notifications.length, 0);
});

function baseConfig(overrides = {}) {
  return {
    slackBotToken: "xoxb-token",
    slackArchiveChannelId: "C123",
    slackNotifyChannelId: "C123",
    slackNotifyOnSuccess: true,
    slackNotifyOnFailure: true,
    slackArchiveTargetDir: "slack-archive",
    githubToken: "github-token",
    githubOwner: "org",
    githubRepo: "repo",
    githubBranch: "main",
    ...overrides
  };
}

function fixedRange() {
  return {
    date: "2026-05-22",
    oldest: "1779375600",
    latest: "1779461999.999",
    startLabel: "2026-05-22 00:00:00 KST",
    endLabel: "2026-05-22 23:59:59 KST"
  };
}
