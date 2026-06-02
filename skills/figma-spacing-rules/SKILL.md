---
name: figma-spacing-rules
description: Define form, field group, page section, card, panel, header, footer, and interactive cluster spacing rules.
---

# figma-spacing-rules

Read `docs/guardrails/strict-composition.md` before applying this skill. Spacing guidance must use discovered variables, styles, component properties, and approved patterns before introducing any raw final values or provisional spacing extensions.

## Source Of Truth

Use live Figma discovery for spacing variables, styles, examples, and approved patterns. Local fixtures and reports are only evidence for tests or prior runs; they are not a permanent spacing manifest.

Implementation artifact: `src/rules/spacing-rules.mjs`.

Exported checks:

- `spacingRuleDefinitions`: required composition roles and spacing relationships.
- `extractSpacingGuidance(context)`: derives discovered spacing variables and approved spacing patterns from discovery-shaped context.
- `buildSpacingRuleSet(context)`: returns the rule set plus discovered spacing guidance.
- `checkSpacingFixture(fixture, options)`: deterministic fixture checker that separates guardrail violations from Design System Gaps.

## Required Spacing Roles

Apply spacing guidance for these roles before generating, validating, reporting, or iterating a design:

- `form_item`: label-to-control, control-to-help/error, and item-to-item spacing.
- `field_group`: related field groups, fieldsets, inline fields, and field stack spacing.
- `page_section`: section-to-section rhythm, section padding, and container gutters.
- `card`: card padding, content gaps, and card grid/list gaps.
- `panel`: panel padding, panel section gaps, and panel content stack gaps.
- `header`: header padding, title/action gaps, metadata spacing, and toolbar spacing.
- `footer`: footer padding, supporting content gaps, and terminal action spacing.
- `interactive_cluster`: button groups, control groups, icon-label gaps, and adjacent interactive controls.

## Rule Application

1. Discover spacing variables and approved patterns from the connected Figma UI Library for the current run.
2. Prefer approved component properties, spacing variables, styles, and examples over any raw numeric value.
3. Bind final spacing through discovered variables or approved patterns when available.
4. Preserve variable chains. Prefer semantic spacing variables over direct primitive bindings when semantic variables exist.
5. Keep spacing decisions compatible with auto layout so generated screens remain editable and responsive.
6. Include discovered spacing variables, approved patterns used, violations, and gaps in the Design Run Report.

## Raw Values

Raw spacing values are not valid final UI decisions under Strict Composition Mode when spacing variables or approved patterns can satisfy the role.

If a raw value appears unavoidable:

1. Search discovered spacing variables, styles, component properties, examples, and approved patterns.
2. If no support exists, record a Design System Gap.
3. Propose the smallest semantic or component spacing addition.
4. Ask for approval before creating a Provisional Extension.
5. Bind the final UI through the approved variable chain after approval.

## Design System Gaps

Route missing spacing guidance as a Design System Gap when:

- No discovered variable or approved pattern supports the needed role.
- A referenced spacing variable is missing from live discovery.
- A referenced approved spacing pattern is missing from live discovery.
- Existing spacing examples conflict or are too ambiguous to apply safely.
- A component needs form, page, card, panel, header, footer, or interactive-cluster spacing but exposes no compatible property or pattern.

Do not hide these gaps by drawing extra spacer frames, applying arbitrary auto-layout gaps, or encoding raw padding/margins as final values.

## Fixture Shape For Tests

Spacing tests may use deterministic fixture objects with this shape:

```js
{
  spacingGuidance: {
    variables: [{ variableId, name, type: "FLOAT", appliesTo: ["form_item"] }],
    patterns: [{ patternId, name, spacingRole: "page_section", spacing: {} }]
  },
  nodes: [
    {
      nodeId,
      name,
      role: "form_item",
      relationships: [
        { kind: "item_to_item", variableId },
        { kind: "section_to_section", patternId },
        { kind: "button_group_gap", rawValue: 18 }
      ]
    }
  ]
}
```

The checker accepts common aliases such as `spacingRole`, `spacingRelationships`, and object-form `spacing` maps, but generated reports should use stable role names from this skill.
