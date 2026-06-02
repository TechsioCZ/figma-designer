import { allRuleGroupIds, runRuleGroups } from "../rules/index.mjs";

const schemaVersion = "1.0.0";
const kind = "figma-design-operation-plan";
const defaultDimensions = Object.freeze({ width: 1440, height: 1024 });

export class DesignGeneratorError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DesignGeneratorError";
    this.details = details;
  }
}

export function generateDesignPlan(input = {}, options = {}) {
  const brief = normalizeBrief(input.brief ?? input.fixture ?? input);
  const discovery = input.discovery;
  const nestingMap = input.nestingMap ?? input.componentNestingMap;
  assertGenerationInput({ brief, discovery, nestingMap });

  const generatedAt = toIsoTimestamp(options.now ?? new Date());
  const runId = options.runId ?? brief.runId ?? "generate-design-run";
  const assetIndex = buildAssetIndex(discovery, nestingMap);
  const requiredCapabilities = requiredCapabilitiesForBrief(brief);
  const missingCapabilities = requiredCapabilities.filter(
    (capability) => !findAssetForCapability(capability, assetIndex)
  );

  if (missingCapabilities.length > 0) {
    return blockedPlan({
      brief,
      discovery,
      nestingMap,
      assetIndex,
      missingCapabilities,
      runId,
      generatedAt
    });
  }

  const planner = createPlanner({ runId, discovery, assetIndex });
  const screen = planScreen(brief, planner);
  const design = {
    runId,
    nodes: [screen.root]
  };
  const layout = {
    source: "figma-generate-design",
    root: screen.root
  };
  const spacing = buildSpacingFixture(screen, planner);
  const finalBindings = screen.finalBindings;
  const variablePolicy = buildVariablePolicy(discovery, finalBindings);
  const ruleChecks = runRuleGroups(
    {
      runId,
      discovery,
      nestingMap,
      design,
      layout,
      spacing,
      variablePolicy,
      rawFinalValues: [],
      proposedVariables: [],
      finalBindings,
      designSystemGaps: [],
      provisionalExtensions: []
    },
    {
      groups: allRuleGroupIds,
      runId,
      now: generatedAt
    }
  );

  return {
    kind,
    schemaVersion,
    mode: "plan_only",
    runId,
    generatedAt,
    source: discovery.source ?? "unknown",
    status: ruleChecks.status === "passed" ? "passed" : "failed",
    planStatus: ruleChecks.status === "passed" ? "ready" : "needs_iteration",
    brief: brief.summary,
    strictComposition: {
      librarySource: discovery.library?.name,
      noDetach: true,
      provisionalExtensionsCreated: false,
      liveWritePerformed: false
    },
    summary: {
      screenCount: 1,
      operationCount: planner.operations.length,
      componentCount: screen.componentsUsed.length,
      variableCount: screen.variablesUsed.length,
      styleCount: screen.stylesUsed.length,
      approvedPatternCount: screen.approvedPatternsUsed.length,
      designSystemGapCount: 0
    },
    target: screen.target,
    operations: planner.operations,
    design,
    layout,
    spacing,
    variables: {
      references: screen.variablesUsed
    },
    finalBindings,
    rawFinalValues: [],
    componentsUsed: screen.componentsUsed,
    componentSetsUsed: screen.componentSetsUsed,
    slotsUsed: screen.slotsUsed,
    stylesUsed: screen.stylesUsed,
    approvedPatternsUsed: screen.approvedPatternsUsed,
    designSystemGaps: [],
    provisionalExtensions: [],
    ruleChecks
  };
}

