# PRD: Codex Figma Skills Template for New Engine Design System

## Problem Statement

Designers need to create new customer designs in Figma using the New Engine Figma UI Library, but the library is still being stress-tested and is not yet complete. The goal is not to build a generic AI app builder. The goal is to make Codex operate inside Figma with strict design-system guardrails, create real customer screens from the connected Figma Library, validate the result, collect gaps, and help improve the Design System.

Today, an agent could easily create “random UI”: detached components, raw colors, arbitrary spacing, invalid layout, broken variable chains, or fake components that do not belong to the system. That would make the output unusable for the designer and would hide real Design System gaps.

The desired workflow is a cloneable skills template repository. A designer or operator creates a new Figma customer project, connects the New Engine Figma UI Library as Assets, opens the template repo with Codex, and runs Figma skills that create, validate, screenshot, report, and iterate.

## Solution

Build an official **Codex Figma Skills Template**: a repository containing skills, rules, validators, report schemas, and MCP/API workflows for working with the New Engine Figma UI Library.

The template is not a SaaS app, marketplace plugin, or polished designer product. It is an operator workbench built around Codex and Figma MCP/API.

The workflow:

**Brief → Figma Bootstrap Check → Live Library Discovery → Component Structure Analysis → Plan → Create in Figma → Validate → Screenshot → Design Run Report → Iterate**

The Figma UI Library is the source of truth. The skills must query Figma live instead of relying on a permanent manifest. Temporary run data is allowed as a Run Cache, but it must not become a duplicated source of truth.

The core behavior is **Strict Composition Mode**:

Codex must use existing Figma Library components, variants, properties, slots, variables, styles, modes, and patterns first. It must not detach components. It must not draw custom UI primitives unless a Design System Gap is found and a Provisional Extension is explicitly approved.

When a new component or pattern is needed, Codex must:

1. Search existing library assets first.
2. Report the Design System Gap.
3. Propose the smallest extension.
4. Ask for approval.
5. Build using the Figma variable chain: primitive variables → semantic variables → component variables.
6. Mark the result as provisional.
7. Include it in the Design Run Report.

## User Stories

1. As a designer, I want to clone a template repo for a new customer design, so that I can reuse the same Figma agent workflow every time.

2. As a designer, I want Codex to use the connected Figma UI Library, so that generated designs stay aligned with our Design System.

3. As a designer, I want Codex to discover components from Figma Assets, so that I do not need to manually select every component or frame.

4. As a designer, I want Codex to understand component nesting, so that it can place complex components correctly.

5. As a designer, I want Codex to understand slots, so that nested content is inserted safely without detaching components.

6. As a designer, I want Codex to never detach components, so that generated designs remain maintainable and updateable from the library.

7. As a designer, I want Codex to inspect Figma variables, so that generated designs use real Design System values.

8. As a designer, I want Codex to preserve primitive → semantic → component variable chains, so that themes remain scalable.

9. As a designer, I want Codex to prefer existing semantic variables, so that new component variables do not duplicate meaning.

10. As a designer, I want Codex to create component variables only when needed, so that new components still have a proper theming surface.

11. As a designer, I want Codex to understand available component properties, so that variants are changed through official controls.

12. As a designer, I want Codex to use auto layout correctly, so that screens remain editable and responsive.

13. As a designer, I want Codex to follow spacing rules, so that generated screens match our page and form layout standards.

14. As a designer, I want Codex to know spacing between form items, so that forms look consistent.

15. As a designer, I want Codex to know page layout spacing, so that customer screens follow our Design System rhythm.

16. As a designer, I want Codex to validate contrast, so that generated designs meet accessibility expectations.

17. As a designer, I want Codex to validate themes and modes, so that light/dark/brand variants do not break.

18. As a designer, I want Codex to screenshot generated results, so that I can review the actual visual output quickly.

19. As a designer, I want Codex to produce a Design Run Report, so that I can see what was created, what failed, and what needs improvement.

20. As a designer, I want Codex to log Design System Gaps, so that we can improve the Figma UI Library over time.

21. As a designer, I want Codex to propose Provisional Extensions, so that missing assets can be handled without polluting the main library.

22. As a designer, I want Provisional Extensions marked clearly, so that they can later be promoted, changed, or rejected.

