---
name: figma-template-foundation
overview: Establish the repository structure, shared contracts, schemas, and operator documentation for the Codex Figma Skills Template before feature-specific skills are implemented.
todos:
  - id: define-repo-structure
    content: Create the repository directories for Codex skills, Figma MCP/API workflows, validators, report schemas, run caches, fixtures, screenshots, and design run reports.
    status: completed
  - id: document-strict-composition
    content: Write the core operating rules for Figma-First Sandbox Mode, Strict Composition Mode, live library source of truth, no detaching, slot usage, variable chains, and provisional extension approval.
    status: completed
  - id: define-run-context-contract
    content: Define the run context format for Figma file identifiers, Generation Workspace targets, connected library references, discovered node IDs, variable references, screenshot outputs, and ephemeral run cache paths.
    status: completed
  - id: define-report-schema
    content: Add machine-readable schemas for Design Run Reports, validation issues, component and variable usage, Design System Gaps, Provisional Extensions, screenshots, and iteration notes.
    status: completed
  - id: add-command-harness
    content: Add local commands or scripts that can run bootstrap, discovery, validation, screenshot reporting, and scenario tests against mocked or real Figma access without changing the command surface later.
    status: completed
  - id: write-template-readme
    content: Document the cloneable template workflow, prerequisites, environment setup, expected Figma Assets connection, and the full Brief to Iterate operator loop.
    status: completed
isProject: false
---

# figma-template-foundation

## Execution Notes

This plan turns the PRD into the baseline repository artifact for an operator workbench, not a SaaS product or app builder. The repo should own agent behavior, guardrails, validators, report schemas, prompt patterns, MCP/API workflows, screenshot loops, gap collection, and project bootstrap flow.

The Figma UI Library remains the source of truth. Local files may define contracts and transient cache formats, but they must not become a permanent component or variable manifest.

## Constraints

Keep this repository separate from `new-engine` for the hackathon. Do not add auth, multi-user collaboration, marketplace distribution, production export, or generic HTML/code generation scope.

Avoid implementation choices that require permanent Design System manifests. Any local cache must be scoped to a single run and clearly described as ephemeral.

## Operator Guidance

Run this plan first. The bootstrap, discovery, rule, generation, validation, reporting, and iteration plans depend on the directory structure, run context contract, and report schema defined here.

Use focused implementation agents for later lanes only after the shared contracts are written. Review this lane for scope creep before allowing feature-specific work to add new concepts.
