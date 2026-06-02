#!/usr/bin/env node

import { access, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRunCache } from "../src/cache/index.mjs";
import { runBootstrapCheck } from "../src/figma/bootstrap-check.mjs";
import { buildComponentNestingMap } from "../src/figma/component-nesting-map.mjs";
import { createFigmaAccess } from "../src/figma/figma-access.mjs";
import { discoverLibrary } from "../src/figma/library-discovery.mjs";
import { planDesignIteration } from "../src/iteration/design-iteration.mjs";
import { buildDesignRunReport } from "../src/reporting/design-run-report.mjs";
import { createDesignSystemGapLog } from "../src/reporting/gap-log.mjs";
import { createScreenshotReport } from "../src/reporting/screenshot-report.mjs";
import { validateDesign } from "../src/validation/index.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const commands = new Map([
  [
    "bootstrap",
    {
      description:
        "Verify Figma access, workspace write access, library assets, variables, screenshots, and report output.",
      handler: runBootstrap
    }
  ],
  [
    "discover",
    {
      description:
        "Discover connected Figma UI Library components, variables, modes, styles, slots, and examples.",
      handler: runDiscover
    }
  ],
  [
    "nesting",
    {
      description: "Build an ephemeral component nesting map from discovery output.",
      handler: runNesting
    }
  ],
  [
    "validate",
    {
      description:
        "Validate generated Figma output against strict composition and design-system rules.",
      handler: runValidate
    }
  ],
  [
    "report",
    {
      description: "Create screenshots and a Design Run Report for a design run.",
      handler: runReport
    }
  ],
  [
    "iterate",
    {
      description: "Improve generated Figma output from validation and report evidence.",
      handler: runIterate
    }
  ],
  [
    "validate-schemas",
    {
      description: "Validate local schema files and fixture examples.",
      handler: runValidateSchemas
    }
  ]
]);

export async function main(argv = process.argv.slice(2), io = defaultIo()) {
  const result = await runCommand(argv, io);

  if (result.stdout) {
    io.stdout(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  }

  if (result.stderr) {
    io.stderr(result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`);
  }

  return result.exitCode;
}

export async function runCommand(argv = [], io = defaultIo()) {
  const commandName = argv[0] ?? "help";

  if (commandName === "help" || commandName === "--help" || commandName === "-h") {
    return { exitCode: 0, stdout: printHelp(), stderr: "" };
  }

  const command = commands.get(commandName);

  if (!command) {
    return {
      exitCode: 2,
      stdout: printHelp(),
      stderr: `Unknown command: ${commandName}\n`
    };
  }

  let options;
  try {
    options = parseArgs(argv.slice(1));
  } catch (error) {
    return { exitCode: 2, stdout: "", stderr: `${error.message}\n` };
  }

  if (options.help) {
    return { exitCode: 0, stdout: printCommandHelp(commandName, command), stderr: "" };
  }

  try {
    const payload = await command.handler({ commandName, options, io });
    const output = formatPayload(payload, options);

    if (options.output) {
      await writeFile(resolveRepoPath(options.output), output);
    }

    return { exitCode: payload.ok === false ? 1 : 0, stdout: output, stderr: "" };
  } catch (error) {
    const payload = {
      command: commandName,
      ok: false,
      error: error.message
    };

    return { exitCode: 1, stdout: `${JSON.stringify(payload, null, 2)}\n`, stderr: "" };
  }
}

export function parseArgs(args) {
  const options = {
    format: "json",
    _: []
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      options._.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey.replaceAll("-", "_");

    if (key === "json") {
      options.format = "json";
      continue;
    }

    if (key === "text") {
      options.format = "text";
      continue;
    }

    const value = inlineValue ?? args[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${rawKey}`);
    }

    options[key] = value;

    if (inlineValue === undefined) {
      index += 1;
    }
  }

  return options;
}

function defaultIo() {
  return {
    cwd: repoRoot,
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value)
  };
}

async function runBootstrap({ commandName, options }) {
  const context = await readOptionalJson(options.run_context);
  const fixture = await readOptionalJson(options.fixture);
  const result = await runBootstrapCheck({
    env: process.env,
    fixture: fixture?.data,
    fixturePath: options.fixture,
    runContext: context?.data,
    mode: fixture ? "fixture" : undefined,
    reportOutputPath: options.report_output,
    screenshotNodeIds: options.screenshot_node_ids?.split(",").filter(Boolean)
  });

  return commandPayload(commandName, options, {
    ...result,
    runContext: summarizeJsonSource(context),
    source: summarizeJsonSource(fixture)
  });
}

