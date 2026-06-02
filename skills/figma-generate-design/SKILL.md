---
name: figma-generate-design
description: Turn a brief into Figma frames, screens, and prototypes using discovered library assets under Strict Composition Mode.
---

# figma-generate-design

Use this skill after `/figma-bootstrap-check`, `/figma-discover-library`, and `/figma-map-component-nesting` have produced current run artifacts. The generator is plan-only at this stage: it returns planned Figma operations and validation evidence, but it does not perform live Figma writes and it is not wired into the CLI.

## Inputs

- A customer brief fixture or brief object.
- Current `figma-library-discovery` output from the connected library or fixture mode.
- Current `figma-component-nesting-map` output for the same run.
- Optional `runId` and `now` values for deterministic test output.

## Behavior

1. Normalize the brief into target screen, required capabilities, fields, primary action, and prototype intent.
2. Search discovered components, component sets, variants, slots, approved patterns, examples, variables, and styles before planning output.
3. If the library can satisfy the brief, emit a `figma-design-operation-plan` with `mode: "plan_only"` and operations such as:
   - `create_frame`
   - `create_section`
   - `place_instance`
   - `set_instance_component_property`
   - `fill_slot`
   - `bind_variable`
   - `apply_style`
   - `use_approved_pattern`
   - `create_prototype_connection`
4. Build a generated-node fixture that represents the planned Figma output.
5. Run the shared rule loader before returning `status: "passed"`.
6. Return component, component set, slot, variable, style, approved pattern, final binding, spacing, layout, and rule-check evidence with the plan.

## Strict Composition Rules

- Do not detach instances.
- Do not draw lookalike buttons, fields, icons, cards, or other primitives when a discovered library asset exists.
- Configure variants and text/boolean/instance-swap properties through discovered component property paths.
- Fill nested content through discovered slots only.
- Bind final visual surfaces through discovered variable chains or styles.
- Use approved patterns as composition evidence when available.

## Gap Routing

If no discovered library asset can satisfy a required capability:

1. Return `status: "blocked"` and `planStatus: "requires_provisional_extension_approval"`.
2. Emit a `missing_library_asset` Design System Gap with the search summary, closest matches, why existing assets do not satisfy the brief, and the smallest proposed extension.
3. Emit only routing operations such as `search_library_assets` and `request_provisional_extension_approval`.
4. Do not create provisional output and do not plan live Figma writes until the operator approves the extension flow.

## Module

The implementation lives in `src/generation/design-generator.mjs` and exports:

- `generateDesignPlan(input, options)`
- `DesignGeneratorError`

Targeted fixture tests live in `tests/design-generator.test.mjs`.
