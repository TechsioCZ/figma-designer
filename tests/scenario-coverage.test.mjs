import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildComponentNestingMap } from "../src/figma/component-nesting-map.mjs";
import { createFigmaAccess } from "../src/figma/figma-access.mjs";
import { discoverLibrary } from "../src/figma/library-discovery.mjs";
import { generateDesignPlan } from "../src/generation/design-generator.mjs";
import { runRuleGroups } from "../src/rules/index.mjs";
import { validateComponentIntegrity } from "../src/validation/component-integrity-validator.mjs";
import { validateLayoutSpacingPrototype } from "../src/validation/layout-spacing-prototype-validator.mjs";
import { validateDesign } from "../src/validation/validator.mjs";
import { validateVariablesThemesContrast } from "../src/validation/variables-themes-contrast-validator.mjs";

const discoveryFixturePath = path.resolve("fixtures/discovery/live-library.fixture.json");
const coverageFixturePath = path.resolve("fixtures/scenarios/coverage/scenario-coverage.fixture.json");
const loginBriefPath = path.resolve("fixtures/scenarios/generate/login-screen.brief.json");
const missingComponentBriefPath = path.resolve("fixtures/scenarios/generate/missing-date-picker.brief.json");

const figmaFile = {
  fileKey: "ScenarioCoverageFileKey",
  name: "Scenario Coverage Fixture",
  url: "https://www.figma.com/file/ScenarioCoverageFileKey/Scenario-Coverage-Fixture"
};

const validationFamilies = {
  "component-integrity": {
    validate: validateComponentIntegrity
  },
  "variables-themes-contrast": {
    validate: validateVariablesThemesContrast
  },
  "layout-spacing-prototype": {
    validate: validateLayoutSpacingPrototype
  }
};