function planScreen(brief, planner) {
  const target = {
    targetId: brief.targetId,
    name: brief.screenName,
    dimensions: brief.dimensions
  };
  const root = layoutNode(planner.nodeId(), brief.screenName, "FRAME", "page", {
    width: brief.dimensions.width,
    height: brief.dimensions.height,
    layoutSizingHorizontal: "FILL"
  });
  const headerSection = layoutNode(planner.nodeId(), `${brief.screenName} Header`, "SECTION", "section");
  const title = {
    nodeId: planner.nodeId(),
    name: brief.title,
    type: "TEXT",
    generated: true,
    text: brief.title,
    styleKey: planner.bodyTextStyle?.key,
    styleName: planner.bodyTextStyle?.name
  };
  const formSection = layoutNode(planner.nodeId(), `${brief.screenName} Form`, "SECTION", "section");
  const formContainer = layoutNode(planner.nodeId(), "Login Form Container", "FRAME", "container");

  headerSection.children.push(title);
  formSection.children.push(formContainer);
  root.children.push(headerSection, formSection);

  planner.operation("create_frame", {
    node: nodeRef(root),
    target,
    dimensions: target.dimensions
  });
  planner.operation("configure_auto_layout", {
    node: nodeRef(root),
    layoutMode: root.layoutMode,
    primaryAxisAlignItems: root.primaryAxisAlignItems,
    counterAxisAlignItems: root.counterAxisAlignItems
  });
  planner.operation("create_section", {
    parentNodeId: root.nodeId,
    node: nodeRef(headerSection),
    layoutMode: headerSection.layoutMode
  });
  planner.operation("create_text", {
    parentNodeId: headerSection.nodeId,
    node: nodeRef(title),
    text: title.text
  });
  if (planner.bodyTextStyle) {
    planner.operation("apply_style", {
      node: nodeRef(title),
      style: styleRef(planner.bodyTextStyle),
      property: "textStyle"
    });
  }
  planner.operation("create_section", {
    parentNodeId: root.nodeId,
    node: nodeRef(formSection),
    layoutMode: formSection.layoutMode
  });
  planner.operation("create_frame", {
    parentNodeId: formSection.nodeId,
    node: nodeRef(formContainer),
    layoutRole: formContainer.layoutRole
  });
  if (planner.loginPattern) {
    planner.operation("use_approved_pattern", {
      pattern: patternRef(planner.loginPattern),
      appliedToNodeId: formContainer.nodeId,
      reason: "The brief matches the discovered login form composition pattern."
    });
  }

  const fields = brief.fields.map((field) => planner.textField(field));
  const primaryAction = planner.button(brief.primaryAction);
  formContainer.children.push(...fields.map((field) => field.node), primaryAction.node);

  planner.operation("create_prototype_connection", {
    fromNodeId: primaryAction.node.nodeId,
    to: brief.prototypeTarget,
    trigger: "click",
    action: "navigate",
    status: "planned"
  });

  const componentsUsed = dedupeBy(
    [primaryAction.component, ...fields.map((field) => field.component), ...primaryAction.slotComponents],
    (component) => component.key
  ).map(componentRef);
  const componentSetsUsed = dedupeBy(
    [primaryAction.componentSet, ...fields.map((field) => field.componentSet)].filter(Boolean),
    (componentSet) => componentSet.key
  ).map(componentSetRef);
  const variablesUsed = dedupeBy(
    [planner.buttonSurfaceVariable].filter(Boolean),
    (variable) => variable.variableId
  ).map(variableRef);
  const stylesUsed = planner.bodyTextStyle ? [styleRef(planner.bodyTextStyle)] : [];
  const approvedPatternsUsed = planner.loginPattern ? [patternRef(planner.loginPattern)] : [];
  const slotsUsed = primaryAction.slotsUsed;
  const finalBindings = planner.buttonSurfaceVariable
    ? [
        {
          node: nodeRef(primaryAction.node),
          property: "fills",
          variableId: planner.buttonSurfaceVariable.variableId,
          variableName: planner.buttonSurfaceVariable.name
        }
      ]
    : [];

  return {
    target,
    root,
    componentsUsed,
    componentSetsUsed,
    variablesUsed,
    stylesUsed,
    approvedPatternsUsed,
    slotsUsed,
    finalBindings
  };
}

