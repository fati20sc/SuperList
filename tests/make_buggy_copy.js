// Comprueba que el test de humo REALMENTE detecte la fuga de memoria.
// Genera _app_buggy.js: una copia de app.js con el bug original, donde el
// listener de document se registra pero nunca se saca. Sirve para confirmar
// que el test no pasa por casualidad.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "app.js"), "utf8");

const FIX_CLOSE = [
  "  let outsideHandler = null;",
  "  const close = () => {",
  '    if (outsideHandler) {',
  '      document.removeEventListener("click", outsideHandler, true);',
  "      outsideHandler = null;",
  "    }",
  "    picker.remove();",
  "  };",
].join("\n");

const FIX_ADDER = [
  "    outsideHandler = (event) => {",
  "      if (!picker.contains(event.target) && event.target !== input) close();",
  "    };",
  '    document.addEventListener("click", outsideHandler, true);',
].join("\n");

const BUG_CLOSE = "  const close = () => picker.remove();";
const BUG_ADDER = [
  '    document.addEventListener("click", (event) => {',
  "      if (!picker.contains(event.target) && event.target !== input) close();",
  "    });",
].join("\n");

const hasFix = src.includes(FIX_CLOSE) && src.includes(FIX_ADDER);
const buggy = src.replace(FIX_CLOSE, BUG_CLOSE).replace(FIX_ADDER, BUG_ADDER);
const reverted = buggy !== src && !buggy.includes("outsideHandler");

fs.writeFileSync(path.join(root, "_app_buggy.js"), buggy, "utf8");

console.log("app.js tiene el fix:", hasFix);
console.log("copia con el bug generada:", reverted);
console.log("la copia NO tiene outsideHandler:", !buggy.includes("outsideHandler"));
console.log("la copia vuelve a sumar listeners sin quitar:", buggy.includes('document.addEventListener("click", (event)'));
