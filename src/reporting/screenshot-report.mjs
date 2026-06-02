const schemaVersion = "1.0.0";
const kind = "figma-screenshot-report";

const reportStatuses = new Set(["passed", "failed", "blocked", "needs_iteration"]);
const validationStatuses = new Set(["passed", "failed", "not_run"]);
const screenshotPurposes = new Set([
  "review",
  "validation",
  "before_iteration",
  "after_iteration",
  "comparison",
  "other"
]);
const severities = new Set(["critical", "error", "warning", "info"]);
const issueStatuses = new Set(["open", "resolved", "waived"]);
const validationCategories = new Set([
  "detached_component",
  "raw_color",
  "raw_spacing",
  "raw_radius",
  "raw_typography",
  "broken_variable_alias",
  "missing_variable_binding",
  "invalid_slot_usage",
  "layout_hygiene",
  "contrast",
  "theme_mode",
  "prototype_dead_end",
  "component_property",
  "provisional_extension",
  "screenshot",
  "figma_setup",
  "other"
]);
const componentSources = new Set(["library", "local", "provisional"]);
const variableLevels = new Set(["primitive", "semantic", "component"]);
const resolvedTypes = new Set(["color", "number", "string", "boolean"]);

export class ScreenshotReportError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ScreenshotReportError";
    this.details = details;
  }
}

export async function createScreenshotReport(input = {}, options = {}) {
  const generatedAt = toIsoTimestamp(options.now ?? input.generatedAt ?? new Date());
  const runId = stringValue(options.runId ?? input.runId ?? input.generated?.runId ?? "screenshot-report-run");
  const figmaFile = normalizeFigmaFile(input.figmaFile ?? input.generated?.figmaFile ?? input.design?.figmaFile);
  const context = { ...input, runId, figmaFile };
  const targetNodes = normalizeTargetScreens(input, context);
  const adapterResults = await resolveScreenshotResults(targetNodes, context, options);
  const screenshotIssues = [];
  const screenshotEntries = [];
  const screenshotsByScreenId = new Map();

  targetNodes.forEach((screen, index) => {
    const results = adapterResults.get(screen.id) ?? [];

    if (results.length === 0 && options.requireScreenshots !== false) {
      screenshotIssues.push(unavailableScreenshotIssue(screen, index));
      return;
    }

    results.forEach((result, resultIndex) => {
      const normalized = normalizeScreenshotResult(result, screen, {
        context,
        generatedAt,
        index,
        resultIndex,
        defaults: options
      });

      if (normalized.entry) {
        screenshotEntries.push(normalized.entry);
        appendMapValue(screenshotsByScreenId, screen.id, normalized.entry.id);
      }

      if (normalized.issue) {
        screenshotIssues.push(normalized.issue);
      }
    });
  });

  const validation = normalizeValidation(input.validation ?? input.validatorResult?.validation, {
    context,
    additionalIssues: screenshotIssues
  });
  const validationIssueIdsByNode = validationIssuesByNode(validation.issues);
  const screens = targetNodes.map((screen) =>
    normalizeScreenResult(screen, {
      screenshotIds: screenshotsByScreenId.get(screen.id) ?? [],
      validationIssueIds: validationIssueIdsByNode.get(screen.node.nodeId) ?? []
    })
  );
  const componentsUsed = normalizeComponentUsage(input.componentsUsed ?? input.generated?.componentsUsed, context);
  const variablesUsed = normalizeVariableUsage(input.variablesUsed ?? input.generated?.variablesUsed, context);
  const designSystemGaps = arrayify(input.designSystemGaps ?? input.generated?.designSystemGaps);
  const provisionalExtensions = arrayify(
    input.provisionalExtensions ?? input.generated?.provisionalExtensions
  );
  const iterationNotes = arrayify(input.iterationNotes);
  const status = normalizeReportStatus(
    options.status ?? input.status,
    validation,
    screenshotEntries.length,
    options.requireScreenshots === false ? screenshotEntries.length : targetNodes.length
  );

  const report = {
    schemaVersion,
    runId,
    ...(input.runContextPath ? { runContextPath: input.runContextPath } : {}),
    generatedAt,
    status,
    figmaFile,
    summary: {
      screenCount: screens.length,
      componentUsageCount: componentsUsed.length,
      variableUsageCount: variablesUsed.length,
      validationIssueCount: validation.issues.length,
      designSystemGapCount: designSystemGaps.length,
      provisionalExtensionCount: provisionalExtensions.length,
      screenshotCount: screenshotEntries.length
    },
    screens,
    componentsUsed,
    variablesUsed,
    validation,
    designSystemGaps,
    provisionalExtensions,
    screenshots: screenshotEntries,
    iterationNotes
  };

  return {
    kind,
    schemaVersion,
    runId,
    report,
    screenshotIssues
  };
}

