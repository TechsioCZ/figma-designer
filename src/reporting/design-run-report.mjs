import { serializeValidationResult } from "../validation/index.mjs";

const schemaVersion = "1.0.0";
const reportStatuses = new Set(["passed", "failed", "blocked", "needs_iteration"]);
const gapCategories = new Set([
  "component",
  "variant",
  "slot",
  "component_property",
  "variable",
  "mode",
  "style",
  "pattern",
  "layout",
  "content",
  "accessibility",
  "other"
]);
const gapStatuses = new Set([
  "open",
  "provisional_extension_proposed",
  "provisional_extension_approved",
  "resolved",
  "rejected"
]);
const extensionStatuses = new Set(["proposed", "approved", "created", "rejected", "removed"]);
const screenshotPurposes = new Set([
  "review",
  "validation",
  "before_iteration",
  "after_iteration",
  "comparison",
  "other"
]);
const iterationCategories = new Set([
  "creation",
  "validation",
  "gap",
  "provisional_extension",
  "screenshot",
  "follow_up",
  "other"
]);
const authorRoles = new Set(["codex", "designer", "operator", "validator"]);
const variableLevels = new Set(["primitive", "semantic", "component"]);

export class DesignRunReportError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DesignRunReportError";
    this.details = details;
  }
}

export function buildDesignRunReport(input = {}, options = {}) {
  const generatedOutput = input.generatedOutput ?? input.designPlan ?? input.generation ?? input.plan ?? {};
  const figmaFile = normalizeFigmaFile(
    input.figmaFile ?? generatedOutput.figmaFile ?? input.discovery?.figmaFile ?? generatedOutput.discovery?.figmaFile,
    options
  );
  const runId = stringValue(options.runId ?? input.runId ?? generatedOutput.runId) || "design-run";
  const generatedAt = toIsoTimestamp(options.now ?? options.generatedAt ?? input.generatedAt ?? new Date(0));
  const context = { ...input, runId, figmaFile, design: generatedOutput };
  const validation = serializeValidationResult(
    input.validationResult ?? input.validatorResult ?? input.validation ?? generatedOutput.validation ?? generatedOutput.ruleChecks,
    context,
    options.validationOptions ?? {}
  );
  const screenshots = normalizeScreenshots(collectScreenshots(input), { figmaFile, generatedAt });
  const screenContext = buildScreenContext(generatedOutput);
  const screens = normalizeScreens(input.screens, {
    generatedOutput,
    figmaFile,
    screenshots,
    validation,
    screenContext
  });
  const componentsUsed = normalizeComponentUsage(collectComponents(input, generatedOutput), {
    generatedOutput,
    figmaFile
  });
  const variablesUsed = normalizeVariableUsage(collectVariables(input, generatedOutput), {
    generatedOutput,
    figmaFile
  });
  const designSystemGaps = normalizeDesignSystemGaps(collectGaps(input, generatedOutput), {
    figmaFile
  });
  const provisionalExtensions = normalizeProvisionalExtensions(
    collectProvisionalExtensions(input, generatedOutput),
    { figmaFile }
  );
  const iterationNotes = normalizeIterationNotes(input.iterationNotes ?? input.notes, {
    generatedAt
  });
  const status = normalizeReportStatus(
    options.status ?? input.status,
    {
      generatedStatus: generatedOutput.status ?? generatedOutput.planStatus,
      screens,
      validation,
      designSystemGaps,
      provisionalExtensions,
      iterationNotes
    }
  );

  return withoutUndefined({
    schemaVersion,
    runId,
    runContextPath: optionalString(options.runContextPath ?? input.runContextPath),
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
      screenshotCount: screenshots.length
    },
    screens,
    componentsUsed,
    variablesUsed,
    validation,
    designSystemGaps,
    provisionalExtensions,
    screenshots,
    iterationNotes
  });
}

export const createDesignRunReport = buildDesignRunReport;

