# Figma Designer Subagent Graph

## User-Visible Goal

Build the Codex Figma Skills Template from `PRD.md`: skills, rules, validators, schemas, MCP/API workflows, screenshot reporting, gap capture, and iteration workflow for strict design-system composition in Figma.

Do not start implementation until the operator explicitly launches the graph.

## Plan-Backed Handoff Bundle

Plan selection:

```bash
--plans-root ./.codex/plans --glob '*.plan.md'
```

Explicit dependency overlay:

```bash
--depends figma-template-foundation:figma-bootstrap-discovery
--depends figma-template-foundation:figma-rule-skills
--depends figma-bootstrap-discovery:figma-rule-skills
--depends figma-bootstrap-discovery:figma-generate-validate
--depends figma-rule-skills:figma-generate-validate
--depends figma-generate-validate:figma-report-iterate
```

Resolved graph:

- `graph_id`: `figma-bootstrap-discovery-plus-4-plans-cb8918806a`
- `selection_hash`: `cb8918806a`
- `snapshot_path`: `/Users/satan/side/experiments/figma-designer/.codex/plan-graphs/figma-bootstrap-discovery-plus-4-plans-cb8918806a/snapshot.json`
- `state_dir`: `/Users/satan/side/experiments/figma-designer/.codex/plan-graphs/figma-bootstrap-discovery-plus-4-plans-cb8918806a`

Resolved agent budget:

- `max_threads=50`
- `max_depth=3`
- Recommended active write agents: start with 1 to 6, expand to 10 to 14 only after shared contracts stabilize.

## Graph Shape

The plan-backed graph has one runnable root:

```text
figma-template-foundation
  -> figma-bootstrap-discovery
    -> figma-rule-skills
      -> figma-generate-validate
        -> figma-report-iterate
```

There is still substantial parallelism inside each plan once its shared contract owner finishes. The primary agent owns integration, shared interface decisions, final verification, and plan status updates.

## Critical Path

1. Foundation contracts and repo shape.
2. Figma access wrapper, bootstrap check, discovery output, and run cache shape.
3. Rule skills that consume discovered library context.
4. Generator plus validator families.
5. Screenshot/report/iteration loop and v0 end-to-end proof.

Keep the primary agent on shared contracts, integration, dependency gates, and graph steering.

## Wave 0: Foundation Gate

Launch only after the operator says to start.

### Node F0: Foundation Interface Owner

Role: write-capable local owner or one subagent.

Goal: create the repository skeleton and the shared contracts other lanes must depend on.

Dependencies: none.

Inputs and context: `PRD.md`, `.codex/plans/figma-template-foundation.plan.md`.

Write scope: repo scaffolding, shared config, shared schemas directory, shared run context contract, report schema roots, command harness entrypoints. This node is the only owner of shared interfaces during Wave 0.

Required output: directory map, shared contract files, initial command surface, and notes naming which downstream nodes may now write where.

Verification: parse schemas or run lightweight local validation commands if a test harness exists.

Stop condition: stop after shared interfaces and directories exist; do not implement Figma behavior, rule skills, validators, screenshots, or report generation.

## Wave 1: Foundation Fan-Out

Launch after F0 lands and ownership is clear.

### Node F1: Strict Composition Documentation

Role: write-capable worker.

Goal: write the Figma-First Sandbox Mode and Strict Composition Mode rules.

Dependencies: F0.

Write scope: guardrail docs and skill preamble docs only.

Required output: clear rules for live library source of truth, no detach, slots, variable chains, and provisional extension approval.

Verification: markdown links and references resolve.

Do not edit: shared schemas, command harness, Figma MCP/API implementation, validators.

### Node F2: Run Context Contract

Role: write-capable worker.

Goal: finalize run context shape for Figma files, Generation Workspace targets, connected libraries, discovered nodes, variables, screenshots, and ephemeral cache paths.

Dependencies: F0.

Write scope: run context schema/types and focused docs.

Required output: machine-readable contract plus examples.

Verification: schema parse/type checks if available.

Do not edit: report schemas except via explicit handoff to F0 or integration owner.

### Node F3: Report Schema Contract

Role: write-capable worker.

Goal: define Design Run Report, validation issue, gap, provisional extension, screenshot, component usage, variable usage, and iteration note schemas.

Dependencies: F0.

Write scope: report and validation schema files plus examples.

Required output: schema files with valid example fixtures.

Verification: schema parse/fixture validation.

Do not edit: run context schema or command harness.

### Node F4: Command Harness Skeleton

Role: write-capable worker.

Goal: create stable local command entrypoints for bootstrap, discovery, validation, screenshot reporting, and scenario tests using fixtures or stubs.

