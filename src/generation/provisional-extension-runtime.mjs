const runtimeKind = "provisional-extension-runtime";
const approvalRequestKind = "provisional-extension-approval-request";
const defaultFileKey = "ProvisionalFile";

export class ProvisionalExtensionRuntimeError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ProvisionalExtensionRuntimeError";
    this.details = details;
  }
}

export async function runProvisionalExtensionRuntime(input = {}, adapters = {}) {
  const context = normalizeRuntimeInput(input);
  const searchedAlternatives = searchExistingAssets(context.discovery, context.requirement);

  if (searchedAlternatives.sufficientAsset) {
    return {
      kind: runtimeKind,
      status: "asset_found",
      runId: context.runId,
      existingAsset: searchedAlternatives.sufficientAsset,
      search: searchedAlternatives,
      reportPatch: emptyReportPatch()
    };
  }

  const ids = buildRuntimeIds(context);
  const proposedNode = provisionalNodeRef(context, ids.extensionId);
  const variableChain = context.proposal.variableChain ?? buildVariableChain(context);
  const provisionalMarking =
    context.proposal.provisionalMarking ??
    `Node name is prefixed with Provisional: ${proposedNode.name}.`;
  const proposalText =
    context.proposal.text ??
    context.proposal.proposal ??
    `Create the smallest provisional ${context.requirement.kind} "${context.requirement.name}" using existing variables, styles, slots, and approved nested library instances where available.`;

  const gap = {
    id: ids.gapId,
    category: gapCategory(context.requirement.category ?? context.requirement.kind),
    severity: context.requirement.severity ?? "medium",
    status: "provisional_extension_proposed",
    summary:
      context.requirement.summary ??
      `No approved library asset satisfies ${context.requirement.name}.`,
    neededCapability: context.requirement.neededCapability,
    searchedAlternatives: searchedAlternatives.alternatives,
    impact:
      context.requirement.impact ??
      `The blocked requirement "${context.requirement.name}" cannot be created under Strict Composition Mode without an approved Provisional Extension.`,
    relatedNodes: context.requirement.relatedNodes,
    provisionalExtensionId: ids.extensionId,
    recommendedDesignSystemAction:
      context.requirement.recommendedDesignSystemAction ??
      `Review whether ${context.requirement.name} should become an approved Design System ${context.requirement.kind}.`
  };

  const proposedExtension = {
    id: ids.extensionId,
    gapId: gap.id,
    status: "proposed",
    approval: {
      required: true,
      granted: false
    },
    proposal: proposalText,
    node: proposedNode,
    provisionalMarking,
    variableChain,
    usedByNodes: context.requirement.usedByNodes,
    promotionRecommendation:
      context.proposal.promotionRecommendation ??
      `Promote only if ${context.requirement.name} becomes an approved reusable Design System capability.`
  };

  const approvalRequest = approvalRequestFor({
    context,
    gap,
    proposedExtension,
    search: searchedAlternatives
  });

  if (!adapters.requestApproval) {
    return {
      kind: runtimeKind,
      status: "approval_required",
      runId: context.runId,
      search: searchedAlternatives,
      approvalRequest,
      reportPatch: reportPatch([gap], [proposedExtension])
    };
  }

  const approval = normalizeApproval(
    await adapters.requestApproval(approvalRequest),
    context.now
  );

  if (!approval.granted) {
    const rejectedGap = {
      ...gap,
      status: "rejected",
      recommendedDesignSystemAction:
        context.requirement.rejectedAction ??
        `Keep the gap open for Design System review or use a compliant library-only alternative.`
    };
    const rejectedExtension = {
      ...proposedExtension,
      status: "rejected",
      approval
    };

    return {
      kind: runtimeKind,
      status: "rejected",
      runId: context.runId,
      search: searchedAlternatives,
      approvalRequest,
      approval,
      reportPatch: reportPatch([rejectedGap], [rejectedExtension])
    };
  }

  if (!adapters.createProvisionalOutput) {
    throw new ProvisionalExtensionRuntimeError(
      "createProvisionalOutput adapter is required after approval is granted.",
      { extensionId: proposedExtension.id, gapId: gap.id }
    );
  }

  const approvedExtension = {
    ...proposedExtension,
    status: "approved",
    approval
  };
  const created = await adapters.createProvisionalOutput({
    runId: context.runId,
    approvalRequest,
    approval,
    designSystemGap: {
      ...gap,
      status: "provisional_extension_approved"
    },
    provisionalExtension: approvedExtension
  });
  const createdNode = figmaNodeRef(created?.node ?? created, proposedNode);
  const createdExtension = {
    ...approvedExtension,
    status: "created",
    node: createdNode,
    usedByNodes: context.requirement.usedByNodes ?? created?.usedByNodes
  };
  const approvedGap = {
    ...gap,
    status: "provisional_extension_approved"
  };

  return {
    kind: runtimeKind,
    status: "created",
    runId: context.runId,
    search: searchedAlternatives,
    approvalRequest,
    approval,
    createdOutput: created,
    reportPatch: {
      ...reportPatch([approvedGap], [createdExtension]),
      componentsUsed: componentsUsed(created, createdExtension, context),
      variablesUsed: variablesUsed(createdExtension.variableChain, context)
    }
  };
}

