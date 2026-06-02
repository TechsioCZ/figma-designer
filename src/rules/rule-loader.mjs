import {
  componentRuleIds,
  evaluateComponentRules
} from "./component-rules.mjs";
import {
  checkLayoutRules,
  layoutRuleDefinitions
} from "./layout-rules.mjs";
import {
  checkSpacingFixture,
  spacingRuleDefinitions
} from "./spacing-rules.mjs";
import {
  validateVariablePolicy,
  variableChainPolicy
} from "./variable-policy.mjs";
import {
  provisionalExtensionPolicy,
  validateProvisionalExtensions
} from "./provisional-extension-policy.mjs";

const schemaVersion = "1.0.0";
const kind = "figma-rule-loader-result";

const groupDefinitions = Object.freeze([
  Object.freeze({
    id: "component",
    label: "Component Rules",
    evaluatorName: "evaluateComponentRules",
    ruleIds: Object.freeze(Object.values(componentRuleIds)),
    evaluate: evaluateComponentGroup
  }),
  Object.freeze({
    id: "layout",
    label: "Layout Rules",
    evaluatorName: "checkLayoutRules",
    ruleIds: Object.freeze(layoutRuleDefinitions.map((rule) => rule.id)),
    evaluate: evaluateLayoutGroup
  }),
  Object.freeze({
    id: "spacing",
    label: "Spacing Rules",
    evaluatorName: "checkSpacingFixture",
    ruleIds: Object.freeze(spacingRuleDefinitions.map((rule) => rule.role)),
    evaluate: evaluateSpacingGroup
  }),
  Object.freeze({
    id: "variable",
    label: "Variable Chain Policy",
    evaluatorName: "validateVariablePolicy",
    ruleIds: Object.freeze([
      "raw-final-values",
      "variable-alias-chain",
      "semantic-variable-reuse",
      "component-variable-need",
      "primitive-final-binding"
    ]),
    evaluate: evaluateVariableGroup
  }),
  Object.freeze({
    id: "provisional",
    label: "Provisional Extension Policy",
    evaluatorName: "validateProvisionalExtensions",
    ruleIds: Object.freeze([
      "provisional-report-fields",
      "provisional-gap-link",
      "provisional-approval",
      "provisional-marking",
      "provisional-variable-chain"
    ]),
    evaluate: evaluateProvisionalGroup
  })
]);

const groupsById = new Map(groupDefinitions.map((group) => [group.id, group]));

export const allRuleGroupIds = Object.freeze(groupDefinitions.map((group) => group.id));

export function listRuleGroups() {
  return groupDefinitions.map((group) => groupMetadata(group));
}

export function loadRuleGroups(selectedGroups = allRuleGroupIds, options = {}) {
  const groups = resolveRuleGroups(selectedGroups);

  return Object.freeze({
    kind: "figma-rule-registry",
    schemaVersion,
    groupIds: Object.freeze(groups.map((group) => group.id)),
    groups: Object.freeze(groups.map((group) => groupMetadata(group))),
    run(context = {}, runOptions = {}) {
      return runRuleGroups(context, {
        ...options,
        ...runOptions,
        groups: groups.map((group) => group.id)
      });
    }
  });
}

export function runRuleGroups(context = {}, options = {}) {
  const groups = resolveRuleGroups(options.groups ?? options.selectedGroups ?? allRuleGroupIds);
  const groupResults = groups.map((group) => evaluateGroup(group, context, options));
  const failedGroups = groupResults.filter((result) => result.status === "failed");

  return {
    kind,
    schemaVersion,
    runId: options.runId ?? context.runId ?? context.design?.runId,
    status: failedGroups.length > 0 ? "failed" : "passed",
    groupIds: groups.map((group) => group.id),
    summary: summarizeGroups(groupResults),
    groups: groupResults
  };
}

function resolveRuleGroups(selectedGroups) {
  const selected = normalizeSelectedGroups(selectedGroups);
  const unknown = selected.filter((groupId) => !groupsById.has(groupId));

  if (unknown.length > 0) {
    throw new RuleLoaderError(`Unknown rule group(s): ${unknown.join(", ")}`, {
      availableGroups: allRuleGroupIds,
      selectedGroups: selected
    });
  }

  return selected.map((groupId) => groupsById.get(groupId));
}

