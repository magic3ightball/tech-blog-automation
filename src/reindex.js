import "dotenv/config";
import { getConfig, requireKeys } from "./config.js";
import { reindex } from "./indexer.js";

const config = getConfig();
requireKeys(config, [
  "openaiApiKey",
  "githubToken",
  "githubOwner",
  "githubRepo",
  "githubBranch"
]);

const result = await reindex(config);

console.log(JSON.stringify(result, null, 2));
