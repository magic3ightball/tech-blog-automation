import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readActiveVectorStoreId, writeActiveVectorStoreId } from "../src/state.js";

test("readActiveVectorStoreId prefers environment config", async () => {
  assert.equal(await readActiveVectorStoreId({ activeVectorStoreId: "vs_env" }), "vs_env");
});

test("active vector store state can be written and read", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wiki-state-"));
  const stateFile = join(dir, "state.json");

  try {
    await writeActiveVectorStoreId({ stateFile }, "vs_file");
    assert.equal(await readActiveVectorStoreId({ stateFile }), "vs_file");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
