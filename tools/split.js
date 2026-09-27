// Parte app.js en modulos por seccion, para poder trabajar sobre partes chicas.
// El build (tools/build.js) vuelve a concatenarlos en app.js. El orden y el
// contenido son exactamente los mismos, asi que el archivo generado es
// identico byte a byte al actual: no cambia nada en tiempo de ejecucion.
//
//   node tools/split.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const lines = source.split("\n");
const outDir = path.join(root, "js");

// [archivo, linea inicial (1-based), linea final (1-based, inclusiva)]
const SECTIONS = [
  ["00-header.js", 1, 48],
  ["01-theme.js", 49, 218],
  ["02-notifications.js", 219, 530],
  ["03-state-and-dialogs.js", 531, 1118],
  ["04-data-and-supabase.js", 1119, 1600],
  ["05-utils.js", 1601, 1805],
  ["06-auth.js", 1806, 1876],
  ["07-groups.js", 1877, 2069],
  ["08-products.js", 2070, 2298],
  ["09-views.js", 2299, 3952],
  ["10-boot.js", 3953, lines.length],
];

// Las secciones tienen que cubrir el archivo entero, sin huecos ni solapes.
let expected = 1;
for (const [name, from, to] of SECTIONS) {
  if (from !== expected) {
    throw new Error(`hueco o solapamiento antes de ${name}: esperaba ${expected}, arranca en ${from}`);
  }
  expected = to + 1;
}
if (expected - 1 !== lines.length) {
  throw new Error(`la ultima seccion termina en ${expected - 1} pero el archivo tiene ${lines.length} lineas`);
}

fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) {
  if (f.endsWith(".js")) fs.unlinkSync(path.join(outDir, f));
}

for (const [name, from, to] of SECTIONS) {
  const chunk = lines.slice(from - 1, to).join("\n");
  fs.writeFileSync(path.join(outDir, name), chunk, "utf8");
  console.log(`${name.padEnd(26)} lineas ${String(from).padStart(5)}-${String(to).padEnd(5)} (${to - from + 1})`);
}

// Prueba de que no se perdio nada: reconstruir y comparar con el original.
const rebuilt = SECTIONS
  .map(([name]) => fs.readFileSync(path.join(outDir, name), "utf8"))
  .join("\n");
console.log(`\nreconstruccion identica al original: ${rebuilt === source}`);
if (rebuilt !== source) {
  throw new Error("la reconstruccion NO coincide con app.js");
}
