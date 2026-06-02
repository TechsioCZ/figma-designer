import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSpacingRuleSet,
  checkSpacingFixture,
  extractSpacingGuidance,
  spacingRuleDefinitions
} from "../src/rules/spacing-rules.mjs";

const spacingVariable = {
  variableId: "VariableID:semantic-form-item-gap",
  variableKey: "semantic-form-item-gap-key",
  name: "semantic/spacing/form/item-gap",
  role: "semantic",
  type: "FLOAT",
  valuesByMode: {
    "ModeId:default": 12
  },
  aliasChain: [
    {
      variableId: "VariableID:semantic-form-item-gap",
      name: "semantic/spacing/form/item-gap",
      role: "semantic"
    },
    {
      variableId: "VariableID:primitive-spacing-300",
      name: "primitive/spacing/300",
      role: "primitive"
    }
  ]
};

test("exports rules for every spacing composition role", () => {
  assert.deepEqual(
    spacingRuleDefinitions.map((rule) => rule.role),
    [
      "form_item",
      "field_group",
      "page_section",
      "card",
      "panel",
      "header",
      "footer",
      "interactive_cluster"
    ]
  );

  const ruleSet = buildSpacingRuleSet({
    variables: {
      references: [spacingVariable]
    }
  });

  assert.equal(ruleSet.kind, "figma-spacing-rules");
  assert.equal(ruleSet.rules.length, 8);
  assert.deepEqual(ruleSet.discoveredSpacingVariables.map((variable) => variable.name), [
    "semantic/spacing/form/item-gap"
  ]);
});