export const buildScreenshotReport = createScreenshotReport;

export function normalizeScreenshotEntry(result, screen, options = {}) {
  const normalizedScreen = normalizeTargetScreen(screen, options.index ?? 0, options.context ?? {});

  if (!normalizedScreen) {
    throw new ScreenshotReportError("normalizeScreenshotEntry requires a screen with a nodeId.");
  }

  return normalizeScreenshotResult(result, normalizedScreen, {
    context: options.context ?? {},
    generatedAt: toIsoTimestamp(options.now ?? options.generatedAt ?? new Date()),
    index: options.index ?? 0,
    resultIndex: options.resultIndex ?? 0,
    defaults: options
  }).entry;
}

function normalizeTargetScreens(input, context) {
  const explicitScreens =
    input.screens ??
    input.generated?.screens ??
    input.report?.screens ??
    input.design?.screens;
  const nodes =
    explicitScreens ??
    input.nodes ??
    input.generated?.nodes ??
    input.generated?.design?.nodes ??
    (input.generated?.design?.root ? [input.generated.design.root] : null) ??
    input.design?.nodes ??
    (input.design?.root ? [input.design.root] : []);

  const screens = arrayify(nodes)
    .map((screen, index) => normalizeTargetScreen(screen, index, context))
    .filter(Boolean);

  if (screens.length > 0) {
    return screens;
  }

  throw new ScreenshotReportError("screenshot report requires at least one generated screen or node.");
}

function normalizeTargetScreen(screen, index, context) {
  const rawNode = screen.node ?? screen.root ?? screen;
  const node = normalizeNodeRef(rawNode, context);

  if (!node) {
    return null;
  }

  return {
    id: stringValue(screen.id ?? screen.targetId ?? screen.target?.targetId) ||
      `screen-${slugify(node.name || node.nodeId) || index + 1}`,
    node,
    status: reportStatuses.has(screen.status) ? screen.status : undefined,
    briefReference: optionalString(screen.briefReference ?? screen.brief ?? screen.target?.briefReference),
    screenshotIds: uniqueStrings(screen.screenshotIds),
    validationIssueIds: uniqueStrings(screen.validationIssueIds),
    dimensions: normalizeDimensions(screen.dimensions ?? screen.target?.dimensions ?? rawNode),
    theme: optionalString(screen.theme),
    mode: optionalString(screen.mode),
    purpose: screen.purpose ? normalizePurpose(screen.purpose) : undefined
  };
}

async function resolveScreenshotResults(screens, context, options) {
  const byScreenId = new Map();
  const provided = inputScreenshotResults(context);

  if (provided.length > 0) {
    for (const result of provided) {
      const screen = matchResultScreen(result, screens);
      if (screen) {
        appendMapValue(byScreenId, screen.id, result);
      }
    }
  }

  if (typeof options.screenshotAdapter !== "function") {
    return byScreenId;
  }

  for (const screen of screens) {
    try {
      const result = await options.screenshotAdapter(screen, context);
      for (const item of arrayify(result)) {
        appendMapValue(byScreenId, screen.id, item);
      }
    } catch (error) {
      appendMapValue(byScreenId, screen.id, {
        status: "failed",
        error: error.message,
        message: `Screenshot capture failed for ${screen.node.name}.`,
        severity: "error"
      });
    }
  }

  return byScreenId;
}

function inputScreenshotResults(context) {
  const results =
    context.screenshotResults ??
    context.screenshotExports ??
    context.screenshots?.items ??
    context.screenshots;

  if (results && !Array.isArray(results) && typeof results === "object" && !isScreenshotResult(results)) {
    return Object.entries(results).map(([screenId, result]) =>
      typeof result === "string"
        ? { screenId, path: result }
        : {
            screenId,
            ...result
          }
    );
  }

  return arrayify(results);
}

