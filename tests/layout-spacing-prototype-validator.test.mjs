import assert from "node:assert/strict";
import test from "node:test";

import {
  checkPrototypeDeadEnds,
  kind,
  validateLayoutSpacingPrototype,
  validateLayoutSpacingPrototypeValidator
} from "../src/validation/layout-spacing-prototype-validator.mjs";

const figmaFileUrl = "https://www.figma.com/file/AbCdEfGhIjKlMnOpQrStUv/Customer-Portal";

const spacingVariable = {
  variableId: "VariableID:semantic-form-item-gap",
  variableKey: "semantic-form-item-gap-key",
  name: "semantic/spacing/form/item-gap",
  role: "semantic",
  type: "FLOAT",
  appliesTo: ["form_item"],
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

test("exports a standalone layout, spacing, and prototype validation family", () => {
  assert.equal(kind, "figma-layout-spacing-prototype-validation-result");
  assert.equal(validateLayoutSpacingPrototypeValidator, validateLayoutSpacingPrototype);
});

test("reports invalid layout hygiene and responsive editability issues", () => {
  const result = validateLayoutSpacingPrototype(
    {
      source: "invalid-layout-fixture",
      layout: {
        root: {
          nodeId: "layout:page",
          name: "Checkout / Desktop",
          type: "FRAME",
          layoutRole: "page",
          layoutMode: "NONE",
          children: [
            {
              nodeId: "layout:section",
              name: "Customer details",
              type: "FRAME",
              layoutRole: "section",
              layoutMode: "HORIZONTAL",
              primaryAxisAlignItems: "MIN",
              counterAxisAlignItems: "MIN",
              locked: true,
              layoutSizingHorizontal: "FIXED",
              children: [
                {
                  nodeId: "layout:absolute",
                  name: "Floating helper text",
                  type: "TEXT",
                  layoutPositioning: "ABSOLUTE"
                }
              ]
            }
          ]
        }
      }
    },
    { figmaFileUrl }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.equal(result.summary.layoutChecked, true);
  assert.equal(result.summary.layoutIssueCount, 5);
  assert.deepEqual(
    result.issues.map((issue) => issue.category),
    [
      "layout_hygiene",
      "layout_hygiene",
      "layout_hygiene",
      "layout_hygiene",
      "layout_hygiene"
    ]
  );
  assert.ok(result.issues.some((issue) => issue.code === "LAYOUT_AUTO_LAYOUT_REQUIRED"));
  assert.ok(result.issues.some((issue) => issue.code === "LAYOUT_AUTO_LAYOUT_DIRECTION"));
  assert.ok(result.issues.some((issue) => issue.code === "LAYOUT_RESPONSIVE_RESIZING"));
  assert.ok(result.issues.some((issue) => issue.code === "LAYOUT_EDITABLE_FRAME_STRUCTURE"));

  const absoluteIssue = result.issues.find(
    (issue) => issue.node.nodeId === "layout:absolute"
  );
  assert.ok(absoluteIssue);
  assert.match(absoluteIssue.message, /absolutely positioned/);
  assert.equal(
    absoluteIssue.node.url,
    "https://www.figma.com/file/AbCdEfGhIjKlMnOpQrStUv/Customer-Portal?node-id=layout-absolute"
  );
});

test("reports invalid spacing bindings for page and form spacing rules", () => {
  const result = validateLayoutSpacingPrototype({
    source: "invalid-spacing-fixture",
    spacing: {
      spacingGuidance: {
        variables: [spacingVariable],
        patterns: [
          {
            patternId: "pattern-page-section-rhythm",
            name: "Page Section Spacing Pattern",
            spacingRole: "page_section"
          }
        ]
      },
      nodes: [
        {
          nodeId: "spacing:form",
          name: "Checkout form fields",
          role: "form_item",
          relationships: [
            {
              kind: "item_to_item",
              rawValue: 18
            },
            {
              kind: "label_to_control",
              variableId: "VariableID:semantic-form-item-gap"
            },
            {
              kind: "control_to_help",
              variableId: "VariableID:semantic-form-item-gap"
            }
          ]
        },
        {
          nodeId: "spacing:page",
          name: "Dashboard section stack",
          role: "page_section",
          relationships: [
            {
              kind: "section_to_section",
              patternName: "Missing Page Pattern"
            },
            {
              kind: "section_padding",
              patternId: "pattern-page-section-rhythm"
            },
            {
              kind: "container_gutter",
              patternId: "pattern-page-section-rhythm"
            }
          ]
        }
      ]
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.summary.spacingChecked, true);
  assert.equal(result.summary.spacingIssueCount, 2);
  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ["SPACING_RAW_SPACING_VALUE", "SPACING_UNRESOLVED_SPACING_PATTERN"]
  );
  assert.deepEqual(
    result.issues.map((issue) => issue.category),
    ["raw_spacing", "raw_spacing"]
  );
  assert.match(result.issues[0].actual, /Raw spacing value 18/);
  assert.match(result.issues[1].recommendation, /Refresh live discovery/);
});

test("reports prototype dead ends", () => {
  const result = validateLayoutSpacingPrototype({
    source: "prototype-dead-end-fixture",
    prototype: {
      nodes: [
        {
          nodeId: "proto:start",
          name: "Start screen",
          type: "FRAME",
          prototypeRole: "screen",
          children: [
            {
              nodeId: "proto:button",
              name: "Continue",
              type: "INSTANCE"
            }
          ]
        },
        {
          nodeId: "proto:done",
          name: "Done screen",
          type: "FRAME",
          prototypeRole: "screen",
          terminalNode: true
        }
      ]
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.summary.prototypeChecked, true);
  assert.equal(result.summary.prototypeIssueCount, 1);
  assert.equal(result.issues[0].code, "PROTOTYPE_DEAD_END");
  assert.equal(result.issues[0].category, "prototype_dead_end");
  assert.equal(result.issues[0].severity, "error");
  assert.equal(result.issues[0].node.nodeId, "proto:start");
  assert.match(result.issues[0].message, /forward path/);
});

test("passes valid layout, spacing, and prototype checks", () => {
  const result = validateLayoutSpacingPrototype(
    {
      source: "valid-family-fixture",
      layout: {
        root: {
          nodeId: "pass:page",
          name: "Login / Desktop",
          type: "FRAME",
          layoutRole: "page",
          layoutMode: "VERTICAL",
          primaryAxisAlignItems: "MIN",
          counterAxisAlignItems: "MIN",
          children: [
            {
              nodeId: "pass:section",
              name: "Login section",
              type: "FRAME",
              layoutRole: "section",
              layoutMode: "VERTICAL",
              primaryAxisAlignItems: "MIN",
              counterAxisAlignItems: "MIN",
              layoutSizingHorizontal: "FILL",
              children: [
                {
                  nodeId: "pass:form-card",
                  name: "Login card",
                  type: "INSTANCE",
                  componentKey: "card-key"
                }
              ]
            }
          ]
        }
      },
      spacing: {
        spacingGuidance: {
          variables: [spacingVariable]
        },
        nodes: [
          {
            nodeId: "pass:form-spacing",
            name: "Login form fields",
            role: "form_item",
            relationships: [
              {
                kind: "item_to_item",
                variableId: "VariableID:semantic-form-item-gap"
              },
              {
                kind: "label_to_control",
                variableId: "VariableID:semantic-form-item-gap"
              },
              {
                kind: "control_to_help",
                variableId: "VariableID:semantic-form-item-gap"
              }
            ]
          }
        ]
      },
      prototype: {
        nodes: [
          {
            nodeId: "pass:start",
            name: "Login screen",
            type: "FRAME",
            prototypeRole: "screen",
            children: [
              {
                nodeId: "pass:button",
                name: "Sign in",
                type: "INSTANCE",
                interactions: [
                  {
                    targetNodeId: "pass:done"
                  }
                ]
              }
            ]
          },
          {
            nodeId: "pass:done",
            name: "Dashboard screen",
            type: "FRAME",
            prototypeRole: "screen",
            terminalNode: true
          }
        ]
      }
    },
    { now: "2026-06-02T10:30:00.000Z" }
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, "passed");
  assert.equal(result.checkedAt, "2026-06-02T10:30:00.000Z");
  assert.equal(result.summary.issueCount, 0);
  assert.deepEqual(result.issues, []);
  assert.equal(result.checks.layout.ok, true);
  assert.equal(result.checks.spacing.ok, true);
  assert.equal(result.checks.prototype.ok, true);
});

test("prototype checker treats descendant navigation as a valid outbound path", () => {
  const result = checkPrototypeDeadEnds({
    nodes: [
      {
        nodeId: "proto:screen",
        name: "Screen",
        type: "FRAME",
        prototypeRole: "screen",
        children: [
          {
            nodeId: "proto:cta",
            name: "CTA",
            type: "INSTANCE",
            reactions: [
              {
                action: {
                  destinationId: "proto:next"
                }
              }
            ]
          }
        ]
      },
      {
        nodeId: "proto:next",
        name: "Next",
        type: "FRAME",
        prototypeRole: "screen",
        terminalNode: true
      }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.deadEndCount, 0);
});
