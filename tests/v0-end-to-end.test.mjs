import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildComponentNestingMap } from "../src/figma/component-nesting-map.mjs";
import { createFigmaAccess } from "../src/figma/figma-access.mjs";
import { discoverLibrary } from "../src/figma/library-discovery.mjs";
import { generateDesignPlan } from "../src/generation/design-generator.mjs";
import { createDesignIterationPlan } from "../src/iteration/design-iteration.mjs";
import { buildDesignRunReport } from "../src/reporting/design-run-report.mjs";
import {
  createDesignSystemGapLog,
  toReportDesignSystemGaps
} from "../src/reporting/gap-log.mjs";
import { createScreenshotReport } from "../src/reporting/screenshot-report.mjs";
import { validateDesign } from "../src/validation/index.mjs";

const discoveryFixturePath = path.resolve("fixtures/discovery/live-library.fixture.json");
const briefPath = path.resolve("fixtures/scenarios/generate/login-screen.brief.json");
const runId = "run-v0-end-to-end";
const now = "2026-06-02T14:00:00.000Z";
const screenshotAt = "2026-06-02T14:05:00.000Z";
const reportAt = "2026-06-02T14:10:00.000Z";
const iterationAt = "2026-06-02T14:15:00.000Z";

test("v0 fixture flow creates one customer screen, validates, screenshots, reports gaps, and proposes iteration", async () => {
  const generationWorkspace = {
    pageName: "Generation Workspace",
    initialChildren: []
  };
  const figmaAccess = createFigmaAccess({
    mode: "fixture",
    fixturePath: discoveryFixturePath,
    generationPage: generationWorkspace.pageName
  });
  const health = await figmaAccess.health();

  assert.equal(health.mode, "fixture");
  assert.equal(health.generationPage, "Generation Workspace");
  assert.equal(health.canWrite, true);
  assert.equal(health.canScreenshot, true);
  assert.equal(generationWorkspace.initialChildren.length, 0);

  const discovery = await discoverLibrary({ figmaAccess, runId, now });
  const nestingMap = buildComponentNestingMap(discovery, { runId, now });

  assert.equal(discovery.source, "fixture");
  assert.equal(discovery.library.name, "New Engine Figma UI Library");
  assert.equal(discovery.library.connectedAsAssets, true);
  assert.equal(discovery.library.status, "connected");

  const brief = readJson(briefPath);
  const plan = generateDesignPlan(
    { brief, discovery, nestingMap },
    { runId, now }
  );
  const screenRoot = plan.design.nodes[0];
  const submitButton = collectNodes(plan.design.nodes).find((node) => node.name === "Submit Button");

  assert.equal(plan.status, "passed");
  assert.equal(plan.planStatus, "ready");
  assert.equal(plan.strictComposition.liveWritePerformed, false);
  assert.equal(plan.strictComposition.provisionalExtensionsCreated, false);
  assert.equal(plan.design.nodes.length, 1);
  assert.equal(screenRoot.name, "Login Screen");
  assert.equal(screenRoot.width, 1440);
  assert.equal(screenRoot.height, 1024);
  assert.ok(submitButton);
  assert.equal(submitButton.detached, false);
  assert.deepEqual(
    plan.componentsUsed.map((component) => component.key).sort(),
    ["button-primary-medium-key", "icon-search-key", "text-field-default-key"]
  );
  assert.equal(plan.rawFinalValues.length, 0);

  const validationResult = await validateDesign(
    {
      runId,
      figmaFile: discovery.figmaFile,
      discovery,
      nestingMap,
      design: plan.design,
      layout: plan.layout,
      spacing: plan.spacing,
      variablePolicy: buildVariablePolicy(discovery, plan.finalBindings),
      designSystemGaps: plan.designSystemGaps,
      provisionalExtensions: plan.provisionalExtensions,
      ruleGroups: ["component", "layout", "spacing", "variable", "provisional"]
    },
    { runRuleLoader: true }
  );

  assert.equal(validationResult.validation.status, "passed");
  assert.deepEqual(validationResult.validation.summary, {
    critical: 0,
    error: 0,
    warning: 0,
    info: 0
  });
  assert.equal(validationResult.validation.issues.length, 0);

  const screenshotReport = await createScreenshotReport(
    {
      runId,
      figmaFile: discovery.figmaFile,
      screens: [
        {
          id: plan.target.targetId,
          node: screenRoot,
          briefReference: brief.description,
          dimensions: plan.target.dimensions,
          theme: "New Engine",
          mode: "Light",
          purpose: "validation"
        }
      ],
      validation: validationResult.validation,
      generated: plan
    },
    {
      now: screenshotAt,
      screenshotAdapter: async (screen) => ({
        screenId: screen.id,
        path: `reports/${runId}/screenshots/${screen.id}-light.png`,
        capturedAt: screenshotAt,
        purpose: "validation",
        theme: "New Engine",
        mode: "Light",
        dimensions: screen.dimensions
      })
    }
  );

  assert.equal(screenshotReport.kind, "figma-screenshot-report");
  assert.equal(screenshotReport.report.status, "passed");
  assert.equal(screenshotReport.report.summary.screenshotCount, 1);
  assert.equal(
    screenshotReport.report.screenshots[0].path,
    "reports/run-v0-end-to-end/screenshots/login-screen-light.png"
  );
  assert.equal(screenshotReport.report.screenshots[0].node.nodeId, screenRoot.nodeId);

  const gapLog = createDesignSystemGapLog(
    {
      runId,
      figmaFile: discovery.figmaFile,
      gaps: [
        {
          id: "gap-auth-card-pattern",
          category: "component",
          severity: "medium",
          status: "open",
          summary: "No approved authentication card component or pattern exists.",
          neededCapability:
            "Reusable authentication card container for login form composition.",
          searchedAlternatives: [
            {
              name: "Login Form Container",
              result:
                "Generated as a composed frame from approved fields and button, not a reusable live library component."
            },
            {
              name: "Button and Text Field",
              result:
                "Available live components satisfy controls but not the surrounding auth-card pattern."
            }
          ],
          impact:
            "Future authentication screens require repeated manual composition under Strict Composition Mode.",
          relatedNodes: [screenRoot],
          recommendedDesignSystemAction:
            "Review whether an approved Auth Card component or pattern should be added to the Figma UI Library."
        }
      ]
    },
    { now: reportAt }
  );
  const reportGaps = toReportDesignSystemGaps(gapLog.records);

  assert.equal(gapLog.kind, "design-system-gap-log");
  assert.equal(gapLog.summary.gapCount, 1);
  assert.equal(gapLog.records[0].promotion.promotedToDesignSystem, false);
  assert.equal(reportGaps[0].id, "gap-auth-card-pattern");

  const report = buildDesignRunReport(
    {
      generatedOutput: plan,
      figmaFile: discovery.figmaFile,
      validationResult: validationResult.validation,
      screenshots: screenshotReport.report.screenshots,
      reportPatch: {
        designSystemGaps: reportGaps
      },
      iterationNotes: [
        {
          id: "note-v0-review-gap",
          iteration: 0,
          createdAt: reportAt,
          authorRole: "codex",
          category: "gap",
          note:
            "The screen is valid with existing library controls; review the repeated auth-card composition as the next Design System improvement.",
          relatedGapIds: ["gap-auth-card-pattern"],
          nextAction:
            "Ask the operator whether to request an Auth Card component or keep composing this pattern from existing library assets."
        }
      ],
      runContextPath: `runs/${runId}/run-context.json`
    },
    { now: reportAt }
  );

  assert.equal(report.runId, runId);
  assert.equal(report.status, "needs_iteration");
  assert.deepEqual(report.summary, {
    screenCount: 1,
    componentUsageCount: 3,
    variableUsageCount: 1,
    validationIssueCount: 0,
    designSystemGapCount: 1,
    provisionalExtensionCount: 0,
    screenshotCount: 1
  });
  assert.equal(report.screens[0].id, "login-screen");
  assert.equal(report.screens[0].status, "passed");
  assert.deepEqual(report.screens[0].screenshotIds, ["shot-login-screen-light"]);
  assert.deepEqual(report.screens[0].validationIssueIds, []);
  assert.equal(report.designSystemGaps[0].status, "open");
  assert.equal(report.designSystemGaps[0].relatedNodes[0].nodeId, screenRoot.nodeId);
  assert.equal(report.iterationNotes[0].relatedGapIds[0], "gap-auth-card-pattern");
  assert.equal(report.componentsUsed.every((component) => component.source === "library"), true);
  assert.equal(report.variablesUsed[0].variableId, "VariableID:component-button-bg-primary");
  assert.equal(report.variablesUsed[0].boundNodes[0].nodeId, submitButton.nodeId);

  const iterationPlan = createDesignIterationPlan(
    { report },
    {
      runId: `${runId}-iteration-1`,
      now: iterationAt,
      iteration: 1
    }
  );

  assert.equal(iterationPlan.kind, "figma-design-iteration-plan");
  assert.equal(iterationPlan.mode, "plan_only");
  assert.equal(iterationPlan.status, "blocked");
  assert.equal(iterationPlan.strictComposition.liveWritePerformed, false);
  assert.equal(iterationPlan.summary.openValidationIssueCount, 0);
  assert.equal(iterationPlan.summary.gapReferenceCount, 1);
  assert.equal(iterationPlan.summary.screenshotReferenceCount, 1);

  const gapAction = iterationPlan.actions.find((action) =>
    action.evidence.gapIds.includes("gap-auth-card-pattern")
  );
  assert.ok(gapAction);
  assert.equal(gapAction.type, "request_provisional_extension_approval");
  assert.equal(gapAction.status, "blocked");
  assert.equal(gapAction.liveWrite, false);
  assert.match(gapAction.instruction, /Do not create or apply provisional output/);

  const screenshotAction = iterationPlan.actions.find((action) =>
    action.evidence.screenshotIds.includes("shot-login-screen-light")
  );
  assert.ok(screenshotAction);
  assert.equal(screenshotAction.type, "review_screenshot");
  assert.equal(screenshotAction.status, "approved");
});

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function buildVariablePolicy(discovery, finalBindings) {
  const references = discovery.variables?.references ?? [];
  const referencesById = new Map(references.map((variable) => [variable.variableId, variable]));
  const referencesByName = new Map(references.map((variable) => [variable.name, variable]));
  const used = [];
  const usedKeys = new Set();

  for (const binding of finalBindings) {
    const variable =
      referencesById.get(binding.variableId) ??
      referencesByName.get(binding.variableName);
    collectVariableChain(variable, { referencesById, referencesByName, used, usedKeys });
  }

  const collectionIds = new Set(used.map((variable) => variable.collectionId).filter(Boolean));
  const requiredModes = (discovery.variables?.collections ?? [])
    .filter((collection) => collectionIds.has(collection.collectionId))
    .flatMap((collection) => collection.modes ?? []);

  return {
    variables: used,
    requiredModes,
    rawFinalValues: [],
    proposedVariables: [],
    finalBindings
  };
}

function collectVariableChain(variable, context) {
  if (!variable || context.usedKeys.has(variable.variableId)) {
    return;
  }

  context.usedKeys.add(variable.variableId);
  context.used.push(variable);

  for (const link of variable.aliasChain ?? []) {
    const linked =
      context.referencesById.get(link.variableId) ??
      context.referencesByName.get(link.name);
    if (linked && !context.usedKeys.has(linked.variableId)) {
      collectVariableChain(linked, context);
    }
  }
}

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
