import test from "node:test";
import assert from "node:assert/strict";
import { fetchSlackChannelMessages } from "../src/slackArchive.js";

const config = {
  slackBotToken: "xoxb-token",
  slackArchiveChannelId: "C123"
};

const range = {
  oldest: "1779375600",
  latest: "1779461999.999"
};

test("fetchSlackChannelMessages fetches pages and returns chronological user messages", async () => {
  const requestedUrls = [];
  const responses = [
    {
      ok: true,
      messages: [
        { type: "message", ts: "2.000000", user: "U2", text: "second" },
        { type: "message", subtype: "bot_message", ts: "1.500000", text: "bot" }
      ],
      response_metadata: { next_cursor: "next" }
    },
    {
      ok: true,
      messages: [{ type: "message", ts: "1.000000", user: "U1", text: "first" }],
      response_metadata: {}
    }
  ];

  const fetchImpl = async (url) => {
    requestedUrls.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => responses.shift()
    };
  };

  const messages = await fetchSlackChannelMessages(config, range, fetchImpl);

  assert.deepEqual(
    messages.map((message) => message.text),
    ["first", "second"]
  );
  assert.equal(requestedUrls[0].searchParams.get("channel"), "C123");
  assert.equal(requestedUrls[0].searchParams.get("oldest"), "1779375600");
  assert.equal(requestedUrls[0].searchParams.get("latest"), "1779461999.999");
  assert.equal(requestedUrls[0].searchParams.get("inclusive"), "true");
  assert.equal(requestedUrls[0].searchParams.get("limit"), "200");
  assert.equal(requestedUrls[1].searchParams.get("cursor"), "next");
});

test("fetchSlackChannelMessages retries after a rate limit response", async () => {
  const waits = [];
  const fetchImpl = async () => {
    if (waits.length === 0) {
      return {
        ok: false,
        status: 429,
        headers: new Map([["retry-after", "2"]])
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        messages: [{ type: "message", ts: "1.000000", user: "U1", text: "hello" }]
      })
    };
  };

  const messages = await fetchSlackChannelMessages(config, range, fetchImpl, async (ms) => {
    waits.push(ms);
  });

  assert.equal(waits[0], 2000);
  assert.equal(messages[0].text, "hello");
});

test("fetchSlackChannelMessages throws Slack API errors", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: false, error: "not_in_channel" })
  });

  await assert.rejects(
    () => fetchSlackChannelMessages(config, range, fetchImpl),
    /not_in_channel/
  );
});
