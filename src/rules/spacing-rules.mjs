const schemaVersion = "1.0.0";
const kind = "figma-spacing-rules";

const spacingNamePattern =
  /\b(space|spacing|gap|gutter|inset|padding|margin|stack|rhythm|section|cluster)\b/i;

export const spacingRuleDefinitions = [
  {
    role: "form_item",
    label: "Form Item",
    requiredRelationships: ["label_to_control", "control_to_help", "item_to_item"],
    guidance:
      "Bind label, control, help, error, and item-to-item gaps to discovered spacing variables or approved form patterns."
  },
  {
    role: "field_group",
    label: "Field Group",
    requiredRelationships: ["field_group_gap", "inline_field_gap", "fieldset_stack_gap"],
    guidance:
      "Use discovered group spacing for related fields, inline field columns, and fieldset stacks."
  },
  {
    role: "page_section",
    label: "Page Section",
    requiredRelationships: ["section_to_section", "section_padding", "container_gutter"],
    guidance:
      "Use approved page rhythm, section gap, and container gutter variables or page layout patterns."
  },
  {
    role: "card",
    label: "Card",
    requiredRelationships: ["card_padding", "card_content_gap", "card_grid_gap"],
    guidance:
      "Use library card padding and content-gap variables or approved card composition patterns."
  },
  {
    role: "panel",
    label: "Panel",
    requiredRelationships: ["panel_padding", "panel_section_gap", "panel_content_gap"],
    guidance:
      "Use panel spacing variables or patterns for panel padding, stacked content, and panel sections."
  },
  {
    role: "header",
    label: "Header",
    requiredRelationships: ["header_padding", "header_content_gap", "title_action_gap"],
    guidance:
      "Use header spacing variables or approved header patterns for title, metadata, and action spacing."
  },
  {
    role: "footer",
    label: "Footer",
    requiredRelationships: ["footer_padding", "footer_content_gap", "footer_action_gap"],
    guidance:
      "Use footer spacing variables or patterns for supporting content and terminal action groups."
  },
  {
    role: "interactive_cluster",
    label: "Interactive Cluster",
    requiredRelationships: ["control_gap", "button_group_gap", "icon_label_gap"],
    guidance:
      "Use interactive cluster spacing variables or approved action-group patterns for buttons, icons, and controls."
  }
];

const rulesByRole = new Map(spacingRuleDefinitions.map((rule) => [rule.role, rule]));

export function buildSpacingRuleSet(context = {}) {
  const guidance = extractSpacingGuidance(context);

  return {
    kind,
    schemaVersion,
    source: context.source ?? context.discovery?.source ?? "fixture",
    rules: spacingRuleDefinitions.map((rule) => ({ ...rule })),
    discoveredSpacingVariables: guidance.variables,
    discoveredSpacingPatterns: guidance.patterns,
    designSystemGapPolicy: {
      missingGuidance:
        "When no discovered spacing variable or approved pattern supports a required spacing role, report a Design System Gap before using a raw final value.",
      rawFinalValues:
        "Raw final spacing values are not allowed when discovered variables or approved patterns can satisfy the role."
    }
  };
}

export function extractSpacingGuidance(context = {}) {
  const source = context.discovery ?? context;
  const explicitGuidance = source.spacingGuidance ?? context.spacingGuidance ?? {};
  const variableCandidates = [
    ...arrayify(explicitGuidance.variables ?? []),
    ...arrayify(source.discoveredSpacingVariables ?? []),
    ...arrayify(source.variables?.references ?? []),
    ...arrayify(Array.isArray(source.variables) ? source.variables : [])
  ];
  const patternCandidates = [
    ...arrayify(explicitGuidance.patterns ?? []),
    ...arrayify(source.discoveredSpacingPatterns ?? []),
    ...arrayify(source.approvedPatterns ?? []),
    ...arrayify(Array.isArray(source.patterns) ? source.patterns : [])
  ];

  return {
    variables: dedupeBy(
      variableCandidates.map(normalizeSpacingVariable).filter(Boolean),
      (variable) => variable.variableId ?? variable.variableKey ?? variable.name
    ),
    patterns: dedupeBy(
      patternCandidates.map(normalizeSpacingPattern).filter(Boolean),
      (pattern) => pattern.patternId ?? pattern.nodeId ?? pattern.name
    )
  };
}

