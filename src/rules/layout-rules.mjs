const schemaVersion = "1.0.0";
const kind = "figma-layout-rules-result";

const layoutModes = new Set(["HORIZONTAL", "VERTICAL"]);
const primaryAxisAlignments = new Set(["MIN", "CENTER", "MAX", "SPACE_BETWEEN"]);
const counterAxisAlignments = new Set(["MIN", "CENTER", "MAX", "BASELINE"]);
const fillSizingValues = new Set(["FILL", "STRETCH", "SCALE", "LEFT_RIGHT"]);
const generatedContainerTypes = new Set(["FRAME", "SECTION", "GROUP"]);
const rawPrimitiveTypes = new Set([
  "BOOLEAN_OPERATION",
  "ELLIPSE",
  "LINE",
  "POLYGON",
  "RECTANGLE",
  "STAR",
  "TEXT",
  "VECTOR"
]);

export const layoutRuleDefinitions = [
  {
    id: "layout.page-section-structure",
    category: "page_layout",
    description:
      "Generated page frames must be organized into named section frames instead of loose children."
  },
  {
    id: "layout.auto-layout-required",
    category: "auto_layout",
    description:
      "Generated page, section, container, and control-cluster frames with children must use Figma auto layout."
  },
  {
    id: "layout.auto-layout-direction",
    category: "auto_layout",
    description:
      "Page and section frames use vertical flow; control clusters use horizontal flow unless an approved pattern says otherwise."
  },
  {
    id: "layout.alignment-defined",
    category: "alignment",
    description:
      "Auto-layout frames must use valid primary and counter-axis alignment values so resizing remains predictable."
  },
  {
    id: "layout.responsive-resizing",
    category: "resizing",
    description:
      "Responsive children of page, section, and container frames must fill or stretch on the cross axis unless fixed sizing is explicitly approved."
  },
  {
    id: "layout.editable-frame-structure",
    category: "editability",
    description:
      "Generated layout frames must remain editable, unlocked frames and must not rely on absolute positioning for normal flow."
  },
  {
    id: "layout.custom-primitive-hides-gap",
    category: "strict_composition",
    description:
      "Custom primitive layouts must not stand in for missing library components, slots, or patterns without a reported gap and approved provisional extension."
  }
];

export const layoutRuleIds = layoutRuleDefinitions.map((rule) => rule.id);

export class LayoutRulesError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "LayoutRulesError";
    this.details = details;
  }
}

export function checkLayoutRules(fixture, options = {}) {
  assertLayoutFixture(fixture);

  const roots = normalizeRoots(fixture);
  const entries = collectEntries(roots);
  const violations = [];
  const designSystemGaps = [];

  checkPageSectionStructure(entries, violations);
  checkAutoLayout(entries, violations);
  checkAlignment(entries, violations);
  checkResizingAndEditability(entries, violations);
  checkCustomPrimitiveGaps(entries, violations, designSystemGaps);

  return {
    kind,
    schemaVersion,
    source: options.source ?? fixture.source ?? "unknown",
    checkedAt: options.now ? toIsoTimestamp(options.now) : fixture.checkedAt ?? null,
    ok: violations.length === 0,
    summary: {
      rootCount: roots.length,
      nodeCount: entries.length,
      pageFrameCount: entries.filter((entry) => isPageFrame(entry)).length,
      sectionCount: entries.filter((entry) => isSectionNode(entry.node)).length,
      containerCount: entries.filter((entry) => isContainerNode(entry.node)).length,
      autoLayoutFrameCount: entries.filter((entry) => layoutModes.has(normalizeLayoutMode(entry.node))).length,
      violationCount: violations.length,
      designSystemGapCount: designSystemGaps.length
    },
    rules: cloneJson(layoutRuleDefinitions),
    violations,
    designSystemGaps
  };
}

export const validateLayoutRules = checkLayoutRules;

