import test from "node:test";
import assert from "node:assert/strict";
import {
  answerQuestion,
  appendSources,
  buildWikiContext,
  extractSources,
  getOutputText,
  hasEnoughEvidence
} from "../src/answer.js";

test("hasEnoughEvidence rejects empty search results", () => {
  assert.equal(hasEnoughEvidence([]), false);
});

test("hasEnoughEvidence accepts at least one search result", () => {
  assert.equal(hasEnoughEvidence([{ file_id: "file_1" }]), true);
});

test("getOutputText reads the SDK output_text helper", () => {
  assert.equal(getOutputText({ output_text: "answer" }), "answer");
});

test("getOutputText falls back to response output content", () => {
  assert.equal(
    getOutputText({
      output: [
        {
          content: [
            {
              type: "output_text",
              text: "fallback answer"
            }
          ]
        }
      ]
    }),
    "fallback answer"
  );
});

test("answerQuestion refuses when search has no evidence", async () => {
  const answer = await answerQuestion(
    "unknown question",
    {
      activeVectorStoreId: "vs_test",
      openaiModel: "gpt-4.1-mini"
    },
    {
      openai: {
        vectorStores: {
          search: async () => ({ data: [] })
        },
        responses: {
          create: async () => {
            throw new Error("should not generate without evidence");
          }
        }
      }
    }
  );

  assert.equal(answer, "LLM Wiki에서 관련 내용을 찾지 못했습니다.");
});

test("answerQuestion generates when search has evidence", async () => {
  const answer = await answerQuestion(
    "known question",
    {
      activeVectorStoreId: "vs_test",
      openaiModel: "gpt-4.1-mini"
    },
    {
      openai: {
        vectorStores: {
          search: async () => ({
            data: [
              {
                file_id: "file_1",
                attributes: {
                  path: "docs/wiki.md",
                  url: "https://github.test/docs/wiki.md"
                },
                content: [{ text: "Known wiki context" }]
              }
            ]
          })
        },
        responses: {
          create: async ({ input }) => {
            assert.match(input[1].content, /Known wiki context/);
            return { output_text: "Wiki based answer" };
          }
        }
      }
    }
  );

  assert.equal(
    answer,
    "Wiki based answer\n\nSources:\ndocs/wiki.md: https://github.test/docs/wiki.md"
  );
});

test("buildWikiContext renders searchable wiki snippets", () => {
  assert.equal(
    buildWikiContext([
      {
        filename: "wiki.md",
        attributes: { path: "docs/wiki.md" },
        content: [{ text: "snippet" }]
      }
    ]),
    "[1] docs/wiki.md\nsnippet"
  );
});

test("extractSources deduplicates source paths", () => {
  assert.deepEqual(
    extractSources([
      { attributes: { path: "docs/wiki.md", url: "https://github.test/docs/wiki.md" } },
      { attributes: { path: "docs/wiki.md", url: "https://github.test/docs/wiki.md" } }
    ]),
    [{ path: "docs/wiki.md", url: "https://github.test/docs/wiki.md" }]
  );
});

test("appendSources adds deterministic source links", () => {
  assert.equal(
    appendSources("Answer", [{ path: "docs/wiki.md", url: "https://github.test/docs/wiki.md" }]),
    "Answer\n\nSources:\ndocs/wiki.md: https://github.test/docs/wiki.md"
  );
});
