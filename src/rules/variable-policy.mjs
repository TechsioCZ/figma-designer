export const variableChainPolicy = Object.freeze({
  expectedChain: ["primitive", "semantic", "component"],
  finalSurfaceChain: ["component", "semantic", "primitive"],
  rawFinalValueCategories: Object.freeze({
    color: "raw_color",
    spacing: "raw_spacing",
    radius: "raw_radius",
    typography: "raw_typography"
  })
});

export function validateVariablePolicy(input = {}) {
  const issues = [];
  const variables = normalizeVariableReferences(input.variables ?? input.variableReferences ?? []);
  const variablesByRef = buildVariableRefMap(variables);
  const semanticVariables = variables.filter((variable) => variable.level === "semantic");
  const requiredModes = normalizeModeDescriptors(
    input.requiredModes ?? input.modes ?? input.variableModes ?? inferRequiredModes(input)
  );

  for (const rawValue of input.rawFinalValues ?? []) {
    if (isRawFinalValue(rawValue)) {
      issues.push(rawFinalValueIssue(rawValue));
    }
  }

  for (const variable of variables) {
    issues.push(...validateVariableAliasChain(variable, variablesByRef, requiredModes));
  }

  for (const proposedVariable of normalizeVariableReferences(input.proposedVariables ?? [])) {
    if (proposedVariable.level === "semantic") {
      const duplicate = findDuplicateSemanticVariable(proposedVariable, semanticVariables);
      if (duplicate) {
        issues.push(duplicateSemanticIssue(proposedVariable, duplicate));
      }
    }

    if (proposedVariable.level === "component" && !hasComponentVariableNeed(proposedVariable)) {
      issues.push(componentVariableNeedIssue(proposedVariable));
    }
  }

  for (const binding of input.finalBindings ?? []) {
    const variable = variablesByRef.get(binding.variableId);
    if (!variable) {
      continue;
    }

    if (variable.level === "primitive" && hasSemanticForPrimitive(variable, semanticVariables)) {
      issues.push(primitiveFinalBindingIssue(binding, variable));
    }
  }

  return {
    status: issues.length > 0 ? "failed" : "passed",
    issues
  };
}

export function normalizeVariableReferences(references = []) {
  return references.map((reference) => normalizeVariableReference(reference));
}

export function normalizeVariableReference(reference = {}) {
  const variableId = reference.variableId ?? reference.id ?? reference.variableKey ?? reference.name;
  const name = reference.name ?? reference.variableName ?? variableId;
  const level = normalizeLevel(reference.level ?? reference.role ?? inferLevel(name));
  const aliasChain = normalizeAliasChain(reference.aliasChain, {
    self: {
      variableId,
      name,
      level
    }
  });

  return {
    ...reference,
    variableId,
    name,
    level,
    role: level,
    aliasesTo: reference.aliasesTo,
    rawValue: reference.rawValue,
    meaning: reference.meaning,
    resolvedType: normalizeResolvedType(reference.resolvedType ?? reference.type),
    collectionId: reference.collectionId ?? reference.variableCollectionId,
    collectionName: reference.collectionName ?? reference.collection?.name,
    valuesByMode: reference.valuesByMode ?? {},
    modeCoverage: reference.modeCoverage ?? reference.coveredModes,
    aliasChain
  };
}

export function validateVariableAliasChain(variable, variablesById = new Map(), requiredModes = []) {
  const issues = [];

  if (variable.level === "primitive") {
    return issues;
  }

  const expected = variable.level === "component" ? ["component", "semantic", "primitive"] : ["semantic", "primitive"];
  const actual = variable.aliasChain.map((link) => link.level);

  if (!startsWithLevels(actual, expected)) {
    issues.push(brokenAliasIssue(variable, expected, actual));
    return issues;
  }

  for (let index = 0; index < variable.aliasChain.length - 1; index += 1) {
    const link = variable.aliasChain[index];
    const next = variable.aliasChain[index + 1];

    if (link.aliasesTo && !sameVariableRef(link.aliasesTo, next)) {
      issues.push(brokenAliasIssue(variable, expected, actual, `${link.name} aliases to ${link.aliasesTo}, not ${next.name}.`));
      break;
    }

    if (link.variableId && variablesById.size > 0 && !variablesById.has(link.variableId) && !variablesById.has(link.name)) {
      issues.push(brokenAliasIssue(variable, expected, actual, `${link.variableId} is not present in discovered variables.`));
      break;
    }
  }

  const missingModeCoverage = findMissingModeCoverage(variable, variablesById, requiredModes);

  if (missingModeCoverage.length > 0) {
    issues.push(modeCoverageIssue(variable, missingModeCoverage));
  }

  return issues;
}

