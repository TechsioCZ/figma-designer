import { createHash } from "node:crypto";

const schemaVersion = "1.0.0";
const logKind = "design-system-gap-log";
const recordKind = "design-system-gap-record";

const reportCategories = new Set([
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

const statusRank = new Map([
  ["open", 1],
  ["provisional_extension_proposed", 2],
  ["provisional_extension_approved", 3],
  ["resolved", 4],
  ["rejected", 5]
]);

const approvalRank = new Map([
  ["not_required", 1],
  ["pending", 2],
  ["approved", 3],
  ["rejected", 4]
]);

export class GapLogError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "GapLogError";
    this.details = details;
  }
}

export function createDesignSystemGapLog(input = {}, options = {}) {
  const records = mergeDesignSystemGapRecords(collectGapInputs(input, options), options);
  const generatedAt = toIsoTimestamp(options.now ?? input.generatedAt ?? new Date());

  return {
    kind: logKind,
    schemaVersion,
    runId: options.runId ?? input.runId ?? input.report?.runId ?? input.plan?.runId,
    generatedAt,
    summary: summarizeRecords(records),
    records
  };
}

export function normalizeDesignSystemGaps(input = {}, options = {}) {
  return mergeDesignSystemGapRecords(collectGapInputs(input, options), options);
}

export function normalizeDesignSystemGap(gap, context = {}, options = {}) {
  if (!gap || typeof gap !== "object" || Array.isArray(gap)) {
    throw new GapLogError("A Design System Gap must be an object.", {
      receivedType: Array.isArray(gap) ? "array" : typeof gap
    });
  }

  const source = normalizeSource(context.source ?? gap.source, gap, context);
  const category = normalizeCategory(gap.category ?? gap.kind ?? gap.type ?? gap.code);
  const originalCategory = stringValue(gap.category ?? gap.kind ?? gap.type ?? gap.code) || undefined;
  const neededCapability = requiredText(
    gap.neededCapability ??
      gap.requirement ??
      gap.blockedRequirement ??
      gap.expected ??
      gap.message ??
      gap.summary,
    "neededCapability"
  );
  const missingName = stringValue(
    gap.requirement ??
      gap.missingAsset ??
      gap.missingPattern ??
      gap.name ??
      gap.componentName ??
      gap.affectedComponent?.name ??
      neededCapability
  );
  const summary =
    optionalText(gap.summary) ??
    summaryForGap({ category, originalCategory, missingName, neededCapability, gap });
  const searchedAlternatives = normalizeSearchedAlternatives(gap, context);
  const evidence = normalizeEvidence(gap, {
    category,
    missingName,
    neededCapability,
    searchedAlternatives
  });
  const relatedNodes = normalizeRelatedNodes(gap, context);
  const provisionalExtensionId = optionalText(
    gap.provisionalExtensionId ?? gap.extensionId ?? gap.provisionalExtension?.id
  );
  const approval = normalizeApproval(gap, { provisionalExtensionId });
  const status = normalizeStatus(gap.status, { approval, provisionalExtensionId });
  const impact =
    optionalText(gap.impact) ??
    `The required capability "${neededCapability}" cannot be completed with the currently approved Design System assets.`;
  const proposedSmallestExtension =
    optionalText(gap.proposedSmallestExtension ?? gap.proposedExtension ?? gap.recommendation) ??
    `Review the smallest approved Design System extension needed for "${neededCapability}" before any implementation.`;
  const dedupeKey = stableDedupeKey({
    category,
    neededCapability,
    missingName,
    originalCategory,
    explicitKey: gap.dedupeKey ?? gap.key,
    options
  });

  return withoutUndefined({
    kind: recordKind,
    schemaVersion,
    id: optionalText(gap.id ?? gap.gapId) ?? stableId(dedupeKey),
    dedupeKey,
    source,
    sources: [source],
    category,
    originalCategory,
    severity: normalizeSeverity(gap.severity),
    status,
    summary,
    neededCapability,
    evidence,
    searchedAlternatives,
    impact,
    proposedSmallestExtension,
    approval,
    relatedFigmaNodes: relatedNodes,
    relatedNodes,
    provisionalExtensionId,
    recommendedDesignSystemAction:
      optionalText(gap.recommendedDesignSystemAction ?? gap.nextAction ?? gap.closestCompliantAction) ??
      "Review this gap through the Design System process before approving any extension.",
    promotion: {
      promotedToDesignSystem: false,
      state: "not_promoted",
      note: "Gap log records are evidence only and do not promote assets, patterns, or provisional output into the Design System."
    }
  });
}

