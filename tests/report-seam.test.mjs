import assert from "node:assert/strict";
import { test } from "node:test";

import { planDesignIteration } from "../src/iteration/design-iteration.mjs";
import {
  createDesignSystemGapLog,
  toReportDesignSystemGaps
} from "../src/reporting/gap-log.mjs";
import { buildDesignRunReport } from "../src/reporting/design-run-report.mjs";
import { createScreenshotReport } from "../src/reporting/screenshot-report.mjs";

const figmaFile = {
  fileKey: "ReportSeamFile",
  name: "Report Seam Fixture",
  url: "https://www.figma.com/file/ReportSeamFile/Report-Seam"
};
const runId = "run-report-seam";
const now = "2026-06-02T14:00:00.000Z";

test("report modules preserve screenshot, usage, validation, gap, improvement, and iteration evidence across composition", async () => {
  const nodes = reportNodes();
  const screenshotResult = await createScreenshotReport(
    {
      runId,
      generatedAt: now,
      figmaFile,
      screens: [
        {
          id: "screen-checkout-review",
          node: nodes.root,
          briefReference: "Review checkout before submitting the order.",
          validationIssueIds: ["val-primary-action-contrast"],
          dimensions: {
            width: 1440,
            height: 1024
          },
          theme: "Default",
          mode: "Light"
        }
      ],
      screenshotResults: [
        {
          screenId: "screen-checkout-review",
          id: "shot-checkout-review-light",
          path: "reports/run-report-seam/screenshots/checkout-review-light.png",
          capturedAt: "2026-06-02T14:01:00.000Z",
          purpose: "validation",
          theme: "Default",
          mode: "Light",
          dimensions: {
            width: 1440,
            height: 1024
          }
        }
      ],
      componentsUsed: [primaryButtonUsage(nodes.button)],
      variablesUsed: [primaryActionVariableUsage(nodes.button)],
      validation: {
        status: "failed",
        issues: [
          {
            id: "val-primary-action-contrast",
            code: "CONTRAST_PRIMARY_ACTION_LABEL",
            category: "contrast",
            severity: "error",
            status: "open",
            message: "Primary checkout action label contrast is below the target threshold.",
            node: nodes.button,
            expected: "WCAG AA contrast for action labels.",
            actual: "3.1:1",
            recommendation: "Rebind the action label to the approved strong text variable."
          }
        ]
      },
      designSystemGaps: [buttonLoadingGap(nodes.button)],
      provisionalExtensions: [buttonLoadingExtension(nodes.button)],
      iterationNotes: [
        {
          id: "note-seed-review",
          iteration: 1,
          createdAt: "2026-06-02T14:02:00.000Z",
          authorRole: "operator",
          category: "validation",
          note: "Review primary action contrast and loading-state coverage together.",
          relatedValidationIssueIds: ["val-primary-action-contrast"],
          relatedGapIds: ["gap-primary-button-loading"]
        }
      ]
    },
    { now: "2026-06-02T14:03:00.000Z" }
  );
  const screenshotReport = screenshotResult.report;
  const gapLog = createDesignSystemGapLog(
    {
      runId,
      report: screenshotReport
    },
    { now: "2026-06-02T14:04:00.000Z" }
  );
  const reportGaps = toReportDesignSystemGaps(gapLog.records);
  const designReport = buildDesignRunReport(
    {
      generatedOutput: {
        runId,
        figmaFile,
        planStatus: "needs_iteration",
        design: {
          nodes: [nodes.root]
        }
      },
      figmaFile,
      screens: screenshotReport.screens,
      screenshots: screenshotReport.screenshots,
      componentsUsed: screenshotReport.componentsUsed,
      variablesUsed: screenshotReport.variablesUsed,
      validationResult: screenshotReport.validation,
      designSystemGaps: reportGaps,
      provisionalExtensions: screenshotReport.provisionalExtensions,
      iterationNotes: screenshotReport.iterationNotes,
      runContextPath: "runs/run-report-seam/run-context.json"
    },
    { now: "2026-06-02T14:05:00.000Z" }
  );
  const iterationPlan = planDesignIteration(
    { report: designReport },
    {
      runId: "run-report-seam-iteration",
      now: "2026-06-02T14:06:00.000Z"
    }
  );
  const iteratedReport = buildDesignRunReport(
    {
      generatedOutput: {
        runId,
        figmaFile,
        planStatus: "needs_iteration",
        design: {
          nodes: [nodes.root]
        }
      },
      figmaFile,
      screens: designReport.screens,
      screenshots: designReport.screenshots,
      componentsUsed: designReport.componentsUsed,
      variablesUsed: designReport.variablesUsed,
      validationResult: designReport.validation,
      designSystemGaps: designReport.designSystemGaps,
      provisionalExtensions: designReport.provisionalExtensions,
      iterationNotes: [
        ...designReport.iterationNotes,
        ...iterationPlan.reportPatch.iterationNotes
      ],
      runContextPath: designReport.runContextPath
    },
    { now: "2026-06-02T14:07:00.000Z" }
  );

  assert.equal(screenshotResult.kind, "figma-screenshot-report");
  assert.equal(screenshotReport.summary.screenshotCount, 1);
  assert.equal(screenshotReport.screenshots[0].id, "shot-checkout-review-light");
  assert.equal(screenshotReport.screenshots[0].node.nodeId, "100:1");
  assert.equal(
    screenshotReport.screenshots[0].node.url,
    "https://www.figma.com/file/ReportSeamFile/Report-Seam?node-id=100-1"
  );
  assert.deepEqual(screenshotReport.screens[0].screenshotIds, ["shot-checkout-review-light"]);
  assert.deepEqual(screenshotReport.screens[0].validationIssueIds, ["val-primary-action-contrast"]);
  assert.equal(screenshotReport.componentsUsed[0].componentKey, "button-primary-key");
  assert.equal(screenshotReport.variablesUsed[0].variableId, "VariableID:component-action-primary-label");
  assert.equal(screenshotReport.validation.status, "failed");
  assert.equal(screenshotReport.validation.issues[0].recommendation, "Rebind the action label to the approved strong text variable.");

  assert.equal(gapLog.kind, "design-system-gap-log");
  assert.equal(gapLog.summary.gapCount, 1);
  assert.equal(gapLog.records[0].relatedNodes[0].nodeId, "100:30");
  assert.equal(
    gapLog.records[0].recommendedDesignSystemAction,
    "Add a supported loading property to Button / Primary after Design System review."
  );

  assert.equal(designReport.status, "needs_iteration");
  assert.deepEqual(designReport.summary, {
    screenCount: 1,
    componentUsageCount: 1,
    variableUsageCount: 1,
    validationIssueCount: 1,
    designSystemGapCount: 1,
    provisionalExtensionCount: 1,
    screenshotCount: 1
  });
  assert.equal(designReport.screens[0].node.nodeId, "100:1");
  assert.equal(designReport.screens[0].node.url, "https://www.figma.com/file/ReportSeamFile/Report-Seam?node-id=100-1");
  assert.deepEqual(designReport.screens[0].screenshotIds, ["shot-checkout-review-light"]);
  assert.deepEqual(designReport.screens[0].validationIssueIds, ["val-primary-action-contrast"]);
  assert.equal(designReport.validation.summary.error, 1);
  assert.equal(designReport.validation.issues[0].id, "val-primary-action-contrast");
  assert.equal(designReport.validation.issues[0].node.nodeId, "100:30");
  assert.equal(designReport.validation.issues[0].node.url, "https://www.figma.com/file/ReportSeamFile/Report-Seam?node-id=100-30");
  assert.equal(designReport.componentsUsed[0].name, "Button / Primary");
  assert.equal(designReport.componentsUsed[0].instanceNodes[0].nodeId, "100:30");
  assert.equal(designReport.variablesUsed[0].name, "component/action/primary/label");
  assert.deepEqual(designReport.variablesUsed[0].aliasChain, [
    "component/action/primary/label",
    "semantic/text/on-action",
    "primitive/color/neutral/0"
  ]);
  assert.equal(designReport.designSystemGaps[0].id, "gap-primary-button-loading");
  assert.equal(designReport.designSystemGaps[0].recommendedDesignSystemAction, "Add a supported loading property to Button / Primary after Design System review.");
  assert.equal(designReport.provisionalExtensions[0].id, "ext-primary-button-loading");
  assert.equal(designReport.iterationNotes[0].id, "note-seed-review");

  assert.equal(iterationPlan.kind, "figma-design-iteration-plan");
  assert.equal(iterationPlan.status, "ready");
  assert.equal(iterationPlan.summary.approvedActionCount, 1);
  assert.deepEqual(iterationPlan.actions[0].evidence.validationIssueIds, ["val-primary-action-contrast"]);
  assert.deepEqual(iterationPlan.actions[0].evidence.screenshotIds, ["shot-checkout-review-light"]);
  assert.deepEqual(iterationPlan.actions[0].evidence.gapIds, ["gap-primary-button-loading"]);
  assert.deepEqual(iterationPlan.actions[0].evidence.provisionalExtensionIds, ["ext-primary-button-loading"]);
  assert.deepEqual(iterationPlan.actions[0].evidence.componentKeys, ["button-primary-key"]);
  assert.deepEqual(iterationPlan.actions[0].evidence.variableIds, ["VariableID:component-action-primary-label"]);

  assert.ok(
    iteratedReport.iterationNotes.some((note) =>
      note.id === "note-seed-review" &&
        note.relatedValidationIssueIds.includes("val-primary-action-contrast") &&
        note.relatedGapIds.includes("gap-primary-button-loading")
    )
  );
  assert.ok(
    iteratedReport.iterationNotes.some((note) =>
      note.relatedValidationIssueIds?.includes("val-primary-action-contrast") &&
        note.relatedGapIds?.includes("gap-primary-button-loading") &&
        note.relatedProvisionalExtensionIds?.includes("ext-primary-button-loading") &&
        note.nextAction.includes("approved provisional extension")
    )
  );
});