test("passes form spacing when relationships bind to discovered spacing variables", () => {
  const result = checkSpacingFixture({
    spacingGuidance: {
      variables: [
        {
          ...spacingVariable,
          appliesTo: ["form_item"]
        }
      ]
    },
    nodes: [
      {
        nodeId: "form:1",
        name: "Checkout Form Fields",
        spacingRole: "form_item",
        relationships: [
          {
            kind: "item_to_item",
            variableId: "VariableID:semantic-form-item-gap"
          },
          {
            kind: "label_to_control",
            value: {
              variableName: "semantic/spacing/form/item-gap"
            }
          },
          {
            kind: "control_to_help",
            variableId: "VariableID:semantic-form-item-gap"
          }
        ]
      }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.checkedRelationships, 3);
  assert.equal(result.summary.violations, 0);
  assert.equal(result.summary.gaps, 0);
  assert.deepEqual(
    result.checks.map((check) => check.status),
    ["passed", "passed", "passed"]
  );
  assert.deepEqual(result.checks[0].binding.aliasChain.map((link) => link.role), [
    "semantic",
    "primitive"
  ]);
});

test("routes omitted required spacing relationships to Design System Gaps", () => {
  const result = checkSpacingFixture({
    spacingGuidance: {
      variables: [
        {
          ...spacingVariable,
          appliesTo: ["form_item"]
        }
      ]
    },
    nodes: [
      {
        nodeId: "form:missing-help",
        name: "Profile Form Fields",
        role: "form_item",
        relationships: [
          {
            kind: "item_to_item",
            variableId: "VariableID:semantic-form-item-gap"
          },
          {
            kind: "label_to_control",
            variableId: "VariableID:semantic-form-item-gap"
          }
        ]
      }
    ]
  });

  assert.equal(result.ok, false);
  assert.equal(result.summary.checkedRelationships, 3);
  assert.equal(result.summary.violations, 0);
  assert.equal(result.summary.gaps, 1);
  assert.equal(result.gaps[0].code, "missing_spacing_binding");
  assert.equal(result.gaps[0].relationship, "control_to_help");
});

test("passes page spacing when section rhythm uses discovered approved patterns", () => {
  const result = checkSpacingFixture({
    spacingGuidance: {
      patterns: [
        {
          patternId: "pattern-page-section-rhythm",
          name: "Page Section Spacing Pattern",
          spacingRole: "page_section",
          spacing: {
            section_to_section: "semantic/spacing/page/section-gap",
            section_padding: "semantic/spacing/page/section-padding"
          }
        }
      ]
    },
    nodes: [
      {
        nodeId: "page:1",
        name: "Dashboard Page Sections",
        role: "page_section",
        spacing: {
          section_to_section: {
            patternId: "pattern-page-section-rhythm"
          },
          section_padding: {
            patternName: "Page Section Spacing Pattern"
          },
          container_gutter: {
            patternId: "pattern-page-section-rhythm"
          }
        }
      }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.discoveredSpacingPatterns, 1);
  assert.equal(result.summary.checkedRelationships, 3);
  assert.deepEqual(
    result.checks.map((check) => check.binding.patternName),
    ["Page Section Spacing Pattern", "Page Section Spacing Pattern", "Page Section Spacing Pattern"]
  );
});

test("flags raw spacing values as guardrail violations", () => {
  const result = checkSpacingFixture({
    spacingGuidance: {
      variables: [
        {
          ...spacingVariable,
          appliesTo: ["interactive_cluster"]
        }
      ]
    },
    nodes: [
      {
        nodeId: "actions:1",
        name: "Primary Action Cluster",
        role: "interactive_cluster",
        relationships: [
          {
            kind: "control_gap",
            variableId: "VariableID:semantic-form-item-gap"
          },
          {
            kind: "button_group_gap",
            rawValue: 18
          },
          {
            kind: "icon_label_gap",
            variableId: "VariableID:semantic-form-item-gap"
          }
        ]
      }
    ]
  });

  assert.equal(result.ok, false);
  assert.equal(result.summary.violations, 1);
  assert.equal(result.summary.gaps, 0);
  assert.equal(result.violations[0].code, "raw_spacing_value");
  assert.equal(result.violations[0].type, "guardrail_violation");
  assert.equal(result.violations[0].rawValue, 18);
});

test("routes missing spacing guidance to Design System Gaps", () => {
  const result = checkSpacingFixture({
    spacingGuidance: {
      variables: [],
      patterns: []
    },
    nodes: [
      {
        nodeId: "fieldset:1",
        name: "Billing Address Field Group",
        role: "field_group",
        relationships: [
          {
            kind: "field_group_gap"
          }
        ]
      }
    ]
  });

  assert.equal(result.ok, false);
  assert.equal(result.summary.violations, 0);
  assert.equal(result.summary.gaps, 4);
  assert.deepEqual(
    result.gaps.map((gap) => gap.type),
    ["design_system_gap", "design_system_gap", "design_system_gap", "design_system_gap"]
  );
  assert.deepEqual(
    result.gaps.map((gap) => gap.code),
    [
      "missing_spacing_guidance",
      "missing_spacing_binding",
      "missing_spacing_binding",
      "missing_spacing_binding"
    ]
  );
  assert.match(result.gaps[0].message, /No discovered spacing variable or approved pattern/);
});

test("discovers spacing variables and patterns from discovery-shaped context", () => {
  const guidance = extractSpacingGuidance({
    variables: {
      references: [
        {
          variableId: "VariableID:spacing-200",
          name: "primitive/spacing/200",
          role: "primitive",
          type: "FLOAT",
          valuesByMode: {
            "ModeId:default": 8
          }
        },
        {
          variableId: "VariableID:color-action",
          name: "semantic/action/primary",
          role: "semantic",
          type: "COLOR"
        }
      ]
    },
    approvedPatterns: [
      {
        patternId: "login-form-pattern",
        name: "Login Form Pattern",
        description: "Approved field stack spacing for login forms."
      },
      {
        patternId: "marketing-hero-pattern",
        name: "Marketing Hero Pattern"
      }
    ]
  });

  assert.deepEqual(
    guidance.variables.map((variable) => variable.variableId),
    ["VariableID:spacing-200"]
  );
  assert.deepEqual(
    guidance.patterns.map((pattern) => pattern.patternId),
    ["login-form-pattern"]
  );
  assert.deepEqual(guidance.patterns[0].appliesTo, ["form_item"]);
});