export function mergeDesignSystemGapRecords(gaps = [], options = {}) {
  const mergedByKey = new Map();
  const orderedKeys = [];

  for (const entry of gaps) {
    const record = entry?.kind === recordKind
      ? entry
      : normalizeDesignSystemGap(entry.gap ?? entry, entry.context ?? {}, options);
    const existing = mergedByKey.get(record.dedupeKey);

    if (!existing) {
      mergedByKey.set(record.dedupeKey, record);
      orderedKeys.push(record.dedupeKey);
      continue;
    }

    mergedByKey.set(record.dedupeKey, mergeRecords(existing, record));
  }

  return orderedKeys.map((key) => mergedByKey.get(key));
}

export function toReportDesignSystemGap(record) {
  const gap = record?.kind === recordKind ? record : normalizeDesignSystemGap(record);

  return withoutUndefined({
    id: gap.id,
    category: gap.category,
    severity: gap.severity,
    status: gap.status,
    summary: gap.summary,
    neededCapability: gap.neededCapability,
    searchedAlternatives: gap.searchedAlternatives,
    impact: gap.impact,
    relatedNodes: gap.relatedNodes,
    provisionalExtensionId: gap.provisionalExtensionId,
    recommendedDesignSystemAction: gap.recommendedDesignSystemAction
  });
}

export function toReportDesignSystemGaps(records = []) {
  return records.map((record) => toReportDesignSystemGap(record));
}

function collectGapInputs(input, options) {
  const collected = [];
  const rootContext = {
    figmaFile: options.figmaFile ?? input.figmaFile ?? input.report?.figmaFile,
    figmaFileUrl: options.figmaFileUrl ?? input.figmaFileUrl,
    fileKey: options.fileKey ?? input.fileKey
  };

  collectArray(input.gaps, collected, { ...rootContext, source: "gap-log-input" });
  collectArray(input.designSystemGaps, collected, { ...rootContext, source: "gap-log-input" });
  collectArray(input.report?.designSystemGaps, collected, {
    ...rootContext,
    source: "report",
    runId: input.report?.runId
  });
  collectArray(input.plan?.designSystemGaps, collected, {
    ...rootContext,
    source: "generator",
    runId: input.plan?.runId
  });
  collectArray(input.generator?.designSystemGaps, collected, {
    ...rootContext,
    source: "generator",
    runId: input.generator?.runId
  });
  collectArray(input.provisionalRuntime?.reportPatch?.designSystemGaps, collected, {
    ...rootContext,
    source: "provisional_runtime",
    runId: input.provisionalRuntime?.runId
  });
  collectArray(input.provisionalRuntime?.designSystemGaps, collected, {
    ...rootContext,
    source: "provisional_runtime",
    runId: input.provisionalRuntime?.runId
  });

  collectValidationGaps(input.validation, collected, {
    ...rootContext,
    source: "validator",
    runId: input.validation?.runId
  });

  return collected;
}

function collectArray(items, collected, context) {
  for (const gap of arrayify(items)) {
    if (gap && typeof gap === "object") {
      collected.push({ gap, context });
    }
  }
}

