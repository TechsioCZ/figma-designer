import { runRuleGroups } from "../rules/rule-loader.mjs";

const schemaVersion = "1.0.0";
const kind = "figma-validator-result";

const validationStatuses = new Set(["passed", "failed", "not_run"]);
const issueStatuses = new Set(["open", "resolved", "waived"]);
const severities = new Set(["critical", "error", "warning", "info"]);
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

export class ValidatorError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ValidatorError";
    this.details = details;
  }
}

export async function validateDesign(context = {}, options = {}) {
  const familyResults = [];
  const families = normalizeFamilies(
    options.validationFamilies ?? options.families ?? context.validationFamilies
  );
  const runOptions = {
    ...options,
    runId: options.runId ?? context.runId ?? context.design?.runId ?? context.report?.runId
  };

  for (const family of families) {
    familyResults.push(await runValidationFamily(family, context, runOptions));
  }

  if (shouldRunRuleLoader(context, options, families)) {
    familyResults.push(runRuleLoaderFamily(context, runOptions));
  }

  if (familyResults.length === 0 && context.validation) {
    return {
      kind,
      schemaVersion,
      runId: runOptions.runId,
      validation: serializeValidationResult(context.validation, context, options),
      familyResults: []
    };
  }

  const validation = serializeValidationResult(familyResults, context, options);

  return {
    kind,
    schemaVersion,
    runId: runOptions.runId,
    validation,
    familyResults
  };
}

export const runValidator = validateDesign;

export function serializeValidationResult(resultLike, context = {}, options = {}) {
  const issues = collectSerializedIssues(resultLike, context, options);
  const summary = summarizeIssues(issues);
  const status = explicitValidationStatus(resultLike, issues) ?? inferValidationStatus(summary, resultLike);

  return {
    status,
    summary,
    issues
  };
}

function normalizeFamilies(families) {
  if (!families) {
    return [];
  }

  if (Array.isArray(families)) {
    return families;
  }

  if (typeof families === "object") {
    return Object.entries(families).map(([id, family]) =>
      typeof family === "function" ? { id, validate: family } : { id, ...family }
    );
  }

  throw new ValidatorError("validationFamilies must be an array or object registry.", {
    receivedType: typeof families
  });
}

async function runValidationFamily(family, context, options) {
  const familyId = family.id ?? family.name ?? "validation-family";
  const validate = family.validate ?? family.run ?? family.evaluate;

  if (typeof family === "function") {
    return {
      familyId: family.name || "validation-family",
      result: await family(context, options)
    };
  }

  if (typeof validate !== "function") {
    throw new ValidatorError(`Validation family "${familyId}" does not expose validate, run, or evaluate.`, {
      familyId
    });
  }

  return {
    familyId,
    result: await validate(context, options)
  };
}

function shouldRunRuleLoader(context, options, families) {
  if (options.runRuleLoader === false || context.runRuleLoader === false) {
    return false;
  }

  return Boolean(
    options.runRuleLoader ||
      context.runRuleLoader ||
      options.ruleGroups ||
      context.ruleGroups ||
      options.selectedRuleGroups ||
      context.selectedRuleGroups ||
      (families.length === 0 && (options.useRuleLoader || context.useRuleLoader))
  );
}

function runRuleLoaderFamily(context, options) {
  try {
    const groups =
      options.ruleGroups ??
      context.ruleGroups ??
      options.selectedRuleGroups ??
      context.selectedRuleGroups;

    return {
      familyId: "rule-loader",
      result: runRuleGroups(context, {
        ...options,
        groups
      })
    };
  } catch (error) {
    return {
      familyId: "rule-loader",
      result: {
        status: "failed",
        issues: [
          {
            code: "RULE_LOADER_ERROR",
            category: "figma_setup",
            severity: "critical",
            message: error.message
          }
        ]
      }
    };
  }
}

function collectSerializedIssues(resultLike, context, options) {
  const rawIssues = collectRawIssues(resultLike);
  const usedIds = new Map();

  return rawIssues.map((entry, index) =>
    serializeIssue(entry.issue, {
      context,
      familyId: entry.familyId,
      groupId: entry.groupId,
      sourceKind: entry.sourceKind,
      index,
      usedIds,
      options
    })
  );
}