export const handleProvisionalExtensionRequest = runProvisionalExtensionRuntime;

export function searchExistingAssets(discovery = {}, requirement = {}) {
  const query = requirement.searchQuery ?? requirement.name ?? requirement.neededCapability;
  const queryTokens = tokenize(`${query} ${requirement.neededCapability ?? ""}`);
  const candidates = collectSearchCandidates(discovery);
  const ranked = candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreCandidate(candidate, queryTokens, query)
    }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
  const sufficientAsset = ranked.find((candidate) =>
    isSufficientAsset(candidate, requirement, queryTokens, query)
  );
  const closest = ranked.filter((candidate) => candidate.score > 0).slice(0, 5);
  const fallbacks = ranked.slice(0, 5);
  const alternatives = (closest.length > 0 ? closest : fallbacks).map((candidate) => ({
    name: candidate.name,
    result: sufficientAsset?.key === candidate.key
      ? "Existing asset satisfies the requirement."
      : `Searched ${candidate.kind}; it does not provide ${requirement.neededCapability ?? requirement.name}.`,
    node: candidate.node
  }));

  return {
    query,
    searchedAssetCount: candidates.length,
    sufficientAsset,
    matches: ranked.filter((candidate) => candidate.score > 0),
    alternatives: alternatives.length > 0
      ? alternatives
      : [
          {
            name: "Live library assets",
            result: `No discovered components, variables, styles, examples, or approved patterns provide ${requirement.neededCapability ?? requirement.name}.`
          }
        ]
  };
}

function normalizeRuntimeInput(input) {
  if (!input.discovery) {
    throw new ProvisionalExtensionRuntimeError("discovery is required.");
  }

  const requirement = input.requirement ?? input.missingCapability ?? {};
  const name = requirement.name ?? requirement.componentName ?? requirement.capability;
  const neededCapability = requirement.neededCapability ?? requirement.description ?? name;

  if (!name || !neededCapability) {
    throw new ProvisionalExtensionRuntimeError(
      "requirement.name and requirement.neededCapability are required."
    );
  }

  const now = toIsoTimestamp(input.now ?? new Date());

  return {
    runId: input.runId ?? "provisional-extension-run",
    now,
    discovery: input.discovery,
    proposal: input.proposal ?? {},
    requirement: {
      ...requirement,
      name,
      neededCapability,
      kind: requirement.kind ?? "component",
      category: requirement.category ?? requirement.kind ?? "component",
      blockedRequirement: requirement.blockedRequirement ?? neededCapability
    }
  };
}

function buildRuntimeIds(context) {
  const base = stableSlug(
    context.proposal.idBase ??
      context.requirement.id ??
      `${context.requirement.kind}-${context.requirement.name}`
  );
  return {
    gapId: context.proposal.gapId ?? `gap-${base}`,
    extensionId: context.proposal.extensionId ?? `ext-${base}`
  };
}

function approvalRequestFor({ context, gap, proposedExtension, search }) {
  return {
    kind: approvalRequestKind,
    runId: context.runId,
    requestedAt: context.now,
    blockedRequirement: context.requirement.blockedRequirement,
    liveLibrarySearch: {
      query: search.query,
      searchedAssetCount: search.searchedAssetCount,
      closestAlternatives: search.alternatives
    },
    designSystemGap: gap,
    proposedSmallestExtension: proposedExtension.proposal,
    provisionalExtension: proposedExtension,
    affectedNodes: context.requirement.relatedNodes ?? context.requirement.usedByNodes ?? [],
    affectedVariables: proposedExtension.variableChain,
    provisionalMarking: proposedExtension.provisionalMarking,
    expectedReportEntries: {
      designSystemGaps: [gap],
      provisionalExtensions: [proposedExtension]
    },
    decision: {
      required: true,
      options: ["approve", "reject"]
    }
  };
}

