const createdStatuses = new Set(["approved", "created"]);

export const provisionalExtensionPolicy = Object.freeze({
  requiredApproval: true,
  requiredVariableChain: ["primitive", "semantic", "component"],
  requiredReportFields: [
    "id",
    "gapId",
    "status",
    "approval",
    "proposal",
    "node",
    "provisionalMarking",
    "variableChain",
    "promotionRecommendation"
  ]
});

export function validateProvisionalExtensions(input = {}) {
  const issues = [];
  const gapsById = new Map((input.designSystemGaps ?? []).map((gap) => [gap.id, gap]));

  for (const extension of input.provisionalExtensions ?? []) {
    issues.push(...validateProvisionalExtension(extension, { gapsById }));
  }

  return {
    status: issues.length > 0 ? "failed" : "passed",
    issues
  };
}

export function validateProvisionalExtension(extension = {}, context = {}) {
  const issues = [];

  for (const field of provisionalExtensionPolicy.requiredReportFields) {
    if (isMissing(extension[field])) {
      issues.push(extensionIssue(extension, {
        code: "PROVISIONAL_EXTENSION_REPORT_FIELD_MISSING",
        message: `Provisional Extension is missing required report field ${field}.`,
        expected: provisionalExtensionPolicy.requiredReportFields.join(", "),
        actual: field
      }));
    }
  }

  if (extension.gapId && context.gapsById && !context.gapsById.has(extension.gapId)) {
    issues.push(extensionIssue(extension, {
      code: "PROVISIONAL_EXTENSION_GAP_MISSING",
      message: `Provisional Extension ${extension.id ?? "(unknown)"} is not tied to a reported Design System Gap.`,
      expected: "gapId references an entry in designSystemGaps.",
      actual: extension.gapId
    }));
  }

  if (createdStatuses.has(extension.status) && !isApprovalGranted(extension.approval)) {
    issues.push(extensionIssue(extension, {
      code: "PROVISIONAL_EXTENSION_UNAPPROVED",
      severity: "critical",
      message: `Provisional Extension ${extension.id ?? "(unknown)"} is marked ${extension.status} without approval.`,
      expected: "approval.required=true and approval.granted=true before creating or using a provisional extension.",
      actual: approvalSummary(extension.approval),
      recommendation: "Stop, ask the operator to approve the smallest-extension proposal, and only proceed after the approval record is present."
    }));
  }

  if (extension.provisionalMarking && !isProvisionalMarking(extension.provisionalMarking, extension.node)) {
    issues.push(extensionIssue(extension, {
      code: "PROVISIONAL_EXTENSION_MARKING_MISSING",
      message: `Provisional Extension ${extension.id ?? "(unknown)"} is not clearly marked provisional.`,
      expected: "Visible or structural marking includes Provisional status.",
      actual: extension.provisionalMarking,
      recommendation: "Prefix the node name, add a visible annotation/badge, or use another explicit run marking and report it."
    }));
  }

  if (Array.isArray(extension.variableChain)) {
    const chainIssues = validateProvisionalVariableChain(extension);
    issues.push(...chainIssues);
  }

  return issues;
}

export function validateProvisionalVariableChain(extension = {}) {
  const chain = extension.variableChain ?? [];
  const levels = chain.map((entry) => normalizeLevel(entry.level));
  const expected = provisionalExtensionPolicy.requiredVariableChain;

  if (!expected.every((level, index) => levels[index] === level)) {
    return [
      extensionIssue(extension, {
        code: "PROVISIONAL_EXTENSION_VARIABLE_CHAIN",
        category: "broken_variable_alias",
        message: `Provisional Extension ${extension.id ?? "(unknown)"} does not use primitive -> semantic -> component variables.`,
        expected: expected.join(" -> "),
        actual: levels.length > 0 ? levels.join(" -> ") : "no variable chain",
        recommendation: "Introduce unavoidable raw values at the primitive or semantic layer, then expose component surfaces through component variables."
      })
    ];
  }

  const issues = [];
  for (let index = 1; index < chain.length; index += 1) {
    const current = chain[index];
    const previous = chain[index - 1];
    if (!current.aliasesTo || !sameVariableRef(current.aliasesTo, previous)) {
      issues.push(extensionIssue(extension, {
        code: "PROVISIONAL_EXTENSION_VARIABLE_CHAIN",
        category: "broken_variable_alias",
        message: `Provisional Extension ${extension.id ?? "(unknown)"} has a broken variable alias link.`,
        expected: `${current.variableName} aliases to ${previous.variableName}`,
        actual: current.aliasesTo ? `${current.variableName} aliases to ${current.aliasesTo}` : `${current.variableName} has no aliasesTo value`,
        recommendation: "Report each chain level and alias target so reviewers can verify theme and mode behavior."
      }));
    }
  }

  return issues;
}

function extensionIssue(extension, fields) {
  return {
    id: fields.id ?? toIssueId(fields.code, extension.id ?? fields.actual ?? fields.message),
    code: fields.code,
    category: fields.category ?? "provisional_extension",
    severity: fields.severity ?? "error",
    status: "open",
    message: fields.message,
    node: extension.node,
    expected: fields.expected,
    actual: fields.actual,
    recommendation: fields.recommendation
  };
}

function isApprovalGranted(approval = {}) {
  return approval.required === true && approval.granted === true;
}

function isMissing(value) {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim() === "";
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}

function isProvisionalMarking(marking, node = {}) {
  const text = `${marking} ${node.name ?? ""}`.toLowerCase();
  return text.includes("provisional");
}

function normalizeLevel(level) {
  return String(level ?? "").toLowerCase();
}

function sameVariableRef(ref, variable) {
  return ref === variable.variableId || ref === variable.variableName;
}

function approvalSummary(approval = {}) {
  return `required=${String(approval.required)}, granted=${String(approval.granted)}`;
}

function toIssueId(code, value) {
  return `${code.toLowerCase()}-${String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)}`;
}
