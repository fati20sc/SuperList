// Divide js/09-views.js (que había quedado en 1700 líneas) en seis módulos por
// responsabilidad. El build los vuelve a concatenar en el mismo orden, así que
// app.js no cambia ni un byte.
//
//   node tools/split-views.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "js", "09-views.js");
const source = fs.readFileSync(src, "utf8");
const lines = source.split("\n");

const SECTIONS = [
  ["09a-views-shell.js", 1, 431, "Armazon de la app: render(), menu lateral, pantalla de acceso y reinicio de contrasena."],
  ["09b-views-screens.js", 432, 928, "Las pantallas: Inicio, Inventario, Detalle, Compras, Mis listas y Mi cuenta."],
  ["09c-views-theme.js", 929, 1059, "Dialogo de tema y paleta: markup, apertura y binding de los controles."],
  ["09d-views-shared.js", 1060, 1342, "Piezas compartidas entre pantallas: codigo de invitacion, miembros y tarjetas de producto."],
  ["09e-actions.js", 1343, 1625, "Delegacion de clics y acciones destructivas: borrar producto, lista y quitar miembros."],
  ["09f-utils-init.js", 1626, lines.length, "Utilidades de render, escape de HTML e inicializacion de la app."],
];

let expected = 1;
for (const [name, from, to] of SECTIONS) {
  if (from !== expected) throw new Error(`hueco antes de ${name}: esperaba ${expected}, arranca en ${from}`);
  expected = to + 1;
}
if (expected - 1 !== lines.length) throw new Error("la ultima seccion no llega al final del archivo");

for (const [name, from, to, description] of SECTIONS) {
  const bar = "// ".padEnd(74, "=");
  const header = [bar, `// ${name}`, "//", `// ${description}`, bar, ""].join("\n");
  fs.writeFileSync(path.join(root, "js", name), header + lines.slice(from - 1, to).join("\n"), "utf8");
  console.log(`${name.padEnd(24)} ${String(to - from + 1).padStart(5)} lineas  ${description.slice(0, 40)}`);
}

// Borra el modulo gigante, que ya quedo repartido.
fs.unlinkSync(src);

console.log("\n09-views.js fue eliminado. Corre 'npm run build' para rearmar app.js.");
