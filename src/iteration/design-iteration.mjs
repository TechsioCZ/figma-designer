const schemaVersion = "1.0.0";
const kind = "figma-design-iteration-plan";

const terminalIssueStatuses = new Set(["resolved", "waived"]);
const gapTerminalStatuses = new Set(["resolved", "rejected"]);
const gapApprovalStatuses = new Set(["provisional_extension_approved"]);
const extensionAppliedStatuses = new Set(["approved", "created"]);

const validationActionByCategory = new Map([
  ["contrast", "bind_existing_variable"],
  ["theme_mode", "verify_theme_mode_bindings"],
  ["raw_color", "bind_existing_variable"],
  ["raw_spacing", "bind_existing_spacing_variable"],
  ["raw_radius", "bind_existing_radius_variable"],
  ["raw_typography", "apply_existing_text_style"],
  ["broken_variable_alias", "repair_variable_alias_chain"],
  ["missing_variable_binding", "bind_existing_variable"],
  ["detached_component", "replace_with_library_instance"],
  ["invalid_slot_usage", "use_approved_slot_configuration"],
  ["component_property", "set_supported_component_property"],
  ["layout_hygiene", "apply_approved_layout_pattern"],
  ["prototype_dead_end", "connect_existing_prototype_target"],
  ["provisional_extension", "verify_provisional_extension_approval"],
  ["screenshot", "recapture_screenshot"]
]);

export class DesignIterationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DesignIterationError";
    this.details = details;
  }
}

export function planDesignIteration(input = {}, options = {}) {
  const report = normalizeReport(input);
  const generatedAt = toIsoTimestamp(options.now ?? input.now ?? new Date());
  const runId = options.runId ?? input.runId ?? report.runId ?? "figma-iteration-run";
  const iteration = normalizeIteration(options.iteration ?? input.iteration, report);
  const indexes = buildEvidenceIndexes(report, input);
  const actions = [];
  const notes = [];
  const skippedIssues = [];

  for (const issue of indexes.validationIssues) {
    if (terminalIssueStatuses.has(issue.status)) {
      skippedIssues.push({
        issueId: issue.id,
        status: issue.status,
        reason: `Validation issue is ${issue.status}; preserving existing review semantics.`
      });
      continue;
    }

    const action = validationIssueAction(issue, { runId, indexes });
    actions.push(action);
    notes.push(iterationNoteForAction(action, { iteration, generatedAt }));
  }

  for (const gap of indexes.gaps) {
    if (gapTerminalStatuses.has(gap.status) || actions.some((action) => action.evidence.gapIds.includes(gap.id))) {
      continue;
    }

    const action = gapAction(gap, { runId, indexes });
    if (action) {
      actions.push(action);
      notes.push(iterationNoteForAction(action, { iteration, generatedAt }));
    }
  }

  for (const screenshot of indexes.unreferencedScreenshots) {
    const action = screenshotAction(screenshot, { runId, indexes });
    actions.push(action);
    notes.push(iterationNoteForAction(action, { iteration, generatedAt }));
  }

  const summary = summarizePlan({ actions, notes, skippedIssues, indexes });

  return {
    kind,
    schemaVersion,
    mode: "plan_only",
    runId,
    generatedAt,
    status: planStatus(summary),
    strictComposition: {
      noDetach: true,
      noRawFinalValues: true,
      noUnapprovedProvisionalExtensions: true,
      provisionalExtensionsCreated: false,
      liveWritePerformed: false
    },
    summary,
    actions,
    skippedIssues,
    reportPatch: {
      iterationNotes: notes
    },
    iterationNotes: notes
  };
}

export const createDesignIterationPlan = planDesignIteration;
export const iterateDesign = planDesignIteration;

function normalizeReport(input) {
  if (input.report && typeof input.report === "object") {
    return input.report;
  }

  if (input.validation || input.screenshots || input.designSystemGaps || input.provisionalExtensions) {
    return input;
  }

  throw new DesignIterationError("planDesignIteration requires a Design Run Report or report-shaped input.");
}