function isRawFinalValue(rawValue) {
  return rawValue?.final !== false && !rawValue?.variableId && !rawValue?.styleId;
}

function rawFinalValueIssue(rawValue) {
  const category = variableChainPolicy.rawFinalValueCategories[rawValue.kind] ?? "missing_variable_binding";

  return validationIssue({
    code: "RAW_FINAL_VALUE",
    category,
    severity: "error",
    message: `Raw ${rawValue.kind ?? "visual"} value remains on final UI.`,
    node: rawValue.node,
    expected: "Final UI values are bound through primitive -> semantic -> component variables or approved styles.",
    actual: `${rawValue.property ?? "value"}=${String(rawValue.value ?? rawValue.rawValue ?? "raw")}`,
    recommendation: "Search existing variables first; if none fit, record a Design System Gap and use an approved provisional variable-chain addition."
  });
}

function brokenAliasIssue(variable, expected, actual, detail) {
  return validationIssue({
    code: "BROKEN_VARIABLE_ALIAS_CHAIN",
    category: "broken_variable_alias",
    severity: "error",
    message: `Variable ${variable.name} does not preserve the expected alias chain.`,
    expected: expected.join(" -> "),
    actual: actual.length > 0 ? actual.join(" -> ") : "no alias chain",
    recommendation: detail ?? "Preserve aliases from component to semantic to primitive variables, with mode coverage intact."
  });
}

function modeCoverageIssue(variable, missingModeCoverage) {
  const actual = missingModeCoverage
    .map((entry) => `${entry.variableName}: ${entry.missingModes.join(", ")}`)
    .join("; ");

  return validationIssue({
    code: "BROKEN_VARIABLE_MODE_COVERAGE",
    category: "theme_mode",
    severity: "error",
    message: `Variable ${variable.name} does not preserve required mode coverage across its alias chain.`,
    expected: "Every variable in the final alias chain covers each required theme, brand, density, or state mode.",
    actual,
    recommendation:
      "Restore values or aliases for the missing modes before using this variable in final UI, or record a Design System Gap."
  });
}

function duplicateSemanticIssue(proposedVariable, duplicate) {
  return validationIssue({
    code: "DUPLICATE_SEMANTIC_VARIABLE",
    category: "broken_variable_alias",
    severity: "error",
    message: `Proposed semantic variable ${proposedVariable.name} duplicates existing semantic meaning ${duplicate.name}.`,
    expected: "Reuse an existing semantic variable before creating new semantic meaning.",
    actual: proposedVariable.name,
    recommendation: `Use ${duplicate.name}, or document why the meaning is materially different before requesting approval.`
  });
}

function primitiveFinalBindingIssue(binding, variable) {
  return validationIssue({
    code: "PRIMITIVE_FINAL_BINDING",
    category: "missing_variable_binding",
    severity: "error",
    message: `Final UI binding ${binding.property ?? "value"} uses primitive variable ${variable.name} directly.`,
    node: binding.node,
    expected: "Component surfaces bind to component variables on top of semantic variables when a matching semantic variable exists.",
    actual: variable.name,
    recommendation: "Bind the surface to an existing semantic/component variable, or create an approved component variable when a component-specific surface is needed."
  });
}

function componentVariableNeedIssue(proposedVariable) {
  return validationIssue({
    code: "COMPONENT_VARIABLE_WITHOUT_NEED",
    category: "missing_variable_binding",
    severity: "error",
    message: `Proposed component variable ${proposedVariable.name} does not identify a component-specific surface need.`,
    expected: "Component variables are created only when a component needs a stable theming surface.",
    actual: proposedVariable.name,
    recommendation: "Reuse the semantic variable directly unless the proposal names the component surface, bound nodes, or component-specific reason for the variable."
  });
}