23. As a designer, I want Codex to create customer screens directly in the Generation Workspace, so that I do not need to manually prepare target frames.

24. As a designer, I want Codex to verify the Figma setup before starting, so that failed MCP/API/library connections are caught early.

25. As a designer, I want Codex to explain when the Figma UI Library is not connected as Assets, so that I can fix setup manually.

26. As an operator, I want a Figma Bootstrap Check, so that I know MCP/API, write access, library assets, variables, and screenshots work.

27. As an operator, I want Live Library Discovery per run, so that Codex uses the current Figma Library instead of stale local data.

28. As an operator, I want an ephemeral Component Nesting Map, so that Codex can navigate components efficiently during a run.

29. As an operator, I want the nesting map to include nested components, slots, variables, and component properties, so that Codex can compose correctly.

30. As an operator, I want validation to catch detached components, so that invalid output cannot silently pass.

31. As an operator, I want validation to catch raw colors, spacing, radius, and type usage, so that output follows variable rules.

32. As an operator, I want validation to catch broken variable aliases, so that themes remain reliable.

33. As an operator, I want validation to catch invalid slot usage, so that nested content remains library-compatible.

34. As an operator, I want validation to catch layout hygiene issues, so that generated screens stay editable.

35. As an operator, I want validation to catch prototype dead ends, so that generated flows are usable.

36. As an operator, I want reports to include node IDs and links, so that issues can be inspected in Figma.

37. As an operator, I want reports to include screenshots, so that visual review does not require hunting through Figma manually.

38. As an operator, I want reports to include components and variables used, so that we can understand library coverage.

39. As an operator, I want reports to include gap data, so that we can prioritize Design System improvements.

40. As an operator, I want reports to include iteration notes, so that each run improves the next one.

41. As a product builder, I want the skills to be official repository artifacts, so that they are versioned, repeatable, and shareable.

42. As a product builder, I want the template repo to be separate from `new-engine` for now, so that hackathon experimentation does not pollute the main repo.

43. As a product builder, I want the template to possibly move into `new-engine` later, so that customer work can eventually live in one ecosystem.

44. As a product builder, I want no auth, multi-user, marketplace, or SaaS scope, so that the hackathon focuses on the Figma workflow.

45. As a product builder, I want Codex rather than Claude Code, so that we use better operational limits for the hackathon.

46. As a product builder, I want the skills to build on `/figma-use`, so that the workflow follows the recommended Figma agent pattern.

47. As a product builder, I want dedicated skills for component usage, layout, spacing, validation, screenshots, and reporting, so that behavior is explicit and reusable.

48. As a product builder, I want the system to stress-test Figma itself, so that missing components, weak patterns, and variable problems are discovered quickly.

## Implementation Decisions

* Build a **Codex Figma Skills Template**, not an app.

* The template repository owns agent behavior: skills, guardrails, validation scripts, prompt patterns, MCP/API workflows, report schemas, screenshot loops, gap collection, and project bootstrap flow.

* The Figma UI Library owns design truth: components, component sets, variables, modes, styles, slots, component properties, examples, and approved patterns.

* Use **Figma-First Sandbox Mode** for the hackathon. Codex ignores `libs/ui` unless explicitly asked.

* Use **Live Library Discovery** instead of a persistent Design System Manifest.

* Allow an ephemeral **Run Cache** during a single run to reduce repeated API/MCP calls.

* Generate an ephemeral **Component Nesting Map** during discovery. It should describe how components nest, where slots exist, what variables are bound, and which component properties are safe to modify.

* Build the workflow around `/figma-use` as the base skill.

* Add a **Figma Bootstrap Check** skill before any design run.

* Add a **Figma Library Discovery** skill that reads components, component sets, variants, properties, slots, variables, modes, styles, examples, and nested component structure.

* Add a **Component Usage Rules** skill that enforces no detaching, slot-only nested content, property-based variants, and safe instance configuration.

* Add a **Layout Rules** skill that explains page layout, sections, containers, auto-layout direction, alignment, resizing, and responsive expectations.

* Add a **Spacing Rules** skill that defines spacing between form items, field groups, page sections, cards, panels, headers, footers, and interactive clusters.

* Add a **Create Design** skill that turns a brief into Figma frames/screens/prototypes using library assets.

