---
name: figma-map-component-nesting
description: Build an ephemeral map of nested components, slots, variable bindings, and safe instance configuration paths.
---

# figma-map-component-nesting

Use this skill after `/figma-discover-library` in the same design run. It turns the run-scoped discovery payload into an ephemeral Component Nesting Map for generation and validation decisions.

The map is a reasoning artifact only. It must be regenerated from current Figma discovery for each run and must not be saved or maintained as a permanent Design System manifest.

## Inputs

- Discovery output from `src/figma/library-discovery.mjs`.
- The active run id when available.
- Optional run cache artifact path from the current run context.

## Behavior

1. Read the current run's discovery output. Do not query unrelated local UI code or a persistent manifest.
2. Build per-component and per-component-set entries for:
   - nested library instances.
   - slot nodes and instance-swap slot properties.
   - slot relationships between hosts and nested components.
   - component properties, including inherited component-set properties for variants.
   - variable bindings with primitive -> semantic -> component alias chain metadata when discovery provides it.
   - safe instance configuration paths for variants, booleans, text properties, and instance swaps.
3. Mark every map as `lifetime: "single_run"`, `disposable: true`, and `sourceOfTruth: false`.
4. Use safe configuration paths to change instances through component properties only. Do not detach components or draw freehand nested content into component instances.
5. Treat missing slots, component properties, or variable bindings as discovery gaps for later reporting.

## Module

Use `buildComponentNestingMap` from `src/figma/component-nesting-map.mjs`.

```js
import { discoverLibrary } from "../../src/figma/library-discovery.mjs";
import { buildComponentNestingMap } from "../../src/figma/component-nesting-map.mjs";

const discovery = await discoverLibrary({ figmaAccess, runId });
const nestingMap = buildComponentNestingMap(discovery, { runId });
```

If a run cache is used, write the returned payload as a disposable run artifact such as `component-nesting-map`. The cached artifact is only a performance aid for the active run; refresh Figma discovery and rebuild the map for any later run.

## Guardrails

- Never use the nesting map as design-system truth after the active run ends.
- Never modify an instance by detaching it.
- Prefer slot-backed `INSTANCE_SWAP` properties for nested content.
- Prefer component-set variant properties over manually selecting arbitrary component nodes.
- Preserve variable binding metadata so validators can check alias chains and theme mode behavior.
- Do not wire CLI behavior from this skill; CLI integration is owned by the shared harness lane.
