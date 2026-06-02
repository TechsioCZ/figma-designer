import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { createFigmaAccess } from "../src/figma/figma-access.mjs";
import { buildComponentNestingMap } from "../src/figma/component-nesting-map.mjs";
import { discoverLibrary } from "../src/figma/library-discovery.mjs";

const discoveryFixturePath = path.resolve("fixtures/discovery/live-library.fixture.json");

async function fixtureNestingMap() {
  const figmaAccess = createFigmaAccess({ mode: "fixture", fixturePath: discoveryFixturePath });
  const discovery = await discoverLibrary({
    figmaAccess,
    runId: "run-nesting-test",
    now: "2026-06-02T10:00:00.000Z"
  });

  return buildComponentNestingMap(discovery, {
    runId: "run-nesting-test",
    now: "2026-06-02T10:15:00.000Z"
  });
}

test("builds an ephemeral component nesting map from discovery output", async () => {
  const nestingMap = await fixtureNestingMap();

  assert.equal(nestingMap.kind, "figma-component-nesting-map");
  assert.equal(nestingMap.schemaVersion, "1.0.0");
  assert.equal(nestingMap.source, "fixture");
  assert.equal(nestingMap.generatedAt, "2026-06-02T10:15:00.000Z");
  assert.equal(nestingMap.runId, "run-nesting-test");
  assert.equal(nestingMap.lifetime, "single_run");
  assert.equal(nestingMap.disposable, true);
  assert.equal(nestingMap.sourceOfTruth, false);
  assert.match(nestingMap.notice, /not a permanent design-system manifest/);
  assert.equal(nestingMap.summary.componentSetCount, 2);
  assert.equal(nestingMap.summary.componentCount, 4);
  assert.ok(nestingMap.summary.nestedComponentCount >= 2);
});

test("maps nested components to their slot relationships", async () => {
  const nestingMap = await fixtureNestingMap();

  const button = nestingMap.components.find(
    (component) => component.host.key === "button-primary-medium-key"
  );
  assert.ok(button);

  const nestedIcon = button.nestedComponents.find(
    (nestedComponent) => nestedComponent.componentKey === "icon-search-key"
  );
  assert.ok(nestedIcon);
  assert.equal(nestedIcon.slotName, "LeadingIcon");
  assert.equal(nestedIcon.slotNodeId, "200:12");
  assert.equal(nestedIcon.slotPropertyName, "LeadingIcon#200:12");
  assert.equal(
    nestedIcon.safeConfigurationPath,
    'componentProperties["LeadingIcon#200:12"].value'
  );
  assert.deepEqual(nestedIcon.instanceComponentProperties, [
    {
      name: "IconName#300:2",
      label: "IconName",
      type: "TEXT",
      value: "search"
    }
  ]);

  const iconRelationship = nestingMap.slotRelationships.find(
    (relationship) =>
      relationship.hostKey === "button-primary-medium-key" &&
      relationship.nestedComponentKey === "icon-search-key"
  );
  assert.ok(iconRelationship);
  assert.equal(iconRelationship.relationship, "instance_swap_property");
  assert.deepEqual(iconRelationship.acceptedComponentKeys, ["icon-search-key"]);
  assert.equal(iconRelationship.detachRequired, false);

  const textField = nestingMap.components.find(
    (component) => component.host.key === "text-field-default-key"
  );
  const trailingButton = textField.nestedComponents.find(
    (nestedComponent) => nestedComponent.componentKey === "button-primary-medium-key"
  );
  assert.ok(trailingButton);
  assert.equal(trailingButton.slotPropertyName, "TrailingAction#210:13");

  const trailingRelationship = nestingMap.slotRelationships.find(
    (relationship) =>
      relationship.hostKey === "text-field-default-key" &&
      relationship.slotPropertyName === "TrailingAction#210:13"
  );
  assert.ok(trailingRelationship);
  assert.deepEqual(trailingRelationship.acceptedComponentSetKeys, ["button-set-key"]);
});

test("maps variable bindings with alias chain metadata", async () => {
  const nestingMap = await fixtureNestingMap();
  const button = nestingMap.components.find(
    (component) => component.host.key === "button-primary-medium-key"
  );

  const binding = button.variableBindings.find(
    (variableBinding) =>
      variableBinding.variableId === "VariableID:component-button-bg-primary"
  );
  assert.ok(binding);
  assert.equal(binding.scope, "host");
  assert.equal(binding.variableKey, "component-button-bg-primary-key");
  assert.equal(binding.variableName, "component/button/background/primary");
  assert.equal(binding.role, "component");
  assert.deepEqual(
    binding.aliasChain.map((link) => link.role),
    ["component", "semantic", "primitive"]
  );
});

test("maps component properties and safe instance configuration paths", async () => {
  const nestingMap = await fixtureNestingMap();
  const button = nestingMap.components.find(
    (component) => component.host.key === "button-primary-medium-key"
  );

  assert.deepEqual(
    button.componentProperties.map((property) => property.name),
    ["LeadingIcon#200:12", "Label#200:14", "Variant", "Size", "State"]
  );

  const leadingIconPath = button.safeInstanceConfigurationPaths.find(
    (configurationPath) => configurationPath.propertyName === "LeadingIcon#200:12"
  );
  assert.ok(leadingIconPath);
  assert.equal(leadingIconPath.kind, "slot_instance_swap");
  assert.equal(leadingIconPath.method, "set_instance_component_property");
  assert.deepEqual(leadingIconPath.allowedValues, [
    {
      type: "COMPONENT",
      key: "icon-search-key"
    }
  ]);
  assert.equal(leadingIconPath.detachRequired, false);

  const variantPath = button.safeInstanceConfigurationPaths.find(
    (configurationPath) => configurationPath.propertyName === "Variant"
  );
  assert.ok(variantPath);
  assert.equal(variantPath.kind, "variant_property");
  assert.deepEqual(variantPath.allowedValues, ["Primary", "Secondary"]);

  const labelPath = button.safeInstanceConfigurationPaths.find(
    (configurationPath) => configurationPath.propertyName === "Label#200:14"
  );
  assert.ok(labelPath);
  assert.equal(labelPath.kind, "text_property");
  assert.equal(labelPath.path, 'componentProperties["Label#200:14"].value');
});
