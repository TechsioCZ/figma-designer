---
name: figma-validate-design
description: Validate generated Figma output for strict composition, variables, contrast, layout, themes, prototypes, screenshots, and provisional output.
---

# figma-validate-design

Use after generated Figma output and run evidence exist.

Run `validateDesign` or `runValidator` from `src/validation/index.mjs`.

Validation emits report-ready `validation.issues[]` with node links when `figmaFile` is provided. Do not mutate Figma during validation.

Contrast is a hard gate:

- WCAG 2.2 AAA through SC 1.4.6.
- APCA Gold.
- Issue codes: `WCAG22_AAA_CONTRAST_FAILED`, `APCA_GOLD_CONTRAST_FAILED`.
- Preserve `node`, `expected`, `actual`, and `recommendation` so iteration can repair with stronger semantic variables or report a Design System Gap.

Lower fixture or ad hoc thresholds must not weaken the gate. Details: [contrast policy](../../docs/guardrails/contrast-policy.md).