async function runDiscover({ commandName, options }) {
  const fixture = await readOptionalJson(options.fixture);
  const figmaAccess = fixture
    ? createFigmaAccess({ mode: "fixture", fixture: fixture.data })
    : undefined;
  const discovery = await discoverLibrary({
    figmaAccess,
    runId: options.run_id,
    cachePath: options.cache_path,
    nestingMapPath: options.nesting_map_path,
    libraryName: options.library_name
  });
  const cacheArtifact = await maybeWriteCacheArtifact(options, "discovery", discovery, {
    source: discovery.source,
    kind: discovery.kind
  });

  return commandPayload(commandName, options, {
    discovery,
    source: summarizeJsonSource(fixture),
    cachePolicy: "ephemeral-per-run",
    cacheArtifact
  });
}

async function runNesting({ commandName, options }) {
  const discoveryInput = await readOptionalJson(options.discovery);
  const fixture = await readOptionalJson(options.fixture);
  const discovery = discoveryInput?.data ?? await discoverForCommandFixture(fixture, options);
  const nestingMap = buildComponentNestingMap(discovery, {
    runId: options.run_id,
    now: options.generated_at
  });
  const cacheArtifact = await maybeWriteCacheArtifact(options, "component-nesting-map", nestingMap, {
    source: nestingMap.source,
    kind: nestingMap.kind
  });

  return commandPayload(commandName, options, {
    nestingMap,
    source: summarizeJsonSource(discoveryInput ?? fixture),
    cachePolicy: "ephemeral-per-run",
    cacheArtifact
  });
}

async function runValidate({ commandName, options }) {
  const fixture = await readOptionalJson(options.fixture);
  const report = await readOptionalJson(options.report);
  const context = validationContextFromInput(fixture?.data ?? report?.data ?? {});
  const validatorResult = await validateDesign(context, {
    runId: options.run_id,
    ruleGroups: splitCsv(options.rule_groups),
    runRuleLoader: Boolean(options.rule_groups)
  });

  return commandPayload(commandName, options, {
    status: validatorResult.validation.status,
    validation: validatorResult.validation,
    issues: validatorResult.validation.issues,
    familyResults: validatorResult.familyResults,
    source: summarizeJsonSource(fixture ?? report)
  });
}

function validationContextFromInput(input) {
  if (input.validation || input.report || input.design || input.discovery) {
    return input;
  }

  return {
    validation: {
      status: input.status,
      issues: input.issues ?? []
    }
  };
}

async function discoverForCommandFixture(fixture, options) {
  if (!fixture) {
    throw new Error("nesting requires --discovery <path> or --fixture <path>");
  }

  return discoverLibrary({
    figmaAccess: createFigmaAccess({ mode: "fixture", fixture: fixture.data }),
    runId: options.run_id,
    cachePath: options.cache_path,
    nestingMapPath: options.nesting_map_path,
    libraryName: options.library_name
  });
}

async function runReport({ commandName, options }) {
  const fixture = await readOptionalJson(options.fixture);
  const generated = await readOptionalJson(options.generated ?? options.plan);
  const validation = await readOptionalJson(options.validation);
  const screenshots = await readOptionalJson(options.screenshots);
  const gaps = await readOptionalJson(options.gaps);
  const hasReportInputs = Boolean(generated || validation || screenshots || gaps);
  const fixtureIsReport = fixture?.data?.schemaVersion === "1.0.0" && fixture?.data?.summary && fixture?.data?.validation;
  let report;
  let screenshotReport = null;
  let gapLog = null;

  if (fixtureIsReport && !hasReportInputs) {
    report = fixture.data;
  } else if (hasReportInputs || fixture) {
    const generatedOutput = generated?.data ?? fixture?.data?.generatedOutput ?? fixture?.data?.plan ?? fixture?.data;
    const figmaFile = reportFigmaFile(options, generatedOutput, fixture?.data);
    screenshotReport = await maybeCreateScreenshotReport({
      runId: options.run_id,
      figmaFile,
      generatedOutput,
      screenshots: screenshots?.data,
      validation: validation?.data
    }, options);
    report = buildDesignRunReport(
      {
        runId: options.run_id,
        generatedOutput,
        figmaFile,
        validationResult: validation?.data ?? screenshotReport?.report?.validation,
        screenshots: screenshotReport?.report?.screenshots ?? arrayify(screenshots?.data),
        designSystemGaps: arrayify(gaps?.data),
        runContextPath: options.run_context
      },
      {
        now: options.generated_at,
        runId: options.run_id,
        fileKey: options.file_key,
        fileName: options.file_name,
        fileUrl: options.file_url
      }
    );
    gapLog = createDesignSystemGapLog({
      runId: report.runId,
      report,
      gaps: arrayify(gaps?.data)
    }, {
      now: options.generated_at
    });
  } else {
    report = createEmptyReport(options);
  }

  validateDesignRunReport(report, fixture?.path ?? "generated report payload");

  return commandPayload(commandName, options, {
    report,
    screenshotReport,
    gapLog,
    source: summarizeJsonSource(fixture)
  });
}

