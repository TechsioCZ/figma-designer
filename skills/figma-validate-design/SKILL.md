---
name: figma-validate-design
description: Validate generated Figma output for design-system usage, variable chains, contrast, layout, themes, prototypes, and provisional extensions.
---

# figma-validate-design

Use this skill after generated Figma output exists and after live discovery/rule artifacts have been collected for the run.

## Validator Entrypoint

- Import `validateDesign` or `runValidator` from `src/validation/index.mjs`.
- Pass a run/report-like context that includes the generated design nodes and, when node links must be serialized, `figmaFile.url` or `figmaFile.fileKey`.
- Pass registered validation families through `validationFamilies` when family validators are available. A family may expose `validate`, `run`, or `evaluate`.
- Pass `runRuleLoader: true` with `ruleGroups` when the validator should dispatch the shared rule loader.
- Do not detach components, mutate Figma, or create provisional output during validation.

The entrypoint emits:

```js
{
  kind: "figma-validator-result",
  schemaVersion: "1.0.0",
  runId,
  validation: {
    status: "passed" | "failed" | "not_run",
    summary: { critical, error, warning, info },
    issues: []
  },
  familyResults: []
}
```

`validation.issues[]` is serialized for the Design Run Report schema. When a family result includes `node`, `nodeId`, or related node data, the serializer preserves Figma node IDs and builds direct node links from the run `figmaFile`.

## Operator Flow

1. Build the validation context from the run cache/report fixture: generated nodes, discovery output, component nesting map, layout/spacing fixtures, variable policy input, gaps, and provisional extensions.
2. Register any available family validators for component integrity, variables/themes/contrast, layout/spacing/prototype, or provisional extension checks.
3. Run the validator entrypoint and inspect `validation.status`.
4. Feed `validation.summary` and `validation.issues` into the Design Run Report and iteration notes.

This skill currently owns the validator entrypoint and result serializer only. CLI wiring and family-specific validators are intentionally out of scope for this lane.
