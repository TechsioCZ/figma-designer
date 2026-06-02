---
name: figma-screenshot-report
description: Capture screenshot evidence and assemble Design Run Reports.
---

# figma-screenshot-report

Use after generated Figma screens or nodes exist.

Run `createScreenshotReport` from `src/reporting/screenshot-report.mjs`.

Reports must preserve Figma node IDs/links, screenshots, validation issues, component/variable usage, Design System Gaps, provisional extensions, and iteration notes.

Screenshot failures become structured validation issues (`SCREENSHOT_CAPTURE_UNAVAILABLE` or `SCREENSHOT_CAPTURE_FAILED`) instead of silent omissions.

For the durable report contract, see [docs/contracts/design-run-report.md](../../docs/contracts/design-run-report.md).
