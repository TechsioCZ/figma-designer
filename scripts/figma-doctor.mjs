#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const checks = [
  ["Command help", "npm", ["run", "figma", "--", "--help"]],
  ["Bootstrap fixture", "npm", ["run", "figma:bootstrap", "--", "--fixture", "fixtures/bootstrap/success.json"]],
  [
    "Discovery fixture",
    "npm",
    ["run", "figma:discover", "--", "--fixture", "fixtures/discovery/live-library.fixture.json"]
  ],
  [
    "Nesting fixture",
    "npm",
    ["run", "figma:nesting", "--", "--fixture", "fixtures/discovery/live-library.fixture.json"]
  ],
  [
    "Validation fixture",
    "npm",
    ["run", "figma:validate", "--", "--report", "fixtures/reports/design-run-report.valid.json"]
  ],
  [
    "Report fixture",
    "npm",
    ["run", "figma:report", "--", "--fixture", "fixtures/reports/design-run-report.valid.json"]
  ],
  [
    "Iteration fixture",
    "npm",
    ["run", "figma:iterate", "--", "--report", "fixtures/reports/design-run-report.valid.json"]
  ],
  ["Schema validation", "npm", ["run", "validate:schemas"]],
  ["Unit tests", "npm", ["test"]]
];

for (const [label, command, args] of checks) {
  process.stdout.write(`- ${label}... `);
  try {
    execFileSync(command, args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    process.stdout.write("ok\n");
  } catch (error) {
    process.stdout.write("failed\n");
    const stdout = error.stdout?.toString() ?? "";
    const stderr = error.stderr?.toString() ?? "";
    console.error(`${stdout}${stderr}`);
    process.exit(1);
  }
}

console.log("Local Figma Designer harness checks passed.");
