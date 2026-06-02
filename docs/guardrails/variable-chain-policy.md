# Variable Chain Policy

This policy makes the variable section of Strict Composition Mode enforceable. It applies to generated screens, provisional extensions, validation runs, and Design Run Report entries.

The required chain is:

```text
primitive variables -> semantic variables -> component variables -> component surfaces
```

## Levels

Primitive variables hold raw design values such as color stops, spacing numbers, radius values, type scale values, effect values, booleans, or strings. Primitive variables may resolve to raw values, but final UI nodes should not bind directly to them when semantic meaning exists.

Semantic variables express reusable meaning such as action primary, surface panel, text danger, focus ring, field gap, or radius interactive. Semantic variables must alias primitives and must be reused before creating new semantic meaning.

Component variables expose a component-specific theming surface such as button background primary, auth card background, field border focus, or tab item gap. Component variables should alias semantic variables and are created only when a new or provisional component needs a stable component-level surface.

## Required Behavior

- Discover variables, collections, modes, styles, and aliases from the live Figma UI Library for each run.
- Prefer an existing semantic variable whenever it already expresses the intended meaning.
- Create a new semantic variable only when the meaning is materially missing and the gap is approved through the provisional-extension protocol.
- Use component variables for new component-specific surfaces when the component needs its own theming API.
- Preserve alias links from component variables to semantic variables and from semantic variables to primitive variables.
- Preserve mode coverage across the chain. A chain that works only in one required theme, brand, density, or state mode is broken.
- Record variables used in `variablesUsed[]`, including `level`, `collection`, `mode`, `usageCount`, `boundNodes`, and `aliasChain` where available.

## Prohibited Behavior

- Leaving raw final UI values on generated nodes when a variable or style path exists.
- Binding component surfaces directly to primitive variables when semantic variables cover that meaning.
- Creating duplicate semantic variables with different names for the same meaning or primitive alias target.
- Creating component variables as aliases to primitives when a semantic layer exists.
- Creating one-off local variables without a reported Design System Gap and approval record.
- Breaking aliases or omitting required modes in any chain used by final UI.

## Raw Values

Raw values are allowed only as temporary construction values or as the starting point for an approved variable-chain addition. They must not remain as final UI values.

When a raw value appears unavoidable:

1. Search discovered variables, styles, component properties, examples, and approved patterns.
2. Record a Design System Gap if no existing asset fits.
3. Propose the smallest variable-chain addition needed.
4. Ask for approval before using the value in final UI.
5. Introduce or bind the value at the correct primitive or semantic layer.
6. Expose component-specific surfaces through component variables when needed.
7. Mark and report the result as provisional until the design-system owner promotes, changes, or rejects it.

## Validation Expectations

`src/rules/variable-policy.mjs` provides the R4 validation seam. It should flag:

- `RAW_FINAL_VALUE` for raw color, spacing, radius, typography, or visual values left on final UI.
- `BROKEN_VARIABLE_ALIAS_CHAIN` when component variables do not resolve through semantic and primitive levels, or semantic variables do not resolve to primitives.
- `DUPLICATE_SEMANTIC_VARIABLE` when a proposed semantic variable duplicates existing semantic meaning.
- `COMPONENT_VARIABLE_WITHOUT_NEED` when a proposed component variable does not identify the component-specific surface, bound nodes, or reason that makes it necessary.
- `PRIMITIVE_FINAL_BINDING` when a final component surface binds directly to a primitive despite a semantic variable for that primitive.

These checks do not replace live Figma validation. They define the policy evidence later validators and reports must supply.