function matchResultScreen(result, screens) {
  const nodeId = stringValue(result.node?.nodeId ?? result.nodeId);
  const screenId = stringValue(result.screenId ?? result.targetId);

  return screens.find(
    (screen) =>
      (screenId && (screen.id === screenId || screen.rawTargetId === screenId)) ||
      (nodeId && screen.node.nodeId === nodeId)
  ) ?? (screens.length === 1 ? screens[0] : null);
}

function normalizeScreenshotResult(result, screen, options) {
  const status = stringValue(result.status ?? result.captureStatus ?? "captured").toLowerCase();
  const path = optionalString(result.path ?? result.localPath ?? result.filePath ?? result.outputPath);
  const entry = path
    ? {
        id: stringValue(result.id) ||
          [
            "shot",
            screen.id,
            slugify(result.mode ?? screen.mode ?? options.defaults.mode),
            options.resultIndex > 0 ? options.resultIndex + 1 : ""
          ]
            .filter(Boolean)
            .join("-"),
        node: normalizeNodeRef(result.node ?? { nodeId: result.nodeId, name: result.nodeName }, options.context) ??
          screen.node,
        path,
        ...(result.url ? { url: stringValue(result.url) } : {}),
        capturedAt: toIsoTimestamp(result.capturedAt ?? result.createdAt ?? options.defaults.capturedAt ?? options.generatedAt),
        purpose: normalizePurpose(result.purpose ?? screen.purpose ?? options.defaults.purpose),
        ...optionalField("theme", result.theme ?? screen.theme ?? options.defaults.theme),
        ...optionalField("mode", result.mode ?? screen.mode ?? options.defaults.mode),
        ...optionalDimensions(result.dimensions ?? screen.dimensions ?? options.defaults.dimensions)
      }
    : null;

  if (isFailedScreenshotStatus(status) || (!path && options.defaults.requireScreenshots !== false)) {
    return {
      entry,
      issue: failedScreenshotIssue(result, screen, {
        status,
        path,
        index: options.index,
        resultIndex: options.resultIndex
      })
    };
  }

  return { entry };
}

function unavailableScreenshotIssue(screen, index) {
  return {
    id: `val-screenshot-${slugify(screen.id) || index + 1}-unavailable`,
    code: "SCREENSHOT_CAPTURE_UNAVAILABLE",
    category: "screenshot",
    severity: "warning",
    status: "open",
    message: `No screenshot capture result was available for ${screen.node.name}.`,
    node: screen.node,
    expected: "A captured screenshot artifact for each generated screen.",
    actual: "No screenshot/export adapter result was provided.",
    recommendation: "Run screenshot capture or provide fixture screenshotResults before final review."
  };
}

function failedScreenshotIssue(result, screen, metadata) {
  const message = optionalString(result.message ?? result.error) ??
    `Screenshot capture failed for ${screen.node.name}.`;
  const severity = severities.has(result.severity) ? result.severity : metadata.path ? "warning" : "error";

  return {
    id: stringValue(result.issueId) ||
      `val-screenshot-${slugify(screen.id) || metadata.index + 1}-${metadata.resultIndex + 1}`,
    code: stringValue(result.code) || "SCREENSHOT_CAPTURE_FAILED",
    category: "screenshot",
    severity,
    status: issueStatuses.has(result.issueStatus) ? result.issueStatus : "open",
    message,
    node: screen.node,
    expected: optionalString(result.expected) ?? "Screenshot capture completes and produces a local artifact.",
    actual: optionalString(result.actual) ??
      (metadata.path
        ? `Capture returned status "${metadata.status}" with artifact ${metadata.path}.`
        : `Capture returned status "${metadata.status}" without a local artifact.`),
    recommendation: optionalString(result.recommendation) ??
      "Inspect Figma access, export permissions, and adapter configuration, then retry capture."
  };
}

function normalizeScreenResult(screen, refs) {
  const validationIssueIds = uniqueStrings([...screen.validationIssueIds, ...refs.validationIssueIds]);

  return {
    id: screen.id,
    node: screen.node,
    status: screen.status ?? (validationIssueIds.length > 0 ? "needs_iteration" : "passed"),
    ...optionalField("briefReference", screen.briefReference),
    screenshotIds: uniqueStrings([...screen.screenshotIds, ...refs.screenshotIds]),
    ...(validationIssueIds.length > 0 ? { validationIssueIds } : {})
  };
}

