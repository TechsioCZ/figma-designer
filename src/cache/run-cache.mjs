import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const manifestFileName = "run-cache-manifest.json";
const manifestKind = "figma-designer.run-cache";
const artifactKind = "figma-designer.run-cache.artifact";
const schemaVersion = "1.0.0";

const safeguardNotice =
  "Disposable single-run cache. Refresh Figma discovery for later runs; this is not design-system truth.";

export class RunCacheError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "RunCacheError";
    this.details = details;
  }
}

export async function createRunCache(input, options = {}) {
  const descriptor = normalizeCacheDescriptor(input, options);
  assertSingleRunDisposable(descriptor);

  await mkdir(descriptor.rootDir, { recursive: true });

  const existingManifest = await readManifestIfExists(descriptor.rootDir);
  if (existingManifest) {
    assertCurrentRun(existingManifest, descriptor.runId, descriptor.rootDir);
  }

  const now = getTimestamp(options.now);
  const manifest = existingManifest ?? {
    kind: manifestKind,
    schemaVersion,
    runId: descriptor.runId,
    createdAt: now,
    lastUpdatedAt: now,
    lifetime: "single_run",
    disposable: true,
    sourceOfTruth: false,
    notice: safeguardNotice,
    metadata: {},
    artifacts: {}
  };

  manifest.lastUpdatedAt = now;
  manifest.metadata = {
    ...manifest.metadata,
    ...(options.metadata ?? {})
  };

  await writeManifest(descriptor.rootDir, manifest);
  return new RunCache(descriptor.rootDir, manifest, options);
}

export async function openRunCache(input, options = {}) {
  const descriptor = normalizeCacheDescriptor(input, options);
  assertSingleRunDisposable(descriptor);

  const manifest = await readManifest(descriptor.rootDir);
  assertCurrentRun(manifest, descriptor.runId, descriptor.rootDir);
  assertManifestSafeguards(manifest, descriptor.rootDir);

  return new RunCache(descriptor.rootDir, manifest, options);
}

export async function cleanupRunCache(input, options = {}) {
  const descriptor = normalizeCacheDescriptor(input, options);
  assertSingleRunDisposable(descriptor);

  const manifest = await readManifestIfExists(descriptor.rootDir);
  if (!manifest) {
    return {
      runId: descriptor.runId,
      rootDir: descriptor.rootDir,
      removed: false
    };
  }

  assertCurrentRun(manifest, descriptor.runId, descriptor.rootDir);
  assertManifestSafeguards(manifest, descriptor.rootDir);

  await rm(descriptor.rootDir, { recursive: true, force: true });
  return {
    runId: descriptor.runId,
    rootDir: descriptor.rootDir,
    removed: true
  };
}

export async function readCacheManifest(input, options = {}) {
  const descriptor = normalizeCacheDescriptor(input, options);
  const manifest = await readManifest(descriptor.rootDir);
  assertCurrentRun(manifest, descriptor.runId, descriptor.rootDir);
  return cloneJson(manifest);
}

export class RunCache {
  constructor(rootDir, manifest, options = {}) {
    this.rootDir = rootDir;
    this.manifest = manifest;
    this.now = options.now;
  }

  get runId() {
    return this.manifest.runId;
  }

  get metadata() {
    return cloneJson(this.manifest.metadata);
  }

  getArtifactEntry(name) {
    const artifactName = validateArtifactName(name);
    const entry = this.manifest.artifacts[artifactName];
    return entry ? cloneJson(entry) : null;
  }

  listArtifacts() {
    return Object.values(this.manifest.artifacts)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => cloneJson(entry));
  }

  async setMetadata(metadata = {}) {
    if (!isPlainObject(metadata)) {
      throw new RunCacheError("Run cache metadata must be a plain object.", { metadata });
    }

    await this.reload();
    assertManifestSafeguards(this.manifest, this.rootDir);

    this.manifest.metadata = {
      ...this.manifest.metadata,
      ...metadata
    };
    this.manifest.lastUpdatedAt = getTimestamp(this.now);

    await writeManifest(this.rootDir, this.manifest);
    return this.metadata;
  }

  async writeArtifact(name, payload, options = {}) {
    const artifactName = validateArtifactName(name);
    if (options.metadata !== undefined && !isPlainObject(options.metadata)) {
      throw new RunCacheError("Artifact metadata must be a plain object.", {
        name: artifactName,
        metadata: options.metadata
      });
    }

    await this.reload();
    assertManifestSafeguards(this.manifest, this.rootDir);

    const now = getTimestamp(this.now);
    const relativePath = path.posix.join("artifacts", `${encodeArtifactFileName(artifactName)}.json`);
    const absolutePath = path.join(this.rootDir, relativePath);
    const existingEntry = this.manifest.artifacts[artifactName];
    const metadata = options.metadata ?? existingEntry?.metadata ?? {};
    const contentType = options.contentType ?? "application/json";

    const artifact = {
      kind: artifactKind,
      schemaVersion,
      runId: this.runId,
      name: artifactName,
      writtenAt: now,
      lifetime: "single_run",
      disposable: true,
      sourceOfTruth: false,
      notice: safeguardNotice,
      contentType,
      metadata,
      payload
    };

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `${JSON.stringify(artifact, null, 2)}\n`);

    const entry = {
      name: artifactName,
      path: relativePath,
      contentType,
      metadata,
      createdAt: existingEntry?.createdAt ?? now,
      updatedAt: now,
      disposable: true,
      sourceOfTruth: false
    };

    this.manifest.artifacts[artifactName] = entry;
    this.manifest.lastUpdatedAt = now;
    await writeManifest(this.rootDir, this.manifest);

    return cloneJson(entry);
  }

  async readArtifact(name) {
    const artifactName = validateArtifactName(name);

    await this.reload();
    assertManifestSafeguards(this.manifest, this.rootDir);

    const entry = this.manifest.artifacts[artifactName];
    if (!entry) {
      throw new RunCacheError(`Run cache artifact not found: ${artifactName}`, {
        runId: this.runId,
        name: artifactName
      });
    }

    const artifactPath = resolveInsideRoot(this.rootDir, entry.path);
    const artifact = await readJson(artifactPath, "Could not read run cache artifact.");

    if (artifact.kind !== artifactKind) {
      throw new RunCacheError(`Invalid run cache artifact kind for ${artifactName}.`, {
        artifactPath,
        kind: artifact.kind
      });
    }

    assertCurrentRun(artifact, this.runId, artifactPath);

    if (artifact.lifetime !== "single_run" || artifact.disposable !== true || artifact.sourceOfTruth !== false) {
      throw new RunCacheError(`Run cache artifact is missing disposable cache safeguards: ${artifactName}`, {
        artifactPath,
        lifetime: artifact.lifetime,
        disposable: artifact.disposable,
        sourceOfTruth: artifact.sourceOfTruth
      });
    }

    return {
      ...cloneJson(entry),
      metadata: cloneJson(artifact.metadata ?? {}),
      payload: cloneJson(artifact.payload)
    };
  }

  async cleanup() {
    return cleanupRunCache({
      runId: this.runId,
      rootDir: this.rootDir,
      lifetime: "single_run",
      disposable: true
    });
  }

  async reload() {
    this.manifest = await readManifest(this.rootDir);
    assertCurrentRun(this.manifest, this.runId, this.rootDir);
    return this;
  }
}

