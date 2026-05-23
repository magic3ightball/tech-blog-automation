import "dotenv/config";
import { getConfig, requireKeys } from "./config.js";
import { createSlackApp } from "./slack.js";
import { answerQuestion } from "./answer.js";

const config = getConfig();
requireKeys(config, ["slackBotToken", "slackAppToken", "openaiApiKey"]);

const app = createSlackApp(config, {
  async answerQuestion(question) {
    return answerQuestion(question, config);
  }
});

await app.start();