function collectValidationGaps(value, collected, context) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectValidationGaps(item, collected, context);
    }
    return;
  }

  const nextContext = {
    ...context,
    familyId: value.familyId ?? context.familyId,
    groupId: value.groupId ?? context.groupId
  };

  collectArray(value.designSystemGaps, collected, nextContext);
  collectArray(value.gaps, collected, nextContext);

  if (value.result) {
    collectValidationGaps(value.result, collected, nextContext);
  }

  if (value.validation && value.validation !== value) {
    collectValidationGaps(value.validation, collected, nextContext);
  }

  collectValidationGaps(value.familyResults, collected, nextContext);
  collectValidationGaps(value.groups, collected, nextContext);
}

function mergeRecords(existing, incoming) {
  const sources = dedupeObjects([...existing.sources, ...incoming.sources], sourceKey);
  const searchedAlternatives = dedupeObjects(
    [...existing.searchedAlternatives, ...incoming.searchedAlternatives],
    alternativeKey
  );
  const relatedNodes = dedupeObjects(
    [...existing.relatedNodes, ...incoming.relatedNodes],
    nodeKey
  );
  const status = higherRank(existing.status, incoming.status, statusRank);
  const approval = higherApproval(existing.approval, incoming.approval);

  return withoutUndefined({
    ...existing,
    id: existing.id,
    source: existing.source,
    sources,
    originalCategory: specificOriginalCategory(existing, incoming),
    severity: higherSeverity(existing.severity, incoming.severity),
    status,
    summary: longerText(existing.summary, incoming.summary),
    neededCapability: longerText(existing.neededCapability, incoming.neededCapability),
    evidence: mergeEvidence(existing.evidence, incoming.evidence),
    searchedAlternatives,
    impact: longerText(existing.impact, incoming.impact),
    proposedSmallestExtension: longerText(
      existing.proposedSmallestExtension,
      incoming.proposedSmallestExtension
    ),
    approval,
    relatedFigmaNodes: relatedNodes,
    relatedNodes,
    provisionalExtensionId: existing.provisionalExtensionId ?? incoming.provisionalExtensionId,
    recommendedDesignSystemAction: longerText(
      existing.recommendedDesignSystemAction,
      incoming.recommendedDesignSystemAction
    ),
    promotion: {
      promotedToDesignSystem: false,
      state: "not_promoted",
      note: "Gap log records are evidence only and do not promote assets, patterns, or provisional output into the Design System."
    }
  });
}

function specificOriginalCategory(existing, incoming) {
  const existingOriginal = existing.originalCategory;
  const incomingOriginal = incoming.originalCategory;

  if (existingOriginal && existingOriginal !== existing.category) {
    return existingOriginal;
  }

  if (incomingOriginal && incomingOriginal !== incoming.category) {
    return incomingOriginal;
  }

  return existingOriginal ?? incomingOriginal;
}

function normalizeSource(source, gap, context) {
  const type = sourceType(source);

  return withoutUndefined({
    type,
    runId: optionalText(context.runId ?? gap.runId),
    familyId: optionalText(context.familyId ?? gap.familyId),
    groupId: optionalText(context.groupId ?? gap.groupId),
    id: optionalText(gap.id ?? gap.gapId ?? gap.ruleId ?? gap.code)
  });
}

function sourceType(source) {
  const value = typeof source === "string" ? source : source?.type ?? source?.kind;

  if (!value) return "unknown";
  if (/generat|plan/.test(value)) return "generator";
  if (/validat|rule|component-integrity|spacing|layout/.test(value)) return "validator";
  if (/provisional|runtime/.test(value)) return "provisional_runtime";
  if (/report/.test(value)) return "report";

  return normalizeToken(value);
}

function normalizeCategory(value) {
  const token = normalizeToken(value);

  if (reportCategories.has(token)) {
    return token;
  }

  if (/variant/.test(token)) return "variant";
  if (/slot|nested/.test(token)) return "slot";
  if (/property|prop/.test(token)) return "component_property";
  if (/variable|token|binding|alias/.test(token)) return "variable";
  if (/mode|theme/.test(token)) return "mode";
  if (/style|typography|text/.test(token)) return "style";
  if (/pattern/.test(token)) return "pattern";
  if (/layout|spacing|gap|primitive|padding|margin/.test(token)) return "layout";
  if (/content|copy/.test(token)) return "content";
  if (/access|contrast|wcag|a11y/.test(token)) return "accessibility";
  if (/component|asset|detach|library/.test(token)) return "component";

  return "other";
}

