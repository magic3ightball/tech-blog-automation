import test from "node:test";
import assert from "node:assert/strict";
import {
  buildArchivePath,
  getPreviousKstDayRange,
  renderSlackArchiveMarkdown
} from "../src/archiveMarkdown.js";
import { getConfig } from "../src/config.js";

test("getConfig reads Slack archive defaults and overrides", () => {
  const config = getConfig({
    SLACK_ARCHIVE_CHANNEL_ID: "C123",
    SLACK_ARCHIVE_TARGET_DIR: "logs/slack",
    SLACK_ARCHIVE_TIMEZONE: "Asia/Seoul",
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_REPOSITORY: "org/repo",
    GITHUB_RUN_ID: "123"
  });

  assert.equal(config.slackArchiveChannelId, "C123");
  assert.equal(config.slackArchiveTargetDir, "logs/slack");
  assert.equal(config.slackArchiveTimezone, "Asia/Seoul");
  assert.equal(config.slackNotifyChannelId, "C123");
  assert.equal(config.slackNotifyOnSuccess, true);
  assert.equal(config.slackNotifyOnFailure, true);
  assert.equal(config.githubActionsRunUrl, "https://github.com/org/repo/actions/runs/123");
});

test("getConfig reads Slack notification overrides", () => {
  const config = getConfig({
    SLACK_ARCHIVE_CHANNEL_ID: "C123",
    SLACK_NOTIFY_CHANNEL_ID: "C999",
    SLACK_NOTIFY_ON_SUCCESS: "false",
    SLACK_NOTIFY_ON_FAILURE: "0"
  });

  assert.equal(config.slackNotifyChannelId, "C999");
  assert.equal(config.slackNotifyOnSuccess, false);
  assert.equal(config.slackNotifyOnFailure, false);
});

test("getPreviousKstDayRange returns the previous KST day", () => {
  const range = getPreviousKstDayRange(new Date("2026-05-22T15:00:00.000Z"));

  assert.equal(range.date, "2026-05-22");
  assert.equal(range.oldest, "1779375600");
  assert.equal(range.latest, "1779461999.999");
  assert.equal(range.startLabel, "2026-05-22 00:00:00 KST");
  assert.equal(range.endLabel, "2026-05-22 23:59:59 KST");
});

test("buildArchivePath normalizes the target directory", () => {
  assert.equal(buildArchivePath("/slack-archive/", "2026-05-22"), "slack-archive/2026-05-22.md");
});

test("renderSlackArchiveMarkdown renders messages in KST order labels", () => {
  const markdown = renderSlackArchiveMarkdown({
    channelId: "C123",
    range: {
      date: "2026-05-22",
      startLabel: "2026-05-22 00:00:00 KST",
      endLabel: "2026-05-22 23:59:59 KST"
    },
    messages: [
      {
        ts: "1779408720.000000",
        user: "U123",
        text: "첫 메시지"
      }
    ]
  });

  assert.equal(
    markdown,
    [
      "# Slack Archive 2026-05-22",
      "",
      "Channel: C123",
      "Range: 2026-05-22 00:00:00 KST to 2026-05-22 23:59:59 KST",
      "",
      "## Messages",
      "",
      "### 09:12 U123",
      "첫 메시지",
      ""
    ].join("\n")
  );
});

test("renderSlackArchiveMarkdown renders an empty day", () => {
  const markdown = renderSlackArchiveMarkdown({
    channelId: "C123",
    range: {
      date: "2026-05-22",
      startLabel: "2026-05-22 00:00:00 KST",
      endLabel: "2026-05-22 23:59:59 KST"
    },
    messages: []
  });

  assert.match(markdown, /_No messages\._\n$/);
});