Dependencies: F0.

Write scope: scripts/CLI harness and package/test config needed for those commands.

Required output: command names and stub implementations that downstream lanes can fill without changing the surface.

Verification: commands run and fail/pass predictably with fixtures.

Do not edit: rule skill content, Figma behavior implementations, report schemas beyond imports.

### Node F5: Template README And Operator Setup

Role: write-capable worker.

Goal: document clone workflow, prerequisites, Figma Assets setup, environment variables, and Brief to Iterate loop.

Dependencies: F0.

Write scope: README and operator setup docs.

Required output: operator-readable setup path that matches the command harness.

Verification: docs reference real paths and commands.

Do not edit: schemas, scripts, validator code, skills.

### Node F6: Foundation Contract Checker

Role: verification-only sidecar.

Goal: independently check Wave 1 artifacts for missing PRD requirements and contract inconsistencies.

Dependencies: F1, F2, F3, F4, F5.

Write scope: none unless asked to produce a short findings file.

Required output: pass/fail findings with exact file references and missing requirements.

Verification: inspect files and run available parse/test commands.

## Wave 2: Bootstrap And Discovery Fan-Out

Launch after foundation is integrated and `figma-bootstrap-discovery` is unblocked.

### Node B1: `/figma-use` Access Wrapper

Role: write-capable worker.

Goal: implement the base Figma MCP/API wrapper, shared error handling, and access abstraction used by bootstrap and discovery.

Dependencies: F0 to F6 integrated.

Write scope: Figma workflow access module and wrapper skill only.

Required output: reusable wrapper with fixture-compatible tests.

Verification: wrapper tests or mocked MCP/API command checks.

Do not edit: bootstrap/discovery business logic except through documented wrapper contracts.

### Node B2: Bootstrap Check Skill

Role: write-capable worker.

Goal: implement `/figma-bootstrap-check` for MCP/API connectivity, write access, connected library Assets, component and variable discovery, screenshots, and report output.

Dependencies: B1 interface available.

Write scope: bootstrap skill, bootstrap command implementation, bootstrap fixtures/tests.

Required output: bootstrap check and helpful failure messages.

Verification: success fixture and missing-setup fixture tests.

Do not edit: live discovery internals, nesting map internals.

### Node B3: Live Library Discovery Skill

Role: write-capable worker.

Goal: implement `/figma-discover-library` for live components, component sets, variants, properties, slots, variables, modes, styles, examples, and approved patterns.

Dependencies: B1 interface available.

Write scope: discovery skill, discovery module, discovery fixtures/tests.

Required output: discovery output matching the run context contract.

Verification: fixture-backed discovery seam tests.

Do not edit: bootstrap checks or nesting map implementation.

### Node B4: Component Nesting Map Skill

Role: write-capable worker.

Goal: implement `/figma-map-component-nesting` using discovery output.

Dependencies: B3 output shape.

Write scope: nesting map skill, nesting mapper, nesting fixtures/tests.

Required output: ephemeral map of nested components, slots, variable bindings, component properties, and safe instance configuration paths.

Verification: nested fixture tests.

Do not edit: discovery wrapper or bootstrap checks.

### Node B5: Run Cache Lifecycle

Role: write-capable worker.

Goal: implement per-run cache creation, lookup, cleanup, and safeguards preventing cache files from becoming source of truth.

Dependencies: F2 run context and B3 discovery output shape.

Write scope: run cache module, cache docs, cache tests.

Required output: cache lifecycle consumed by discovery and nesting.

Verification: cache lifecycle tests, stale-cache rejection tests.

Do not edit: discovery behavior except narrow integration hooks agreed with B3.

### Node B6: Bootstrap/Discovery Integration Checker

Role: verification-only sidecar.

Goal: verify B1 to B5 compose through the command harness and contracts.

Dependencies: B1, B2, B3, B4, B5.

Write scope: none unless asked for a findings file.

Required output: integration findings, failing commands, and contract mismatches.

Verification: run bootstrap/discovery/nesting commands against fixtures.

## Wave 3: Rule Skills Fan-Out

Launch after bootstrap/discovery is integrated and `figma-rule-skills` is unblocked.

### Node R1: Component Usage Rules

Role: write-capable worker.

Goal: author `/figma-component-rules`.

Dependencies: B3/B4 discovered context shape.

Write scope: component rules skill and focused rule tests.

Required output: rules for library instances, no detach, property variants, slots, and unsafe freehand composition.

Verification: rule fixture tests for detach and slot misuse.

### Node R2: Layout Rules

Role: write-capable worker.

Goal: author `/figma-layout-rules`.

