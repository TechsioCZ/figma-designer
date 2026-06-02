import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  createDesignIterationPlan,
  iterateDesign,
  planDesignIteration
} from "../src/iteration/design-iteration.mjs";

const reportFixturePath = path.resolve("fixtures/reports/design-run-report.valid.json");
const now = "2026-06-02T12:30:00.000Z";

test("plans approved validation and gap actions from report evidence", () => {
  const report = readReportFixture();
  const plan = planDesignIteration(
    { report },
    {
      runId: "run-iterate-login",
      now
    }
  );

  assert.equal(plan.kind, "figma-design-iteration-plan");
  assert.equal(plan.mode, "plan_only");
  assert.equal(plan.status, "ready");
  assert.equal(plan.strictComposition.noUnapprovedProvisionalExtensions, true);
  assert.equal(plan.strictComposition.provisionalExtensionsCreated, false);
  assert.equal(plan.strictComposition.liveWritePerformed, false);
  assert.equal(plan.summary.openValidationIssueCount, 2);
  assert.equal(plan.summary.approvedActionCount, 3);
  assert.equal(plan.summary.blockedActionCount, 0);
  assert.equal(plan.summary.screenshotReferenceCount, 1);
  assert.equal(plan.summary.gapReferenceCount, 1);

  const contrastAction = plan.actions.find((action) =>
    action.evidence.validationIssueIds.includes("val-contrast-001")
  );
  assert.ok(contrastAction);
  assert.equal(contrastAction.type, "bind_existing_variable");
  assert.equal(contrastAction.status, "approved");
  assert.equal(contrastAction.approved, true);
  assert.equal(contrastAction.liveWrite, false);
  assert.deepEqual(contrastAction.evidence.screenshotIds, ["shot-login-light"]);
  assert.ok(contrastAction.evidence.nodes.some((node) => node.nodeId === "12:63"));
  assert.match(contrastAction.instruction, /WCAG 2\.2 SC 1\.4\.6/);
  assert.match(contrastAction.instruction, /Use existing library assets/);

  const apcaAction = plan.actions.find((action) =>
    action.evidence.validationIssueIds.includes("val-contrast-002")
  );
  assert.ok(apcaAction);
  assert.equal(apcaAction.type, "bind_existing_variable");
  assert.match(apcaAction.instruction, /APCA Readability Criterion Gold/);

  const gapAction = plan.actions.find((action) => action.evidence.gapIds.includes("gap-auth-card"));
  assert.ok(gapAction);
  assert.equal(gapAction.type, "use_approved_provisional_extension");
  assert.equal(gapAction.status, "approved");
  assert.deepEqual(gapAction.evidence.provisionalExtensionIds, ["ext-auth-card"]);

  assert.equal(plan.reportPatch.iterationNotes.length, 3);
  assert.ok(
    plan.reportPatch.iterationNotes.some((note) =>
      note.relatedValidationIssueIds?.includes("val-contrast-001")
    )
  );
  assert.ok(
    plan.reportPatch.iterationNotes.some((note) =>
      note.relatedValidationIssueIds?.includes("val-contrast-002")
    )
  );
  assert.ok(
    plan.reportPatch.iterationNotes.some((note) =>
      note.relatedGapIds?.includes("gap-auth-card") &&
        note.relatedProvisionalExtensionIds?.includes("ext-auth-card")
    )
  );

  assert.equal(createDesignIterationPlan, planDesignIteration);
  assert.equal(iterateDesign, planDesignIteration);
});

test("preserves resolved and waived validation semantics", () => {
  const report = {
    runId: "run-iterate-skips",
    validation: {
      status: "failed",
      issues: [
        validationIssue({
          id: "val-resolved",
          status: "resolved",
          nodeId: "10:1"
        }),
        validationIssue({
          id: "val-waived",
          status: "waived",
          nodeId: "10:2"
        })
      ]
    },
    screenshots: [],
    designSystemGaps: [],
    provisionalExtensions: [],
    iterationNotes: []
  };

  const plan = planDesignIteration({ report }, { now });

  assert.equal(plan.status, "no_changes");
  assert.equal(plan.summary.openValidationIssueCount, 0);
  assert.equal(plan.summary.skippedValidationIssueCount, 2);
  assert.equal(plan.actions.length, 0);
  assert.equal(plan.reportPatch.iterationNotes.length, 0);
  assert.deepEqual(
    plan.skippedIssues.map((issue) => [issue.issueId, issue.status]),
    [
      ["val-resolved", "resolved"],
      ["val-waived", "waived"]
    ]
  );
});

