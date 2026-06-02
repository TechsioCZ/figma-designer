import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createScreenshotReport,
  normalizeScreenshotEntry
} from "../src/reporting/screenshot-report.mjs";

const figmaFile = {
  fileKey: "CustomerFileFixture",
  name: "Customer Portal Workspace",
  url: "https://www.figma.com/file/CustomerFileFixture/Customer-Portal"
};

const generatedScreen = {
  id: "screen-login",
  node: {
    nodeId: "12:34",
    name: "Login",
    type: "FRAME"
  },
  briefReference: "Create a login screen.",
  dimensions: {
    width: 1440,
    height: 1024
  },
  theme: "Default",
  mode: "Light"
};

test("creates schema-shaped screenshot entries from fixture export results", async () => {
  const result = await createScreenshotReport(
    {
      runId: "run-fixture",
      generatedAt: "2026-06-02T10:00:00.000Z",
      figmaFile,
      screens: [generatedScreen],
      screenshotResults: [
        {
          screenId: "screen-login",
          path: "reports/run-fixture/screenshots/login-light.png",
          capturedAt: "2026-06-02T10:01:00.000Z",
          purpose: "review",
          theme: "Default",
          mode: "Light",
          dimensions: {
            width: 1440,
            height: 1024
          }
        }
      ],
      componentsUsed: [
        {
          componentKey: "button-primary-key",
          name: "Button / Primary",
          source: "library",
          usageCount: 1,
          instanceNodes: [
            {
              nodeId: "12:56",
              name: "Sign in Button",
              type: "INSTANCE"
            }
          ]
        }
      ],
      variablesUsed: [
        {
          variableId: "VariableID:semantic-action-primary-bg",
          name: "semantic/action/primary/background",
          collection: "Semantic",
          level: "semantic",
          mode: "Light",
          usageCount: 1,
          boundNodes: [
            {
              nodeId: "12:56",
              name: "Sign in Button",
              type: "INSTANCE"
            }
          ]
        }
      ],
      validation: {
        status: "failed",
        issues: [
          {
            id: "val-contrast-001",
            code: "CONTRAST_TEXT_SECONDARY",
            category: "contrast",
            severity: "error",
            status: "open",
            message: "Secondary help text does not meet contrast.",
            node: {
              nodeId: "12:34",
              name: "Login",
              type: "FRAME"
            }
          }
        ]
      },
      designSystemGaps: [
        {
          id: "gap-auth-card",
          category: "component",
          severity: "medium",
          status: "open",
          summary: "No auth card component exists.",
          neededCapability: "Reusable auth form container.",
          searchedAlternatives: [{ name: "Card / Default", result: "Missing auth header." }],
          impact: "Login composition is inconsistent."
        }
      ],
      provisionalExtensions: [],
      iterationNotes: [
        {
          id: "note-1",
          iteration: 1,
          createdAt: "2026-06-02T10:02:00.000Z",
          authorRole: "codex",
          category: "validation",
          note: "Fix contrast before approval.",
          relatedValidationIssueIds: ["val-contrast-001"],
          relatedGapIds: ["gap-auth-card"]
        }
      ]
    },
    { now: "2026-06-02T10:03:00.000Z" }
  );

  const report = result.report;

  assert.equal(result.kind, "figma-screenshot-report");
  assert.equal(report.summary.screenshotCount, 1);
  assert.equal(report.screens[0].screenshotIds[0], "shot-screen-login-light");
  assert.equal(report.screens[0].validationIssueIds[0], "val-contrast-001");
  assert.deepEqual(report.screenshots[0], {
    id: "shot-screen-login-light",
    node: {
      nodeId: "12:34",
      name: "Login",
      type: "FRAME",
      url: "https://www.figma.com/file/CustomerFileFixture/Customer-Portal?node-id=12-34"
    },
    path: "reports/run-fixture/screenshots/login-light.png",
    capturedAt: "2026-06-02T10:01:00.000Z",
    purpose: "review",
    theme: "Default",
    mode: "Light",
    dimensions: {
      width: 1440,
      height: 1024
    }
  });
  assert.equal(report.componentsUsed[0].instanceNodes[0].url, report.screenshots[0].node.url.replace("12-34", "12-56"));
  assert.equal(report.variablesUsed[0].boundNodes[0].nodeId, "12:56");
  assert.equal(report.designSystemGaps[0].id, "gap-auth-card");
  assert.equal(report.iterationNotes[0].relatedGapIds[0], "gap-auth-card");
});

test("records unavailable capture as structured screenshot validation issue", async () => {
  const { report } = await createScreenshotReport(
    {
      runId: "run-unavailable",
      generatedAt: "2026-06-02T10:00:00.000Z",
      figmaFile,
      screens: [generatedScreen],
      validation: {
        status: "passed",
        issues: []
      }
    },
    { now: "2026-06-02T10:01:00.000Z" }
  );

  assert.equal(report.status, "needs_iteration");
  assert.equal(report.summary.screenshotCount, 0);
  assert.deepEqual(report.screens[0].screenshotIds, []);
  assert.equal(report.validation.status, "passed");
  assert.equal(report.validation.summary.warning, 1);
  assert.equal(report.validation.issues[0].code, "SCREENSHOT_CAPTURE_UNAVAILABLE");
  assert.equal(report.validation.issues[0].category, "screenshot");
  assert.equal(report.validation.issues[0].node.url, "https://www.figma.com/file/CustomerFileFixture/Customer-Portal?node-id=12-34");
  assert.deepEqual(report.screens[0].validationIssueIds, ["val-screenshot-screen-login-unavailable"]);
});

test("records adapter failure as a failed screenshot validation issue without live Figma", async () => {
  const { report } = await createScreenshotReport(
    {
      runId: "run-adapter-failed",
      figmaFile,
      nodes: [
        {
          nodeId: "20:1",
          name: "Dashboard",
          type: "FRAME",
          width: 1280,
          height: 720
        }
      ]
    },
    {
      now: "2026-06-02T11:00:00.000Z",
      screenshotAdapter: async () => {
        throw new Error("Figma export API unavailable");
      }
    }
  );

  assert.equal(report.status, "failed");
  assert.equal(report.summary.screenshotCount, 0);
  assert.equal(report.validation.status, "failed");
  assert.equal(report.validation.summary.error, 1);
  assert.equal(report.validation.issues[0].code, "SCREENSHOT_CAPTURE_FAILED");
  assert.equal(report.validation.issues[0].message, "Screenshot capture failed for Dashboard.");
  assert.match(report.validation.issues[0].actual, /failed/);
});

test("normalizeScreenshotEntry supports direct deterministic entry building", () => {
  const entry = normalizeScreenshotEntry(
    {
      id: "shot-custom",
      path: "reports/run/screenshots/custom.png"
    },
    {
      ...generatedScreen,
      mode: undefined
    },
    {
      context: { figmaFile },
      now: "2026-06-02T12:00:00.000Z",
      purpose: "validation",
      mode: "Dark"
    }
  );

  assert.equal(entry.id, "shot-custom");
  assert.equal(entry.purpose, "validation");
  assert.equal(entry.mode, "Dark");
  assert.equal(entry.dimensions.width, 1440);
});
