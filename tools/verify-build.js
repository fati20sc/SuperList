// Verifica que app.js este sincronizado con los modulos de js/.
//
// Compara el contenido ya normalizado (sin depender de CRLF/LF), porque el
// runner de GitHub usa Linux y la maquina de desarrollo Windows, y git
// normaliza los finales de linea distinto en cada caso. Un `git diff` en el
// workflow daba falsos negativos por eso.
//
//   node tools/verify-build.js
// Salida: 0 si esta sincronizado, 1 si no.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const srcDir = path.join(root, "js");
const outFile = path.join(root, "app.js");

const normalize = (text) => text.replace(/\r\n/g, "\n").replace(/\s+$/, "");

const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".js")).sort();
const expected = normalize(files.map((f) => fs.readFileSync(path.join(srcDir, f), "utf8")).join("\n"));
const actual = normalize(fs.readFileSync(outFile, "utf8"));

if (expected === actual) {
  console.log(`OK: app.js coincide con los ${files.length} modulos de js/`);
  process.exit(0);
}

console.error("ERROR: app.js NO coincide con js/.");
console.error("Si editaste los modulos, corré 'npm run build' y commiteá el resultado.");
// Muestra la primera linea en la que difieren, para ubicarla rapido.
const expLines = expected.split("\n");
const actLines = actual.split("\n");
for (let i = 0; i < Math.max(expLines.length, actLines.length); i++) {
  if (expLines[i] !== actLines[i]) {
    console.error(`primera diferencia en la linea ${i + 1}:`);
    console.error(`  esperado: ${JSON.stringify(expLines[i])}`);
    console.error(`  actual:   ${JSON.stringify(actLines[i])}`);
    break;
  }
}
process.exit(1);