function normalizeValidation(validationLike, options) {
  const base = validationLike?.validation ?? validationLike ?? {};
  const issues = [
    ...arrayify(base.issues).map((issue, index) => normalizeIssue(issue, index, options.context)),
    ...options.additionalIssues
  ];
  const summary = summarizeIssues(issues);
  const explicitStatus = validationStatuses.has(base.status) ? base.status : null;
  const status = issues.length > 0
    ? summary.critical > 0 || summary.error > 0
      ? "failed"
      : "passed"
    : explicitStatus ?? "not_run";

  return {
    status,
    summary,
    issues
  };
}

function normalizeIssue(issue, index, context) {
  const node = normalizeNodeRef(issue.node ?? { nodeId: issue.nodeId, name: issue.nodeName }, context);
  const relatedNodes = arrayify(issue.relatedNodes)
    .map((candidate) => normalizeNodeRef(candidate, context))
    .filter(Boolean);

  return {
    id: stringValue(issue.id ?? issue.issueId) || `val-${index + 1}`,
    code: stringValue(issue.code ?? issue.ruleId) || "VALIDATION_ISSUE",
    category: validationCategories.has(issue.category) ? issue.category : "other",
    severity: severities.has(issue.severity) ? issue.severity : "error",
    status: issueStatuses.has(issue.status) ? issue.status : "open",
    message: stringValue(issue.message ?? issue.summary) || "Validation reported an issue.",
    ...(node ? { node } : {}),
    ...(relatedNodes.length > 0 ? { relatedNodes } : {}),
    ...optionalField("expected", issue.expected),
    ...optionalField("actual", issue.actual),
    ...optionalField("recommendation", issue.recommendation)
  };
}

function validationIssuesByNode(issues) {
  const map = new Map();

  for (const issue of issues) {
    const nodeIds = uniqueStrings([
      issue.node?.nodeId,
      ...arrayify(issue.relatedNodes).map((node) => node.nodeId)
    ]);

    for (const nodeId of nodeIds) {
      appendMapValue(map, nodeId, issue.id);
    }
  }

  return map;
}

function normalizeComponentUsage(components, context) {
  const screenNode = context.report?.screens?.[0]?.node ?? normalizeNodeRef(context.design?.nodes?.[0], context);

  return arrayify(components)
    .map((component) => {
      const instanceNodes = arrayify(component.instanceNodes)
        .map((node) => normalizeNodeRef(node, context))
        .filter(Boolean);
      const fallbackNode = normalizeNodeRef(component.node ?? component, context) ?? screenNode;
      const nodes = instanceNodes.length > 0 ? instanceNodes : fallbackNode ? [fallbackNode] : [];
      const componentKey = stringValue(component.componentKey ?? component.key);
      const name = stringValue(component.name);

      if (!componentKey || !name || nodes.length === 0) {
        return null;
      }

      return {
        componentKey,
        name,
        source: componentSources.has(component.source) ? component.source : "library",
        ...optionalField("componentSetKey", component.componentSetKey),
        ...(component.variant ? { variant: component.variant } : {}),
        ...(component.propertiesConfigured ? { propertiesConfigured: component.propertiesConfigured } : {}),
        usageCount: Number.isInteger(component.usageCount) && component.usageCount > 0
          ? component.usageCount
          : nodes.length,
        instanceNodes: nodes
      };
    })
    .filter(Boolean);
}