function normalizeSeverity(value) {
  const token = normalizeToken(value);

  if (token === "critical") return "critical";
  if (token === "high" || token === "error") return "high";
  if (token === "low" || token === "info") return "low";

  return "medium";
}

function normalizeStatus(value, context) {
  const token = normalizeToken(value);

  if (statusRank.has(token)) {
    return token;
  }

  if (/reject|denied/.test(token)) return "rejected";
  if (/approved|created/.test(token)) return "provisional_extension_approved";
  if (/proposed|request|pending/.test(token) || context.provisionalExtensionId) {
    return "provisional_extension_proposed";
  }
  if (/resolv|closed/.test(token)) return "resolved";

  return "open";
}

function normalizeApproval(gap, context) {
  const approval = gap.approval ?? gap.decision;
  const required = Boolean(
    gap.approvalRequired ??
      approval?.required ??
      context.provisionalExtensionId ??
      /provisional_extension/.test(gap.status ?? "")
  );
  const granted = Boolean(approval?.granted ?? gap.approvalGranted);
  let state = "not_required";

  if (granted || /approved|created/.test(gap.status ?? "")) {
    state = "approved";
  } else if (approval?.granted === false && /reject/.test(gap.status ?? "")) {
    state = "rejected";
  } else if (required) {
    state = "pending";
  }

  return withoutUndefined({
    required,
    state,
    granted: state === "approved",
    approvedBy: optionalText(approval?.approvedBy ?? gap.approvedBy),
    approvedAt: optionalText(approval?.approvedAt ?? gap.approvedAt)
  });
}

function normalizeEvidence(gap, context) {
  const closestMatches = normalizeClosestMatches(gap.closestMatches ?? gap.matches);
  const why = optionalText(
    gap.whyExistingAssetsDoNotSatisfy ??
      gap.result ??
      gap.actual ??
      gap.closestCompliantAction
  );

  return withoutUndefined({
    missingAssetOrPattern: {
      kind: missingAssetKind(context.category),
      name: context.missingName,
      neededCapability: context.neededCapability
    },
    searchSummary:
      optionalText(gap.searchSummary ?? gap.liveLibrarySearch) ??
      "Checked available Design System assets, patterns, examples, variables, and approved alternatives.",
    whyExistingAssetsDoNotSatisfy:
      why ??
      "No searched Design System asset or approved pattern fully satisfies the needed capability.",
    closestMatches,
    searchedAlternativeCount: context.searchedAlternatives.length
  });
}

function normalizeSearchedAlternatives(gap, context) {
  const alternatives = [];

  for (const alternative of arrayify(gap.searchedAlternatives)) {
    if (!alternative || typeof alternative !== "object") {
      continue;
    }
    alternatives.push(normalizeAlternative(alternative, context));
  }

  for (const match of arrayify(gap.closestMatches ?? gap.matches)) {
    if (!match || typeof match !== "object") {
      continue;
    }
    alternatives.push(
      normalizeAlternative(
        {
          name: match.name ?? match.key ?? match.nodeId,
          result:
            gap.whyExistingAssetsDoNotSatisfy ??
            "Closest discovered asset does not fully satisfy the missing capability.",
          node: match.node ?? match
        },
        context
      )
    );
  }

  if (alternatives.length === 0) {
    alternatives.push({
      name: optionalText(gap.searchSummary ?? gap.liveLibrarySearch) ?? "Discovered Design System assets",
      result:
        optionalText(gap.whyExistingAssetsDoNotSatisfy ?? gap.closestCompliantAction) ??
        "No approved asset, pattern, or variable found for the required capability."
    });
  }

  return dedupeObjects(alternatives, alternativeKey);
}

