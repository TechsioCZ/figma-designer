const schemaVersion = "1.0.0";
const kind = "figma-component-nesting-map";
const disposableNotice =
  "Ephemeral per-run component nesting map. Refresh live Figma discovery for later runs; this is not a permanent design-system manifest.";

export class ComponentNestingMapError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ComponentNestingMapError";
    this.details = details;
  }
}

export function buildComponentNestingMap(discovery, options = {}) {
  assertDiscovery(discovery);

  const generatedAt = toIsoTimestamp(options.now ?? new Date());
  const components = discovery.components ?? [];
  const componentSets = discovery.componentSets ?? [];
  const componentByNodeId = new Map(components.map((component) => [component.nodeId, component]));
  const componentSetByNodeId = new Map(componentSets.map((componentSet) => [componentSet.nodeId, componentSet]));
  const componentSetByKey = new Map(
    componentSets
      .filter((componentSet) => componentSet.key)
      .map((componentSet) => [componentSet.key, componentSet])
  );
  const variableById = new Map(
    (discovery.variables?.references ?? []).map((variable) => [variable.variableId, variable])
  );

  const componentSetEntries = componentSets.map((componentSet) =>
    buildHostEntry(componentSet, {
      hostType: "COMPONENT_SET",
      componentByNodeId,
      parentComponentSet: null,
      variableById
    })
  );
  const componentEntries = components.map((component) => {
    const parentComponentSet =
      componentSetByNodeId.get(component.componentSetId) ??
      componentSetByKey.get(component.componentSetKey) ??
      null;

    return buildHostEntry(component, {
      hostType: "COMPONENT",
      componentByNodeId,
      parentComponentSet,
      variableById
    });
  });
  const entries = [...componentSetEntries, ...componentEntries];
  const slotRelationships = entries.flatMap((entry) => entry.slotRelationships);
  const safeInstanceConfigurationPaths = dedupeBy(
    entries.flatMap((entry) => entry.safeInstanceConfigurationPaths),
    (path) => `${path.hostNodeId}:${path.propertyName}:${path.kind}`
  );

  return {
    kind,
    schemaVersion,
    source: discovery.source ?? "unknown",
    generatedAt,
    runId: options.runId ?? discovery.runId,
    lifetime: "single_run",
    disposable: true,
    sourceOfTruth: false,
    notice: disposableNotice,
    figmaFile: cloneJson(discovery.figmaFile),
    library: cloneJson(discovery.library),
    summary: {
      componentSetCount: componentSetEntries.length,
      componentCount: componentEntries.length,
      nestedComponentCount: entries.reduce((count, entry) => count + entry.nestedComponents.length, 0),
      slotRelationshipCount: slotRelationships.length,
      variableBindingCount: entries.reduce((count, entry) => count + entry.variableBindings.length, 0),
      safeInstanceConfigurationPathCount: safeInstanceConfigurationPaths.length
    },
    componentSets: componentSetEntries,
    components: componentEntries,
    slotRelationships,
    safeInstanceConfigurationPaths
  };
}

function buildHostEntry(host, context) {
  const componentProperties = normalizeHostProperties(host, context.parentComponentSet);
  const safeInstanceConfigurationPaths = componentProperties.map((property) =>
    safeConfigurationPathForProperty(property, host, context.hostType)
  );
  const slots = normalizeHostSlots(host, context.parentComponentSet, safeInstanceConfigurationPaths);
  const nestedComponents = normalizeNestedComponents(host, slots, context);
  const slotRelationships = buildSlotRelationships(host, slots, nestedComponents, context.hostType);
  const variableBindings = [
    ...normalizeVariableBindings(host.variableBindings, {
      host,
      variableById: context.variableById,
      scope: "host",
      path: "boundVariables"
    }),
    ...componentProperties.flatMap((property) =>
      normalizeVariableBindings(property.boundVariables, {
        host,
        variableById: context.variableById,
        scope: "component_property",
        propertyName: property.name,
        path: `componentPropertyDefinitions["${property.name}"].boundVariables`
      })
    )
  ];

  return {
    source: host.source,
    host: hostRef(host, context.hostType),
    parentComponentSet: context.parentComponentSet
      ? {
          key: context.parentComponentSet.key,
          nodeId: context.parentComponentSet.nodeId,
          name: context.parentComponentSet.name
        }
      : undefined,
    variantProperties: cloneJson(host.variantProperties ?? {}),
    componentProperties,
    slots,
    nestedComponents,
    slotRelationships,
    variableBindings,
    safeInstanceConfigurationPaths
  };
}