function validationIssue(fields) {
  return {
    id: fields.id ?? toIssueId(fields.code, fields.actual ?? fields.message),
    status: "open",
    ...fields
  };
}

function normalizeAliasChain(aliasChain, { self }) {
  if (!Array.isArray(aliasChain) || aliasChain.length === 0) {
    return self.level === "primitive" ? [self] : [];
  }

  const normalized = aliasChain.map((link) => {
    if (typeof link === "string") {
      return {
        variableId: link,
        name: link,
        level: inferLevel(link)
      };
    }

    const name = link.name ?? link.variableName ?? link.variableId ?? link.variableKey;
    return {
      variableId: link.variableId ?? link.id ?? link.variableKey ?? name,
      name,
      level: normalizeLevel(link.level ?? link.role ?? inferLevel(name)),
      aliasesTo: link.aliasesTo,
      valuesByMode: link.valuesByMode ?? {},
      modeCoverage: link.modeCoverage ?? link.coveredModes
    };
  });

  if (normalized[0]?.variableId !== self.variableId && normalized[0]?.name !== self.name) {
    return [self, ...normalized];
  }

  return normalized;
}

function findMissingModeCoverage(variable, variablesByRef, requiredModes) {
  const chainModes = modesForVariableChain(variable, variablesByRef, requiredModes);

  if (chainModes.length === 0) {
    return [];
  }

  return variable.aliasChain.flatMap((link) => {
    const resolvedLink = resolveChainLink(link, variablesByRef);
    const coveredModeKeys = modeKeysForVariable(resolvedLink);
    const requiredForLink = modesForVariable(resolvedLink, chainModes);
    const missingModes = requiredForLink
      .filter((mode) => !mode.keys.some((key) => coveredModeKeys.has(key)))
      .map((mode) => mode.label);

    if (missingModes.length === 0) {
      return [];
    }

    return [
      {
        variableId: resolvedLink.variableId,
        variableName: resolvedLink.name,
        missingModes
      }
    ];
  });
}

function modesForVariableChain(variable, variablesByRef, requiredModes) {
  const links = variable.aliasChain.map((link) => resolveChainLink(link, variablesByRef));
  const collectionIds = new Set(links.map((link) => link.collectionId).filter(Boolean));
  const collectionNames = new Set(links.map((link) => normalizeModeKey(link.collectionName)).filter(Boolean));
  const collectionScopedModes = requiredModes.filter(
    (mode) =>
      (mode.collectionId && collectionIds.has(mode.collectionId)) ||
      (mode.collectionName && collectionNames.has(normalizeModeKey(mode.collectionName)))
  );

  if (collectionScopedModes.length > 0) {
    return collectionScopedModes;
  }

  return requiredModes.filter((mode) => !mode.collectionId && !mode.collectionName);
}

function modesForVariable(variable, requiredModes) {
  const scoped = requiredModes.filter(
    (mode) =>
      !mode.collectionId ||
      !variable.collectionId ||
      mode.collectionId === variable.collectionId
  );

  return scoped.length > 0 ? scoped : requiredModes;
}

function resolveChainLink(link, variablesByRef) {
  return variablesByRef.get(link.variableId) ?? variablesByRef.get(link.name) ?? link;
}

function modeKeysForVariable(variable) {
  const keys = new Set();

  for (const mode of normalizeModeDescriptors(variable.modeCoverage)) {
    for (const key of mode.keys) {
      keys.add(key);
    }
  }

  for (const mode of normalizeModeDescriptors(variable.modes)) {
    for (const key of mode.keys) {
      keys.add(key);
    }
  }

  for (const key of Object.keys(variable.valuesByMode ?? {})) {
    keys.add(normalizeModeKey(key));
  }

  return keys;
}

function inferRequiredModes(input) {
  const collections = input.variableCollections ?? input.collections ?? input.variables?.collections ?? [];

  return collections.flatMap((collection) =>
    (collection.modes ?? []).map((mode) => ({
      ...mode,
      collectionId: collection.collectionId ?? collection.id,
      collectionName: collection.name
    }))
  );
}

