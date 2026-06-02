import {
  normalizeVariableReferences,
  validateVariablePolicy
} from "../rules/variable-policy.mjs";
import { APCAcontrast, sRGBtoY } from "apca-w3";

const schemaVersion = "1.0.0";
const kind = "figma-variables-themes-contrast-validation";

const visualColorProperties = new Set([
  "background",
  "backgroundColor",
  "borderColor",
  "color",
  "fill",
  "fills",
  "stroke",
  "strokes",
  "textColor"
]);

const visualSpacingProperties = new Set([
  "counterAxisSpacing",
  "gap",
  "itemSpacing",
  "margin",
  "padding",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "primaryAxisSpacing"
]);

const visualRadiusProperties = new Set([
  "bottomLeftRadius",
  "bottomRightRadius",
  "cornerRadius",
  "radius",
  "topLeftRadius",
  "topRightRadius"
]);

const visualTypographyProperties = new Set([
  "fontFamily",
  "fontSize",
  "fontWeight",
  "letterSpacing",
  "lineHeight",
  "paragraphSpacing",
  "textStyle"
]);

export const variablesThemesContrastRuleIds = Object.freeze([
  "variables.raw-final-values",
  "variables.alias-chain",
  "variables.final-binding-level",
  "themes.mode-resolution",
  "contrast.wcag-2.2-aaa",
  "contrast.apca-gold"
]);

export function validateVariablesThemesContrast(input = {}, options = {}) {
  const context = normalizeValidationInput(input, options);
  const variableIndex = buildVariableIndex(context.variables);
  const policyResult = validateVariablePolicy({
    variables: context.variables,
    proposedVariables: context.proposedVariables,
    rawFinalValues: context.rawFinalValues,
    finalBindings: context.finalBindings
  });

  const issues = [
    ...policyResult.issues.map((issue) => normalizeIssue(issue, context)),
    ...validateModeCoverage(context, variableIndex),
    ...validateModeAliases(context, variableIndex),
    ...validateContrastChecks(context, variableIndex)
  ];
  const uniqueIssues = dedupeBy(issues, issueKey);
  const severityCounts = countBy(uniqueIssues, (issue) => issue.severity ?? "error");
  const status = uniqueIssues.some((issue) => ["critical", "error"].includes(issue.severity))
    ? "failed"
    : "passed";

  return {
    kind,
    schemaVersion,
    runId: options.runId ?? input.runId ?? input.report?.runId ?? input.designRunReport?.runId,
    source: options.source ?? input.source ?? input.discovery?.source ?? "scenario",
    status,
    summary: {
      variableCount: context.variables.length,
      collectionCount: context.collections.length,
      checkedNodeCount: context.nodes.length,
      rawFinalValueCount: context.rawFinalValues.length,
      finalBindingCount: context.finalBindings.length,
      contrastCheckCount: context.contrastChecks.length,
      issueCount: uniqueIssues.length,
      severityCounts
    },
    rules: [...variablesThemesContrastRuleIds],
    issues: uniqueIssues
  };
}

export const validateVariableThemeContrast = validateVariablesThemesContrast;

