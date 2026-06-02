#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const configPath = resolve(repoRoot, ".codex/config.toml");
const envPath = resolve(repoRoot, ".env");
const envExamplePath = resolve(repoRoot, ".env.example");
const marketplacePath = resolve(repoRoot, ".agents/plugins/marketplace.json");
const pluginManifestPath = resolve(repoRoot, "plugins/figma/.codex-plugin/plugin.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!existsSync(marketplacePath)) {
  fail(`Missing marketplace file: ${marketplacePath}`);
}

if (!existsSync(pluginManifestPath)) {
  fail(`Missing Figma plugin manifest: ${pluginManifestPath}`);
}

let envCreated = false;
if (!existsSync(envPath) && existsSync(envExamplePath)) {
  copyFileSync(envExamplePath, envPath);
  envCreated = true;
}

try {
  execFileSync("codex", ["plugin", "add", "figma@openai-curated"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
} catch (error) {
  const stderr = error.stderr?.toString() ?? "";
  const stdout = error.stdout?.toString() ?? "";
  fail(`Codex could not install the official Figma plugin.\n${stdout}${stderr}`);
}

const config = `suppress_unstable_features_warning = true

[features]
apps = true

[mcp_servers.figma-desktop]
url = "http://127.0.0.1:3845/mcp"

[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"

[mcp_servers.figma_console]
command = "zsh"
args = ["-lc", ${JSON.stringify(`cd ${repoRoot} && set -a && [ -f .env ] && source .env; set +a; exec npx -y figma-console-mcp@latest`)}]
startup_timeout_sec = 30
tool_timeout_sec = 120

[mcp_servers.figma_console.env]
ENABLE_MCP_APPS = "true"

[marketplaces.figma-designer]
last_updated = "2026-06-02T00:00:00Z"
source_type = "local"
source = ${JSON.stringify(repoRoot)}

[plugins."figma@figma-designer"]
enabled = true
`;

const previous = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
if (previous !== config) {
  writeFileSync(configPath, config);
}

let listOutput = "";
try {
  listOutput = execFileSync(
    "codex",
    [
      "mcp",
      "list",
      "-c",
      "mcp_servers.figma-desktop.url=\"http://127.0.0.1:3845/mcp\"",
      "-c",
      "mcp_servers.figma.url=\"https://mcp.figma.com/mcp\"",
      "-c",
      "mcp_servers.figma_console.command=\"zsh\"",
      "-c",
      `mcp_servers.figma_console.args=["-lc",${JSON.stringify(`cd ${repoRoot} && set -a && [ -f .env ] && source .env; set +a; exec npx -y figma-console-mcp@latest`)}]`,
      "-c",
      "mcp_servers.figma_console.env.ENABLE_MCP_APPS=\"true\""
    ],
    { cwd: repoRoot, encoding: "utf8" }
  );
} catch (error) {
  const stderr = error.stderr?.toString() ?? "";
  const stdout = error.stdout?.toString() ?? "";
  fail(`Codex could not list the repo Figma MCP server.\n${stdout}${stderr}`);
}

if (
  !listOutput.includes("figma-desktop") ||
  !listOutput.includes("127.0.0.1:3845/mcp") ||
  !listOutput.includes("figma ") ||
  !listOutput.includes("https://mcp.figma.com/mcp") ||
  !listOutput.includes("figma_console")
) {
  fail(`Codex listed MCP servers, but one or more Figma entries were missing.\n${listOutput}`);
}

console.log("Figma Codex MCP setup is ready for this repository.");
console.log(`Project config: ${configPath}`);
console.log(`Environment file: ${envCreated ? "created" : "found"} ${envPath}`);
console.log(`Marketplace: ${marketplacePath}`);
console.log("Plugin: figma@openai-curated installed and enabled");
console.log("MCP servers: figma-desktop, figma remote, figma_console NPX bridge");
console.log("Next for a fresh file: restart Codex from this repo and ask it to use the figma-first-run skill.");
console.log("Optional non-interactive defaults: set FIGMA_PLAN_KEY, FIGMA_PROJECT_ID, and FIGMA_ACCESS_TOKEN in .env.");
console.log("Existing file fallback: paste FIGMA_FILE_KEY in .env and run npm run figma:bootstrap.");
