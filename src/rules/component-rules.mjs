const schemaVersion = "1.0.0";
const kind = "figma-component-rule-check";

export const componentRuleIds = Object.freeze({
  libraryInstances: "library-instances-only",
  noDetach: "no-detached-components",
  propertyVariants: "property-based-variants",
  slotOnlyNestedContent: "slot-only-nested-content",
  unsafeFreehandComposition: "unsafe-freehand-composition",
  designSystemGapRouting: "design-system-gap-routing"
});

export class ComponentRulesError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ComponentRulesError";
    this.details = details;
  }
}

export function evaluateComponentRules(input = {}, options = {}) {
  const discovery = input.discovery;
  const nestingMap = input.nestingMap ?? input.componentNestingMap;
  const design = input.design ?? input.document ?? input.fixture;
  assertRuleInput({ discovery, nestingMap, design });

  const libraryIndex = buildLibraryIndex(discovery, nestingMap);
  const nodes = collectDesignNodes(design);
  const issues = [];
  const gaps = [];
  const gapKeys = new Set();

  for (const node of nodes) {
    const normalized = normalizeDesignNode(node);

    checkLibraryInstance(normalized, libraryIndex, issues, gaps, gapKeys);
    checkNoDetach(normalized, libraryIndex, issues, gaps, gapKeys);
    checkPropertyConfiguration(normalized, libraryIndex, issues, gaps, gapKeys);
    checkSlotUsage(normalized, libraryIndex, issues, gaps, gapKeys);
    checkUnsafeFreehandComposition(normalized, libraryIndex, issues, gaps, gapKeys);
  }

  const severityCounts = countBy(issues, (issue) => issue.severity);
  const status = issues.some((issue) => ["critical", "error"].includes(issue.severity))
    ? "failed"
    : "passed";

  return {
    kind,
    schemaVersion,
    runId: options.runId ?? design.runId,
    status,
    summary: {
      checkedNodeCount: nodes.length,
      issueCount: issues.length,
      gapCount: gaps.length,
      severityCounts
    },
    rules: Object.values(componentRuleIds),
    issues,
    designSystemGaps: gaps
  };
}

function checkLibraryInstance(node, libraryIndex, issues, gaps, gapKeys) {
  if (node.type !== "INSTANCE") {
    return;
  }

  if (findLibraryComponent(node, libraryIndex) || isApprovedProvisional(node)) {
    return;
  }

  const gap = addGap(gaps, gapKeys, {
    kind: "missing_component",
    node,
    neededCapability:
      node.intendedComponentName ??
      node.name ??
      "Generated instance must resolve to a discovered library component.",
    searchSummary: "Checked discovered component keys, component node IDs, and component set keys.",
    whyExistingAssetsDoNotSatisfy:
      "The instance does not match a component discovered from the connected Figma UI Library.",
    proposedSmallestExtension:
      "Find a matching library component or request approval for a provisional component extension."
  });

  issues.push(issue({
    ruleId: componentRuleIds.libraryInstances,
    code: "component_not_in_discovered_library",
    category: "component_property",
    severity: "error",
    node,
    message: `Instance "${node.name}" is not traceable to a discovered library component.`,
    gapId: gap.id
  }));
}

function checkNoDetach(node, libraryIndex, issues, gaps, gapKeys) {
  if (!isDetachedNode(node)) {
    return;
  }

  const relatedLibraryComponent = findLibraryComponent(node, libraryIndex);
  const gap = addGap(gaps, gapKeys, {
    kind: "detach_required",
    node,
    affectedComponent: relatedLibraryComponent,
    neededCapability:
      node.detachReason ??
      node.intendedChange ??
      "A component change was attempted by detaching or recreating a library instance.",
    searchSummary: "Checked discovered component properties, variants, slots, and safe paths.",
    whyExistingAssetsDoNotSatisfy:
      "The requested change is not represented as a safe component property, variant, slot, or instance swap.",
    proposedSmallestExtension:
      "Add or expose the smallest missing property, variant, slot, or component extension instead of detaching."
  });

  issues.push(issue({
    ruleId: componentRuleIds.noDetach,
    code: "detached_component",
    category: "detached_component",
    severity: "critical",
    node,
    message: `Node "${node.name}" is marked as detached from a library component.`,
    gapId: gap.id
  }));
}

