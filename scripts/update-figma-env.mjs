#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export function parseArgs(args) {
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const value = inlineValue ?? args[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${rawKey}`);
    }

    options[rawKey.replaceAll("-", "_")] = value;

    if (inlineValue === undefined) {
      index += 1;
    }
  }

  return options;
}

export function formatEnvValue(value) {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

export function upsertEnvValues(content, updates) {
  const lines = content ? content.replace(/\r\n/g, "\n").split("\n") : [];
  const remaining = new Map(
    Object.entries(updates).filter(([, value]) => value !== undefined && value !== "")
  );

  const nextLines = lines.map((line) => {
    for (const [key, value] of remaining) {
      const pattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`);
      if (pattern.test(line)) {
        remaining.delete(key);
        return `${key}=${formatEnvValue(value)}`;
      }
    }

    return line;
  });

  if (remaining.size > 0 && nextLines.length > 0 && nextLines.at(-1) !== "") {
    nextLines.push("");
  }

  for (const [key, value] of remaining) {
    nextLines.push(`${key}=${formatEnvValue(value)}`);
  }

  return `${nextLines.join("\n").replace(/\n+$/, "")}\n`;
}

export function updateFigmaEnvFile(envPath, updates) {
  const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const next = upsertEnvValues(current, updates);
  writeFileSync(envPath, next);
  return next;
}

export function updatesFromOptions(options) {
  return {
    FIGMA_FILE_KEY: options.file_key,
    FIGMA_FILE_URL: options.file_url,
    FIGMA_GENERATION_PAGE: options.generation_page,
    FIGMA_BOOTSTRAP_NODE_ID: options.bootstrap_node_id
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
      console.log(`Usage: node scripts/update-figma-env.mjs [options]

Options:
  --file-key <key>              Set FIGMA_FILE_KEY
  --file-url <url>              Set FIGMA_FILE_URL
  --generation-page <name>      Set FIGMA_GENERATION_PAGE
  --bootstrap-node-id <id>      Set FIGMA_BOOTSTRAP_NODE_ID
  --env-file <path>             Env file path, defaults to .env
`);
      process.exit(0);
    }

    const updates = updatesFromOptions(options);

    if (Object.values(updates).every((value) => !value)) {
      throw new Error("Pass at least one of --file-key, --file-url, --generation-page, or --bootstrap-node-id.");
    }

    const envPath = resolve(repoRoot, options.env_file ?? ".env");
    updateFigmaEnvFile(envPath, updates);
    console.log(`Updated ${envPath}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
