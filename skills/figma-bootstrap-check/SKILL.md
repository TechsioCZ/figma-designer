---
name: figma-bootstrap-check
description: Verify Figma access, workspace write capability, library assets, variables, screenshots, and report output before a design run.
---

# figma-bootstrap-check

Use before discovery, generation, validation, screenshots, or reporting.

Run `runBootstrapCheck` from `src/figma/bootstrap-check.mjs`, or the CLI bootstrap command. Fixture mode is valid for local tests; live mode must prove the target file and connected assets are usable.

Hard stop on any failed check. Do not draw fallback UI, detach components, or bypass strict composition because bootstrap failed.

Expected result shape: one structured payload with `figmaAccess`, `workspaceWrite`, `libraryAssets`, `variables`, `screenshots`, and `reportOutput` checks.

For setup detail, see [docs/runbooks/operator-setup.md](../../docs/runbooks/operator-setup.md).
