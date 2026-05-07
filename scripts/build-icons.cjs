/**
 * Rasterize build/icon.svg into the assets electron-builder needs.
 *
 * Outputs:
 *   build/icon.png        — 1024x1024 master (used by macOS .icns + Linux AppImage)
 *   build/icon.ico        — multi-resolution Windows icon (16/24/32/48/64/128/256)
 *   build/icons/*.png     — pre-rasterized sizes (kept around for AppImage/manifest use)
 *
 * Run via `npm run icons` whenever build/icon.svg changes.
 */
const fs = require("node:fs");
const path = require("node:path");
const { Resvg } = require("@resvg/resvg-js");
const pngToIco = require("png-to-ico");

const ROOT = path.resolve(__dirname, "..");
const BUILD_DIR = path.join(ROOT, "build");
const ICONS_DIR = path.join(BUILD_DIR, "icons");
const SVG_PATH = path.join(BUILD_DIR, "icon.svg");

const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

function renderPng(svg, size) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    background: "rgba(0, 0, 0, 0)",
    shapeRendering: 2,
    textRendering: 2,
    imageRendering: 0,
  });
  return resvg.render().asPng();
}

async function main() {
  if (!fs.existsSync(SVG_PATH)) {
    console.error(`[icons] missing master SVG at ${SVG_PATH}`);
    process.exit(1);
  }
  fs.mkdirSync(ICONS_DIR, { recursive: true });
  const svg = fs.readFileSync(SVG_PATH);

  for (const size of SIZES) {
    const png = renderPng(svg, size);
    fs.writeFileSync(path.join(ICONS_DIR, `${size}x${size}.png`), png);
  }
  console.log(`[icons] wrote ${SIZES.length} PNGs to build/icons/`);

  // Master used by electron-builder for macOS .icns auto-conversion + Linux.
  fs.copyFileSync(path.join(ICONS_DIR, "1024x1024.png"), path.join(BUILD_DIR, "icon.png"));
  console.log("[icons] wrote build/icon.png");

  // Windows .ico: bundle the smaller sizes for crisp Start menu / taskbar / explorer.
  const icoBuffers = ICO_SIZES.map((s) => fs.readFileSync(path.join(ICONS_DIR, `${s}x${s}.png`)));
  const icoBuffer = await pngToIco(icoBuffers);
  fs.writeFileSync(path.join(BUILD_DIR, "icon.ico"), icoBuffer);
  console.log("[icons] wrote build/icon.ico");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