function normalizeValidationInput(input, options) {
  const discovery = input.discovery ?? input.libraryDiscovery ?? {};
  const report = input.report ?? input.designRunReport ?? {};
  const nodes = collectDesignNodes(input);
  const variables = normalizeAndMergeVariables([
    ...arrayify(input.variables?.references),
    ...arrayify(input.variableReferences),
    ...arrayify(Array.isArray(input.variables) ? input.variables : []),
    ...arrayify(discovery.variables?.references),
    ...arrayify(report.variablesUsed)
  ]);
  const collections = normalizeCollections([
    ...arrayify(input.variableCollections),
    ...arrayify(input.variables?.collections),
    ...arrayify(discovery.variables?.collections)
  ]);
  const finalBindings = [
    ...arrayify(input.finalBindings),
    ...collectFinalBindingsFromNodes(nodes),
    ...collectFinalBindingsFromReport(report)
  ].map(normalizeFinalBinding);
  const rawFinalValues = [
    ...arrayify(input.rawFinalValues),
    ...arrayify(input.rawVisualValues),
    ...collectRawFinalValuesFromNodes(nodes)
  ].map(normalizeRawFinalValue);
  const contrastChecks = [
    ...arrayify(input.contrastChecks),
    ...arrayify(input.contrastExpectations),
    ...arrayify(input.accessibility?.contrastChecks),
    ...arrayify(report.contrastChecks)
  ].map(normalizeContrastCheck);

  return {
    input,
    discovery,
    report,
    nodes,
    variables,
    collections,
    collectionById: new Map(collections.map((collection) => [collection.collectionId, collection])),
    finalBindings,
    rawFinalValues,
    proposedVariables: arrayify(input.proposedVariables),
    contrastChecks,
    requiredModes: normalizeRequiredModes(options.requiredModes ?? input.requiredModes)
  };
}

function validateModeCoverage(context) {
  const issues = [];

  for (const variable of context.variables) {
    const valuesByMode = normalizeValuesByMode(variable);
    if (Object.keys(valuesByMode).length === 0) {
      continue;
    }

    const requiredModes = requiredModesForVariable(variable, context);
    for (const mode of requiredModes) {
      if (hasModeValue(valuesByMode, mode)) {
        continue;
      }

      issues.push(
        issue({
          code: "MISSING_VARIABLE_MODE_VALUE",
          category: "theme_mode",
          severity: "error",
          message: `Variable ${variable.name} is missing a value for ${mode.name ?? mode.modeId}.`,
          node: nodeForVariable(variable, context),
          expected: `A resolvable value for mode ${mode.name ?? mode.modeId}.`,
          actual: `Available modes: ${Object.keys(valuesByMode).join(", ") || "none"}.`,
          recommendation:
            "Add the missing mode value or alias so theme switching can resolve the variable chain."
        })
      );
    }
  }

  return issues;
}

function validateModeAliases(context, variableIndex) {
  const issues = [];

  for (const variable of context.variables) {
    const valuesByMode = normalizeValuesByMode(variable);

    for (const [modeId, value] of Object.entries(valuesByMode)) {
      if (!isVariableAlias(value)) {
        continue;
      }

      if (findVariable(value.id, variableIndex)) {
        continue;
      }

      issues.push(
        issue({
          code: "BROKEN_VARIABLE_ALIAS",
          category: "broken_variable_alias",
          severity: "error",
          message: `Variable ${variable.name} aliases to an unknown variable in mode ${modeId}.`,
          node: nodeForVariable(variable, context),
          expected: "Every mode alias resolves to a discovered variable.",
          actual: value.id,
          recommendation:
            "Refresh discovery or repair the alias target before using the variable in final UI."
        })
      );
    }
  }

  return issues;
}

