import { createFigmaAccessFromEnv } from "./figma-access.mjs";

const schemaVersion = "1.0.0";
const defaultLibraryName = "New Engine Figma UI Library";

export async function discoverLibrary(options = {}) {
  const figma = options.figmaAccess ?? createFigmaAccessFromEnv(options.env, options.figmaOptions);
  const source = figma.mode === "fixture" ? "fixture" : "live_figma";
  const discoveredAt = toIsoTimestamp(options.now ?? new Date());

  const [health, file, componentsPayload, componentSetsPayload, stylesPayload, variablesPayload] =
    await Promise.all([
      figma.health(),
      figma.getFile(),
      figma.getLocalComponents(),
      figma.getLocalComponentSets(),
      figma.getLocalStyles(),
      figma.getVariables()
    ]);

  const fileKey = file.key ?? file.fileKey ?? health.fileKey ?? figma.fileKey ?? "unknown-file";
  const fileName = file.name ?? file.fileName ?? "Figma File";
  const libraryName = options.libraryName ?? health.libraryName ?? file.libraryName ?? defaultLibraryName;
  const libraryId = options.libraryId ?? toStableId(libraryName);
  const libraryFileKey = findLibraryFileKey(file, componentsPayload, componentSetsPayload, fileKey);
  const fileUrl = options.fileUrl ?? figmaFileUrl(fileKey, fileName);
  const libraryUrl = options.libraryUrl ?? figmaFileUrl(libraryFileKey, libraryName);
  const runId = options.runId ?? "discovery-run";
  const cachePath = options.cachePath ?? `runs/${runId}/cache/discovery.json`;
  const nestingMapPath =
    options.nestingMapPath ?? `runs/${runId}/cache/component-nesting-map.json`;

  const nodeIndex = indexDocument(file.document);
  const rawComponents = mergeRecords(
    normalizeRecordList(componentsPayload, "components"),
    normalizeRecordMap(file.components)
  );
  const rawComponentSets = mergeRecords(
    normalizeRecordList(componentSetsPayload, "componentSets"),
    normalizeRecordMap(file.componentSets)
  );
  const rawStyles = mergeRecords(
    normalizeRecordList(stylesPayload, "styles"),
    normalizeRecordMap(file.styles)
  );

  const componentSets = rawComponentSets.map((componentSet) =>
    normalizeComponentSet(componentSet, {
      fileKey,
      libraryId,
      nodeIndex,
      source
    })
  );
  const components = rawComponents.map((component) =>
    normalizeComponent(component, {
      fileKey,
      libraryId,
      nodeIndex,
      source
    })
  );
  const styles = rawStyles.map((style) =>
    normalizeStyle(style, { fileKey, libraryId, nodeIndex, source })
  );

  const componentLookup = buildComponentLookup(components);
  for (const component of components) {
    const detailNode = nodeIndex.get(component.nodeId)?.node;
    component.nestedComponents = findNestedComponents(detailNode, componentLookup, source);
    component.slots = [
      ...component.slots,
      ...findNodeSlots(detailNode, component.componentProperties, fileKey, source)
    ];
    component.slots = dedupeBy(component.slots, slotKey);
  }

  for (const componentSet of componentSets) {
    const variants = components.filter(
      (component) =>
        component.componentSetId === componentSet.nodeId ||
        component.componentSetKey === componentSet.key
    );
    componentSet.variants = variants.map((variant) => ({
      nodeId: variant.nodeId,
      key: variant.key,
      name: variant.name,
      variantProperties: variant.variantProperties,
      componentProperties: variant.componentProperties.map((property) => property.name)
    }));
    componentSet.slots = dedupeBy(
      [
        ...componentSet.slots,
        ...variants.flatMap((variant) =>
          variant.slots.map((slot) => ({ ...slot, hostNodeId: variant.nodeId }))
        )
      ],
      slotKey
    );
    componentSet.nestedComponents = dedupeBy(
      variants.flatMap((variant) => variant.nestedComponents),
      (nested) => `${nested.nodeId}:${nested.componentId ?? ""}:${nested.componentKey ?? ""}`
    );
  }

  const variables = normalizeVariables(variablesPayload, {
    libraryId,
    nodeIndex,
    source
  });
  const examples = normalizeExamples(file, nodeIndex, componentLookup, { fileKey, source });
  const approvedPatterns = normalizeApprovedPatterns(file, nodeIndex, componentLookup, {
    fileKey,
    source
  });
  const discoveryNodes = buildDiscoveryNodes({
    components,
    componentSets,
    styles,
    examples,
    libraryId
  });

  const libraries = [
    {
      libraryId,
      name: libraryName,
      fileKey: libraryFileKey,
      url: libraryUrl,
      connectedAsAssets: source === "fixture" ? true : health.connectedAsAssets === true,
      status: source === "fixture" || health.connectedAsAssets === true ? "connected" : "unknown",
      source: source === "fixture" ? "fixture" : "figma_assets"
    }
  ];

  return {
    schemaVersion,
    kind: "figma-library-discovery",
    source,
    discoveredAt,
    figmaFile: {
      fileKey,
      fileName,
      url: fileUrl
    },
    library: libraries[0],
    components,
    componentSets,
    variables,
    styles,
    examples,
    approvedPatterns,
    runContextPatch: {
      libraries,
      discovery: {
        source,
        discoveredAt,
        cachePath,
        nestingMapPath,
        nodes: discoveryNodes
      },
      variables: {
        collections: variables.collections.map((collection) => ({
          collectionId: collection.collectionId,
          collectionKey: collection.collectionKey,
          name: collection.name,
          libraryId: collection.libraryId,
          modes: collection.modes
        })),
        references: variables.references.map((variable) => ({
          variableId: variable.variableId,
          variableKey: variable.variableKey,
          name: variable.name,
          collectionId: variable.collectionId,
          role: variable.role,
          type: variable.type,
          resolvedModeId: variable.resolvedModeId,
          boundNodeIds: variable.boundNodeIds,
          aliasChain: variable.aliasChain
        }))
      }
    }
  };
}

