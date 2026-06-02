---
name: figma-iterate-design
description: Turn validation failures, screenshots, and gap decisions into a safe design iteration plan.
---

# figma-iterate-design

Use after validation and screenshot reporting produce a Design Run Report.

Run `planDesignIteration` from `src/iteration/design-iteration.mjs`.

The planner is plan-only. It must not mutate Figma, detach instances, approve gaps, or weaken strict composition.

Contrast failures (`WCAG22_AAA_CONTRAST_FAILED`, `APCA_GOLD_CONTRAST_FAILED`) route to `bind_existing_variable` with expected/actual/recommendation and node evidence preserved.

Return blocked actions when approval or library capability is missing. Do not invent workarounds.