async function runIterate({ commandName, options }) {
  const report = await readOptionalJson(options.report ?? options.fixture);
  const gaps = await readOptionalJson(options.gaps);
  const iterationPlan = report
    ? planDesignIteration(
        {
          report: report.data,
          gapNotes: arrayify(gaps?.data)
        },
        {
          runId: options.run_id,
          now: options.generated_at,
          iteration: options.iteration ? Number(options.iteration) : undefined
        }
      )
    : null;

  return commandPayload(commandName, options, {
    status: iterationPlan?.status ?? "ready",
    actions: iterationPlan?.actions ?? [],
    iterationPlan,
    report: summarizeJsonSource(report),
    gapNotes: summarizeJsonSource(gaps)
  });
}

async function maybeCreateScreenshotReport(input, options) {
  const generatedOutput = input.generatedOutput;
  const screens = generatedOutput?.screens ?? generatedOutput?.design?.nodes ?? generatedOutput?.nodes;

  if (!screens && !input.screenshots) {
    return null;
  }

  return createScreenshotReport(
    {
      runId: input.runId,
      figmaFile: input.figmaFile,
      generated: generatedOutput,
      nodes: generatedOutput?.design?.nodes ?? generatedOutput?.nodes,
      screens: generatedOutput?.screens,
      screenshotResults: arrayify(input.screenshots),
      validation: input.validation
    },
    {
      now: options.generated_at,
      requireScreenshots: input.screenshots ? true : false
    }
  );
}

function reportFigmaFile(options, generatedOutput = {}, fallback = {}) {
  const figmaFile = generatedOutput?.figmaFile ?? generatedOutput?.discovery?.figmaFile ?? fallback?.figmaFile ?? {};
  const fileKey = options.file_key ?? figmaFile.fileKey ?? figmaFile.key ?? "stub-file";
  const name = options.file_name ?? figmaFile.name ?? "Stub Figma File";

  return {
    fileKey,
    name,
    url: options.file_url ?? figmaFile.url ?? `https://www.figma.com/file/${fileKey}/${name.replaceAll(" ", "-")}`
  };
}

async function runValidateSchemas({ commandName, options }) {
  const schemaDir = resolveRepoPath(options.schema_dir ?? "schemas");
  const fixtureDir = resolveRepoPath(options.fixture_dir ?? "fixtures");
  const schemaFiles = await findJsonFiles(schemaDir, (file) => file.endsWith(".schema.json"));
  const fixtureFiles = await findJsonFiles(fixtureDir, (file) => file.endsWith(".json"));
  const schemas = [];
  const fixtures = [];

  for (const filePath of schemaFiles) {
    const schema = await readJson(filePath);
    validateSchemaShape(schema, filePath);
    validateLocalRefs(schema, filePath);
    schemas.push(toRepoRelative(filePath));
  }

  for (const filePath of fixtureFiles) {
    const fixture = await readJson(filePath);
    validateKnownFixture(fixture, filePath);
    fixtures.push(toRepoRelative(filePath));
  }

  validateDesignRunReport(createEmptyReport({}), "generated report payload");

  return commandPayload(commandName, options, {
    status: "passed",
    schemas,
    fixtures,
    counts: {
      schemas: schemas.length,
      fixtures: fixtures.length,
      checkedGeneratedPayloads: 1
    }
  });
}

