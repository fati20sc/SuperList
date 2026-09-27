// Escanea el proyecto buscando caracteres no esperados: mojibake y
// caracteres CJK (chino/japones/coreano) que se hayan colado por error.
//
// Los caracteres de ejemplo se escriben con escapes unicode para que este
// archivo no se detecte a si mismo.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const SKIP = new Set(["node_modules", ".git", "www", "android", "outputs"]);

const TEXT_EXT = [".js", ".mjs", ".cjs", ".json", ".css", ".html", ".sql", ".md", ".yml", ".yaml", ".txt"];
const MOJIBAKE = /[\u00C3\u00C2\u00E2\u20AC]/;
const CJK = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;

const hits = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name)) continue;
      walk(path.join(dir, entry.name));
      continue;
    }
    const full = path.join(dir, entry.name);
    const ext = path.extname(entry.name) || (entry.name.startsWith(".") ? entry.name : "");
    if (!TEXT_EXT.includes(ext)) continue;

    const text = fs.readFileSync(full, "utf8");
    text.split("\n").forEach((line, i) => {
      if (MOJIBAKE.test(line)) hits.push({ file: path.relative(root, full), line: i + 1, kind: "mojibake", text: line.trim().slice(0, 70) });
      else if (CJK.test(line)) hits.push({ file: path.relative(root, full), line: i + 1, kind: "CJK", text: line.trim().slice(0, 70) });
    });
  }
}

walk(root);

if (!hits.length) {
  console.log("OK: no hay mojibake ni caracteres CJK en el proyecto.");
  process.exit(0);
}

console.log(`Encontrados ${hits.length} problemas:\n`);
for (const h of hits) {
  console.log(`  [${h.kind}] ${h.file}:${h.line}`);
  console.log(`      ${h.text}`);
}
process.exit(1);
