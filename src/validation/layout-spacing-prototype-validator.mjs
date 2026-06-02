import { checkLayoutRules } from "../rules/layout-rules.mjs";
import { checkSpacingFixture } from "../rules/spacing-rules.mjs";

export const schemaVersion = "1.0.0";
export const kind = "figma-layout-spacing-prototype-validation-result";

const layoutCategoryByRule = {
  "layout.auto-layout-required": "layout_hygiene",
  "layout.auto-layout-direction": "layout_hygiene",
  "layout.alignment-defined": "layout_hygiene",
  "layout.responsive-resizing": "layout_hygiene",
  "layout.editable-frame-structure": "layout_hygiene",
  "layout.page-section-structure": "layout_hygiene",
  "layout.custom-primitive-hides-gap": "layout_hygiene"
};

const issueSeverities = new Set(["critical", "error", "warning", "info"]);
const prototypeNodeRoles = new Set(["screen", "page", "prototypeScreen", "flowStep"]);

export function validateLayoutSpacingPrototype(fixture, options = {}) {
  assertFixture(fixture);

  const issues = [];
  const checks = {
    layout: null,
    spacing: null,
    prototype: null
  };

  if (hasLayoutInput(fixture)) {
    checks.layout = checkLayoutRules(layoutInputFor(fixture), options.layout ?? {});
    issues.push(...layoutIssues(checks.layout, options));
  }

  if (hasSpacingInput(fixture)) {
    checks.spacing = checkSpacingFixture(spacingInputFor(fixture), {
      context: fixture.discovery ?? fixture.context ?? options.discovery ?? options.context,
      ...options.spacing
    });
    issues.push(...spacingIssues(checks.spacing, options));
  }

  if (hasPrototypeInput(fixture)) {
    checks.prototype = checkPrototypeDeadEnds(prototypeInputFor(fixture), options.prototype ?? options);
    issues.push(...checks.prototype.issues);
  }

  const summary = summarize(issues, checks);

  return {
    kind,
    schemaVersion,
    source: options.source ?? fixture.source ?? "fixture",
    checkedAt: options.now ? toIsoTimestamp(options.now) : fixture.checkedAt ?? null,
    status: issues.some(isBlockingIssue) ? "failed" : "passed",
    ok: !issues.some(isBlockingIssue),
    summary,
    issues,
    checks
  };
}

export const validateLayoutSpacingPrototypeValidator = validateLayoutSpacingPrototype;
export default validateLayoutSpacingPrototype;

export function checkPrototypeDeadEnds(input, options = {}) {
  const nodes = collectPrototypeNodes(input);
  const terminalNodeIds = new Set([
    ...arrayify(input?.terminalNodeIds),
    ...arrayify(input?.prototype?.terminalNodeIds)
  ]);
  const screens = nodes.filter((entry) => isPrototypeScreen(entry.node));
  const candidates = screens.length > 0 ? screens : nodes.filter((entry) => entry.node?.requiresPrototype === true);
  const issues = [];

  for (const entry of candidates) {
    const node = entry.node;

    if (isTerminalPrototypeNode(node, terminalNodeIds)) {
      continue;
    }

    if (hasOutboundPrototypeAction(node)) {
      continue;
    }

    if (hasDescendantOutboundPrototypeAction(node)) {
      continue;
    }

    issues.push(
      validationIssue({
        code: "PROTOTYPE_DEAD_END",
        category: "prototype_dead_end",
        severity: "error",
        message: "Generated prototype screens must expose a forward path or be marked as an intentional terminal state.",
        node: nodeRef(node, options),
        expected: "A prototype interaction to another generated screen, or terminalNode=true for intentional flow endings.",
        actual: "No outbound prototype interaction was found.",
        recommendation:
          "Connect the primary action to the next generated screen, or mark this screen as terminal when the flow is intentionally complete.",
        details: {
          path: entry.path
        }
      })
    );
  }

  return {
    kind: "figma-prototype-dead-end-check-result",
    schemaVersion,
    ok: issues.length === 0,
    summary: {
      nodeCount: nodes.length,
      screenCount: screens.length,
      deadEndCount: issues.length
    },
    issues
  };
}

