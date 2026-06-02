import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  checkLayoutRules,
  layoutRuleDefinitions,
  layoutRuleIds,
  validateLayoutRules
} from "../src/rules/layout-rules.mjs";

const fixturesRoot = path.resolve("fixtures/rules/layout");

async function loadFixture(name) {
  return JSON.parse(await readFile(path.join(fixturesRoot, name), "utf8"));
}

function ruleIds(result) {
  return result.violations.map((violation) => violation.ruleId);
}

test("exports deterministic layout rule artifacts over frame fixtures", async () => {
  const fixture = await loadFixture("valid-page.json");
  const result = checkLayoutRules(fixture, {
    now: "2026-06-02T10:00:00.000Z"
  });

  assert.equal(result.kind, "figma-layout-rules-result");
  assert.equal(result.schemaVersion, "1.0.0");
  assert.equal(result.source, "fixture");
  assert.equal(result.checkedAt, "2026-06-02T10:00:00.000Z");
  assert.equal(result.ok, true);
  assert.equal(result.summary.pageFrameCount, 1);
  assert.equal(result.summary.sectionCount, 2);
  assert.equal(result.summary.containerCount, 2);
  assert.equal(result.summary.violationCount, 0);
  assert.deepEqual(result.designSystemGaps, []);
  assert.deepEqual(layoutRuleIds, layoutRuleDefinitions.map((rule) => rule.id));
  assert.equal(validateLayoutRules, checkLayoutRules);
});

test("rejects invalid auto-layout mode and direction", async () => {
  const fixture = await loadFixture("invalid-auto-layout.json");
  const result = checkLayoutRules(fixture, {
    now: "2026-06-02T10:05:00.000Z"
  });

  assert.equal(result.ok, false);
  assert.deepEqual(ruleIds(result), [
    "layout.auto-layout-required",
    "layout.auto-layout-direction"
  ]);

  const pageViolation = result.violations.find(
    (violation) => violation.nodeId === "20:1"
  );
  assert.ok(pageViolation);
  assert.match(pageViolation.message, /must use Figma auto layout/);
  assert.equal(pageViolation.actual, "NONE");

  const sectionViolation = result.violations.find(
    (violation) => violation.nodeId === "20:2"
  );
  assert.ok(sectionViolation);
  assert.equal(sectionViolation.expected, "layoutMode=VERTICAL.");
  assert.equal(sectionViolation.actual, "layoutMode=HORIZONTAL.");
});

test("rejects fixed resizing, locked frames, and absolute layout children", async () => {
  const fixture = await loadFixture("invalid-resizing-editability.json");
  const result = checkLayoutRules(fixture);

  assert.equal(result.ok, false);
  assert.ok(ruleIds(result).includes("layout.responsive-resizing"));
  assert.ok(ruleIds(result).includes("layout.editable-frame-structure"));

  const sectionViolations = result.violations.filter(
    (violation) => violation.nodeId === "40:2"
  );
  assert.equal(sectionViolations.length, 2);
  assert.ok(
    sectionViolations.some(
      (violation) => violation.ruleId === "layout.editable-frame-structure"
    )
  );
  assert.ok(
    sectionViolations.some(
      (violation) => violation.ruleId === "layout.responsive-resizing"
    )
  );

  const absoluteViolation = result.violations.find(
    (violation) => violation.nodeId === "40:4"
  );
  assert.ok(absoluteViolation);
  assert.equal(absoluteViolation.ruleId, "layout.editable-frame-structure");
  assert.match(absoluteViolation.message, /absolutely positioned/);
});

test("rejects loose page children that bypass section structure", async () => {
  const fixture = await loadFixture("invalid-page-structure.json");
  const result = checkLayoutRules(fixture);

  assert.equal(result.ok, false);
  assert.equal(result.violations[0].ruleId, "layout.page-section-structure");
  assert.equal(result.violations[0].nodeId, "30:1");
  assert.match(result.violations[0].message, /must expose section structure/);
  assert.ok(
    result.violations.some(
      (violation) =>
        violation.ruleId === "layout.page-section-structure" &&
        violation.nodeId === "30:2"
    )
  );
  assert.ok(
    result.violations.some(
      (violation) =>
        violation.ruleId === "layout.page-section-structure" &&
        violation.nodeId === "30:3"
    )
  );
});

test("rejects custom primitive layout that hides a design-system gap", async () => {
  const fixture = await loadFixture("custom-primitive-hides-gap.json");
  const result = checkLayoutRules(fixture);

  assert.equal(result.ok, false);
  assert.equal(result.summary.designSystemGapCount, 1);

  const violation = result.violations.find(
    (candidate) => candidate.ruleId === "layout.custom-primitive-hides-gap"
  );
  assert.ok(violation);
  assert.equal(violation.nodeId, "50:3");
  assert.match(violation.message, /hiding a missing design-system component/);

  assert.deepEqual(result.designSystemGaps, [
    {
      ruleId: "layout.custom-primitive-hides-gap",
      nodeId: "50:3",
      nodeName: "Fake search input",
      path: "Customer Screens > Search / Desktop > Search section > Fake search input",
      requirement:
        "Use a live library component, component slot, approved pattern, or approved Provisional Extension instead of a raw primitive layout.",
      closestCompliantAction:
        "Search live library assets for an equivalent component or report a Design System Gap before proceeding."
    }
  ]);
});
