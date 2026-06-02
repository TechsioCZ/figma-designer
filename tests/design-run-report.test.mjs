import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildComponentNestingMap } from "../src/figma/component-nesting-map.mjs";
import { createFigmaAccess } from "../src/figma/figma-access.mjs";
import { discoverLibrary } from "../src/figma/library-discovery.mjs";
import { generateDesignPlan } from "../src/generation/design-generator.mjs";
import {
  buildDesignRunReport,
  createDesignRunReport
} from "../src/reporting/design-run-report.mjs";

const discoveryFixturePath = path.resolve("fixtures/discovery/live-library.fixture.json");
const now = "2026-06-02T13:00:00.000Z";

test("builds a deterministic report from generated output, validation, screenshots, and report patches", async () => {
  const { discovery, nestingMap } = await fixtureGenerationContext();
  const plan = generateDesignPlan(
    {
      brief: readScenario("login-screen.brief.json"),
      discovery,
      nestingMap
    },
    {
      runId: "run-report-login",
      now
    }
  );
  const root = plan.design.nodes[0];
  const title = root.children[0].children[0];
  const submitButton = collectNodes(plan.design.nodes).find((node) => node.name === "Submit Button");
  const validationResult = {
    status: "failed",
    issues: [
      {
        id: "val-title-contrast",
        code: "CONTRAST_TITLE",
        category: "contrast",
        severity: "error",
        message: "Title contrast is below the target threshold.",
        node: title,
        expected: "WCAG 2.2 SC 1.4.6 Contrast (Enhanced) AAA ratio >= 7.00.",
        actual: "WCAG ratio 3.20.",
        recommendation: "Use an approved stronger semantic text variable."
      }
    ]
  };
  const reportPatch = authCardReportPatch(root, discovery.figmaFile.fileKey);

  const report = buildDesignRunReport(
    {
      generatedOutput: plan,
      figmaFile: discovery.figmaFile,
      validationResult,
      screenshots: [
        {
          id: "shot-login-light",
          node: root,
          path: "reports/run-report-login/screenshots/login-light.png",
          capturedAt: "2026-06-02T13:05:00.000Z",
          purpose: "review",
          theme: "Default",
          mode: "Light",
          dimensions: {
            width: 1440,
            height: 1024
          }
        }
      ],
      reportPatch,
      iterationNotes: [
        {
          id: "note-validation",
          iteration: 1,
          createdAt: "2026-06-02T13:06:00.000Z",
          authorRole: "codex",
          category: "validation",
          note: "Resolve title contrast before considering the run complete.",
          relatedValidationIssueIds: ["val-title-contrast"],
          nextAction: "Rebind the title to an approved semantic text variable."
        }
      ],
      runContextPath: "runs/run-report-login/run-context.json"
    },
    {
      now
    }
  );

  assert.equal(createDesignRunReport, buildDesignRunReport);
  assert.equal(report.schemaVersion, "1.0.0");
  assert.equal(report.runId, "run-report-login");
  assert.equal(report.generatedAt, now);
  assert.equal(report.status, "needs_iteration");
  assert.equal(report.figmaFile.fileKey, "CustomerFileFixture");
  assert.equal(report.figmaFile.name, "Customer Design Fixture");
  assert.equal(report.runContextPath, "runs/run-report-login/run-context.json");
  assert.deepEqual(report.summary, {
    screenCount: 1,
    componentUsageCount: 3,
    variableUsageCount: 1,
    validationIssueCount: 1,
    designSystemGapCount: 1,
    provisionalExtensionCount: 1,
    screenshotCount: 1
  });

  assert.equal(report.screens[0].id, "login-screen");
  assert.equal(report.screens[0].node.nodeId, root.nodeId);
  assert.equal(report.screens[0].status, "needs_iteration");
  assert.deepEqual(report.screens[0].screenshotIds, ["shot-login-light"]);
  assert.deepEqual(report.screens[0].validationIssueIds, ["val-title-contrast"]);

  assert.deepEqual(report.validation.summary, {
    critical: 0,
    error: 1,
    warning: 0,
    info: 0
  });
  assert.equal(report.validation.issues[0].node.url, `${discovery.figmaFile.url}?node-id=generated-3`);

  const buttonUsage = report.componentsUsed.find(
    (component) => component.componentKey === "button-primary-medium-key"
  );
  assert.equal(buttonUsage.source, "library");
  assert.equal(buttonUsage.usageCount, 1);
  assert.deepEqual(buttonUsage.propertiesConfigured, {
    "Label#200:14": "Sign in",
    "LeadingIcon#200:12": "icon-search-key",
    Size: "Medium",
    State: "Default",
    Variant: "Primary"
  });
  assert.deepEqual(buttonUsage.instanceNodes.map((node) => node.nodeId), [submitButton.nodeId]);

  const variableUsage = report.variablesUsed[0];
  assert.equal(variableUsage.variableId, "VariableID:component-button-bg-primary");
  assert.equal(variableUsage.level, "component");
  assert.equal(variableUsage.resolvedType, "color");
  assert.deepEqual(variableUsage.boundNodes.map((node) => node.nodeId), [submitButton.nodeId]);

  assert.equal(report.designSystemGaps[0].id, "gap-auth-card");
  assert.equal(report.provisionalExtensions[0].id, "ext-auth-card");
  assert.equal(report.provisionalExtensions[0].approval.granted, true);
  assert.equal(report.screenshots[0].dimensions.width, 1440);
  assert.deepEqual(report.iterationNotes[0].relatedValidationIssueIds, ["val-title-contrast"]);
});

