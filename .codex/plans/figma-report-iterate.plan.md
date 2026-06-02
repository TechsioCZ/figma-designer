---
name: figma-report-iterate
overview: Implement screenshot capture, structured Design Run Reports, Design System Gap logging, and the iteration workflow that uses validation failures to improve generated Figma output.
todos:
  - id: implement-screenshot-report
    content: Add `/figma-screenshot-report` to capture screenshots of generated frames and attach screenshot references to node IDs, Figma links, validation results, component usage, variable usage, gaps, and iteration notes.
    status: completed
  - id: write-design-run-report
    content: Generate Design Run Reports in machine-readable and operator-readable formats using the shared report schema, including created screens, validation status, screenshots, components, variables, gaps, provisional extensions, and suggested Design System improvements.
    status: completed
  - id: implement-gap-log
    content: Add a Design System Gap log format that can be aggregated later and includes missing asset or pattern evidence, searched alternatives, impact, proposed smallest extension, approval state, and related Figma nodes.
    status: completed
  - id: implement-iterate-design
    content: Add `/figma-iterate-design` to read validation failures, report data, screenshots, and gap notes, then apply approved improvements to the Figma output without weakening Strict Composition Mode.
    status: completed
  - id: add-report-tests
    content: Add report seam tests that verify screenshots, node IDs, Figma links, components used, variables used, validation results, gaps, violations, suggested improvements, and iteration notes are present.
    status: completed
  - id: add-v0-end-to-end
    content: Add a v0 end-to-end scenario where an empty Generation Workspace and connected Figma UI Library produce one customer screen from a brief, validate it, screenshot it, report gaps, and propose the next iteration.
    status: completed
  - id: write-operator-runbook
    content: Document the full operator runbook from brief through bootstrap, discovery, planning, creation, validation, screenshots, reporting, and iteration.
    status: completed
isProject: false
---

# figma-report-iterate

## Execution Notes

This plan closes the loop for designer review and Design System improvement. The Design Run Report is the durable output of a run and should be structured enough for later aggregation while still being readable by an operator.

Iteration must use validation evidence and screenshots to improve the Figma output. It should not bypass approval gates or convert provisional decisions into approved Design System behavior.

## Constraints

Do not implement final Design System promotion workflow for provisional components. Do not add marketplace, SaaS, auth, multi-user, or production export concerns.

Screenshots and reports should be tied to Figma node IDs and links so issues can be inspected directly in Figma.

## Operator Guidance

Run after `figma-generate-validate` has structured validation output. Screenshot and report work can start once the shared report schema exists, but iteration should wait for generator and validator behavior to be available.

Use this lane to prove the PRD v0 success metric: given a connected Figma UI Library and empty Generation Workspace, Codex can create one customer screen from a brief, using library components and variables, without detaching anything, then validate, screenshot, report gaps, and propose the next iteration.
