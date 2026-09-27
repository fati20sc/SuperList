// =======================================================================
// tools/check-sql.js
//
// Revisa la sintaxis de los .sql del proyecto con el parser real de PostgreSQL.
//
// POR QUE EXISTE: el SQL de la migracion incluye triggers, que son la parte
// donde mas se escapa un error y donde mas cuesta verlo: un trigger con la
// sintaxis casi correcta compila bien y revienta recien cuando alguien toca un
// producto en produccion. Con esto, el error aparece en el build.
//
// OJO: esto valida SINTAXIS, no comportamiento. Que el SQL sea valido no
// significa que el trigger haga lo que uno espera; para eso hay que probarlo
// contra una base real.
//
//   node tools/check-sql.js
// =======================================================================

const fs = require("fs");
const path = require("path");

let parse;
try {
  // libpg-query es el parser oficial de PostgreSQL, compilado a WebAssembly.
  ({ parse } = require("libpg-query"));
} catch {
  console.log("libpg-query no esta instalado. Se saltea la revision de SQL.");
  console.log("Para activarla: npm install --no-save libpg-query");
  process.exit(0);
}

const root = path.join(__dirname, "..");
const targets = fs
  .readdirSync(root)
  .filter((f) => f.endsWith(".sql"));

if (!targets.length) {
  console.log("No hay archivos .sql para revisar.");
  process.exit(0);
}

let failed = false;

for (const file of targets) {
  const fullPath = path.join(root, file);
  const sql = fs.readFileSync(fullPath, "utf8");

  try {
    parse(sql);
    console.log(`OK  ${file}`);
  } catch (error) {
    failed = true;
    // cursorPosition viene en bytes desde el inicio; sirve para ubicar el error.
    const position = error?.cursorPosition;
    let where = "";
    if (typeof position === "number") {
      const line = sql.slice(0, position).split("\n").length;
      where = ` (cerca de la linea ${line})`;
    }
    console.error(`MAL ${file}${where}: ${error.message}`);
  }
}

if (failed) {
  console.error("\nHay SQL con errores de sintaxis.");
  process.exit(1);
}

console.log("\nTodo el SQL tiene sintaxis valida.");
