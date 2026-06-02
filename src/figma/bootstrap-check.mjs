import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { createFigmaAccess, createFigmaAccessFromEnv } from "./figma-access.mjs";

export const bootstrapCheckNames = [
  "figmaAccess",
  "workspaceWrite",
  "libraryAssets",
  "variables",
  "screenshots",
  "reportOutput"
];

export async function runBootstrapCheck(options = {}) {
  const checkedAt = new Date().toISOString();
  const figmaAccess = options.figmaAccess ?? createBootstrapFigmaAccess(options);
  const runContext = await loadRunContext(options);
  const checks = [];
  const state = {
    figmaAccess,
    runContext,
    health: null,
    file: null,
    components: [],
    componentSets: [],
    variables: null
  };

  checks.push(await checkFigmaAccess(state));
  checks.push(await checkWorkspaceWrite(state));
  checks.push(await checkLibraryAssets(state, options));
  checks.push(await checkVariables(state));
  checks.push(await checkScreenshots(state, options));
  checks.push(await checkReportOutput(state, options));

  return {
    ok: checks.every((check) => check.status === "passed"),
    checkedAt,
    mode: state.health?.mode ?? figmaAccess.mode ?? "unknown",
    summary: summarizeChecks(checks),
    checks
  };
}

export function createBootstrapFigmaAccess(options = {}) {
  const accessOptions = {
    accessToken: options.accessToken,
    baseUrl: options.baseUrl,
    fetch: options.fetch,
    fileKey: options.fileKey,
    fixture: options.fixture,
    fixturePath: options.fixturePath,
    generationPage: options.generationPage,
    libraryName: options.libraryName,
    mode: options.mode
  };

  if (options.env) {
    return createFigmaAccessFromEnv(options.env, withoutUndefined(accessOptions));
  }

  return createFigmaAccess(withoutUndefined(accessOptions));
}

async function checkFigmaAccess(state) {
  try {
    state.health = await state.figmaAccess.health();
    state.file = await state.figmaAccess.getFile();

    if (state.health.canRead !== true) {
      return failed(
        "figmaAccess",
        "Figma access is unavailable: the access layer did not confirm read access.",
        { health: state.health }
      );
    }

    return passed("figmaAccess", "Figma MCP/API access is available.", {
      mode: state.health.mode,
      fileKey: state.health.fileKey ?? state.file?.key,
      fileName: state.file?.name ?? null
    });
  } catch (error) {
    return failed("figmaAccess", `Figma access is unavailable: ${error.message}`, {
      errorName: error.name
    });
  }
}

async function checkWorkspaceWrite(state) {
  if (!state.health || !state.file) {
    return blockedByAccess("workspaceWrite");
  }

  if (state.health.canWrite !== true) {
    return failed(
      "workspaceWrite",
      "Generation Workspace write access is unavailable. Confirm the active Figma account can edit the target file and rerun bootstrap.",
      {
        canWrite: state.health.canWrite,
        generationPage: state.health.generationPage ?? null
      }
    );
  }

  const generationPage = state.health.generationPage ?? "Generation Workspace";

  return passed("workspaceWrite", "Generation Workspace write access is available.", {
    generationPage,
    pageFound: Boolean(findPageByName(state.file?.document, generationPage))
  });
}

async function checkLibraryAssets(state, options) {
  if (!state.health || !state.file) {
    return blockedByAccess("libraryAssets");
  }

  try {
    state.components = normalizeList(await state.figmaAccess.getLocalComponents(), "components");
    state.componentSets = normalizeList(
      await state.figmaAccess.getLocalComponentSets(),
      "componentSets"
    );
  } catch (error) {
    return failed("libraryAssets", `Library Assets are unavailable: ${error.message}`, {
      errorName: error.name
    });
  }

  const expectedLibraryName =
    options.libraryName ?? state.health.libraryName ?? "New Engine Figma UI Library";
  const libraries = collectLibraryRefs(state.runContext, state.file);
  const matchingLibrary = libraries.find((library) => library.name === expectedLibraryName);
  const connectedLibrary = matchingLibrary ?? libraries.find(isConnectedLibrary);
  const assetCount = state.components.length + state.componentSets.length;

  if (!connectedLibrary) {
    return failed(
      "libraryAssets",
      `${expectedLibraryName} is not listed as a connected Figma Asset. Connect the library in Figma Assets before discovery or design generation.`,
      {
        expectedLibraryName,
        libraryCount: libraries.length,
        componentCount: state.components.length,
        componentSetCount: state.componentSets.length
      }
    );
  }

  if (!isConnectedLibrary(connectedLibrary)) {
    return failed(
      "libraryAssets",
      `${connectedLibrary.name} is present but not connected as Figma Assets. Set connectedAsAssets=true/status=connected before continuing.`,
      {
        library: summarizeLibrary(connectedLibrary),
        componentCount: state.components.length,
        componentSetCount: state.componentSets.length
      }
    );
  }

  if (assetCount === 0) {
    return failed(
      "libraryAssets",
      "Library Assets are unavailable: no components or component sets were discovered from the connected library.",
      {
        library: summarizeLibrary(connectedLibrary),
        componentCount: 0,
        componentSetCount: 0
      }
    );
  }

  return passed("libraryAssets", "Connected library Assets are available.", {
    library: summarizeLibrary(connectedLibrary),
    componentCount: state.components.length,
    componentSetCount: state.componentSets.length
  });
}

