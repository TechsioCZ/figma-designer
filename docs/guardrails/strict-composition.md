# Strict Composition And Figma-First Guardrails

This document is the foundation rule set for Codex work in Figma. It applies to every design run, validation pass, screenshot report, and iteration loop in this template.

The core principle is simple: the connected Figma UI Library is the design source of truth. Codex composes customer screens from live library assets and records gaps when the library cannot satisfy the brief. It does not invent a parallel design system in local files, generated shapes, or stale manifests.

## Figma-First Sandbox Mode

Figma-First Sandbox Mode means Codex operates against the active Figma file and its connected library Assets. Local repository files may define process, contracts, schemas, reports, and ephemeral run data, but they must not become the design source of truth for components, variables, styles, modes, or approved patterns.

Required behavior:

- Query the live Figma file and connected library Assets at the start of each run.
- Treat discovered components, component sets, variants, properties, slots, variables, styles, modes, examples, and approved patterns as the available design system surface.
- Use local run context and run cache data only as a per-run acceleration layer.
- Re-discover library data for a new run instead of relying on a permanent component or variable manifest.
- Create customer screens in the Generation Workspace or the explicitly approved target area for the run.
- Ignore code UI libraries, application source, or product implementation details unless the operator explicitly changes the run mode.

Prohibited behavior:

- Building from a stale local manifest as if it were the source of truth.
- Treating screenshots, fixture examples, or prior reports as authority over the live Figma library.
- Introducing local-only component names, token names, or pattern rules that are not traceable to live library assets or an approved provisional extension.

## Strict Composition Mode

Strict Composition Mode means Codex must compose with existing design-system assets before creating anything new. The normal answer to a design brief is not freehand drawing; it is instance placement, component property configuration, slot filling, auto-layout arrangement, and variable binding.

Required behavior:

- Search the live library for a matching component, component set, variant, pattern, or example before proposing new UI.
- Place library component instances instead of drawing equivalent primitives.
- Configure instances through official component properties, variants, modes, exposed variables, and documented nested structures.
- Preserve auto layout, constraints, resizing behavior, and editability of the placed library assets.
- Use approved layout and spacing rules from the rule skills after the library structure is understood.
- Include component and variable usage in the Design Run Report.

Prohibited behavior:

- Drawing custom buttons, inputs, cards, navigation, tables, modals, badges, icons, or other UI primitives when an equivalent library component exists.
- Recreating a library component as frames, vectors, text, or raw shapes.
- Overriding instance internals to bypass official properties, variants, slots, or variables.
- Hiding design-system gaps by fabricating lookalike UI.

## Live Library Source Of Truth

The live Figma UI Library owns:

- Components and component sets.
- Variants and component properties.
- Slots and valid nested content positions.
- Variables, styles, modes, collections, and aliases.
- Approved examples and composition patterns.
- Naming, hierarchy, and intended usage signals visible through Figma.

The repository owns:

- Guardrail documents.
- Skill instructions.
- Run context and report contracts.
- Validation and command harness behavior.
- Ephemeral run cache shape.
- Design Run Report storage.

The repository does not own a permanent design-system manifest. Any cached discovery data must be scoped to a run, labeled as ephemeral, and refreshable from live Figma discovery.

## No Detach Rule

Codex must not detach library instances.

Detached instances break maintainability, remove the update path from the library, and hide real design-system gaps. A screen containing detached library components must not pass validation unless the operator has explicitly approved a provisional extension workflow that no longer represents the node as a library instance.

Required behavior:

- Keep placed library components as instances.
- Configure state and appearance through component properties, variants, modes, text overrides, instance swaps, exposed variables, and slot APIs.
- Preserve nested library instances inside composed components.
- Report any operation that would require detaching as a Design System Gap.

Prohibited behavior:

- Detaching an instance to edit internals.
- Duplicating instance internals and editing the duplicate as raw frames.
- Flattening, outlining, or vectorizing components to achieve a visual effect.
- Editing hidden or private component internals when a property, variant, or slot should be used instead.

## Slot Usage

Slots are the only approved way to insert nested content into component instances. If a component exposes a slot, Codex may fill that slot with compatible library instances, approved content components, or allowed text/media content according to the discovered slot contract.

Required behavior:

- Discover slot names, slot locations, accepted content types, nested components, and safe override paths before filling slots.
- Fill nested content through the slot mechanism rather than by drawing inside the instance.
- Use compatible library instances for slot content whenever possible.
- Preserve the host component's auto layout, padding, constraints, and resizing behavior.
- Report missing or incompatible slots as a Design System Gap.

