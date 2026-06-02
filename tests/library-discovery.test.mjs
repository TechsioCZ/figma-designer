import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { createFigmaAccess } from "../src/figma/figma-access.mjs";
import { discoverLibrary } from "../src/figma/library-discovery.mjs";

const discoveryFixturePath = path.resolve("fixtures/discovery/live-library.fixture.json");

test("discovers fixture-backed components, sets, properties, slots, and nested components", async () => {
  const figmaAccess = createFigmaAccess({ mode: "fixture", fixturePath: discoveryFixturePath });
  const discovery = await discoverLibrary({
    figmaAccess,
    runId: "run-discovery-test",
    now: "2026-06-02T10:00:00.000Z"
  });

  assert.equal(discovery.kind, "figma-library-discovery");
  assert.equal(discovery.source, "fixture");
  assert.equal(discovery.discoveredAt, "2026-06-02T10:00:00.000Z");
  assert.equal(discovery.library.source, "fixture");

  const buttonSet = discovery.componentSets.find((set) => set.name === "Button");
  assert.ok(buttonSet);
  assert.deepEqual(
    buttonSet.componentProperties.map((property) => property.name),
    ["Variant", "Size", "State", "LeadingIcon#200:12", "Label#200:14"]
  );
  assert.deepEqual(
    buttonSet.variants.map((variant) => variant.key).sort(),
    ["button-primary-medium-key", "button-secondary-medium-key"]
  );
  assert.ok(buttonSet.slots.some((slot) => slot.propertyName === "LeadingIcon#200:12"));

  const button = discovery.components.find((component) => component.key === "button-primary-medium-key");
  assert.ok(button);
  assert.deepEqual(button.variantProperties, {
    Variant: "Primary",
    Size: "Medium",
    State: "Default"
  });
  assert.ok(button.slots.some((slot) => slot.kind === "component_property"));
  assert.ok(button.slots.some((slot) => slot.kind === "node" && slot.nodeId === "200:12"));
  assert.deepEqual(button.variableBindings, [
    { variableId: "VariableID:component-button-bg-primary" }
  ]);
  assert.equal(button.nestedComponents.length, 1);
  assert.equal(button.nestedComponents[0].componentKey, "icon-search-key");
});

test("discovers fixture-backed variables, modes, styles, examples, and approved patterns", async () => {
  const figmaAccess = createFigmaAccess({ mode: "fixture", fixturePath: discoveryFixturePath });
  const discovery = await discoverLibrary({ figmaAccess, runId: "run-discovery-test" });

  const colorCollection = discovery.variables.collections.find(
    (collection) => collection.collectionId === "VariableCollectionId:colors"
  );
  assert.ok(colorCollection);
  assert.deepEqual(colorCollection.modes, [
    { modeId: "ModeId:light", name: "Light" },
    { modeId: "ModeId:dark", name: "Dark" }
  ]);

  const componentVariable = discovery.variables.references.find(
    (variable) => variable.variableId === "VariableID:component-button-bg-primary"
  );
  assert.ok(componentVariable);
  assert.equal(componentVariable.role, "component");
  assert.deepEqual(
    componentVariable.aliasChain.map((link) => link.role),
    ["component", "semantic", "primitive"]
  );
  assert.deepEqual(componentVariable.boundNodeIds, ["200:11"]);

  assert.ok(discovery.styles.some((style) => style.name === "Text/Body" && style.type === "TEXT"));
  assert.ok(discovery.styles.some((style) => style.name === "Effect/Focus Ring"));
  assert.ok(discovery.examples.some((example) => example.name === "Login Form Example"));
  assert.ok(discovery.examples.some((example) => example.name === "Direct Fixture Example"));

  const loginPattern = discovery.approvedPatterns.find(
    (pattern) => pattern.name === "Login Form Pattern"
  );
  assert.ok(loginPattern);
  assert.deepEqual(
    loginPattern.componentReferences.map((reference) => reference.componentKey).sort(),
    ["button-primary-medium-key", "text-field-default-key"]
  );
});

test("emits run-context-shaped discovery and variable references", async () => {
  const figmaAccess = createFigmaAccess({ mode: "fixture", fixturePath: discoveryFixturePath });
  const discovery = await discoverLibrary({
    figmaAccess,
    runId: "run-context-shape",
    cachePath: "runs/run-context-shape/cache/discovery.json",
    nestingMapPath: "runs/run-context-shape/cache/component-nesting-map.json"
  });

  assert.deepEqual(discovery.runContextPatch.libraries, [
    {
      libraryId: "new-engine-figma-ui-library",
      name: "New Engine Figma UI Library",
      fileKey: "LibraryFileFixture",
      url: "https://www.figma.com/design/LibraryFileFixture/new-engine-figma-ui-library",
      connectedAsAssets: true,
      status: "connected",
      source: "fixture"
    }
  ]);
  assert.equal(discovery.runContextPatch.discovery.source, "fixture");
  assert.equal(
    discovery.runContextPatch.discovery.cachePath,
    "runs/run-context-shape/cache/discovery.json"
  );
  assert.ok(
    discovery.runContextPatch.discovery.nodes.some(
      (node) => node.role === "library_component_set" && node.componentSetKey === "button-set-key"
    )
  );
  assert.ok(
    discovery.runContextPatch.discovery.nodes.some(
      (node) => node.role === "slot" && node.node.nodeId === "200:12"
    )
  );
  assert.ok(
    discovery.runContextPatch.discovery.nodes.some(
      (node) => node.role === "library_instance_example" && node.node.nodeId === "400:2"
    )
  );
  assert.ok(
    discovery.runContextPatch.variables.references.some(
      (variable) => variable.variableId === "VariableID:component-button-bg-primary"
    )
  );
});

