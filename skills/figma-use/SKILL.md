---
name: figma-use
description: Base Figma MCP/API access workflow for Codex Figma design runs.
---

# figma-use

Use this skill as the shared access layer for every Figma-facing workflow in this template.

## Access Contract

All bootstrap, discovery, nesting, validation, screenshot, reporting, and iteration workflows should use `src/figma/figma-access.mjs` instead of calling Figma directly.

The access wrapper supports:

- `fixture` mode for local tests and deterministic command behavior.
- `live` mode for Figma REST API access through `FIGMA_ACCESS_TOKEN` and `FIGMA_FILE_KEY`.
- shared error reporting through `FigmaAccessError`.
- file, component, component set, style, variable, and image export reads.

## Environment

Expected live environment values:

```bash
FIGMA_ACCESS_TOKEN=<token>
FIGMA_FILE_KEY=<customer-file-key>
FIGMA_GENERATION_PAGE="Generation Workspace"
FIGMA_LIBRARY_NAME="New Engine Figma UI Library"
```

Set `FIGMA_FIXTURE_PATH` to force fixture mode for local tests.

## Guardrails

The wrapper is transport only. It must not become a Design System manifest, approve provisional extensions, or cache library data beyond the current run.
