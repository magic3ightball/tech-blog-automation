import "dotenv/config";
import { getConfig, requireKeys } from "./config.js";
import { buildArchivePath, getPreviousKstDayRange, renderSlackArchiveMarkdown } from "./archiveMarkdown.js";
import { fetchSlackChannelMessages } from "./slackArchive.js";
import { upsertGithubFile } from "./github.js";
import {
  buildFailureNotification,
  buildSuccessNotification,
  postSlackMessage
} from "./slackNotify.js";

export async function runSlackArchive(config, dependencies = {}) {
  requireKeys(config, [
    "slackBotToken",
    "slackArchiveChannelId",
    "githubToken",
    "githubOwner",
    "githubRepo"
  ]);

  const getRange = dependencies.getRange || getPreviousKstDayRange;
  const fetchMessages = dependencies.fetchMessages || fetchSlackChannelMessages;
  const upsertFile = dependencies.upsertFile || upsertGithubFile;
  const postMessage = dependencies.postMessage || postSlackMessage;

  let range;
  let step = "calculate_range";

  try {
    range = getRange();
    step = "fetch_slack_messages";
    const messages = await fetchMessages(config, range);
    step = "render_markdown";
    const markdown = renderSlackArchiveMarkdown({
      channelId: config.slackArchiveChannelId,
      range,
      messages
    });
    const path = buildArchivePath(config.slackArchiveTargetDir, range.date);
    step = "github_upload";
    const result = await upsertFile(config, path, markdown);
    const archiveResult = {
      path,
      messageCount: messages.length,
      htmlUrl: result.content?.html_url || result.content?.url || ""
    };

    if (config.slackNotifyOnSuccess) {
      step = "slack_success_notification";
      await postMessage(
        config,
        buildSuccessNotification({
          range,
          path: archiveResult.path,
          messageCount: archiveResult.messageCount,
          htmlUrl: archiveResult.htmlUrl
        })
      );
    }

    return archiveResult;
  } catch (error) {
    if (config.slackNotifyOnFailure && step !== "slack_failure_notification") {
      try {
        step = await notifyFailure(config, postMessage, range, step, error);
      } catch (notificationError) {
        console.warn(`Slack failure notification failed: ${notificationError.message}`);
      }
    }

    throw error;
  }
}

async function notifyFailure(config, postMessage, range, failedStep, error) {
  const notificationStep = "slack_failure_notification";
  await postMessage(
    config,
    buildFailureNotification({
      range,
      step: failedStep,
      error,
      runUrl: config.githubActionsRunUrl
    })
  );
  return notificationStep;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runSlackArchive(getConfig());
  console.log(`Archived ${result.messageCount} Slack messages to ${result.path}`);
  if (result.htmlUrl) {
    console.log(result.htmlUrl);
  }
}
