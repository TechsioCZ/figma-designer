---
name: figma-bootstrap-check
description: Verify Figma MCP/API access, write access, connected library assets, variables, screenshots, and report output before a design run.
---

# figma-bootstrap-check

Run this skill before discovery, design generation, validation, screenshots, or reporting. It verifies that the active Figma access path and local report output path are ready for a strict-composition design run.

## Behavior

Use `src/figma/bootstrap-check.mjs`. The module returns one structured result with six checks:

- `figmaAccess`: confirms the shared Figma access wrapper can read the target file.
- `workspaceWrite`: confirms the access path reports write access to the Generation Workspace.
- `libraryAssets`: confirms the expected Figma UI Library is connected as Assets and that components or component sets are discoverable.
- `variables`: confirms Figma variable discovery returns variables.
- `screenshots`: confirms image export works for at least one target node.
- `reportOutput`: confirms the Design Run Report output directory is writable.

Each check has `name`, `status`, `message`, and `details`. Bootstrap succeeds only when all checks pass.

## Usage

```js
import { runBootstrapCheck } from "./src/figma/bootstrap-check.mjs";

const result = await runBootstrapCheck({
  env: process.env,
  runContextPath: "fixtures/run-context/example-run-context.json"
});
```

For fixture-backed local checks:

```js
const result = await runBootstrapCheck({
  fixturePath: "fixtures/bootstrap/success.json",
  reportOutputPath: "reports/bootstrap-check/design-run-report.json"
});
```

The module uses `createFigmaAccess` and `createFigmaAccessFromEnv` from `src/figma/figma-access.mjs`. Set `FIGMA_FIXTURE_PATH` to force fixture mode, or provide live Figma environment values documented by `/figma-use`.

## Failure Handling

Treat any failed check as a hard stop for design generation. The failure messages are written for operator action:

- Missing access means Figma credentials, file key, fixture path, or network/API access must be fixed first.
- Missing write access means the active account cannot safely create or update Generation Workspace nodes.
- Missing library Assets means the New Engine Figma UI Library is not connected in Figma Assets, or discovery returned no assets.
- Missing variables means the library variables are not available to preserve primitive -> semantic -> component chains.
- Missing screenshots means report screenshots cannot be trusted yet.
- Missing report output means local report artifacts cannot be written.

Do not use bootstrap failures as permission to draw replacement UI, detach components, copy library data into a manifest, or bypass strict composition. Fix the Figma setup and rerun bootstrap.

## Local Fixtures

Fixture examples live in `fixtures/bootstrap/`:

- `success.json` covers a connected library, variables, screenshot export, and report output probe.
- `failures.json` covers unavailable write access, disconnected Assets, missing variables, unavailable screenshots, and unavailable report output.

Tests for this skill live in `tests/bootstrap-check.test.mjs`.
