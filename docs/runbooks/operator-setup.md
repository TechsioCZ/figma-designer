# Operator Setup

This runbook prepares a designer or operator to use the `figma-designer` template for a customer Figma project.

The template owns Codex skills, guardrails, command entrypoints, schemas, reports, gap logs, and the iteration workflow. The Figma UI Library owns design truth. Do not copy library components or variables into this repository as a permanent manifest.

For the full brief-to-iteration sequence, use [Full Run](./full-run.md) after this setup is complete.

## 1. Clone The Template

```bash
git clone <template-repo-url> figma-designer
cd figma-designer
npm install
npm run figma -- --help
```

Prerequisites:

- Node.js 20 or newer.
- npm.
- Codex access to the repository.
- Figma access to the target customer file.
- Figma MCP/API access for live automation.

## 2. Prepare The Figma File

In Figma:

1. Create or open the customer project file.
2. Add a page or frame for generated work, typically named `Generation Workspace`.
3. Connect the New Engine Figma UI Library through Figma Assets.
4. Confirm library components, component sets, variables, styles, and modes are visible from the customer file.
5. Confirm the operator or automation identity can write to the Generation Workspace.
6. Confirm screenshots or exports are allowed for generated frames.

Expected Assets connection:

- the customer file uses the New Engine Figma UI Library as an enabled library;
- Codex can discover components from connected Assets rather than a local manifest;
- missing library access is a bootstrap failure, not permission to draw replacement UI.

## 3. Prepare Environment Values

Live Figma runs should provide a file key, target workspace, expected library name, and capability confirmations from the selected adapter. The CLI loads `.env` from the repository root automatically.

```bash
cp .env.example .env
```

Then edit `.env`:

```dotenv
FIGMA_ACCESS_TOKEN="<token-if-required-by-the-selected-figma-adapter>"
FIGMA_FILE_KEY="<customer-file-key>"
FIGMA_GENERATION_PAGE="Generation Workspace"
FIGMA_LIBRARY_NAME="New Engine Figma UI Library"
FIGMA_LIBRARY_CONNECTED_ASSETS=true
FIGMA_CAN_WRITE=true
FIGMA_CAN_SCREENSHOT=true
FIGMA_BOOTSTRAP_NODE_ID=2:2
```

The `.env` file is ignored by git. Shell environment values override `.env` values when both are present. Use `--env-file <path>` to load a different file, or `--env-file none` to disable `.env` loading.

Keep run-specific cache data ephemeral. A run cache may speed up one discovery, nesting, validation, or report pass, but it must not become a duplicated source of truth for the Design System.

## 4. Operate In Strict Composition Mode

Figma-First Sandbox Mode means Codex uses the connected Figma file and Figma Assets as the design runtime. Strict Composition Mode means generated screens are composed from live design-system assets before anything new is proposed.

Rules for every customer screen:

- use existing Figma Library components first;
- configure component properties and variants through Figma controls;
- place nested content only through supported slots and exposed instance structure;
- use existing variables and preserve primitive -> semantic -> component aliases;
- use approved layout, spacing, text, mode, theme, and prototype patterns from discovery;
- do not detach component instances;
- do not hide missing capabilities behind freehand primitives or lookalike UI;
- do not use local `libs/ui`, screenshots, fixture examples, prior reports, or arbitrary code as design truth unless the operator explicitly changes the run mode.

If the library lacks a needed component, variant, property, slot, variable, style, mode, or pattern, record a Design System Gap before creating a provisional substitute.

## 5. Approval Gates

Codex may create customer screens without asking when the brief can be satisfied with approved live library assets and guardrail-compliant composition.

Codex must stop for operator approval before:

- creating, applying, or normalizing a Provisional Extension;
- introducing a new semantic or component variable;
- using raw final visual values as part of a provisional path;
- changing the connected Design System library;
- waiving a blocking validation issue;
- treating an unresolved Design System Gap as accepted.

Approval records must name the blocked requirement, searched alternatives, smallest proposed extension, variable chain, provisional marking, related node IDs, and expected report entries.

## 6. Verify Local Commands

Use these checks after setup or documentation changes:

```bash
npm run figma -- --help
npm run figma:bootstrap -- --fixture fixtures/bootstrap/success.json
npm run figma:discover -- --fixture fixtures/discovery/live-library.fixture.json
npm run figma:nesting -- --fixture fixtures/discovery/live-library.fixture.json
npm run figma:validate -- --report fixtures/reports/design-run-report.valid.json
npm run figma:report -- --fixture fixtures/reports/design-run-report.valid.json
npm run figma:iterate -- --report fixtures/reports/design-run-report.valid.json
npm run validate:schemas
```

These commands route through `scripts/figma-designer.mjs`. The local fixtures exercise the command surface without requiring a live Figma file.