function normalizeHostProperties(host, parentComponentSet) {
  const inheritedProperties = parentComponentSet?.componentProperties ?? [];
  const directProperties = host.componentProperties ?? [];

  return dedupeBy([...directProperties, ...inheritedProperties], (property) => property.name).map(
    (property) => ({
      name: property.name,
      label: property.label ?? stripPropertySuffix(property.name),
      type: property.type ?? "UNKNOWN",
      defaultValue: cloneJson(property.defaultValue),
      variantOptions: cloneJson(property.variantOptions ?? []),
      preferredValues: cloneJson(property.preferredValues ?? []),
      description: property.description ?? "",
      slot: property.slot === true,
      boundVariables: cloneJson(property.boundVariables ?? [])
    })
  );
}

function normalizeHostSlots(host, parentComponentSet, safeInstanceConfigurationPaths) {
  const inheritedSlots = (parentComponentSet?.slots ?? []).map((slot) => ({
    ...slot,
    inheritedFromHostNodeId: parentComponentSet.nodeId,
    hostNodeId: host.nodeId
  }));
  const directSlots = host.slots ?? [];
  const pathByPropertyName = new Map(
    safeInstanceConfigurationPaths.map((path) => [path.propertyName, path])
  );

  return dedupeBy([...directSlots, ...inheritedSlots], slotKey).map((slot) => {
    const safePath = slot.propertyName ? pathByPropertyName.get(slot.propertyName) : undefined;

    return {
      source: slot.source ?? host.source,
      name: slot.name,
      kind: slot.kind ?? "unknown",
      hostNodeId: host.nodeId,
      inheritedFromHostNodeId: slot.inheritedFromHostNodeId,
      propertyName: slot.propertyName,
      nodeId: slot.nodeId,
      parentNodeId: slot.parentNodeId,
      url: slot.url,
      defaultValue: cloneJson(slot.defaultValue),
      acceptedValues: cloneJson(slot.acceptedValues ?? []),
      acceptedComponentKeys: acceptedValuesByType(slot.acceptedValues, "COMPONENT"),
      acceptedComponentSetKeys: acceptedValuesByType(slot.acceptedValues, "COMPONENT_SET"),
      description: slot.description ?? "",
      safeConfigurationPath: safePath?.path,
      configurationKind: safePath?.kind
    };
  });
}

function normalizeNestedComponents(host, slots, context) {
  return (host.nestedComponents ?? []).map((nested) => {
    const component = context.componentByNodeId.get(nested.componentId);
    const slot = findContainingSlot(nested, slots);
    const instanceComponentProperties = normalizeInstanceComponentProperties(
      nested.componentProperties ?? {}
    );

    return {
      source: nested.source ?? host.source,
      nodeId: nested.nodeId,
      name: nested.name,
      type: nested.type ?? "INSTANCE",
      parentNodeId: nested.parentNodeId,
      componentId: nested.componentId,
      componentKey: nested.componentKey ?? component?.key,
      componentName: nested.componentName ?? component?.name,
      componentSetKey: nested.componentSetKey ?? component?.componentSetKey,
      slotName: slot?.name,
      slotNodeId: slot?.nodeId,
      slotPropertyName: slot?.propertyName,
      safeConfigurationPath: slot?.safeConfigurationPath,
      configurationKind: slot ? "slot_relationship" : "library_authored_nested_instance",
      instanceComponentProperties
    };
  });
}

function buildSlotRelationships(host, slots, nestedComponents, hostType) {
  return slots.flatMap((slot) => {
    const nestedInSlot = nestedComponents.filter(
      (nested) =>
        nested.slotNodeId === slot.nodeId ||
        (slot.propertyName && nested.slotPropertyName === slot.propertyName)
    );

    if (nestedInSlot.length === 0) {
      return [slotRelationship(host, hostType, slot)];
    }

    return nestedInSlot.map((nested) => slotRelationship(host, hostType, slot, nested));
  });
}

