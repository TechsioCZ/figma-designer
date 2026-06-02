import assert from "node:assert/strict";
import test from "node:test";

import { buildComponentNestingMap } from "../src/figma/component-nesting-map.mjs";
import { createFigmaAccess } from "../src/figma/figma-access.mjs";
import { discoverLibrary } from "../src/figma/library-discovery.mjs";
import {
  allRuleGroupIds,
  listRuleGroups,
  loadRuleGroups,
  runRuleGroups,
  RuleLoaderError
} from "../src/rules/index.mjs";

async function fixtureDiscoveryContext() {
  const figmaAccess = createFigmaAccess({
    mode: "fixture",
    fixturePath: "fixtures/discovery/live-library.fixture.json"
  });
  const discovery = await discoverLibrary({
    figmaAccess,
    runId: "run-rule-loader-test",
    now: "2026-06-02T11:00:00.000Z"
  });
  const nestingMap = buildComponentNestingMap(discovery, {
    runId: "run-rule-loader-test",
    now: "2026-06-02T11:05:00.000Z"
  });

  return { discovery, nestingMap };
}

test("lists and loads all rule groups through one registry path", () => {
  const groups = listRuleGroups();
  assert.deepEqual(groups.map((group) => group.id), [
    "component",
    "layout",
    "spacing",
    "variable",
    "provisional"
  ]);
  assert.deepEqual(allRuleGroupIds, groups.map((group) => group.id));
  assert.ok(groups.every((group) => group.evaluatorName && group.ruleIds.length > 0));

  const registry = loadRuleGroups(["component", "spacing", "variable"]);
  assert.equal(registry.kind, "figma-rule-registry");
  assert.deepEqual(registry.groupIds, ["component", "spacing", "variable"]);
});

test("runs component, layout, spacing, variable, and provisional rules from shared context", async () => {
  const { discovery, nestingMap } = await fixtureDiscoveryContext();
  const context = failingSharedContext({ discovery, nestingMap });
  const registry = loadRuleGroups();
  const result = registry.run(context, {
    now: "2026-06-02T11:10:00.000Z"
  });

  assert.equal(result.kind, "figma-rule-loader-result");
  assert.equal(result.status, "failed");
  assert.deepEqual(result.groupIds, allRuleGroupIds);
  assert.equal(result.summary.groupCount, 5);
  assert.equal(result.summary.failedGroupCount, 5);

  const component = group(result, "component");
  assert.equal(component.status, "failed");
  assert.ok(component.issues.some((issue) => issue.code === "detached_component"));
  assert.ok(component.issues.some((issue) => issue.code === "nested_content_without_slot"));

  const layout = group(result, "layout");
  assert.equal(layout.status, "failed");
  assert.ok(
    layout.violations.some((violation) => violation.ruleId === "layout.auto-layout-required")
  );

  const spacing = group(result, "spacing");
  assert.equal(spacing.status, "failed");
  assert.ok(spacing.violations.some((violation) => violation.code === "raw_spacing_value"));

  const variable = group(result, "variable");
  assert.equal(variable.status, "failed");
  assert.ok(variable.issues.some((issue) => issue.code === "RAW_FINAL_VALUE"));
  assert.ok(variable.issues.some((issue) => issue.code === "BROKEN_VARIABLE_ALIAS_CHAIN"));

  const provisional = group(result, "provisional");
  assert.equal(provisional.status, "failed");
  assert.ok(
    provisional.issues.some((issue) => issue.code === "PROVISIONAL_EXTENSION_UNAPPROVED")
  );
});

test("loads selected groups and rejects unknown groups", async () => {
  const { discovery, nestingMap } = await fixtureDiscoveryContext();
  const context = failingSharedContext({ discovery, nestingMap });
  const result = runRuleGroups(context, {
    groups: ["spacing", "variable"]
  });

  assert.deepEqual(result.groupIds, ["spacing", "variable"]);
  assert.equal(result.summary.groupCount, 2);
  assert.equal(result.summary.failedGroupCount, 2);

  assert.throws(
    () => loadRuleGroups(["component", "missing"]),
    (error) => {
      assert.ok(error instanceof RuleLoaderError);
      assert.deepEqual(error.details.availableGroups, allRuleGroupIds);
      return true;
    }
  );
});

