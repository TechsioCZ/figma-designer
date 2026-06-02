# Rule Loader Contract

`src/rules/rule-loader.mjs` is the shared registry for rule groups used by generation, validation, screenshot reporting, and iteration. Callers load rule groups by ID and run them against one shared run context instead of copying rule text or importing individual policy modules ad hoc.

## Groups

The registry exposes these group IDs:

- `component`
- `layout`
- `spacing`
- `variable`
- `provisional`

Use `listRuleGroups()` to inspect available groups and evaluator names. Use `loadRuleGroups(groupIds)` to create a selected registry, or `runRuleGroups(context, { groups })` for a one-shot run.

## Context Routing

The loader keeps each underlying rule result intact while adapting common run-context fields:

- Component rules read `discovery`, `nestingMap` or `componentNestingMap`, and `design`.
- Layout rules read `layout` or `layoutFixture`.
- Spacing rules read `spacing` or `spacingFixture`, plus discovery-shaped spacing guidance from the shared context.
- Variable policy reads `variables.references`, `rawFinalValues`, `proposedVariables`, and `finalBindings`.
- Provisional policy reads `designSystemGaps` and `provisionalExtensions`.

Group-specific keys such as `component`, `variablePolicy`, or `provisionalPolicy` may override the shared fields when a caller needs a narrower fixture.

## Result Shape

`runRuleGroups()` returns:

- `kind: "figma-rule-loader-result"`
- `schemaVersion`
- `runId`
- `status`: `passed` only when every selected group passes.
- `groupIds`: selected groups in execution order.
- `summary`: combined group, rule, issue, violation, and gap counts.
- `groups[]`: normalized per-group status and counts plus the original group `result`.

Downstream commands should use the normalized fields for routing and keep `groups[].result` for group-specific report details.