function normalizeFigmaFile(value = {}, options = {}) {
  const fileKey = stringValue(options.fileKey ?? value.fileKey ?? value.key);
  const name = stringValue(options.fileName ?? value.name ?? value.fileName);
  const url = stringValue(options.fileUrl ?? value.url);

  if (!fileKey) {
    throw new DesignRunReportError("figmaFile.fileKey is required to build a Design Run Report.");
  }

  return {
    fileKey,
    name: name || "Figma File",
    url: url || figmaFileUrl(fileKey, name || "Figma File")
  };
}

function collectScreenshots(input) {
  return [
    ...arrayify(input.screenshots),
    ...arrayify(input.screenshotReport?.screenshots),
    ...arrayify(input.screenshotReport?.captures),
    ...arrayify(input.reportPatch?.screenshots)
  ];
}

function normalizeScreenshots(screenshots, context) {
  return dedupeBy(
    screenshots
      .map((screenshot, index) => {
        const node = normalizeNodeRef(screenshot.node ?? screenshot.targetNode ?? screenshot, context.figmaFile);
        if (!node) {
          return null;
        }

        return {
          id: stringValue(screenshot.id ?? screenshot.screenshotId ?? `shot-${index + 1}`),
          node,
          path: stringValue(screenshot.path ?? screenshot.filePath ?? screenshot.localPath),
          url: optionalString(screenshot.url),
          capturedAt: toIsoTimestamp(screenshot.capturedAt ?? screenshot.createdAt ?? context.generatedAt),
          purpose: screenshotPurposes.has(screenshot.purpose) ? screenshot.purpose : "review",
          theme: optionalString(screenshot.theme),
          mode: optionalString(screenshot.mode),
          dimensions: normalizeDimensions(screenshot.dimensions ?? screenshot)
        };
      })
      .filter((screenshot) => screenshot?.id && screenshot.path),
    (screenshot) => screenshot.id
  ).sort(compareById);
}

function normalizeScreens(explicitScreens, context) {
  const screens = arrayify(explicitScreens).map((screen, index) =>
    normalizeScreen(screen, index, context)
  );

  if (screens.length === 0) {
    for (const [index, node] of rootGeneratedNodes(context.generatedOutput).entries()) {
      screens.push(normalizeScreen(screenFromGeneratedNode(node, context.generatedOutput), index, context));
    }
  }

  return screens.filter(Boolean).sort(compareById);
}

function normalizeScreen(screen, index, context) {
  const node = normalizeNodeRef(screen.node ?? screen, context.figmaFile);
  if (!node) {
    return null;
  }

  const descendantIds = context.screenContext.descendantsByRootId.get(node.nodeId) ?? new Set([node.nodeId]);
  const screenshotIds = uniqueStrings([
    ...arrayify(screen.screenshotIds),
    ...context.screenshots
      .filter((screenshot) => descendantIds.has(screenshot.node.nodeId))
      .map((screenshot) => screenshot.id)
  ]);
  const validationIssueIds = uniqueStrings([
    ...arrayify(screen.validationIssueIds),
    ...context.validation.issues
      .filter((issue) => issueTouchesAnyNode(issue, descendantIds))
      .map((issue) => issue.id)
  ]);
  const status = reportStatuses.has(screen.status)
    ? screen.status
    : validationIssueIds.length > 0
      ? "needs_iteration"
      : "passed";

  return {
    id: stringValue(screen.id ?? screen.screenId ?? screen.targetId ?? node.nodeId ?? `screen-${index + 1}`),
    node,
    status,
    briefReference: optionalString(screen.briefReference ?? screen.brief ?? context.generatedOutput.brief?.description ?? context.generatedOutput.brief?.title ?? context.generatedOutput.brief),
    screenshotIds,
    validationIssueIds
  };
}

