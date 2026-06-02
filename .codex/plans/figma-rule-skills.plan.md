---
name: figma-rule-skills
overview: Author the explicit Codex skills and rule artifacts that enforce component usage, layout, spacing, variable-chain, and provisional-extension behavior during Figma design runs.
todos:
  - id: author-component-rules
    content: Add `/figma-component-rules` with rules for using library instances, avoiding detaches, configuring variants through component properties, placing nested content through slots, and detecting unsafe freehand composition.
    status: completed
  - id: author-layout-rules
    content: Add `/figma-layout-rules` with rules for page layout, sections, containers, auto-layout direction, alignment, resizing behavior, responsive expectations, and editable frame structure.
    status: completed
  - id: author-spacing-rules
    content: Add `/figma-spacing-rules` with rules for spacing between form items, field groups, page sections, cards, panels, headers, footers, and interactive control clusters.
    status: completed
  - id: encode-variable-chain-policy
    content: Define enforceable guidance for primitive to semantic to component variables, preferring existing semantic variables, creating component variables only when needed, and rejecting raw final UI values when variable chains exist.
    status: completed
  - id: define-provisional-extension-protocol
    content: Document the required approval gate, smallest-extension proposal format, provisional visual and structural marking, variable-chain requirements, and report fields for Provisional Extensions.
    status: completed
  - id: add-rule-loading-workflow
    content: Wire the rule skills so generation, validation, screenshot reporting, and iteration can load the same rule set and discovered library context without duplicating rule text.
    status: completed
  - id: add-rule-tests
    content: Add tests or fixtures that prove the rules reject detaches, invalid slot usage, raw colors, broken variable chains, invalid spacing, and unapproved Provisional Extensions.
    status: completed
isProject: false
---

# figma-rule-skills

## Execution Notes

This plan converts the PRD guardrails into reusable Codex skills. The skills should make behavior explicit for operators and implementation agents instead of burying policy inside one generator script.

Rule files should be specific enough to guide Figma work, but flexible where values must be discovered from the connected library or provided by designer guidance. Exact spacing values belong in the discovered context or approved rules once known.

## Constraints

Do not invent missing Design System values as final UI decisions. When a required component, pattern, or variable is missing, the workflow must report a Design System Gap and request approval before creating a Provisional Extension.

Do not permit detached components or freehand nested content inside instances when a slot is required.

## Operator Guidance

Run after `figma-template-foundation` and after enough of `figma-bootstrap-discovery` exists to supply discovered library context. Generation, validation, reporting, and iteration should all depend on these rules.

This lane can be implemented in parallel with late discovery tests only if the shared run context and discovery output shape are already stable.
