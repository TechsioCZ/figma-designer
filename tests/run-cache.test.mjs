import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  RunCacheError,
  cleanupRunCache,
  createRunCache,
  openRunCache,
  readCacheManifest
} from "../src/cache/index.mjs";

function createContext(rootDir, runId = "run-cache-test") {
  return {
    runId,
    artifacts: {
      cache: {
        rootDir,
        lifetime: "single_run",
        disposable: true,
        paths: {
          discovery: path.join(rootDir, "discovery.json"),
          nestingMap: path.join(rootDir, "component-nesting-map.json"),
          figmaResponses: path.join(rootDir, "figma-responses")
        }
      }
    }
  };
}

test("creates a disposable single-run cache and records metadata safeguards", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "figma-run-cache-"));

  try {
    const cache = await createRunCache(createContext(tempDir), {
      now: "2026-06-02T10:00:00.000Z",
      metadata: {
        source: "test"
      }
    });

    assert.equal(cache.runId, "run-cache-test");
    assert.deepEqual(cache.metadata, { source: "test" });

    const manifest = await readCacheManifest(createContext(tempDir));
    assert.equal(manifest.kind, "figma-designer.run-cache");
    assert.equal(manifest.lifetime, "single_run");
    assert.equal(manifest.disposable, true);
    assert.equal(manifest.sourceOfTruth, false);
    assert.match(manifest.notice, /not design-system truth/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("writes, lists, opens, and reads named artifacts with artifact metadata", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "figma-run-cache-"));
  const context = createContext(tempDir, "run-cache-lookup");

  try {
    const cache = await createRunCache(context);
    const entry = await cache.writeArtifact(
      "discovery/components",
      {
        components: [
          {
            nodeId: "1:2",
            name: "Button"
          }
        ]
      },
      {
        metadata: {
          source: "fixture",
          count: 1
        }
      }
    );

    assert.equal(entry.name, "discovery/components");
    assert.equal(entry.contentType, "application/json");
    assert.equal(entry.disposable, true);
    assert.equal(entry.sourceOfTruth, false);
    assert.deepEqual(cache.listArtifacts().map((artifact) => artifact.name), ["discovery/components"]);

    const reopened = await openRunCache(context);
    const artifact = await reopened.readArtifact("discovery/components");

    assert.deepEqual(artifact.metadata, {
      source: "fixture",
      count: 1
    });
    assert.deepEqual(artifact.payload.components, [
      {
        nodeId: "1:2",
        name: "Button"
      }
    ]);

    const artifactFile = JSON.parse(await readFile(path.join(tempDir, artifact.path), "utf8"));
    assert.equal(artifactFile.runId, "run-cache-lookup");
    assert.equal(artifactFile.lifetime, "single_run");
    assert.equal(artifactFile.disposable, true);
    assert.equal(artifactFile.sourceOfTruth, false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("cleans up only a matching disposable run cache", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "figma-run-cache-"));
  const context = createContext(tempDir, "run-cache-cleanup");

  await createRunCache(context);

  const result = await cleanupRunCache(context);
  assert.deepEqual(result, {
    runId: "run-cache-cleanup",
    rootDir: tempDir,
    removed: true
  });

  const secondResult = await cleanupRunCache(context);
  assert.deepEqual(secondResult, {
    runId: "run-cache-cleanup",
    rootDir: tempDir,
    removed: false
  });
});

test("rejects stale cache manifests from a different run", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "figma-run-cache-"));

  try {
    await createRunCache(createContext(tempDir, "fresh-run"));

    await assert.rejects(() => openRunCache(createContext(tempDir, "stale-run")), {
      name: "RunCacheError",
      message: "Stale run cache rejected: runId does not match the active run."
    });

    await assert.rejects(() => createRunCache(createContext(tempDir, "stale-run")), {
      name: "RunCacheError",
      message: "Stale run cache rejected: runId does not match the active run."
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("rejects cache contexts that are not disposable single-run artifacts", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "figma-run-cache-"));
  const context = createContext(tempDir, "run-cache-safeguard");
  context.artifacts.cache.lifetime = "persistent";
  context.artifacts.cache.disposable = false;

  try {
    await assert.rejects(() => createRunCache(context), RunCacheError);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