function createEmptyReport(options) {
  const generatedAt = options.generated_at ?? new Date(0).toISOString();

  return {
    schemaVersion: "1.0.0",
    runId: options.run_id ?? "stub-run",
    generatedAt,
    status: "passed",
    figmaFile: {
      fileKey: options.file_key ?? "stub-file",
      name: options.file_name ?? "Stub Figma File",
      url: options.file_url ?? "https://www.figma.com/file/stub-file/Stub-Figma-File"
    },
    summary: {
      screenCount: 0,
      componentUsageCount: 0,
      variableUsageCount: 0,
      validationIssueCount: 0,
      designSystemGapCount: 0,
      provisionalExtensionCount: 0,
      screenshotCount: 0
    },
    screens: [],
    componentsUsed: [],
    variablesUsed: [],
    validation: {
      status: "not_run",
      summary: {
        critical: 0,
        error: 0,
        warning: 0,
        info: 0
      },
      issues: []
    },
    designSystemGaps: [],
    provisionalExtensions: [],
    screenshots: [],
    iterationNotes: []
  };
}

function commandPayload(commandName, options, details) {
  const ok = details?.ok === false ? false : true;
  return {
    command: commandName,
    ok,
    harnessVersion: 1,
    mode: commandMode(commandName, options),
    options: stableOptions(options),
    details
  };
}

async function maybeWriteCacheArtifact(options, name, payload, metadata = {}) {
  const runId = options.run_id;
  const rootDir = options.cache_root ?? (runId ? `runs/${runId}/cache` : undefined);

  if (!runId || !rootDir) {
    return null;
  }

  const cache = await createRunCache({
    runId,
    rootDir,
    lifetime: "single_run",
    disposable: true
  });

  return cache.writeArtifact(name, payload, { metadata });
}

function commandMode(commandName, options) {
  if (commandName === "validate-schemas") {
    return "local";
  }

  if (options.fixture || options.discovery || options.report || options.run_context) {
    return "fixture";
  }

  return "live";
}

function summarizeJsonSource(source) {
  if (!source) {
    return null;
  }

  return {
    path: toRepoRelative(source.path),
    keys: source.data && typeof source.data === "object" && !Array.isArray(source.data)
      ? Object.keys(source.data).sort()
      : []
  };
}

function stableOptions(options) {
  const entries = Object.entries(options)
    .filter(([key, value]) => key !== "_" && value !== undefined && value !== false)
    .sort(([left], [right]) => left.localeCompare(right));

  return Object.fromEntries(entries);
}

