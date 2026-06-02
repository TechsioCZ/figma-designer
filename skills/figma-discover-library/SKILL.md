---
name: figma-discover-library
description: Read current Figma library components, variables, styles, examples, and patterns for one design run.
---

# figma-discover-library

Use after bootstrap passes.

Run `discoverLibrary` from `src/figma/library-discovery.mjs`.

Discovery is per-run evidence, not a permanent design-system manifest. Query the live Figma file unless fixture mode was explicitly selected.

Capture components, component sets, variants, properties, slots, nested instances, variables, modes, styles, examples, and approved patterns. Preserve enough IDs/keys for generation, validation, reports, and iteration.

If the library is missing something, report a gap. Do not invent assets locally.
