import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { createFigmaAccess } from "../src/figma/figma-access.mjs";
import { buildComponentNestingMap } from "../src/figma/component-nesting-map.mjs";
import { discoverLibrary } from "../src/figma/library-discovery.mjs";
import { evaluateComponentRules } from "../src/rules/component-rules.mjs";

const discoveryFixturePath = path.resolve("fixtures/discovery/live-library.fixture.json");

async function fixtureRuleContext() {
  const figmaAccess = createFigmaAccess({ mode: "fixture", fixturePath: discoveryFixturePath });
  const discovery = await discoverLibrary({
    figmaAccess,
    runId: "run-component-rules-test",
    now: "2026-06-02T10:00:00.000Z"
  });
  const nestingMap = buildComponentNestingMap(discovery, {
    runId: "run-component-rules-test",
    now: "2026-06-02T10:15:00.000Z"
  });

  return { discovery, nestingMap };
}

function evaluate(design, context) {
  return evaluateComponentRules({
    ...context,
    design: {
      runId: "run-component-rules-test",
      nodes: [design]
    }
  });
}

test("passes library instances configured through component properties and slots", async () => {
  const context = await fixtureRuleContext();
  const result = evaluate(
    {
      nodeId: "900:1",
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
          nodeId: "900:2",
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

  assert.equal(result.kind, "figma-component-rule-check");
  assert.equal(result.status, "passed");
  assert.equal(result.summary.issueCount, 0);
  assert.equal(result.summary.gapCount, 0);
});

test("fails detached library instances and routes the change as a Design System Gap", async () => {
  const context = await fixtureRuleContext();
  const result = evaluate(
    {
      nodeId: "901:1",
      name: "Detached Submit Button",
      type: "INSTANCE",
      componentKey: "button-primary-medium-key",
      detached: true,
      detachReason: "Need a loading state that is not exposed as a property."
    },
    context
  );

  assert.equal(result.status, "failed");
  const detachIssue = result.issues.find((issue) => issue.code === "detached_component");
  assert.ok(detachIssue);
  assert.equal(detachIssue.category, "detached_component");
  assert.equal(detachIssue.severity, "critical");
  assert.ok(detachIssue.gapId);

  const gap = result.designSystemGaps.find((candidate) => candidate.id === detachIssue.gapId);
  assert.ok(gap);
  assert.equal(gap.category, "detach_required");
  assert.match(gap.proposedSmallestExtension, /property|variant|slot|component extension/);
});

test("requires variants to be configured through component properties", async () => {
  const context = await fixtureRuleContext();
  const result = evaluate(
    {
      nodeId: "902:1",
      name: "Secondary Submit Button",
      type: "INSTANCE",
      componentKey: "button-primary-medium-key",
      variantProperties: {
        Variant: "Secondary"
      },
      componentProperties: {
        Size: { type: "VARIANT", value: "Medium" },
        State: { type: "VARIANT", value: "Default" }
      }
    },
    context
  );

  const variantIssue = result.issues.find(
    (issue) => issue.code === "variant_not_configured_through_property"
  );
  assert.ok(variantIssue);
  assert.equal(variantIssue.category, "component_property");
  assert.match(variantIssue.message, /componentProperties/);
  assert.ok(result.designSystemGaps.some((gap) => gap.id === variantIssue.gapId));
});

test("fails nested content that bypasses discovered slot contracts", async () => {
  const context = await fixtureRuleContext();
  const result = evaluate(
    {
      nodeId: "903:1",
      name: "Text Field With Freehand Action",
      type: "INSTANCE",
      componentKey: "text-field-default-key",
      componentProperties: {
        "Value#210:11": { type: "TEXT", value: "satan@example.com" }
      },
      children: [
        {
          nodeId: "903:2",
          name: "Hand Drawn Action",
          type: "FRAME",
          children: []
        }
      ]
    },
    context
  );

  const slotIssue = result.issues.find((issue) => issue.code === "nested_content_without_slot");
  assert.ok(slotIssue);
  assert.equal(slotIssue.category, "invalid_slot_usage");
  assert.ok(slotIssue.gapId);

  const gap = result.designSystemGaps.find((candidate) => candidate.id === slotIssue.gapId);
  assert.equal(gap.category, "missing_slot");
  assert.match(gap.neededCapability, /Place nested content/);
});

test("fails incompatible slot content", async () => {
  const context = await fixtureRuleContext();
  const result = evaluate(
    {
      nodeId: "904:1",
      name: "Button With Wrong Leading Slot",
      type: "INSTANCE",
      componentKey: "button-primary-medium-key",
      componentProperties: {
        Variant: { type: "VARIANT", value: "Primary" },
        Size: { type: "VARIANT", value: "Medium" },
        State: { type: "VARIANT", value: "Default" },
        "LeadingIcon#200:12": { type: "INSTANCE_SWAP", value: "button-primary-medium-key" }
      },
      children: [
        {
          nodeId: "904:2",
          name: "Nested Button",
          type: "INSTANCE",
          componentKey: "button-primary-medium-key",
          slotName: "LeadingIcon",
          slotPropertyName: "LeadingIcon#200:12"
        }
      ]
    },
    context
  );

  assert.ok(result.issues.some((issue) => issue.code === "unsupported_component_property_value"));
  const slotIssue = result.issues.find((issue) => issue.code === "incompatible_slot_content");
  assert.ok(slotIssue);
  assert.equal(slotIssue.category, "invalid_slot_usage");
  assert.ok(
    result.designSystemGaps.some(
      (gap) => gap.id === slotIssue.gapId && gap.category === "incompatible_slot_content"
    )
  );
});

test("fails unsafe freehand composition and routes it to a Design System Gap", async () => {
  const context = await fixtureRuleContext();
  const result = evaluate(
    {
      nodeId: "905:1",
      name: "Hand Drawn Button",
      type: "FRAME",
      rawConstructed: true,
      intendedComponentName: "Button",
      children: [
        {
          nodeId: "905:2",
          name: "Label",
          type: "TEXT"
        }
      ]
    },
    context
  );

  const freehandIssue = result.issues.find(
    (issue) => issue.code === "freehand_recreates_library_component"
  );
  assert.ok(freehandIssue);
  assert.equal(freehandIssue.category, "component_property");
  assert.ok(freehandIssue.gapId);

  const gap = result.designSystemGaps.find((candidate) => candidate.id === freehandIssue.gapId);
  assert.equal(gap.category, "library_asset_bypassed");
  assert.equal(gap.affectedComponent.name, "Button");
});
