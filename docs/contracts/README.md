# Contracts

This directory contains the stable contracts shared by the Codex Figma skills, command harness, validators, and reports.

- `schemas/run-context.schema.json` defines the per-run Figma and artifact context.
- `schemas/design-run-report.schema.json` defines the durable Design Run Report output.
- `docs/contracts/run-context.md` explains how to populate and consume the run context.
- `docs/contracts/design-run-report.md` explains Design Run Report field semantics and provisional extension reporting.

The Figma UI Library remains the source of truth. These contracts describe run artifacts and validation output; they are not a permanent Design System manifest.