function validateContrastChecks(context, variableIndex) {
  const issues = [];

  for (const check of context.contrastChecks) {
    const foreground = resolveColor(check.foreground, check.modeId, variableIndex);
    const background = resolveColor(check.background, check.modeId, variableIndex);

    if (!foreground || !background) {
      issues.push(
        issue({
          code: "UNRESOLVED_CONTRAST_COLOR",
          category: "contrast",
          severity: "error",
          message: `Contrast colors for ${check.name} could not be resolved.`,
          node: check.node,
          expected: "Foreground and background colors resolve from raw colors or variable aliases.",
          actual: `foreground=${describeColorInput(check.foreground)}, background=${describeColorInput(
            check.background
          )}`,
          recommendation:
            "Bind both contrast surfaces to discoverable color variables with mode values, or provide resolved colors for validation."
        })
      );
      continue;
    }

    const modeLabel = check.modeName ?? check.modeId ?? "selected mode";
    const ratio = contrastRatio(foreground, background);
    const wcagMinRatio = wcagAaaMinRatio(check);
    if (ratio < wcagMinRatio) {
      issues.push(
        issue({
          code: "WCAG22_AAA_CONTRAST_FAILED",
          category: "contrast",
          severity: check.severity,
          message: `${check.name} WCAG 2.2 AAA contrast is ${formatRatio(ratio)}, below ${formatRatio(
            wcagMinRatio
          )} in ${modeLabel}.`,
          node: check.node,
          expected: `WCAG 2.2 SC 1.4.6 Contrast (Enhanced) AAA ratio >= ${formatRatio(wcagMinRatio)}.`,
          actual: `WCAG ratio ${formatRatio(ratio)}; foreground=${colorToHex(foreground)}; background=${colorToHex(background)}.`,
          recommendation:
            "Use a stronger existing semantic text/surface variable pair. If the design system has no pair that passes AAA, report an accessibility Design System Gap before proceeding."
        })
      );
    }

    const apcaLc = Math.abs(apcaContrastLc(foreground, background));
    const apcaMinLc = apcaGoldMinLc(check);
    if (apcaLc < apcaMinLc) {
      issues.push(
        issue({
          code: "APCA_GOLD_CONTRAST_FAILED",
          category: "contrast",
          severity: check.severity,
          message: `${check.name} APCA Gold contrast is Lc ${formatLc(apcaLc)}, below Lc ${formatLc(
            apcaMinLc
          )} in ${modeLabel}.`,
          node: check.node,
          expected: `APCA Readability Criterion Gold Lc >= ${formatLc(apcaMinLc)} for ${check.apcaUseCase}.`,
          actual: `APCA Lc ${formatLc(apcaLc)}; foreground=${colorToHex(foreground)}; background=${colorToHex(background)}.`,
          recommendation:
            "Use a stronger existing semantic text/surface variable pair that passes APCA Gold. If none exists, report an accessibility Design System Gap before proceeding."
        })
      );
    }
  }

  return issues;
}

function collectRawFinalValuesFromNodes(nodes) {
  const rawValues = [];

  for (const node of nodes) {
    if (node.final === false || node.generatedFinal === false) {
      continue;
    }

    for (const [property, value] of Object.entries(node)) {
      const kind = visualKindForProperty(property);
      if (!kind || hasVariableBindingForProperty(node, property) || hasStyleForProperty(node, property)) {
        continue;
      }

      for (const rawValue of extractRawVisualValues(value, kind)) {
        rawValues.push({
          kind,
          property,
          value: rawValue,
          node: normalizeNodeRef(node)
        });
      }
    }
  }

  return rawValues;
}

function collectFinalBindingsFromNodes(nodes) {
  const bindings = [];

  for (const node of nodes) {
    for (const [property, value] of Object.entries(node.boundVariables ?? {})) {
      if (!visualKindForProperty(property)) {
        continue;
      }

      for (const variableId of extractVariableIds(value)) {
        bindings.push({
          property,
          variableId,
          node: normalizeNodeRef(node)
        });
      }
    }

    for (const binding of arrayify(node.variableBindings)) {
      if (!binding.variableId && !binding.id) {
        continue;
      }

      bindings.push({
        property: binding.property,
        variableId: binding.variableId ?? binding.id,
        node: normalizeNodeRef(node)
      });
    }
  }

  return bindings;
}

function collectFinalBindingsFromReport(report) {
  return arrayify(report.variablesUsed).flatMap((variable) =>
    arrayify(variable.boundNodes ?? variable.boundNodeIds).map((node) => ({
      property: variable.property,
      variableId: variable.variableId ?? variable.id ?? variable.variableKey ?? variable.name,
      node: normalizeNodeRef(node)
    }))
  );
}

function normalizeFinalBinding(binding = {}) {
  return {
    ...binding,
    variableId: binding.variableId ?? binding.id ?? binding.variableKey ?? binding.name,
    node: normalizeNodeRef(binding.node)
  };
}

