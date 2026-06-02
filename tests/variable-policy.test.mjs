import assert from "node:assert/strict";
import test from "node:test";

import { validateProvisionalExtensions } from "../src/rules/provisional-extension-policy.mjs";
import { validateVariablePolicy } from "../src/rules/variable-policy.mjs";

const node = {
  nodeId: "12:34",
  name: "Login Card",
  type: "FRAME",
  url: "https://www.figma.com/file/Fixture/Customer?node-id=12-34"
};

const variableReferences = [
  {
    variableId: "VariableID:primitive-blue-600",
    name: "primitive/color/blue/600",
    level: "primitive",
    resolvedType: "color",
    valuesByMode: {
      "ModeId:light": "#1A47CC",
      "ModeId:dark": "#88A3FF"
    },
    usageCount: 1
  },
  {
    variableId: "VariableID:semantic-action-primary",
    name: "semantic/action/primary",
    level: "semantic",
    resolvedType: "color",
    aliasChain: ["primitive/color/blue/600"],
    aliasesTo: "primitive/color/blue/600",
    valuesByMode: {
      "ModeId:light": {
        type: "VARIABLE_ALIAS",
        id: "VariableID:primitive-blue-600"
      },
      "ModeId:dark": {
        type: "VARIABLE_ALIAS",
        id: "VariableID:primitive-blue-600"
      }
    },
    usageCount: 1
  },
  {
    variableId: "VariableID:component-button-bg-primary",
    name: "component/button/background/primary",
    level: "component",
    resolvedType: "color",
    aliasChain: ["semantic/action/primary", "primitive/color/blue/600"],
    aliasesTo: "semantic/action/primary",
    valuesByMode: {
      "ModeId:light": {
        type: "VARIABLE_ALIAS",
        id: "VariableID:semantic-action-primary"
      },
      "ModeId:dark": {
        type: "VARIABLE_ALIAS",
        id: "VariableID:semantic-action-primary"
      }
    },
    usageCount: 1
  }
];

test("rejects raw final UI values when variable chains exist", () => {
  const result = validateVariablePolicy({
    variables: variableReferences,
    rawFinalValues: [
      {
        kind: "color",
        property: "fills",
        value: "#1A47CC",
        node
      }
    ]
  });

  assert.equal(result.status, "failed");
  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ["RAW_FINAL_VALUE"]
  );
  assert.equal(result.issues[0].category, "raw_color");
});

test("rejects broken component variable alias chains", () => {
  const result = validateVariablePolicy({
    variables: [
      variableReferences[0],
      {
        variableId: "VariableID:component-button-bg-primary",
        name: "component/button/background/primary",
        level: "component",
        resolvedType: "color",
        aliasChain: ["primitive/color/blue/600"],
        usageCount: 1
      }
    ]
  });

  assert.equal(result.status, "failed");
  assert.equal(result.issues[0].code, "BROKEN_VARIABLE_ALIAS_CHAIN");
  assert.equal(result.issues[0].category, "broken_variable_alias");
  assert.match(result.issues[0].expected, /component -> semantic -> primitive/);
});

test("rejects alias chains missing required mode coverage", () => {
  const result = validateVariablePolicy({
    requiredModes: [
      { modeId: "ModeId:light", name: "Light" },
      { modeId: "ModeId:dark", name: "Dark" }
    ],
    variables: [
      variableReferences[0],
      {
        ...variableReferences[1],
        valuesByMode: {
          "ModeId:light": {
            type: "VARIABLE_ALIAS",
            id: "VariableID:primitive-blue-600"
          }
        }
      },
      variableReferences[2]
    ]
  });

  assert.equal(result.status, "failed");
  assert.ok(result.issues.some((issue) => issue.code === "BROKEN_VARIABLE_MODE_COVERAGE"));
  const issue = result.issues.find((candidate) => candidate.code === "BROKEN_VARIABLE_MODE_COVERAGE");
  assert.equal(issue.category, "theme_mode");
  assert.match(issue.actual, /semantic\/action\/primary: Dark/);
});

