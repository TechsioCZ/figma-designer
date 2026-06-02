# Figma Designer

MCP-first workbench for creating and validating Figma screens from live design-system assets.

Essentials:

- Use npm.
- Use Figma MCP/app tools for Figma inspection, screenshots, and canvas writes.
- Do not use `scripts/figma-designer.mjs` REST paths for design-node writes; they are for bootstrap, discovery, exports, screenshots, reports, and tests.
- Before `use_figma`, load the native `figma-use` skill. For composed screens, also load native `figma-generate-design`.
- On a fresh clone, use `figma-first-run` to create/seed the starter Figma file and update `.env`.
- If deferred Figma tools are missing, search: `select:use_figma,get_screenshot,get_metadata,create_new_file`.
- Keep generated work in the configured `Generation Workspace` unless asked otherwise.
- After repo changes, run `npm test` and `npm run figma:doctor`.

Details live in:

- [Codex Figma MCP setup](docs/runbooks/codex-figma-mcp.md)
- [Strict composition](docs/guardrails/strict-composition.md)
- [Contrast policy](docs/guardrails/contrast-policy.md)