function createPlanner({ runId, discovery, assetIndex }) {
  let nextNodeIndex = 1;
  let nextOperationIndex = 1;
  const operations = [];
  const buttonSet = assetIndex.assetsByNormalizedName.get("button");
  const textFieldSet = assetIndex.assetsByNormalizedName.get("text-field");
  const icon = assetIndex.assetsByNormalizedName.get("icon-search");
  const buttonComponent = selectVariant(buttonSet, assetIndex, {
    Variant: "Primary",
    Size: "Medium",
    State: "Default"
  });
  const textFieldComponent = selectVariant(textFieldSet, assetIndex, {
    State: "Default"
  });

  return {
    operations,
    bodyTextStyle: findStyle(discovery, "text-body"),
    loginPattern: findApprovedPattern(discovery, "login"),
    buttonSurfaceVariable: findVariable(discovery, "component-button-background-primary"),
    spacingVariable: findVariable(discovery, "primitive-spacing-200"),
    nodeId() {
      const nodeId = `generated:${nextNodeIndex}`;
      nextNodeIndex += 1;
      return nodeId;
    },
    operation(type, fields) {
      operations.push({
        operationId: `${runId}:op-${String(nextOperationIndex).padStart(2, "0")}`,
        type,
        status: "planned",
        liveWrite: false,
        ...cloneJson(fields)
      });
      nextOperationIndex += 1;
    },
    textField(field) {
      const node = instanceNode(this.nodeId(), field.name, textFieldComponent, textFieldSet, {
        State: propertyValue("VARIANT", "Default"),
        "HelperTextVisible#210:12": propertyValue("BOOLEAN", field.helperTextVisible ?? true)
      });
      this.operation("place_instance", {
        parentRole: "form_item",
        node: nodeRef(node),
        component: componentRef(textFieldComponent),
        componentSet: componentSetRef(textFieldSet)
      });
      this.operation("set_instance_component_property", {
        node: nodeRef(node),
        propertyName: "State",
        propertyType: "VARIANT",
        value: "Default",
        safeConfigurationPath: safePathFor(textFieldComponent, assetIndex, "State")
      });
      this.operation("set_instance_component_property", {
        node: nodeRef(node),
        propertyName: "HelperTextVisible#210:12",
        propertyType: "BOOLEAN",
        value: field.helperTextVisible ?? true,
        safeConfigurationPath: safePathFor(textFieldComponent, assetIndex, "HelperTextVisible#210:12")
      });
      return {
        node,
        component: textFieldComponent,
        componentSet: textFieldSet
      };
    },
    button(action) {
      const labelProperty = "Label#200:14";
      const iconProperty = "LeadingIcon#200:12";
      const iconNode = instanceNode(this.nodeId(), "Search Icon Slot", icon, undefined, {});
      iconNode.slotName = "LeadingIcon";
      iconNode.slotPropertyName = iconProperty;
      const node = instanceNode(this.nodeId(), action.name, buttonComponent, buttonSet, {
        Variant: propertyValue("VARIANT", "Primary"),
        Size: propertyValue("VARIANT", "Medium"),
        State: propertyValue("VARIANT", "Default"),
        [labelProperty]: propertyValue("TEXT", action.label),
        [iconProperty]: propertyValue("INSTANCE_SWAP", icon.key)
      });
      node.children.push(iconNode);
      this.operation("place_instance", {
        parentRole: "interactive_cluster",
        node: nodeRef(node),
        component: componentRef(buttonComponent),
        componentSet: componentSetRef(buttonSet)
      });
      for (const [propertyName, configuredProperty] of Object.entries(node.componentProperties)) {
        this.operation("set_instance_component_property", {
          node: nodeRef(node),
          propertyName,
          propertyType: configuredProperty.type,
          value: configuredProperty.value,
          safeConfigurationPath: safePathFor(buttonComponent, assetIndex, propertyName)
        });
      }
      this.operation("fill_slot", {
        hostNode: nodeRef(node),
        slotName: "LeadingIcon",
        slotPropertyName: iconProperty,
        childNode: nodeRef(iconNode),
        component: componentRef(icon),
        safeConfigurationPath: safePathFor(buttonComponent, assetIndex, iconProperty)
      });
      if (this.buttonSurfaceVariable) {
        this.operation("bind_variable", {
          node: nodeRef(node),
          property: "fills",
          variable: variableRef(this.buttonSurfaceVariable)
        });
      }
      return {
        node,
        component: buttonComponent,
        componentSet: buttonSet,
        slotComponents: [icon],
        slotsUsed: [
          {
            hostNodeId: node.nodeId,
            hostComponentKey: buttonComponent.key,
            slotName: "LeadingIcon",
            slotPropertyName: iconProperty,
            childNodeId: iconNode.nodeId,
            childComponentKey: icon.key,
            safeConfigurationPath: safePathFor(buttonComponent, assetIndex, iconProperty)
          }
        ]
      };
    }
  };
}