test("rejects duplicate semantic variables before creating new semantic meaning", () => {
  const result = validateVariablePolicy({
    variables: variableReferences,
    proposedVariables: [
      {
        variableId: "VariableID:semantic-action-primary-new",
        name: "semantic/action/main",
        level: "semantic",
        resolvedType: "color",
        aliasChain: ["primitive/color/blue/600"]
      }
    ]
  });

  assert.equal(result.status, "failed");
  assert.equal(result.issues[0].code, "DUPLICATE_SEMANTIC_VARIABLE");
  assert.match(result.issues[0].message, /duplicates existing semantic meaning/);
});

test("rejects component variables without a component-specific surface need", () => {
  const result = validateVariablePolicy({
    variables: variableReferences,
    proposedVariables: [
      {
        variableId: "VariableID:component-extra-bg",
        name: "component/extra/background",
        level: "component",
        resolvedType: "color",
        aliasChain: ["semantic/action/primary", "primitive/color/blue/600"]
      }
    ]
  });

  assert.equal(result.status, "failed");
  assert.equal(result.issues[0].code, "COMPONENT_VARIABLE_WITHOUT_NEED");
});

test("rejects created Provisional Extensions without operator approval", () => {
  const result = validateProvisionalExtensions({
    designSystemGaps: [designSystemGap()],
    provisionalExtensions: [
      {
        ...approvedExtension(),
        status: "created",
        approval: {
          required: true,
          granted: false
        }
      }
    ]
  });

  assert.equal(result.status, "failed");
  assert.ok(result.issues.some((issue) => issue.code === "PROVISIONAL_EXTENSION_UNAPPROVED"));
});

test("accepts approved Provisional Extension report shape", () => {
  const result = validateProvisionalExtensions({
    designSystemGaps: [designSystemGap()],
    provisionalExtensions: [approvedExtension()]
  });

  assert.deepEqual(result, {
    status: "passed",
    issues: []
  });
});

function designSystemGap() {
  return {
    id: "gap-auth-card",
    category: "component",
    severity: "medium",
    status: "provisional_extension_approved",
    summary: "No approved authentication card component exists.",
    neededCapability: "Authentication card with semantic surface and body slot.",
    searchedAlternatives: [
      {
        name: "Card / Default",
        result: "No authentication header treatment."
      }
    ],
    impact: "Authentication screens would require repeated manual composition.",
    provisionalExtensionId: "ext-auth-card"
  };
}

function approvedExtension() {
  return {
    id: "ext-auth-card",
    gapId: "gap-auth-card",
    status: "created",
    approval: {
      required: true,
      granted: true,
      approvedBy: "operator",
      approvedAt: "2026-06-02T10:05:00.000Z"
    },
    proposal: "Create the smallest provisional Auth Card component using existing panel spacing, surface, text, and action variables.",
    node: {
      nodeId: "12:40",
      name: "Provisional Auth Card",
      type: "COMPONENT",
      url: "https://www.figma.com/file/Fixture/Customer?node-id=12-40"
    },
    provisionalMarking: "Component name is prefixed with Provisional and includes a visible provisional badge.",
    variableChain: [
      {
        level: "primitive",
        variableName: "primitive/color/neutral/0",
        variableId: "VariableID:primitive-color-neutral-0"
      },
      {
        level: "semantic",
        variableName: "semantic/surface/panel",
        variableId: "VariableID:semantic-surface-panel",
        aliasesTo: "primitive/color/neutral/0"
      },
      {
        level: "component",
        variableName: "component/auth-card/background",
        variableId: "VariableID:component-auth-card-bg",
        aliasesTo: "semantic/surface/panel"
      }
    ],
    usedByNodes: [node],
    promotionRecommendation: "Promote only if authentication cards become an approved reusable pattern."
  };
}