function layoutIssues(layoutResult, options) {
  return layoutResult.violations.map((violation) =>
    validationIssue({
      code: codeFromLayoutRule(violation.ruleId),
      category: layoutCategoryByRule[violation.ruleId] ?? "layout_hygiene",
      severity: severityFor(violation.severity),
      message: violation.message,
      node: nodeRef(
        {
          nodeId: violation.nodeId,
          id: violation.nodeId,
          name: violation.nodeName,
          type: violation.nodeType,
          url: violation.nodeUrl
        },
        options
      ),
      expected: stringifyNonEmpty(violation.expected),
      actual: stringifyNonEmpty(violation.actual),
      recommendation: recommendationForLayoutRule(violation.ruleId),
      details: {
        ruleId: violation.ruleId,
        path: violation.path,
        details: violation.details
      }
    })
  );
}

function spacingIssues(spacingResult, options) {
  return [...spacingResult.violations, ...spacingResult.gaps].map((issue) =>
    validationIssue({
      code: codeFromSpacingIssue(issue.code),
      category: "raw_spacing",
      severity: severityFor(issue.severity, "error"),
      message: issue.message,
      node: nodeRef(
        {
          nodeId: issue.nodeId,
          id: issue.nodeId,
          name: issue.nodeName,
          type: issue.nodeType ?? "FRAME",
          url: issue.nodeUrl
        },
        options
      ),
      expected: spacingExpected(issue),
      actual: spacingActual(issue),
      recommendation: spacingRecommendation(issue),
      details: withoutKeys(issue, ["message", "nodeId", "nodeName", "nodeType", "nodeUrl"])
    })
  );
}

function validationIssue({
  code,
  category,
  severity,
  message,
  node,
  expected,
  actual,
  recommendation,
  details
}) {
  const issue = {
    id: issueId(code, node?.nodeId),
    code,
    category,
    severity,
    status: "open",
    message,
    node
  };

  if (expected) {
    issue.expected = expected;
  }

  if (actual) {
    issue.actual = actual;
  }

  if (recommendation) {
    issue.recommendation = recommendation;
  }

  if (details && Object.keys(details).length > 0) {
    issue.details = cloneJson(details);
  }

  return issue;
}

function summarize(issues, checks) {
  const severityCounts = {
    critical: 0,
    error: 0,
    warning: 0,
    info: 0
  };
  const categoryCounts = {};

  for (const issue of issues) {
    severityCounts[issue.severity] += 1;
    categoryCounts[issue.category] = (categoryCounts[issue.category] ?? 0) + 1;
  }

  return {
    ...severityCounts,
    issueCount: issues.length,
    categoryCounts,
    layoutIssueCount: issues.filter((issue) => issue.category === "layout_hygiene").length,
    spacingIssueCount: issues.filter((issue) => issue.category === "raw_spacing").length,
    prototypeIssueCount: issues.filter((issue) => issue.category === "prototype_dead_end").length,
    layoutChecked: Boolean(checks.layout),
    spacingChecked: Boolean(checks.spacing),
    prototypeChecked: Boolean(checks.prototype)
  };
}

function hasLayoutInput(fixture) {
  return Boolean(
    fixture.layout ||
      fixture.root ||
      fixture.document ||
      Array.isArray(fixture.frames) ||
      Array.isArray(fixture.pages)
  );
}

function hasSpacingInput(fixture) {
  const spacing = fixture.spacing ?? fixture.spacingFixture;

  return Boolean(
    spacing ||
      Array.isArray(fixture.nodes) ||
      Array.isArray(fixture.spacingNodes) ||
      Array.isArray(fixture.spacingChecks)
  );
}

function hasPrototypeInput(fixture) {
  return Boolean(
    fixture.prototype ||
      Array.isArray(fixture.prototypeNodes) ||
      Array.isArray(fixture.screens) ||
      fixture.root ||
      fixture.document ||
      Array.isArray(fixture.frames) ||
      Array.isArray(fixture.pages)
  );
}

function layoutInputFor(fixture) {
  return fixture.layout ?? fixture;
}

