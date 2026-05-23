import { createOpenAI } from "./indexer.js";
import { readActiveVectorStoreId } from "./state.js";

const REFUSAL = "LLM Wiki에서 관련 내용을 찾지 못했습니다.";

export async function answerQuestion(question, config, options = {}) {
  const openai = options.openai || createOpenAI(config);
  const vectorStoreId = await readActiveVectorStoreId(config);

  if (!vectorStoreId) {
    return "LLM Wiki 인덱스가 아직 준비되지 않았습니다. 먼저 reindex를 실행해 주세요.";
  }

  const searchResults = await searchWiki(openai, vectorStoreId, question, config);

  if (!hasEnoughEvidence(searchResults)) {
    return REFUSAL;
  }

  const response = await openai.responses.create({
    model: config.openaiModel,
    input: [
      {
        role: "system",
        content: [
          "You answer only from the provided GitHub repo LLM Wiki context.",
          "If the wiki does not contain enough evidence, answer exactly: LLM Wiki에서 관련 내용을 찾지 못했습니다.",
          "Do not use outside knowledge.",
          "Do not include sources. Sources are added by the application.",
          "Answer in the same language as the user question."
        ].join("\n")
      },
      {
        role: "user",
        content: [
          `Question: ${question}`,
          "",
          "LLM Wiki context:",
          buildWikiContext(searchResults)
        ].join("\n")
      }
    ]
  });

  const text = getOutputText(response);

  if (!text || text.includes("찾지 못했습니다")) {
    return REFUSAL;
  }

  return appendSources(text.trim(), extractSources(searchResults));
}

export async function searchWiki(openai, vectorStoreId, query, config = {}) {
  if (openai.vectorStores.search) {
    const result = await openai.vectorStores.search(vectorStoreId, {
      query,
      max_num_results: 5,
      ranking_options: {
        score_threshold: config.wikiSearchScoreThreshold ?? 0.35
      }
    });

    return result.data || [];
  }

  return [];
}

export function hasEnoughEvidence(results) {
  return Array.isArray(results) && results.length > 0;
}

export function buildWikiContext(results) {
  return results
    .map((result, index) => {
      const source = result.attributes?.path || result.filename || `source-${index + 1}`;
      const text = extractResultText(result);

      return [`[${index + 1}] ${source}`, text].join("\n");
    })
    .join("\n\n");
}

export function extractSources(results) {
  const seen = new Set();
  const sources = [];

  for (const result of results) {
    const path = result.attributes?.path || result.filename;
    const url = result.attributes?.url;

    if (!path || seen.has(path)) {
      continue;
    }

    seen.add(path);
    sources.push({ path, url });
  }

  return sources;
}

export function appendSources(answer, sources) {
  if (!sources.length) {
    return answer;
  }

  const sourceLines = sources.map((source) =>
    source.url ? `${source.path}: ${source.url}` : source.path
  );

  return [answer, "", "Sources:", ...sourceLines].join("\n");
}

function extractResultText(result) {
  if (Array.isArray(result.content)) {
    return result.content.map((content) => content.text || "").join("\n").trim();
  }

  return result.text || "";
}

export function getOutputText(response) {
  if (response.output_text) {
    return response.output_text;
  }

  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text)
    .join("\n")
    .trim();
}
