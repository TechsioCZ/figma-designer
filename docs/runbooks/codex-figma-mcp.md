# Codex Figma MCP Setup

This repo vendors the Figma Codex plugin under `plugins/figma`, exposes it through `.agents/plugins/marketplace.json`, and configures three Figma MCP routes in `.codex/config.toml`.

## Setup

Run this from the repository root:

```bash
npm run setup:figma-codex
```

The script updates `.codex/config.toml` in this repository, creates `.env` from `.env.example` when missing, and installs/enables the official `figma@openai-curated` Codex plugin. The plugin install is required for Figma app-backed skills and write tools such as `use_figma`.

For a full local smoke test that does not require live Figma access, run:

```bash
npm run figma:doctor
```

It configures:

- `figma-desktop`: `http://127.0.0.1:3845/mcp`
- `figma`: `https://mcp.figma.com/mcp`
- `figma_console`: third-party `figma-console-mcp@latest` over stdio
- `figma@openai-curated`: official Codex Figma plugin/app connector

On macOS, the `figma_console` server is configured as:

```toml
[mcp_servers.figma_console]
command = "zsh"
args = ["-lc", "cd <repo> && set -a && [ -f .env ] && source .env; set +a; exec npx -y figma-console-mcp@latest"]
startup_timeout_sec = 30
tool_timeout_sec = 120

[mcp_servers.figma_console.env]
ENABLE_MCP_APPS = "true"
```

This is the macOS equivalent of the Windows `cmd /c npx.cmd -y figma-console-mcp@latest` config. It sources this repo's `.env` so `FIGMA_ACCESS_TOKEN` is available without committing the token to `.codex/config.toml`.

## Restart

After setup, restart the Codex session from this repository so project config and MCP tools are loaded.

For the local desktop server, open Figma Desktop, open a Design file, switch to Dev Mode with `Shift+D`, and click **Enable desktop MCP server** in the Inspect panel. Figma runs that server locally at `http://127.0.0.1:3845/mcp`.

Figma Desktop MCP exposes read/context tools such as metadata, design context, variables, and screenshots. It is expected to expose only desktop tools like `get_metadata`, `get_design_context`, `get_variable_defs`, and `get_screenshot`.

Write-to-canvas tools such as `use_figma`, `create_new_file`, `search_design_system`, and `generate_figma_design` come from the remote Figma MCP server / Codex Figma app connector. Figma documents the Codex app plugin flow as the preferred setup path:

1. Open the Codex app.
2. Click **Plugins** in the upper-left corner.
3. Click **+** next to **Figma**.
4. Click **Install Figma**.
5. Complete the Figma authentication flow and allow access.
6. Restart Codex from this repository.

The manual CLI setup is:

```bash
codex mcp add figma --url https://mcp.figma.com/mcp
codex mcp login figma
```

As of Codex CLI `0.132.0` through at least `0.136.0`, this can fail with:

```text
Registration failed: HTTP 400 Bad Request: {"error":"invalid_redirect_uri"}
```

That is a known Codex CLI OAuth issue, not a Figma Desktop MCP issue and not a repository setup issue. The current practical workarounds are:

- Use the Codex app plugin authentication flow, then return to CLI.
- Downgrade Codex CLI to a version where the redirect worked for your environment; one public issue reports `0.129.0` as a working rollback.
- Wait for a Codex CLI fix for Figma OAuth redirect URI handling.

The `figma_console` route is a separate third-party MCP server from `southleft/figma-console-mcp`. Its npm package advertises write-capable tools through NPX/Local Git mode, using `FIGMA_ACCESS_TOKEN` and `ENABLE_MCP_APPS=true`. Some write paths may still require its Figma-side Desktop Bridge setup or cloud pairing, depending on which tool is used.

## Starter Files

For template use, a starter Figma file is helpful, but it should be disposable. The repo may carry starter instructions or an optional `.fig` artifact for manual import, but the cloud file key is created by Figma and belongs to the target account/workspace.

Recommended default:

1. Authenticate the Figma MCP/app connector.
2. Run `npm run setup:local`.
3. Restart Codex from this repository.
4. Ask Codex to use `figma-first-run`.

The skill calls `create_new_file`, seeds the file with `scripts/figma-starter-seed.use-figma.js`, updates `.env` through `scripts/update-figma-env.mjs`, and runs local checks. Set `FIGMA_PLAN_KEY` and optionally `FIGMA_PROJECT_ID` in `.env` to make plan/project selection non-interactive.

Manual fallback:

1. Import or duplicate a starter `.fig` in Figma.
2. Open the new file.
3. Paste its file key into `.env`.

Do not treat committed `.fig` binaries, screenshots, or fixture JSON as the design-system source of truth. Connected Figma Assets remain authoritative.

## Verify

In the restarted session, desktop Figma tools should be discoverable. Ask Codex to inspect Figma, or have it search for:

```text
select:get_screenshot,get_metadata,get_design_context,get_variable_defs
```

For Figma writes, the remote connector must also expose `use_figma`. Search for:

```text
select:use_figma,create_new_file,search_design_system,generate_figma_design
```

Also search for the third-party console tools:

```text
figma_console create frame component variable
```

If only `mcp__figma_desktop.*` tools appear, the desktop server is working but write-to-canvas is not available in that session.

Run the local harness doctor anytime after setup:

```bash
npm run figma:doctor
```

For Figma writes, Codex must use `figma-use` before `use_figma`. For composed screen generation, it must also use `figma-generate-design`.

## Requirements

- Figma Desktop is running.
- The target Figma file is open.
- Your Figma account has edit access to the file.
- App-backed Codex tools are enabled by this repo's `.codex/config.toml`.
- Desktop Figma MCP is enabled in Figma Dev Mode when using the local server.
- The official `figma@openai-curated` Codex plugin is installed.
- Remote Figma MCP / Codex Figma app connector is authenticated before expecting `use_figma`.
- `.env` contains `FIGMA_ACCESS_TOKEN` for `figma_console`.

The existing `.env` and REST harness are still useful for bootstrap/discovery/export checks, but REST cannot create or edit arbitrary Figma design nodes. Actual design edits need the Figma MCP/app tool.