function checkPropertyConfiguration(node, libraryIndex, issues, gaps, gapKeys) {
  if (node.type !== "INSTANCE" || isDetachedNode(node)) {
    return;
  }

  const host = findHostEntry(node, libraryIndex);
  if (!host) {
    return;
  }

  const safePaths = new Map(
    (host.safeInstanceConfigurationPaths ?? []).map((path) => [path.propertyName, path])
  );
  const configuredProperties = normalizeComponentProperties(node.componentProperties);
  const directVariantOverrides = normalizePlainObject(
    node.variantProperties ?? node.variantOverrides ?? node.variants
  );

  for (const propertyName of Object.keys(directVariantOverrides)) {
    const safePath = safePaths.get(propertyName);
    if (safePath?.kind === "variant_property" && configuredProperties.has(propertyName)) {
      continue;
    }

    const gap = addGap(gaps, gapKeys, {
      kind: "missing_component_property",
      node,
      affectedComponent: host.host,
      neededCapability: `Configure variant "${propertyName}" through an official component property.`,
      searchSummary: `Checked safe configuration paths for "${host.host.name}".`,
      whyExistingAssetsDoNotSatisfy:
        safePath?.kind === "variant_property"
          ? "The variant exists, but this design records it as a direct variant override instead of a component property value."
          : "The variant/property is not present in the discovered safe configuration paths.",
      proposedSmallestExtension:
        "Use the discovered component property path or request a new property/variant on the component set."
    });

    issues.push(issue({
      ruleId: componentRuleIds.propertyVariants,
      code: "variant_not_configured_through_property",
      category: "component_property",
      severity: "error",
      node,
      message: `Variant "${propertyName}" on "${node.name}" must be configured through componentProperties.`,
      gapId: gap.id
    }));
  }

  for (const [propertyName, configuredProperty] of configuredProperties) {
    const safePath = safePaths.get(propertyName);
    if (!safePath) {
      const gap = addGap(gaps, gapKeys, {
        kind: "missing_component_property",
        node,
        affectedComponent: host.host,
        neededCapability: `Configure "${propertyName}" on "${host.host.name}".`,
        searchSummary: `Checked discovered component properties for "${host.host.name}".`,
        whyExistingAssetsDoNotSatisfy:
          "The configured property is not available in the discovered safe configuration paths.",
        proposedSmallestExtension:
          "Use an existing property or request the smallest new component property."
      });

      issues.push(issue({
        ruleId: componentRuleIds.propertyVariants,
        code: "unknown_component_property",
        category: "component_property",
        severity: "error",
        node,
        message: `Property "${propertyName}" is not a discovered safe configuration path for "${node.name}".`,
        gapId: gap.id
      }));
      continue;
    }

    if (!isAllowedPropertyValue(configuredProperty.value, safePath.allowedValues)) {
      const gap = addGap(gaps, gapKeys, {
        kind: "missing_variant_or_swap_value",
        node,
        affectedComponent: host.host,
        neededCapability: `Use "${String(configuredProperty.value)}" for "${propertyName}".`,
        searchSummary: `Checked allowed values for "${propertyName}".`,
        whyExistingAssetsDoNotSatisfy:
          "The configured value is not one of the discovered safe values for this component property.",
        proposedSmallestExtension:
          "Use an allowed value or request a new variant/property value in the library."
      });

      issues.push(issue({
        ruleId: componentRuleIds.propertyVariants,
        code: "unsupported_component_property_value",
        category: "component_property",
        severity: "error",
        node,
        message: `Value "${String(configuredProperty.value)}" is not allowed for property "${propertyName}" on "${node.name}".`,
        gapId: gap.id
      }));
    }
  }
}