test("normalizes blocked generator output into top-level blocked status and report-shaped gaps", async () => {
  const { discovery, nestingMap } = await fixtureGenerationContext();
  const plan = generateDesignPlan(
    {
      brief: readScenario("missing-date-picker.brief.json"),
      discovery,
      nestingMap
    },
    {
      runId: "run-report-blocked",
      now
    }
  );

  const report = buildDesignRunReport(
    {
      generatedOutput: plan,
      figmaFile: discovery.figmaFile
    },
    {
      now
    }
  );

  assert.equal(report.status, "blocked");
  assert.deepEqual(report.summary, {
    screenCount: 0,
    componentUsageCount: 0,
    variableUsageCount: 0,
    validationIssueCount: 0,
    designSystemGapCount: 1,
    provisionalExtensionCount: 0,
    screenshotCount: 0
  });
  assert.equal(report.validation.status, "passed");
  assert.equal(report.designSystemGaps[0].category, "component");
  assert.equal(report.designSystemGaps[0].status, "provisional_extension_proposed");
  assert.equal(report.designSystemGaps[0].neededCapability, "Date Picker");
  assert.ok(report.designSystemGaps[0].searchedAlternatives.length > 0);
  assert.match(
    report.designSystemGaps[0].recommendedDesignSystemAction,
    /Provisional Extension/i
  );
});

async function fixtureGenerationContext() {
  const figmaAccess = createFigmaAccess({ mode: "fixture", fixturePath: discoveryFixturePath });
  const discovery = await discoverLibrary({
    figmaAccess,
    runId: "run-design-report-test",
    now
  });
  const nestingMap = buildComponentNestingMap(discovery, {
    runId: "run-design-report-test",
    now
  });

  return { discovery, nestingMap };
}

function readScenario(name) {
  return JSON.parse(
    readFileSync(path.resolve("fixtures/scenarios/generate", name), "utf8")
  );
}

function authCardReportPatch(root, fileKey) {
  const extensionNode = {
    nodeId: "900:10",
    name: "Provisional Auth Card",
    type: "COMPONENT",
    url: `https://www.figma.com/file/${fileKey}/Customer-Design-Fixture?node-id=900-10`
  };

  return {
    designSystemGaps: [
      {
        id: "gap-auth-card",
        category: "component",
        severity: "medium",
        status: "provisional_extension_approved",
        summary: "No approved authentication card component exists.",
        neededCapability: "Authentication card with semantic surface and action area.",
        searchedAlternatives: [
          {
            name: "Card",
            result: "Available card does not expose authentication form slots."
          }
        ],
        impact: "Login screens require repeated manual composition.",
        relatedNodes: [extensionNode],
        provisionalExtensionId: "ext-auth-card",
        recommendedDesignSystemAction: "Review the provisional component for promotion."
      }
    ],
    provisionalExtensions: [
      {
        id: "ext-auth-card",
        gapId: "gap-auth-card",
        status: "created",
        approval: {
          required: true,
          granted: true,
          approvedBy: "operator",
          approvedAt: "2026-06-02T13:04:00.000Z"
        },
        proposal: "Create the smallest provisional Auth Card.",
        node: extensionNode,
        provisionalMarking: "Component name is prefixed with Provisional.",
        variableChain: [
          {
            level: "primitive",
            variableName: "primitive/color/neutral/0"
          },
          {
            level: "semantic",
            variableName: "semantic/surface/panel",
            aliasesTo: "primitive/color/neutral/0"
          },
          {
            level: "component",
            variableName: "component/auth-card/background",
            aliasesTo: "semantic/surface/panel"
          }
        ],
        usedByNodes: [root],
        promotionRecommendation: "Promote only if auth cards become an approved reusable pattern."
      }
    ]
  };
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