function buildEvidenceIndexes(report, input) {
  const validationIssues = arrayify(report.validation?.issues ?? input.validationFailures ?? input.issues);
  const screens = arrayify(report.screens);
  const screenshots = arrayify(input.screenshots ?? report.screenshots);
  const gaps = mergeById(arrayify(report.designSystemGaps), arrayify(input.gapNotes ?? input.gaps));
  const provisionalExtensions = arrayify(report.provisionalExtensions);
  const componentsUsed = arrayify(report.componentsUsed);
  const variablesUsed = arrayify(report.variablesUsed);

  const screensByIssueId = new Map();
  const screenshotsByScreenId = new Map();
  const screenshotsByNodeId = new Map();
  const screenshotsById = new Map();
  const extensionsById = new Map(provisionalExtensions.map((extension) => [extension.id, extension]));
  const extensionsByGapId = new Map();
  const componentsByNodeId = new Map();
  const variablesByNodeId = new Map();

  for (const screen of screens) {
    for (const issueId of arrayify(screen.validationIssueIds)) {
      appendMap(screensByIssueId, issueId, screen);
    }
    for (const screenshotId of arrayify(screen.screenshotIds)) {
      appendMap(screenshotsByScreenId, screen.id, screenshotId);
    }
  }

  for (const screenshot of screenshots) {
    if (screenshot.id) {
      screenshotsById.set(screenshot.id, screenshot);
    }
    if (screenshot.node?.nodeId) {
      appendMap(screenshotsByNodeId, screenshot.node.nodeId, screenshot);
    }
  }

  for (const extension of provisionalExtensions) {
    if (extension.gapId) {
      appendMap(extensionsByGapId, extension.gapId, extension);
    }
  }

  for (const component of componentsUsed) {
    for (const node of arrayify(component.instanceNodes)) {
      appendMap(componentsByNodeId, node.nodeId, component);
    }
  }

  for (const variable of variablesUsed) {
    for (const node of arrayify(variable.boundNodes)) {
      appendMap(variablesByNodeId, node.nodeId, variable);
    }
  }

  const referencedScreenshotIds = new Set();
  for (const issue of validationIssues) {
    for (const screenshot of screenshotsForIssue(issue, { screensByIssueId, screenshotsByScreenId, screenshotsById, screenshotsByNodeId })) {
      referencedScreenshotIds.add(screenshot.id);
    }
  }

  return {
    validationIssues,
    screens,
    screenshots,
    gaps,
    provisionalExtensions,
    screensByIssueId,
    screenshotsByScreenId,
    screenshotsById,
    screenshotsByNodeId,
    extensionsById,
    extensionsByGapId,
    componentsByNodeId,
    variablesByNodeId,
    unreferencedScreenshots: screenshots.filter((screenshot) => screenshot.id && !referencedScreenshotIds.has(screenshot.id))
  };
}

function validationIssueAction(issue, context) {
  const evidence = evidenceForIssue(issue, context.indexes);
  const provisionalDecision = provisionalDecisionForIssue(issue, evidence, context.indexes);
  const baseType = validationActionByCategory.get(issue.category) ?? "repair_validation_issue";
  const type = provisionalDecision?.type ?? baseType;
  const status = provisionalDecision?.status ?? "approved";
  const instruction = provisionalDecision?.instruction ?? instructionForValidationIssue(issue, type, evidence);

  return action(context.runId, issue.id, {
    type,
    status,
    source: "validation",
    severity: issue.severity,
    evidence,
    rationale: issue.message,
    instruction,
    strictComposition: strictCompositionForAction(status)
  });
}