async function fixtureContext() {
  const figmaAccess = createFigmaAccess({ mode: "fixture", fixturePath: discoveryFixturePath });
  const discovery = await discoverLibrary({
    figmaAccess,
    runId: "run-scenario-coverage",
    now: "2026-06-02T12:00:00.000Z"
  });
  const nestingMap = buildComponentNestingMap(discovery, {
    runId: "run-scenario-coverage",
    now: "2026-06-02T12:05:00.000Z"
  });

  return { discovery, nestingMap };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function variablePolicyFor(discovery, finalBindings = []) {
  return {
    variables: discovery.variables.references,
    requiredModes: discovery.variables.collections.flatMap((collection) =>
      collection.modes.map((mode) => ({
        ...mode,
        collectionId: collection.collectionId,
        collectionName: collection.name
      }))
    ),
    rawFinalValues: [],
    proposedVariables: [],
    finalBindings
  };
}

function spacingContextFor(discovery, fixture) {
  if (!fixture.spacingContext) {
    return discovery;
  }

  return {
    ...discovery,
    spacingGuidance: fixture.spacingContext.spacingGuidance
  };
}

test("login scenario generates library-only output and passes validator families plus rule loader", async () => {
  const { discovery, nestingMap } = await fixtureContext();
  const brief = readJson(loginBriefPath);
  const plan = generateDesignPlan(
    { brief, discovery, nestingMap },
    {
      runId: "run-scenario-login",
      now: "2026-06-02T12:10:00.000Z"
    }
  );

  assert.equal(plan.status, "passed");
  assert.equal(plan.strictComposition.liveWritePerformed, false);
  assert.equal(plan.strictComposition.provisionalExtensionsCreated, false);
  assert.equal(plan.rawFinalValues.length, 0);
  assert.ok(plan.approvedPatternsUsed.some((pattern) => pattern.patternId === "login-form-pattern"));
  assert.ok(plan.slotsUsed.some((slot) => slot.slotPropertyName === "LeadingIcon#200:12"));
  assert.ok(plan.operations.some((operation) => operation.type === "create_prototype_connection"));

  const result = await validateDesign(
    {
      runId: "run-scenario-login",
      figmaFile,
      discovery,
      nestingMap,
      design: plan.design,
      layout: plan.layout,
      spacing: plan.spacing,
      variables: discovery.variables.references,
      variableCollections: discovery.variables.collections,
      variablePolicy: variablePolicyFor(discovery, plan.finalBindings),
      finalBindings: plan.finalBindings
    },
    {
      validationFamilies,
      runRuleLoader: true,
      ruleGroups: "all",
      now: "2026-06-02T12:15:00.000Z"
    }
  );

  assert.equal(result.validation.status, "passed");
  assert.deepEqual(result.validation.summary, {
    critical: 0,
    error: 0,
    warning: 0,
    info: 0
  });
  assert.deepEqual(
    result.familyResults.map((entry) => entry.familyId),
    [
      "component-integrity",
      "variables-themes-contrast",
      "layout-spacing-prototype",
      "rule-loader"
    ]
  );
});

test("checkout form spacing scenario accepts required form relationships", async () => {
  const { discovery } = await fixtureContext();
  const fixture = readJson(coverageFixturePath).spacingScenarios.checkoutFormSpacing;
  const spacingContext = spacingContextFor(discovery, fixture);

  const result = await validateDesign(
    {
      runId: "run-scenario-checkout-form-spacing",
      figmaFile,
      context: spacingContext,
      spacingContext,
      ...fixture
    },
    {
      validationFamilies: {
        "layout-spacing-prototype": validationFamilies["layout-spacing-prototype"]
      },
      runRuleLoader: true,
      ruleGroups: ["spacing"]
    }
  );

  assert.equal(result.validation.status, "passed");
  assert.equal(result.familyResults[0].result.summary.spacingChecked, true);
  assert.equal(result.familyResults[0].result.summary.spacingIssueCount, 0);
  assert.equal(result.familyResults[1].result.groups[0].status, "passed");
});

test("dashboard page spacing scenario accepts page section rhythm relationships", async () => {
  const { discovery } = await fixtureContext();
  const fixture = readJson(coverageFixturePath).spacingScenarios.dashboardPageSpacing;
  const spacingContext = spacingContextFor(discovery, fixture);

  const result = await validateDesign(
    {
      runId: "run-scenario-dashboard-page-spacing",
      figmaFile,
      context: spacingContext,
      spacingContext,
      ...fixture
    },
    {
      validationFamilies: {
        "layout-spacing-prototype": validationFamilies["layout-spacing-prototype"]
      },
      runRuleLoader: true,
      ruleGroups: ["spacing"]
    }
  );

  assert.equal(result.validation.status, "passed");
  assert.equal(result.familyResults[0].result.summary.spacingChecked, true);
  assert.equal(result.familyResults[0].result.summary.spacingIssueCount, 0);
  assert.equal(result.familyResults[1].result.groups[0].status, "passed");
});

test("missing component scenario blocks for approval before any provisional output is created", async () => {
  const { discovery, nestingMap } = await fixtureContext();
  const brief = readJson(missingComponentBriefPath);
  const plan = generateDesignPlan(
    { brief, discovery, nestingMap },
    {
      runId: "run-scenario-missing-component",
      now: "2026-06-02T12:20:00.000Z"
    }
  );

  assert.equal(plan.status, "blocked");
  assert.equal(plan.planStatus, "requires_provisional_extension_approval");
  assert.equal(plan.design.nodes.length, 0);
  assert.equal(plan.provisionalExtensions.length, 0);
  assert.equal(plan.designSystemGaps.length, 1);
  assert.equal(plan.designSystemGaps[0].approvalRequired, true);
  assert.deepEqual(
    plan.operations.map((operation) => operation.type),
    ["search_library_assets", "request_provisional_extension_approval"]
  );

  const ruleResult = runRuleGroups(
    {
      runId: "run-scenario-missing-component",
      discovery,
      nestingMap,
      design: plan.design,
      designSystemGaps: plan.designSystemGaps,
      provisionalExtensions: plan.provisionalExtensions,
      variablePolicy: {
        variables: [],
        requiredModes: [],
        rawFinalValues: [],
        proposedVariables: [],
        finalBindings: []
      }
    },
    {
      groups: ["component", "variable", "provisional"],
      runId: "run-scenario-missing-component"
    }
  );

  assert.equal(ruleResult.status, "passed");
});

test("slot misuse scenario rejects incompatible nested content in a discovered slot", async () => {
  const { discovery, nestingMap } = await fixtureContext();
  const fixture = readJson(coverageFixturePath).rejectionScenarios.slotMisuse;
  const result = await validateDesign(
    {
      runId: "run-scenario-slot-misuse",
      figmaFile,
      discovery,
      nestingMap,
      design: fixture.design
    },
    {
      validationFamilies: {
        "component-integrity": validationFamilies["component-integrity"]
      },
      runRuleLoader: true,
      ruleGroups: ["component"]
    }
  );

  assert.equal(result.validation.status, "failed");
  assertIssue(result, "incompatible_slot_content", "invalid_slot_usage");
});

test("raw hex scenario rejects final UI color values outside variables", async () => {
  const fixture = readJson(coverageFixturePath).rejectionScenarios.rawHex;
  const result = await validateDesign(
    {
      runId: "run-scenario-raw-hex",
      figmaFile,
      design: fixture.design,
      rawFinalValues: fixture.rawFinalValues
    },
    {
      validationFamilies: {
        "variables-themes-contrast": validationFamilies["variables-themes-contrast"]
      },
      runRuleLoader: true,
      ruleGroups: ["variable"]
    }
  );

  assert.equal(result.validation.status, "failed");
  assertIssue(result, "RAW_FINAL_VALUE", "raw_color");
});

test("detach scenario rejects detached library instances", async () => {
  const { discovery, nestingMap } = await fixtureContext();
  const fixture = readJson(coverageFixturePath).rejectionScenarios.detachedInstance;
  const result = await validateDesign(
    {
      runId: "run-scenario-detached-instance",
      figmaFile,
      discovery,
      nestingMap,
      design: fixture.design
    },
    {
      validationFamilies: {
        "component-integrity": validationFamilies["component-integrity"]
      },
      runRuleLoader: true,
      ruleGroups: ["component"]
    }
  );

  assert.equal(result.validation.status, "failed");
  assertIssue(result, "detached_component", "detached_component");
});

test("theme and mode switching scenario resolves both light and dark modes", async () => {
  const fixture = readJson(coverageFixturePath).themeModeSwitching;
  const result = await validateDesign(
    {
      runId: fixture.runId,
      figmaFile,
      variableCollections: fixture.variableCollections,
      variables: fixture.variables,
      finalBindings: fixture.finalBindings,
      contrastChecks: fixture.contrastChecks,
      variablePolicy: {
        variables: fixture.variables,
        requiredModes: fixture.variableCollections.flatMap((collection) =>
          collection.modes.map((mode) => ({
            ...mode,
            collectionId: collection.collectionId,
            collectionName: collection.name
          }))
        ),
        rawFinalValues: [],
        proposedVariables: [],
        finalBindings: fixture.finalBindings
      }
    },
    {
      validationFamilies: {
        "variables-themes-contrast": validationFamilies["variables-themes-contrast"]
      },
      runRuleLoader: true,
      ruleGroups: ["variable"]
    }
  );

  assert.equal(result.validation.status, "passed");
  assert.equal(result.familyResults[0].result.summary.contrastCheckCount, 2);
  assert.equal(result.familyResults[0].result.summary.finalBindingCount, 1);
  assert.equal(result.familyResults[1].result.groups[0].status, "passed");
});

function assertIssue(result, code, category) {
  const issue = result.validation.issues.find(
    (candidate) => candidate.code === code && candidate.category === category
  );
  assert.ok(issue, `Expected ${code} issue in ${category}`);
  assert.equal(issue.status, "open");
  assert.ok(issue.node?.url);
}
