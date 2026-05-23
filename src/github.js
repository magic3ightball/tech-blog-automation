const DOCUMENT_EXTENSIONS = new Set([".md", ".mdx", ".txt"]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export async function collectGithubDocuments(config, fetchImpl = fetch) {
  const rootItems = await getContents(config, "", fetchImpl);
  const documents = [];

  await walkContents(config, rootItems, documents, fetchImpl);

  return documents;
}

export function isDocumentPath(path) {
  const lowerPath = path.toLowerCase();
  return [...DOCUMENT_EXTENSIONS].some((extension) => lowerPath.endsWith(extension));
}

export async function upsertGithubFile(config, path, content, fetchImpl = fetch) {
  const existingFile = await findGithubFile(config, path, fetchImpl);
  const response = await fetchImpl(buildContentsUrl(config, path), {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.githubToken}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({
      message: `Archive Slack messages to ${path}`,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch: config.githubBranch,
      ...(existingFile?.sha ? { sha: existingFile.sha } : {})
    })
  });

  if (!response.ok) {
    throw new Error(`GitHub file upsert failed for ${path}: ${response.status}`);
  }

  return response.json();
}

async function walkContents(config, items, documents, fetchImpl) {
  const entries = Array.isArray(items) ? items : [items];

  for (const item of entries) {
    if (item.type === "dir") {
      const childItems = await getContents(config, item.path, fetchImpl);
      await walkContents(config, childItems, documents, fetchImpl);
      continue;
    }

    if (item.type !== "file" || !isDocumentPath(item.path) || item.size > MAX_FILE_BYTES) {
      continue;
    }

    const file = item.content ? item : await getContents(config, item.path, fetchImpl);
    const content = decodeContent(file.content, file.encoding);

    if (!content.trim()) {
      continue;
    }

    documents.push({
      path: item.path,
      sha: item.sha,
      url: item.html_url,
      content
    });
  }
}

async function getContents(config, path, fetchImpl) {
  const url = buildContentsUrl(config, path);
  url.searchParams.set("ref", config.githubBranch);

  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub contents request failed for ${path || "."}: ${response.status}`);
  }

  return response.json();
}

async function findGithubFile(config, path, fetchImpl) {
  const url = buildContentsUrl(config, path);
  url.searchParams.set("ref", config.githubBranch);

  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`GitHub contents request failed for ${path}: ${response.status}`);
  }

  return response.json();
}

function buildContentsUrl(config, path) {
  return new URL(
    `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/contents/${path}`
  );
}

function decodeContent(content, encoding) {
  if (encoding !== "base64") {
    return content || "";
  }

  return Buffer.from(content.replace(/\n/g, ""), "base64").toString("utf8");
}