test("blocks unapproved provisional extension paths instead of applying them", () => {
  const report = {
    runId: "run-iterate-unapproved",
    screens: [
      {
        id: "screen-dashboard",
        node: node("20:1", "Dashboard", "FRAME"),
        status: "needs_iteration",
        screenshotIds: ["shot-dashboard"],
        validationIssueIds: ["val-provisional-unapproved"]
      }
    ],
    validation: {
      status: "failed",
      issues: [
        {
          ...validationIssue({
            id: "val-provisional-unapproved",
            category: "provisional_extension",
            severity: "critical",
            nodeId: "20:9",
            message: "A provisional chart is present without granted approval."
          }),
          gapId: "gap-chart",
          provisionalExtensionId: "ext-chart"
        }
      ]
    },
    screenshots: [
      {
        id: "shot-dashboard",
        node: node("20:1", "Dashboard", "FRAME"),
        path: "reports/run/screenshots/dashboard.png",
        capturedAt: now,
        purpose: "validation"
      }
    ],
    designSystemGaps: [
      {
        id: "gap-chart",
        category: "component",
        severity: "high",
        status: "provisional_extension_proposed",
        summary: "Chart component is missing.",
        neededCapability: "A library chart component.",
        searchedAlternatives: [{ name: "Table", result: "Does not visualize trend data." }],
        impact: "Dashboard cannot show trend data consistently.",
        relatedNodes: [node("20:9", "Provisional Chart", "COMPONENT")],
        provisionalExtensionId: "ext-chart"
      }
    ],
    provisionalExtensions: [
      {
        id: "ext-chart",
        gapId: "gap-chart",
        status: "proposed",
        approval: {
          required: true,
          granted: false
        },
        proposal: "Create the smallest provisional chart component.",
        node: node("20:9", "Provisional Chart", "COMPONENT"),
        provisionalMarking: "Provisional node prefix",
        variableChain: [
          { level: "primitive", variableName: "primitive/color/blue/600" },
          { level: "semantic", variableName: "semantic/chart/line", aliasesTo: "primitive/color/blue/600" },
          { level: "component", variableName: "component/chart/line", aliasesTo: "semantic/chart/line" }
        ],
        promotionRecommendation: "Review before promotion."
      }
    ],
    iterationNotes: []
  };

  const plan = planDesignIteration({ report }, { now });

  assert.equal(plan.status, "blocked");
  assert.equal(plan.summary.blockedActionCount, 1);
  assert.equal(plan.summary.approvedActionCount, 0);
  assert.equal(plan.actions.length, 1);

  const action = plan.actions[0];
  assert.equal(action.type, "request_provisional_extension_approval");
  assert.equal(action.status, "blocked");
  assert.equal(action.approved, false);
  assert.equal(action.strictComposition.allowUnapprovedProvisionalExtension, false);
  assert.equal(action.strictComposition.requiresOperatorApproval, true);
  assert.deepEqual(action.evidence.validationIssueIds, ["val-provisional-unapproved"]);
  assert.deepEqual(action.evidence.gapIds, ["gap-chart"]);
  assert.deepEqual(action.evidence.provisionalExtensionIds, ["ext-chart"]);
  assert.deepEqual(action.evidence.screenshotIds, ["shot-dashboard"]);
  assert.match(action.instruction, /Do not create, apply, promote, or normalize provisional output/);
});

test("gap notes can resolve report gaps before iteration planning", () => {
  const report = {
    runId: "run-iterate-gap-notes",
    validation: {
      status: "passed",
      issues: []
    },
    designSystemGaps: [
      {
        id: "gap-filter",
        category: "component",
        severity: "medium",
        status: "open",
        summary: "Filter component is missing.",
        neededCapability: "Filter controls.",
        searchedAlternatives: [{ name: "Toolbar", result: "No filter affordance." }],
        impact: "Operators cannot filter dense tables.",
        relatedNodes: [node("30:1", "Table", "FRAME")]
      }
    ],
    provisionalExtensions: [],
    screenshots: [],
    iterationNotes: []
  };

  const plan = planDesignIteration({
    report,
    gapNotes: [
      {
        id: "gap-filter",
        status: "resolved"
      }
    ]
  }, { now });

  assert.equal(plan.status, "no_changes");
  assert.equal(plan.actions.length, 0);
});

function readReportFixture() {
  return JSON.parse(readFileSync(reportFixturePath, "utf8"));
}

function validationIssue({
  id,
  status = "open",
  category = "contrast",
  severity = "error",
  nodeId,
  message = "Validation failed."
}) {
  return {
    id,
    code: id.toUpperCase().replaceAll("-", "_"),
    category,
    severity,
    status,
    message,
    node: node(nodeId, `Node ${nodeId}`, "FRAME"),
    recommendation: "Use an approved library-backed repair."
  };
}

function node(nodeId, name, type) {
  return {
    nodeId,
    name,
    type,
    url: `https://www.figma.com/file/TestFile/Test?node-id=${nodeId.replace(":", "-")}`
  };
}