function normalizeComponent(component, context) {
  const nodeId = nodeIdOf(component);
  const detailNode = context.nodeIndex.get(nodeId)?.node;
  const componentSetId =
    component.componentSetId ??
    component.component_set_id ??
    component.componentSetNodeId ??
    detailNode?.componentSetId ??
    detailNode?.componentSetID ??
    component.containing_frame?.containingComponentSet;
  const componentSetKey = component.componentSetKey ?? detailNode?.componentSetKey;
  const componentProperties = normalizeComponentProperties(
    detailNode?.componentPropertyDefinitions ?? component.componentPropertyDefinitions
  );

  return {
    source: context.source,
    key: component.key,
    nodeId,
    name: component.name ?? detailNode?.name ?? "Unnamed Component",
    description: component.description ?? detailNode?.description ?? "",
    type: "COMPONENT",
    fileKey: component.file_key ?? component.fileKey ?? context.fileKey,
    libraryId: context.libraryId,
    url: figmaNodeUrl(component.file_key ?? component.fileKey ?? context.fileKey, nodeId),
    componentSetId,
    componentSetKey,
    variantProperties: detailNode?.variantProperties ?? parseVariantProperties(component.name),
    componentProperties,
    slots: componentProperties
      .filter((property) => property.slot)
      .map((property) => slotFromProperty(property, nodeId, context.source)),
    nestedComponents: [],
    variableBindings: normalizeBoundVariables(detailNode?.boundVariables)
  };
}

function normalizeComponentSet(componentSet, context) {
  const nodeId = nodeIdOf(componentSet);
  const detailNode = context.nodeIndex.get(nodeId)?.node;
  const componentProperties = normalizeComponentProperties(
    detailNode?.componentPropertyDefinitions ?? componentSet.componentPropertyDefinitions
  );

  return {
    source: context.source,
    key: componentSet.key,
    nodeId,
    name: componentSet.name ?? detailNode?.name ?? "Unnamed Component Set",
    description: componentSet.description ?? detailNode?.description ?? "",
    type: "COMPONENT_SET",
    fileKey: componentSet.file_key ?? componentSet.fileKey ?? context.fileKey,
    libraryId: context.libraryId,
    url: figmaNodeUrl(componentSet.file_key ?? componentSet.fileKey ?? context.fileKey, nodeId),
    componentProperties,
    slots: componentProperties
      .filter((property) => property.slot)
      .map((property) => slotFromProperty(property, nodeId, context.source)),
    variants: [],
    nestedComponents: [],
    variableBindings: normalizeBoundVariables(detailNode?.boundVariables)
  };
}

