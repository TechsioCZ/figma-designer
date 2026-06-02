# Run Cache Contract

`src/cache` manages disposable cache files for one Figma Designer operator run. It is an optimization for repeated discovery, variable, Figma response, and nesting-map lookups during that run only.

The Figma UI Library remains the source of truth. A run cache must never be promoted into a persistent Design System manifest.

## Required Safeguards

Every cache context must be tied to one `runId` and must use:

- `lifetime: "single_run"`
- `disposable: true`

The cache manifest and each artifact envelope also include `sourceOfTruth: false` and a notice that discovery must be refreshed from Figma for later runs.

## Files

`createRunCache(runContext)` creates `run-cache-manifest.json` inside `runContext.artifacts.cache.rootDir`.

Named artifacts are written as JSON envelopes under `artifacts/` in the cache root. Artifact names are generic so discovery, nesting, and validation modules can store their own shapes without this module depending on them.

## Lifecycle

- `createRunCache(context)` creates or reopens the cache for the same `runId`.
- `openRunCache(context)` loads an existing cache and rejects mismatched `runId` values.
- `writeArtifact(name, payload, { metadata })` stores a named JSON payload.
- `readArtifact(name)` returns the named payload and metadata after verifying the artifact belongs to the active run.
- `setMetadata(metadata)` updates run-level cache metadata.
- `cleanupRunCache(context)` removes the cache root only when the manifest matches the active `runId` and retains disposable single-run safeguards.

Deleting the cache must not remove design-system truth, reports, screenshots, or generated Figma output.
