import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { commands, parseArgs, parseEnvFile, runCommand } from "../scripts/figma-designer.mjs";

test("help lists the stable command surface", async () => {
  const result = await runCommand(["--help"]);

  assert.equal(result.exitCode, 0);

  for (const command of [
    "bootstrap",
    "discover",
    "nesting",
    "validate",
    "report",
    "iterate",
    "validate-schemas"
  ]) {
    assert.match(result.stdout, new RegExp(`\\b${command}\\b`));
    assert.ok(commands.has(command));
  }
});

test("unknown commands fail predictably", async () => {
  const result = await runCommand(["missing-command"]);

  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /Unknown command: missing-command/);
  assert.match(result.stdout, /Usage:/);
});

test("argument parser accepts dashed options and equals options", () => {
  const options = parseArgs([
    "--run-context",
    "fixtures/run-context.json",
    "--fixture=fixtures/discovery.json",
    "--text"
  ]);

  assert.deepEqual(options, {
    format: "text",
    _: [],
    fixture: "fixtures/discovery.json",
    run_context: "fixtures/run-context.json"
  });
});

test("env parser accepts comments, export prefixes, quotes, and inline comments", () => {
  assert.deepEqual(
    parseEnvFile(`
      # Figma live values
      FIGMA_ACCESS_TOKEN="token"
      export FIGMA_FILE_KEY=Ta1RAMuisqWuBjOSc0nZfZ
      FIGMA_GENERATION_PAGE="Generation Workspace"
      FIGMA_BOOTSTRAP_NODE_ID='2:2'
    `),
    {
      FIGMA_ACCESS_TOKEN: "token",
      FIGMA_FILE_KEY: "Ta1RAMuisqWuBjOSc0nZfZ",
      FIGMA_GENERATION_PAGE: "Generation Workspace",
      FIGMA_BOOTSTRAP_NODE_ID: "2:2"
    }
  );
});

