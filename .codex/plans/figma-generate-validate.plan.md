---
name: figma-generate-validate
overview: Build the skills and validators that turn a brief into Figma screens while enforcing Strict Composition Mode and catching design-system, variable, accessibility, layout, theme, and prototype violations.
todos:
  - id: implement-create-design
    content: Add `/figma-generate-design` to turn a brief into frames, screens, and prototypes inside the Generation Workspace using discovered library components, variants, properties, slots, variables, styles, and approved patterns.
    status: completed
  - id: implement-extension-approval-flow
    content: Add the runtime flow that searches existing assets first, logs a Design System Gap, proposes the smallest Provisional Extension, asks for approval, and only then creates provisional Figma output.
    status: completed
  - id: implement-validator-entrypoint
    content: Add `/figma-validate-design` and a validator entrypoint that can inspect generated Figma nodes and emit structured validation results tied to node IDs and links.
    status: completed
  - id: validate-component-integrity
    content: Implement validation for detached components, non-library instances, invalid variant or property usage, unsafe nested content, slot misuse, and unapproved provisional output.
    status: completed
  - id: validate-variables-themes-contrast
    content: Implement validation for raw visual values, broken variable aliases, primitive to semantic to component chain compliance, theme and mode resolution, and contrast expectations.
    status: completed
  - id: validate-layout-spacing-prototype
    content: Implement validation for auto-layout hygiene, resizing behavior, page and form spacing rules, responsive editability, and prototype dead ends.
    status: completed
  - id: add-scenario-tests
    content: Add scenario tests for login, checkout form spacing, dashboard page spacing, missing component approval, slot misuse rejection, raw hex rejection, detach rejection, and theme or mode switching.
    status: completed
isProject: false
---

# figma-generate-validate

## Execution Notes

This plan is the core design run lane. The generator may create customer screens without asking, but it must ask before creating a Provisional Extension.

Validation should inspect externally observable Figma output, not just internal command calls. Reports should identify the created nodes, component instances, variable bindings, gaps, violations, and prototype state.

## Constraints

Do not build a generic AI app generator. Do not export production web app code. Do not detach components. Do not create nested content by freehand drawing inside component instances when slots are available.

If raw values are unavoidable, they must be introduced at the correct primitive or semantic level and exposed through component variables before being used in final UI.

## Operator Guidance

Run after `figma-bootstrap-discovery` and `figma-rule-skills`. The validator can be developed alongside the generator, but both must consume the same run context, discovered library data, and rule artifacts.

This lane is high risk and should use scenario-based tests before any broad refactor. Keep failures structured so the iteration and reporting lanes can consume them.
