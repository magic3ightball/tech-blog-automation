const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

export function getPreviousKstDayRange(now = new Date()) {
  const shifted = new Date(now.getTime() + SEOUL_OFFSET_MS);
  const startUtc =
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate() - 1,
      0,
      0,
      0
    ) - SEOUL_OFFSET_MS;

  return {
    date: formatDate(new Date(startUtc + SEOUL_OFFSET_MS)),
    oldest: String(startUtc / 1000),
    latest: String((startUtc + 24 * 60 * 60 * 1000 - 1) / 1000),
    startLabel: `${formatDateTime(new Date(startUtc + SEOUL_OFFSET_MS))} KST`,
    endLabel: `${formatDateTime(new Date(startUtc + 24 * 60 * 60 * 1000 - 1 + SEOUL_OFFSET_MS))} KST`
  };
}

export function buildArchivePath(targetDir, date) {
  const cleanDir = String(targetDir || "slack-archive").replace(/^\/+|\/+$/g, "");
  return `${cleanDir}/${date}.md`;
}

export function renderSlackArchiveMarkdown({ channelId, range, messages }) {
  const lines = [
    `# Slack Archive ${range.date}`,
    "",
    `Channel: ${channelId}`,
    `Range: ${range.startLabel} to ${range.endLabel}`,
    "",
    "## Messages",
    ""
  ];

  if (messages.length === 0) {
    lines.push("_No messages._");
    return `${lines.join("\n")}\n`;
  }

  for (const message of messages) {
    lines.push(`### ${formatKstTimeFromSlackTs(message.ts)} ${message.user || "unknown"}`);
    lines.push(message.text || "");
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function formatDate(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function formatDateTime(date) {
  return `${formatDate(date)} ${[
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0"),
    String(date.getUTCSeconds()).padStart(2, "0")
  ].join(":")}`;
}

function formatKstTimeFromSlackTs(ts) {
  const seconds = Number.parseFloat(ts || "0");
  const date = new Date(seconds * 1000 + SEOUL_OFFSET_MS);
  return [
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0")
  ].join(":");
}
