---
name: figma-discover-library
description: Discover connected Figma UI Library components, variants, properties, slots, variables, modes, styles, examples, and approved patterns per run.
---

# figma-discover-library

Use this skill after `/figma-bootstrap-check` confirms that the target file and connected Assets are available. Discovery is a per-run read of the current Figma library state, not a generated source of truth.

## Inputs

- Active Figma file access from `/figma-use`.
- Run id and run artifact paths from the current run context when available.
- Optional `FIGMA_FIXTURE_PATH` for local fixture-backed testing.

## Behavior

1. Read the Figma file, local components, local component sets, local styles, and local variables through `src/figma/figma-access.mjs`.
2. Build a run-scoped discovery payload with `source` set to `live_figma` for real Figma reads or `fixture` for fixture reads.
3. Include components, component sets, variants, component properties, instance-swap slots, slot-marked nodes, nested component instances, variables, modes, styles, examples, and approved patterns when available.
4. Emit run-context-shaped references under `runContextPatch.discovery`, `runContextPatch.variables`, and `runContextPatch.libraries` so later creation, validation, and nesting steps can consume the same per-run facts.
5. Treat cache paths as ephemeral run artifacts only. Do not create or maintain a permanent Design System manifest.

## Module

Use `discoverLibrary` from `src/figma/library-discovery.mjs`.

```js
import { createFigmaAccessFromEnv } from "../../src/figma/figma-access.mjs";
import { discoverLibrary } from "../../src/figma/library-discovery.mjs";

const figmaAccess = createFigmaAccessFromEnv();
const discovery = await discoverLibrary({
  figmaAccess,
  runId: "run-2026-06-02-example"
});
```

The returned payload is safe to pass to later run-context and nesting consumers. It should not be copied into a long-lived manifest or edited by hand to represent library truth.

## Guardrails

- Query Figma every design run unless the operator explicitly selected fixture mode.
- Prefer library component properties and slots over detached or freehand nested content.
- Preserve variable references and mode data so later steps can validate primitive -> semantic -> component chains.
- Report missing library facts as discovery gaps instead of inventing components, styles, or variables.
- Do not wire CLI behavior from this skill; CLI integration is owned by the shared harness lane.
