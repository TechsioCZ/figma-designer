---
name: figma-map-component-nesting
description: Build a disposable map of slots, nested components, bindings, and safe instance configuration paths.
---

# figma-map-component-nesting

Use after `figma-discover-library` in the same run.

Run `buildComponentNestingMap` from `src/figma/component-nesting-map.mjs`.

The map is a single-run reasoning artifact. Mark/cache it as disposable and refresh it from live discovery for later runs.

Use it to choose safe component properties, slots, instance swaps, variant paths, and variable chains. Never use it to detach instances or as permanent design-system truth.
