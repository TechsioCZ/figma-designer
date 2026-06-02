---
name: figma-layout-rules
description: Validate editable, responsive Figma layout structure under strict composition.
---

# figma-layout-rules

Use for generated page, section, container, and responsive layout checks.

Run `checkLayoutRules` from `src/rules/layout-rules.mjs`.

Rules:

- Keep screens in the Generation Workspace unless approved otherwise.
- Use named page frames with editable section frames.
- Use auto layout for structured children.
- Prefer approved library examples, slots, component controls, variables, and patterns.
- Do not hide missing components with raw frames, vectors, absolute positioning, or fake controls.

Missing layout capability is a Design System Gap. Details: [strict composition](../../docs/guardrails/strict-composition.md).
