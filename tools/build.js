// Concatena los modulos de js/ en app.js, en orden alfabetico (el prefijo
// numerico define el orden). El resultado es lo que se carga en el navegador y
// lo que se empaqueta en el APK.
//
//   node tools/build.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const srcDir = path.join(root, "js");
const outFile = path.join(root, "app.js");

const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".js")).sort();
if (!files.length) {
  throw new Error("no hay modulos en js/. Si acabas de partir app.js, corre tools/split.js");
}

const parts = files.map((f) => fs.readFileSync(path.join(srcDir, f), "utf8"));
const bundle = parts.join("\n");

// El bundle tiene que ser JS valido antes de pisar el archivo que se sirve.
try {
  // eslint-disable-next-line no-new-func
  new Function(bundle);
} catch (e) {
  throw new Error(`el bundle generado tiene un error de sintaxis: ${e.message}`);
}

const previous = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8") : null;
fs.writeFileSync(outFile, bundle, "utf8");

console.log(`app.js generado desde ${files.length} modulos (${bundle.split("\n").length} lineas)`);
files.forEach((f) => console.log(`  - ${f}`));
console.log(`cambio respecto del anterior: ${previous !== null && previous !== bundle ? "SI" : "no"}`);