function checkPageSectionStructure(entries, violations) {
  const pageFrames = entries.filter((entry) => isPageFrame(entry));

  for (const entry of pageFrames) {
    const children = visibleChildren(entry.node);
    const sectionChildren = children.filter(isSectionNode);

    if (children.length === 0) {
      addViolation(violations, {
        ruleId: "layout.page-section-structure",
        entry,
        message: "Generated page frames must contain at least one section frame.",
        expected: "One or more direct children with layoutRole=section or type=SECTION.",
        actual: "No visible page children."
      });
      continue;
    }

    if (sectionChildren.length === 0) {
      addViolation(violations, {
        ruleId: "layout.page-section-structure",
        entry,
        message: "Generated page frames must expose section structure for scanning and later editing.",
        expected: "Direct page children are section frames.",
        actual: "No direct section children were found."
      });
    }

    for (const child of children) {
      if (isSectionNode(child)) {
        continue;
      }

      addViolation(violations, {
        ruleId: "layout.page-section-structure",
        entry: childEntry(child, entry),
        message: "Page children must be section frames, not loose content or ad hoc containers.",
        expected: "layoutRole=section or type=SECTION.",
        actual: summarizeNode(child)
      });
    }
  }
}

function checkAutoLayout(entries, violations) {
  for (const entry of entries) {
    const node = entry.node;

    if (!isGeneratedLayoutFrame(node)) {
      continue;
    }

    const role = layoutRole(node);
    const children = visibleChildren(node);
    const layoutMode = normalizeLayoutMode(node);
    const requiresAutoLayout =
      node.requiresAutoLayout === true ||
      isPageFrame(entry) ||
      isSectionNode(node) ||
      isContainerNode(node) ||
      isControlCluster(node) ||
      children.length > 1;

    if (requiresAutoLayout && !layoutModes.has(layoutMode)) {
      addViolation(violations, {
        ruleId: "layout.auto-layout-required",
        entry,
        message: "Generated layout frames with structured children must use Figma auto layout.",
        expected: "layoutMode=VERTICAL or layoutMode=HORIZONTAL.",
        actual: layoutMode || "NONE"
      });
      continue;
    }

    const expectedDirection = expectedLayoutDirection(node, entry);
    if (expectedDirection && layoutModes.has(layoutMode) && layoutMode !== expectedDirection) {
      addViolation(violations, {
        ruleId: "layout.auto-layout-direction",
        entry,
        message: `The ${role || node.type || "layout"} frame has the wrong auto-layout direction.`,
        expected: `layoutMode=${expectedDirection}.`,
        actual: `layoutMode=${layoutMode}.`
      });
    }
  }
}

function checkAlignment(entries, violations) {
  for (const entry of entries) {
    const node = entry.node;
    const layoutMode = normalizeLayoutMode(node);

    if (!layoutModes.has(layoutMode) || !isGeneratedLayoutFrame(node)) {
      continue;
    }

    const primary = node.primaryAxisAlignItems;
    const counter = node.counterAxisAlignItems;

    if (!primaryAxisAlignments.has(primary)) {
      addViolation(violations, {
        ruleId: "layout.alignment-defined",
        entry,
        message: "Auto-layout frames must define a valid primary-axis alignment.",
        expected: [...primaryAxisAlignments].join(", "),
        actual: primary ?? "missing"
      });
    }

    if (!counterAxisAlignments.has(counter)) {
      addViolation(violations, {
        ruleId: "layout.alignment-defined",
        entry,
        message: "Auto-layout frames must define a valid counter-axis alignment.",
        expected: [...counterAxisAlignments].join(", "),
        actual: counter ?? "missing"
      });
    }
  }
}