function normalizeRawFinalValue(rawValue = {}) {
  return {
    ...rawValue,
    node: normalizeNodeRef(rawValue.node)
  };
}

function normalizeContrastCheck(check = {}) {
  const textSize = Number(check.textSize ?? check.fontSize ?? check.typography?.fontSize ?? 0);
  const fontWeight = Number(check.fontWeight ?? check.typography?.fontWeight ?? 400);
  const largeText = Boolean(check.largeText ?? isWcagLargeText({ textSize, fontWeight }));
  const apcaUseCase = normalizeApcaUseCase(check.apcaUseCase ?? check.useCase ?? (largeText ? "large_text" : "body_text"));
  const requestedMinRatio = Number(check.minRatio ?? check.expectedRatio ?? check.threshold ?? 0);
  const requestedMinLc = Number(check.apcaMinLc ?? check.minLc ?? check.expectedLc ?? 0);

  return {
    name: check.name ?? check.label ?? check.code ?? "Contrast expectation",
    foreground:
      check.foreground ??
      check.foregroundColor ??
      check.foregroundVariableId ??
      check.textColor ??
      check.textVariableId,
    background:
      check.background ??
      check.backgroundColor ??
      check.backgroundVariableId ??
      check.surfaceColor ??
      check.surfaceVariableId,
    minRatio: Math.max(requestedMinRatio, largeText ? 4.5 : 7),
    apcaMinLc: Math.max(requestedMinLc, apcaGoldMinLc({ apcaUseCase })),
    apcaUseCase,
    textSize,
    fontWeight,
    largeText,
    modeId: check.modeId,
    modeName: check.modeName ?? check.mode,
    severity: check.severity ?? "error",
    node: normalizeNodeRef(check.node)
  };
}

function normalizeAndMergeVariables(variables) {
  const merged = new Map();

  for (const variable of normalizeVariableReferences(variables)) {
    const key = variable.variableId ?? variable.variableKey ?? variable.name;
    if (!key) {
      continue;
    }

    const existing = merged.get(key);
    merged.set(key, mergeVariable(existing, variable));
  }

  return [...merged.values()];
}

function mergeVariable(existing, next) {
  if (!existing) {
    return next;
  }

  return {
    ...existing,
    ...next,
    valuesByMode:
      Object.keys(normalizeValuesByMode(next)).length > 0
        ? next.valuesByMode
        : existing.valuesByMode,
    aliasChain:
      arrayify(next.aliasChain).length > arrayify(existing.aliasChain).length
        ? next.aliasChain
        : existing.aliasChain,
    boundNodes: arrayify(next.boundNodes).length > 0 ? next.boundNodes : existing.boundNodes,
    boundNodeIds:
      arrayify(next.boundNodeIds).length > 0 ? next.boundNodeIds : existing.boundNodeIds
  };
}

function normalizeCollections(collections) {
  return collections
    .map((collection = {}) => ({
      collectionId: collection.collectionId ?? collection.id ?? collection.key ?? collection.name,
      collectionKey: collection.collectionKey ?? collection.key,
      name: collection.name ?? "Unnamed Variable Collection",
      modes: arrayify(collection.modes).map((mode) => ({
        modeId: mode.modeId ?? mode.mode_id ?? mode.id ?? mode.name,
        name: mode.name ?? mode.modeId ?? mode.id
      }))
    }))
    .filter((collection) => collection.collectionId);
}

function normalizeRequiredModes(requiredModes = []) {
  return arrayify(requiredModes).map((mode) =>
    typeof mode === "string" ? { modeId: mode, name: mode } : { modeId: mode.modeId ?? mode.id, name: mode.name }
  );
}

function requiredModesForVariable(variable, context) {
  const explicit = normalizeRequiredModes(variable.requiredModes);
  if (explicit.length > 0) {
    return explicit;
  }

  const collection = context.collectionById.get(variable.collectionId ?? variable.variableCollectionId);
  if (collection?.modes?.length > 0) {
    return collection.modes;
  }

  return context.requiredModes;
}

