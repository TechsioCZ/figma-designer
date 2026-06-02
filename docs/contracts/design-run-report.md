# Design Run Report Contract

`schemas/design-run-report.schema.json` defines the durable report emitted after a Figma design run. The report is a run artifact, not a Design System manifest. It records enough structured data for operators to inspect the generated work, aggregate recurring Design System gaps, and drive the next iteration.

## Required Top-Level Sections

- `schemaVersion`, `runId`, `generatedAt`, `status`, and `figmaFile` identify the run and target Figma file.
- `summary` stores report counts for quick aggregation.
- `screens` lists generated or updated Figma screen nodes, including node IDs and Figma links.
- `componentsUsed` records library, local, and provisional component usage with instance node links and configured variants/properties.
- `variablesUsed` records primitive, semantic, and component variable usage, alias chains, modes, and bound nodes.
- `validation` records validation status, severity counts, and issue details for detached components, raw values, broken aliases, invalid slots, layout hygiene, contrast, theme/mode, prototype, screenshot, and setup issues.
- `designSystemGaps` records missing components, variants, slots, component properties, variables, modes, styles, patterns, layout guidance, content, or accessibility support.
- `provisionalExtensions` records approved or proposed temporary additions tied back to Design System gaps, including approval state, Figma node links, provisional marking, variable chains, and promotion recommendations.
- `screenshots` records screenshot artifacts with the Figma node captured, local path, optional URL, mode/theme, dimensions, and capture purpose.
- `iterationNotes` records machine-readable notes that connect follow-up work to validation issues, gaps, screenshots, or provisional extensions.

## Status Semantics

Top-level `status` summarizes the run:

- `passed`: generated output passed validation with no blocking issues.
- `failed`: generated output exists but validation found blocking issues.
- `blocked`: the run could not complete because required Figma access, assets, or setup was unavailable.
- `needs_iteration`: generated output is reviewable but requires another design pass.

`validation.status` is narrower and only describes whether validation ran and passed.

## Figma References

Every Figma node reference uses `nodeId`, `name`, and `url`. Reports should prefer direct Figma node URLs so operators can inspect screens, instances, validation failures, provisional extensions, and screenshot targets without manually searching the file.

## Provisional Extensions

A provisional extension must be tied to a `designSystemGaps[].id` through `gapId`. The extension must also include:

- explicit approval state,
- the Figma node created or proposed,
- the visual or structural provisional marking,
- primitive to semantic to component variable chain entries when variables are involved,
- a recommendation for promotion, revision, or rejection.

The schema allows `status: "proposed"` so an unapproved report can document the proposal without implying it was created.

## Example

`fixtures/reports/design-run-report.valid.json` is a valid example report that exercises validation issues, component and variable usage, a Design System gap, a provisional extension, screenshots, iteration notes, and Figma node links.
