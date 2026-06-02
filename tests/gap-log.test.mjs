import assert from "node:assert/strict";
import test from "node:test";

import {
  createDesignSystemGapLog,
  normalizeDesignSystemGap,
  toReportDesignSystemGap
} from "../src/reporting/gap-log.mjs";

const figmaFile = {
  fileKey: "GapFileKey",
  name: "Gap Fixture",
  url: "https://www.figma.com/file/GapFileKey/Gap-Fixture"
};

test("normalizes generator, provisional runtime, and report gaps into deduped records", () => {
  const log = createDesignSystemGapLog(
    {
      runId: "run-gap-log",
      figmaFile,
      plan: {
        runId: "run-generator",
        designSystemGaps: [
          {
            id: "gap-generate-1",
            category: "missing_library_asset",
            status: "provisional_extension_requested",
            requirement: "Date Picker",
            searchSummary:
              "Checked discovered components, component sets, variants, slots, approved patterns, and examples before planning output.",
            closestMatches: [
              {
                key: "text-field-set-key",
                nodeId: "20:1",
                name: "Text Field",
                type: "COMPONENT_SET"
              }
            ],
            whyExistingAssetsDoNotSatisfy:
              "Closest discovered assets do not provide calendar selection.",
            proposedSmallestExtension:
              "Add the smallest approved Date Picker component needed by the brief.",
            approvalRequired: true
          }
        ]
      },
      provisionalRuntime: {
        runId: "run-runtime",
        reportPatch: {
          designSystemGaps: [
            {
              id: "gap-runtime-date-picker",
              category: "component",
              severity: "medium",
              status: "provisional_extension_proposed",
              summary: "No approved Date Picker component exists.",
              neededCapability: "Date Picker",
              searchedAlternatives: [
                {
                  name: "Text Field",
                  result: "Text Field cannot express calendar selection."
                }
              ],
              impact:
                "Scheduling screens cannot be produced under Strict Composition Mode.",
              proposedSmallestExtension:
                "Create the smallest provisional Date Picker using existing input and surface variables.",
              provisionalExtensionId: "ext-date-picker",
              relatedNodes: [
                {
                  nodeId: "44:7",
                  name: "Schedule Form",
                  type: "FRAME"
                }
              ]
            }
          ]
        }
      },
      report: {
        runId: "run-report",
        figmaFile,
        designSystemGaps: [
          {
            id: "gap-report-date-picker",
            category: "component",
            severity: "medium",
            status: "provisional_extension_approved",
            summary: "No approved Date Picker component exists.",
            neededCapability: "Date Picker",
            searchedAlternatives: [
              {
                name: "Calendar Pattern",
                result: "Pattern exists as an example only, not an approved live library asset."
              }
            ],
            impact:
              "Scheduling screens cannot be produced under Strict Composition Mode.",
            relatedNodes: [
              {
                nodeId: "44:7",
                name: "Schedule Form",
                type: "FRAME",
                url: "https://www.figma.com/file/GapFileKey/Gap-Fixture?node-id=44-7"
              }
            ],
            provisionalExtensionId: "ext-date-picker",
            recommendedDesignSystemAction:
              "Review the provisional Date Picker through the Design System intake process."
          }
        ]
      }
    },
    { now: "2026-06-02T12:00:00.000Z" }
  );

  assert.equal(log.kind, "design-system-gap-log");
  assert.equal(log.generatedAt, "2026-06-02T12:00:00.000Z");
  assert.equal(log.summary.gapCount, 1);
  assert.equal(log.summary.promotedToDesignSystemCount, 0);

  const [record] = log.records;
  assert.equal(record.kind, "design-system-gap-record");
  assert.equal(record.category, "component");
  assert.equal(record.originalCategory, "missing_library_asset");
  assert.equal(record.status, "provisional_extension_approved");
  assert.equal(record.approval.required, true);
  assert.equal(record.approval.state, "approved");
  assert.equal(record.approval.granted, true);
  assert.equal(record.provisionalExtensionId, "ext-date-picker");
  assert.equal(record.promotion.promotedToDesignSystem, false);
  assert.equal(record.promotion.state, "not_promoted");
  assert.equal(record.sources.length, 3);
  assert.deepEqual(
    record.sources.map((source) => source.type).sort(),
    ["generator", "provisional_runtime", "report"]
  );
  assert.equal(record.evidence.missingAssetOrPattern.name, "Date Picker");
  assert.match(record.evidence.whyExistingAssetsDoNotSatisfy, /calendar selection/i);
  assert.ok(record.searchedAlternatives.length >= 3);
  assert.ok(
    record.searchedAlternatives.some((alternative) => alternative.name === "Calendar Pattern")
  );
  assert.equal(record.relatedNodes[0].nodeId, "44:7");
  assert.equal(
    record.relatedNodes[0].url,
    "https://www.figma.com/file/GapFileKey/Gap-Fixture?node-id=44-7"
  );
  assert.match(record.dedupeKey, /^dsgap:v1:component:date-picker:date-picker/);
});