function normalizeAlternative(alternative, context) {
  return withoutUndefined({
    name: requiredText(alternative.name ?? alternative.label ?? alternative.key, "searchedAlternatives.name"),
    result: requiredText(
      alternative.result ?? alternative.reason ?? alternative.summary ?? alternative.description,
      "searchedAlternatives.result"
    ),
    node: normalizeNodeRef(alternative.node ?? alternative, context)
  });
}

function normalizeClosestMatches(matches) {
  return arrayify(matches)
    .filter((match) => match && typeof match === "object")
    .map((match) =>
      withoutUndefined({
        key: optionalText(match.key),
        nodeId: optionalText(match.nodeId ?? match.id),
        name: optionalText(match.name),
        type: optionalText(match.type ?? match.kind)
      })
    );
}

function normalizeRelatedNodes(gap, context) {
  const nodes = [
    gap.node,
    ...arrayify(gap.relatedNodes),
    ...arrayify(gap.relatedFigmaNodes),
    ...arrayify(gap.usedByNodes)
  ]
    .map((node) => normalizeNodeRef(node, context))
    .filter(Boolean);

  if (!gap.node && (gap.nodeId || gap.nodeName)) {
    const node = normalizeNodeRef(
      {
        nodeId: gap.nodeId,
        name: gap.nodeName,
        type: gap.nodeType
      },
      context
    );
    if (node) {
      nodes.unshift(node);
    }
  }

  return dedupeObjects(nodes, nodeKey);
}

function normalizeNodeRef(node, context = {}) {
  if (!node || typeof node !== "object") {
    return null;
  }

  const nodeId = optionalText(node.nodeId ?? node.id);
  const name = optionalText(node.name ?? node.label ?? nodeId);

  if (!nodeId && !name) {
    return null;
  }

  return withoutUndefined({
    nodeId: nodeId ?? stableNodeId(name),
    name: name ?? nodeId,
    type: optionalText(node.type ?? node.kind),
    url: optionalText(node.url) ?? figmaNodeUrl(context, nodeId)
  });
}

function figmaNodeUrl(context, nodeId) {
  if (!nodeId) {
    return undefined;
  }

  const figmaFile = context.figmaFile;
  const fileUrl = figmaFile?.url ?? context.figmaFileUrl;
  const fileKey = figmaFile?.fileKey ?? context.fileKey;
  const normalizedNodeId = nodeId.replace(/:/g, "-");

  if (fileUrl) {
    try {
      const url = new URL(fileUrl);
      url.searchParams.set("node-id", normalizedNodeId);
      return url.toString();
    } catch {
      const separator = fileUrl.includes("?") ? "&" : "?";
      return `${fileUrl}${separator}node-id=${normalizedNodeId}`;
    }
  }

  return fileKey ? `https://www.figma.com/file/${fileKey}?node-id=${normalizedNodeId}` : undefined;
}

function summaryForGap({ category, originalCategory, missingName, neededCapability, gap }) {
  if (gap.message) {
    return stringValue(gap.message);
  }

  const subject = missingName || neededCapability;
  const noun = category === "pattern" ? "approved pattern" : "approved Design System asset";
  const original = originalCategory && originalCategory !== category ? ` (${originalCategory})` : "";

  return `Missing ${noun}${original} for ${subject}.`;
}

function missingAssetKind(category) {
  if (category === "pattern") return "pattern";
  if (category === "variable" || category === "mode" || category === "style") return category;
  if (category === "layout") return "layout_guidance";
  return "asset";
}

function stableDedupeKey({ category, neededCapability, missingName, originalCategory, explicitKey, options }) {
  if (options.preserveExplicitKeys && explicitKey) {
    return `dsgap:v1:${normalizeToken(explicitKey)}`;
  }

  return [
    "dsgap",
    "v1",
    category,
    normalizeToken(missingName),
    normalizeToken(neededCapability)
  ]
    .filter(Boolean)
    .join(":");
}

