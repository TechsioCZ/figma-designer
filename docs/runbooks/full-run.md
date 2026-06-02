# Full Run

This runbook covers the complete operator loop: bootstrap, discovery, nesting, generation planning, validation, screenshot/report creation, gap logging, iteration planning, and repeated review.

## 1. Start From An Approved Brief

Use the customer brief as the only product input. Record a stable `runId`, `briefId`, target screen names, expected modes/themes, and the Generation Workspace target before creating or planning Figma output.

Local fixture example:

```bash
cat fixtures/scenarios/generate/login-screen.brief.json
```

## 2. Bootstrap

Run bootstrap before discovery or generation:

```bash
mkdir -p reports/local .cache/figma-designer/run-local-login

npm run figma:bootstrap -- \
  --fixture fixtures/bootstrap/success.json \
  --run-context fixtures/run-context/example-run-context.json \
  --report-output reports/local/bootstrap-check.json \
  --screenshot-node-ids 10:1
```

For live runs, use the environment values from [Operator Setup](./operator-setup.md) and omit `--fixture`.

Bootstrap must pass Figma access, write access, connected Assets, variables, screenshot export, and report output. If any capability fails, stop and fix access instead of creating fallback UI.

## 3. Discover The Live Library

Discovery reads the connected Figma UI Library for the current run:

```bash
npm run figma:discover -- \
  --fixture fixtures/discovery/live-library.fixture.json \
  --run-id run-local-login \
  --cache-path .cache/figma-designer/run-local-login \
  --output reports/local/discovery.json
```

Discovery output is run evidence, not a permanent manifest. Use it to select components, component sets, variants, properties, slots, variables, modes, styles, examples, and approved patterns.

## 4. Build The Nesting Map

Build the run-local component nesting map from discovery:

```bash
npm run figma:nesting -- \
  --fixture fixtures/discovery/live-library.fixture.json \
  --run-id run-local-login \
  --cache-path .cache/figma-designer/run-local-login \
  --output reports/local/nesting-map.json
```

Use the nesting map to confirm which components can accept nested content and which slots or instance structures are supported. Unsupported nesting is a validation failure unless it is routed through an approved Provisional Extension.

## 5. Create The Generation Plan

Generate a plan before live writes. The landed generator emits a `figma-design-operation-plan` in `plan_only` mode: it lists frame creation, instance placement, component property updates, slot fills, variable bindings, style application, approved pattern usage, prototype connections, Design System Gaps, and Strict Composition status.

Local fixture example:

```bash
node --input-type=module <<'JS'
import { readFile } from "node:fs/promises";
import { createFigmaAccess } from "./src/figma/figma-access.mjs";
import { discoverLibrary } from "./src/figma/library-discovery.mjs";
import { buildComponentNestingMap } from "./src/figma/component-nesting-map.mjs";
import { generateDesignPlan } from "./src/generation/design-generator.mjs";

const runId = "run-local-login";
const fixturePath = "fixtures/discovery/live-library.fixture.json";
const brief = JSON.parse(await readFile("fixtures/scenarios/generate/login-screen.brief.json", "utf8"));
const figmaAccess = createFigmaAccess({ mode: "fixture", fixturePath });
const discovery = await discoverLibrary({ figmaAccess, runId });
const nestingMap = buildComponentNestingMap(discovery, { runId });
const plan = generateDesignPlan({ brief, discovery, nestingMap }, { runId });

console.log(JSON.stringify({
  status: plan.status,
  planStatus: plan.planStatus,
  operations: plan.operations.length,
  gaps: plan.designSystemGaps.length,
  liveWritePerformed: plan.strictComposition.liveWritePerformed
}, null, 2));
JS
```

Apply only operations that preserve Strict Composition:

- place library instances instead of drawing lookalikes;
- configure variants and instance properties instead of detaching;
- fill supported slots only;
- bind variables through primitive -> semantic -> component chains;
- use approved patterns from discovery;
- keep provisional work separate and marked.

## 6. Handle Gaps And Approval

When the plan, validator, screenshot report, or operator review finds a missing capability, record a Design System Gap. A gap should include the blocked requirement, searched alternatives, impact, proposed smallest extension, approval state, related Figma nodes, and recommended Design System action.