test("collects validator family gaps and preserves node evidence", () => {
  const log = createDesignSystemGapLog(
    {
      figmaFile,
      validation: {
        runId: "run-validator",
        familyResults: [
          {
            familyId: "layout-spacing-prototype",
            result: {
              gaps: [
                {
                  code: "missing_spacing_binding",
                  type: "design_system_gap",
                  severity: "gap",
                  nodeId: "55:9",
                  nodeName: "Payment Form Stack",
                  requirement:
                    "Bind label, control, help, error, and item-to-item gaps to discovered spacing variables or approved form patterns.",
                  liveLibrarySearch: "discovered_spacing_variables_and_patterns",
                  closestMatches: [
                    {
                      name: "semantic/spacing/form/item-gap",
                      type: "VARIABLE"
                    }
                  ],
                  impact:
                    "Spacing cannot be validated under Strict Composition Mode.",
                  proposedSmallestExtension:
                    "Add a semantic spacing relationship token for payment form stacks."
                }
              ]
            }
          }
        ]
      }
    },
    { now: "2026-06-02T12:05:00.000Z" }
  );

  assert.equal(log.summary.gapCount, 1);

  const [record] = log.records;
  assert.equal(record.category, "layout");
  assert.equal(record.severity, "medium");
  assert.equal(record.source.type, "validator");
  assert.equal(record.source.familyId, "layout-spacing-prototype");
  assert.equal(record.relatedNodes[0].nodeId, "55:9");
  assert.equal(
    record.relatedNodes[0].url,
    "https://www.figma.com/file/GapFileKey/Gap-Fixture?node-id=55-9"
  );
  assert.equal(record.evidence.missingAssetOrPattern.kind, "layout_guidance");
  assert.equal(record.searchedAlternatives[0].name, "semantic/spacing/form/item-gap");
});

test("stable dedupe keys do not depend on source ids", () => {
  const first = normalizeDesignSystemGap({
    id: "gap-a",
    category: "missing_pattern",
    requirement: "Checkout Summary",
    neededCapability: "Checkout Summary",
    searchSummary: "Searched approved patterns.",
    whyExistingAssetsDoNotSatisfy: "No checkout summary pattern exists."
  });
  const second = normalizeDesignSystemGap({
    id: "gap-b",
    category: "pattern",
    requirement: "Checkout Summary",
    neededCapability: "Checkout Summary",
    searchSummary: "Searched approved patterns.",
    whyExistingAssetsDoNotSatisfy: "No checkout summary pattern exists."
  });

  assert.equal(first.category, "pattern");
  assert.equal(second.category, "pattern");
  assert.equal(first.dedupeKey, second.dedupeKey);
  assert.notEqual(first.id, second.id);
});

test("serializes rich records back to strict report gap shape", () => {
  const record = normalizeDesignSystemGap(
    {
      category: "component_property",
      requirement: "Button loading state",
      neededCapability: "A loading boolean property on primary buttons.",
      searchedAlternatives: [
        {
          name: "Button / Primary",
          result: "No loading property is exposed."
        }
      ],
      impact: "Async submit flows cannot show pending state with approved component properties.",
      proposedSmallestExtension:
        "Expose a loading boolean property on the existing primary button component.",
      node: {
        nodeId: "77:3",
        name: "Submit Button",
        type: "INSTANCE"
      }
    },
    { figmaFile }
  );
  const reportGap = toReportDesignSystemGap(record);

  assert.deepEqual(Object.keys(reportGap).sort(), [
    "category",
    "id",
    "impact",
    "neededCapability",
    "recommendedDesignSystemAction",
    "relatedNodes",
    "searchedAlternatives",
    "severity",
    "status",
    "summary"
  ]);
  assert.equal(reportGap.category, "component_property");
  assert.equal(reportGap.relatedNodes[0].nodeId, "77:3");
  assert.equal(
    reportGap.relatedNodes[0].url,
    "https://www.figma.com/file/GapFileKey/Gap-Fixture?node-id=77-3"
  );
  assert.equal(reportGap.searchedAlternatives[0].name, "Button / Primary");
});