function collectRawIssues(resultLike) {
  if (!resultLike) {
    return [];
  }

  if (Array.isArray(resultLike)) {
    return resultLike.flatMap((item) => collectRawIssues(item));
  }

  if (resultLike.validation) {
    return collectRawIssues(resultLike.validation);
  }

  if (resultLike.result !== undefined || resultLike.familyId) {
    return collectFamilyIssues(resultLike);
  }

  return collectResultIssues(resultLike, {
    familyId: resultLike.familyId,
    groupId: resultLike.groupId
  });
}

function collectFamilyIssues(familyResult) {
  const result = familyResult.result ?? familyResult.validation ?? familyResult;

  if (result?.kind === "figma-rule-loader-result" && Array.isArray(result.groups)) {
    return result.groups.flatMap((group) =>
      collectResultIssues(group, {
        familyId: familyResult.familyId ?? "rule-loader",
        groupId: group.groupId
      })
    );
  }

  return collectResultIssues(result, {
    familyId: familyResult.familyId,
    groupId: familyResult.groupId
  });
}

function collectResultIssues(result, metadata = {}) {
  if (!result) {
    return [];
  }

  if (Array.isArray(result)) {
    return result.map((issue) => ({ ...metadata, sourceKind: "issue", issue }));
  }

  if (result.validation) {
    return collectResultIssues(result.validation, metadata);
  }

  return [
    ...arrayify(result.issues).map((issue) => ({ ...metadata, sourceKind: "issue", issue })),
    ...arrayify(result.violations).map((issue) => ({ ...metadata, sourceKind: "violation", issue })),
    ...arrayify(result.gaps).map((issue) => ({ ...metadata, sourceKind: "gap", issue })),
    ...arrayify(result.designSystemGaps).map((issue) => ({ ...metadata, sourceKind: "gap", issue }))
  ];
}

function serializeIssue(issue, metadata) {
  const code = stringValue(issue.code ?? issue.ruleId ?? issue.id ?? metadata.groupId ?? "validation_issue");
  const category = normalizeCategory(issue.category, code, issue, metadata);
  const severity = normalizeSeverity(issue.severity, metadata.sourceKind);
  const serialized = {
    id: uniqueIssueId(issue, code, metadata),
    code,
    category,
    severity,
    status: issueStatuses.has(issue.status) ? issue.status : "open",
    message: stringValue(issue.message ?? issue.summary ?? fallbackMessage(code, metadata))
  };
  const node = normalizeNodeRef(resolveIssueNode(issue), issue, metadata.context);
  const relatedNodes = normalizeRelatedNodes(issue, metadata.context);
  const expected = optionalString(issue.expected ?? issue.requirement);
  const actual = optionalString(issue.actual ?? issue.rawValue ?? issue.value);
  const recommendation = optionalString(
    issue.recommendation ??
      issue.closestCompliantAction ??
      issue.proposedExtension ??
      issue.proposedSmallestExtension
  );

  if (node) {
    serialized.node = node;
  }

  if (relatedNodes.length > 0) {
    serialized.relatedNodes = relatedNodes;
  }

  if (expected) {
    serialized.expected = expected;
  }

  if (actual) {
    serialized.actual = actual;
  }

  if (recommendation) {
    serialized.recommendation = recommendation;
  }

  return serialized;
}

function resolveIssueNode(issue) {
  return issue.node ?? {
    nodeId: issue.nodeId,
    name: issue.nodeName,
    type: issue.nodeType
  };
}

function normalizeRelatedNodes(issue, context) {
  return arrayify(issue.relatedNodes)
    .map((node) => normalizeNodeRef(node, {}, context))
    .filter(Boolean);
}

function normalizeNodeRef(node, issue, context) {
  const nodeId = stringValue(node?.nodeId ?? node?.id ?? issue.nodeId);

  if (!nodeId) {
    return null;
  }

  const url = node?.url ?? figmaNodeUrl(context, nodeId);

  if (!url) {
    return null;
  }

  return {
    nodeId,
    name: stringValue(node?.name ?? issue.nodeName ?? nodeId) || nodeId,
    ...(node?.type || issue.nodeType ? { type: stringValue(node?.type ?? issue.nodeType) } : {}),
    url
  };
}

function figmaNodeUrl(context, nodeId) {
  const figmaFile =
    context.figmaFile ??
    context.report?.figmaFile ??
    context.design?.figmaFile ??
    context.fixture?.figmaFile;
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

  if (fileKey) {
    return `https://www.figma.com/file/${fileKey}?node-id=${normalizedNodeId}`;
  }

  return null;
}