function reportNodes() {
  const button = {
    nodeId: "100:30",
    name: "Place Order Button",
    type: "INSTANCE"
  };
  const root = {
    nodeId: "100:1",
    name: "Checkout Review",
    type: "FRAME",
    width: 1440,
    height: 1024,
    children: [
      {
        nodeId: "100:20",
        name: "Order Summary",
        type: "FRAME",
        children: [button]
      }
    ]
  };

  return { root, button };
}

function primaryButtonUsage(button) {
  return {
    componentKey: "button-primary-key",
    name: "Button / Primary",
    source: "library",
    componentSetKey: "button-set-key",
    variant: {
      Variant: "Primary",
      Size: "Medium"
    },
    propertiesConfigured: {
      Label: "Place order",
      State: "Default"
    },
    usageCount: 1,
    instanceNodes: [button]
  };
}

function primaryActionVariableUsage(button) {
  return {
    variableId: "VariableID:component-action-primary-label",
    variableKey: "variable-action-primary-label-key",
    name: "component/action/primary/label",
    collection: "Component Tokens",
    mode: "Light",
    level: "component",
    resolvedType: "color",
    aliasChain: [
      "component/action/primary/label",
      "semantic/text/on-action",
      "primitive/color/neutral/0"
    ],
    usageCount: 1,
    boundNodes: [button]
  };
}

