const SLACK_HISTORY_URL = "https://slack.com/api/conversations.history";

export async function fetchSlackChannelMessages(config, range, fetchImpl = fetch, sleep = wait) {
  const messages = [];
  let cursor = "";

  do {
    const data = await requestSlackHistory(config, range, cursor, fetchImpl, sleep);
    messages.push(...data.messages.filter(isUserMessage));
    cursor = data.response_metadata?.next_cursor || "";
  } while (cursor);

  return messages.sort((left, right) => Number.parseFloat(left.ts) - Number.parseFloat(right.ts));
}

async function requestSlackHistory(config, range, cursor, fetchImpl, sleep) {
  const url = new URL(SLACK_HISTORY_URL);
  url.searchParams.set("channel", config.slackArchiveChannelId);
  url.searchParams.set("oldest", range.oldest);
  url.searchParams.set("latest", range.latest);
  url.searchParams.set("inclusive", "true");
  url.searchParams.set("limit", "200");

  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${config.slackBotToken}`
    }
  });

  if (response.status === 429) {
    const retryAfter = Number(response.headers?.get?.("retry-after") || 1);
    await sleep(retryAfter * 1000);
    return requestSlackHistory(config, range, cursor, fetchImpl, sleep);
  }

  if (!response.ok) {
    throw new Error(`Slack history request failed: ${response.status}`);
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(`Slack history request failed: ${data.error || "unknown_error"}`);
  }

  return data;
}

function isUserMessage(message) {
  return message.type === "message" && !message.subtype && message.user && message.text;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