function hasModeValue(valuesByMode, mode) {
  return (
    Object.hasOwn(valuesByMode, mode.modeId) ||
    Object.hasOwn(valuesByMode, mode.name) ||
    Object.keys(valuesByMode).some((modeId) => equalsLoose(modeId, mode.modeId))
  );
}

function normalizeValuesByMode(variable = {}) {
  return variable.valuesByMode ?? variable.modeValues ?? {};
}

function buildVariableIndex(variables) {
  const index = new Map();

  for (const variable of variables) {
    for (const key of [variable.variableId, variable.variableKey, variable.name, variable.id]) {
      if (key) {
        index.set(key, variable);
      }
    }
  }

  return index;
}

function findVariable(ref, variableIndex) {
  if (!ref) {
    return undefined;
  }

  return variableIndex.get(ref.variableId ?? ref.id ?? ref.variableKey ?? ref.name ?? ref);
}

function resolveColor(input, modeId, variableIndex, seen = new Set()) {
  if (!input) {
    return undefined;
  }

  if (typeof input === "string") {
    const variable = findVariable(input, variableIndex);
    if (variable) {
      return resolveVariableColor(variable, modeId, variableIndex, seen);
    }
    return parseColor(input);
  }

  if (isVariableAlias(input)) {
    return resolveColor(input.id, modeId, variableIndex, seen);
  }

  if (input.variableId || input.variableKey || input.variableName || input.name) {
    const variable = findVariable(input.variableId ?? input.variableKey ?? input.variableName ?? input.name, variableIndex);
    if (variable) {
      return resolveVariableColor(variable, modeId, variableIndex, seen);
    }
  }

  return parseColor(input.color ?? input.value ?? input);
}

function resolveVariableColor(variable, modeId, variableIndex, seen = new Set()) {
  const variableRef = variable.variableId ?? variable.name;
  if (!variableRef || seen.has(variableRef)) {
    return undefined;
  }

  const valuesByMode = normalizeValuesByMode(variable);
  const modeValue =
    valuesByMode[modeId] ??
    valuesByMode[variable.resolvedModeId] ??
    Object.values(valuesByMode)[0] ??
    variable.rawValue;

  if (isVariableAlias(modeValue)) {
    const target = findVariable(modeValue.id, variableIndex);
    return target
      ? resolveVariableColor(target, modeId, variableIndex, new Set([...seen, variableRef]))
      : undefined;
  }

  return parseColor(modeValue);
}

function parseColor(value) {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    const hex = value.trim();
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex);
    if (!match) {
      return undefined;
    }

    const expanded =
      match[1].length === 3
        ? match[1]
            .split("")
            .map((part) => `${part}${part}`)
            .join("")
        : match[1];
    const r = Number.parseInt(expanded.slice(0, 2), 16) / 255;
    const g = Number.parseInt(expanded.slice(2, 4), 16) / 255;
    const b = Number.parseInt(expanded.slice(4, 6), 16) / 255;
    const a = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }

  if (typeof value === "object" && ["r", "g", "b"].every((channel) => channel in value)) {
    const scale = Math.max(value.r, value.g, value.b) > 1 ? 255 : 1;
    return {
      r: value.r / scale,
      g: value.g / scale,
      b: value.b / scale,
      a: value.a ?? 1
    };
  }

  return undefined;
}

function contrastRatio(foreground, background) {
  const fg = foreground.a < 1 ? composite(foreground, background) : foreground;
  const bg = background.a < 1 ? composite(background, { r: 1, g: 1, b: 1, a: 1 }) : background;
  const lighter = Math.max(relativeLuminance(fg), relativeLuminance(bg));
  const darker = Math.min(relativeLuminance(fg), relativeLuminance(bg));

  return (lighter + 0.05) / (darker + 0.05);
}