function normalizeStyle(style, context) {
  const nodeId = nodeIdOf(style);
  const detailNode = context.nodeIndex.get(nodeId)?.node;

  return {
    source: context.source,
    key: style.key,
    nodeId,
    name: style.name ?? detailNode?.name ?? "Unnamed Style",
    description: style.description ?? "",
    type: style.style_type ?? style.styleType ?? detailNode?.styleType ?? "UNKNOWN",
    fileKey: style.file_key ?? style.fileKey ?? context.fileKey,
    libraryId: context.libraryId,
    url: figmaNodeUrl(style.file_key ?? style.fileKey ?? context.fileKey, nodeId)
  };
}

function normalizeComponentProperties(definitions = {}) {
  return Object.entries(definitions).map(([name, definition]) => ({
    name,
    label: stripPropertySuffix(name),
    type: definition.type ?? "UNKNOWN",
    defaultValue: definition.defaultValue,
    variantOptions: definition.variantOptions ?? [],
    preferredValues: definition.preferredValues ?? [],
    description: definition.description ?? "",
    boundVariables: normalizeBoundVariables(definition.boundVariables),
    slot: definition.type === "INSTANCE_SWAP" || /\bslot\b/i.test(definition.description ?? "")
  }));
}

function normalizeVariables(payload, context) {
  const meta = payload?.meta ?? payload ?? {};
  const variableCollections = meta.variableCollections ?? meta.collections ?? {};
  const variables = meta.variables ?? {};
  const collections = Object.entries(variableCollections).map(([id, collection]) => ({
    source: context.source,
    collectionId: collection.id ?? id,
    collectionKey: collection.key,
    name: collection.name ?? "Unnamed Variable Collection",
    libraryId: context.libraryId,
    modes: (collection.modes ?? []).map((mode) => ({
      modeId: mode.modeId ?? mode.mode_id ?? mode.id,
      name: mode.name
    }))
  }));
  const variablesById = new Map(
    Object.entries(variables).map(([id, variable]) => [variable.id ?? id, { id, ...variable }])
  );
  const boundNodeIdsByVariableId = collectBoundVariableNodeIds(context.nodeIndex);

  const references = Object.entries(variables).map(([id, variable]) => {
    const variableId = variable.id ?? id;
    const collectionId =
      variable.variableCollectionId ?? variable.variable_collection_id ?? variable.collectionId;
    const resolvedModeId = firstKey(variable.valuesByMode) ?? findCollectionDefaultMode(collections, collectionId);
    const aliasChain = buildAliasChain(variableId, variablesById, resolvedModeId);

    return {
      source: context.source,
      variableId,
      variableKey: variable.key,
      name: variable.name ?? "Unnamed Variable",
      collectionId,
      role: variableRole(variable.name),
      type: variable.resolvedType ?? variable.type ?? "UNKNOWN",
      resolvedModeId,
      valuesByMode: variable.valuesByMode ?? {},
      boundNodeIds: boundNodeIdsByVariableId.get(variableId) ?? [],
      aliasChain
    };
  });

  return {
    source: context.source,
    collections,
    references
  };
}

function normalizeExamples(file, nodeIndex, componentLookup, context) {
  const directExamples = normalizeDirectExamples(file.examples, context);
  const documentExamples = [];

  for (const indexedNode of nodeIndex.values()) {
    if (!hasAncestorNamed(indexedNode, /examples?/i)) {
      continue;
    }

    if (!["FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE"].includes(indexedNode.node.type)) {
      continue;
    }

    documentExamples.push(exampleFromNode(indexedNode.node, componentLookup, context));
  }

  return dedupeBy([...directExamples, ...documentExamples], (example) => example.nodeId);
}