function collectSearchCandidates(discovery) {
  return [
    ...(discovery.components ?? []).map((asset) => searchCandidate(asset, "component")),
    ...(discovery.componentSets ?? []).map((asset) => searchCandidate(asset, "component_set")),
    ...(discovery.styles ?? []).map((asset) => searchCandidate(asset, "style")),
    ...(discovery.variables?.references ?? []).map((asset) => searchCandidate(asset, "variable")),
    ...(discovery.examples ?? []).map((asset) => searchCandidate(asset, "example")),
    ...(discovery.approvedPatterns ?? []).map((asset) => searchCandidate(asset, "approved_pattern"))
  ];
}

function searchCandidate(asset, kind) {
  const node = figmaNodeRef(asset, undefined, kind.toUpperCase());
  return {
    kind,
    key: asset.key ?? asset.variableId ?? asset.patternId ?? asset.nodeId ?? asset.name,
    name: asset.name ?? asset.variableName ?? asset.patternId ?? "Unnamed Asset",
    description: asset.description ?? asset.summary ?? "",
    node
  };
}

function scoreCandidate(candidate, queryTokens, query) {
  const text = normalizeSearchText(`${candidate.name} ${candidate.description} ${candidate.kind}`);
  const normalizedQuery = normalizeSearchText(query);
  let score = text.includes(normalizedQuery) ? queryTokens.length + 3 : 0;

  for (const token of queryTokens) {
    if (text.includes(token)) {
      score += 1;
    }
  }

  return score;
}

function isSufficientAsset(candidate, requirement, queryTokens, query) {
  if (candidate.score <= 0) {
    return false;
  }

  const requiredKind = normalizeKind(requirement.kind);
  if (requiredKind === "component" && !["component", "component_set"].includes(candidate.kind)) {
    return false;
  }

  const normalizedName = normalizeSearchText(candidate.name);
  const normalizedQuery = normalizeSearchText(query);
  return normalizedName === normalizedQuery || queryTokens.every((token) => normalizedName.includes(token));
}

function buildVariableChain(context) {
  const references = context.discovery.variables?.references ?? [];
  const semantic = references.find(
    (variable) => variableRole(variable) === "semantic" && variable.aliasChain?.some((link) => variableRole(link) === "primitive")
  );
  const primitiveLink =
    semantic?.aliasChain?.find((link) => variableRole(link) === "primitive") ??
    references.find((variable) => variableRole(variable) === "primitive");
  const semanticLink = semantic ?? references.find((variable) => variableRole(variable) === "semantic");
  const primitive = primitiveLink
    ? variableChainEntry(primitiveLink, "primitive")
    : {
        level: "primitive",
        variableName: `primitive/provisional/${stableSlug(context.requirement.name)}`,
        variableId: `VariableID:primitive-provisional-${stableSlug(context.requirement.name)}`
      };
  const semanticEntry = semanticLink
    ? {
        ...variableChainEntry(semanticLink, "semantic"),
        aliasesTo: primitive.variableId ?? primitive.variableName
      }
    : {
        level: "semantic",
        variableName: `semantic/provisional/${stableSlug(context.requirement.name)}`,
        variableId: `VariableID:semantic-provisional-${stableSlug(context.requirement.name)}`,
        aliasesTo: primitive.variableId ?? primitive.variableName
      };
  const component = {
    level: "component",
    variableName:
      context.proposal.componentVariableName ??
      `component/${stableSlug(context.requirement.name).replaceAll("-", "/")}/surface`,
    variableId:
      context.proposal.componentVariableId ??
      `VariableID:component-${stableSlug(context.requirement.name)}-surface`,
    aliasesTo: semanticEntry.variableId ?? semanticEntry.variableName
  };

  return [primitive, semanticEntry, component];
}

function variableChainEntry(variable, fallbackLevel) {
  return {
    level: variableRole(variable) || fallbackLevel,
    variableName: variable.name ?? variable.variableName ?? variable.variableId,
    variableId: variable.variableId ?? variable.id
  };
}