function apcaContrastLc(foreground, background) {
  const fg = foreground.a < 1 ? composite(foreground, background) : foreground;
  const bg = background.a < 1 ? composite(background, { r: 1, g: 1, b: 1, a: 1 }) : background;
  return APCAcontrast(sRGBtoY(colorToSrgb255(fg)), sRGBtoY(colorToSrgb255(bg)));
}

function wcagAaaMinRatio(check) {
  return Math.max(Number(check.minRatio ?? 0), check.largeText ? 4.5 : 7);
}

function apcaGoldMinLc(check) {
  const baselineByUseCase = {
    body_text: 90,
    fluent_text: 90,
    content_text: 90,
    large_text: 75,
    sub_fluent_text: 75,
    spot_text: 75,
    placeholder_text: 75,
    disabled_text: 75,
    logo: 60,
    non_text: 60
  };
  const baseline = baselineByUseCase[normalizeApcaUseCase(check.apcaUseCase)] ?? 90;
  return Math.max(Number(check.apcaMinLc ?? 0), baseline);
}

function normalizeApcaUseCase(value) {
  return String(value ?? "body_text")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
}

function isWcagLargeText({ textSize, fontWeight }) {
  if (!Number.isFinite(textSize) || textSize <= 0) {
    return false;
  }
  return textSize >= 24 || (textSize >= 18.66 && fontWeight >= 700);
}

function colorToSrgb255(color) {
  return [color.r, color.g, color.b].map((channel) =>
    Math.max(0, Math.min(255, Math.round(channel * 255)))
  );
}

function composite(foreground, background) {
  const alpha = foreground.a ?? 1;
  return {
    r: foreground.r * alpha + background.r * (1 - alpha),
    g: foreground.g * alpha + background.g * (1 - alpha),
    b: foreground.b * alpha + background.b * (1 - alpha),
    a: 1
  };
}

function relativeLuminance(color) {
  const [r, g, b] = [color.r, color.g, color.b].map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function collectDesignNodes(input) {
  const roots = [
    ...arrayify(input.nodes),
    ...arrayify(input.design?.nodes),
    ...arrayify(input.fixture?.nodes),
    input.design?.document,
    input.document,
    input.root
  ].filter(Boolean);
  const nodes = [];

  for (const root of roots) {
    walkNode(root, (node) => {
      if (isNodeLike(node)) {
        nodes.push(node);
      }
    });
  }

  return dedupeBy(nodes, (node) => node.nodeId ?? node.id ?? `${node.name}:${node.type}`);
}

function walkNode(value, visit) {
  if (!value || typeof value !== "object") {
    return;
  }

  visit(value);
  for (const child of arrayify(value.children)) {
    walkNode(child, visit);
  }
}

function isNodeLike(value) {
  return Boolean(value?.nodeId ?? value?.id ?? value?.type);
}

function visualKindForProperty(property) {
  if (visualColorProperties.has(property)) {
    return "color";
  }
  if (visualSpacingProperties.has(property)) {
    return "spacing";
  }
  if (visualRadiusProperties.has(property)) {
    return "radius";
  }
  if (visualTypographyProperties.has(property)) {
    return "typography";
  }
  return undefined;
}

function extractRawVisualValues(value, kind) {
  if (value == null || value === "" || isVariableAlias(value)) {
    return [];
  }

  if (typeof value === "string") {
    if (kind === "color" && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim())) {
      return [value];
    }
    if (kind === "typography" && !looksLikeVariableRef(value)) {
      return [value];
    }
    return [];
  }

  if (typeof value === "number" && ["spacing", "radius", "typography"].includes(kind)) {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractRawVisualValues(item, kind));
  }

  if (typeof value === "object") {
    if (value.variableId || value.styleId || value.type === "VARIABLE_ALIAS") {
      return [];
    }

    if (kind === "color" && parseColor(value)) {
      return [toColorLabel(value)];
    }
  }

  return [];
}

function hasVariableBindingForProperty(node, property) {
  return Boolean(node.boundVariables?.[property] ?? node.variableBindings?.some?.((binding) => binding.property === property));
}