function normalizeApprovedPatterns(file, nodeIndex, componentLookup, context) {
  const directPatterns = normalizeDirectPatterns(file.approvedPatterns, context);
  const documentPatterns = [];

  for (const indexedNode of nodeIndex.values()) {
    if (!hasAncestorNamed(indexedNode, /approved patterns?|patterns?/i)) {
      continue;
    }

    if (!["FRAME", "SECTION", "COMPONENT", "COMPONENT_SET"].includes(indexedNode.node.type)) {
      continue;
    }

    documentPatterns.push({
      source: context.source,
      patternId: toStableId(indexedNode.node.name),
      nodeId: indexedNode.node.id,
      name: indexedNode.node.name,
      type: indexedNode.node.type,
      url: figmaNodeUrl(context.fileKey, indexedNode.node.id),
      componentReferences: findNestedComponents(indexedNode.node, componentLookup, context.source)
    });
  }

  return dedupeBy([...directPatterns, ...documentPatterns], (pattern) => pattern.nodeId ?? pattern.patternId);
}

function exampleFromNode(node, componentLookup, context) {
  const component = componentLookup.byNodeId.get(node.componentId);

  return {
    source: context.source,
    nodeId: node.id,
    name: node.name,
    type: node.type,
    url: figmaNodeUrl(context.fileKey, node.id),
    componentId: node.componentId,
    componentKey: component?.key,
    componentName: component?.name,
    componentProperties: node.componentProperties ?? {},
    nestedComponents: findNestedComponents(node, componentLookup, context.source)
  };
}

function findNestedComponents(node, componentLookup, source) {
  if (!node?.children) {
    return [];
  }

  const nested = [];
  walkNode(node, (child, parent) => {
    if (child === node || child.type !== "INSTANCE") {
      return;
    }

    const component = componentLookup.byNodeId.get(child.componentId);
    nested.push({
      source,
      nodeId: child.id,
      name: child.name,
      type: child.type,
      parentNodeId: parent?.id,
      componentId: child.componentId,
      componentKey: component?.key,
      componentName: component?.name,
      componentSetKey: component?.componentSetKey,
      componentProperties: child.componentProperties ?? {}
    });
  });

  return nested;
}

function findNodeSlots(node, componentProperties, fileKey, source) {
  if (!node?.children) {
    return [];
  }

  const propertiesByName = new Map(componentProperties.map((property) => [property.name, property]));
  const slots = [];

  walkNode(node, (child, parent) => {
    if (child === node) {
      return;
    }

    if (isSlotNode(child)) {
      slots.push({
        source,
        name: child.name,
        kind: "node",
        hostNodeId: node.id,
        nodeId: child.id,
        parentNodeId: parent?.id,
        url: figmaNodeUrl(fileKey, child.id)
      });
    }

    for (const propertyName of Object.values(child.componentPropertyReferences ?? {})) {
      const property = propertiesByName.get(propertyName);
      if (property?.slot) {
        slots.push({
          ...slotFromProperty(property, node.id, source),
          nodeId: child.id,
          parentNodeId: parent?.id,
          url: figmaNodeUrl(fileKey, child.id)
        });
      }
    }
  });

  return slots;
}