async function checkVariables(state) {
  if (!state.health || !state.file) {
    return blockedByAccess("variables");
  }

  try {
    state.variables = await state.figmaAccess.getVariables();
  } catch (error) {
    return failed("variables", `Figma variables are unavailable: ${error.message}`, {
      errorName: error.name
    });
  }

  const counts = countVariables(state.variables);

  if (counts.variables === 0) {
    return failed(
      "variables",
      "Figma variables are unavailable: variable discovery returned no variables. Connect or publish the library variables before design generation.",
      counts
    );
  }

  return passed("variables", "Figma variables are available.", counts);
}

async function checkScreenshots(state, options) {
  if (!state.health || !state.file) {
    return blockedByAccess("screenshots");
  }

  if (state.health.canScreenshot !== true) {
    return failed(
      "screenshots",
      "Screenshot export is unavailable. Confirm the Figma access path can export generated frames before reporting.",
      { canScreenshot: state.health.canScreenshot }
    );
  }

  const nodeIds = collectScreenshotNodeIds(state.runContext, state.file, options);

  if (nodeIds.length === 0) {
    return failed(
      "screenshots",
      "Screenshot export is unavailable: no target node IDs were provided for the bootstrap export probe.",
      { nodeIds }
    );
  }

  try {
    const exportResult = await state.figmaAccess.exportImages(nodeIds, {
      format: options.screenshotFormat ?? "png"
    });
    const images = exportResult?.images ?? {};
    const exportedNodeIds = nodeIds.filter((nodeId) => typeof images[nodeId] === "string" && images[nodeId]);

    if (exportedNodeIds.length === 0) {
      return failed(
        "screenshots",
        "Screenshot export is unavailable: Figma returned no image URLs for the bootstrap node IDs.",
        { nodeIds, format: exportResult?.format ?? options.screenshotFormat ?? "png" }
      );
    }

    return passed("screenshots", "Screenshot export is available.", {
      nodeIds,
      exportedNodeIds,
      format: exportResult?.format ?? options.screenshotFormat ?? "png"
    });
  } catch (error) {
    return failed("screenshots", `Screenshot export is unavailable: ${error.message}`, {
      errorName: error.name,
      nodeIds
    });
  }
}