function group(result, groupId) {
  return result.groups.find((candidate) => candidate.groupId === groupId);
}

function failingSharedContext({ discovery, nestingMap }) {
  const designSystemGap = {
    id: "gap-auth-card",
    category: "component",
    status: "provisional_extension_requested",
    summary: "No approved authentication card component exists."
  };

  return {
    runId: "run-rule-loader-test",
    discovery,
    nestingMap,
    design: {
      runId: "run-rule-loader-test",
      nodes: [
        {
          nodeId: "loader:1",
          name: "Detached Submit Button",
          type: "INSTANCE",
          componentKey: "button-primary-medium-key",
          detached: true,
          detachReason: "Need a loading state that is not exposed as a property."
        },
        {
          nodeId: "loader:2",
          name: "Text Field With Freehand Action",
          type: "INSTANCE",
          componentKey: "text-field-default-key",
          componentProperties: {
            "Value#210:11": { type: "TEXT", value: "satan@example.com" }
          },
          children: [
            {
              nodeId: "loader:3",
              name: "Hand Drawn Action",
              type: "FRAME",
              children: []
            }
          ]
        }
      ]
    },
    layout: {
      source: "loader-fixture",
      root: {
        nodeId: "layout:1",
        name: "Generated Page",
        type: "FRAME",
        layoutRole: "page",
        generated: true,
        layoutMode: "NONE",
        children: [
          {
            nodeId: "layout:2",
            name: "Hero Section",
            type: "SECTION",
            layoutRole: "section",
            generated: true,
            layoutMode: "VERTICAL",
            primaryAxisAlignItems: "MIN",
            counterAxisAlignItems: "MIN",
            children: []
          }
        ]
      }
    },
    spacing: {
      spacingGuidance: {
        variables: [
          {
            variableId: "VariableID:semantic-action-gap",
            name: "semantic/spacing/action/gap",
            role: "semantic",
            type: "FLOAT",
            appliesTo: ["interactive_cluster"],
            aliasChain: [
              {
                variableId: "VariableID:semantic-action-gap",
                name: "semantic/spacing/action/gap",
                role: "semantic"
              },
              {
                variableId: "VariableID:primitive-spacing-300",
                name: "primitive/spacing/300",
                role: "primitive"
              }
            ]
          }
        ]
      },
      nodes: [
        {
          nodeId: "spacing:1",
          name: "Primary Action Cluster",
          role: "interactive_cluster",
          relationships: [
            {
              kind: "button_group_gap",
              rawValue: 18
            }
          ]
        }
      ]
    },
    variables: {
      references: [
        {
          variableId: "VariableID:primitive-blue-600",
          name: "primitive/color/blue/600",
          level: "primitive",
          resolvedType: "color"
        },
        {
          variableId: "VariableID:component-button-bg-primary",
          name: "component/button/background/primary",
          level: "component",
          resolvedType: "color",
          aliasChain: ["primitive/color/blue/600"]
        }
      ]
    },
    rawFinalValues: [
      {
        kind: "color",
        property: "fills",
        value: "#1A47CC",
        node: {
          nodeId: "color:1",
          name: "Raw Color Surface",
          type: "FRAME"
        }
      }
    ],
    designSystemGaps: [designSystemGap],
    provisionalExtensions: [
      {
        id: "ext-auth-card",
        gapId: designSystemGap.id,
        status: "created",
        approval: {
          required: true,
          granted: false
        },
        proposal: "Create the smallest provisional Auth Card component.",
        node: {
          nodeId: "prov:1",
          name: "Provisional Auth Card",
          type: "COMPONENT"
        },
        provisionalMarking: "Component name is prefixed with Provisional.",
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
        promotionRecommendation:
          "Promote only if authentication cards become an approved reusable pattern."
      }
    ]
  };
}