test("discover command dispatch reads fixture JSON deterministically", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "figma-harness-"));
  const fixturePath = path.join(tempDir, "discovery.json");

  await writeFile(
    fixturePath,
    JSON.stringify({
      components: [{ nodeId: "1:2", name: "Button" }],
      variables: [{ id: "VariableID:1", name: "color.bg" }]
    })
  );

  try {
    const result = await runCommand(["discover", "--fixture", fixturePath]);
    const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(payload.command, "discover");
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, "fixture");
  assert.equal(payload.details.discovery.kind, "figma-library-discovery");
  assert.equal(payload.details.discovery.source, "fixture");
  assert.deepEqual(
    payload.details.discovery.components.map(({ nodeId, name }) => ({ nodeId, name })),
    [{ nodeId: "1:2", name: "Button" }]
  );
  assert.deepEqual(payload.details.source.keys, ["components", "variables"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("validate-schemas parses schema files and checks local refs", async () => {
  const result = await runCommand(["validate-schemas"]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(payload.command, "validate-schemas");
  assert.equal(payload.details.status, "passed");
  assert.ok(payload.details.schemas.includes("schemas/run-context.schema.json"));
  assert.ok(payload.details.schemas.includes("schemas/design-run-report.schema.json"));
  assert.ok(payload.details.counts.schemas >= 2);
  assert.ok(payload.details.counts.checkedGeneratedPayloads >= 1);
});

test("validate command reflects failed report validation state", async () => {
  const result = await runCommand([
    "validate",
    "--report",
    "fixtures/reports/design-run-report.valid.json"
  ]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(payload.details.status, "failed");
  assert.equal(payload.details.issues.length, 1);
});

test("report command default payload follows the report contract", async () => {
  const result = await runCommand(["report", "--run-id", "contract-stub"]);
  const payload = JSON.parse(result.stdout);
  const report = payload.details.report;

  assert.equal(result.exitCode, 0);
  assert.equal(report.schemaVersion, "1.0.0");
  assert.equal(report.runId, "contract-stub");
  assert.ok(report.figmaFile.fileKey);
  assert.deepEqual(report.validation, {
    status: "not_run",
    summary: {
      critical: 0,
      error: 0,
      warning: 0,
      info: 0
    },
    issues: []
  });
  assert.deepEqual(report.designSystemGaps, []);
});

test("nesting command builds an ephemeral map from discovery fixture data", async () => {
  const result = await runCommand([
    "nesting",
    "--fixture",
    "fixtures/discovery/live-library.fixture.json",
    "--run-id",
    "command-nesting"
  ]);
  const payload = JSON.parse(result.stdout);
  const nestingMap = payload.details.nestingMap;

  assert.equal(result.exitCode, 0);
  assert.equal(nestingMap.kind, "figma-component-nesting-map");
  assert.equal(nestingMap.runId, "command-nesting");
  assert.equal(nestingMap.sourceOfTruth, false);
  assert.ok(nestingMap.summary.slotRelationshipCount > 0);
  assert.ok(
    nestingMap.safeInstanceConfigurationPaths.some(
      (configurationPath) => configurationPath.kind === "slot_instance_swap"
    )
  );
});

test("nesting command accepts discovery command output files", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "figma-nesting-command-output-"));
  const discoveryPath = path.join(tempDir, "discovery-command-output.json");

  try {
    const discoverResult = await runCommand([
      "discover",
      "--fixture",
      "fixtures/discovery/live-library.fixture.json"
    ]);
    await writeFile(discoveryPath, discoverResult.stdout);

    const nestingResult = await runCommand([
      "nesting",
      "--discovery",
      discoveryPath,
      "--run-id",
      "command-output-nesting"
    ]);
    const payload = JSON.parse(nestingResult.stdout);

    assert.equal(nestingResult.exitCode, 0);
    assert.equal(payload.details.nestingMap.kind, "figma-component-nesting-map");
    assert.ok(payload.details.nestingMap.summary.componentCount > 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("bootstrap failure fixture returns a failing command result", async () => {
  const result = await runCommand([
    "bootstrap",
    "--fixture",
    "fixtures/bootstrap/failures.json"
  ]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 1);
  assert.equal(payload.ok, false);
  assert.equal(payload.details.ok, false);
  assert.ok(payload.details.summary.failed > 0);
});

test("bootstrap command reads screenshot node ids from env file", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "figma-bootstrap-env-node-"));
  const fixturePath = path.join(tempDir, "bootstrap.json");
  const envPath = path.join(tempDir, ".env");

  await writeFile(
    fixturePath,
    JSON.stringify({
      fileKey: "bootstrap-env-file",
      file: {
        key: "bootstrap-env-file",
        name: "Bootstrap Env Fixture",
        document: { type: "DOCUMENT", children: [] },
        libraries: [
          {
            libraryId: "new-engine-ui",
            name: "New Engine Figma UI Library",
            connectedAsAssets: true,
            status: "connected",
            source: "fixture"
          }
        ]
      },
      canWrite: true,
      canScreenshot: true,
      components: [{ key: "button-primary-key", name: "Button / Primary" }],
      componentSets: [],
      variables: {
        meta: {
          variables: { "VariableID:button-bg": { name: "component/button/background/primary" } },
          variableCollections: {}
        }
      },
      images: { "2:2": "https://example.com/bootstrap-probe.png" }
    })
  );
  await writeFile(envPath, "FIGMA_BOOTSTRAP_NODE_ID=2:2\n");

  try {
    const result = await runCommand([
      "bootstrap",
      "--fixture",
      fixturePath,
      "--env-file",
      envPath
    ]);
    const payload = JSON.parse(result.stdout);
    const checks = Object.fromEntries(payload.details.checks.map((check) => [check.name, check]));

    assert.equal(result.exitCode, 0);
    assert.deepEqual(checks.screenshots.details.exportedNodeIds, ["2:2"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("command output creates parent directories automatically", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "figma-command-output-dir-"));
  const outputPath = path.join(tempDir, "nested", "bootstrap.json");

  try {
    const result = await runCommand([
      "bootstrap",
      "--fixture",
      "fixtures/bootstrap/success.json",
      "--output",
      outputPath
    ]);
    const output = JSON.parse(await readFile(outputPath, "utf8"));

    assert.equal(result.exitCode, 0);
    assert.equal(output.command, "bootstrap");
    assert.equal(output.ok, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("discover command writes a disposable run cache artifact when run id is provided", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "figma-discovery-cache-"));

  try {
    const result = await runCommand([
      "discover",
      "--fixture",
      "fixtures/discovery/live-library.fixture.json",
      "--run-id",
      "cache-command",
      "--cache-root",
      tempDir
    ]);
    const payload = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 0);
    assert.equal(payload.details.cacheArtifact.name, "discovery");
    assert.equal(payload.details.cacheArtifact.sourceOfTruth, false);

    const artifact = JSON.parse(
      await readFile(path.join(tempDir, payload.details.cacheArtifact.path), "utf8")
    );
    assert.equal(artifact.runId, "cache-command");
    assert.equal(artifact.sourceOfTruth, false);
    assert.equal(artifact.payload.kind, "figma-library-discovery");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
