import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  bootstrapCheckNames,
  createBootstrapFigmaAccess,
  runBootstrapCheck
} from "../src/figma/bootstrap-check.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("bootstrap check passes with connected fixture assets and writable report output", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "figma-bootstrap-success-"));

  try {
    const result = await runBootstrapCheck({
      fixturePath: path.join(repoRoot, "fixtures/bootstrap/success.json"),
      reportOutputPath: path.join(tempDir, "design-run-report.json")
    });
    const checks = Object.fromEntries(result.checks.map((check) => [check.name, check]));

    assert.equal(result.ok, true);
    assert.deepEqual(result.checks.map((check) => check.name), bootstrapCheckNames);
    assert.equal(result.summary.passed, 6);
    assert.equal(result.summary.failed, 0);
    assert.equal(result.mode, "fixture");

    assert.equal(checks.figmaAccess.details.fileName, "Bootstrap Success Fixture");
    assert.equal(checks.workspaceWrite.details.pageFound, true);
    assert.equal(checks.libraryAssets.details.componentCount, 1);
    assert.equal(checks.libraryAssets.details.componentSetCount, 1);
    assert.equal(checks.variables.details.variables, 1);
    assert.deepEqual(checks.screenshots.details.exportedNodeIds, ["10:1"]);
    assert.equal(checks.reportOutput.details.probeRemoved, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("bootstrap check reports missing fixture capabilities with actionable messages", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "figma-bootstrap-failures-"));

  try {
    const result = await runBootstrapCheck({
      fixturePath: path.join(repoRoot, "fixtures/bootstrap/failures.json"),
      reportOutputPath: path.join(tempDir, "design-run-report.json")
    });
    const checks = Object.fromEntries(result.checks.map((check) => [check.name, check]));

    assert.equal(result.ok, false);
    assert.equal(checks.figmaAccess.status, "passed");

    assert.equal(checks.workspaceWrite.status, "failed");
    assert.match(checks.workspaceWrite.message, /write access is unavailable/);

    assert.equal(checks.libraryAssets.status, "failed");
    assert.match(checks.libraryAssets.message, /not connected as Figma Assets/);

    assert.equal(checks.variables.status, "failed");
    assert.match(checks.variables.message, /variable discovery returned no variables/);

    assert.equal(checks.screenshots.status, "failed");
    assert.match(checks.screenshots.message, /Screenshot export is unavailable/);

    assert.equal(checks.reportOutput.status, "failed");
    assert.match(checks.reportOutput.message, /Report output is unavailable in the fixture/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("bootstrap check reports access failures before dependent checks", async () => {
  const result = await runBootstrapCheck({
    fixturePath: path.join(repoRoot, "fixtures/bootstrap/missing.json")
  });
  const checks = Object.fromEntries(result.checks.map((check) => [check.name, check]));

  assert.equal(result.ok, false);
  assert.equal(checks.figmaAccess.status, "failed");
  assert.match(checks.figmaAccess.message, /Figma access is unavailable/);
  assert.match(checks.figmaAccess.message, /Could not read JSON fixture/);
  assert.equal(checks.workspaceWrite.message, "Figma access failed first, so this bootstrap check could not run.");
  assert.equal(checks.reportOutput.message, "Figma access failed first, so this bootstrap check could not run.");
});

test("bootstrap access factory can select fixture mode from environment", () => {
  const figmaAccess = createBootstrapFigmaAccess({
    env: {
      FIGMA_FIXTURE_PATH: "fixtures/bootstrap/success.json",
      FIGMA_FILE_KEY: "env-file"
    }
  });

  assert.equal(figmaAccess.mode, "fixture");
  assert.equal(figmaAccess.fixturePath, "fixtures/bootstrap/success.json");
  assert.equal(figmaAccess.fileKey, "env-file");
});
