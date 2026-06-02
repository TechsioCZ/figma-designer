const generationPageName = "Generation Workspace";

async function loadPreferredFont(style) {
  const fonts = await figma.listAvailableFontsAsync();
  const inter = fonts.find((font) => font.fontName.family === "Inter" && font.fontName.style === style);
  const fallback = fonts.find((font) => font.fontName.family === "Inter") ?? fonts[0];
  const fontName = inter?.fontName ?? fallback?.fontName ?? { family: "Inter", style: "Regular" };
  await figma.loadFontAsync(fontName);
  return fontName;
}

const regularFont = await loadPreferredFont("Regular");
const boldFont = await loadPreferredFont("Bold");
const semiBoldFont = await loadPreferredFont("Semi Bold");

function solid(hex) {
  const value = hex.replace("#", "");
  return {
    type: "SOLID",
    color: {
      r: Number.parseInt(value.slice(0, 2), 16) / 255,
      g: Number.parseInt(value.slice(2, 4), 16) / 255,
      b: Number.parseInt(value.slice(4, 6), 16) / 255
    }
  };
}

function autoFrame(name, direction = "VERTICAL") {
  const frame = figma.createFrame();
  frame.name = name;
  frame.layoutMode = direction;
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.itemSpacing = 16;
  frame.paddingTop = 24;
  frame.paddingRight = 24;
  frame.paddingBottom = 24;
  frame.paddingLeft = 24;
  frame.fills = [];
  return frame;
}

function text(name, characters, options = {}) {
  const node = figma.createText();
  node.name = name;
  node.fontName = options.font ?? regularFont;
  node.fontSize = options.size ?? 16;
  node.lineHeight = { unit: "AUTO" };
  node.fills = [solid(options.color ?? "#101828")];
  node.characters = characters;
  return node;
}

let page = figma.root.children.find((child) => child.name === generationPageName);
if (!page) {
  page = figma.createPage();
  page.name = generationPageName;
}

await figma.setCurrentPageAsync(page);

const existingBootstrap = page.children.find((child) => child.name === "Bootstrap Probe");
const existingSeed = page.children.find((child) => child.name === "Discovery Seed");

if (existingBootstrap && existingSeed) {
  figma.currentPage.selection = [existingBootstrap];
  return {
    ok: true,
    reused: true,
    generationPageId: page.id,
    bootstrapNodeId: existingBootstrap.id,
    discoverySeedNodeId: existingSeed.id,
    createdNodeIds: []
  };
}

const maxX = page.children.reduce((max, child) => Math.max(max, child.x + child.width), 0);

const bootstrap = autoFrame("Bootstrap Probe");
bootstrap.resize(1440, 820);
bootstrap.primaryAxisAlignItems = "CENTER";
bootstrap.counterAxisAlignItems = "CENTER";
bootstrap.x = maxX + 200;
bootstrap.y = 0;
bootstrap.fills = [solid("#ffffff")];

const bootTitle = text("Starter title", "Figma Designer Starter", {
  font: boldFont,
  size: 44,
  color: "#0f172a"
});
const bootBody = text(
  "Starter body",
  "This frame proves Codex can write to the file, capture screenshots, and seed a Generation Workspace.",
  { size: 20, color: "#1f2937" }
);
bootBody.resize(760, bootBody.height);
bootstrap.appendChild(bootTitle);
bootstrap.appendChild(bootBody);

const discovery = autoFrame("Discovery Seed");
discovery.resize(1440, 900);
discovery.x = bootstrap.x;
discovery.y = bootstrap.y + bootstrap.height + 96;
discovery.fills = [solid("#f8fafc")];
discovery.counterAxisSizingMode = "FIXED";
discovery.layoutSizingHorizontal = "FIXED";
discovery.itemSpacing = 24;