function stableId(dedupeKey) {
  return `gap-${createHash("sha256").update(dedupeKey).digest("hex").slice(0, 12)}`;
}

function stableNodeId(name) {
  return `node-${createHash("sha256").update(name).digest("hex").slice(0, 10)}`;
}

function summarizeRecords(records) {
  const byStatus = {};
  const byCategory = {};
  const approval = {
    required: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    notRequired: 0
  };

  for (const record of records) {
    byStatus[record.status] = (byStatus[record.status] ?? 0) + 1;
    byCategory[record.category] = (byCategory[record.category] ?? 0) + 1;

    if (record.approval.required) {
      approval.required += 1;
    }

    if (record.approval.state === "not_required") {
      approval.notRequired += 1;
    } else {
      approval[record.approval.state] += 1;
    }
  }

  return {
    gapCount: records.length,
    byStatus,
    byCategory,
    approval,
    promotedToDesignSystemCount: 0
  };
}

function mergeEvidence(existing, incoming) {
  return withoutUndefined({
    missingAssetOrPattern: existing.missingAssetOrPattern ?? incoming.missingAssetOrPattern,
    searchSummary: longerText(existing.searchSummary, incoming.searchSummary),
    whyExistingAssetsDoNotSatisfy: evidenceText(
      existing.whyExistingAssetsDoNotSatisfy,
      incoming.whyExistingAssetsDoNotSatisfy
    ),
    closestMatches: dedupeObjects(
      [...arrayify(existing.closestMatches), ...arrayify(incoming.closestMatches)],
      (match) => [match.key, match.nodeId, match.name].filter(Boolean).join(":")
    ),
    searchedAlternativeCount: Math.max(
      existing.searchedAlternativeCount ?? 0,
      incoming.searchedAlternativeCount ?? 0
    )
  });
}

function evidenceText(left, right) {
  const fallback =
    "No searched Design System asset or approved pattern fully satisfies the needed capability.";

  if (left === fallback) return right ?? left;
  if (right === fallback) return left ?? right;

  return longerText(left, right);
}

function higherApproval(left, right) {
  const state = higherRank(left.state, right.state, approvalRank);

  return withoutUndefined({
    required: Boolean(left.required || right.required),
    state,
    granted: state === "approved",
    approvedBy: left.approvedBy ?? right.approvedBy,
    approvedAt: left.approvedAt ?? right.approvedAt
  });
}

function higherRank(left, right, ranks) {
  return (ranks.get(right) ?? 0) > (ranks.get(left) ?? 0) ? right : left;
}

function higherSeverity(left, right) {
  const ranks = new Map([
    ["low", 1],
    ["medium", 2],
    ["high", 3],
    ["critical", 4]
  ]);

  return higherRank(left, right, ranks);
}

function longerText(left, right) {
  if (!left) return right;
  if (!right) return left;
  return right.length > left.length ? right : left;
}

function requiredText(value, field) {
  const text = optionalText(value);

  if (!text) {
    throw new GapLogError(`${field} is required for a Design System Gap record.`, { field });
  }

  return text;
}

function optionalText(value) {
  const text = stringValue(value);
  return text.length > 0 ? text : undefined;
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

  return JSON.stringify(value);
}

function normalizeToken(value) {
  return stringValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toIsoTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new GapLogError("A valid ISO timestamp is required.", { value });
  }

  return date.toISOString();
}

function arrayify(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function dedupeObjects(items, keyForItem) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const key = keyForItem(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function sourceKey(source) {
  return [source.type, source.runId, source.familyId, source.groupId, source.id]
    .filter(Boolean)
    .join(":");
}

function alternativeKey(alternative) {
  return [
    alternative.name,
    alternative.result,
    alternative.node?.nodeId
  ]
    .filter(Boolean)
    .join(":");
}

function nodeKey(node) {
  return node.nodeId ?? node.url ?? node.name;
}

function withoutUndefined(value) {
  if (Array.isArray(value)) {
    return value.map((item) => withoutUndefined(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, withoutUndefined(entry)])
  );
}
