---
name: figma-first-run
description: Create and seed a fresh Figma file for this repo, update .env, and run the local checks.
---

# figma-first-run

Use on a fresh clone when the Figma account already has access to the required team/library.

Flow:

1. Run `npm run setup:local`.
2. Use Figma MCP `whoami`; if `.env` has `FIGMA_PLAN_KEY`, use it. If there is one plan, use it. If there are multiple and no env default, ask which plan.
3. Call `create_new_file` with `editorType: "design"` and a useful file name. Use `.env` `FIGMA_PROJECT_ID` when present.
4. Read `scripts/figma-starter-seed.use-figma.js` and pass it to `use_figma` with the new file key.
5. Run `node scripts/update-figma-env.mjs --file-key <key> --file-url <url> --generation-page "Generation Workspace" --bootstrap-node-id <bootstrapNodeId>`.
6. Run `npm run figma:doctor`, then live bootstrap if `FIGMA_ACCESS_TOKEN` is present.

If MCP write tools are missing, stop and fix MCP auth. Do not switch to REST writes.
