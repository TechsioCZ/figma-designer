# Command Harness Contract

The command harness is the stable local entrypoint for the Codex Figma Skills Template. Bootstrap, discovery, and nesting now call the landed fixture/live-capable modules; later lanes should preserve command names and the JSON envelope as validation, reporting, and iteration mature.

## Entry Points

Run commands with:

```bash
npm run figma -- <command> [options]
```

Stable commands:

- `bootstrap`
- `discover`
- `nesting`
- `validate`
- `report`
- `iterate`
- `validate-schemas`

Package script aliases are also provided for each command, including `npm run figma:validate-schemas`.

## JSON Envelope

Every command prints deterministic JSON by default:

```json
{
  "command": "discover",
  "ok": true,
  "harnessVersion": 1,
  "mode": "fixture",
  "options": {},
  "details": {}
}
```

Downstream implementation lanes may change `details`, but should preserve `command`, `ok`, `harnessVersion`, `mode`, and deterministic exit codes.

## Exit Codes

- `0`: command completed successfully.
- `1`: known command failed while reading input or performing local validation.
- `2`: invalid command or invalid arguments.

## Common Options

- `--fixture <path>` reads deterministic JSON fixture input.
- `--run-context <path>` reads a run context JSON file.
- `--report <path>` reads a Design Run Report JSON file.
- `--run-id <id>` identifies a run and enables disposable cache artifact writes for discovery/nesting.
- `--cache-root <path>` overrides the disposable cache directory for commands that write cache artifacts.
- `--output <path>` writes command JSON output to a file.
- `--text` prints a compact text status instead of JSON.

`validate-schemas` parses `schemas/*.schema.json`, checks required schema metadata, verifies local `$ref` targets, checks known fixture contracts, and validates generated report payload shape.