function normalizeVariableUsage(variables, context) {
  return arrayify(variables)
    .map((variable) => {
      const variableId = stringValue(variable.variableId ?? variable.id);
      const name = stringValue(variable.name);
      const collection = stringValue(variable.collection ?? variable.collectionName ?? variable.collectionId);
      const boundNodes = arrayify(variable.boundNodes)
        .map((node) => normalizeNodeRef(node, context))
        .filter(Boolean);

      if (!variableId || !name || !collection) {
        return null;
      }

      return {
        variableId,
        ...optionalField("variableKey", variable.variableKey ?? variable.key),
        name,
        collection,
        ...optionalField("mode", variable.mode),
        level: variableLevels.has(variable.level) ? variable.level : inferVariableLevel(variable),
        ...(resolvedTypes.has(variable.resolvedType) ? { resolvedType: variable.resolvedType } : {}),
        ...(Array.isArray(variable.aliasChain) ? { aliasChain: variable.aliasChain } : {}),
        usageCount: Number.isInteger(variable.usageCount) && variable.usageCount > 0
          ? variable.usageCount
          : Math.max(boundNodes.length, 1),
        ...(boundNodes.length > 0 ? { boundNodes } : {})
      };
    })
    .filter(Boolean);
}

function normalizeFigmaFile(figmaFile) {
  const fileKey = stringValue(figmaFile?.fileKey ?? figmaFile?.key);
  const name = stringValue(figmaFile?.name) || "Figma file";
  const url = stringValue(figmaFile?.url) || (fileKey ? `https://www.figma.com/file/${fileKey}` : "");

  if (!fileKey || !url) {
    throw new ScreenshotReportError("screenshot report requires figmaFile.fileKey and figmaFile.url.");
  }

  return { fileKey, name, url };
}

function normalizeNodeRef(node, context) {
  const nodeId = stringValue(node?.nodeId ?? node?.id);

  if (!nodeId) {
    return null;
  }

  const url = stringValue(node?.url) || figmaNodeUrl(context.figmaFile, nodeId);

  return {
    nodeId,
    name: stringValue(node?.name) || nodeId,
    ...(node?.type ? { type: stringValue(node.type) } : {}),
    url
  };
}

function figmaNodeUrl(figmaFile, nodeId) {
  const normalizedNodeId = String(nodeId).replace(/:/g, "-");

  try {
    const url = new URL(figmaFile.url);
    url.searchParams.set("node-id", normalizedNodeId);
    return url.toString();
  } catch {
    const separator = figmaFile.url.includes("?") ? "&" : "?";
    return `${figmaFile.url}${separator}node-id=${normalizedNodeId}`;
  }
}

function normalizeReportStatus(status, validation, screenshotCount, screenCount) {
  if (reportStatuses.has(status)) {
    return status;
  }

  if (validation.summary.critical > 0 || validation.summary.error > 0) {
    return "failed";
  }

  if (validation.summary.warning > 0 || screenshotCount < screenCount) {
    return "needs_iteration";
  }

  return "passed";
}

function summarizeIssues(issues) {
  return issues.reduce(
    (summary, issue) => {
      summary[issue.severity] += 1;
      return summary;
    },
    { critical: 0, error: 0, warning: 0, info: 0 }
  );
}

function normalizePurpose(value) {
  return screenshotPurposes.has(value) ? value : "review";
}

function normalizeDimensions(value) {
  const width = Number(value?.width);
  const height = Number(value?.height);

  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    return null;
  }

  return { width, height };
}

function optionalDimensions(value) {
  const dimensions = normalizeDimensions(value);
  return dimensions ? { dimensions } : {};
}

function optionalField(name, value) {
  const serialized = optionalString(value);
  return serialized ? { [name]: serialized } : {};
}

function optionalString(value) {
  const serialized = stringValue(value);
  return serialized.length > 0 ? serialized : null;
}

function toIsoTimestamp(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new ScreenshotReportError("timestamp values must be valid dates.", { value });
  }

  return date.toISOString();
}

function isFailedScreenshotStatus(status) {
  return ["failed", "error", "unavailable", "blocked"].includes(status);
}

function isScreenshotResult(value) {
  return Boolean(
    value.path ??
      value.localPath ??
      value.filePath ??
      value.outputPath ??
      value.nodeId ??
      value.node ??
      value.status ??
      value.captureStatus
  );
}

function inferVariableLevel(variable) {
  const text = `${variable.name ?? ""} ${variable.role ?? ""}`.toLowerCase();

  if (text.includes("primitive")) return "primitive";
  if (text.includes("component")) return "component";
  return "semantic";
}

function appendMapValue(map, key, value) {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function uniqueStrings(values) {
  return [...new Set(arrayify(values).map(stringValue).filter(Boolean))];
}

function arrayify(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function stringValue(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function slugify(value) {
  return stringValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
