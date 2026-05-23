import OpenAI, { toFile } from "openai";
import { collectGithubDocuments } from "./github.js";
import { writeActiveVectorStoreId } from "./state.js";

export function createOpenAI(config) {
  return new OpenAI({ apiKey: config.openaiApiKey });
}

export async function reindex(config, options = {}) {
  const openai = options.openai || createOpenAI(config);
  const documents = await collectGithubDocuments(config, options.fetchImpl);

  if (documents.length === 0) {
    throw new Error("No indexable documents found in the GitHub repo.");
  }

  const vectorStore = await openai.vectorStores.create({
    name: `${config.githubOwner}/${config.githubRepo} LLM Wiki`,
    metadata: {
      owner: config.githubOwner,
      repo: config.githubRepo,
      branch: config.githubBranch
    }
  });

  const failures = [];

  for (const document of documents) {
    try {
      const file = await openai.files.create({
        file: await toFile(Buffer.from(renderDocument(document), "utf8"), safeFileName(document.path)),
        purpose: "assistants"
      });

      await openai.vectorStores.files.create(vectorStore.id, {
        file_id: file.id,
        attributes: {
          path: document.path,
          url: document.url,
          sha: document.sha
        }
      });
    } catch (error) {
      failures.push({ path: document.path, error: error.message });
    }
  }

  await waitForVectorStore(openai, vectorStore.id);
  await writeActiveVectorStoreId(config, vectorStore.id);

  return {
    vectorStoreId: vectorStore.id,
    indexedCount: documents.length - failures.length,
    failedCount: failures.length,
    failures
  };
}

export function renderDocument(document) {
  return [
    `Path: ${document.path}`,
    `URL: ${document.url}`,
    `SHA: ${document.sha}`,
    "",
    document.content
  ].join("\n");
}

function safeFileName(path) {
  return path.replace(/[^a-zA-Z0-9._]+/g, "_");
}

async function waitForVectorStore(openai, vectorStoreId) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const current = await openai.vectorStores.retrieve(vectorStoreId);

    if (current.status === "completed") {
      return current;
    }

    if (current.status === "expired") {
      throw new Error(`Vector store expired during indexing: ${vectorStoreId}`);
    }

    await delay(2000);
  }

  throw new Error(`Timed out waiting for vector store indexing: ${vectorStoreId}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