function normalizeCacheDescriptor(input = {}, options = {}) {
  const cacheContext = input.artifacts?.cache;
  const runId = options.runId ?? input.runId;
  const rootDir = options.rootDir ?? options.cacheRootDir ?? cacheContext?.rootDir ?? input.rootDir ?? input.cacheRootDir;
  const lifetime = options.lifetime ?? cacheContext?.lifetime ?? input.lifetime ?? "single_run";
  const disposable = options.disposable ?? cacheContext?.disposable ?? input.disposable ?? true;
  const cwd = options.cwd ?? process.cwd();

  if (!runId || typeof runId !== "string") {
    throw new RunCacheError("Run cache requires a string runId.", { runId });
  }

  if (!rootDir || typeof rootDir !== "string") {
    throw new RunCacheError("Run cache requires a cache rootDir.", { rootDir });
  }

  return {
    runId,
    rootDir: path.resolve(cwd, rootDir),
    lifetime,
    disposable,
    cacheContext
  };
}

function assertSingleRunDisposable(descriptor) {
  if (descriptor.lifetime !== "single_run" || descriptor.disposable !== true) {
    throw new RunCacheError("Run cache must be marked lifetime single_run and disposable true.", {
      rootDir: descriptor.rootDir,
      lifetime: descriptor.lifetime,
      disposable: descriptor.disposable
    });
  }
}

function assertManifestSafeguards(manifest, rootDir) {
  if (
    manifest.kind !== manifestKind ||
    manifest.lifetime !== "single_run" ||
    manifest.disposable !== true ||
    manifest.sourceOfTruth !== false
  ) {
    throw new RunCacheError("Run cache manifest is missing disposable single-run safeguards.", {
      rootDir,
      kind: manifest.kind,
      lifetime: manifest.lifetime,
      disposable: manifest.disposable,
      sourceOfTruth: manifest.sourceOfTruth
    });
  }
}

function assertCurrentRun(record, expectedRunId, location) {
  if (record.runId !== expectedRunId) {
    throw new RunCacheError("Stale run cache rejected: runId does not match the active run.", {
      expectedRunId,
      actualRunId: record.runId,
      location
    });
  }
}

async function readManifest(rootDir) {
  const manifest = await readJson(path.join(rootDir, manifestFileName), "Could not read run cache manifest.");
  assertManifestSafeguards(manifest, rootDir);
  return manifest;
}

async function readManifestIfExists(rootDir) {
  try {
    return await readManifest(rootDir);
  } catch (error) {
    if (error?.details?.causeCode === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeManifest(rootDir, manifest) {
  assertManifestSafeguards(manifest, rootDir);
  await writeFile(path.join(rootDir, manifestFileName), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function readJson(filePath, message) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new RunCacheError(message, {
      filePath,
      cause: error.message,
      causeCode: error.code
    });
  }
}

function validateArtifactName(name) {
  if (typeof name !== "string" || name.length === 0) {
    throw new RunCacheError("Run cache artifact name must be a non-empty string.", { name });
  }

  if (name.length > 160 || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name)) {
    throw new RunCacheError(`Invalid run cache artifact name: ${name}`, { name });
  }

  if (name.split("/").some((segment) => segment === "." || segment === ".." || segment.length === 0)) {
    throw new RunCacheError(`Invalid run cache artifact path segment: ${name}`, { name });
  }

  return name;
}

function encodeArtifactFileName(name) {
  return encodeURIComponent(name).replaceAll("%", "_");
}

function resolveInsideRoot(rootDir, relativePath) {
  const absolutePath = path.resolve(rootDir, relativePath);
  const relativeToRoot = path.relative(rootDir, absolutePath);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new RunCacheError("Run cache path escapes cache root.", {
      rootDir,
      relativePath
    });
  }
  return absolutePath;
}

function getTimestamp(now) {
  if (typeof now === "function") {
    return now();
  }

  return now ?? new Date().toISOString();
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