function blockedPlan({ brief, discovery, nestingMap, assetIndex, missingCapabilities, runId, generatedAt }) {
  const designSystemGaps = missingCapabilities.map((capability, index) =>
    missingCapabilityGap(capability, assetIndex, index)
  );
  const ruleChecks = runRuleGroups(
    {
      runId,
      discovery,
      nestingMap,
      design: { runId, nodes: [] },
      variablePolicy: {
        variables: [],
        requiredModes: [],
        rawFinalValues: [],
        proposedVariables: [],
        finalBindings: []
      },
      rawFinalValues: [],
      designSystemGaps,
      provisionalExtensions: []
    },
    {
      groups: ["component", "variable", "provisional"],
      runId,
      now: generatedAt
    }
  );

  return {
    kind,
    schemaVersion,
    mode: "plan_only",
    runId,
    generatedAt,
    source: discovery.source ?? "unknown",
    status: "blocked",
    planStatus: "requires_provisional_extension_approval",
    brief: brief.summary,
    strictComposition: {
      librarySource: discovery.library?.name,
      noDetach: true,
      provisionalExtensionsCreated: false,
      liveWritePerformed: false
    },
    summary: {
      screenCount: 0,
      operationCount: 2,
      componentCount: 0,
      variableCount: 0,
      styleCount: 0,
      approvedPatternCount: 0,
      designSystemGapCount: designSystemGaps.length
    },
    operations: [
      {
        operationId: `${runId}:op-01`,
        type: "search_library_assets",
        status: "completed",
        liveWrite: false,
        capabilities: missingCapabilities,
        searched: {
          components: discovery.components?.length ?? 0,
          componentSets: discovery.componentSets?.length ?? 0,
          approvedPatterns: discovery.approvedPatterns?.length ?? 0
        }
      },
      {
        operationId: `${runId}:op-02`,
        type: "request_provisional_extension_approval",
        status: "blocked",
        liveWrite: false,
        gapIds: designSystemGaps.map((gap) => gap.id),
        approvalRequired: true
      }
    ],
    design: { runId, nodes: [] },
    componentsUsed: [],
    componentSetsUsed: [],
    slotsUsed: [],
    stylesUsed: [],
    approvedPatternsUsed: [],
    designSystemGaps,
    provisionalExtensions: [],
    ruleChecks
  };
}

function buildSpacingFixture(screen, planner) {
  const pattern = planner.loginPattern;
  const patternBinding = pattern
    ? {
        patternId: pattern.patternId,
        patternName: pattern.name
      }
    : undefined;

  return {
    source: "figma-generate-design",
    nodes: [
      {
        nodeId: "generated:form-spacing",
        name: "Login Form Stack",
        role: "form_item",
        relationships: [
          { kind: "label_to_control", ...patternBinding },
          { kind: "control_to_help", ...patternBinding },
          { kind: "item_to_item", ...patternBinding }
        ]
      }
    ]
  };
}

function buildVariablePolicy(discovery, finalBindings) {
  const references = discovery.variables?.references ?? [];
  const referencesById = new Map(references.map((variable) => [variable.variableId, variable]));
  const referencesByName = new Map(references.map((variable) => [variable.name, variable]));
  const used = [];
  const usedKeys = new Set();

  for (const binding of finalBindings) {
    const variable = referencesById.get(binding.variableId) ?? referencesByName.get(binding.variableName);
    collectVariableChain(variable, { referencesById, referencesByName, used, usedKeys });
  }

  const collectionIds = new Set(used.map((variable) => variable.collectionId).filter(Boolean));
  const requiredModes = (discovery.variables?.collections ?? [])
    .filter((collection) => collectionIds.has(collection.collectionId))
    .flatMap((collection) => collection.modes ?? []);

  return {
    variables: used,
    requiredModes,
    rawFinalValues: [],
    proposedVariables: [],
    finalBindings
  };
}