function checkResizingAndEditability(entries, violations) {
  for (const entry of entries) {
    const node = entry.node;

    if (isGeneratedLayoutFrame(node)) {
      if (node.locked === true || node.editable === false) {
        addViolation(violations, {
          ruleId: "layout.editable-frame-structure",
          entry,
          message: "Generated layout frames must remain unlocked and editable.",
          expected: "locked=false and editable=true or omitted.",
          actual: `locked=${node.locked === true}, editable=${node.editable === false ? "false" : "not_false"}`
        });
      }
    }

    for (const child of visibleChildren(node)) {
      if (child.layoutPositioning === "ABSOLUTE" || child.itemPositioning === "ABSOLUTE") {
        addViolation(violations, {
          ruleId: "layout.editable-frame-structure",
          entry: childEntry(child, entry),
          message: "Normal generated layout must not depend on absolutely positioned children.",
          expected: "Child participates in parent auto-layout flow.",
          actual: "ABSOLUTE positioning."
        });
      }
    }

    if (!isResponsiveChild(entry)) {
      continue;
    }

    const horizontalSizing = horizontalSizingValue(node);
    if (!fillSizingValues.has(horizontalSizing) && node.allowFixedWidth !== true) {
      addViolation(violations, {
        ruleId: "layout.responsive-resizing",
        entry,
        message: "Sections and containers inside responsive generated frames must fill or stretch horizontally.",
        expected: "layoutSizingHorizontal=FILL/STRETCH or horizontal constraints that scale.",
        actual: horizontalSizing || "missing"
      });
    }
  }
}

function checkCustomPrimitiveGaps(entries, violations, designSystemGaps) {
  for (const entry of entries) {
    const node = entry.node;

    if (!isCustomPrimitiveLayout(node)) {
      continue;
    }

    if (isLibraryInstance(node) || hasApprovedProvisionalExtension(node) || hasReportedGap(node)) {
      continue;
    }

    const gap = {
      ruleId: "layout.custom-primitive-hides-gap",
      nodeId: nodeId(node),
      nodeName: node.name ?? null,
      path: entry.path,
      requirement:
        "Use a live library component, component slot, approved pattern, or approved Provisional Extension instead of a raw primitive layout.",
      closestCompliantAction:
        "Search live library assets for an equivalent component or report a Design System Gap before proceeding."
    };
    designSystemGaps.push(gap);

    addViolation(violations, {
      ruleId: "layout.custom-primitive-hides-gap",
      entry,
      message: "A custom primitive layout is hiding a missing design-system component or pattern.",
      expected: "Library instance, reported Design System Gap, or approved Provisional Extension.",
      actual: summarizeNode(node),
      details: { gap }
    });
  }
}

function isPageFrame(entry) {
  const node = entry.node;
  const role = layoutRole(node);

  return (
    role === "page" ||
    role === "screen" ||
    node.pageFrame === true ||
    (node.type === "FRAME" && (entry.parent?.type === "PAGE" || entry.depth === 0) && !isSectionNode(node))
  );
}

function isSectionNode(node) {
  return node?.type === "SECTION" || layoutRole(node) === "section";
}

function isContainerNode(node) {
  const role = layoutRole(node);
  return role === "container" || role === "content" || role === "panel" || role === "card";
}

function isControlCluster(node) {
  const role = layoutRole(node);
  return role === "controlCluster" || role === "actionCluster" || role === "buttonGroup" || role === "toolbar";
}

function isGeneratedLayoutFrame(node) {
  return generatedContainerTypes.has(node?.type);
}

function isResponsiveChild(entry) {
  if (!entry.parent || !isGeneratedLayoutFrame(entry.node) || isPageFrame(entry)) {
    return false;
  }

  return isPageFrame({ node: entry.parent, parent: null, depth: entry.depth - 1 }) || isSectionNode(entry.parent) || isContainerNode(entry.parent);
}

function isCustomPrimitiveLayout(node) {
  if (!node || isLibraryInstance(node)) {
    return false;
  }

  const role = layoutRole(node);
  const explicitlyPrimitive =
    node.customPrimitive === true ||
    role === "customPrimitive" ||
    role === "primitiveLayout" ||
    role === "primitive";
  const suspiciousName =
    generatedContainerTypes.has(node.type) &&
    /\b(button|input|text field|textfield|select|checkbox|radio|switch|badge|card|modal|table|tabs|navigation|nav item|avatar)\b/i.test(
      node.name ?? ""
    ) &&
    hasRawPrimitiveDescendants(node);

  return explicitlyPrimitive || suspiciousName;
}

