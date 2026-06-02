import assert from "node:assert/strict";
import test from "node:test";

import { validateVariablesThemesContrast } from "../src/validation/variables-themes-contrast-validator.mjs";

const node = {
  nodeId: "12:56",
  name: "Sign in Button",
  type: "INSTANCE",
  url: "https://www.figma.com/file/Fixture/Customer?node-id=12-56"
};

const collections = [
  {
    collectionId: "VariableCollectionId:colors",
    name: "Color",
    modes: [
      { modeId: "ModeId:light", name: "Light" },
      { modeId: "ModeId:dark", name: "Dark" }
    ]
  }
];

test("rejects raw hex color values on final UI nodes", () => {
  const result = validateVariablesThemesContrast({
    nodes: [
      {
        ...node,
        fills: "#1A47CC"
      }
    ]
  });

  assert.equal(result.status, "failed");
  const issue = result.issues.find((candidate) => candidate.code === "RAW_FINAL_VALUE");
  assert.ok(issue);
  assert.equal(issue.category, "raw_color");
  assert.deepEqual(issue.node, node);
});

test("rejects broken primitive to semantic to component variable alias chains", () => {
  const result = validateVariablesThemesContrast({
    variables: [
      primitiveBlue(),
      {
        variableId: "VariableID:component-button-bg-primary",
        name: "component/button/background/primary",
        level: "component",
        resolvedType: "color",
        aliasChain: ["primitive/color/blue/600"],
        boundNodes: [node]
      }
    ]
  });

  assert.equal(result.status, "failed");
  const issue = result.issues.find(
    (candidate) => candidate.code === "BROKEN_VARIABLE_ALIAS_CHAIN"
  );
  assert.ok(issue);
  assert.equal(issue.category, "broken_variable_alias");
  assert.equal(issue.node.nodeId, node.nodeId);
});

test("rejects variables that do not resolve in every collection mode", () => {
  const result = validateVariablesThemesContrast({
    variableCollections: collections,
    variables: [
      {
        ...primitiveBlue(),
        valuesByMode: {
          "ModeId:light": { r: 0.1, g: 0.28, b: 0.8, a: 1 }
        },
        boundNodes: [node]
      }
    ]
  });

  assert.equal(result.status, "failed");
  const issue = result.issues.find(
    (candidate) => candidate.code === "MISSING_VARIABLE_MODE_VALUE"
  );
  assert.ok(issue);
  assert.equal(issue.category, "theme_mode");
  assert.match(issue.message, /Dark/);
  assert.equal(issue.node.nodeId, node.nodeId);
});

test("rejects contrast expectations below hard WCAG AAA and APCA Gold thresholds", () => {
  const result = validateVariablesThemesContrast({
    contrastChecks: [
      {
        name: "Secondary help text",
        foreground: "#888888",
        background: "#FFFFFF",
        minRatio: 4.5,
        modeName: "Light",
        node
      }
    ]
  });

  assert.equal(result.status, "failed");
  const issue = result.issues.find(
    (candidate) => candidate.code === "WCAG22_AAA_CONTRAST_FAILED"
  );
  assert.ok(issue);
  assert.equal(issue.category, "contrast");
  assert.equal(issue.severity, "error");
  assert.equal(issue.node.nodeId, node.nodeId);
  assert.ok(
    result.issues.some((candidate) => candidate.code === "APCA_GOLD_CONTRAST_FAILED")
  );
});

test("passes component variable chains, mode coverage, and contrast expectations", () => {
  const result = validateVariablesThemesContrast({
    variableCollections: collections,
    variables: validVariableChain(),
    finalBindings: [
      {
        property: "fills",
        variableId: "VariableID:component-button-bg-primary",
        node
      }
    ],
    contrastChecks: [
      {
        name: "Primary button label",
        foreground: "VariableID:component-button-text-primary",
        background: "VariableID:component-button-bg-primary",
        modeId: "ModeId:light",
        modeName: "Light",
        node
      }
    ]
  });

  assert.equal(result.status, "passed");
  assert.deepEqual(result.issues, []);
  assert.equal(result.summary.variableCount, 6);
  assert.equal(result.summary.contrastCheckCount, 1);
});

function primitiveBlue() {
  return {
    variableId: "VariableID:primitive-blue-600",
    name: "primitive/color/blue/600",
    level: "primitive",
    collectionId: "VariableCollectionId:colors",
    resolvedType: "color",
    valuesByMode: {
      "ModeId:light": { r: 0.0902, g: 0.2431, b: 0.6588, a: 1 },
      "ModeId:dark": { r: 0.8588, g: 0.9176, b: 0.9961, a: 1 }
    }
  };
}

function validVariableChain() {
  return [
    primitiveBlue(),
    {
      variableId: "VariableID:primitive-neutral-0",
      name: "primitive/color/neutral/0",
      level: "primitive",
      collectionId: "VariableCollectionId:colors",
      resolvedType: "color",
      valuesByMode: {
        "ModeId:light": { r: 1, g: 1, b: 1, a: 1 },
        "ModeId:dark": { r: 0, g: 0, b: 0, a: 1 }
      }
    },
    {
      variableId: "VariableID:semantic-action-primary",
      name: "semantic/action/primary",
      level: "semantic",
      collectionId: "VariableCollectionId:colors",
      resolvedType: "color",
      aliasChain: ["primitive/color/blue/600"],
      aliasesTo: "primitive/color/blue/600",
      valuesByMode: {
        "ModeId:light": { type: "VARIABLE_ALIAS", id: "VariableID:primitive-blue-600" },
        "ModeId:dark": { type: "VARIABLE_ALIAS", id: "VariableID:primitive-blue-600" }
      }
    },
    {
      variableId: "VariableID:semantic-text-on-action",
      name: "semantic/text/on-action",
      level: "semantic",
      collectionId: "VariableCollectionId:colors",
      resolvedType: "color",
      aliasChain: ["primitive/color/neutral/0"],
      aliasesTo: "primitive/color/neutral/0",
      valuesByMode: {
        "ModeId:light": { type: "VARIABLE_ALIAS", id: "VariableID:primitive-neutral-0" },
        "ModeId:dark": { type: "VARIABLE_ALIAS", id: "VariableID:primitive-neutral-0" }
      }
    },
    {
      variableId: "VariableID:component-button-bg-primary",
      name: "component/button/background/primary",
      level: "component",
      collectionId: "VariableCollectionId:colors",
      resolvedType: "color",
      aliasChain: ["semantic/action/primary", "primitive/color/blue/600"],
      aliasesTo: "semantic/action/primary",
      boundNodes: [node],
      valuesByMode: {
        "ModeId:light": { type: "VARIABLE_ALIAS", id: "VariableID:semantic-action-primary" },
        "ModeId:dark": { type: "VARIABLE_ALIAS", id: "VariableID:semantic-action-primary" }
      }
    },
    {
      variableId: "VariableID:component-button-text-primary",
      name: "component/button/text/primary",
      level: "component",
      collectionId: "VariableCollectionId:colors",
      resolvedType: "color",
      aliasChain: ["semantic/text/on-action", "primitive/color/neutral/0"],
      aliasesTo: "semantic/text/on-action",
      boundNodes: [node],
      valuesByMode: {
        "ModeId:light": { type: "VARIABLE_ALIAS", id: "VariableID:semantic-text-on-action" },
        "ModeId:dark": { type: "VARIABLE_ALIAS", id: "VariableID:semantic-text-on-action" }
      }
    }
  ];
}