export function checkSpacingFixture(fixture, options = {}) {
  const context = options.discovery ?? options.context ?? fixture.discovery ?? fixture.context ?? fixture;
  const ruleSet = buildSpacingRuleSet(context);
  const guidance = {
    variables: ruleSet.discoveredSpacingVariables,
    patterns: ruleSet.discoveredSpacingPatterns
  };
  const nodes = normalizeFixtureNodes(fixture);
  const checks = [];
  const violations = [];
  const gaps = [];

  for (const node of nodes) {
    const rule = rulesByRole.get(node.role);

    if (!rule) {
      violations.push(
        issue("unknown_spacing_role", node, {
          severity: "error",
          message: `Unknown spacing role "${node.role}". Use one of: ${[...rulesByRole.keys()].join(", ")}.`
        })
      );
      continue;
    }

    const roleGuidance = guidanceForRole(node.role, guidance);
    const relationships = expandRequiredRelationships(node.relationships, rule);

    if (!roleGuidance.hasGuidance) {
      gaps.push(
        designSystemGap("missing_spacing_guidance", node, {
          message: `No discovered spacing variable or approved pattern supports ${rule.label}.`,
          proposedExtension: `Add the smallest semantic spacing variable or approved ${rule.role} spacing pattern needed for this composition.`
        })
      );
    }

    for (const relationship of relationships) {
      const check = checkRelationship(node, relationship, rule, roleGuidance);
      checks.push(check);

      if (check.status === "violated") {
        violations.push(check.issue);
      }

      if (check.status === "gap") {
        gaps.push(check.issue);
      }
    }
  }

  return {
    kind: "figma-spacing-check-result",
    schemaVersion,
    ok: violations.length === 0 && gaps.length === 0,
    summary: {
      checkedNodes: nodes.length,
      checkedRelationships: checks.length,
      violations: violations.length,
      gaps: gaps.length,
      discoveredSpacingVariables: guidance.variables.length,
      discoveredSpacingPatterns: guidance.patterns.length
    },
    ruleSet,
    checks,
    violations,
    gaps
  };
}

function checkRelationship(node, relationship, rule, roleGuidance) {
  const binding = normalizeSpacingBinding(relationship);
  const base = {
    nodeId: node.nodeId,
    nodeName: node.name,
    role: node.role,
    relationship: relationship.kind,
    rule: rule.role
  };

  if (!binding) {
    return {
      ...base,
      status: "gap",
      issue: designSystemGap("missing_spacing_binding", node, {
        relationship: relationship.kind,
        message: `No spacing variable, style, or approved pattern is bound for ${relationship.kind}.`,
        proposedExtension: `Bind ${relationship.kind} through discovered ${rule.label} spacing guidance or request a Design System Gap.`
      })
    };
  }

  if (binding.kind === "raw") {
    return {
      ...base,
      status: "violated",
      binding,
      issue: issue("raw_spacing_value", node, {
        relationship: relationship.kind,
        severity: "error",
        rawValue: binding.value,
        message: `Raw spacing value ${binding.value} is used for ${relationship.kind}; final UI spacing must use variables or approved patterns.`
      })
    };
  }

  if (binding.kind === "variable") {
    const variable = findVariableBinding(binding, roleGuidance.variables);

    if (!variable) {
      return {
        ...base,
        status: "gap",
        binding,
        issue: designSystemGap("unresolved_spacing_variable", node, {
          relationship: relationship.kind,
          variableId: binding.variableId,
          variableName: binding.variableName,
          message:
            "The fixture references a spacing variable that was not found in discovered spacing variables.",
          proposedExtension:
            "Refresh live discovery or add the missing variable through the approved variable-chain workflow."
        })
      };
    }

    return {
      ...base,
      status: "passed",
      binding: {
        ...binding,
        variableId: variable.variableId,
        variableName: variable.name,
        role: variable.role,
        aliasChain: variable.aliasChain
      }
    };
  }

  if (binding.kind === "pattern") {
    const pattern = findPatternBinding(binding, roleGuidance.patterns);

    if (!pattern) {
      return {
        ...base,
        status: "gap",
        binding,
        issue: designSystemGap("unresolved_spacing_pattern", node, {
          relationship: relationship.kind,
          patternId: binding.patternId,
          patternName: binding.patternName,
          message:
            "The fixture references an approved spacing pattern that was not found in discovered spacing patterns.",
          proposedExtension:
            "Refresh live discovery or report the missing pattern as a Design System Gap."
        })
      };
    }

    return {
      ...base,
      status: "passed",
      binding: {
        ...binding,
        patternId: pattern.patternId,
        patternName: pattern.name
      }
    };
  }

  return {
    ...base,
    status: "violated",
    binding,
    issue: issue("unsupported_spacing_binding", node, {
      relationship: relationship.kind,
      severity: "error",
      message: `Unsupported spacing binding kind "${binding.kind}".`
    })
  };
}

