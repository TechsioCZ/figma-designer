---
name: figma-spacing-rules
description: Validate spacing roles against discovered variables, styles, examples, and approved patterns.
---

# figma-spacing-rules

Use for forms, field groups, page sections, cards, panels, headers, footers, and interactive clusters.

Run `checkSpacingFixture`, `buildSpacingRuleSet`, or `extractSpacingGuidance` from `src/rules/spacing-rules.mjs`.

Rules:

- Discover spacing guidance from live Figma assets for the current run.
- Prefer semantic variables, component properties, styles, examples, and approved patterns.
- Keep spacing compatible with auto layout.
- Do not encode arbitrary raw spacing as final UI when guidance exists.

If guidance is missing or conflicting, report a Design System Gap.
