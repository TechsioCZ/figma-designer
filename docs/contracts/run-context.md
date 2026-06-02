# Run Context Contract

`schemas/run-context.schema.json` defines the per-run context passed between Figma Designer skills. It is a routing and evidence contract for one operator run, not a permanent Design System manifest.

The Figma UI Library remains the source of truth. Discovery fields may contain component, node, variable, and style references observed during the run, but those references must be refreshed from Figma for later runs.

## Required Shape

Every run context must include:

- `schemaVersion`: currently `1.0.0`.
- `runId`: shared by cache files, screenshots, and reports for the same run.
- `figmaFile`: the target customer Figma file, including `fileKey` and canonical URL.
- `generationWorkspace`: the page/root/target frames where Codex may create customer screens.
- `libraries`: connected Figma library references, especially the New Engine Figma UI Library connected as Assets.
- `discovery`: live or fixture discovery metadata plus discovered node IDs used during the run.
- `variables`: variable collections and variable references needed for primitive -> semantic -> component chains.
- `screenshots`: planned or captured screenshot outputs for workspace and target frames.
- `artifacts`: repository-relative output paths for reports, screenshots, and disposable run cache files.

## Figma File Identifiers

Use `figmaFile.fileKey` from the target design file URL. Include `branchKey` only when the run intentionally targets a Figma branch. Store raw Figma node IDs in `nodeId` fields, such as `12:34`; URLs may encode node IDs differently, but the contract keeps the raw ID.

## Generation Workspace Targets

`generationWorkspace.page` identifies the Generation Workspace page. `generationWorkspace.root` identifies the frame or section that scopes the run. `generationWorkspace.targets` lists concrete screens or flow frames by run-local `targetId`.

Targets may start as `planned` before creation, then become `created` or `existing` once a Figma node exists. Reports and screenshots should refer back to the same `targetId`.

## Connected Libraries

Each `libraries[]` entry describes a library expected to be connected as Figma Assets. `connectedAsAssets: true` with `status: "connected"` is required before strict composition design generation proceeds. Missing libraries may be represented for bootstrap failure reporting, but generation should stop until the operator fixes Assets.

## Discovered Nodes

`discovery.nodes` contains scoped references discovered or selected during this run: library components, component sets, slot nodes, examples, styles, target frames, and component-property hosts. It should stay small enough to support the current run and must not be treated as a reusable manifest.

Large discovery payloads belong in `artifacts.cache.paths.discovery`; component nesting maps belong in `artifacts.cache.paths.nestingMap`.

## Variable References

`variables.collections` records the collections and modes relevant to the run. `variables.references` records selected or bound variables. When known, `aliasChain` should preserve the expected direction from component variable to semantic variable to primitive variable.

Raw visual values do not belong in run context. If a value must be introduced, it should be represented later as a provisional extension or report finding, not as an approved variable shortcut.

## Screenshots

`screenshots.outputDir` is the default screenshot directory for the run. Each `screenshots.items[]` entry maps a screenshot path to a `targetId` and Figma `nodeId`; entries may be `planned`, `captured`, or `failed`.

Screenshot files are run artifacts. Durable interpretation of screenshot results belongs in the Design Run Report.

## Ephemeral Run Cache

`artifacts.cache` must use `lifetime: "single_run"` and `disposable: true`. Cache paths may store live discovery responses, Figma API/MCP response snippets, variable lookups, and component nesting maps, but deleting them must not delete design-system truth.

Example: `fixtures/run-context/example-run-context.json`.
