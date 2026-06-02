# Provisional Extensions

A Provisional Extension is a temporary, explicitly approved addition used only when the live Figma UI Library cannot satisfy a brief under Strict Composition Mode.

It is not design-system truth. It is a run artifact that must later be promoted, changed, or rejected by a design-system owner.

## Approval Gate

Codex must stop and ask before creating or using a Provisional Extension. Approval is required before any new component, pattern, variable, style, mode, raw final value, slot bypass, or detached-like workaround is used in final UI.

An approval request must include:

- The blocked brief requirement.
- The live library search performed.
- Closest matching components, variables, styles, examples, or approved patterns.
- Why those assets cannot satisfy the requirement.
- The smallest proposed extension.
- Affected nodes, slots, component properties, variables, and modes.
- The exact provisional marking.
- The expected Design Run Report entries.
- A clear approve or reject decision point.

If approval is rejected, Codex must use the closest compliant library-only alternative or stop the blocked part of the run and report the unresolved Design System Gap.

## Smallest Extension

The smallest extension is the least new design-system surface that unblocks the brief while preserving future maintainability.

Allowed examples:

- A component variable on top of an existing semantic variable for a provisional component surface.
- A missing semantic variable that aliases an existing primitive when no existing semantic meaning fits.
- A minimal provisional component composed from existing variables, styles, spacing, and approved nested library instances.
- A slot-compatible wrapper only when no approved component exposes the needed slot behavior.

Disallowed examples:

- Recreating a full component family when one variant would unblock the brief.
- Introducing new primitives when an existing primitive can express the value.
- Adding semantic variables with duplicate meaning.
- Publishing provisional work into the main library by default.
- Using provisional work to avoid searching existing library assets.

## Marking

Every Provisional Extension must be clearly marked in both Figma and the report.

Acceptable marking includes:

- A node or component name prefixed with `Provisional`.
- A visible annotation, badge, or description that says the node is provisional.
- A structural grouping or page convention reserved for provisional run artifacts.
- A `provisionalExtensions[].provisionalMarking` report value that explains the visible or structural marking.

Unmarked provisional nodes are validation failures because reviewers cannot distinguish them from approved library assets.

## Variable Chain

Provisional Extensions must use the same variable-chain policy as approved work:

```text
primitive variables -> semantic variables -> component variables -> component surfaces
```

Raw values may start an approved extension only if they are introduced at the correct primitive or semantic level, then exposed through semantic and component aliases as needed. Final UI surfaces must not keep raw values.

The report must include `provisionalExtensions[].variableChain[]` entries with `level`, `variableName`, optional `variableId`, and `aliasesTo` for semantic and component links.

## Report Fields

Every proposed or created extension must be recorded in `provisionalExtensions[]` and tied to a `designSystemGaps[]` entry through `gapId`.

Required fields:

- `id`
- `gapId`
- `status`
- `approval.required`
- `approval.granted`
- `proposal`
- `node`
- `provisionalMarking`
- `variableChain`
- `promotionRecommendation`

Created or approved extensions must also include approval evidence such as `approval.approvedBy` and `approval.approvedAt` when available.

The linked Design System Gap should include `status`, `searchedAlternatives`, `impact`, `provisionalExtensionId`, and `recommendedDesignSystemAction`.

`componentsUsed[]` should mark provisional components with `source: "provisional"`. `variablesUsed[]` should include any primitive, semantic, or component variables introduced or used by the extension.

## Validation Expectations

`src/rules/provisional-extension-policy.mjs` provides the R4 validation seam. It should flag:

- Created or approved extensions without granted approval.
- Missing required report fields.
- Extensions whose `gapId` does not reference a reported Design System Gap.
- Missing provisional marking.
- Variable chains that do not preserve primitive -> semantic -> component order.
- Broken `aliasesTo` links in the reported variable chain.

These checks define the expected evidence for later generator, validator, report, and CLI wiring. They do not implement those later workflow steps.