function uniqueIssueId(issue, code, metadata) {
  const explicitId =
    metadata.sourceKind === "gap" ? null : issue.id ?? issue.issueId ?? issue.validationIssueId;
  const nodeId = issue.node?.nodeId ?? issue.nodeId;
  const base =
    explicitId ??
    [
      "val",
      metadata.familyId,
      metadata.groupId,
      metadata.sourceKind,
      code,
      nodeId,
      metadata.index + 1
    ]
      .filter(Boolean)
      .join("-");
  const slug = slugify(base);
  const count = metadata.usedIds.get(slug) ?? 0;
  metadata.usedIds.set(slug, count + 1);

  return count === 0 ? slug : `${slug}-${count + 1}`;
}

function normalizeCategory(category, code, issue, metadata) {
  if (validationCategories.has(category)) {
    return category;
  }

  const text = `${code} ${issue.ruleId ?? ""} ${issue.kind ?? ""} ${issue.type ?? ""} ${issue.property ?? ""} ${issue.value ?? ""} ${issue.actual ?? ""} ${issue.message ?? ""} ${issue.relationship ?? ""} ${metadata.groupId ?? ""}`
    .toLowerCase()
    .replace(/_/g, "-");

  if (text.includes("detached")) return "detached_component";
  if (text.includes("raw-spacing") || text.includes("spacing")) return "raw_spacing";
  if (text.includes("raw-color") || text.includes("color")) return "raw_color";
  if (text.includes("raw-radius") || text.includes("radius")) return "raw_radius";
  if (text.includes("raw-typography") || text.includes("typography") || text.includes("type")) return "raw_typography";
  if (text.includes("broken-variable-alias") || text.includes("alias-chain")) return "broken_variable_alias";
  if (text.includes("missing-variable") || text.includes("variable-binding")) return "missing_variable_binding";
  if (text.includes("slot") || text.includes("nested-content")) return "invalid_slot_usage";
  if (text.includes("layout")) return "layout_hygiene";
  if (text.includes("contrast")) return "contrast";
  if (text.includes("theme") || text.includes("mode")) return "theme_mode";
  if (text.includes("prototype")) return "prototype_dead_end";
  if (text.includes("component") || text.includes("variant") || text.includes("property")) return "component_property";
  if (text.includes("provisional")) return "provisional_extension";
  if (text.includes("screenshot")) return "screenshot";
  if (text.includes("figma") || text.includes("setup")) return "figma_setup";

  return "other";
}

function normalizeSeverity(severity, sourceKind) {
  if (severities.has(severity)) {
    return severity;
  }

  return sourceKind === "gap" ? "warning" : "error";
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

function explicitValidationStatus(resultLike, issues) {
  if (!resultLike || Array.isArray(resultLike) || issues.length > 0) {
    return null;
  }

  const status = resultLike.validation?.status ?? resultLike.status;
  return validationStatuses.has(status) ? status : null;
}

function inferValidationStatus(summary, resultLike) {
  if (isEmptyValidationRun(resultLike)) {
    return "not_run";
  }

  if (containsValidationStatus(resultLike, "failed")) {
    return "failed";
  }

  return summary.critical > 0 || summary.error > 0 ? "failed" : "passed";
}

function containsValidationStatus(resultLike, status) {
  if (!resultLike) {
    return false;
  }

  if (Array.isArray(resultLike)) {
    return resultLike.some((item) => containsValidationStatus(item, status));
  }

  if (resultLike.validation?.status === status || resultLike.result?.status === status) {
    return true;
  }

  if (resultLike.status === status && !resultLike.code && !resultLike.message) {
    return true;
  }

  return containsValidationStatus(resultLike.result, status) ||
    containsValidationStatus(resultLike.validation, status) ||
    arrayify(resultLike.groups).some((group) => containsValidationStatus(group, status));
}

function isEmptyValidationRun(resultLike) {
  if (Array.isArray(resultLike)) {
    return resultLike.length === 0;
  }

  if (!resultLike) {
    return true;
  }

  if (resultLike.validation) {
    return false;
  }

  return false;
}

function fallbackMessage(code, metadata) {
  const scope = [metadata.familyId, metadata.groupId].filter(Boolean).join("/");
  return scope ? `${scope} reported ${code}.` : `Validation reported ${code}.`;
}

function optionalString(value) {
  const serialized = stringValue(value);
  return serialized.length > 0 ? serialized : null;
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

function slugify(value) {
  return stringValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function arrayify(value) {
  return Array.isArray(value) ? value : [];
}