function normalizeApproval(response, now) {
  if (typeof response === "boolean") {
    return response
      ? {
          required: true,
          granted: true,
          approvedBy: "operator",
          approvedAt: now
        }
      : {
          required: true,
          granted: false
        };
  }

  return {
    required: true,
    granted: response?.granted === true || response?.approved === true,
    approvedBy:
      response?.approvedBy ??
      response?.operator ??
      (response?.granted === true || response?.approved === true ? "operator" : undefined),
    approvedAt:
      response?.approvedAt ??
      (response?.granted === true || response?.approved === true ? now : undefined)
  };
}

function provisionalNodeRef(context, extensionId) {
  const fileKey = context.discovery.figmaFile?.fileKey ?? context.discovery.figmaFile?.key ?? defaultFileKey;
  const name = context.proposal.nodeName ?? `Provisional ${context.requirement.name}`;
  const nodeId = context.proposal.nodeId ?? `pending:${extensionId}`;

  return {
    nodeId,
    name,
    type: context.proposal.nodeType ?? "COMPONENT",
    url: figmaNodeUrl(fileKey, nodeId)
  };
}

function figmaNodeRef(value = {}, fallback = {}, fallbackType = "NODE") {
  const nodeId = value.nodeId ?? value.node_id ?? value.id ?? fallback.nodeId;
  const name = value.name ?? fallback.name ?? "Provisional Extension";
  const fileKey = value.fileKey ?? value.file_key ?? fallback.fileKey ?? defaultFileKey;

  return {
    nodeId: nodeId ?? `pending:${stableSlug(name)}`,
    name,
    type: value.type ?? fallback.type ?? fallbackType,
    url: value.url ?? fallback.url ?? figmaNodeUrl(fileKey, nodeId ?? `pending:${stableSlug(name)}`)
  };
}

function reportPatch(designSystemGaps, provisionalExtensions) {
  return {
    designSystemGaps: withoutUndefined(designSystemGaps),
    provisionalExtensions: withoutUndefined(provisionalExtensions)
  };
}

function emptyReportPatch() {
  return {
    designSystemGaps: [],
    provisionalExtensions: [],
    componentsUsed: [],
    variablesUsed: []
  };
}

function componentsUsed(created, extension, context) {
  const node = figmaNodeRef(created?.instanceNode ?? created?.node ?? extension.node);
  return [
    {
      componentKey:
        created?.componentKey ??
        context.proposal.componentKey ??
        `${extension.id}-key`,
      name: extension.node.name,
      source: "provisional",
      usageCount: 1,
      instanceNodes: [node]
    }
  ];
}

function variablesUsed(variableChain, context) {
  const collectionByVariableId = new Map(
    (context.discovery.variables?.references ?? []).map((variable) => [
      variable.variableId,
      variable.collectionId ?? variable.collection ?? "Provisional"
    ])
  );

  return variableChain.map((variable) => ({
    variableId: variable.variableId ?? `VariableID:${stableSlug(variable.variableName)}`,
    name: variable.variableName,
    collection: collectionByVariableId.get(variable.variableId) ?? "Provisional",
    level: variable.level,
    aliasChain: variableChain
      .slice(0, variableChain.findIndex((candidate) => candidate === variable) + 1)
      .map((candidate) => candidate.variableName),
    usageCount: 1
  }));
}

function gapCategory(value) {
  const normalized = normalizeKind(value);
  return [
    "component",
    "variant",
    "slot",
    "component_property",
    "variable",
    "mode",
    "style",
    "pattern",
    "layout",
    "content",
    "accessibility",
    "other"
  ].includes(normalized)
    ? normalized
    : "other";
}

function normalizeKind(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function variableRole(variable = {}) {
  return String(variable.level ?? variable.role ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
}

function tokenize(value) {
  return normalizeSearchText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !["with", "using", "that", "the", "and"].includes(token));
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stableSlug(value) {
  return String(value ?? "provisional")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "provisional";
}

function figmaNodeUrl(fileKey, nodeId) {
  return `https://www.figma.com/design/${encodeURIComponent(fileKey)}/provisional-extension?node-id=${encodeURIComponent(String(nodeId).replace(":", "-"))}`;
}

function toIsoTimestamp(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function withoutUndefined(value) {
  return JSON.parse(JSON.stringify(value));
}
