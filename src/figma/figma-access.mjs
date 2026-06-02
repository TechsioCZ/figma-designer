import { readFile } from "node:fs/promises";
import path from "node:path";

const defaultBaseUrl = "https://api.figma.com/v1";

export class FigmaAccessError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "FigmaAccessError";
    this.details = details;
  }
}

export function createFigmaAccess(options = {}) {
  const mode = options.mode ?? (options.fixturePath ? "fixture" : "live");
  const baseUrl = stripTrailingSlash(options.baseUrl ?? defaultBaseUrl);

  if (mode === "fixture") {
    return new FixtureFigmaAccess(options);
  }

  if (mode === "live") {
    return new LiveFigmaAccess({ ...options, baseUrl });
  }

  throw new FigmaAccessError(`Unsupported Figma access mode: ${mode}`, { mode });
}

export function createFigmaAccessFromEnv(env = process.env, options = {}) {
  return createFigmaAccess({
    accessToken: env.FIGMA_ACCESS_TOKEN,
    fileKey: env.FIGMA_FILE_KEY,
    generationPage: env.FIGMA_GENERATION_PAGE,
    libraryName: env.FIGMA_LIBRARY_NAME,
    connectedAsAssets: parseEnvBoolean(env.FIGMA_LIBRARY_CONNECTED_ASSETS),
    canWrite: parseEnvBoolean(env.FIGMA_CAN_WRITE),
    canScreenshot: parseEnvBoolean(env.FIGMA_CAN_SCREENSHOT),
    baseUrl: env.FIGMA_API_BASE_URL,
    fixturePath: env.FIGMA_FIXTURE_PATH,
    mode: env.FIGMA_FIXTURE_PATH ? "fixture" : "live",
    ...options
  });
}

export async function readJsonFile(filePath) {
  const absolutePath = path.resolve(filePath);
  try {
    return JSON.parse(await readFile(absolutePath, "utf8"));
  } catch (error) {
    throw new FigmaAccessError(`Could not read JSON fixture: ${filePath}`, {
      filePath,
      cause: error.message
    });
  }
}

class FixtureFigmaAccess {
  constructor(options = {}) {
    this.mode = "fixture";
    this.fileKey = options.fileKey ?? "fixture-file";
    this.generationPage = options.generationPage ?? "Generation Workspace";
    this.libraryName = options.libraryName ?? "New Engine Figma UI Library";
    this.fixturePath = options.fixturePath;
    this.fixture = options.fixture;
  }

  async loadFixture() {
    if (this.fixture) {
      return this.fixture;
    }

    if (!this.fixturePath) {
      return {};
    }

    this.fixture = await readJsonFile(this.fixturePath);
    return this.fixture;
  }

  async health() {
    const fixture = await this.loadFixture();
    return {
      mode: this.mode,
      fileKey: fixture.fileKey ?? this.fileKey,
      generationPage: fixture.generationPage ?? this.generationPage,
      libraryName: fixture.libraryName ?? this.libraryName,
      canRead: true,
      canWrite: Boolean(fixture.canWrite ?? true),
      canScreenshot: Boolean(fixture.canScreenshot ?? true)
    };
  }

  async getFile() {
    const fixture = await this.loadFixture();
    return fixture.file ?? {
      key: fixture.fileKey ?? this.fileKey,
      name: fixture.fileName ?? "Fixture Figma File",
      document: fixture.document ?? { type: "DOCUMENT", children: [] }
    };
  }

  async getLocalComponents() {
    const fixture = await this.loadFixture();
    return fixture.components ?? [];
  }

  async getLocalComponentSets() {
    const fixture = await this.loadFixture();
    return fixture.componentSets ?? [];
  }

  async getLocalStyles() {
    const fixture = await this.loadFixture();
    return fixture.styles ?? [];
  }

  async getVariables() {
    const fixture = await this.loadFixture();
    return fixture.variables ?? {
      meta: {
        variables: {},
        variableCollections: {}
      }
    };
  }

  async exportImages(nodeIds = [], options = {}) {
    const fixture = await this.loadFixture();
    const images = fixture.images ?? {};

    return {
      images: Object.fromEntries(nodeIds.map((nodeId) => [nodeId, images[nodeId] ?? null])),
      format: options.format ?? "png"
    };
  }
}

class LiveFigmaAccess {
  constructor(options = {}) {
    this.mode = "live";
    this.accessToken = options.accessToken;
    this.fileKey = options.fileKey;
    this.generationPage = options.generationPage;
    this.libraryName = options.libraryName;
    this.connectedAsAssets = options.connectedAsAssets;
    this.canWrite = options.canWrite;
    this.canScreenshot = options.canScreenshot;
    this.baseUrl = options.baseUrl ?? defaultBaseUrl;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  requireLiveConfig() {
    if (!this.accessToken) {
      throw new FigmaAccessError("Missing FIGMA_ACCESS_TOKEN for live Figma access.");
    }

    if (!this.fileKey) {
      throw new FigmaAccessError("Missing FIGMA_FILE_KEY for live Figma access.");
    }

    if (!this.fetch) {
      throw new FigmaAccessError("No fetch implementation is available for live Figma access.");
    }
  }

  async request(endpoint, options = {}) {
    this.requireLiveConfig();

    const response = await this.fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        "X-Figma-Token": this.accessToken,
        ...(options.headers ?? {})
      }
    });

    if (!response.ok) {
      throw new FigmaAccessError(`Figma API request failed: ${response.status}`, {
        endpoint,
        status: response.status,
        statusText: response.statusText
      });
    }

    return response.json();
  }

  async health() {
    this.requireLiveConfig();
    return {
      mode: this.mode,
      fileKey: this.fileKey,
      generationPage: this.generationPage,
      libraryName: this.libraryName,
      connectedAsAssets: this.connectedAsAssets !== false,
      canRead: true,
      canWrite: this.canWrite !== false,
      canScreenshot: this.canScreenshot !== false
    };
  }

  async getFile() {
    return this.request(`/files/${encodeURIComponent(this.fileKey)}`);
  }

  async getLocalComponents() {
    return this.request(`/files/${encodeURIComponent(this.fileKey)}/components`);
  }

  async getLocalComponentSets() {
    return this.request(`/files/${encodeURIComponent(this.fileKey)}/component_sets`);
  }

  async getLocalStyles() {
    return this.request(`/files/${encodeURIComponent(this.fileKey)}/styles`);
  }

  async getVariables() {
    return this.request(`/files/${encodeURIComponent(this.fileKey)}/variables/local`);
  }

  async exportImages(nodeIds = [], options = {}) {
    const params = new URLSearchParams({
      ids: nodeIds.join(","),
      format: options.format ?? "png"
    });

    return this.request(`/images/${encodeURIComponent(this.fileKey)}?${params.toString()}`);
  }
}

function stripTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function parseEnvBoolean(value) {
  if (value === undefined) {
    return undefined;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}
