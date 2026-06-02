# figma-designer

Codex Figma Skills Template for creating customer screens in Figma with strict New Engine Design System composition.

This repository is an operator workbench, not an app builder or Figma plugin. The intended workflow is to clone the template for a customer project, connect the New Engine Figma UI Library in Figma Assets, run bootstrap and discovery, create screens in the Generation Workspace, validate the result, capture a Design Run Report, and iterate.

## Current State

The foundation command surface, contracts, bootstrap checks, live/fixture discovery, component nesting maps, and run cache lifecycle exist. `validate`, `report`, and `iterate` still expose foundation-level behavior that later lanes will deepen without changing operator command names.

Do not treat local files as a permanent Design System manifest. The connected Figma UI Library is the source of truth for components, variants, properties, slots, variables, styles, modes, and examples.

## Prerequisites

- Node.js 20 or newer.
- npm.
- Codex with access to this repository.
- Figma desktop or browser access to the target customer file.
- Figma MCP/API access configured for the operator environment when implementation lanes wire live behavior.
- A Figma customer project with a dedicated Generation Workspace page or frame.
- The New Engine Figma UI Library connected to the customer file through Figma Assets.

## Clone And Setup

```bash
git clone <template-repo-url> figma-designer
cd figma-designer
npm install
npm run setup:local
```

For a customer project, keep customer-specific prompts, reports, screenshots, and run caches outside the shared Design System source of truth. Use this repo to run the workflow and store run artifacts under `reports/` only when they are useful to keep.

`npm run setup:local` installs the repo-local Codex/Figma MCP configuration, creates `.env` from `.env.example` when missing, and runs deterministic fixture checks. It does not need a live Figma file.

## Starter Figma File

The default starter path is MCP-created, not manual `.fig` import. Figma file IDs are account and workspace specific, so plain npm cannot create a cloud file by importing a committed `.fig`; Codex must use Figma MCP after authentication.

Use one of these starter paths:

- Preferred: after `npm run setup:local`, restart Codex and ask it to use `figma-first-run`. Codex creates a new Figma Design file, seeds `Generation Workspace`, updates `.env`, and runs local checks.
- Manual fallback: duplicate or import a starter `.fig` in Figma, then paste the new file key into `.env`.
- Existing project: open the customer file, connect the library in Assets, and paste that file key into `.env`.

## Environment

The command harness supports fixture-backed local runs and live Figma reads. `npm run setup:local` creates `.env` when missing. For live runs, fill in:

```dotenv
FIGMA_ACCESS_TOKEN="<figma-api-token>"
FIGMA_FILE_KEY="<customer-file-key>"
```

Optional hints:

```dotenv
FIGMA_GENERATION_PAGE="Generation Workspace"
FIGMA_LIBRARY_NAME="New Engine Figma UI Library"
```

Live bootstrap assumes write access, connected Assets, and screenshot export are available unless explicitly set to `false` with `FIGMA_CAN_WRITE`, `FIGMA_LIBRARY_CONNECTED_ASSETS`, or `FIGMA_CAN_SCREENSHOT`.
It automatically selects a screenshot probe node from the file; set `FIGMA_BOOTSTRAP_NODE_ID=2:2` only when you want to force a specific node.

Also confirm the Figma file has:

- write access for the operator account or MCP/API integration;
- the New Engine Figma UI Library enabled in Assets;
- a Generation Workspace target for generated screens;
- screenshot/export permissions for the target frames.

## Figma-First Sandbox Mode

In this template, Figma is the design system runtime. Codex must inspect and use the connected Figma Assets instead of relying on local UI code such as `libs/ui`, unless the operator explicitly asks for codebase comparison.

Strict Composition Mode applies to all generated design work:

- use library instances before creating anything new;
- configure variants and component properties through official Figma controls;
- use slots for nested content;
- preserve primitive -> semantic -> component variable chains;
- do not detach components;
- do not draw custom UI primitives unless a Design System Gap is found and a Provisional Extension is explicitly approved.

## Brief To Iterate Loop

Use the package scripts as the stable operator sequence:

```bash
npm run figma:bootstrap
npm run figma:discover
npm run figma:nesting
# Create screens through the Codex Figma skills from the approved brief.
npm run figma:validate
npm run figma:report
npm run figma:iterate
```

The generic command form is also available:

```bash
npm run figma -- bootstrap
npm run figma -- discover
npm run figma -- nesting
npm run figma -- validate
npm run figma -- report
npm run figma -- iterate
```

Expected loop:

1. Write or receive a customer brief.
2. Run bootstrap to verify Figma access, write access, connected Assets, variables, screenshots, and report output.
3. Run live discovery against the connected Figma UI Library.
4. Build an ephemeral component nesting map for the current run.
5. Create Figma screens in the Generation Workspace using library components, variables, slots, and approved patterns.
6. Validate strict composition, variable usage, layout hygiene, contrast, themes, prototypes, and provisional extension usage.
7. Capture screenshots and a Design Run Report.
8. Iterate from validation failures, report evidence, and approved Design System Gap handling.

## Runbooks

Start with [docs/runbooks/README.md](docs/runbooks/README.md), then use [docs/runbooks/operator-setup.md](docs/runbooks/operator-setup.md) for the full setup and command sequence.

## Repository Map

- `skills/`: Codex skill entrypoints for bootstrap, discovery, rules, generation, validation, reporting, and iteration.
- `scripts/figma-designer.mjs`: stable Node command harness.
- `schemas/`: run context and Design Run Report contracts.
- `docs/guardrails/`: operating rules for strict Figma composition.
- `docs/contracts/`: shared contract overview.
- `docs/runbooks/`: operator setup and run sequence.
- `fixtures/`: future mocked bootstrap, discovery, and scenario inputs.
- `reports/`: screenshots and Design Run Reports from useful runs.

## Verification

Check the current command surface with:

```bash
npm run figma -- --help
npm run figma:bootstrap
npm run figma:discover
npm run figma:nesting
npm run figma:validate
npm run figma:report
npm run figma:iterate
npm run validate:schemas
```
