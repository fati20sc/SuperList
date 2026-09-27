// Apunta el codigo a las versiones .webp (mucho mas livianas) sin tocar los
// .png, que se conservan como respaldo.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

const RULES = [
  ['src="./superlist.png"', 'src="./superlist.webp"'],
  ['src="./logo.png"', 'src="./logo.webp"'],
  ['src="./SUPERMERCADO.png"', 'src="./SUPERMERCADO.webp"'],
  ['href="./logo.png" type="image/png"', 'href="./logo.webp" type="image/webp"'],
  ['"./app-icon.png"', '"./app-icon.webp"'],
  ['"./app-icon-192.png"', '"./app-icon-192.webp"'],
  ['"./logo.png"', '"./logo.webp"'],
  ['"./logo-512.png"', '"./logo-512.webp"'],
  ['"./SUPERMERCADO.png"', '"./SUPERMERCADO.webp"'],
  ['"./superlist.png"', '"./superlist.webp"'],
];

for (const file of ["app.js", "index.html", "sw.js", "manifest.json"]) {
  const full = path.join(root, file);
  let text = fs.readFileSync(full, "utf8");
  const before = text;
  for (const [from, to] of RULES) text = text.split(from).join(to);
  if (text !== before) {
    fs.writeFileSync(full, text, "utf8");
    console.log(`actualizado: ${file}`);
  }
}

// El manifest tambien necesita el type correcto para webp.
const mfPath = path.join(root, "manifest.json");
let mf = fs.readFileSync(mfPath, "utf8");
mf = mf.replace(/"src": "\.\/app-icon\.webp",\s*\n(\s*)"sizes": "512x512",\s*\n\s*"type": "image\/png",\s*\n\s*"purpose": "maskable"/,
  '"src": "./app-icon.webp",\n$1"sizes": "512x512",\n$1"type": "image/webp",\n$1"purpose": "maskable"');
fs.writeFileSync(mfPath, mf, "utf8");
console.log("manifest: type image/webp");