function expectedLayoutDirection(node, entry) {
  if (node.expectedLayoutMode) {
    return normalizeLayoutMode({ layoutMode: node.expectedLayoutMode });
  }

  if (isPageFrame(entry) || isSectionNode(node)) {
    return "VERTICAL";
  }

  if (isControlCluster(node)) {
    return "HORIZONTAL";
  }

  return null;
}

function collectEntries(roots) {
  const entries = [];

  for (const root of roots) {
    walk(root, {
      parent: null,
      path: root.name ?? nodeId(root) ?? "root",
      depth: 0,
      entries
    });
  }

  return entries;
}

function walk(node, context) {
  if (!node || node.visible === false) {
    return;
  }

  const entry = {
    node,
    parent: context.parent,
    path: context.path,
    depth: context.depth
  };
  context.entries.push(entry);

  if (node.type === "INSTANCE") {
    return;
  }

  for (const child of visibleChildren(node)) {
    walk(child, {
      parent: node,
      path: `${context.path} > ${child.name ?? nodeId(child) ?? child.type ?? "node"}`,
      depth: context.depth + 1,
      entries: context.entries
    });
  }
}

function childEntry(node, parentEntry) {
  return {
    node,
    parent: parentEntry.node,
    path: `${parentEntry.path} > ${node.name ?? nodeId(node) ?? node.type ?? "node"}`,
    depth: parentEntry.depth + 1
  };
}

function normalizeRoots(fixture) {
  if (Array.isArray(fixture)) {
    return fixture;
  }

  if (Array.isArray(fixture.frames)) {
    return fixture.frames;
  }

  if (Array.isArray(fixture.pages)) {
    return fixture.pages;
  }

  if (fixture.root) {
    return [fixture.root];
  }

  if (fixture.document) {
    return [fixture.document];
  }

  return [fixture];
}

function assertLayoutFixture(fixture) {
  if (!fixture || (typeof fixture !== "object" && !Array.isArray(fixture))) {
    throw new LayoutRulesError("A frame/layout fixture object is required.");
  }
}

function visibleChildren(node) {
  return (node?.children ?? []).filter((child) => child?.visible !== false);
}

function normalizeLayoutMode(node) {
  const value = node?.layoutMode ?? node?.layout?.mode ?? "NONE";
  return typeof value === "string" ? value.toUpperCase() : "NONE";
}

function layoutRole(node) {
  return node?.layoutRole ?? node?.role ?? null;
}

function horizontalSizingValue(node) {
  const constraints = node.constraints?.horizontal;
  return (
    node.layoutSizingHorizontal ??
    node.layoutSizing?.horizontal ??
    node.layoutAlign ??
    constraints ??
    null
  );
}

function hasRawPrimitiveDescendants(node) {
  return visibleChildren(node).some(
    (child) => rawPrimitiveTypes.has(child.type) || hasRawPrimitiveDescendants(child)
  );
}

function isLibraryInstance(node) {
  return node?.type === "INSTANCE" || Boolean(node?.componentKey || node?.mainComponentKey);
}

function hasApprovedProvisionalExtension(node) {
  return node?.provisionalExtension?.approved === true || node?.provisional?.approved === true;
}

function hasReportedGap(node) {
  return node?.designSystemGap?.reported === true || node?.designSystemGap?.status === "reported";
}

function addViolation(violations, violation) {
  const node = violation.entry.node;

  violations.push({
    ruleId: violation.ruleId,
    severity: "error",
    nodeId: nodeId(node),
    nodeName: node.name ?? null,
    nodeType: node.type ?? null,
    path: violation.entry.path,
    message: violation.message,
    expected: violation.expected,
    actual: violation.actual,
    details: cloneJson(violation.details ?? {})
  });
}

function summarizeNode(node) {
  return {
    type: node.type ?? null,
    name: node.name ?? null,
    layoutRole: layoutRole(node),
    layoutMode: normalizeLayoutMode(node),
    componentKey: node.componentKey ?? node.mainComponentKey ?? null
  };
}

function nodeId(node) {
  return node?.nodeId ?? node?.id ?? null;
}

function toIsoTimestamp(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