function buildDiscoveryNodes({ components, componentSets, styles, examples, libraryId }) {
  const componentSetNodes = componentSets.map((componentSet) => ({
    role: "library_component_set",
    node: figmaNodeRef(componentSet),
    libraryId,
    componentSetKey: componentSet.key,
    propertyNames: componentSet.componentProperties.map((property) => property.name)
  }));
  const componentNodes = components.map((component) => ({
    role: "library_component",
    node: figmaNodeRef(component),
    libraryId,
    parentNodeId: component.componentSetId,
    componentKey: component.key,
    componentSetKey: component.componentSetKey,
    propertyNames: component.componentProperties.map((property) => property.name)
  }));
  const slotNodes = components.flatMap((component) =>
    component.slots
      .filter((slot) => slot.nodeId)
      .map((slot) => ({
        role: "slot",
        node: {
          nodeId: slot.nodeId,
          name: slot.name,
          type: "FRAME",
          url: slot.url
        },
        libraryId,
        parentNodeId: slot.parentNodeId ?? component.nodeId,
        componentKey: component.key,
        componentSetKey: component.componentSetKey,
        propertyNames: slot.propertyName ? [slot.propertyName] : []
      }))
  );
  const styleNodes = styles.map((style) => ({
    role: "style",
    node: figmaNodeRef(style, "STYLE"),
    libraryId
  }));
  const exampleNodes = examples.map((example) => ({
    role: "library_instance_example",
    node: {
      nodeId: example.nodeId,
      name: example.name,
      type: example.type,
      url: example.url
    },
    libraryId,
    componentKey: example.componentKey,
    propertyNames: Object.keys(example.componentProperties ?? {})
  }));

  return dedupeBy(
    [...componentSetNodes, ...componentNodes, ...slotNodes, ...styleNodes, ...exampleNodes],
    (entry) => `${entry.role}:${entry.node.nodeId}`
  );
}

function normalizeRecordList(payload, fieldName) {
  if (Array.isArray(payload)) {
    return payload;
  }

  const candidates = [
    payload?.[fieldName],
    payload?.meta?.[fieldName],
    payload?.meta?.[toSnakePlural(fieldName)]
  ];
  const candidate = candidates.find(Boolean);

  if (Array.isArray(candidate)) {
    return candidate;
  }

  return normalizeRecordMap(candidate);
}

function normalizeRecordMap(map = {}) {
  return Object.entries(map ?? {}).map(([nodeId, record]) => ({
    node_id: record.node_id ?? record.nodeId ?? nodeId,
    ...record
  }));
}

function mergeRecords(...groups) {
  return dedupeBy(groups.flat(), (record) => record.key ?? nodeIdOf(record));
}

function indexDocument(document) {
  const index = new Map();

  if (!document) {
    return index;
  }

  walkNode(document, (node, parent, ancestors) => {
    if (node.id) {
      index.set(node.id, { node, parent, ancestors });
    }
  });

  return index;
}

function walkNode(node, visit, parent = undefined, ancestors = []) {
  visit(node, parent, ancestors);

  for (const child of node.children ?? []) {
    walkNode(child, visit, node, [...ancestors, { node, parent }]);
  }
}

function buildComponentLookup(components) {
  const byNodeId = new Map();
  const byKey = new Map();

  for (const component of components) {
    byNodeId.set(component.nodeId, component);
    if (component.key) {
      byKey.set(component.key, component);
    }
  }

  return { byNodeId, byKey };
}

function collectBoundVariableNodeIds(nodeIndex) {
  const byVariableId = new Map();

  for (const { node } of nodeIndex.values()) {
    for (const variableId of extractVariableIds(node.boundVariables)) {
      pushUnique(byVariableId, variableId, node.id);
    }

    for (const definition of Object.values(node.componentPropertyDefinitions ?? {})) {
      for (const variableId of extractVariableIds(definition.boundVariables)) {
        pushUnique(byVariableId, variableId, node.id);
      }
    }
  }

  return byVariableId;
}

function extractVariableIds(value) {
  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(extractVariableIds);
  }

  if (typeof value === "object") {
    if (value.type === "VARIABLE_ALIAS" && value.id) {
      return [value.id];
    }

    if (value.id && Object.keys(value).length <= 2) {
      return [value.id];
    }

    return Object.values(value).flatMap(extractVariableIds);
  }

  return [];
}

function normalizeBoundVariables(value) {
  const variableIds = extractVariableIds(value);

  if (variableIds.length === 0) {
    return [];
  }

  return [...new Set(variableIds)].map((variableId) => ({ variableId }));
}

