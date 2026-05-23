import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function readActiveVectorStoreId(config) {
  if (config.activeVectorStoreId) {
    return config.activeVectorStoreId;
  }

  try {
    const state = JSON.parse(await readFile(config.stateFile, "utf8"));
    return state.activeVectorStoreId || "";
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

export async function writeActiveVectorStoreId(config, activeVectorStoreId) {
  await mkdir(dirname(config.stateFile), { recursive: true });
  await writeFile(
    config.stateFile,
    JSON.stringify({ activeVectorStoreId, updatedAt: new Date().toISOString() }, null, 2)
  );
}
