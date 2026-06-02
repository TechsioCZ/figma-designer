import assert from "node:assert/strict";
import test from "node:test";

import {
  runValidator,
  serializeValidationResult,
  validateDesign
} from "../src/validation/index.mjs";

const figmaFile = {
  fileKey: "ValidatorFileKey",
  name: "Validator Fixture",
  url: "https://www.figma.com/file/ValidatorFileKey/Validator-Fixture"
};

test("serializes passing validation family results with stable summary counts", async () => {
  const result = await validateDesign(
    {
      runId: "run-validator-pass",
      figmaFile
    },
    {
      validationFamilies: [
        {
          id: "component-integrity",
          validate() {
            return {
              status: "passed",
              issues: []
            };
          }
        }
      ]
    }
  );

  assert.equal(result.kind, "figma-validator-result");
  assert.equal(result.runId, "run-validator-pass");
  assert.deepEqual(result.validation, {
    status: "passed",
    summary: {
      critical: 0,
      error: 0,
      warning: 0,
      info: 0
    },
    issues: []
  });
  assert.equal(runValidator, validateDesign);
});

test("serializes failing family issues and summarizes blocking severities", async () => {
  const result = await validateDesign(
    {
      runId: "run-validator-fail",
      figmaFile
    },
    {
      validationFamilies: {
        contrast: {
          run() {
            return {
              issues: [
                {
                  id: "val-contrast-title",
                  code: "CONTRAST_TEXT_TITLE",
                  category: "contrast",
                  severity: "error",
                  message: "Title text contrast is below the target threshold.",
                  node: {
                    nodeId: "12:63",
                    name: "Title",
                    type: "TEXT"
                  },
                  expected: "WCAG 2.2 SC 1.4.6 Contrast (Enhanced) AAA ratio >= 7.00.",
                  actual: "WCAG ratio 3.10.",
                  recommendation: "Use an approved stronger semantic text variable."
                },
                {
                  code: "THEME_MODE_UNCHECKED",
                  severity: "warning",
                  message: "Dark mode has not been checked.",
                  nodeId: "12:34",
                  nodeName: "Login",
                  nodeType: "FRAME"
                }
              ]
            };
          }
        }
      }
    }
  );

  assert.equal(result.validation.status, "failed");
  assert.deepEqual(result.validation.summary, {
    critical: 0,
    error: 1,
    warning: 1,
    info: 0
  });
  assert.equal(result.validation.issues.length, 2);

  const contrastIssue = result.validation.issues[0];
  assert.equal(contrastIssue.id, "val-contrast-title");
  assert.equal(contrastIssue.node.nodeId, "12:63");
  assert.equal(
    contrastIssue.node.url,
    "https://www.figma.com/file/ValidatorFileKey/Validator-Fixture?node-id=12-63"
  );
  assert.equal(contrastIssue.expected, "WCAG 2.2 SC 1.4.6 Contrast (Enhanced) AAA ratio >= 7.00.");
  assert.equal(contrastIssue.actual, "WCAG ratio 3.10.");
  assert.equal(contrastIssue.recommendation, "Use an approved stronger semantic text variable.");

  const themeIssue = result.validation.issues[1];
  assert.equal(themeIssue.category, "theme_mode");
  assert.equal(themeIssue.node.name, "Login");
});

test("runs selected rule-loader groups and emits node-linked validation issues", async () => {
  const result = await validateDesign(
    {
      runId: "run-validator-rule-loader",
      figmaFile,
      ruleGroups: ["layout"],
      layout: {
        source: "validator-fixture",
        root: {
          nodeId: "20:1",
          name: "Generated Page",
          type: "FRAME",
          layoutRole: "page",
          generated: true,
          layoutMode: "NONE",
          children: []
        }
      }
    },
    {
      runRuleLoader: true
    }
  );

  assert.equal(result.validation.status, "failed");
  assert.equal(result.validation.summary.error, 2);
  assert.equal(result.validation.issues.length, 2);

  const issue = result.validation.issues.find(
    (candidate) => candidate.code === "layout.auto-layout-required"
  );
  assert.ok(issue);
  assert.equal(issue.code, "layout.auto-layout-required");
  assert.equal(issue.category, "layout_hygiene");
  assert.equal(issue.severity, "error");
  assert.equal(issue.node.nodeId, "20:1");
  assert.equal(issue.node.name, "Generated Page");
  assert.equal(
    issue.node.url,
    "https://www.figma.com/file/ValidatorFileKey/Validator-Fixture?node-id=20-1"
  );
  assert.match(issue.message, /auto layout/i);
  assert.equal(issue.expected, "layoutMode=VERTICAL or layoutMode=HORIZONTAL.");
});

test("normalizes report-like validation fixtures without dispatching families", () => {
  const validation = serializeValidationResult(
    {
      status: "failed",
      summary: {
        critical: 99,
        error: 99,
        warning: 99,
        info: 99
      },
      issues: [
        {
          code: "RAW_FINAL_VALUE",
          severity: "critical",
          message: "Raw color value is bound directly to final UI.",
          nodeId: "44:5",
          nodeName: "Raw Surface",
          actual: "#1A47CC"
        }
      ]
    },
    { figmaFile }
  );

  assert.equal(validation.status, "failed");
  assert.deepEqual(validation.summary, {
    critical: 1,
    error: 0,
    warning: 0,
    info: 0
  });
  assert.equal(validation.issues[0].category, "raw_color");
  assert.equal(validation.issues[0].node.url, "https://www.figma.com/file/ValidatorFileKey/Validator-Fixture?node-id=44-5");
});