function splitCsv(value) {
  if (!value) {
    return undefined;
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayify(value) {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

async function readOptionalJson(inputPath) {
  if (!inputPath) {
    return null;
  }

  const filePath = resolveRepoPath(inputPath);
  return {
    path: filePath,
    data: await readJson(filePath)
  };
}

async function readJson(filePath) {
  const text = await readFile(filePath, "utf8");

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${toRepoRelative(filePath)} is not valid JSON: ${error.message}`);
  }
}

async function findJsonFiles(dirPath, predicate) {
  try {
    await access(dirPath);
  } catch {
    return [];
  }

  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      return findJsonFiles(entryPath, predicate);
    }

    if (entry.isFile() && predicate(entry.name)) {
      return [entryPath];
    }

    return [];
  }));

  return files.flat().sort();
}

function validateSchemaShape(schema, filePath) {
  const label = toRepoRelative(filePath);

  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error(`${label} must be a JSON object`);
  }

  for (const key of ["$schema", "$id", "title", "type"]) {
    if (typeof schema[key] !== "string" || schema[key].length === 0) {
      throw new Error(`${label} must include a non-empty ${key}`);
    }
  }

  if (schema.type !== "object") {
    throw new Error(`${label} root type must be object`);
  }

  if (schema.properties && !isPlainObject(schema.properties)) {
    throw new Error(`${label} properties must be an object`);
  }
}

function validateLocalRefs(schema, filePath) {
  for (const ref of collectRefs(schema)) {
    if (!ref.startsWith("#/")) {
      continue;
    }

    if (resolvePointer(schema, ref) === undefined) {
      throw new Error(`${toRepoRelative(filePath)} has unresolved local $ref ${ref}`);
    }
  }
}

function validateKnownFixture(fixture, filePath) {
  const label = toRepoRelative(filePath);

  if (label.endsWith("fixtures/run-context/example-run-context.json")) {
    validateRunContext(fixture, label);
    return;
  }

  if (label.endsWith("fixtures/reports/design-run-report.valid.json")) {
    validateDesignRunReport(fixture, label);
  }
}

function validateRunContext(value, label) {
  requireObject(value, label);

  for (const key of [
    "schemaVersion",
    "runId",
    "createdAt",
    "figmaFile",
    "generationWorkspace",
    "libraries",
    "discovery",
    "variables",
    "screenshots",
    "artifacts"
  ]) {
    requireKey(value, key, label);
  }

  if (value.schemaVersion !== "1.0.0") {
    throw new Error(`${label} schemaVersion must be 1.0.0`);
  }

  requireObject(value.figmaFile, `${label}.figmaFile`);
  for (const key of ["fileKey", "url"]) {
    requireKey(value.figmaFile, key, `${label}.figmaFile`);
  }

  requireArray(value.libraries, `${label}.libraries`);
  requireObject(value.artifacts?.cache, `${label}.artifacts.cache`);

  if (value.artifacts.cache.lifetime !== "single_run" || value.artifacts.cache.disposable !== true) {
    throw new Error(`${label}.artifacts.cache must be disposable single_run cache metadata`);
  }
}

function validateDesignRunReport(value, label) {
  requireObject(value, label);

  for (const key of [
    "schemaVersion",
    "runId",
    "generatedAt",
    "status",
    "figmaFile",
    "summary",
    "screens",
    "componentsUsed",
    "variablesUsed",
    "validation",
    "designSystemGaps",
    "provisionalExtensions",
    "screenshots",
    "iterationNotes"
  ]) {
    requireKey(value, key, label);
  }

  if (value.schemaVersion !== "1.0.0") {
    throw new Error(`${label} schemaVersion must be 1.0.0`);
  }

  if (!["passed", "failed", "blocked", "needs_iteration"].includes(value.status)) {
    throw new Error(`${label}.status is not a valid report status`);
  }

  requireObject(value.figmaFile, `${label}.figmaFile`);
  for (const key of ["fileKey", "name", "url"]) {
    requireKey(value.figmaFile, key, `${label}.figmaFile`);
  }

  requireObject(value.summary, `${label}.summary`);
  for (const key of [
    "screenCount",
    "componentUsageCount",
    "variableUsageCount",
    "validationIssueCount",
    "designSystemGapCount",
    "provisionalExtensionCount",
    "screenshotCount"
  ]) {
    if (!Number.isInteger(value.summary[key]) || value.summary[key] < 0) {
      throw new Error(`${label}.summary.${key} must be a non-negative integer`);
    }
  }

  requireObject(value.validation, `${label}.validation`);
  requireArray(value.validation.issues, `${label}.validation.issues`);

  for (const key of [
    "screens",
    "componentsUsed",
    "variablesUsed",
    "designSystemGaps",
    "provisionalExtensions",
    "screenshots",
    "iterationNotes"
  ]) {
    requireArray(value[key], `${label}.${key}`);
  }
}

function requireObject(value, label) {
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
}

function requireKey(value, key, label) {
  if (!(key in value)) {
    throw new Error(`${label} is missing required key ${key}`);
  }
}

function collectRefs(value) {
  if (!value || typeof value !== "object") {
    return [];
  }

  const refs = [];

  if (typeof value.$ref === "string") {
    refs.push(value.$ref);
  }

  for (const child of Object.values(value)) {
    refs.push(...collectRefs(child));
  }

  return refs;
}

function resolvePointer(schema, pointer) {
  return pointer
    .slice(2)
    .split("/")
    .reduce((value, segment) => {
      if (value === undefined) {
        return undefined;
      }

      return value[segment.replaceAll("~1", "/").replaceAll("~0", "~")];
    }, schema);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveRepoPath(inputPath) {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(repoRoot, inputPath);
}

function toRepoRelative(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
}

function formatPayload(payload, options) {
  if (options.format === "text") {
    return `${payload.command}: ${payload.ok ? "ok" : "failed"}\n`;
  }

  return `${JSON.stringify(payload, null, 2)}\n`;
}

function printHelp() {
  const rows = [...commands].map(([name, command]) => `  ${name.padEnd(16)} ${command.description}`);

  return [
    "Usage: npm run figma -- <command> [options]",
    "",
    "Commands:",
    ...rows,
    "",
    "Common options:",
    "  --fixture <path>       Read deterministic JSON fixture input.",
    "  --run-context <path>   Read a run context JSON file.",
    "  --report <path>        Read a Design Run Report JSON file.",
    "  --output <path>        Write command JSON output to a file.",
    "  --text                 Print a compact text status.",
    "  --help                 Show help."
  ].join("\n");
}

function printCommandHelp(commandName, command) {
  return [
    `Usage: npm run figma -- ${commandName} [options]`,
    "",
    command.description,
    "",
    "This harness is deterministic. Bootstrap, discover, and nesting call the landed",
    "fixture/live-capable modules; later lanes should preserve the command name and JSON envelope."
  ].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await main();
  process.exit(exitCode);
}
