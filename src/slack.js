import { App } from "@slack/bolt";

export function cleanMentionText(text = "", botUserId = "") {
  const withoutMention = botUserId
    ? text.replace(new RegExp(`<@${escapeRegExp(botUserId)}>`, "g"), "")
    : text.replace(/<@[A-Z0-9]+>/g, "");

  return withoutMention.replace(/\s+/g, " ").trim();
}

export function getThreadTs(event) {
  return event.thread_ts || event.ts;
}

export function createSlackApp(config, handlers) {
  const app = new App({
    token: config.slackBotToken,
    appToken: config.slackAppToken,
    socketMode: true
  });

  app.event("app_mention", async ({ event, client, context, logger }) => {
    const question = cleanMentionText(event.text, context.botUserId);
    const threadTs = getThreadTs(event);

    if (!question) {
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: threadTs,
        text: "질문을 함께 입력해 주세요."
      });
      return;
    }

    try {
      const answer = await handlers.answerQuestion(question, {
        channel: event.channel,
        threadTs,
        user: event.user
      });

      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: threadTs,
        text: answer
      });
    } catch (error) {
      logger?.error?.(error);
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: threadTs,
        text: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
      });
    }
  });

  return app;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
