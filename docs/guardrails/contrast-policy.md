# Contrast Policy

Generated Figma output must satisfy both contrast gates before a design run can pass:

- WCAG 2.2 AAA text contrast through SC 1.4.6 Contrast (Enhanced).
- APCA Readability Criterion Gold as this repository's forward-looking perceptual contrast gate.

WCAG AAA is enforced as:

- Normal text: contrast ratio at least `7.00:1`.
- Large text: contrast ratio at least `4.50:1`.

APCA Gold is enforced as:

- Body, fluent, and unknown text: at least `Lc 90`.
- Large, sub-fluent, spot, placeholder, and disabled text: at least `Lc 75`.
- Logos and non-text contrast checks: at least `Lc 60`.

Lower fixture or report thresholds do not weaken these requirements. A check may request a stricter value, but not a weaker value.

Validation emits separate machine-readable issues for each failed gate:

- `WCAG22_AAA_CONTRAST_FAILED`
- `APCA_GOLD_CONTRAST_FAILED`

Iteration planning maps both issues to existing variable repair work. Agents must first use stronger existing semantic text/surface variables. If no existing variable pair passes both gates, they must report an accessibility Design System Gap before introducing or proposing any new token.