function checkSlotUsage(node, libraryIndex, issues, gaps, gapKeys) {
  if (node.type !== "INSTANCE" || isDetachedNode(node)) {
    return;
  }

  const host = findHostEntry(node, libraryIndex);
  if (!host) {
    return;
  }

  const slotByName = new Map((host.slots ?? []).map((slot) => [slot.name, slot]));
  const slotByProperty = new Map(
    (host.slots ?? [])
      .filter((slot) => slot.propertyName)
      .map((slot) => [slot.propertyName, slot])
  );

  for (const child of node.children ?? []) {
    const childNode = normalizeDesignNode(child, node);
    if (isLibraryAuthoredNestedInstance(childNode)) {
      continue;
    }

    const slot = findSlotForChild(childNode, slotByName, slotByProperty);
    if (!slot) {
      const gap = addGap(gaps, gapKeys, {
        kind: "missing_slot",
        node: childNode,
        affectedComponent: host.host,
        neededCapability: `Place nested content "${childNode.name}" inside "${host.host.name}".`,
        searchSummary: `Checked discovered slots for "${host.host.name}".`,
        whyExistingAssetsDoNotSatisfy:
          "The nested content is not tied to any discovered slot name or slot property.",
        proposedSmallestExtension:
          "Use an existing slot, expose a compatible slot, or request a provisional component extension."
      });

      issues.push(issue({
        ruleId: componentRuleIds.slotOnlyNestedContent,
        code: "nested_content_without_slot",
        category: "invalid_slot_usage",
        severity: "error",
        node: childNode,
        message: `Nested content "${childNode.name}" inside "${node.name}" is not placed through a discovered slot.`,
        gapId: gap.id
      }));
      continue;
    }

    if (!isSlotContentAllowed(childNode, slot, libraryIndex)) {
      const gap = addGap(gaps, gapKeys, {
        kind: "incompatible_slot_content",
        node: childNode,
        affectedComponent: host.host,
        affectedSlot: slot,
        neededCapability: `Use "${childNode.name}" in slot "${slot.name}".`,
        searchSummary: `Checked accepted component keys and component set keys for slot "${slot.name}".`,
        whyExistingAssetsDoNotSatisfy:
          "The slot exists, but the nested content is not compatible with its discovered contract.",
        proposedSmallestExtension:
          "Use an accepted library instance or request a slot contract update."
      });

      issues.push(issue({
        ruleId: componentRuleIds.slotOnlyNestedContent,
        code: "incompatible_slot_content",
        category: "invalid_slot_usage",
        severity: "error",
        node: childNode,
        message: `Nested content "${childNode.name}" is not accepted by slot "${slot.name}" on "${node.name}".`,
        gapId: gap.id
      }));
    }
  }
}

function checkUnsafeFreehandComposition(node, libraryIndex, issues, gaps, gapKeys) {
  if (node.type === "INSTANCE" || !isFreehandComposition(node)) {
    return;
  }

  const matchingAsset = findMatchingLibraryAsset(node, libraryIndex);
  const gap = addGap(gaps, gapKeys, {
    kind: matchingAsset ? "library_asset_bypassed" : "missing_component",
    node,
    affectedComponent: matchingAsset,
    neededCapability:
      node.intendedComponentName ??
      node.uiPrimitive ??
      node.name ??
      "A generated UI primitive or composed component.",
    searchSummary: matchingAsset
      ? `Found discovered library asset "${matchingAsset.name}".`
      : "Checked discovered components and component sets by key and normalized name.",
    whyExistingAssetsDoNotSatisfy: matchingAsset
      ? "The design uses freehand nodes instead of placing the discovered library asset."
      : "No matching discovered component was found for the requested UI capability.",
    proposedSmallestExtension: matchingAsset
      ? "Replace the freehand construction with a library instance and configure it through safe properties."
      : "Report the missing capability and request approval for the smallest provisional extension."
  });

  issues.push(issue({
    ruleId: componentRuleIds.unsafeFreehandComposition,
    code: matchingAsset ? "freehand_recreates_library_component" : "freehand_requires_gap",
    category: "component_property",
    severity: "error",
    node,
    message: matchingAsset
      ? `Freehand node "${node.name}" recreates discovered library asset "${matchingAsset.name}".`
      : `Freehand node "${node.name}" must be routed as a Design System Gap before use.`,
    gapId: gap.id
  }));
}

function buildLibraryIndex(discovery, nestingMap) {
  const components = discovery.components ?? [];
  const componentSets = discovery.componentSets ?? [];
  const nestingComponents = nestingMap.components ?? [];
  const nestingComponentSets = nestingMap.componentSets ?? [];
  const componentByKey = new Map(components.filter((component) => component.key).map((component) => [component.key, component]));
  const componentByNodeId = new Map(components.filter((component) => component.nodeId).map((component) => [component.nodeId, component]));
  const componentSetByKey = new Map(componentSets.filter((set) => set.key).map((set) => [set.key, set]));
  const componentSetByNodeId = new Map(componentSets.filter((set) => set.nodeId).map((set) => [set.nodeId, set]));
  const hostByComponentKey = new Map();
  const hostByNodeId = new Map();
  const assetByNormalizedName = new Map();

  for (const entry of [...nestingComponents, ...nestingComponentSets]) {
    if (entry.host?.key) {
      hostByComponentKey.set(entry.host.key, entry);
    }
    if (entry.host?.nodeId) {
      hostByNodeId.set(entry.host.nodeId, entry);
    }
  }

  for (const asset of [...componentSets, ...components]) {
    for (const name of normalizedAssetNames(asset)) {
      if (!assetByNormalizedName.has(name)) {
        assetByNormalizedName.set(name, asset);
      }
    }
  }

  return {
    componentByKey,
    componentByNodeId,
    componentSetByKey,
    componentSetByNodeId,
    hostByComponentKey,
    hostByNodeId,
    assetByNormalizedName
  };
}