test("normalizes live Figma REST-like payload wrappers and marks live_figma source", async () => {
  const figmaAccess = {
    mode: "live",
    async health() {
      return {
        mode: "live",
        fileKey: "LiveFileKey",
        libraryName: "New Engine Figma UI Library",
        canRead: true
      };
    },
    async getFile() {
      return {
        key: "LiveFileKey",
        name: "Live Customer File",
        document: {
          id: "0:0",
          name: "Document",
          type: "DOCUMENT",
          children: [
            {
              id: "1:1",
              name: "Library",
              type: "PAGE",
              children: [
                {
                  id: "2:1",
                  name: "Badge",
                  type: "COMPONENT_SET",
                  componentPropertyDefinitions: {
                    Tone: {
                      type: "VARIANT",
                      defaultValue: "Neutral",
                      variantOptions: ["Neutral", "Success"]
                    }
                  },
                  children: [
                    {
                      id: "2:2",
                      name: "Badge / Tone=Neutral",
                      type: "COMPONENT",
                      componentSetId: "2:1",
                      variantProperties: { Tone: "Neutral" }
                    }
                  ]
                }
              ]
            }
          ]
        }
      };
    },
    async getLocalComponents() {
      return {
        meta: {
          components: [
            {
              key: "badge-neutral-key",
              file_key: "LibraryFileKey",
              node_id: "2:2",
              name: "Badge / Tone=Neutral",
              componentSetId: "2:1",
              componentSetKey: "badge-set-key"
            }
          ]
        }
      };
    },
    async getLocalComponentSets() {
      return {
        meta: {
          component_sets: [
            {
              key: "badge-set-key",
              file_key: "LibraryFileKey",
              node_id: "2:1",
              name: "Badge"
            }
          ]
        }
      };
    },
    async getLocalStyles() {
      return {
        meta: {
          styles: [
            {
              key: "badge-text-style-key",
              file_key: "LibraryFileKey",
              node_id: "3:1",
              name: "Text/Badge",
              style_type: "TEXT"
            }
          ]
        }
      };
    },
    async getVariables() {
      return {
        meta: {
          variableCollections: {},
          variables: {}
        }
      };
    }
  };

  const discovery = await discoverLibrary({ figmaAccess, runId: "live-normalization-test" });

  assert.equal(discovery.source, "live_figma");
  assert.equal(discovery.runContextPatch.discovery.source, "live_figma");
  assert.equal(discovery.library.fileKey, "LibraryFileKey");
  assert.equal(discovery.componentSets[0].key, "badge-set-key");
  assert.equal(discovery.componentSets[0].componentProperties[0].name, "Tone");
  assert.deepEqual(discovery.componentSets[0].variants, [
    {
      nodeId: "2:2",
      key: "badge-neutral-key",
      name: "Badge / Tone=Neutral",
      variantProperties: { Tone: "Neutral" },
      componentProperties: []
    }
  ]);
});

test("live discovery records optional endpoint failures without aborting", async () => {
  const forbidden = new Error("Figma API request failed: 403");
  forbidden.name = "FigmaAccessError";
  const figmaAccess = {
    mode: "live",
    async health() {
      return {
        mode: "live",
        fileKey: "LiveFileKey",
        libraryName: "New Design System vol. 2",
        connectedAsAssets: true,
        canRead: true
      };
    },
    async getFile() {
      return {
        key: "LiveFileKey",
        name: "Live Customer File",
        document: { id: "0:0", name: "Document", type: "DOCUMENT", children: [] }
      };
    },
    async getLocalComponents() {
      return {
        meta: {
          components: [
            {
              key: "button-key",
              file_key: "LiveFileKey",
              node_id: "2:2",
              name: "Button"
            }
          ]
        }
      };
    },
    async getLocalComponentSets() {
      return [];
    },
    async getLocalStyles() {
      throw forbidden;
    },
    async getVariables() {
      throw forbidden;
    }
  };

  const discovery = await discoverLibrary({ figmaAccess, runId: "live-endpoint-fallback-test" });

  assert.equal(discovery.source, "live_figma");
  assert.equal(discovery.components.length, 1);
  assert.deepEqual(discovery.styles, []);
  assert.deepEqual(discovery.variables.references, []);
  assert.deepEqual(
    discovery.endpointWarnings.map((warning) => warning.endpoint).sort(),
    ["getLocalStyles", "getVariables"]
  );
  assert.deepEqual(
    discovery.runContextPatch.discovery.endpointWarnings.map((warning) => warning.endpoint).sort(),
    ["getLocalStyles", "getVariables"]
  );
});