function normalizeSpacingVariable(variable) {
  if (!variable || typeof variable !== "object") {
    return undefined;
  }

  const name = variable.name ?? variable.variableName;
  const type = variable.type ?? variable.resolvedType ?? "UNKNOWN";
  const collectionName = variable.collectionName ?? variable.collection?.name ?? "";
  const text = `${name ?? ""} ${variable.description ?? ""} ${collectionName}`;

  if (type !== "FLOAT" && type !== "NUMBER" && type !== "UNKNOWN") {
    return undefined;
  }

  if (!spacingNamePattern.test(text) && !hasExplicitSpacingRole(variable)) {
    return undefined;
  }

  return {
    source: variable.source,
    variableId: variable.variableId ?? variable.id,
    variableKey: variable.variableKey ?? variable.key,
    name: name ?? "Unnamed Spacing Variable",
    collectionId: variable.collectionId ?? variable.variableCollectionId,
    role: variable.role ?? inferVariableRole(name),
    type,
    valuesByMode: cloneJson(variable.valuesByMode ?? {}),
    resolvedModeId: variable.resolvedModeId,
    aliasChain: cloneJson(variable.aliasChain ?? []),
    appliesTo: rolesFromCandidate(variable, text),
    raw: cloneJson(variable)
  };
}

function normalizeSpacingPattern(pattern) {
  if (!pattern || typeof pattern !== "object") {
    return undefined;
  }

  const name = pattern.name ?? pattern.patternName;
  const text = `${name ?? ""} ${pattern.description ?? ""} ${pattern.kind ?? ""}`;
  const appliesTo = rolesFromCandidate(pattern, text);

  if (!spacingNamePattern.test(text) && appliesTo.length === 0 && !pattern.spacing) {
    return undefined;
  }

  return {
    source: pattern.source,
    patternId: pattern.patternId ?? pattern.id,
    nodeId: pattern.nodeId,
    name: name ?? "Unnamed Spacing Pattern",
    description: pattern.description ?? "",
    appliesTo,
    spacing: cloneJson(pattern.spacing ?? pattern.spacingRules ?? {}),
    componentReferences: cloneJson(pattern.componentReferences ?? []),
    raw: cloneJson(pattern)
  };
}

function normalizeFixtureNodes(fixture = {}) {
  const nodes = fixture.nodes ?? fixture.spacingNodes ?? fixture.frames ?? [];

  return nodes.map((node) => {
    const role = normalizeRole(node.spacingRole ?? node.role ?? node.category);
    const relationships = node.relationships ?? node.spacingRelationships ?? node.spacing ?? [];

    return {
      nodeId: node.nodeId ?? node.id,
      name: node.name ?? "Unnamed spacing node",
      role,
      relationships: normalizeRelationships(relationships)
    };
  });
}

