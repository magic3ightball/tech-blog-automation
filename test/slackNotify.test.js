import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFailureNotification,
  buildSuccessNotification,
  postSlackMessage
} from "../src/slackNotify.js";

test("postSlackMessage posts text to the configured channel", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, ts: "1779462000.000000" })
    };
  };

  const result = await postSlackMessage(
    {
      slackBotToken: "xoxb-token",
      slackNotifyChannelId: "C999"
    },
    "Archive completed",
    fetchImpl
  );
  const body = JSON.parse(calls[0].options.body);

  assert.equal(calls[0].url, "https://slack.com/api/chat.postMessage");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.Authorization, "Bearer xoxb-token");
  assert.equal(body.channel, "C999");
  assert.equal(body.text, "Archive completed");
  assert.equal(result.ts, "1779462000.000000");
});

test("postSlackMessage throws Slack API errors", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: false, error: "not_in_channel" })
  });

  await assert.rejects(
    () =>
      postSlackMessage(
        {
          slackBotToken: "xoxb-token",
          slackNotifyChannelId: "C999"
        },
        "Archive completed",
        fetchImpl
      ),
    /not_in_channel/
  );
});

test("buildSuccessNotification renders the archive result", () => {
  const text = buildSuccessNotification({
    range: { date: "2026-05-22" },
    path: "slack-archive/2026-05-22.md",
    messageCount: 23,
    htmlUrl: "https://github.test/file"
  });

  assert.equal(
    text,
    [
      "Slack archive completed: 2026-05-22",
      "23 messages uploaded to slack-archive/2026-05-22.md",
      "https://github.test/file"
    ].join("\n")
  );
});

test("buildFailureNotification renders step, error, and run URL", () => {
  const text = buildFailureNotification({
    range: { date: "2026-05-22" },
    step: "github_upload",
    error: new Error("GitHub file upsert failed"),
    runUrl: "https://github.test/actions/runs/123"
  });

  assert.equal(
    text,
    [
      "Slack archive failed: 2026-05-22",
      "Step: github_upload",
      "Error: GitHub file upsert failed",
      "https://github.test/actions/runs/123"
    ].join("\n")
  );
});