function buildAliasChain(variableId, variablesById, modeId, seen = new Set()) {
  if (seen.has(variableId)) {
    return [];
  }

  const variable = variablesById.get(variableId);
  if (!variable) {
    return [];
  }

  const current = {
    variableId,
    name: variable.name ?? "Unnamed Variable",
    role: variableRole(variable.name)
  };
  const modeValue = variable.valuesByMode?.[modeId] ?? Object.values(variable.valuesByMode ?? {})[0];
  const aliasId = modeValue?.type === "VARIABLE_ALIAS" ? modeValue.id : undefined;

  if (!aliasId) {
    return [current];
  }

  return [current, ...buildAliasChain(aliasId, variablesById, modeId, new Set([...seen, variableId]))];
}

function slotFromProperty(property, hostNodeId, source) {
  return {
    source,
    name: property.label,
    kind: "component_property",
    propertyName: property.name,
    hostNodeId,
    acceptedValues: property.preferredValues,
    defaultValue: property.defaultValue,
    description: property.description
  };
}

function slotKey(slot) {
  return `${slot.hostNodeId}:${slot.propertyName ?? ""}:${slot.nodeId ?? ""}:${slot.name}`;
}

function isSlotNode(node) {
  return (
    node.isSlot === true ||
    /\bslot\b/i.test(node.name ?? "") ||
    node.figmaDesignerRole === "slot" ||
    node.sharedPluginData?.figmaDesigner?.role === "slot"
  );
}

function normalizeDirectExamples(examples = [], context) {
  return (examples ?? []).map((example) => ({
    source: context.source,
    ...example
  }));
}

function normalizeDirectPatterns(patterns = [], context) {
  return (patterns ?? []).map((pattern) => ({
    source: context.source,
    ...pattern
  }));
}

function hasAncestorNamed(indexedNode, pattern) {
  return indexedNode.ancestors.some((ancestor) => pattern.test(ancestor.node.name ?? ""));
}

function parseVariantProperties(name = "") {
  const result = {};

  for (const part of name.split(",").map((part) => part.trim())) {
    const [key, value] = part.split("=").map((item) => item?.trim());
    if (key && value) {
      result[key] = value;
    }
  }

  return result;
}

function figmaNodeRef(record, overrideType) {
  return {
    nodeId: record.nodeId,
    name: record.name,
    type: overrideType ?? record.type ?? "UNKNOWN",
    url: record.url
  };
}

function nodeIdOf(record = {}) {
  return record.node_id ?? record.nodeId ?? record.id;
}

function firstKey(value = {}) {
  return Object.keys(value)[0];
}

function findCollectionDefaultMode(collections, collectionId) {
  return collections.find((collection) => collection.collectionId === collectionId)?.modes[0]?.modeId;
}

function findLibraryFileKey(file, componentsPayload, componentSetsPayload, fallback) {
  return (
    file.libraryFileKey ??
    firstRecordFileKey(componentsPayload, "components") ??
    firstRecordFileKey(componentSetsPayload, "componentSets") ??
    fallback
  );
}

function firstRecordFileKey(payload, fieldName) {
  const [record] = normalizeRecordList(payload, fieldName);
  return record?.file_key ?? record?.fileKey;
}

function figmaFileUrl(fileKey, fileName) {
  return `https://www.figma.com/design/${encodeURIComponent(fileKey)}/${toSlug(fileName)}`;
}

function figmaNodeUrl(fileKey, nodeId) {
  return `${figmaFileUrl(fileKey, "Figma-File")}?node-id=${encodeURIComponent(
    String(nodeId).replaceAll(":", "-")
  )}`;
}

function toIsoTimestamp(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toSnakePlural(value) {
  return value.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function variableRole(name = "") {
  if (/^primitive\//i.test(name)) {
    return "primitive";
  }
  if (/^semantic\//i.test(name)) {
    return "semantic";
  }
  if (/^component\//i.test(name)) {
    return "component";
  }
  return "unknown";
}

function stripPropertySuffix(name) {
  return name.replace(/#.*$/, "");
}

function toStableId(value) {
  return (
    String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "library"
  );
}

function toSlug(value) {
  return encodeURIComponent(toStableId(value));
}

function pushUnique(map, key, value) {
  const existing = map.get(key) ?? [];
  if (!existing.includes(value)) {
    existing.push(value);
  }
  map.set(key, existing);
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