function normalizeRelationships(value) {
  if (Array.isArray(value)) {
    return value.map((relationship, index) => normalizeRelationship(relationship, index));
  }

  if (value && typeof value === "object") {
    return Object.entries(value).map(([kindName, relationship], index) =>
      normalizeRelationship({ kind: kindName, ...asObject(relationship) }, index)
    );
  }

  return [];
}

function normalizeRelationship(relationship, index) {
  const object = asObject(relationship);

  return {
    kind: normalizeRelationshipKind(
      object.kind ?? object.relationship ?? object.measurement ?? object.property ?? `spacing_${index + 1}`
    ),
    value: object.value ?? object.spacingValue ?? object.binding ?? object.variable ?? object.pattern,
    variableId: object.variableId,
    variableName: object.variableName,
    variableKey: object.variableKey,
    patternId: object.patternId,
    patternName: object.patternName,
    rawValue: object.rawValue,
    approvedPatternId: object.approvedPatternId,
    approvedPatternName: object.approvedPatternName
  };
}

function normalizeSpacingBinding(relationship) {
  if (relationship.variableId || relationship.variableName || relationship.variableKey) {
    return {
      kind: "variable",
      variableId: relationship.variableId,
      variableKey: relationship.variableKey,
      variableName: relationship.variableName
    };
  }

  if (relationship.patternId || relationship.approvedPatternId || relationship.patternName) {
    return {
      kind: "pattern",
      patternId: relationship.patternId ?? relationship.approvedPatternId,
      patternName: relationship.patternName ?? relationship.approvedPatternName
    };
  }

  if (relationship.rawValue !== undefined) {
    return {
      kind: "raw",
      value: relationship.rawValue
    };
  }

  const value = relationship.value;

  if (typeof value === "number") {
    return {
      kind: "raw",
      value
    };
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  if (value.kind === "raw" || value.type === "raw" || value.raw !== undefined) {
    return {
      kind: "raw",
      value: value.raw ?? value.value
    };
  }

  if (value.variableId || value.variableName || value.variableKey || value.type === "VARIABLE") {
    return {
      kind: "variable",
      variableId: value.variableId ?? value.id,
      variableKey: value.variableKey ?? value.key,
      variableName: value.variableName ?? value.name
    };
  }

  if (value.patternId || value.approvedPatternId || value.patternName || value.type === "PATTERN") {
    return {
      kind: "pattern",
      patternId: value.patternId ?? value.approvedPatternId ?? value.id,
      patternName: value.patternName ?? value.approvedPatternName ?? value.name
    };
  }

  return {
    kind: value.kind ?? value.type ?? "unknown",
    value: cloneJson(value)
  };
}

function guidanceForRole(role, guidance) {
  const variables = guidance.variables.filter((variable) => appliesToRole(variable, role));
  const patterns = guidance.patterns.filter((pattern) => appliesToRole(pattern, role));

  return {
    variables,
    patterns,
    hasGuidance: variables.length > 0 || patterns.length > 0
  };
}

function findVariableBinding(binding, variables) {
  return variables.find(
    (variable) =>
      (binding.variableId && variable.variableId === binding.variableId) ||
      (binding.variableKey && variable.variableKey === binding.variableKey) ||
      (binding.variableName && variable.name === binding.variableName)
  );
}

function findPatternBinding(binding, patterns) {
  return patterns.find(
    (pattern) =>
      (binding.patternId && pattern.patternId === binding.patternId) ||
      (binding.patternId && pattern.nodeId === binding.patternId) ||
      (binding.patternName && pattern.name === binding.patternName)
  );
}

function appliesToRole(candidate, role) {
  const appliesTo = candidate.appliesTo ?? [];

  return appliesTo.length === 0 || appliesTo.includes(role);
}

function rolesFromCandidate(candidate, text) {
  const explicit = candidate.appliesTo ?? candidate.spacingRoles ?? candidate.roles;

  if (explicit) {
    return arrayify(explicit).map(normalizeRole).filter(Boolean);
  }

  const role = normalizeRole(candidate.spacingRole ?? candidate.role ?? candidate.category);

  if (role) {
    return [role];
  }

  return inferRolesFromText(text);
}

function inferRolesFromText(text = "") {
  const normalized = text.toLowerCase();
  const roles = [];

  for (const rule of spacingRuleDefinitions) {
    if (normalized.includes(rule.role.replaceAll("_", "-")) || normalized.includes(rule.role.replaceAll("_", " "))) {
      roles.push(rule.role);
    }
  }

  if (/\bform|field|input|label|error|help\b/.test(normalized)) {
    roles.push("form_item");
  }

  if (/\bfield group|fieldset|field-group\b/.test(normalized)) {
    roles.push("field_group");
  }

  if (/\bpage|section|container|gutter\b/.test(normalized)) {
    roles.push("page_section");
  }

  if (/\bcard\b/.test(normalized)) {
    roles.push("card");
  }

  if (/\bpanel|drawer|sidebar\b/.test(normalized)) {
    roles.push("panel");
  }

  if (/\bheader|masthead|toolbar\b/.test(normalized)) {
    roles.push("header");
  }

  if (/\bfooter|bottom bar|terminal action\b/.test(normalized)) {
    roles.push("footer");
  }

  if (/\bbutton group|action|interactive|cluster|control|icon label\b/.test(normalized)) {
    roles.push("interactive_cluster");
  }

  return [...new Set(roles)];
}

function hasExplicitSpacingRole(candidate) {
  return Boolean(candidate.appliesTo ?? candidate.spacingRoles ?? candidate.roles ?? candidate.spacingRole);
}

function normalizeRole(role) {
  if (!role) {
    return undefined;
  }

  const normalized = String(role).trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases = {
    form: "form_item",
    form_items: "form_item",
    field: "form_item",
    fields: "form_item",
    fieldset: "field_group",
    section: "page_section",
    page: "page_section",
    action_cluster: "interactive_cluster",
    button_group: "interactive_cluster",
    control_cluster: "interactive_cluster"
  };

  return aliases[normalized] ?? normalized;
}

function normalizeRelationshipKind(kind) {
  return String(kind).trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function expandRequiredRelationships(relationships, rule) {
  const byKind = new Map();

  for (const relationship of relationships) {
    byKind.set(relationship.kind, relationship);
  }

  const required = rule.requiredRelationships.map((kind) => byKind.get(kind) ?? missingRelationship(kind));
  const extras = relationships.filter((relationship) => !rule.requiredRelationships.includes(relationship.kind));

  return [...required, ...extras];
}

function inferVariableRole(name = "") {
  if (/^component\//i.test(name)) {
    return "component";
  }

  if (/^semantic\//i.test(name)) {
    return "semantic";
  }

  if (/^primitive\//i.test(name)) {
    return "primitive";
  }

  return "unknown";
}

function missingRelationship(kind) {
  return {
    kind,
    value: undefined
  };
}

function issue(code, node, details = {}) {
  return {
    code,
    type: "guardrail_violation",
    severity: details.severity ?? "error",
    nodeId: node.nodeId,
    nodeName: node.name,
    role: node.role,
    ...details
  };
}

function designSystemGap(code, node, details = {}) {
  return {
    code,
    type: "design_system_gap",
    severity: "gap",
    nodeId: node.nodeId,
    nodeName: node.name,
    role: node.role,
    liveLibrarySearch: "discovered_spacing_variables_and_patterns",
    closestMatches: details.closestMatches ?? [],
    impact: details.impact ?? "Spacing cannot be validated under Strict Composition Mode.",
    ...details
  };
}

function asObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  return { value };
}

function arrayify(value) {
  return Array.isArray(value) ? value : [value];
}

function dedupeBy(items, keyForItem) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const key = keyForItem(item);

    if (key === undefined || key === null || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function cloneJson(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}
