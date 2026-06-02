---
name: figma-screenshot-report
description: Capture screenshots and write Design Run Reports with node IDs, links, validation results, usage, gaps, and iteration notes.
---

# figma-screenshot-report

Use this skill after generated Figma screens or nodes are available and before operator review. The module-level helper lives at `src/reporting/screenshot-report.mjs`.

## Module Usage

```js
import { createScreenshotReport } from "../../src/reporting/screenshot-report.mjs";

const { report } = await createScreenshotReport(
  {
    runId,
    figmaFile,
    screens,
    validation,
    componentsUsed,
    variablesUsed,
    designSystemGaps,
    provisionalExtensions,
    iterationNotes,
    screenshotResults
  },
  {
    now,
    purpose: "review",
    theme: "Default",
    mode: "Light"
  }
);
```

`screens` may be generated screen records or raw generated Figma nodes. Each screen is normalized into a Design Run Report `screens[]` entry with a node ref and direct Figma link.

`screenshotResults` is deterministic fixture data from a screenshot/export adapter. Each captured result should include `screenId` or `nodeId`, `path`, and optionally `capturedAt`, `purpose`, `theme`, `mode`, `dimensions`, and `url`. Captured results become schema-shaped `screenshots[]` entries and their IDs are attached to the matching `screens[].screenshotIds`.

For live capture wiring, pass `screenshotAdapter(screen, context)` in options. The adapter can return one result or an array of results for each screen. The CLI is wired separately; keep this module testable without live Figma by passing fixture `screenshotResults`.

## Failure Handling

If no screenshot result is available for a generated screen, the report records a structured `validation.issues[]` item with category `screenshot` and code `SCREENSHOT_CAPTURE_UNAVAILABLE`.

If an adapter throws or returns a failed/unavailable result without a path, the report records `SCREENSHOT_CAPTURE_FAILED`. If a failed result still includes a path, the artifact is kept as a screenshot entry and the failure is also recorded as a validation issue.

The report preserves validation issue references on `screens[].validationIssueIds` where node references match, and passes through component usage, variable usage, Design System gaps, provisional extensions, and iteration notes where available.

## Verification

Run:

```sh
node --test tests/screenshot-report.test.mjs
npm test
```
