// Convierte las imagenes grandes a WebP para reducir lo que baja el usuario.
// WebP es soportado por Android WebView y por todos los navegadores actuales.
// Los .png originales se conservan por si se necesita volver atrás.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");

// Archivos grandes: [nombre, calidad]
const TARGETS = [
  { file: "SUPERMERCADO.png", quality: 78 },
  { file: "logo.png", quality: 85 },
  { file: "superlist.png", quality: 85 },
  { file: "app-icon.png", quality: 90 },
  { file: "logo-512.png", quality: 90 },
];

(async () => {
  let before = 0;
  let after = 0;

  for (const { file, quality } of TARGETS) {
    const src = path.join(root, file);
    if (!fs.existsSync(src)) continue;

    const out = path.join(root, file.replace(/\.png$/i, ".webp"));
    const meta = await sharp(src).metadata();
    // Si el PNG es transparente, WebP con alpha para que no se vea fondo negro.
    const buffer = await sharp(src)
      .webp({ quality, alphaQuality: 100, effort: 6 })
      .toBuffer();
    fs.writeFileSync(out, buffer);

    const kbBefore = fs.statSync(src).size / 1024;
    const kbAfter = buffer.length / 1024;
    before += kbBefore;
    after += kbAfter;
    console.log(
      `${file.padEnd(18)} ${String(Math.round(kbBefore)).padStart(5)} KB -> ` +
      `${String(Math.round(kbAfter)).padStart(4)} KB  ` +
      `(-${Math.round((1 - kbAfter / kbBefore) * 100)}%)  ` +
      `${meta.width}x${meta.height} ${meta.hasAlpha ? "alpha" : "opaco"}`
    );
  }

  console.log(`\nTotal: ${Math.round(before)} KB -> ${Math.round(after)} KB ` +
    `(ahorra ${Math.round(before - after)} KB, -${Math.round((1 - after / before) * 100)}%)`);
})();