Dependencies: foundation docs and discovery context.

Write scope: layout rules skill and focused rule tests.

Required output: rules for page layout, sections, containers, auto-layout, alignment, resizing, and editable frame structure.

Verification: layout rule fixtures or lint checks.

### Node R3: Spacing Rules

Role: write-capable worker.

Goal: author `/figma-spacing-rules`.

Dependencies: foundation docs and discovery context.

Write scope: spacing rules skill and focused rule tests.

Required output: rules for form items, field groups, sections, cards, panels, headers, footers, and interactive clusters.

Verification: spacing fixture tests.

### Node R4: Variable Chain Policy And Provisional Extension Protocol

Role: write-capable worker.

Goal: encode variable-chain rules and the provisional extension approval protocol.

Dependencies: F2/F3 schemas and discovery context.

Write scope: variable policy docs/skill content, provisional extension protocol, examples.

Required output: enforceable policy and approval gate format.

Verification: raw value, alias, and unapproved provisional fixtures.

### Node R5: Rule Loading Workflow

Role: write-capable worker.

Goal: wire the rule skills so generation, validation, screenshot reporting, and iteration load the same rule set and discovered context.

Dependencies: R1, R2, R3, R4.

Write scope: rule loader module, rule registry, loader tests.

Required output: shared loader with stable API.

Verification: all rule skills load through one path.

### Node R6: Rule Consistency Checker

Role: verification-only sidecar.

Goal: check rules against PRD requirements and discovery contracts.

Dependencies: R1, R2, R3, R4, R5.

Write scope: none unless asked for findings.

Required output: missing rules, contradictions, and integration risks.

Verification: run rule tests and inspect skill content.

## Wave 4: Generate And Validate Fan-Out

Launch after bootstrap/discovery and rule skills are integrated.

### Node G1: Generate Design Skill

Role: write-capable worker.

Goal: implement `/figma-generate-design` to turn briefs into Figma frames/screens/prototypes using discovered library assets.

Dependencies: B1 to B5, R5.

Write scope: generation skill and generator module.

Required output: fixture-backed generator flow that uses library components, variants, slots, variables, styles, and approved patterns.

Verification: generation fixture tests.

### Node G2: Provisional Extension Runtime

Role: write-capable worker.

Goal: implement search-first gap logging, smallest-extension proposal, approval gate, and provisional output creation.

Dependencies: F3, R4, G1 integration contract.

Write scope: provisional extension runtime and tests.

Required output: approval-gated extension flow.

Verification: missing-component scenario requests approval before writing provisional output.

### Node G3: Validator Entrypoint

Role: write-capable worker.

Goal: implement `/figma-validate-design` entrypoint and structured result emission tied to Figma node IDs and links.

Dependencies: F3 report/validation schemas, B1 access wrapper.

Write scope: validator command, validator orchestration, result serializer.

Required output: validator runner that dispatches individual validation families.

Verification: validator command fixture tests.

### Node G4: Component Integrity Validator

Role: write-capable worker.

Goal: validate detached components, non-library instances, invalid variants/properties, unsafe nested content, slot misuse, and unapproved provisional output.

Dependencies: G3 result contract, R1/R4 rules.

Write scope: component integrity validator and tests.

Required output: validation family with fixtures for detach, slot misuse, and provisional violations.

Verification: focused validator tests.

### Node G5: Variables, Themes, And Contrast Validator

Role: write-capable worker.

Goal: validate raw visual values, broken aliases, variable-chain compliance, theme/mode resolution, and contrast expectations.

Dependencies: G3 result contract, R4 policy.

Write scope: variable/theme/contrast validator and tests.

Required output: validation family with raw hex, alias, mode, and contrast fixtures.

Verification: focused validator tests.

### Node G6: Layout, Spacing, And Prototype Validator

Role: write-capable worker.

Goal: validate auto-layout hygiene, resizing, page/form spacing, responsive editability, and prototype dead ends.

Dependencies: G3 result contract, R2/R3 rules.

Write scope: layout/spacing/prototype validator and tests.

Required output: validation family with layout, spacing, and prototype fixtures.

Verification: focused validator tests.

### Node G7: Scenario Test Suite

Role: write-capable worker.

Goal: add scenario tests for login, checkout spacing, dashboard spacing, missing component approval, slot misuse, raw hex, detach, and theme/mode switching.

Dependencies: G1 to G6.

Write scope: scenario fixtures and tests.

Required output: scenario suite covering PRD v0 and highest-value failures.

Verification: scenario tests run through command harness.

### Node G8: Generate/Validate Integration Checker

Role: verification-only sidecar.