function gapAction(gap, context) {
  const evidence = evidenceForGap(gap, context.indexes);
  const extensions = evidence.provisionalExtensionIds
    .map((extensionId) => context.indexes.extensionsById.get(extensionId))
    .filter(Boolean);
  const approvedExtension = extensions.find(isExtensionApprovedForUse);

  if (approvedExtension || gapApprovalStatuses.has(gap.status)) {
    return action(context.runId, gap.id, {
      type: "use_approved_provisional_extension",
      status: approvedExtension ? "approved" : "blocked",
      source: "gap",
      severity: gap.severity,
      evidence,
      rationale: gap.summary,
      instruction: approvedExtension
        ? `Use only the approved provisional extension ${approvedExtension.id} and keep it visibly marked provisional.`
        : "Gap is marked approved but no granted provisional extension evidence is present; add approval evidence before applying it.",
      strictComposition: strictCompositionForAction(approvedExtension ? "approved" : "blocked")
    });
  }

  return action(context.runId, gap.id, {
    type: "request_provisional_extension_approval",
    status: "blocked",
    source: "gap",
    severity: gap.severity,
    evidence,
    rationale: gap.summary,
    instruction:
      "Do not create or apply provisional output. Ask the operator to approve the smallest extension, or keep the affected design portion blocked.",
    strictComposition: strictCompositionForAction("blocked")
  });
}

function screenshotAction(screenshot, context) {
  const evidence = {
    validationIssueIds: [],
    screenshotIds: [screenshot.id],
    gapIds: [],
    provisionalExtensionIds: [],
    nodes: uniqueNodes([screenshot.node])
  };

  return action(context.runId, screenshot.id, {
    type: "review_screenshot",
    status: "approved",
    source: "screenshot",
    severity: "info",
    evidence,
    rationale: `Review screenshot ${screenshot.id} for visual regressions before the next validation pass.`,
    instruction: "Use this screenshot as before-iteration evidence and recapture after approved actions are applied.",
    strictComposition: strictCompositionForAction("approved")
  });
}

function evidenceForIssue(issue, indexes) {
  const screens = indexes.screensByIssueId.get(issue.id) ?? [];
  const screenshots = screenshotsForIssue(issue, indexes);
  const nodeRefs = uniqueNodes([
    issue.node,
    ...arrayify(issue.relatedNodes),
    ...screens.map((screen) => screen.node),
    ...screenshots.map((screenshot) => screenshot.node)
  ]);
  const gapIds = uniqueStrings([
    issue.gapId,
    issue.designSystemGapId,
    ...arrayify(issue.relatedGapIds),
    ...gapsForNodes(nodeRefs, indexes).map((gap) => gap.id)
  ]);
  const provisionalExtensionIds = uniqueStrings([
    issue.provisionalExtensionId,
    ...arrayify(issue.relatedProvisionalExtensionIds),
    ...gapIds.flatMap((gapId) => arrayify(indexes.extensionsByGapId.get(gapId)).map((extension) => extension.id))
  ]);

  return {
    validationIssueIds: [issue.id],
    screenshotIds: uniqueStrings(screenshots.map((screenshot) => screenshot.id)),
    gapIds,
    provisionalExtensionIds,
    nodes: nodeRefs,
    componentKeys: uniqueStrings(componentsForNodes(nodeRefs, indexes).map((component) => component.componentKey ?? component.key)),
    variableIds: uniqueStrings(variablesForNodes(nodeRefs, indexes).map((variable) => variable.variableId))
  };
}

function evidenceForGap(gap, indexes) {
  const extensions = arrayify(indexes.extensionsByGapId.get(gap.id));
  return {
    validationIssueIds: [],
    screenshotIds: [],
    gapIds: [gap.id],
    provisionalExtensionIds: uniqueStrings([gap.provisionalExtensionId, ...extensions.map((extension) => extension.id)]),
    nodes: uniqueNodes([...arrayify(gap.relatedNodes), gap.node, ...extensions.map((extension) => extension.node)])
  };
}

