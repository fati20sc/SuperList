const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const schema = fs.readFileSync(path.join(root, "supabase_schema.sql"), "utf8");
const lines = app.split(/\r?\n/);

console.log("=== A) CLAVES / SECRETOS EN EL CODIGO ===");
lines.forEach((l, i) => {
  const m = l.match(/(sb_[a-z]+_[A-Za-z0-9]+|sb_secret_[A-Za-z0-9]+|eyJ[A-Za-z0-9._-]{20,})/g);
  if (m) {
    const kind = m[0].startsWith("sb_secret") ? "SECRETA!!" : m[0].startsWith("sb_publishable") ? "publica(ok)" : "REVISAR";
    console.log(`  L${i + 1} [${kind}] ${m[0].slice(0, 30)}...`);
  }
});

console.log("\n=== B) RIESGO XSS: innerHTML con dato sin escapeHtml ===");
let xss = 0;
lines.forEach((l, i) => {
  if (!/\$\{/.test(l)) return;
  for (const m of l.matchAll(/\$\{([^}]*)\}/g)) {
    const expr = m[1].trim();
    if (!expr || /escapeHtml/.test(expr)) continue;
    const safe = /^(clean|createId|formatDate|formatTimeAgo|countByStatus|getUserDisplayName|getPaletteById|themeModeIcon|STATUSES|THEME_|PALETTES|INITIAL_CATEGORIES|Math\.|Number\.|String\(|JSON\.|\.length|parseInt|parseFloat|\?|:|&&|\|\||!|===|==|new Date|toUpperCase|toFixed|\.join|\.map|\.filter|\.slice|\.sort|\.includes|true|false|null|undefined)/.test(expr);
    const looksLikeUserData = /name|email|title|note|brand|unit|category|message|user|code|address|list/i.test(expr);
    if (!safe && looksLikeUserData) { console.log(`  L${i + 1}: \${${expr.slice(0, 60)}}`); xss++; }
  }
});
console.log(xss ? `  total: ${xss}` : "  ninguno evidente");

console.log("\n=== C) RLS: politicas por tabla ===");
const tables = [...new Set([...schema.matchAll(/ON public\.(\w+)/g)].map((m) => m[1]))];
tables.forEach((t) => {
  const pol = [...schema.matchAll(new RegExp(`CREATE POLICY[^;]*?ON public\\.${t}[\\s\\S]*?;`, "g"))].length;
  const rls = new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`).test(schema);
  console.log(`  ${t}: ${pol} politicas | RLS ${rls ? "activo" : "NO!!"}`);
});

console.log("\n=== D) invoke('admin'|'security definer'|'authenticated') ===");
lines.forEach((l, i) => {
  const m = l.match(/supabaseClient\.rpc\(|supabase\.rpc\(/);
  if (m) console.log(`  L${i + 1}: ${l.trim().slice(0, 80)}`);
});

console.log("\n=== E) MANEJO DE ERRORES: awaits sin try/catch en eventos ===");
let risky = 0;
lines.forEach((l, i) => {
  if (/addEventListener\(["']click["'],\s*async/.test(l) && !/try/.test(lines[i + 1] || "") && !/try/.test(l)) {
    // se marca solo si el cuerpo tiene varios awaits seguidos
    const body = lines.slice(i, i + 30).join("\n");
    const awaits = (body.match(/await /g) || []).length;
    if (awaits >= 3) { console.log(`  L${i + 1}: listener async con ${awaits} awaits`); risky++; }
  }
});
console.log(risky ? `  total: ${risky}` : "  ninguno");

console.log("\n=== F) event listeners que se re-agregan en cada render ===");
const reAdd = ["addEventListener"];
const docAdd = lines.filter((l) => /document\.addEventListener/.test(l)).length;
console.log(`  document.addEventListener en app.js: ${docAdd} (si estan fuera de init, se duplican)`);
lines.forEach((l, i) => { if (/^initApp\(\)|^setup|^\s*bindCommonActions\(\);?\s*$/.test(l.trim()) && i < 300) console.log(`  L${i + 1}: ${l.trim()}`); });

console.log("\n=== G) POSIBLES FUGAS DE MEMORIA (setInterval/setTimeout sin clear) ===");
lines.forEach((l, i) => { if (/setInterval/.test(l)) console.log(`  L${i + 1}: ${l.trim().slice(0, 70)}`); });