function normalizeModeDescriptors(modes = []) {
  if (!modes) {
    return [];
  }

  if (!Array.isArray(modes) && typeof modes === "object") {
    return Object.entries(modes).map(([key, value]) => normalizeModeDescriptor({ modeId: key, name: value?.name ?? value }));
  }

  return modes.map((mode) => normalizeModeDescriptor(mode)).filter(Boolean);
}

function normalizeModeDescriptor(mode) {
  if (mode === undefined || mode === null || mode === "") {
    return undefined;
  }

  if (typeof mode === "string") {
    const key = normalizeModeKey(mode);
    return {
      label: mode,
      keys: [key]
    };
  }

  const modeId = mode.modeId ?? mode.mode_id ?? mode.id;
  const name = mode.name ?? mode.label;
  const keys = [modeId, name].filter(Boolean).map(normalizeModeKey);

  if (keys.length === 0) {
    return undefined;
  }

  return {
    label: name ?? modeId,
    keys,
    collectionId: mode.collectionId ?? mode.variableCollectionId,
    collectionName: mode.collectionName
  };
}

function normalizeModeKey(value) {
  return String(value).trim().toLowerCase();
}

function normalizeResolvedType(type) {
  return type ? String(type).toLowerCase() : undefined;
}

function normalizeLevel(level) {
  const normalized = String(level ?? "").toLowerCase();
  if (["primitive", "semantic", "component"].includes(normalized)) {
    return normalized;
  }
  return "semantic";
}

function inferLevel(name = "") {
  const normalized = String(name).toLowerCase();
  if (normalized.startsWith("primitive/") || normalized.includes("/primitive/")) {
    return "primitive";
  }
  if (normalized.startsWith("component/") || normalized.includes("/component/")) {
    return "component";
  }
  return "semantic";
}

function startsWithLevels(actual, expected) {
  if (actual.length < expected.length) {
    return false;
  }

  return expected.every((level, index) => actual[index] === level);
}

function sameVariableRef(ref, variable) {
  return ref === variable.variableId || ref === variable.name;
}

function findDuplicateSemanticVariable(proposedVariable, semanticVariables) {
  const proposedMeaning = semanticMeaningKey(proposedVariable);

  return semanticVariables.find((variable) => {
    if (variable.variableId === proposedVariable.variableId || variable.name === proposedVariable.name) {
      return false;
    }

    return semanticMeaningKey(variable) === proposedMeaning;
  });
}

function semanticMeaningKey(variable) {
  if (variable.meaning) {
    return normalizeMeaning(variable.meaning);
  }

  const aliasesTo = variable.aliasesTo ?? variable.aliasChain.at(-1)?.variableId ?? variable.aliasChain.at(-1)?.name;
  return normalizeMeaning(`${variable.resolvedType ?? ""}:${aliasesTo ?? variable.name}`);
}

function normalizeMeaning(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "/")
    .replace(/^\/|\/$/g, "");
}

function hasSemanticForPrimitive(primitiveVariable, semanticVariables) {
  return semanticVariables.some((variable) => {
    const target = variable.aliasesTo ?? variable.aliasChain.at(-1)?.variableId ?? variable.aliasChain.at(-1)?.name;
    return target === primitiveVariable.variableId || target === primitiveVariable.name;
  });
}

function hasComponentVariableNeed(variable) {
  return Boolean(
    variable.neededFor ??
      variable.componentSurface ??
      variable.componentName ??
      variable.componentKey ??
      variable.reason ??
      variable.boundNodes?.length ??
      variable.boundNodeIds?.length
  );
}

function buildVariableRefMap(variables) {
  const map = new Map();
  for (const variable of variables) {
    if (variable.variableId) {
      map.set(variable.variableId, variable);
    }
    if (variable.name) {
      map.set(variable.name, variable);
    }
    if (variable.variableKey) {
      map.set(variable.variableKey, variable);
    }
  }
  return map;
}

function toIssueId(code, value) {
  return `${code.toLowerCase()}-${String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)}`;
}