Local gap-log evidence can be normalized from generated plans, validators, provisional runtime patches, and reports:

```bash
node --input-type=module <<'JS'
import report from "./fixtures/reports/design-run-report.valid.json" with { type: "json" };
import { createDesignSystemGapLog } from "./src/reporting/gap-log.mjs";

const log = createDesignSystemGapLog({ report });
console.log(JSON.stringify(log.summary, null, 2));
JS
```

Do not create a Provisional Extension until the operator grants approval for the specific gap and smallest extension. Rejected gaps should use the closest compliant library-only alternative or leave the blocked portion unresolved in the report.

## 7. Validate

Validate generated output or report evidence:

```bash
npm run figma:validate -- \
  --report fixtures/reports/design-run-report.valid.json \
  --run-id run-local-login
```

Validation covers detached components, non-library instances, invalid properties or slots, unsafe nested content, raw final values, broken variable chains, mode and theme coverage, WCAG 2.2 AAA contrast, APCA Gold contrast, auto-layout hygiene, resizing behavior, spacing rules, prototype dead ends, screenshot issues, and provisional extension reporting.

Blocking validation failures must be fixed, waived by explicit operator approval, or left as open issues in the Design Run Report.

## 8. Capture Screenshots And Build The Report

Screenshot/report output ties review evidence to Figma node IDs and links. The report records screens, screenshots, components used, variables used, validation results, Design System Gaps, provisional extensions, and iteration notes.

Local fixture command:

```bash
npm run figma:report -- \
  --fixture fixtures/reports/design-run-report.valid.json \
  --output reports/local/design-run-report.command.json
```

Local module example for screenshot-shaped report data:

```bash
node --input-type=module <<'JS'
import { createScreenshotReport } from "./src/reporting/screenshot-report.mjs";

const result = await createScreenshotReport({
  runId: "run-local-login",
  figmaFile: {
    fileKey: "CustomerFileFixture",
    name: "Customer Portal Workspace",
    url: "https://www.figma.com/file/CustomerFileFixture/Customer-Portal"
  },
  screens: [{
    id: "screen-login",
    node: { nodeId: "12:34", name: "Login", type: "FRAME" },
    briefReference: "Create a login screen."
  }],
  screenshotResults: [{
    screenId: "screen-login",
    path: "reports/run-local-login/screenshots/login-light.png",
    dimensions: { width: 1440, height: 1024 }
  }]
}, { requireScreenshots: true });

console.log(JSON.stringify(result.report.summary, null, 2));
JS
```

Final review should open the Figma node links and screenshot artifacts named in the report.

## 9. Plan Iteration

Iteration planning reads validation failures, report data, screenshots, gaps, and approval notes. It proposes actions without weakening Strict Composition Mode.

```bash
npm run figma:iterate -- \
  --report fixtures/reports/design-run-report.valid.json
```

Local module example:

```bash
node --input-type=module <<'JS'
import report from "./fixtures/reports/design-run-report.valid.json" with { type: "json" };
import { planDesignIteration } from "./src/iteration/design-iteration.mjs";

const plan = planDesignIteration({ report }, { runId: report.runId });
console.log(JSON.stringify({
  status: plan.status,
  actions: plan.actions.length,
  gaps: plan.summary.gapReferenceCount,
  screenshots: plan.summary.screenshotReferenceCount
}, null, 2));
JS
```

Apply approved iteration actions, then repeat validation, screenshot/report, gap logging, and iteration planning until remaining issues are resolved or explicitly accepted by the operator.

## 10. Close The Run

A run is ready to close when:

- bootstrap capabilities passed for the target file;
- generated screens are in the Generation Workspace;
- no component instance was detached;
- all nested content uses supported slots or approved structure;
- variables preserve primitive -> semantic -> component chains;
- no raw final visual values remain outside approved provisional paths;
- screenshots and report entries reference node IDs and Figma links;
- Design System Gaps and Provisional Extensions have approval states;
- validation is passed, or remaining findings are explicitly waived or accepted;
- the next iteration is empty or contains only accepted follow-up work.