function normalizeSelectedGroups(selectedGroups) {
  if (selectedGroups === "all" || selectedGroups === undefined || selectedGroups === null) {
    return allRuleGroupIds;
  }

  const selected = Array.isArray(selectedGroups) ? selectedGroups : [selectedGroups];
  const normalized = selected.map((groupId) => String(groupId).trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : allRuleGroupIds;
}

function evaluateGroup(group, context, options) {
  const result = group.evaluate(context, options);
  const normalized = normalizeGroupResult(group, result);

  return {
    groupId: group.id,
    label: group.label,
    evaluatorName: group.evaluatorName,
    status: normalized.status,
    summary: normalized.summary,
    issues: normalized.issues,
    violations: normalized.violations,
    gaps: normalized.gaps,
    result
  };
}

function evaluateComponentGroup(context, options) {
  const componentContext = context.component ?? {};
  return evaluateComponentRules(
    {
      discovery: componentContext.discovery ?? context.discovery,
      nestingMap:
        componentContext.nestingMap ??
        componentContext.componentNestingMap ??
        context.nestingMap ??
        context.componentNestingMap,
      design:
        componentContext.design ??
        context.design ??
        context.document ??
        context.fixture
    },
    options
  );
}

function evaluateLayoutGroup(context, options) {
  const layoutFixture =
    context.layout ??
    context.layoutFixture ??
    context.layoutRules ??
    context.design?.layout ??
    context.fixture?.layout;

  return checkLayoutRules(layoutFixture, options);
}

function evaluateSpacingGroup(context, options) {
  const spacingFixture =
    context.spacing ??
    context.spacingFixture ??
    context.spacingRules ??
    context.design?.spacing ??
    context.fixture?.spacing;

  return checkSpacingFixture(spacingFixture, {
    ...options,
    context: options.spacingContext ?? context.spacingContext ?? context.discovery ?? context
  });
}

function evaluateVariableGroup(context) {
  const policyInput = context.variablePolicy ?? context.variablesPolicy ?? {};
  const variables = normalizeVariableInput(policyInput.variables ?? context.variables);

  return validateVariablePolicy({
    variables,
    variableReferences:
      policyInput.variableReferences ??
      context.variableReferences,
    requiredModes:
      policyInput.requiredModes ??
      policyInput.modes ??
      context.requiredModes ??
      context.modes ??
      context.discovery?.variables?.collections?.flatMap((collection) =>
        (collection.modes ?? []).map((mode) => ({
          ...mode,
          collectionId: collection.collectionId ?? collection.id,
          collectionName: collection.name
        }))
      ) ??
      [],
    rawFinalValues:
      policyInput.rawFinalValues ??
      context.rawFinalValues ??
      context.design?.rawFinalValues ??
      [],
    proposedVariables:
      policyInput.proposedVariables ??
      context.proposedVariables ??
      [],
    finalBindings:
      policyInput.finalBindings ??
      context.finalBindings ??
      []
  });
}

function evaluateProvisionalGroup(context) {
  const policyInput = context.provisionalPolicy ?? context.provisionalExtensionPolicy ?? {};

  return validateProvisionalExtensions({
    designSystemGaps:
      policyInput.designSystemGaps ??
      context.designSystemGaps ??
      context.report?.designSystemGaps ??
      [],
    provisionalExtensions:
      policyInput.provisionalExtensions ??
      context.provisionalExtensions ??
      context.report?.provisionalExtensions ??
      []
  });
}

function normalizeVariableInput(variables) {
  if (Array.isArray(variables)) {
    return variables;
  }

  return variables?.references ?? [];
}

function normalizeGroupResult(group, result) {
  const issues = arrayify(result.issues);
  const violations = arrayify(result.violations);
  const gaps = [
    ...arrayify(result.gaps),
    ...arrayify(result.designSystemGaps)
  ];

  return {
    status: resultStatus(result),
    issues,
    violations,
    gaps,
    summary: {
      issueCount: issues.length,
      violationCount: violations.length,
      gapCount: gaps.length,
      ruleCount: group.ruleIds.length
    }
  };
}

function resultStatus(result) {
  if (result.status === "failed" || result.status === "passed") {
    return result.status;
  }

  if (typeof result.ok === "boolean") {
    return result.ok ? "passed" : "failed";
  }

  return [...arrayify(result.issues), ...arrayify(result.violations), ...arrayify(result.gaps)].length > 0
    ? "failed"
    : "passed";
}

function summarizeGroups(groupResults) {
  return groupResults.reduce(
    (summary, group) => {
      summary.groupCount += 1;
      summary.passedGroupCount += group.status === "passed" ? 1 : 0;
      summary.failedGroupCount += group.status === "failed" ? 1 : 0;
      summary.issueCount += group.summary.issueCount;
      summary.violationCount += group.summary.violationCount;
      summary.gapCount += group.summary.gapCount;
      summary.ruleCount += group.summary.ruleCount;
      return summary;
    },
    {
      groupCount: 0,
      passedGroupCount: 0,
      failedGroupCount: 0,
      issueCount: 0,
      violationCount: 0,
      gapCount: 0,
      ruleCount: 0
    }
  );
}

function groupMetadata(group) {
  return {
    id: group.id,
    label: group.label,
    evaluatorName: group.evaluatorName,
    ruleIds: [...group.ruleIds]
  };
}

function arrayify(value) {
  return Array.isArray(value) ? value : [];
}

export class RuleLoaderError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "RuleLoaderError";
    this.details = details;
  }
}

export const ruleLoaderPolicies = Object.freeze({
  variableChainPolicy,
  provisionalExtensionPolicy
});