function slotRelationship(host, hostType, slot, nested) {
  return {
    source: slot.source ?? host.source,
    hostType,
    hostNodeId: host.nodeId,
    hostKey: host.key,
    hostName: host.name,
    slotName: slot.name,
    slotKind: slot.kind,
    slotNodeId: slot.nodeId,
    slotPropertyName: slot.propertyName,
    nestedNodeId: nested?.nodeId,
    nestedComponentId: nested?.componentId,
    nestedComponentKey: nested?.componentKey,
    nestedComponentName: nested?.componentName,
    relationship: slot.propertyName ? "instance_swap_property" : "slot_node",
    acceptedComponentKeys: cloneJson(slot.acceptedComponentKeys ?? []),
    acceptedComponentSetKeys: cloneJson(slot.acceptedComponentSetKeys ?? []),
    safeConfigurationPath: slot.safeConfigurationPath,
    detachRequired: false
  };
}

function normalizeVariableBindings(bindings = [], context) {
  return (bindings ?? []).map((binding) => {
    const variable = context.variableById.get(binding.variableId);

    return {
      scope: context.scope,
      hostNodeId: context.host.nodeId,
      hostKey: context.host.key,
      propertyName: context.propertyName,
      path: context.path,
      variableId: binding.variableId,
      variableKey: variable?.variableKey,
      variableName: variable?.name,
      role: variable?.role ?? "unknown",
      type: variable?.type ?? "UNKNOWN",
      collectionId: variable?.collectionId,
      resolvedModeId: variable?.resolvedModeId,
      aliasChain: cloneJson(variable?.aliasChain ?? [])
    };
  });
}

function safeConfigurationPathForProperty(property, host, hostType) {
  const kindByType = {
    VARIANT: "variant_property",
    INSTANCE_SWAP: "slot_instance_swap",
    BOOLEAN: "boolean_property",
    TEXT: "text_property"
  };
  const kind = kindByType[property.type] ?? "component_property";

  return {
    kind,
    hostType,
    hostNodeId: host.nodeId,
    hostKey: host.key,
    hostName: host.name,
    componentSetKey: host.componentSetKey,
    propertyName: property.name,
    propertyLabel: property.label,
    propertyType: property.type,
    path: `componentProperties["${property.name}"].value`,
    method: "set_instance_component_property",
    allowedValues: allowedValuesForProperty(property),
    detachRequired: false
  };
}

function normalizeInstanceComponentProperties(properties = {}) {
  return Object.entries(properties).map(([name, value]) => ({
    name,
    label: stripPropertySuffix(name),
    type: value?.type ?? "UNKNOWN",
    value: cloneJson(value?.value)
  }));
}

function findContainingSlot(nested, slots) {
  const propertyBackedMatch = slots.find(
    (slot) =>
      slot.propertyName &&
      ((slot.nodeId && nested.parentNodeId === slot.nodeId) ||
        (slot.nodeId && nested.nodeId === slot.nodeId) ||
        nested.componentProperties?.[slot.propertyName])
  );

  return (
    propertyBackedMatch ??
    slots.find(
      (slot) =>
        (slot.nodeId && nested.parentNodeId === slot.nodeId) ||
        (slot.nodeId && nested.nodeId === slot.nodeId)
    )
  );
}

function allowedValuesForProperty(property) {
  if (property.type === "VARIANT") {
    return cloneJson(property.variantOptions ?? []);
  }

  if (property.type === "INSTANCE_SWAP") {
    return cloneJson(property.preferredValues ?? []);
  }

  if (property.type === "BOOLEAN") {
    return [true, false];
  }

  return [];
}

function acceptedValuesByType(values = [], type) {
  return (values ?? [])
    .filter((value) => value?.type === type && value.key)
    .map((value) => value.key);
}

function hostRef(host, hostType) {
  return {
    type: hostType,
    key: host.key,
    nodeId: host.nodeId,
    name: host.name,
    componentSetKey: host.componentSetKey,
    url: host.url
  };
}

function assertDiscovery(discovery) {
  if (!discovery || typeof discovery !== "object") {
    throw new ComponentNestingMapError("Discovery output is required to build a component nesting map.");
  }

  if (discovery.kind !== "figma-library-discovery") {
    throw new ComponentNestingMapError("Unsupported discovery payload for component nesting map.", {
      kind: discovery.kind
    });
  }

  if (!Array.isArray(discovery.components) || !Array.isArray(discovery.componentSets)) {
    throw new ComponentNestingMapError("Discovery payload must include components and componentSets arrays.");
  }
}

function slotKey(slot) {
  return `${slot.hostNodeId ?? ""}:${slot.propertyName ?? ""}:${slot.nodeId ?? ""}:${slot.name}`;
}

function stripPropertySuffix(name = "") {
  return name.replace(/#.*$/, "");
}

function toIsoTimestamp(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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