Goal: independently run and challenge the full generation plus validation flow.

Dependencies: G1 to G7.

Write scope: none unless asked for findings.

Required output: pass/fail evidence, missed PRD requirements, and flaky or weak scenarios.

Verification: run generator, validator, and scenario commands.

## Wave 5: Report And Iterate Fan-Out

Launch after generate/validate is integrated.

### Node I1: Screenshot Report Skill

Role: write-capable worker.

Goal: implement `/figma-screenshot-report`.

Dependencies: G3 validation output and F3 report schema.

Write scope: screenshot capture workflow, screenshot report skill, screenshot tests.

Required output: screenshot references tied to node IDs, links, validations, components, variables, gaps, and notes.

Verification: screenshot fixture/report tests.

### Node I2: Design Run Report Writer

Role: write-capable worker.

Goal: generate machine-readable and operator-readable Design Run Reports.

Dependencies: F3 schema, G3 validation output, I1 screenshot references.

Write scope: report writer and report tests.

Required output: complete report containing created screens, validation status, screenshots, usage, gaps, provisional extensions, and suggested improvements.

Verification: report schema and fixture tests.

### Node I3: Design System Gap Log

Role: write-capable worker.

Goal: implement aggregate-ready gap log format.

Dependencies: F3 schema and G2 provisional runtime.

Write scope: gap log writer, schema examples, tests.

Required output: gap entries with searched alternatives, evidence, impact, proposal, approval state, and nodes.

Verification: gap fixture tests.

### Node I4: Iterate Design Skill

Role: write-capable worker.

Goal: implement `/figma-iterate-design` using validation failures, report data, screenshots, and gap notes.

Dependencies: G1 to G6, I2, I3.

Write scope: iteration skill, iteration workflow, tests.

Required output: iteration flow that applies approved improvements without weakening Strict Composition Mode.

Verification: iteration fixture tests.

### Node I5: V0 End-To-End Scenario

Role: write-capable worker.

Goal: prove the v0 success metric end to end.

Dependencies: I1 to I4, G7.

Write scope: e2e scenario fixtures/tests and final run artifact examples.

Required output: one customer screen flow from brief through validate, screenshot, report gaps, and next iteration proposal.

Verification: e2e command.

### Node I6: Operator Runbook

Role: write-capable worker.

Goal: document the full operator runbook from brief through iteration.

Dependencies: I1 to I5.

Write scope: operator runbook docs only.

Required output: accurate commands, setup notes, failure handling, and expected artifacts.

Verification: docs reference real commands and paths.

### Node I7: Final Graph Verification

Role: verification-only sidecar.

Goal: verify the completed template against the PRD and all plan todos.

Dependencies: all implementation nodes.

Write scope: none unless asked for a findings file.

Required output: PRD coverage matrix, command results, residual risk, and recommended final fixes.

Verification: run full test suite, validate schemas, inspect generated reports.

## Conflict-Risk Map

Shared interfaces with single-owner rules:

- Shared run context schema: F2 owns during Wave 1; later changes route through primary integration.
- Report and validation schemas: F3 owns during Wave 1; later changes route through primary integration.
- Command harness and package/test config: F4 owns during Wave 1; later changes route through primary integration.
- Figma access wrapper: B1 owns during Wave 2; downstream nodes consume it.
- Rule loader/registry: R5 owns during Wave 3; downstream nodes consume it.
- Validator entrypoint/result serializer: G3 owns during Wave 4; validation-family nodes consume it.

Concurrent writes are disallowed in these hotspots unless ownership is explicitly reassigned:

- root config files
- package/test configuration
- shared schema/type files
- central command registry
- central skill registry
- Figma access wrapper
- rule loader
- validator entrypoint
- report writer public API

## Merge Points

1. After F0: confirm exact file ownership for Wave 1.
2. After F1 to F5: integrate foundation, run schema/docs/command checks, then unblock bootstrap/discovery.
3. After B1 to B5: run bootstrap/discovery/nesting integration checks, then unblock rules and generation prerequisites.
4. After R1 to R5: run rule consistency checks, then unblock generator and validators.
5. After G1 to G7: run generate/validate integration checks, then unblock reporting/iteration.
6. After I1 to I6: run final PRD coverage and v0 e2e verification.

## Launch Policy

Do not launch any agent until the operator explicitly says to start.

When starting, launch F0 first. After F0 returns and integration confirms ownership boundaries, launch F1 to F5 in parallel and F6 after those land.

With the resolved thread budget, later waves can run many disjoint workers at once, but only after their dependency gates are satisfied. Prefer stopping at the next merge point over letting downstream agents speculate against unstable contracts.
