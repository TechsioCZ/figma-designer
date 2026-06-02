---
name: figma-iterate-design
description: Improve generated Figma output from validation failures, screenshots, report data, and approved gap decisions.
---

# figma-iterate-design

Use this skill after validation and screenshot reporting have produced a Design Run Report.

## Module

Call `planDesignIteration` from `src/iteration/design-iteration.mjs`.

The module is plan-only. It does not mutate Figma, detach instances, create provisional output, approve provisional extensions, or weaken Strict Composition Mode.

## Inputs

Pass a report-shaped object:

- `report.validation.issues`
- `report.screens`
- `report.screenshots`
- `report.designSystemGaps`
- `report.provisionalExtensions`
- `report.componentsUsed`
- `report.variablesUsed`
- optional `gapNotes` for operator decisions that update gap status before planning

## Behavior

The planner emits `kind: "figma-design-iteration-plan"` with:

- approved plan-only actions for open validation issues that can be repaired with existing library components, supported properties, slots, styles, variables, patterns, screenshots, or prototype targets;
- blocked approval-request actions for any unapproved provisional-extension path;
- no actions for validation issues marked `resolved` or `waived`;
- iteration notes suitable for `reportPatch.iterationNotes`;
- evidence links to validation issue IDs, screenshot IDs, gap IDs, provisional extension IDs, and Figma node refs.

## Guardrails

- Never create or apply provisional output unless the linked `provisionalExtensions[]` record has `approval.required: true`, `approval.granted: true`, and an applied status such as `approved` or `created`.
- Never treat a provisional extension as promoted Design System truth.
- Preserve existing `resolved` and `waived` validation issue semantics.
- Keep `strictComposition.noDetach`, `strictComposition.noRawFinalValues`, and `strictComposition.noUnapprovedProvisionalExtensions` true.
- Return blocked actions when approval evidence is missing instead of inventing a workaround.