function collectVariableChain(variable, context) {
  if (!variable || context.usedKeys.has(variable.variableId)) {
    return;
  }

  context.usedKeys.add(variable.variableId);
  context.used.push(variable);

  for (const link of variable.aliasChain ?? []) {
    const linked =
      context.referencesById.get(link.variableId) ??
      context.referencesByName.get(link.name);
    if (linked && !context.usedKeys.has(linked.variableId)) {
      collectVariableChain(linked, context);
    }
  }
}

function buildAssetIndex(discovery, nestingMap) {
  const components = discovery.components ?? [];
  const componentSets = discovery.componentSets ?? [];
  const hosts = [...(nestingMap.components ?? []), ...(nestingMap.componentSets ?? [])];
  const componentsByKey = new Map(components.filter((component) => component.key).map((component) => [component.key, component]));
  const componentSetsByKey = new Map(componentSets.filter((set) => set.key).map((set) => [set.key, set]));
  const componentsBySetKey = new Map();
  const hostsByKey = new Map();
  const assetsByNormalizedName = new Map();

  for (const component of components) {
    if (!componentsBySetKey.has(component.componentSetKey)) {
      componentsBySetKey.set(component.componentSetKey, []);
    }
    componentsBySetKey.get(component.componentSetKey).push(component);
  }

  for (const host of hosts) {
    if (host.host?.key) {
      hostsByKey.set(host.host.key, host);
    }
  }

  for (const asset of [...componentSets, ...components]) {
    for (const name of normalizedAssetNames(asset)) {
      if (!assetsByNormalizedName.has(name)) {
        assetsByNormalizedName.set(name, asset);
      }
    }
  }

  return {
    components,
    componentSets,
    componentsByKey,
    componentSetsByKey,
    componentsBySetKey,
    hostsByKey,
    assetsByNormalizedName
  };
}

function normalizeBrief(brief) {
  if (typeof brief === "string") {
    return normalizeBrief({ title: brief, description: brief });
  }

  const title = brief.title ?? brief.name ?? "Generated Screen";
  const description = brief.description ?? brief.prompt ?? "";
  const intent = normalizeName(brief.intent ?? brief.kind ?? brief.type ?? `${title} ${description}`);
  const screen = Array.isArray(brief.screens) ? brief.screens[0] ?? {} : brief.screen ?? {};
  const screenName = screen.name ?? brief.screenName ?? title;
  const fields = normalizeFields(screen.fields ?? brief.fields);
  const actions = normalizeActions(screen.actions ?? brief.actions);
  const dimensions = {
    ...defaultDimensions,
    ...(screen.dimensions ?? brief.dimensions ?? {})
  };

  return {
    raw: cloneJson(brief),
    runId: brief.runId,
    briefId: brief.briefId ?? brief.id,
    title,
    description,
    intent,
    screenName,
    targetId: screen.targetId ?? brief.targetId ?? normalizeName(screenName),
    dimensions,
    requiredComponents: [
      ...arrayify(screen.requiredComponents),
      ...arrayify(brief.requiredComponents)
    ].filter(Boolean),
    fields,
    primaryAction: actions[0] ?? {
      name: "Primary Action",
      label: "Continue",
      variant: "Primary"
    },
    prototypeTarget:
      screen.prototypeTarget ?? brief.prototypeTarget ?? actions[0]?.prototypeTarget ?? "next-screen",
    summary: {
      briefId: brief.briefId ?? brief.id,
      title,
      description,
      intent,
      screenName,
      requiredComponents: [
        ...arrayify(screen.requiredComponents),
        ...arrayify(brief.requiredComponents)
      ].filter(Boolean)
    }
  };
}

