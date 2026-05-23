import test from "node:test";
import assert from "node:assert/strict";
import { cleanMentionText, getThreadTs } from "../src/slack.js";

test("cleanMentionText removes the current bot mention", () => {
  assert.equal(cleanMentionText("<@B123> how do we deploy?", "B123"), "how do we deploy?");
});

test("cleanMentionText normalizes whitespace", () => {
  assert.equal(cleanMentionText("<@B123>\n\n   질문   입니다", "B123"), "질문 입니다");
});

test("getThreadTs uses an existing thread timestamp first", () => {
  assert.equal(getThreadTs({ ts: "1.1", thread_ts: "2.2" }), "2.2");
});

test("getThreadTs falls back to event timestamp", () => {
  assert.equal(getThreadTs({ ts: "1.1" }), "1.1");
});