async function checkReportOutput(state, options) {
  if (!state.health || !state.file) {
    return blockedByAccess("reportOutput");
  }

  if (state.file?.bootstrap?.reportOutputAvailable === false) {
    return failed(
      "reportOutput",
      "Report output is unavailable in the fixture: file.bootstrap.reportOutputAvailable=false.",
      { source: "fixture" }
    );
  }

  const outputDir = resolveReportOutputDir(state.runContext, options);
  const probePath = path.join(
    outputDir,
    `.bootstrap-check-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );

  try {
    await mkdir(outputDir, { recursive: true });
    await writeFile(
      probePath,
      `${JSON.stringify({ probe: "figma-bootstrap-check", createdAt: new Date().toISOString() })}\n`,
      { flag: "wx" }
    );
    await unlink(probePath);

    return passed("reportOutput", "Design Run Report output is writable.", {
      outputDir,
      probePath,
      probeRemoved: true
    });
  } catch (error) {
    return failed(
      "reportOutput",
      `Report output is unavailable: could not write a bootstrap probe to ${outputDir}. ${error.message}`,
      {
        outputDir,
        errorName: error.name
      }
    );
  }
}

async function loadRunContext(options) {
  if (options.runContext) {
    return options.runContext;
  }

  if (!options.runContextPath) {
    return null;
  }

  return JSON.parse(await readFile(resolvePath(options.runContextPath, options.cwd), "utf8"));
}

function collectLibraryRefs(runContext, file) {
  return [
    ...(Array.isArray(runContext?.libraries) ? runContext.libraries : []),
    ...(Array.isArray(file?.libraries) ? file.libraries : []),
    ...(Array.isArray(file?.libraryAssets) ? file.libraryAssets : []),
    ...(Array.isArray(file?.connectedLibraries) ? file.connectedLibraries : []),
    ...(Array.isArray(file?.teamLibraries) ? file.teamLibraries : [])
  ];
}

function collectScreenshotNodeIds(runContext, file, options) {
  const nodeIds = [
    ...(Array.isArray(options.screenshotNodeIds) ? options.screenshotNodeIds : []),
    ...(Array.isArray(file?.bootstrap?.screenshotNodeIds) ? file.bootstrap.screenshotNodeIds : []),
    ...(Array.isArray(runContext?.screenshots?.items)
      ? runContext.screenshots.items.map((item) => item.nodeId)
      : []),
    ...collectWorkspaceNodeIds(runContext?.generationWorkspace)
  ];

  return [...new Set(nodeIds.filter((nodeId) => typeof nodeId === "string" && nodeId.length > 0))];
}

function collectWorkspaceNodeIds(generationWorkspace) {
  return [
    generationWorkspace?.root?.node?.nodeId,
    ...(Array.isArray(generationWorkspace?.targets)
      ? generationWorkspace.targets.map((target) => target.node?.nodeId)
      : [])
  ].filter(Boolean);
}

function resolveReportOutputDir(runContext, options) {
  const outputPath =
    options.reportOutputPath ??
    runContext?.artifacts?.reports?.designRunReportPath ??
    runContext?.artifacts?.reports?.outputDir ??
    "reports/bootstrap-check/bootstrap-check.json";

  const resolved = resolvePath(outputPath, options.cwd);
  const hasJsonExtension = path.extname(resolved).toLowerCase() === ".json";

  return hasJsonExtension ? path.dirname(resolved) : resolved;
}

function normalizeList(value, key) {
  if (Array.isArray(value)) {
    return value;
  }

  if (Array.isArray(value?.meta?.[key])) {
    return value.meta[key];
  }

  if (Array.isArray(value?.[key])) {
    return value[key];
  }

  if (value?.meta?.[key] && typeof value.meta[key] === "object") {
    return Object.values(value.meta[key]);
  }

  if (value?.[key] && typeof value[key] === "object") {
    return Object.values(value[key]);
  }

  return [];
}

function countVariables(value) {
  const variables = normalizeVariableCollection(value?.meta?.variables ?? value?.variables);
  const collections = normalizeVariableCollection(
    value?.meta?.variableCollections ?? value?.variableCollections ?? value?.collections
  );

  return {
    variables: variables.length,
    collections: collections.length
  };
}

function normalizeVariableCollection(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    return Object.values(value);
  }

  return [];
}

function findPageByName(node, name) {
  if (!node || typeof node !== "object") {
    return null;
  }

  if (node.type === "PAGE" && node.name === name) {
    return node;
  }

  for (const child of node.children ?? []) {
    const match = findPageByName(child, name);
    if (match) {
      return match;
    }
  }

  return null;
}

function isConnectedLibrary(library) {
  return library?.connectedAsAssets === true && (library.status === undefined || library.status === "connected");
}

function summarizeLibrary(library) {
  return {
    libraryId: library.libraryId ?? null,
    name: library.name ?? null,
    connectedAsAssets: library.connectedAsAssets ?? null,
    status: library.status ?? null,
    source: library.source ?? null
  };
}

function summarizeChecks(checks) {
  return checks.reduce(
    (summary, check) => {
      summary[check.status] = (summary[check.status] ?? 0) + 1;
      return summary;
    },
    { passed: 0, failed: 0 }
  );
}

function passed(name, message, details = {}) {
  return {
    name,
    status: "passed",
    message,
    details
  };
}

function failed(name, message, details = {}) {
  return {
    name,
    status: "failed",
    message,
    details
  };
}

function blockedByAccess(name) {
  return failed(name, "Figma access failed first, so this bootstrap check could not run.", {});
}

function resolvePath(inputPath, cwd = process.cwd()) {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(cwd, inputPath);
}

function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter((entry) => entry[1] !== undefined));
}
