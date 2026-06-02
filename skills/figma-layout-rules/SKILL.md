---
name: figma-layout-rules
description: Define page layout, section, container, auto-layout, alignment, resizing, and responsive editability rules.
---

# figma-layout-rules

Read `docs/guardrails/strict-composition.md` before applying this skill. Layout guidance must compose live library assets first and must not use custom layout primitives to hide missing components, slots, variables, or approved patterns.

## Source Of Truth

Use the live Figma file and connected library Assets as the source of truth for approved page examples, containers, responsive behavior, slots, variables, and component patterns. Local fixtures and reports can guide validation, but they are not a permanent design-system manifest.

Before creating or validating layout, confirm that bootstrap, live library discovery, and component nesting discovery have run for the current design run. Use their output to identify approved page examples, container components, slots, and safe instance configuration paths.

## Page Layout

- Create screens inside the Generation Workspace or explicitly approved target area.
- Represent each customer screen as a named top-level page frame with `layoutRole=page` or equivalent run metadata.
- Page frames must use vertical auto layout for normal document flow.
- Direct children of a page frame must be section frames. Do not place loose buttons, fields, cards, headings, or ad hoc wrappers directly on the page.
- Page frames may have a fixed viewport width for the target breakpoint, but their section children must fill or stretch horizontally so later breakpoint work is possible.
- Use approved library examples and page patterns first. If no page pattern exists, build the smallest compliant frame structure and report the missing pattern as a Design System Gap when appropriate.

## Sections

- Sections are the first editable grouping layer under a page.
- Use named section frames for major page regions such as header, main content, forms, summaries, sidebars, footers, and modals when those regions are part of the generated screen.
- Section frames must use vertical auto layout unless a discovered approved pattern explicitly requires another direction.
- Section frames must preserve responsive width behavior: fill or stretch within the page frame unless the operator has approved a fixed-width pattern.
- Section contents should be library instances, slot-filled library components, or compliant container frames that arrange library instances.

## Containers

- Containers organize content inside sections. They are not substitutes for missing cards, panels, fields, navigation, or controls when the library provides those components.
- Container frames must use auto layout when they have structured children.
- Choose container direction from the content model: vertical for stacked content, horizontal for rows and action clusters.
- Do not use absolute positioning to fake alignment, overlays, columns, or slots. If a layout requires absolute positioning because the library lacks a pattern, report a Design System Gap.
- Keep containers editable: unlocked frames with meaningful names, explicit layout roles, and visible auto-layout settings.

## Auto Layout Direction And Alignment

- Page and section frames use `VERTICAL` auto layout.
- Action clusters, toolbars, button groups, and inline controls use `HORIZONTAL` auto layout unless an approved pattern says otherwise.
- Auto-layout frames must define valid primary-axis and counter-axis alignment values so behavior is reproducible.
- Prefer `MIN`/start alignment for stacked page and section flow. Use `SPACE_BETWEEN`, center alignment, or max alignment only when the discovered component pattern or brief requires it.

## Resizing And Responsive Expectations

- Section and container children inside responsive generated frames should fill or stretch on the horizontal axis.
- Use `HUG` sizing for content height unless a discovered component pattern requires fixed height.
- Avoid fixed-width generated containers inside page or section frames unless the breakpoint or approved pattern requires them.
- Preserve component instance resizing behavior. Do not detach instances to force a size; use official component properties, constraints, slots, and resizing controls.
- Validate the frame at the target breakpoint and keep enough responsive metadata for later breakpoint work.

## Editable Frame Structure

- Generated layout frames must remain unlocked and editable.
- Do not flatten, vectorize, group, or boolean-combine layout structure to get a visual result.
- Do not hide missing components with raw rectangles, vectors, and text arranged as a fake button, input, card, table, navigation item, modal, badge, or other UI primitive.
- If the library cannot satisfy a primitive or pattern, report the Design System Gap and ask for approval before creating a Provisional Extension.

## Rule Artifact

The layout rule artifact lives in `src/rules/layout-rules.mjs`.

Use:

```js
import { checkLayoutRules } from "../../src/rules/layout-rules.mjs";

const result = checkLayoutRules(frameFixture, {
  now: "2026-06-02T10:00:00.000Z"
});
```

The result is deterministic for a given fixture and optional timestamp. It includes:

- `ok`
- `summary`
- `rules`
- `violations`
- `designSystemGaps`

Current rule IDs:

- `layout.page-section-structure`
- `layout.auto-layout-required`
- `layout.auto-layout-direction`
- `layout.alignment-defined`
- `layout.responsive-resizing`
- `layout.editable-frame-structure`
- `layout.custom-primitive-hides-gap`

Use these IDs in future validator, report, and iteration wiring instead of re-parsing this skill text.
