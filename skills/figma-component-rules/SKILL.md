---
name: figma-component-rules
description: Enforce component instance usage, no detaching, slot-only nested content, and property-based variant configuration.
---

# figma-component-rules

Read `docs/guardrails/strict-composition.md` before applying this skill. Component usage must preserve live library instances, avoid detaching, fill nested content through slots, and route missing component capabilities through Design System Gaps and approved Provisional Extensions.

## Required Inputs

Use this skill only after live discovery and component nesting analysis have run for the current design run.

- Discovery output from `src/figma/library-discovery.mjs`.
- Component nesting map output from `src/figma/component-nesting-map.mjs`.
- The generated design node tree, report fixture, or validation fixture for the target screens.

The connected Figma UI Library remains the source of truth. Discovery and nesting data are per-run artifacts, not a permanent manifest.

## Rule Module

The deterministic rule implementation lives in `src/rules/component-rules.mjs`.

Use:

```js
import { evaluateComponentRules } from "./src/rules/component-rules.mjs";

const result = evaluateComponentRules({
  discovery,
  nestingMap,
  design
});
```

The result includes `status`, `issues`, and `designSystemGaps`. Blocking issues use report-compatible categories such as `detached_component`, `invalid_slot_usage`, and `component_property`.

## Rules

1. Use library instances.
   - Place discovered library components as Figma instances.
   - Every generated `INSTANCE` must resolve to a component key, component node ID, or component set key from current discovery unless it is an explicitly approved provisional extension.
   - Unknown instances are Design System Gaps, not silent local components.

2. Never detach.
   - Do not detach, flatten, outline, or duplicate internals to edit a library component.
   - If a change seems to require detaching, record the missing property, variant, slot, or component capability as a Design System Gap.

3. Configure variants and state through component properties.
   - Use discovered `safeInstanceConfigurationPaths`.
   - Set variants, booleans, text overrides, and instance swaps through `componentProperties`.
   - Do not write direct variant overrides that bypass property paths.
   - Do not invent property names or values outside the discovered allowed values.

4. Insert nested content through slots only.
   - Use discovered slot names, slot property names, and accepted component keys/component set keys.
   - Use `INSTANCE_SWAP` properties when the slot is property-backed.
   - Do not draw frames, vectors, text groups, or absolute-positioned content inside an instance to fake nested UI.
   - Missing or incompatible slots must be routed to a Design System Gap.

5. Reject unsafe freehand composition.
   - Do not recreate buttons, inputs, cards, navigation, tables, modals, badges, icons, or similar primitives as frames/text/vectors when a discovered library asset exists.
   - If no matching asset exists, stop the blocked portion and record the missing capability as a Design System Gap before proposing a Provisional Extension.

6. Route Design System Gaps.
   - Each blocking component rule violation should include the node, searched library surface, why the discovered assets are insufficient, and the smallest proposed extension.
   - Ask for approval before creating any provisional component, property, variant, or slot.

## Validation Expectations

Run component rules before reporting a screen as strict-composition compliant. A passing result means the checked nodes:

- remain library instances;
- are not detached;
- use property-backed variant/state configuration;
- place nested content through discovered slots;
- avoid unapproved freehand UI composition.