const header = autoFrame("Starter Header", "HORIZONTAL");
header.resize(1392, 96);
header.counterAxisSizingMode = "FIXED";
header.primaryAxisAlignItems = "SPACE_BETWEEN";
header.counterAxisAlignItems = "CENTER";
header.fills = [solid("#ffffff")];
header.cornerRadius = 16;
header.strokes = [solid("#d0d5dd")];
header.strokeWeight = 1;

header.appendChild(text("Brand", "New Engine Commerce", { font: boldFont, size: 24, color: "#111827" }));

const nav = autoFrame("Starter Nav", "HORIZONTAL");
nav.paddingTop = 0;
nav.paddingRight = 0;
nav.paddingBottom = 0;
nav.paddingLeft = 0;
nav.itemSpacing = 28;
nav.appendChild(text("Nav item", "Products", { font: semiBoldFont, size: 15, color: "#1f2937" }));
nav.appendChild(text("Nav item", "Collections", { font: semiBoldFont, size: 15, color: "#1f2937" }));
nav.appendChild(text("Nav item", "Orders", { font: semiBoldFont, size: 15, color: "#1f2937" }));
header.appendChild(nav);

const button = autoFrame("Primary Button", "HORIZONTAL");
button.paddingTop = 12;
button.paddingRight = 18;
button.paddingBottom = 12;
button.paddingLeft = 18;
button.cornerRadius = 10;
button.fills = [solid("#173ea8")];
button.appendChild(text("Button label", "Open cart", { font: semiBoldFont, size: 15, color: "#ffffff" }));
header.appendChild(button);

const body = autoFrame("Starter Body", "HORIZONTAL");
body.resize(1392, 520);
body.counterAxisSizingMode = "FIXED";
body.itemSpacing = 24;
body.paddingTop = 0;
body.paddingRight = 0;
body.paddingBottom = 0;
body.paddingLeft = 0;

const hero = autoFrame("Starter Hero");
hero.resize(880, 520);
hero.counterAxisSizingMode = "FIXED";
hero.itemSpacing = 20;
hero.cornerRadius = 20;
hero.fills = [solid("#dbeafe")];
hero.appendChild(text("Eyebrow", "SPRING DROP", { font: semiBoldFont, size: 14, color: "#173ea8" }));
hero.appendChild(text("Hero title", "Accessible commerce patterns, ready for design-system validation.", {
  font: boldFont,
  size: 42,
  color: "#0f172a"
}));
hero.appendChild(text("Hero copy", "Use this seeded workspace as the first screenshot target, then replace it with real generated customer screens.", {
  size: 18,
  color: "#1f2937"
}));

const product = autoFrame("Starter Product Card");
product.resize(464, 520);
product.counterAxisSizingMode = "FIXED";
product.cornerRadius = 20;
product.fills = [solid("#ffffff")];
product.strokes = [solid("#d0d5dd")];
product.strokeWeight = 1;

const media = figma.createRectangle();
media.name = "Product media placeholder";
media.resize(416, 260);
media.cornerRadius = 16;
media.fills = [solid("#e5e7eb")];
product.appendChild(media);
product.appendChild(text("Product name", "Modular travel pack", { font: boldFont, size: 26, color: "#111827" }));
product.appendChild(text("Product meta", "In stock · Ships tomorrow", { size: 16, color: "#14532d" }));
product.appendChild(text("Product price", "$129.00", { font: boldFont, size: 30, color: "#111827" }));

body.appendChild(hero);
body.appendChild(product);

discovery.appendChild(header);
discovery.appendChild(body);

figma.currentPage.appendChild(bootstrap);
figma.currentPage.appendChild(discovery);
figma.currentPage.selection = [bootstrap];
figma.viewport.scrollAndZoomIntoView([bootstrap, discovery]);

return {
  ok: true,
  reused: false,
  generationPageId: page.id,
  bootstrapNodeId: bootstrap.id,
  discoverySeedNodeId: discovery.id,
  createdNodeIds: [
    bootstrap.id,
    discovery.id,
    header.id,
    body.id,
    hero.id,
    product.id
  ]
};
