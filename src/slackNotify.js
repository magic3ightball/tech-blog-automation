const SLACK_POST_MESSAGE_URL = "https://slack.com/api/chat.postMessage";

export async function postSlackMessage(config, text, fetchImpl = fetch) {
  const response = await fetchImpl(SLACK_POST_MESSAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.slackBotToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      channel: config.slackNotifyChannelId,
      text
    })
  });

  if (!response.ok) {
    throw new Error(`Slack notification request failed: ${response.status}`);
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(`Slack notification request failed: ${data.error || "unknown_error"}`);
  }

  return data;
}

export function buildSuccessNotification({ range, path, messageCount, htmlUrl }) {
  return [
    `Slack archive completed: ${range.date}`,
    `${messageCount} messages uploaded to ${path}`,
    htmlUrl
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildFailureNotification({ range, step, error, runUrl }) {
  return [
    `Slack archive failed: ${range?.date || "unknown date"}`,
    `Step: ${step || "unknown"}`,
    `Error: ${formatError(error)}`,
    runUrl
  ]
    .filter(Boolean)
    .join("\n");
}

function formatError(error) {
  if (!error) {
    return "Unknown error";
  }

  return error.message || String(error);
}
