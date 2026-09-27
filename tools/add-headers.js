// Agrega (o renueva) el encabezado descriptivo de cada modulo de js/.
//   node tools/add-headers.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const srcDir = path.join(root, "js");

const HEADERS = {
  "00-header.js": [
    "Constantes de la app, claves de storage y configuracion de Supabase.",
    "Es el primer modulo: define cosas que usan todos los demas.",
  ],
  "01-theme.js": [
    "Sistema de temas y paletas.",
    "Modos claro/oscuro/auto, paletas por nombre, y el selector de tema.",
  ],
  "02-notifications.js": [
    "Notificaciones internas de las listas compartidas.",
    "Avisos en pantalla, historial, y el puente con Supabase Realtime.",
  ],
  "03-state-and-dialogs.js": [
    "Estado global, referencias al DOM, menu lateral y dialogos.",
    "Guarda el estado en memoria y engancha los formularios de index.html.",
  ],
  "04-data-and-supabase.js": [
    "Persistencia y acceso a Supabase.",
    "Carga de datos, mapeo entre filas y objetos, y la suscripcion Realtime.",
  ],
  "05-utils.js": [
    "Utilidades puras: escape, formato de fechas, emojis y codigos.",
    "Sin efectos secundarios: se pueden usar y probar aisladas.",
  ],
  "06-auth.js": [
    "Autenticacion: crear cuenta, iniciar sesion y cerrar sesion.",
  ],
  "07-groups.js": [
    "Listas compartidas: crear, editar, solicitar ingreso y miembros.",
    "Incluye el flujo de aprobacion: el admin acepta o rechaza solicitudes.",
  ],
  "08-products.js": [
    "Productos: alta, edicion, estados, cantidades y marcado como comprado.",
  ],
  "09-views.js": [
    "Todas las vistas (funciones render) y sus plantillas HTML.",
    "Es el modulo mas grande: cada render dibuja una pantalla completa en #app.",
  ],
  "10-boot.js": [
    "Arranque: registro del service worker e inicializacion de la app.",
    "Va ultimo porque se ejecuta cuando todo lo demas ya esta definido.",
  ],
};

const bar = "// ".padEnd(74, "=");
const headerBlock = /^\/\/ =+\n(?:\/\/.*\n)*\/\/ =+\n+/;

for (const [file, description] of Object.entries(HEADERS)) {
  const full = path.join(srcDir, file);
  if (!fs.existsSync(full)) {
    console.log(`falta ${file}, se omite`);
    continue;
  }
  // Quita el encabezado previo para que el script se pueda volver a correr.
  const body = fs.readFileSync(full, "utf8").replace(headerBlock, "");
  const header = [bar, `// ${file}`, "//", ...description.map((l) => `// ${l}`), bar, ""].join("\n");
  fs.writeFileSync(full, header + body, "utf8");
  console.log(`encabezado: ${file}`);
}
