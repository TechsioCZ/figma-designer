import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  formatEnvValue,
  parseArgs,
  updateFigmaEnvFile,
  upsertEnvValues
} from "../scripts/update-figma-env.mjs";

test("formats env values without quotes when shell-safe", () => {
  assert.equal(formatEnvValue("abc123_./:@-"), "abc123_./:@-");
  assert.equal(formatEnvValue("Generation Workspace"), '"Generation Workspace"');
});

test("upserts existing values and appends missing values", () => {
  const next = upsertEnvValues(
    [
      "# existing",
      "FIGMA_ACCESS_TOKEN=secret",
      "export FIGMA_FILE_KEY=old-key",
      "FIGMA_GENERATION_PAGE=Old"
    ].join("\n"),
    {
      FIGMA_FILE_KEY: "new-key",
      FIGMA_GENERATION_PAGE: "Generation Workspace",
      FIGMA_BOOTSTRAP_NODE_ID: "2:2"
    }
  );

  assert.match(next, /FIGMA_ACCESS_TOKEN=secret/);
  assert.match(next, /FIGMA_FILE_KEY=new-key/);
  assert.match(next, /FIGMA_GENERATION_PAGE="Generation Workspace"/);
  assert.match(next, /FIGMA_BOOTSTRAP_NODE_ID=2:2/);
  assert.doesNotMatch(next, /old-key/);
});

test("updates env file on disk", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "figma-env-"));
  const envPath = path.join(tempDir, ".env");

  try {
    await writeFile(envPath, "FIGMA_ACCESS_TOKEN=secret\n", "utf8");
    updateFigmaEnvFile(envPath, {
      FIGMA_FILE_KEY: "file-123",
      FIGMA_FILE_URL: "https://www.figma.com/design/file-123/Starter"
    });

    const content = await readFile(envPath, "utf8");
    assert.match(content, /FIGMA_ACCESS_TOKEN=secret/);
    assert.match(content, /FIGMA_FILE_KEY=file-123/);
    assert.match(content, /FIGMA_FILE_URL=https:\/\/www\.figma\.com\/design\/file-123\/Starter/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("parses dashed CLI options", () => {
  assert.deepEqual(parseArgs(["--file-key", "abc", "--bootstrap-node-id=1:2"]), {
    file_key: "abc",
    bootstrap_node_id: "1:2"
  });

  assert.deepEqual(parseArgs(["--help"]), {
    help: true
  });
});
