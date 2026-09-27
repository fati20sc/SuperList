// Borra renderGroupStart: quedo muerta cuando la pantalla de bienvenida se
// reemplazo por la vista de "Mis listas". Se hace con Node para no romper el
// encoding UTF-8 del archivo (Set-Content en PowerShell lo corrompe).
const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "..", "app.js");
const src = fs.readFileSync(file, "utf8");
const lines = src.split("\n");

const start = lines.findIndex((l) => /^function renderGroupStart\(\)/.test(l));
if (start === -1) {
  console.log("renderGroupStart: no encontrada (ya estaba eliminada)");
} else {
  let end = start;
  for (let i = start; i < lines.length; i++) {
    if (/^\}/.test(lines[i])) { end = i; break; }
  }
  const removed = end - start + 1;
  lines.splice(start, removed);
  fs.writeFileSync(file, lines.join("\n"), "utf8");
  console.log(`renderGroupStart: eliminadas ${removed} lineas`);
}
console.log(`app.js ahora tiene ${lines.length} lineas`);