function buttonLoadingGap(button) {
  return {
    id: "gap-primary-button-loading",
    category: "component_property",
    severity: "medium",
    status: "provisional_extension_approved",
    summary: "Button / Primary does not expose an approved loading state.",
    neededCapability: "A supported loading state for primary checkout actions.",
    searchedAlternatives: [
      {
        name: "Button / Primary",
        result: "The discovered component exposes default and disabled states, but no loading state."
      }
    ],
    impact: "Checkout submission cannot show pending progress with an approved component property.",
    relatedNodes: [button],
    provisionalExtensionId: "ext-primary-button-loading",
    recommendedDesignSystemAction: "Add a supported loading property to Button / Primary after Design System review."
  };
}

function buttonLoadingExtension(button) {
  return {
    id: "ext-primary-button-loading",
    gapId: "gap-primary-button-loading",
    status: "created",
    approval: {
      required: true,
      granted: true,
      approvedBy: "operator",
      approvedAt: "2026-06-02T14:02:30.000Z"
    },
    proposal: "Use the smallest provisional loading state on Button / Primary.",
    node: {
      nodeId: "100:90",
      name: "Provisional Button Loading",
      type: "COMPONENT"
    },
    provisionalMarking: "Component name is prefixed with Provisional.",
    variableChain: [
      {
        level: "primitive",
        variableName: "primitive/color/neutral/0"
      },
      {
        level: "semantic",
        variableName: "semantic/text/on-action",
        aliasesTo: "primitive/color/neutral/0"
      },
      {
        level: "component",
        variableName: "component/action/primary/label",
        aliasesTo: "semantic/text/on-action"
      }
    ],
    usedByNodes: [button],
    promotionRecommendation: "Promote only if loading states become a reusable button behavior."
  };
}