function hasStyleForProperty(node, property) {
  if (property === "textStyle" && (node.styleId || node.textStyleId)) {
    return true;
  }
  return Boolean(node.styles?.[property] ?? node.styleIds?.[property]);
}

function extractVariableIds(value) {
  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    return looksLikeVariableRef(value) ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(extractVariableIds);
  }

  if (typeof value === "object") {
    if (isVariableAlias(value)) {
      return [value.id];
    }
    if (value.variableId || value.id) {
      return [value.variableId ?? value.id];
    }
    return Object.values(value).flatMap(extractVariableIds);
  }

  return [];
}

function isVariableAlias(value) {
  return value?.type === "VARIABLE_ALIAS" && Boolean(value.id);
}

function looksLikeVariableRef(value) {
  return /^VariableID:/i.test(String(value)) || /^[a-z]+\/.+\//i.test(String(value));
}

function normalizeIssue(issueFields, context = {}) {
  return issue({
    ...issueFields,
    node: issueFields.node ?? nodeForIssue(issueFields, context)
  });
}

function issue(fields) {
  return {
    id: fields.id ?? toIssueId(fields.code, fields.node?.nodeId ?? fields.actual ?? fields.message),
    status: fields.status ?? "open",
    category: fields.category ?? "variables",
    severity: fields.severity ?? "error",
    message: fields.message ?? fields.code,
    node: normalizeNodeRef(fields.node),
    ...fields,
    node: normalizeNodeRef(fields.node)
  };
}

function nodeForIssue(issueFields, context) {
  if (issueFields.node) {
    return issueFields.node;
  }

  const variableName = String(issueFields.message ?? "").match(/Variable ([^ ]+)/)?.[1];
  const variable = context.variables?.find((candidate) => candidate.name === variableName);
  return variable ? nodeForVariable(variable, context) : null;
}

function nodeForVariable(variable, context) {
  const boundNode = arrayify(variable.boundNodes)[0];
  if (boundNode) {
    return normalizeNodeRef(boundNode);
  }

  const boundNodeId = arrayify(variable.boundNodeIds)[0];
  if (boundNodeId) {
    return { nodeId: boundNodeId, name: variable.name, type: "UNKNOWN" };
  }

  const binding = context.finalBindings?.find((candidate) =>
    [variable.variableId, variable.variableKey, variable.name].includes(candidate.variableId)
  );
  return binding?.node ?? null;
}

function normalizeNodeRef(node) {
  if (!node) {
    return null;
  }

  if (typeof node === "string") {
    return { nodeId: node, name: node, type: "UNKNOWN" };
  }

  return {
    nodeId: node.nodeId ?? node.id,
    name: node.name ?? node.nodeName ?? node.id ?? node.nodeId ?? "Unknown node",
    type: node.type ?? "UNKNOWN",
    url: node.url
  };
}

function describeColorInput(input) {
  if (typeof input === "string") {
    return input;
  }
  return input?.variableId ?? input?.id ?? input?.name ?? JSON.stringify(input);
}

function formatRatio(value) {
  return Number(value).toFixed(2);
}

function formatLc(value) {
  return Number(value).toFixed(1);
}

function colorToHex(color) {
  const [r, g, b] = colorToSrgb255(color).map((channel) =>
    channel.toString(16).padStart(2, "0")
  );
  return `#${r}${g}${b}`;
}

function toColorLabel(value) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && value) {
    return `rgb(${value.r},${value.g},${value.b})`;
  }
  return String(value);
}

function issueKey(issue) {
  return `${issue.code}:${issue.category}:${issue.node?.nodeId ?? ""}:${issue.actual ?? issue.message}`;
}

function toIssueId(code, value) {
  return `${String(code).toLowerCase()}-${String(value ?? "issue")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)}`;
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
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

function arrayify(value) {
  if (value == null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function equalsLoose(left, right) {
  return String(left ?? "").toLowerCase() === String(right ?? "").toLowerCase();
}
