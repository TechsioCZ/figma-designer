import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildComponentNestingMap } from "../src/figma/component-nesting-map.mjs";
import { createFigmaAccess } from "../src/figma/figma-access.mjs";
import { discoverLibrary } from "../src/figma/library-discovery.mjs";
import { generateDesignPlan } from "../src/generation/design-generator.mjs";

const discoveryFixturePath = path.resolve("fixtures/discovery/live-library.fixture.json");

async function fixtureGenerationContext() {
  const figmaAccess = createFigmaAccess({ mode: "fixture", fixturePath: discoveryFixturePath });
  const discovery = await discoverLibrary({
    figmaAccess,
    runId: "run-design-generator-test",
    now: "2026-06-02T12:00:00.000Z"
  });
  const nestingMap = buildComponentNestingMap(discovery, {
    runId: "run-design-generator-test",
    now: "2026-06-02T12:05:00.000Z"
  });

  return { discovery, nestingMap };
}

function readScenario(name) {
  return JSON.parse(
    readFileSync(path.resolve("fixtures/scenarios/generate", name), "utf8")
  );
}

test("plans a login screen with library-only composition and passing rule checks", async () => {
  const { discovery, nestingMap } = await fixtureGenerationContext();
  const brief = readScenario("login-screen.brief.json");
  const plan = generateDesignPlan(
    { brief, discovery, nestingMap },
    {
      runId: "run-design-generator-login-test",
      now: "2026-06-02T12:10:00.000Z"
    }
  );

  assert.equal(plan.kind, "figma-design-operation-plan");
  assert.equal(plan.mode, "plan_only");
  assert.equal(plan.status, "passed");
  assert.equal(plan.strictComposition.liveWritePerformed, false);
  assert.equal(plan.strictComposition.provisionalExtensionsCreated, false);
  assert.equal(plan.ruleChecks.status, "passed");
  assert.deepEqual(plan.ruleChecks.groupIds, [
    "component",
    "layout",
    "spacing",
    "variable",
    "provisional"
  ]);

  assert.deepEqual(
    plan.componentsUsed.map((component) => component.key).sort(),
    ["button-primary-medium-key", "icon-search-key", "text-field-default-key"]
  );
  assert.ok(plan.componentSetsUsed.some((componentSet) => componentSet.key === "button-set-key"));
  assert.ok(plan.componentSetsUsed.some((componentSet) => componentSet.key === "text-field-set-key"));
  assert.ok(plan.stylesUsed.some((style) => style.key === "style-text-body-key"));
  assert.ok(
    plan.variables.references.some(
      (variable) => variable.variableId === "VariableID:component-button-bg-primary"
    )
  );
  assert.ok(
    plan.approvedPatternsUsed.some((pattern) => pattern.patternId === "login-form-pattern")
  );
  assert.ok(
    plan.slotsUsed.some(
      (slot) =>
        slot.slotPropertyName === "LeadingIcon#200:12" &&
        slot.childComponentKey === "icon-search-key"
    )
  );

  const operationTypes = plan.operations.map((operation) => operation.type);
  assert.ok(operationTypes.includes("create_frame"));
  assert.ok(operationTypes.includes("place_instance"));
  assert.ok(operationTypes.includes("set_instance_component_property"));
  assert.ok(operationTypes.includes("fill_slot"));
  assert.ok(operationTypes.includes("bind_variable"));
  assert.ok(operationTypes.includes("apply_style"));
  assert.ok(operationTypes.includes("use_approved_pattern"));
  assert.ok(operationTypes.includes("create_prototype_connection"));
  assert.ok(plan.operations.every((operation) => operation.liveWrite === false));

  const generatedInstances = collectNodes(plan.design.nodes).filter((node) => node.type === "INSTANCE");
  assert.ok(generatedInstances.length >= 4);
  assert.ok(generatedInstances.every((node) => node.detached === false));
  assert.equal(plan.rawFinalValues.length, 0);
  assert.equal(plan.designSystemGaps.length, 0);
});

test("routes unsatisfied capabilities to a Design System Gap without planning Figma writes", async () => {
  const { discovery, nestingMap } = await fixtureGenerationContext();
  const brief = readScenario("missing-date-picker.brief.json");
  const plan = generateDesignPlan(
    { brief, discovery, nestingMap },
    {
      runId: "run-design-generator-missing-test",
      now: "2026-06-02T12:20:00.000Z"
    }
  );

  assert.equal(plan.status, "blocked");
  assert.equal(plan.planStatus, "requires_provisional_extension_approval");
  assert.equal(plan.strictComposition.liveWritePerformed, false);
  assert.equal(plan.strictComposition.provisionalExtensionsCreated, false);
  assert.equal(plan.design.nodes.length, 0);
  assert.equal(plan.provisionalExtensions.length, 0);

  assert.equal(plan.designSystemGaps.length, 1);
  assert.equal(plan.designSystemGaps[0].category, "missing_library_asset");
  assert.equal(plan.designSystemGaps[0].requirement, "Date Picker");
  assert.equal(plan.designSystemGaps[0].approvalRequired, true);
  assert.match(plan.designSystemGaps[0].proposedSmallestExtension, /Date Picker/);

  assert.deepEqual(
    plan.operations.map((operation) => operation.type),
    ["search_library_assets", "request_provisional_extension_approval"]
  );
  assert.equal(plan.operations[1].status, "blocked");
  assert.equal(plan.ruleChecks.status, "passed");
});

function collectNodes(nodes) {
  const collected = [];
  for (const node of nodes) {
    walk(node, collected);
  }
  return collected;
}

function walk(node, collected) {
  collected.push(node);
  for (const child of node.children ?? []) {
    walk(child, collected);
  }
}
