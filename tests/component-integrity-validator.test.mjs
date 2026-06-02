import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { createFigmaAccess } from "../src/figma/figma-access.mjs";
import { buildComponentNestingMap } from "../src/figma/component-nesting-map.mjs";
import { discoverLibrary } from "../src/figma/library-discovery.mjs";
import { validateComponentIntegrity } from "../src/validation/component-integrity-validator.mjs";

const discoveryFixturePath = path.resolve("fixtures/discovery/live-library.fixture.json");

async function fixtureValidationContext() {
  const figmaAccess = createFigmaAccess({ mode: "fixture", fixturePath: discoveryFixturePath });
  const discovery = await discoverLibrary({
    figmaAccess,
    runId: "run-component-integrity-test",
    now: "2026-06-02T10:00:00.000Z"
  });
  const nestingMap = buildComponentNestingMap(discovery, {
    runId: "run-component-integrity-test",
    now: "2026-06-02T10:15:00.000Z"
  });

  return { discovery, nestingMap };
}

function validate(design, context, extraInput = {}) {
  return validateComponentIntegrity(
    {
      ...context,
      ...extraInput,
      design: {
        runId: "run-component-integrity-test",
        nodes: [design],
        ...(extraInput.designFields ?? {})
      }
    },
    { runId: "run-component-integrity-test" }
  );
}

test("passes valid library instances configured through component properties and slots", async () => {
  const context = await fixtureValidationContext();
  const result = validate(
    {
      nodeId: "1000:1",
      name: "Submit Button",
      type: "INSTANCE",
      componentKey: "button-primary-medium-key",
      componentProperties: {
        Variant: { type: "VARIANT", value: "Primary" },
        Size: { type: "VARIANT", value: "Medium" },
        State: { type: "VARIANT", value: "Default" },
        "Label#200:14": { type: "TEXT", value: "Continue" },
        "LeadingIcon#200:12": { type: "INSTANCE_SWAP", value: "icon-search-key" }
      },
      children: [
        {
          nodeId: "1000:2",
          name: "Search Icon",
          type: "INSTANCE",
          componentKey: "icon-search-key",
          slotName: "LeadingIcon",
          slotPropertyName: "LeadingIcon#200:12"
        }
      ]
    },
    context
  );

  assert.equal(result.kind, "figma-component-integrity-validation");
  assert.equal(result.family, "component-integrity");
  assert.equal(result.status, "passed");
  assert.equal(result.summary.issueCount, 0);
  assert.deepEqual(result.issues, []);
});

test("fails detached components with structured issue metadata", async () => {
  const context = await fixtureValidationContext();
  const result = validate(
    {
      nodeId: "1001:1",
      name: "Detached Submit Button",
      type: "INSTANCE",
      componentKey: "button-primary-medium-key",
      detached: true,
      detachReason: "Need a loading state that is not exposed as a property."
    },
    context
  );

  const issue = result.issues.find((candidate) => candidate.code === "detached_component");
  assert.equal(result.status, "failed");
  assert.ok(issue);
  assert.equal(issue.category, "detached_component");
  assert.equal(issue.severity, "critical");
  assert.match(issue.message, /detached/);
  assert.deepEqual(issue.node, {
    nodeId: "1001:1",
    name: "Detached Submit Button",
    type: "INSTANCE"
  });
});

test("fails instances that are not traceable to the discovered library", async () => {
  const context = await fixtureValidationContext();
  const result = validate(
    {
      nodeId: "1002:1",
      name: "Unknown Data Grid",
      type: "INSTANCE",
      componentKey: "data-grid-local-key"
    },
    context
  );

  const issue = result.issues.find(
    (candidate) => candidate.code === "component_not_in_discovered_library"
  );
  assert.ok(issue);
  assert.equal(issue.category, "component_property");
  assert.equal(issue.severity, "error");
  assert.match(issue.message, /not traceable/);
});

test("fails invalid component property values", async () => {
  const context = await fixtureValidationContext();
  const result = validate(
    {
      nodeId: "1003:1",
      name: "Loading Submit Button",
      type: "INSTANCE",
      componentKey: "button-primary-medium-key",
      componentProperties: {
        Variant: { type: "VARIANT", value: "Primary" },
        Size: { type: "VARIANT", value: "Medium" },
        State: { type: "VARIANT", value: "Loading" }
      }
    },
    context
  );

  const issue = result.issues.find(
    (candidate) => candidate.code === "unsupported_component_property_value"
  );
  assert.ok(issue);
  assert.equal(issue.category, "component_property");
  assert.equal(issue.severity, "error");
  assert.match(issue.message, /not allowed/);
  assert.equal(issue.node.nodeId, "1003:1");
});

test("fails nested content that bypasses slots", async () => {
  const context = await fixtureValidationContext();
  const result = validate(
    {
      nodeId: "1004:1",
      name: "Text Field With Inline Action",
      type: "INSTANCE",
      componentKey: "text-field-default-key",
      componentProperties: {
        "Value#210:11": { type: "TEXT", value: "satan@example.com" }
      },
      children: [
        {
          nodeId: "1004:2",
          name: "Hand Drawn Action",
          type: "FRAME",
          children: []
        }
      ]
    },
    context
  );

  const issue = result.issues.find((candidate) => candidate.code === "nested_content_without_slot");
  assert.ok(issue);
  assert.equal(issue.category, "invalid_slot_usage");
  assert.equal(issue.severity, "error");
  assert.match(issue.message, /not placed through a discovered slot/);
  assert.deepEqual(issue.node, {
    nodeId: "1004:2",
    name: "Hand Drawn Action",
    type: "FRAME"
  });
});

test("fails unapproved provisional output", async () => {
  const context = await fixtureValidationContext();
  const provisionalNode = {
    nodeId: "1005:1",
    name: "[Provisional] Usage Chart",
    type: "FRAME",
    source: "provisional"
  };
  const result = validate(provisionalNode, context, {
    designSystemGaps: [
      {
        id: "gap-usage-chart",
        category: "missing_component",
        status: "open"
      }
    ],
    provisionalExtensions: [
      {
        id: "provisional-usage-chart",
        gapId: "gap-usage-chart",
        status: "created",
        approval: { required: true, granted: false },
        proposal: "Create the smallest provisional usage chart component.",
        node: provisionalNode,
        provisionalMarking: "Provisional badge and node prefix",
        variableChain: [
          {
            level: "primitive",
            variableId: "VariableID:primitive-blue-600",
            variableName: "primitive/blue/600"
          },
          {
            level: "semantic",
            variableId: "VariableID:semantic-action-primary",
            variableName: "semantic/action/primary",
            aliasesTo: "VariableID:primitive-blue-600"
          },
          {
            level: "component",
            variableId: "VariableID:component-chart-line",
            variableName: "component/chart/line",
            aliasesTo: "VariableID:semantic-action-primary"
          }
        ],
        promotionRecommendation: "Review after the run and either promote or replace."
      }
    ]
  });

  const issue = result.issues.find(
    (candidate) => candidate.code === "PROVISIONAL_EXTENSION_UNAPPROVED"
  );
  assert.equal(result.status, "failed");
  assert.ok(issue);
  assert.equal(issue.category, "provisional_extension");
  assert.equal(issue.severity, "critical");
  assert.match(issue.message, /without approval/);
  assert.deepEqual(issue.node, {
    nodeId: "1005:1",
    name: "[Provisional] Usage Chart",
    type: "FRAME"
  });
});