function screenFromGeneratedNode(node, generatedOutput) {
  return {
    id: generatedOutput.target?.targetId ?? slugify(node.name),
    node,
    briefReference:
      generatedOutput.brief?.description ??
      generatedOutput.brief?.title ??
      generatedOutput.brief
  };
}

function buildScreenContext(generatedOutput) {
  const descendantsByRootId = new Map();
  for (const root of rootGeneratedNodes(generatedOutput)) {
    const descendants = new Set();
    walkNodes(root, (node) => descendants.add(node.nodeId ?? node.id));
    descendants.delete(undefined);
    descendantsByRootId.set(root.nodeId ?? root.id, descendants);
  }
  return { descendantsByRootId };
}

function rootGeneratedNodes(generatedOutput = {}) {
  return arrayify(generatedOutput.design?.nodes ?? generatedOutput.nodes ?? generatedOutput.screens)
    .filter((node) => node?.nodeId || node?.id);
}

function collectComponents(input, generatedOutput) {
  return [
    ...arrayify(generatedOutput.componentsUsed),
    ...arrayify(input.componentsUsed),
    ...arrayify(input.reportPatch?.componentsUsed)
  ];
}

function normalizeComponentUsage(components, context) {
  const operationUsage = collectComponentUsageFromOperations(context.generatedOutput.operations, context.figmaFile);
  const usageByKey = new Map();

  for (const [key, usage] of operationUsage) {
    usageByKey.set(key, usage);
  }

  for (const component of components) {
    const componentKey = stringValue(component.componentKey ?? component.key);
    if (!componentKey) {
      continue;
    }

    const existing = usageByKey.get(componentKey);
    const base = {
      componentKey,
      name: stringValue(component.name) || componentKey,
      source: normalizeComponentSource(component.source),
      componentSetKey: optionalString(component.componentSetKey),
      variant: objectOrUndefined(component.variant ?? component.variantProperties),
      propertiesConfigured: objectOrUndefined(component.propertiesConfigured),
      usageCount: Number.isInteger(component.usageCount)
        ? component.usageCount
        : normalizeNodeRefs(component.instanceNodes, context.figmaFile).length,
      instanceNodes: normalizeNodeRefs(component.instanceNodes, context.figmaFile)
    };

    usageByKey.set(componentKey, mergeComponentUsage(existing, base, context.figmaFile));
  }

  return [...usageByKey.values()]
    .map((usage) => ({
      ...usage,
      usageCount: Math.max(usage.usageCount, usage.instanceNodes.length, 1),
      instanceNodes: usage.instanceNodes.length > 0
        ? usage.instanceNodes
        : normalizeNodeRefs([{ nodeId: usage.componentKey, name: usage.name, type: "COMPONENT" }], context.figmaFile)
    }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.componentKey.localeCompare(right.componentKey));
}

function collectComponentUsageFromOperations(operations, figmaFile) {
  const usageByKey = new Map();
  const nodeToComponentKey = new Map();

  for (const operation of arrayify(operations)) {
    if (operation.type !== "place_instance" && operation.type !== "fill_slot") {
      continue;
    }

    const component = operation.component;
    const componentKey = stringValue(component?.componentKey ?? component?.key);
    const node = normalizeNodeRef(operation.node ?? operation.childNode, figmaFile);
    if (!componentKey || !node) {
      continue;
    }

    nodeToComponentKey.set(node.nodeId, componentKey);
    usageByKey.set(
      componentKey,
      mergeComponentUsage(usageByKey.get(componentKey), {
        componentKey,
        name: stringValue(component.name) || componentKey,
        source: normalizeComponentSource(component.source),
        componentSetKey: optionalString(component.componentSetKey ?? operation.componentSet?.key),
        variant: objectOrUndefined(component.variant ?? component.variantProperties),
        propertiesConfigured: undefined,
        usageCount: 1,
        instanceNodes: [node]
      }, figmaFile)
    );
  }

  for (const operation of arrayify(operations)) {
    if (operation.type !== "set_instance_component_property") {
      continue;
    }

    const nodeId = operation.node?.nodeId ?? operation.nodeId;
    const componentKey = nodeToComponentKey.get(nodeId);
    const usage = usageByKey.get(componentKey);
    if (!usage || !operation.propertyName) {
      continue;
    }

    usage.propertiesConfigured = {
      ...(usage.propertiesConfigured ?? {}),
      [operation.propertyName]: operation.value
    };
  }

  return usageByKey;
}

function mergeComponentUsage(left, right, figmaFile) {
  if (!left) {
    return withoutUndefined({
      ...right,
      instanceNodes: dedupeBy(right.instanceNodes, (node) => node.nodeId).sort(compareNodeRef)
    });
  }

  return withoutUndefined({
    componentKey: left.componentKey,
    name: left.name || right.name,
    source: left.source ?? right.source,
    componentSetKey: left.componentSetKey ?? right.componentSetKey,
    variant: left.variant ?? right.variant,
    propertiesConfigured: objectOrUndefined({
      ...(left.propertiesConfigured ?? {}),
      ...(right.propertiesConfigured ?? {})
    }),
    usageCount: (left.usageCount ?? 0) + (right.usageCount ?? 0),
    instanceNodes: dedupeBy(
      [...normalizeNodeRefs(left.instanceNodes, figmaFile), ...normalizeNodeRefs(right.instanceNodes, figmaFile)],
      (node) => node.nodeId
    ).sort(compareNodeRef)
  });
}

function collectVariables(input, generatedOutput) {
  return [
    ...arrayify(generatedOutput.variables?.references),
    ...arrayify(generatedOutput.variablesUsed),
    ...arrayify(input.variablesUsed),
    ...arrayify(input.reportPatch?.variablesUsed)
  ];
}

function normalizeVariableUsage(variables, context) {
  const bindingsByVariableId = collectVariableBindings(context.generatedOutput.finalBindings, context.figmaFile);
  const usageById = new Map();

  for (const variable of variables) {
    const variableId = stringValue(variable.variableId ?? variable.id);
    if (!variableId) {
      continue;
    }

    const boundNodes = dedupeBy(
      [
        ...normalizeNodeRefs(variable.boundNodes, context.figmaFile),
        ...arrayify(bindingsByVariableId.get(variableId))
      ],
      (node) => node.nodeId
    ).sort(compareNodeRef);
    const existing = usageById.get(variableId);
    const next = withoutUndefined({
      variableId,
      variableKey: optionalString(variable.variableKey ?? variable.key),
      name: stringValue(variable.name ?? variable.variableName) || variableId,
      collection: stringValue(variable.collection ?? variable.collectionName ?? variable.collectionId) || "Unknown",
      mode: optionalString(variable.mode ?? variable.resolvedModeName),
      level: normalizeVariableLevel(variable.level ?? variable.role ?? variable.name),
      resolvedType: normalizeResolvedType(variable.resolvedType ?? variable.type),
      aliasChain: normalizeAliasChain(variable.aliasChain),
      usageCount: Math.max(integerAtLeast(variable.usageCount, 1), boundNodes.length, 1),
      boundNodes
    });

    usageById.set(variableId, existing ? mergeVariableUsage(existing, next) : next);
  }

  return [...usageById.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function collectVariableBindings(finalBindings, figmaFile) {
  const bindingsByVariableId = new Map();

  for (const binding of arrayify(finalBindings)) {
    const variableId = stringValue(binding.variableId ?? binding.variable?.variableId);
    const node = normalizeNodeRef(binding.node ?? binding, figmaFile);
    if (!variableId || !node) {
      continue;
    }

    if (!bindingsByVariableId.has(variableId)) {
      bindingsByVariableId.set(variableId, []);
    }
    bindingsByVariableId.get(variableId).push(node);
  }

  return bindingsByVariableId;
}

function mergeVariableUsage(left, right) {
  return withoutUndefined({
    variableId: left.variableId,
    variableKey: left.variableKey ?? right.variableKey,
    name: left.name || right.name,
    collection: left.collection || right.collection,
    mode: left.mode ?? right.mode,
    level: left.level ?? right.level,
    resolvedType: left.resolvedType ?? right.resolvedType,
    aliasChain: uniqueStrings([...(left.aliasChain ?? []), ...(right.aliasChain ?? [])]),
    usageCount: (left.usageCount ?? 0) + (right.usageCount ?? 0),
    boundNodes: dedupeBy([...(left.boundNodes ?? []), ...(right.boundNodes ?? [])], (node) => node.nodeId)
      .sort(compareNodeRef)
  });
}

function collectGaps(input, generatedOutput) {
  return [
    ...arrayify(generatedOutput.designSystemGaps),
    ...arrayify(input.designSystemGaps),
    ...arrayify(input.gaps),
    ...arrayify(input.reportPatch?.designSystemGaps)
  ];
}

function normalizeDesignSystemGaps(gaps, context) {
  return dedupeBy(
    gaps.map((gap, index) => normalizeDesignSystemGap(gap, index, context)).filter(Boolean),
    (gap) => gap.id
  ).sort(compareById);
}

function normalizeDesignSystemGap(gap, index, context) {
  const id = stringValue(gap.id ?? gap.gapId ?? `gap-${index + 1}`);
  const category = normalizeGapCategory(gap.category, gap.requirement);
  const status = normalizeGapStatus(gap.status);
  const searchedAlternatives = normalizeSearchedAlternatives(
    gap.searchedAlternatives ?? gap.closestMatches,
    context.figmaFile
  );

  return withoutUndefined({
    id,
    category,
    severity: normalizeGapSeverity(gap.severity),
    status,
    summary: stringValue(gap.summary) || `Missing Design System capability: ${gap.requirement ?? id}.`,
    neededCapability: stringValue(gap.neededCapability ?? gap.requirement ?? gap.capability) || id,
    searchedAlternatives,
    impact:
      stringValue(gap.impact ?? gap.whyExistingAssetsDoNotSatisfy) ||
      "The generated design cannot use an approved Design System capability for this requirement.",
    relatedNodes: normalizeNodeRefs(gap.relatedNodes, context.figmaFile),
    provisionalExtensionId: optionalString(gap.provisionalExtensionId ?? gap.extensionId),
    recommendedDesignSystemAction: optionalString(
      gap.recommendedDesignSystemAction ?? gap.nextAction ?? gap.proposedSmallestExtension
    )
  });
}

function normalizeSearchedAlternatives(alternatives, figmaFile) {
  const normalized = arrayify(alternatives).map((alternative, index) => withoutUndefined({
    name: stringValue(alternative.name ?? alternative.key ?? `Alternative ${index + 1}`),
    result: stringValue(alternative.result ?? alternative.reason ?? alternative.type) || "Checked during library search.",
    node: normalizeNodeRef(alternative.node ?? alternative, figmaFile)
  }));

  return normalized.length > 0
    ? normalized
    : [
        {
          name: "Discovered Design System assets",
          result: "No sufficient component, variant, variable, style, pattern, or slot was found."
        }
      ];
}

function collectProvisionalExtensions(input, generatedOutput) {
  return [
    ...arrayify(generatedOutput.provisionalExtensions),
    ...arrayify(input.provisionalExtensions),
    ...arrayify(input.reportPatch?.provisionalExtensions)
  ];
}

function normalizeProvisionalExtensions(extensions, context) {
  return dedupeBy(
    extensions.map((extension, index) => normalizeProvisionalExtension(extension, index, context)).filter(Boolean),
    (extension) => extension.id
  ).sort(compareById);
}

function normalizeProvisionalExtension(extension, index, context) {
  const id = stringValue(extension.id ?? extension.extensionId ?? `ext-${index + 1}`);
  const node = normalizeNodeRef(extension.node ?? extension, context.figmaFile);
  if (!node) {
    return null;
  }

  return withoutUndefined({
    id,
    gapId: stringValue(extension.gapId ?? extension.designSystemGapId) || `gap-${id}`,
    status: extensionStatuses.has(extension.status) ? extension.status : "proposed",
    approval: normalizeApproval(extension.approval),
    proposal: stringValue(extension.proposal ?? extension.proposedSmallestExtension) || "Propose the smallest compliant provisional extension.",
    node,
    provisionalMarking:
      stringValue(extension.provisionalMarking) ||
      "Node name or annotation marks this output as Provisional.",
    variableChain: normalizeVariableChain(extension.variableChain),
    usedByNodes: normalizeNodeRefs(extension.usedByNodes, context.figmaFile),
    promotionRecommendation:
      stringValue(extension.promotionRecommendation ?? extension.recommendedDesignSystemAction) ||
      "Review with the Design System owner before promotion."
  });
}

function normalizeApproval(approval = {}) {
  return withoutUndefined({
    required: approval.required !== false,
    granted: approval.granted === true,
    approvedBy: optionalString(approval.approvedBy),
    approvedAt: approval.approvedAt ? toIsoTimestamp(approval.approvedAt) : undefined
  });
}

function normalizeVariableChain(chain) {
  const normalized = arrayify(chain)
    .map((entry) => withoutUndefined({
      level: normalizeVariableLevel(entry.level ?? entry.role ?? entry.variableName),
      variableName: stringValue(entry.variableName ?? entry.name ?? entry.variableId),
      variableId: optionalString(entry.variableId ?? entry.id),
      aliasesTo: optionalString(entry.aliasesTo)
    }))
    .filter((entry) => variableLevels.has(entry.level) && entry.variableName);

  return normalized.length > 0
    ? normalized
    : [{ level: "component", variableName: "component/provisional/value" }];
}

function normalizeIterationNotes(notes, context) {
  return arrayify(notes)
    .map((note, index) => withoutUndefined({
      id: stringValue(note.id ?? note.noteId ?? `note-${index + 1}`),
      iteration: Number.isInteger(note.iteration) ? note.iteration : 0,
      createdAt: toIsoTimestamp(note.createdAt ?? context.generatedAt),
      authorRole: authorRoles.has(note.authorRole) ? note.authorRole : "codex",
      category: iterationCategories.has(note.category) ? note.category : "other",
      note: stringValue(note.note ?? note.message ?? note.summary),
      relatedValidationIssueIds: uniqueStrings(note.relatedValidationIssueIds),
      relatedGapIds: uniqueStrings(note.relatedGapIds),
      relatedProvisionalExtensionIds: uniqueStrings(note.relatedProvisionalExtensionIds),
      nextAction: optionalString(note.nextAction)
    }))
    .filter((note) => note.id && note.note)
    .sort(compareById);
}

function normalizeReportStatus(explicitStatus, context) {
  if (reportStatuses.has(explicitStatus)) {
    return explicitStatus;
  }

  const generatedStatus = String(context.generatedStatus ?? "");
  if (generatedStatus === "blocked" || generatedStatus.includes("requires_provisional_extension")) {
    return "blocked";
  }

  if (context.validation.status === "failed") {
    return context.screens.length > 0 ? "needs_iteration" : "failed";
  }

  if (
    context.designSystemGaps.some((gap) => gap.status !== "resolved" && gap.status !== "rejected") ||
    context.provisionalExtensions.some((extension) => extension.status !== "removed" && extension.status !== "rejected") ||
    context.iterationNotes.length > 0
  ) {
    return "needs_iteration";
  }

  return "passed";
}

function normalizeNodeRefs(nodes, figmaFile) {
  return arrayify(nodes).map((node) => normalizeNodeRef(node, figmaFile)).filter(Boolean);
}

function normalizeNodeRef(node, figmaFile) {
  const nodeId = stringValue(node?.nodeId ?? node?.node_id ?? node?.id);
  if (!nodeId) {
    return null;
  }

  return {
    nodeId,
    name: stringValue(node.name ?? node.nodeName) || nodeId,
    type: optionalString(node.type ?? node.nodeType),
    url: stringValue(node.url) || figmaNodeUrl(figmaFile, nodeId)
  };
}

function issueTouchesAnyNode(issue, nodeIds) {
  const issueNodeIds = [
    issue.node?.nodeId,
    ...arrayify(issue.relatedNodes).map((node) => node.nodeId)
  ].filter(Boolean);
  return issueNodeIds.some((nodeId) => nodeIds.has(nodeId));
}

function walkNodes(node, visit) {
  visit(node);
  for (const child of arrayify(node.children)) {
    walkNodes(child, visit);
  }
}

function normalizeComponentSource(source) {
  return source === "local" || source === "provisional" ? source : "library";
}

function normalizeVariableLevel(value) {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");

  if (variableLevels.has(normalized)) {
    return normalized;
  }

  if (normalized.includes("primitive")) return "primitive";
  if (normalized.includes("semantic")) return "semantic";
  return "component";
}

function normalizeResolvedType(value) {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace("float", "number")
    .replace("color", "color");

  return ["color", "number", "string", "boolean"].includes(normalized) ? normalized : undefined;
}

function normalizeAliasChain(aliasChain) {
  const chain = arrayify(aliasChain)
    .map((entry) => stringValue(entry.name ?? entry.variableName ?? entry.variableId ?? entry.id ?? entry))
    .filter(Boolean);
  return chain.length > 0 ? chain : undefined;
}

function normalizeGapCategory(category, requirement) {
  const normalized = String(category ?? requirement ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

  if (gapCategories.has(normalized)) {
    return normalized;
  }

  if (normalized.includes("component") || normalized.includes("asset")) return "component";
  if (normalized.includes("variant")) return "variant";
  if (normalized.includes("slot")) return "slot";
  if (normalized.includes("variable") || normalized.includes("token")) return "variable";
  if (normalized.includes("style")) return "style";
  if (normalized.includes("pattern")) return "pattern";
  if (normalized.includes("layout")) return "layout";
  if (normalized.includes("access")) return "accessibility";
  return "other";
}

function normalizeGapStatus(status) {
  if (gapStatuses.has(status)) {
    return status;
  }

  if (status === "provisional_extension_requested") {
    return "provisional_extension_proposed";
  }

  return "open";
}

function normalizeGapSeverity(severity) {
  return ["critical", "high", "medium", "low"].includes(severity) ? severity : "medium";
}

function normalizeDimensions(value = {}) {
  const width = Number(value.width);
  const height = Number(value.height);
  return Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0
    ? { width, height }
    : undefined;
}

function objectOrUndefined(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length === 0) {
    return undefined;
  }
  return value;
}

function integerAtLeast(value, minimum) {
  return Number.isInteger(value) && value >= minimum ? value : minimum;
}

function uniqueStrings(values) {
  return [...new Set(arrayify(values).map(stringValue).filter(Boolean))].sort();
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

function compareById(left, right) {
  return left.id.localeCompare(right.id);
}

function compareNodeRef(left, right) {
  return left.nodeId.localeCompare(right.nodeId);
}

function optionalString(value) {
  const serialized = stringValue(value);
  return serialized || undefined;
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
    .replace(/^-+|-+$/g, "") || "screen";
}

function arrayify(value) {
  return Array.isArray(value) ? value : [];
}

function toIsoTimestamp(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function figmaFileUrl(fileKey, name) {
  return `https://www.figma.com/file/${encodeURIComponent(fileKey)}/${slugify(name)}`;
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

function withoutUndefined(value) {
  return JSON.parse(JSON.stringify(value));
}
