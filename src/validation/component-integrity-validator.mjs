import { evaluateComponentRules } from "../rules/component-rules.mjs";
import { validateProvisionalExtensions } from "../rules/provisional-extension-policy.mjs";

const schemaVersion = "1.0.0";
const kind = "figma-component-integrity-validation";

export const componentIntegrityValidatorIds = Object.freeze({
  detachedComponents: "detached-components",
  libraryInstances: "library-instances",
  componentProperties: "component-properties",
  nestedContent: "nested-content",
  slotUsage: "slot-usage",
  provisionalOutput: "provisional-output"
});

export class ComponentIntegrityValidatorError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ComponentIntegrityValidatorError";
    this.details = details;
  }
}

export function validateComponentIntegrity(input = {}, options = {}) {
  const discovery = input.discovery;
  const nestingMap = input.nestingMap ?? input.componentNestingMap;
  const design = input.design ?? input.document ?? input.fixture;

  if (!design || typeof design !== "object") {
    throw new ComponentIntegrityValidatorError(
      "Component integrity validation requires a generated design payload."
    );
  }

  const componentResult = evaluateComponentRules(
    {
      discovery,
      nestingMap,
      design
    },
    options
  );

  const designSystemGaps = mergeDesignSystemGaps(
    componentResult.designSystemGaps,
    input.designSystemGaps ?? design.designSystemGaps ?? []
  );
  const provisionalExtensions = resolveProvisionalExtensions(input, design);
  const provisionalResult = validateProvisionalExtensions({
    designSystemGaps,
    provisionalExtensions
  });

  const issues = [
    ...componentResult.issues,
    ...provisionalResult.issues.map(normalizeProvisionalIssue)
  ];
  const severityCounts = countBy(issues, (issue) => issue.severity);
  const categoryCounts = countBy(issues, (issue) => issue.category);

  return {
    kind,
    schemaVersion,
    runId: options.runId ?? componentResult.runId ?? design.runId,
    family: "component-integrity",
    status: issues.some((issue) => ["critical", "error"].includes(issue.severity))
      ? "failed"
      : "passed",
    summary: {
      checkedNodeCount: componentResult.summary.checkedNodeCount,
      provisionalExtensionCount: provisionalExtensions.length,
      issueCount: issues.length,
      designSystemGapCount: designSystemGaps.length,
      severityCounts,
      categoryCounts
    },
    validators: Object.values(componentIntegrityValidatorIds),
    issues,
    designSystemGaps,
    results: {
      componentRules: componentResult,
      provisionalExtensions: provisionalResult
    }
  };
}

function mergeDesignSystemGaps(...gapLists) {
  const byId = new Map();
  const merged = [];

  for (const gap of gapLists.flat()) {
    if (!gap || typeof gap !== "object") {
      continue;
    }
    const id = gap.id ?? gap.key;
    if (id && byId.has(id)) {
      continue;
    }
    if (id) {
      byId.set(id, gap);
    }
    merged.push(gap);
  }

  return merged;
}

function resolveProvisionalExtensions(input, design) {
  if (Array.isArray(input.provisionalExtensions)) {
    return input.provisionalExtensions;
  }

  if (Array.isArray(design.provisionalExtensions)) {
    return design.provisionalExtensions;
  }

  return collectDesignNodes(design)
    .filter(isProvisionalNode)
    .map(provisionalExtensionFromNode);
}

function collectDesignNodes(design) {
  const roots = Array.isArray(design)
    ? design
    : [
        ...(design.nodes ?? []),
        ...(design.screens ?? []),
        ...(design.frames ?? []),
        design.document
      ].filter(Boolean);
  const nodes = [];

  for (const root of roots) {
    walkNode(root, (node) => nodes.push(node));
  }

  return nodes;
}

function walkNode(node, visit) {
  if (!node || typeof node !== "object") {
    return;
  }

  visit(node);
  for (const child of node.children ?? []) {
    walkNode(child, visit);
  }
}

function isProvisionalNode(node) {
  return Boolean(
    node.source === "provisional" ||
      node.provisional === true ||
      node.figmaDesigner?.provisional === true ||
      node.figmaDesigner?.provisionalExtension === true
  );
}

function provisionalExtensionFromNode(node) {
  const nodeRef = figmaNodeRef(node);
  const approval = node.approval ?? node.provisionalApproval ?? {};

  return {
    id:
      node.provisionalExtensionId ??
      node.extensionId ??
      `provisional-node-${nodeRef.nodeId}`,
    gapId: node.gapId ?? node.designSystemGapId,
    status: node.provisionalStatus ?? node.extensionStatus ?? "created",
    approval: {
      required: approval.required ?? true,
      granted: isApprovalGranted(approval, node)
    },
    proposal: node.proposal ?? node.provisionalProposal,
    node: nodeRef,
    provisionalMarking: node.provisionalMarking ?? node.name,
    variableChain: node.variableChain ?? node.provisionalVariableChain,
    promotionRecommendation: node.promotionRecommendation
  };
}

function isApprovalGranted(approval, node) {
  if (approval.granted !== undefined) {
    return approval.granted;
  }
  if (node.provisionalApproved !== undefined) {
    return node.provisionalApproved === true;
  }
  return node.approvalStatus === "approved";
}

function normalizeProvisionalIssue(issue) {
  return {
    ...issue,
    node: issue.node ? figmaNodeRef(issue.node) : undefined
  };
}

function figmaNodeRef(node = {}) {
  return {
    nodeId: node.nodeId ?? node.id ?? "unknown-node",
    name: node.name ?? "Unnamed Node",
    type: node.type
  };
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!key) {
      continue;
    }
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
