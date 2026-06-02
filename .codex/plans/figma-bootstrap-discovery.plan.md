---
name: figma-bootstrap-discovery
overview: Implement the Figma connection checks, live library discovery workflow, run cache, and ephemeral component nesting map required before Codex can compose customer screens.
todos:
  - id: wrap-figma-use
    content: Create the base `/figma-use` integration wrapper or skill dependency so all Figma actions share the same MCP/API access pattern and error handling.
    status: completed
  - id: implement-bootstrap-check
    content: Add `/figma-bootstrap-check` to verify MCP/API connectivity, write access to the Generation Workspace, connected Figma UI Library Assets, component discovery, variable discovery, screenshot capability, and report output.
    status: completed
  - id: add-bootstrap-tests
    content: Add tests or scripted fixtures for successful bootstrap and failure messages when MCP/API access, write access, library Assets, variables, screenshots, or report output are unavailable.
    status: completed
  - id: implement-live-discovery
    content: Add `/figma-discover-library` to read components, component sets, variants, component properties, slots, variables, modes, styles, examples, and approved patterns from the connected Figma UI Library per run.
    status: completed
  - id: build-nesting-map
    content: Add `/figma-map-component-nesting` to generate an ephemeral Component Nesting Map covering nested components, slots, variable bindings, component properties, and safe instance configuration paths.
    status: completed
  - id: implement-run-cache
    content: Add a per-run cache lifecycle for discovery and nesting outputs, including cache creation, cache lookup, cache cleanup, and safeguards that prevent cache files from becoming a source of truth.
    status: completed
  - id: add-discovery-tests
    content: Add discovery seam tests that verify components, variants, properties, slots, nested components, variables, modes, and styles are read from live or fixture-backed Figma data.
    status: completed
isProject: false
---

# figma-bootstrap-discovery

## Execution Notes

This plan establishes the Figma-first data path. The goal is to catch failed setup before a design run starts and then discover the current connected library state for each run.

The Component Nesting Map is an optimization and reasoning aid for a run. It should describe how components nest, where slots exist, which properties are safe to modify, and how variables are bound.

## Constraints

Do not rely on `libs/ui` unless explicitly asked. Do not create a persistent Design System manifest. Do not assume the Figma UI Library is connected; bootstrap must detect and explain missing Assets setup.

Discovery should support both real Figma access and fixture-backed tests so the repository can validate behavior locally without requiring a live customer file for every test.

## Operator Guidance

Run after `figma-template-foundation`. This plan must land before rule, generation, validation, screenshot, and iteration work that depends on live component, variable, and nesting knowledge.

If using subagents later, assign bootstrap and discovery to one agent because the error handling, run context, and cache lifecycle are tightly coupled.
