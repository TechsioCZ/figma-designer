import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { createFigmaAccess } from "../src/figma/figma-access.mjs";
import { discoverLibrary } from "../src/figma/library-discovery.mjs";
import {
  runProvisionalExtensionRuntime,
  searchExistingAssets
} from "../src/generation/provisional-extension-runtime.mjs";
import { validateProvisionalExtensions } from "../src/rules/provisional-extension-policy.mjs";

const discoveryFixturePath = path.resolve("fixtures/discovery/live-library.fixture.json");
const now = "2026-06-02T10:00:00.000Z";

test("missing component requests approval before provisional output is created", async () => {
  const discovery = await fixtureDiscovery();
  const createdOutputs = [];

  const result = await runProvisionalExtensionRuntime(
    {
      runId: "run-provisional-approval",
      now,
      discovery,
      requirement: authCardRequirement()
    },
    {
      async createProvisionalOutput(payload) {
        createdOutputs.push(payload);
        return provisionalNode();
      }
    }
  );

  assert.equal(result.status, "approval_required");
  assert.equal(createdOutputs.length, 0);
  assert.equal(result.approvalRequest.kind, "provisional-extension-approval-request");
  assert.equal(result.approvalRequest.decision.required, true);
  assert.deepEqual(result.approvalRequest.decision.options, ["approve", "reject"]);
  assert.equal(result.reportPatch.designSystemGaps[0].status, "provisional_extension_proposed");
  assert.equal(result.reportPatch.provisionalExtensions[0].status, "proposed");
  assert.equal(result.reportPatch.provisionalExtensions[0].approval.granted, false);
  assert.ok(result.reportPatch.designSystemGaps[0].searchedAlternatives.length > 0);
});

test("approved provisional component creates report-shaped gap and extension records", async () => {
  const discovery = await fixtureDiscovery();
  const calls = [];

  const result = await runProvisionalExtensionRuntime(
    {
      runId: "run-provisional-created",
      now,
      discovery,
      requirement: authCardRequirement()
    },
    {
      async requestApproval(request) {
        calls.push({ step: "approval", request });
        return {
          granted: true,
          approvedBy: "operator",
          approvedAt: "2026-06-02T10:05:00.000Z"
        };
      },
      async createProvisionalOutput(payload) {
        calls.push({ step: "create", payload });
        return {
          node: provisionalNode(),
          componentKey: "ext-component-auth-card-key"
        };
      }
    }
  );

  assert.deepEqual(
    calls.map((call) => call.step),
    ["approval", "create"]
  );
  assert.equal(result.status, "created");
  assert.equal(result.reportPatch.designSystemGaps[0].status, "provisional_extension_approved");
  assert.equal(result.reportPatch.provisionalExtensions[0].status, "created");
  assert.equal(result.reportPatch.provisionalExtensions[0].approval.granted, true);
  assert.equal(result.reportPatch.provisionalExtensions[0].node.nodeId, "910:1");
  assert.equal(result.reportPatch.componentsUsed[0].source, "provisional");
  assert.deepEqual(
    result.reportPatch.provisionalExtensions[0].variableChain.map((entry) => entry.level),
    ["primitive", "semantic", "component"]
  );

  const policyResult = validateProvisionalExtensions({
    designSystemGaps: result.reportPatch.designSystemGaps,
    provisionalExtensions: result.reportPatch.provisionalExtensions
  });
  assert.deepEqual(policyResult, {
    status: "passed",
    issues: []
  });
});

test("rejected approval does not create provisional output", async () => {
  const discovery = await fixtureDiscovery();
  const createdOutputs = [];

  const result = await runProvisionalExtensionRuntime(
    {
      runId: "run-provisional-rejected",
      now,
      discovery,
      requirement: authCardRequirement()
    },
    {
      async requestApproval() {
        return {
          granted: false
        };
      },
      async createProvisionalOutput(payload) {
        createdOutputs.push(payload);
        return provisionalNode();
      }
    }
  );

  assert.equal(result.status, "rejected");
  assert.equal(createdOutputs.length, 0);
  assert.equal(result.reportPatch.designSystemGaps[0].status, "rejected");
  assert.equal(result.reportPatch.provisionalExtensions[0].status, "rejected");
  assert.equal(result.reportPatch.provisionalExtensions[0].approval.granted, false);
});

test("search finds an existing asset before proposing a gap", async () => {
  const discovery = await fixtureDiscovery();
  const result = searchExistingAssets(discovery, {
    kind: "component",
    name: "Button",
    neededCapability: "Primary action button"
  });

  assert.equal(result.sufficientAsset.name, "Button");
});

async function fixtureDiscovery() {
  const figmaAccess = createFigmaAccess({ mode: "fixture", fixturePath: discoveryFixturePath });
  return discoverLibrary({
    figmaAccess,
    runId: "run-provisional-runtime-test",
    now
  });
}

function authCardRequirement() {
  return {
    kind: "component",
    name: "Auth Card",
    blockedRequirement: "Create an authentication card for a login form.",
    neededCapability: "Authentication card with semantic surface, heading, body content, and action area.",
    impact: "Login screens would require repeated custom card composition.",
    usedByNodes: [
      {
        nodeId: "900:1",
        name: "Login Screen",
        type: "FRAME",
        url: "https://www.figma.com/design/CustomerFileFixture/provisional-extension?node-id=900-1"
      }
    ]
  };
}

function provisionalNode() {
  return {
    nodeId: "910:1",
    name: "Provisional Auth Card",
    type: "COMPONENT",
    url: "https://www.figma.com/design/CustomerFileFixture/provisional-extension?node-id=910-1"
  };
}
