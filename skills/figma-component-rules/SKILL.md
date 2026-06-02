---
name: figma-component-rules
description: Validate library instance usage, component properties, slots, and no-detach strict composition.
---

# figma-component-rules

Use after live library discovery and component nesting analysis.

Run `evaluateComponentRules` from `src/rules/component-rules.mjs`.

Rules:

- Use discovered library instances.
- Never detach, flatten, outline, or redraw component internals.
- Configure variants, text, booleans, and swaps through discovered component properties.
- Put nested content through discovered slots or instance-swap properties.
- Route missing component capabilities to Design System Gaps before proposing provisional output.

Passing means the checked screen remains live-library composed. Details: [strict composition](../../docs/guardrails/strict-composition.md).
