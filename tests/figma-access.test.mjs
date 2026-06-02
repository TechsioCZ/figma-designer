import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  FigmaAccessError,
  createFigmaAccess,
  createFigmaAccessFromEnv
} from "../src/figma/figma-access.mjs";

test("fixture access reports health and reads fixture data", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "figma-access-"));
  const fixturePath = path.join(tempDir, "figma.json");

  await writeFile(
    fixturePath,
    JSON.stringify({
      fileKey: "abc123",
      fileName: "Customer File",
      generationPage: "Generation Workspace",
      libraryName: "New Engine Figma UI Library",
      canWrite: true,
      components: [{ key: "button-key", name: "Button" }],
      variables: { meta: { variables: { var1: { name: "color.bg" } } } },
      images: { "1:2": "https://example.com/frame.png" }
    })
  );

  try {
    const figma = createFigmaAccess({ mode: "fixture", fixturePath });

    assert.deepEqual(await figma.health(), {
      mode: "fixture",
      fileKey: "abc123",
      generationPage: "Generation Workspace",
      libraryName: "New Engine Figma UI Library",
      canRead: true,
      canWrite: true,
      canScreenshot: true
    });
    assert.deepEqual(await figma.getLocalComponents(), [{ key: "button-key", name: "Button" }]);
    assert.deepEqual(await figma.getVariables(), {
      meta: { variables: { var1: { name: "color.bg" } } }
    });
    assert.deepEqual(await figma.exportImages(["1:2", "missing"]), {
      images: {
        "1:2": "https://example.com/frame.png",
        missing: null
      },
      format: "png"
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("environment factory selects fixture mode when FIGMA_FIXTURE_PATH is present", () => {
  const figma = createFigmaAccessFromEnv({
    FIGMA_FIXTURE_PATH: "fixtures/figma.json",
    FIGMA_FILE_KEY: "from-env"
  });

  assert.equal(figma.mode, "fixture");
  assert.equal(figma.fixturePath, "fixtures/figma.json");
  assert.equal(figma.fileKey, "from-env");
});

test("environment factory defaults live capability confirmations to enabled", async () => {
  const figma = createFigmaAccessFromEnv(
    {
      FIGMA_ACCESS_TOKEN: "token",
      FIGMA_FILE_KEY: "file"
    },
    {
      fetch: async () => ({
        ok: true,
        json: async () => ({})
      })
    }
  );

  assert.deepEqual(await figma.health(), {
    mode: "live",
    fileKey: "file",
    generationPage: undefined,
    libraryName: undefined,
    connectedAsAssets: true,
    canRead: true,
    canWrite: true,
    canScreenshot: true
  });
});

test("environment factory allows explicit live capability opt outs", async () => {
  const figma = createFigmaAccessFromEnv(
    {
      FIGMA_ACCESS_TOKEN: "token",
      FIGMA_FILE_KEY: "file",
      FIGMA_LIBRARY_CONNECTED_ASSETS: "false",
      FIGMA_CAN_WRITE: "false",
      FIGMA_CAN_SCREENSHOT: "false"
    },
    {
      fetch: async () => ({
        ok: true,
        json: async () => ({})
      })
    }
  );

  assert.deepEqual(await figma.health(), {
    mode: "live",
    fileKey: "file",
    generationPage: undefined,
    libraryName: undefined,
    connectedAsAssets: false,
    canRead: true,
    canWrite: false,
    canScreenshot: false
  });
});

test("live access fails early when required configuration is missing", async () => {
  const figma = createFigmaAccess({ mode: "live" });

  await assert.rejects(() => figma.health(), {
    name: "FigmaAccessError",
    message: "Missing FIGMA_ACCESS_TOKEN for live Figma access."
  });
});

test("live access calls the Figma REST API with token headers", async () => {
  const requests = [];
  const figma = createFigmaAccess({
    mode: "live",
    accessToken: "token",
    fileKey: "file123",
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({ name: "Live File" })
      };
    }
  });

  assert.deepEqual(await figma.getFile(), { name: "Live File" });
  assert.equal(requests[0].url, "https://api.figma.com/v1/files/file123");
  assert.equal(requests[0].options.headers["X-Figma-Token"], "token");
});

test("unsupported modes are rejected", () => {
  assert.throws(() => createFigmaAccess({ mode: "unknown" }), FigmaAccessError);
});