function spacingInputFor(fixture) {
  if (fixture.spacing) {
    return fixture.spacing;
  }

  if (fixture.spacingFixture) {
    return fixture.spacingFixture;
  }

  if (Array.isArray(fixture.spacingChecks)) {
    return {
      ...fixture,
      nodes: fixture.spacingChecks
    };
  }

  return fixture;
}

function prototypeInputFor(fixture) {
  return fixture.prototype ?? {
    ...fixture,
    nodes: fixture.prototypeNodes ?? fixture.screens
  };
}

function collectPrototypeNodes(input = {}) {
  const roots = normalizePrototypeRoots(input);
  const entries = [];

  for (const root of roots) {
    walkPrototype(root, {
      parent: null,
      path: root?.name ?? nodeId(root) ?? "prototype",
      depth: 0,
      entries
    });
  }

  return entries;
}

function normalizePrototypeRoots(input = {}) {
  if (Array.isArray(input)) {
    return input;
  }

  if (Array.isArray(input.nodes)) {
    return input.nodes;
  }

  if (Array.isArray(input.prototypeNodes)) {
    return input.prototypeNodes;
  }

  if (Array.isArray(input.screens)) {
    return input.screens;
  }

  if (Array.isArray(input.frames)) {
    return input.frames;
  }

  if (Array.isArray(input.pages)) {
    return input.pages;
  }

  if (input.root) {
    return [input.root];
  }

  if (input.document) {
    return [input.document];
  }

  if (input.nodeId || input.id || input.type) {
    return [input];
  }

  return [];
}

function walkPrototype(node, context) {
  if (!node || node.visible === false) {
    return;
  }

  context.entries.push({
    node,
    parent: context.parent,
    path: context.path,
    depth: context.depth
  });

  for (const child of visibleChildren(node)) {
    walkPrototype(child, {
      parent: node,
      path: `${context.path} > ${child.name ?? nodeId(child) ?? child.type ?? "node"}`,
      depth: context.depth + 1,
      entries: context.entries
    });
  }
}

function isPrototypeScreen(node) {
  const role = node?.prototypeRole ?? node?.layoutRole ?? node?.role;

  return (
    prototypeNodeRoles.has(role) ||
    node?.pageFrame === true ||
    node?.requiresPrototype === true ||
    (node?.type === "FRAME" && node?.generated !== false && node?.prototypeIgnore !== true)
  );
}

function isTerminalPrototypeNode(node, terminalNodeIds) {
  return Boolean(
    node?.terminalNode === true ||
      node?.prototypeTerminal === true ||
      node?.isTerminal === true ||
      node?.prototypeRole === "terminal" ||
      terminalNodeIds.has(nodeId(node))
  );
}

function hasDescendantOutboundPrototypeAction(node) {
  return visibleChildren(node).some(
    (child) => hasOutboundPrototypeAction(child) || hasDescendantOutboundPrototypeAction(child)
  );
}

function hasOutboundPrototypeAction(node) {
  if (!node) {
    return false;
  }

  const directCollections = [
    node.interactions,
    node.reactions,
    node.prototypeInteractions,
    node.prototype?.interactions,
    node.prototype?.reactions,
    node.prototype?.connections,
    node.prototype?.outgoing
  ];

  if (directCollections.some(hasActionTarget)) {
    return true;
  }

  const scalarTargets = [
    node.transitionNodeID,
    node.transitionNodeId,
    node.destinationId,
    node.destinationNodeId,
    node.targetNodeId,
    node.prototype?.transitionNodeID,
    node.prototype?.transitionNodeId,
    node.prototype?.destinationId,
    node.prototype?.destinationNodeId,
    node.prototype?.targetNodeId
  ];

  if (scalarTargets.some((target) => typeof target === "string" && target.length > 0)) {
    return true;
  }

  return arrayify(node.outgoingPrototypeNodeIds).some(Boolean) || arrayify(node.prototype?.outgoingNodeIds).some(Boolean);
}

function hasActionTarget(actions) {
  return arrayify(actions).some((action) => {
    if (!action || typeof action !== "object") {
      return false;
    }

    return Boolean(
      action.targetNodeId ||
        action.targetNodeID ||
        action.destinationId ||
        action.destinationNodeId ||
        action.transitionNodeID ||
        action.transitionNodeId ||
        action.nodeId ||
        action.action?.targetNodeId ||
        action.action?.destinationId ||
        action.action?.transitionNodeID
    );
  });
}