function screenshotsForIssue(issue, indexes) {
  const screenshots = [];

  for (const screenshotId of arrayify(issue.screenshotIds ?? issue.relatedScreenshotIds)) {
    const screenshot = indexes.screenshotsById.get(screenshotId);
    if (screenshot) {
      screenshots.push(screenshot);
    }
  }

  for (const screen of indexes.screensByIssueId.get(issue.id) ?? []) {
    for (const screenshotId of indexes.screenshotsByScreenId.get(screen.id) ?? []) {
      const screenshot = indexes.screenshotsById.get(screenshotId);
      if (screenshot) {
        screenshots.push(screenshot);
      }
    }
  }

  if (issue.node?.nodeId) {
    screenshots.push(...arrayify(indexes.screenshotsByNodeId.get(issue.node.nodeId)));
  }

  return dedupeBy(screenshots.filter((screenshot) => screenshot?.id), (screenshot) => screenshot.id);
}

function provisionalDecisionForIssue(issue, evidence, indexes) {
  if (issue.category !== "provisional_extension" && evidence.provisionalExtensionIds.length === 0) {
    return undefined;
  }

  const extensions = evidence.provisionalExtensionIds
    .map((extensionId) => indexes.extensionsById.get(extensionId))
    .filter(Boolean);
  const approvedExtension = extensions.find(isExtensionApprovedForUse);

  if (approvedExtension) {
    return {
      type: "use_approved_provisional_extension",
      status: "approved",
      instruction: `Use only approved provisional extension ${approvedExtension.id}; keep the reported marking and variable chain intact.`
    };
  }

  return {
    type: "request_provisional_extension_approval",
    status: "blocked",
    instruction:
      "Do not create, apply, promote, or normalize provisional output until the report contains granted approval tied to the relevant gap."
  };
}

function instructionForValidationIssue(issue, type, evidence) {
  const recommendation = issue.recommendation ? `${issue.recommendation} ` : "";
  const contrastEvidence = issue.category === "contrast"
    ? `${issue.expected ? `Expected: ${issue.expected} ` : ""}${issue.actual ? `Actual: ${issue.actual} ` : ""}`
    : "";
  const nodeText = evidence.nodes.length > 0
    ? `Target ${evidence.nodes.map((node) => `${node.name} (${node.nodeId})`).join(", ")}.`
    : "Target the affected Figma nodes recorded by validation.";

  return `${recommendation}${contrastEvidence}${nodeText} Use existing library assets, supported component properties, approved slots, styles, variables, and patterns only.`;
}

function iterationNoteForAction(actionEntry, { iteration, generatedAt }) {
  const note = {
    id: `note-${actionEntry.actionId}`,
    iteration,
    createdAt: generatedAt,
    authorRole: "codex",
    category: noteCategoryForAction(actionEntry),
    note: actionEntry.rationale,
    nextAction: actionEntry.instruction
  };

  if (actionEntry.evidence.validationIssueIds.length > 0) {
    note.relatedValidationIssueIds = actionEntry.evidence.validationIssueIds;
  }
  if (actionEntry.evidence.gapIds.length > 0) {
    note.relatedGapIds = actionEntry.evidence.gapIds;
  }
  if (actionEntry.evidence.provisionalExtensionIds.length > 0) {
    note.relatedProvisionalExtensionIds = actionEntry.evidence.provisionalExtensionIds;
  }

  return note;
}

function noteCategoryForAction(actionEntry) {
  if (actionEntry.source === "gap") {
    return "gap";
  }
  if (actionEntry.source === "screenshot") {
    return "screenshot";
  }
  if (actionEntry.type.includes("provisional")) {
    return "provisional_extension";
  }
  return "validation";
}

function action(runId, evidenceId, fields) {
  return {
    actionId: `${runId}:iter-${stableSlug(fields.source)}-${stableSlug(evidenceId)}`,
    ...fields,
    approved: fields.status === "approved",
    liveWrite: false
  };
}