function requiredCapabilitiesForBrief(brief) {
  const required = [...brief.requiredComponents];
  if (isLoginBrief(brief)) {
    required.push("Text Field", "Button");
  }
  if (brief.fields.length > 0) {
    required.push("Text Field");
  }
  if (brief.primaryAction) {
    required.push("Button");
  }
  return [...new Set(required.map((capability) => String(capability).trim()).filter(Boolean))];
}

function findAssetForCapability(capability, assetIndex) {
  const aliases = capabilityAliases(capability);
  for (const alias of aliases) {
    const match = assetIndex.assetsByNormalizedName.get(alias);
    if (match) {
      return match;
    }
  }
  return undefined;
}

function capabilityAliases(capability) {
  const normalized = normalizeName(capability);
  const aliases = [normalized];
  const aliasMap = {
    input: ["text-field"],
    field: ["text-field"],
    "email-field": ["text-field"],
    "password-field": ["text-field"],
    cta: ["button"],
    action: ["button"],
    submit: ["button"]
  };
  return [...new Set([...aliases, ...(aliasMap[normalized] ?? [])].filter(Boolean))];
}

function missingCapabilityGap(capability, assetIndex, index) {
  const closestMatches = closestAssetMatches(capability, assetIndex);
  return {
    id: `gap-generate-${index + 1}`,
    category: "missing_library_asset",
    status: "provisional_extension_requested",
    requirement: capability,
    searchSummary:
      "Checked discovered components, component sets, variants, slots, approved patterns, and examples before planning output.",
    closestMatches,
    whyExistingAssetsDoNotSatisfy:
      closestMatches.length > 0
        ? "Closest discovered assets do not match the requested capability name or aliases."
        : "No discovered library asset matched the requested capability.",
    proposedSmallestExtension: `Add or expose the smallest approved "${capability}" component, variant, property, slot, or pattern required by the brief.`,
    approvalRequired: true,
    nextAction:
      "Stop before creating Figma output and ask the operator whether to approve the proposed Provisional Extension."
  };
}

function closestAssetMatches(capability, assetIndex) {
  const normalized = normalizeName(capability);
  return [...assetIndex.assetsByNormalizedName.entries()]
    .filter(([name]) => sharesTerm(name, normalized))
    .slice(0, 3)
    .map(([, asset]) => ({
      key: asset.key,
      nodeId: asset.nodeId,
      name: asset.name,
      type: asset.type
    }));
}

function selectVariant(componentSet, assetIndex, properties) {
  const variants = assetIndex.componentsBySetKey.get(componentSet.key) ?? [];
  return (
    variants.find((variant) =>
      Object.entries(properties).every(
        ([name, value]) => variant.variantProperties?.[name] === value
      )
    ) ?? variants[0]
  );
}

function safePathFor(component, assetIndex, propertyName) {
  const host = assetIndex.hostsByKey.get(component.key);
  return (host?.safeInstanceConfigurationPaths ?? []).find(
    (path) => path.propertyName === propertyName
  )?.path;
}

function findVariable(discovery, normalizedName) {
  return (discovery.variables?.references ?? []).find(
    (variable) => normalizeName(variable.name) === normalizedName
  );
}

function findStyle(discovery, normalizedName) {
  return (discovery.styles ?? []).find((style) => normalizeName(style.name) === normalizedName);
}

function findApprovedPattern(discovery, normalizedName) {
  return (discovery.approvedPatterns ?? []).find((pattern) =>
    normalizeName(pattern.name).includes(normalizedName)
  );
}

function layoutNode(nodeId, name, type, layoutRole, fields = {}) {
  return {
    nodeId,
    name,
    type,
    layoutRole,
    generated: true,
    layoutMode: "VERTICAL",
    primaryAxisAlignItems: "MIN",
    counterAxisAlignItems: "MIN",
    layoutSizingHorizontal: "FILL",
    editable: true,
    children: [],
    ...fields
  };
}

function instanceNode(nodeId, name, component, componentSet, componentProperties) {
  return {
    nodeId,
    name,
    type: "INSTANCE",
    generated: true,
    componentKey: component.key,
    componentId: component.nodeId,
    componentSetKey: componentSet?.key ?? component.componentSetKey,
    componentProperties,
    detached: false,
    children: []
  };
}