function nodeRef(node, options = {}) {
  const id = nodeId(node) ?? "unknown-node";
  const ref = {
    nodeId: id,
    name: node?.name ?? "Unnamed node"
  };

  if (node?.type) {
    ref.type = node.type;
  }

  const url = node?.url ?? node?.nodeUrl ?? buildFigmaNodeUrl(id, options);
  if (url) {
    ref.url = url;
  }

  return ref;
}

function buildFigmaNodeUrl(id, options = {}) {
  const fileUrl = options.figmaFileUrl ?? options.fileUrl ?? options.figma?.fileUrl;
  if (!fileUrl || id === "unknown-node") {
    return undefined;
  }

  const separator = fileUrl.includes("?") ? "&" : "?";
  return `${fileUrl}${separator}node-id=${encodeURIComponent(id).replaceAll("%3A", "-")}`;
}

function codeFromLayoutRule(ruleId) {
  return ruleId.toUpperCase().replaceAll(".", "_").replaceAll("-", "_");
}

function codeFromSpacingIssue(code) {
  return `SPACING_${String(code).toUpperCase().replaceAll("-", "_")}`;
}

function recommendationForLayoutRule(ruleId) {
  const recommendations = {
    "layout.page-section-structure": "Wrap direct page content in named section frames so generated pages remain scannable and editable.",
    "layout.auto-layout-required": "Use Figma auto layout on generated page, section, container, and structured child frames.",
    "layout.auto-layout-direction": "Set the frame direction to the approved page, section, or control-cluster flow.",
    "layout.alignment-defined": "Set explicit primary and counter-axis alignment values on auto-layout frames.",
    "layout.responsive-resizing": "Use fill, stretch, scale, or equivalent responsive constraints for children in generated page flow.",
    "layout.editable-frame-structure": "Keep generated frames unlocked, editable, and participating in normal auto-layout flow.",
    "layout.custom-primitive-hides-gap": "Replace raw primitive UI with a library component, approved pattern, or reported Design System Gap."
  };

  return recommendations[ruleId] ?? "Adjust the generated layout to match the published layout rules.";
}

function spacingExpected(issue) {
  if (issue.type === "design_system_gap") {
    return "Discovered spacing variables or approved spacing patterns are available for this role.";
  }

  return "Final UI spacing is bound to a discovered spacing variable or approved spacing pattern.";
}

function spacingActual(issue) {
  if (issue.rawValue !== undefined) {
    return `Raw spacing value ${issue.rawValue}.`;
  }

  if (issue.relationship) {
    return `Invalid or missing spacing binding for ${issue.relationship}.`;
  }

  return issue.code ?? "Spacing check failed.";
}

function spacingRecommendation(issue) {
  return (
    issue.proposedExtension ??
    "Bind this spacing relationship through discovered spacing guidance, or report a Design System Gap before using a raw value."
  );
}

function severityFor(severity, fallback = "error") {
  if (severity === "gap") {
    return "error";
  }

  if (issueSeverities.has(severity)) {
    return severity;
  }

  return fallback;
}

function isBlockingIssue(issue) {
  return issue.severity === "critical" || issue.severity === "error";
}

function visibleChildren(node) {
  return (node?.children ?? []).filter((child) => child?.visible !== false);
}

function nodeId(node) {
  return node?.nodeId ?? node?.id ?? null;
}

function stringifyNonEmpty(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return typeof value === "string" ? value : JSON.stringify(value);
}

function issueId(code, nodeIdValue) {
  return `val-${code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${String(nodeIdValue ?? "unknown").replace(/[^a-z0-9]+/gi, "-")}`;
}

function withoutKeys(object, keys) {
  const clone = { ...object };

  for (const key of keys) {
    delete clone[key];
  }

  return clone;
}

function arrayify(value) {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function toIsoTimestamp(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function cloneJson(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}

function assertFixture(fixture) {
  if (!fixture || (typeof fixture !== "object" && !Array.isArray(fixture))) {
    throw new TypeError("A layout, spacing, or prototype validation fixture is required.");
  }
}