function findLibraryComponent(node, libraryIndex) {
  return (
    libraryIndex.componentByKey.get(node.componentKey) ??
    libraryIndex.componentByNodeId.get(node.componentId) ??
    libraryIndex.componentByNodeId.get(node.mainComponentId) ??
    libraryIndex.componentSetByKey.get(node.componentSetKey) ??
    undefined
  );
}

function findHostEntry(node, libraryIndex) {
  return (
    libraryIndex.hostByComponentKey.get(node.componentKey) ??
    libraryIndex.hostByNodeId.get(node.componentId) ??
    libraryIndex.hostByNodeId.get(node.mainComponentId) ??
    undefined
  );
}

function findMatchingLibraryAsset(node, libraryIndex) {
  const candidates = [
    node.componentKey,
    node.componentSetKey,
    normalizeName(node.intendedComponentName),
    normalizeName(node.uiPrimitive),
    normalizeName(node.name)
  ].filter(Boolean);

  for (const candidate of candidates) {
    const match =
      libraryIndex.componentByKey.get(candidate) ??
      libraryIndex.componentSetByKey.get(candidate) ??
      libraryIndex.assetByNormalizedName.get(candidate);
    if (match) {
      return match;
    }
  }

  return undefined;
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

function normalizeDesignNode(node, parent) {
  return {
    ...node,
    nodeId: node.nodeId ?? node.id,
    type: node.type,
    name: node.name ?? "Unnamed Node",
    parentNodeId: node.parentNodeId ?? parent?.nodeId ?? parent?.id,
    componentKey:
      node.componentKey ??
      node.mainComponentKey ??
      node.component?.key ??
      node.componentProperties?.componentKey,
    componentId: node.componentId ?? node.mainComponentId ?? node.component?.nodeId,
    mainComponentId: node.mainComponentId,
    componentSetKey: node.componentSetKey ?? node.component?.componentSetKey
  };
}

function normalizeComponentProperties(properties = {}) {
  if (Array.isArray(properties)) {
    return new Map(
      properties.map((property) => [
        property.name,
        {
          type: property.type,
          value: property.value
        }
      ])
    );
  }

  return new Map(
    Object.entries(properties ?? {}).map(([name, property]) => [
      name,
      {
        type: property?.type,
        value:
          property && typeof property === "object" && "value" in property ? property.value : property
      }
    ])
  );
}

function normalizePlainObject(value = {}) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return value;
}

function findSlotForChild(child, slotByName, slotByProperty) {
  return (
    slotByProperty.get(child.slotPropertyName) ??
    slotByProperty.get(child.propertyName) ??
    slotByName.get(child.slotName) ??
    slotByName.get(child.slot)
  );
}

function isSlotContentAllowed(child, slot, libraryIndex) {
  if (child.type !== "INSTANCE") {
    return isAllowedFreeformSlotContent(child, slot);
  }

  if ((slot.acceptedComponentKeys ?? []).length === 0 && (slot.acceptedComponentSetKeys ?? []).length === 0) {
    return true;
  }

  const component = findLibraryComponent(child, libraryIndex);
  const componentKey = child.componentKey ?? component?.key;
  const componentSetKey = child.componentSetKey ?? component?.componentSetKey;

  return (
    (componentKey && (slot.acceptedComponentKeys ?? []).includes(componentKey)) ||
    (componentSetKey && (slot.acceptedComponentSetKeys ?? []).includes(componentSetKey))
  );
}

function isAllowedFreeformSlotContent(child, slot) {
  const acceptedTypes = new Set((slot.acceptedValues ?? []).map((value) => value.type));
  if (acceptedTypes.size === 0) {
    return false;
  }

  return acceptedTypes.has(child.type) || acceptedTypes.has(child.contentType);
}

function isAllowedPropertyValue(value, allowedValues = []) {
  if (!allowedValues || allowedValues.length === 0) {
    return true;
  }

  return allowedValues.some((allowedValue) => {
    if (allowedValue && typeof allowedValue === "object") {
      return (
        allowedValue.key === value ||
        allowedValue.nodeId === value ||
        allowedValue.value === value ||
        JSON.stringify(allowedValue) === JSON.stringify(value)
      );
    }

    return allowedValue === value;
  });
}