* Add a **Validate Design** skill that checks design-system usage, variable chain compliance, contrast, layout hygiene, theme/mode validity, prototype sanity, and provisional extension usage.

* Add a **Screenshot Report** skill that captures visual output and writes the Design Run Report.

* Add an **Iterate Design** skill that reads validation failures and improves the Figma output.

* Codex may create new screens without asking.

* Codex must ask before creating a Provisional Extension.

* Codex must not detach components.

* Codex must not create nested content by freehand drawing inside component instances when a slot should be used.

* Codex must not use raw visual values directly in final UI when a variable chain exists.

* If raw values are unavoidable, they must be introduced at the correct primitive/semantic level, then exposed through component variables.

* Prefer reuse of existing semantic variables before creating new semantic variables.

* Prefer creating component variables on top of semantic variables for new component-specific surfaces.

* Provisional Extensions must be visually and structurally marked as provisional.

* Reports must be structured and machine-readable enough for later aggregation.

## Testing Decisions

Confirmed seams:

1. **Bootstrap seam**
   Tests verify MCP/API connection, write access to the Generation Workspace, connected Figma UI Library availability in Assets, component discovery, variable discovery, screenshot capability, and report output.

2. **Discovery seam**
   Tests verify `/figma-use` and related skills can read components, variants, component properties, slots, nested components, variables, modes, and styles from the Figma UI Library.

3. **Creation seam**
   Tests verify generated designs use library instances, properties, variables, and slots rather than detached or freehand components.

4. **Validation seam**
   Tests verify the validator catches detached components, raw values, broken variable chains, invalid spacing/layout, contrast problems, slot misuse, and broken themes/modes.

5. **Report seam**
   Tests verify each Design Run Report contains screenshots, Figma node links/IDs, components used, variables used, validation results, gaps, violations, suggested Design System improvements, and iteration notes.

Good tests should check external behavior: what Codex creates in Figma, what validations catch, and what reports contain. They should not overfit to internal implementation details of a specific MCP call or local cache format.

The highest-value tests are scenario-based:

* “Create a login screen using only library components.”
* “Create a checkout form and validate spacing between form items.”
* “Create a dashboard page and validate page layout spacing.”
* “Attempt to use a missing component and confirm Codex asks for Provisional Extension approval.”
* “Attempt to create nested content without slots and confirm validation fails.”
* “Attempt to use a raw hex color and confirm variable chain validation fails.”
* “Attempt to detach a component and confirm validation fails.”
* “Switch mode/theme and confirm variable bindings still resolve.”
* “Generate report and confirm it includes screenshots, node IDs, gaps, and violations.”

## Out of Scope

* Production web app export.
* Lovable-style generic app generation.
* Arbitrary HTML/code generation.
* Designer-facing SaaS.
* Authentication.
* Multi-user collaboration.
* Marketplace/plugin distribution.
* Full automation of Figma project creation and library connection.
* Permanent manifest as source of truth.
* Replacing the Figma UI Library.
* Updating `new-engine` repo during the hackathon unless explicitly decided later.
* Governance change between `libs/ui` and Figma.
* Final Design System promotion workflow for provisional components.
* Pixel-perfect implementation export.
* Code Connect automation beyond possible future use.

## Further Notes

The expert recommendation strongly supports official skills as the core artifact.

Important skill rules:

* Start from `/figma-use`.
* Analyze the complete New Engine Figma Design System.
* Build an ephemeral component nesting hierarchy per run.
* Pay explicit attention to connected Figma variables.
* Pay explicit attention to nested components.
* Create skills/custom agent behavior from that understanding.
* Never detach components.
* Use slots for nested content.
* Write explicit layout and spacing skills.
* Encode exact spacing rules for form items and page layout once discovered from the Figma Library or designer guidance.

Suggested initial skill set:

```txt
/figma-use
/figma-bootstrap-check
/figma-discover-library
/figma-map-component-nesting
/figma-component-rules
/figma-layout-rules
/figma-spacing-rules
/figma-generate-design
/figma-validate-design
/figma-screenshot-report
/figma-iterate-design
```

Suggested v0 success metric:

> Given a connected Figma UI Library and empty Generation Workspace, Codex can create one customer screen from a brief, using library components and variables, without detaching anything, then validate, screenshot, report gaps, and propose the next iteration.

