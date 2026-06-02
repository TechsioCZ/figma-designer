# Design System Gap Log Contract

`src/reporting/gap-log.mjs` normalizes gap evidence from generators, validators, provisional-extension runtime patches, and existing reports into aggregation-friendly records.

The gap log is evidence only. It does not promote any asset, pattern, variable, style, provisional extension, or other output into the Design System. Every normalized record includes `promotion.promotedToDesignSystem: false`.

## Record Shape

Each record includes:

- `dedupeKey`: stable key derived from normalized category and needed capability, independent of source-specific gap IDs.
- `sources`: generator, validator, provisional runtime, report, or direct input sources that contributed evidence.
- `category`, `originalCategory`, `severity`, `status`, `summary`, and `neededCapability`.
- `evidence.missingAssetOrPattern`, `evidence.searchSummary`, `evidence.whyExistingAssetsDoNotSatisfy`, and optional closest matches.
- `searchedAlternatives`: searched assets, patterns, variables, examples, or other alternatives and why they did not satisfy the need.
- `impact`: why the missing capability matters for Strict Composition Mode.
- `proposedSmallestExtension`: the smallest extension to review, not an approval or promotion.
- `approval`: whether approval is required, pending, approved, rejected, or not required.
- `relatedNodes` / `relatedFigmaNodes`: Figma nodes tied to the gap evidence.

Use `toReportDesignSystemGap()` or `toReportDesignSystemGaps()` to strip helper-only aggregation fields before writing strict `design-run-report.schema.json` records.