function isDetachedNode(node) {
  return Boolean(
    node.detached === true ||
      node.isDetached === true ||
      node.detachedFromComponentKey ||
      node.detachedFromComponentId ||
      node.detachedFromLibrary === true ||
      node.figmaDesigner?.detached === true
  );
}

function isApprovedProvisional(node) {
  return (
    node.source === "provisional" &&
    (node.approvalStatus === "approved" || node.provisionalApproved === true)
  );
}

function isLibraryAuthoredNestedInstance(node) {
  return (
    node.libraryAuthored === true ||
    node.configurationKind === "library_authored_nested_instance" ||
    node.generated === false
  );
}

function isFreehandComposition(node) {
  return Boolean(
    node.freehand === true ||
      node.rawConstructed === true ||
      node.drawnPrimitive === true ||
      node.source === "freehand" ||
      node.source === "local" ||
      node.uiPrimitive ||
      node.intendedComponentName
  );
}

function normalizedAssetNames(asset) {
  return [
    normalizeName(asset.name),
    normalizeName(asset.name?.split("/")[0]),
    normalizeName(asset.name?.replace(/\s*\/\s*/g, " "))
  ].filter(Boolean);
}

function normalizeName(value) {
  return typeof value === "string"
    ? value
        .toLowerCase()
        .replace(/#.*$/, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    : undefined;
}

function addGap(gaps, gapKeys, gap) {
  const key = `${gap.kind}:${gap.node.nodeId ?? gap.node.name}:${gap.neededCapability}`;
  if (gapKeys.has(key)) {
    return gaps.find((existing) => existing.key === key);
  }

  gapKeys.add(key);
  const id = `gap-component-${gaps.length + 1}`;
  const entry = {
    id,
    key,
    ruleId: componentRuleIds.designSystemGapRouting,
    category: gap.kind,
    status: "open",
    node: figmaNodeRef(gap.node),
    affectedComponent: gap.affectedComponent ? componentRef(gap.affectedComponent) : undefined,
    affectedSlot: gap.affectedSlot ? slotRef(gap.affectedSlot) : undefined,
    neededCapability: gap.neededCapability,
    searchSummary: gap.searchSummary,
    whyExistingAssetsDoNotSatisfy: gap.whyExistingAssetsDoNotSatisfy,
    proposedSmallestExtension: gap.proposedSmallestExtension
  };

  gaps.push(entry);
  return entry;
}

function issue({ ruleId, code, category, severity, node, message, gapId }) {
  return {
    id: `${code}:${node.nodeId ?? normalizeName(node.name)}`,
    ruleId,
    code,
    category,
    severity,
    status: "open",
    message,
    node: figmaNodeRef(node),
    gapId
  };
}

function figmaNodeRef(node) {
  return {
    nodeId: node.nodeId ?? node.id ?? "unknown-node",
    name: node.name ?? "Unnamed Node",
    type: node.type
  };
}

function componentRef(component) {
  return {
    key: component.key,
    nodeId: component.nodeId ?? component.host?.nodeId,
    name: component.name ?? component.host?.name,
    type: component.type ?? component.host?.type
  };
}

function slotRef(slot) {
  return {
    name: slot.name,
    nodeId: slot.nodeId,
    propertyName: slot.propertyName,
    acceptedComponentKeys: slot.acceptedComponentKeys ?? [],
    acceptedComponentSetKeys: slot.acceptedComponentSetKeys ?? []
  };
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function assertRuleInput({ discovery, nestingMap, design }) {
  if (!discovery || typeof discovery !== "object") {
    throw new ComponentRulesError("Component rules require discovery output.");
  }

  if (discovery.kind !== "figma-library-discovery") {
    throw new ComponentRulesError("Unsupported discovery payload for component rules.", {
      kind: discovery.kind
    });
  }

  if (!nestingMap || typeof nestingMap !== "object") {
    throw new ComponentRulesError("Component rules require a component nesting map.");
  }

  if (nestingMap.kind !== "figma-component-nesting-map") {
    throw new ComponentRulesError("Unsupported nesting map payload for component rules.", {
      kind: nestingMap.kind
    });
  }

  if (!design || typeof design !== "object") {
    throw new ComponentRulesError("Component rules require a generated design node fixture.");
  }
}