function strictCompositionForAction(status) {
  return {
    allowDetach: false,
    allowRawFinalValues: false,
    allowUnapprovedProvisionalExtension: false,
    requiresOperatorApproval: status !== "approved"
  };
}

function summarizePlan({ actions, notes, skippedIssues, indexes }) {
  return {
    openValidationIssueCount: indexes.validationIssues.filter((issue) => !terminalIssueStatuses.has(issue.status)).length,
    skippedValidationIssueCount: skippedIssues.length,
    approvedActionCount: actions.filter((entry) => entry.status === "approved").length,
    blockedActionCount: actions.filter((entry) => entry.status === "blocked").length,
    actionCount: actions.length,
    noteCount: notes.length,
    screenshotReferenceCount: uniqueStrings(actions.flatMap((entry) => entry.evidence.screenshotIds)).length,
    gapReferenceCount: uniqueStrings(actions.flatMap((entry) => entry.evidence.gapIds)).length,
    provisionalExtensionReferenceCount: uniqueStrings(actions.flatMap((entry) => entry.evidence.provisionalExtensionIds)).length,
    figmaNodeReferenceCount: uniqueStrings(actions.flatMap((entry) => entry.evidence.nodes.map((node) => node.nodeId))).length
  };
}

function planStatus(summary) {
  if (summary.blockedActionCount > 0) {
    return "blocked";
  }
  if (summary.actionCount > 0) {
    return "ready";
  }
  return "no_changes";
}

function normalizeIteration(iteration, report) {
  if (Number.isInteger(iteration) && iteration >= 0) {
    return iteration;
  }

  const priorIterations = arrayify(report.iterationNotes)
    .map((note) => note.iteration)
    .filter((value) => Number.isInteger(value));

  return priorIterations.length > 0 ? Math.max(...priorIterations) + 1 : 1;
}

function mergeById(...lists) {
  const byId = new Map();
  const merged = [];

  for (const item of lists.flat()) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const id = item.id ?? item.gapId;
    if (!id) {
      merged.push(item);
      continue;
    }
    if (byId.has(id)) {
      Object.assign(byId.get(id), item);
      continue;
    }
    const clone = { ...item, id };
    byId.set(id, clone);
    merged.push(clone);
  }

  return merged;
}

function gapsForNodes(nodes, indexes) {
  const nodeIds = new Set(nodes.map((node) => node.nodeId).filter(Boolean));
  return indexes.gaps.filter((gap) =>
    arrayify(gap.relatedNodes ?? gap.nodes)
      .concat(gap.node ? [gap.node] : [])
      .some((node) => nodeIds.has(node.nodeId))
  );
}

function componentsForNodes(nodes, indexes) {
  return nodes.flatMap((node) => arrayify(indexes.componentsByNodeId.get(node.nodeId)));
}

function variablesForNodes(nodes, indexes) {
  return nodes.flatMap((node) => arrayify(indexes.variablesByNodeId.get(node.nodeId)));
}

function isExtensionApprovedForUse(extension = {}) {
  return extensionAppliedStatuses.has(extension.status) &&
    extension.approval?.required === true &&
    extension.approval?.granted === true;
}

function appendMap(map, key, value) {
  if (!key) {
    return;
  }
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function uniqueNodes(nodes) {
  return dedupeBy(nodes.filter((node) => node?.nodeId), (node) => node.nodeId).map((node) => ({
    nodeId: node.nodeId,
    name: node.name ?? node.nodeId,
    type: node.type,
    url: node.url
  }));
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function arrayify(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function toIsoTimestamp(value) {
  if (typeof value === "string") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new DesignIterationError("Invalid iteration timestamp.", { value });
    }
    return date.toISOString();
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  throw new DesignIterationError("Invalid iteration timestamp.", { value });
}

function stableSlug(value) {
  return String(value ?? "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72) || "item";
}