Prohibited behavior:

- Freehand drawing nested UI inside an instance when no slot exists.
- Breaking instance structure to place child nodes.
- Using absolute positioning to fake slot content.
- Filling a slot with a component that violates the discovered slot contract.

## Variable Chains

Codex must preserve Figma variable chains. Final UI values should be bound through the design system's variable structure, not assigned as raw visual values.

The expected chain is:

```text
primitive variables -> semantic variables -> component variables -> component surfaces
```

Required behavior:

- Prefer existing semantic variables before creating new semantic meaning.
- Prefer component variables on top of semantic variables for new component-specific surfaces.
- Preserve aliases from component variables to semantic variables and from semantic variables to primitive variables.
- Respect variable collections and modes, including theme, brand, density, and state modes where present.
- Use variables or styles for color, spacing, radius, typography, effects, and other visual values when the library provides them.
- Record variable usage and any new approved variables in the Design Run Report.

Prohibited behavior:

- Applying raw hex colors, numeric spacing, radius, type sizes, effect values, or one-off style values directly to final UI when a variable or style exists.
- Creating duplicate semantic variables for an existing meaning.
- Binding a component surface directly to a primitive variable when a semantic variable exists for that purpose.
- Breaking variable aliases or mode coverage.

## Raw Values

Raw values are allowed only as temporary working values or as part of an approved provisional extension path. They must not remain as unreported final UI values.

If a raw value appears unavoidable, Codex must:

1. Search for an existing variable, style, component property, or approved pattern that already covers the value.
2. If none exists, report a Design System Gap.
3. Propose the smallest variable-chain addition needed.
4. Ask for approval before creating or using the provisional value in final UI.
5. Bind the final UI through the correct variable chain after approval.
6. Mark the value as provisional and include it in the Design Run Report.

Validation should flag unapproved raw final values as guardrail violations.

## Design System Gaps

A Design System Gap is a missing or insufficient library capability discovered while trying to satisfy a brief under Strict Composition Mode.

Examples include:

- No component exists for a required product pattern.
- A component exists but lacks a needed variant, state, property, or instance swap.
- A component needs nested content but exposes no compatible slot.
- A variable, semantic token, mode, or alias is missing.
- Existing spacing, layout, typography, icon, or content patterns cannot support the brief.
- The library has contradictory examples or unclear source-of-truth naming.

Every gap should include:

- Brief requirement that triggered the gap.
- Live library search performed.
- Closest matching components, variables, styles, or examples found.
- Why the existing asset cannot satisfy the requirement.
- Proposed smallest extension.
- Impact if the gap is not resolved.
- Figma node IDs or links when available.

Gaps are evidence for improving the design system. Codex must not hide gaps by creating untracked lookalike UI.

## Provisional Extensions

A Provisional Extension is a temporary, explicitly approved addition used when the live library cannot satisfy a brief and the operator chooses to proceed.

Provisional Extensions are not a new source of truth. They are marked run artifacts that must later be promoted, changed, or rejected by the design-system owner.

Required behavior:

- Ask for approval before creating a Provisional Extension.
- Create the smallest extension that satisfies the blocked requirement.
- Use the variable chain instead of raw final values.
- Mark provisional nodes visibly and structurally using the naming, annotation, or report fields available to the run.
- Keep provisional work separate from published library components unless the operator explicitly authorizes library changes.
- Include the extension, approval record, node IDs, variables, raw values, and remaining risks in the Design Run Report.

Prohibited behavior:

- Creating provisional components without approval.
- Publishing provisional work into the main library by default.
- Using provisional work to avoid searching existing library assets.
- Leaving provisional nodes indistinguishable from approved library assets.

## Approval Gate

Codex may create customer screens without asking when it can satisfy the brief using approved live library assets and guardrail-compliant composition.

Codex must stop and ask for operator approval before:

- Creating a Provisional Extension.
- Introducing a new component, pattern, variable, style, mode, or raw value for final UI.
- Detaching, flattening, outlining, or otherwise breaking a library instance.
- Editing a published library source component.
- Bypassing a slot contract or creating nested content where no compatible slot exists.
- Proceeding after a required library, variable collection, or mode cannot be discovered.

Approval requests should be concrete and minimal:

- State the blocked requirement.
- Summarize the live library search.
- Name the proposed extension.
- List affected variables, slots, components, and target nodes.
- Explain the expected report entries.
- Ask for a clear approve or reject decision.

If approval is rejected, Codex should use the closest compliant library-only alternative or stop the blocked portion of the design run and record the unresolved gap.

