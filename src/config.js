export function getConfig(env = process.env) {
  return {
    slackBotToken: env.SLACK_BOT_TOKEN,
    slackAppToken: env.SLACK_APP_TOKEN,
    openaiApiKey: env.OPENAI_API_KEY,
    githubToken: env.GITHUB_TOKEN,
    githubOwner: env.GITHUB_OWNER,
    githubRepo: env.GITHUB_REPO,
    githubBranch: env.GITHUB_BRANCH || "main",
    slackArchiveChannelId: env.SLACK_ARCHIVE_CHANNEL_ID,
    slackArchiveTargetDir: env.SLACK_ARCHIVE_TARGET_DIR || "slack-archive",
    slackArchiveTimezone: env.SLACK_ARCHIVE_TIMEZONE || "Asia/Seoul",
    slackNotifyChannelId: env.SLACK_NOTIFY_CHANNEL_ID || env.SLACK_ARCHIVE_CHANNEL_ID,
    slackNotifyOnSuccess: parseBoolean(env.SLACK_NOTIFY_ON_SUCCESS, true),
    slackNotifyOnFailure: parseBoolean(env.SLACK_NOTIFY_ON_FAILURE, true),
    githubActionsRunUrl: buildGithubActionsRunUrl(env),
    openaiModel: env.OPENAI_MODEL || "gpt-4.1-mini",
    wikiSearchScoreThreshold: Number(env.WIKI_SEARCH_SCORE_THRESHOLD || 0.35),
    activeVectorStoreId: env.ACTIVE_VECTOR_STORE_ID,
    stateFile: env.STATE_FILE || ".data/active-vector-store.json"
  };
}

export function requireKeys(config, keys) {
  const missing = keys.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required config: ${missing.join(", ")}`);
  }
}

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === "") {
    return defaultValue;
  }

  return !["0", "false", "no", "off"].includes(String(value).toLowerCase());
}

function buildGithubActionsRunUrl(env) {
  if (!env.GITHUB_SERVER_URL || !env.GITHUB_REPOSITORY || !env.GITHUB_RUN_ID) {
    return "";
  }

  return `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
}