function propertyValue(type, value) {
  return { type, value };
}

function normalizeFields(fields) {
  const normalized = arrayify(fields).filter(Boolean);
  if (normalized.length > 0) {
    return normalized.map((field, index) => ({
      name: field.name ?? field.label ?? `Field ${index + 1}`,
      label: field.label ?? field.name ?? `Field ${index + 1}`,
      helperTextVisible: field.helperTextVisible
    }));
  }
  return [
    { name: "Email Field", label: "Email", helperTextVisible: true },
    { name: "Password Field", label: "Password", helperTextVisible: true }
  ];
}

function normalizeActions(actions) {
  return arrayify(actions)
    .filter(Boolean)
    .map((action, index) => ({
      name: action.name ?? action.label ?? `Action ${index + 1}`,
      label: action.label ?? action.name ?? "Continue",
      variant: action.variant ?? "Primary",
      prototypeTarget: action.prototypeTarget
    }));
}

function isLoginBrief(brief) {
  return /\blogin|sign-in|signin|auth|authentication\b/i.test(
    `${brief.intent} ${brief.title} ${brief.description} ${brief.screenName}`
  );
}

function normalizedAssetNames(asset) {
  return [
    normalizeName(asset.name),
    normalizeName(asset.name?.split("/")[0]),
    normalizeName(asset.name?.replace(/\s*\/\s*/g, " ")),
    normalizeName(asset.key)
  ].filter(Boolean);
}

function componentRef(component) {
  return {
    key: component.key,
    nodeId: component.nodeId,
    name: component.name,
    componentSetKey: component.componentSetKey,
    type: component.type
  };
}

function componentSetRef(componentSet) {
  return {
    key: componentSet.key,
    nodeId: componentSet.nodeId,
    name: componentSet.name,
    type: componentSet.type
  };
}

function variableRef(variable) {
  return {
    variableId: variable.variableId,
    variableKey: variable.variableKey,
    name: variable.name,
    role: variable.role,
    type: variable.type,
    collectionId: variable.collectionId,
    collectionName: variable.collectionName,
    resolvedType: variable.resolvedType,
    valuesByMode: cloneJson(variable.valuesByMode ?? {}),
    aliasChain: cloneJson(variable.aliasChain ?? [])
  };
}

function styleRef(style) {
  return {
    key: style.key,
    nodeId: style.nodeId,
    name: style.name,
    type: style.type
  };
}

function patternRef(pattern) {
  return {
    patternId: pattern.patternId,
    nodeId: pattern.nodeId,
    name: pattern.name,
    type: pattern.type
  };
}

function nodeRef(node) {
  return {
    nodeId: node.nodeId,
    name: node.name,
    type: node.type
  };
}

function sharesTerm(left, right) {
  const leftTerms = new Set(String(left).split("-").filter(Boolean));
  return String(right)
    .split("-")
    .some((term) => leftTerms.has(term));
}

function assertGenerationInput({ brief, discovery, nestingMap }) {
  if (!brief || typeof brief !== "object") {
    throw new DesignGeneratorError("A brief fixture is required.");
  }
  if (!discovery || discovery.kind !== "figma-library-discovery") {
    throw new DesignGeneratorError("Generator requires live or fixture library discovery output.");
  }
  if (!nestingMap || nestingMap.kind !== "figma-component-nesting-map") {
    throw new DesignGeneratorError("Generator requires a component nesting map.");
  }
  if (discovery.library?.connectedAsAssets !== true) {
    throw new DesignGeneratorError("The Figma UI Library must be connected as Assets before generation.", {
      library: discovery.library
    });
  }
}

function normalizeName(value) {
  return typeof value === "string"
    ? value
        .toLowerCase()
        .replace(/#.*$/, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    : "";
}

function arrayify(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function dedupeBy(items, keyForItem) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (!item) {
      continue;
    }
    const key = keyForItem(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

function toIsoTimestamp(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
