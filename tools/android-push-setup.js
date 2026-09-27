// =======================================================================
// tools/android-push-setup.js
//
// Prepara el proyecto de Android para notificaciones push con Firebase.
//
// POR QUE ESTE SCRIPT EXISTE: "npx cap add android" genera el proyecto desde
// cero en cada build de GitHub Actions, asi que cualquier cambio hecho a mano
// en android/ se pierde. Este script aplica los parches siempre, en un solo
// lugar, y es idempotente (si corre dos veces no rompe nada).
//
// HACE DOS COSAS:
//   1) Agrega el plugin de Google que lee google-services.json y escribe el
//      proyecto Firebase que necesita @capacitor/push-notifications.
//   2) Fuerza que el APK se firme con una clave FIJA (android-keys/upload.keystore).
//      Esto es lo que hace que FCM funcione: Google identifica al telefono por
//      el certificado que firma el APK. Si cada build generara una clave nueva,
//      Google rechazaria el token y las notificaciones nunca llegarian.
//
// QUE PASA SI FALTA ALGO: no rompe el build. Si no esta la clave, avisa y deja
// el proyecto como estaba. El APK se genera igual, solo que sin push nativo.
// =======================================================================

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ANDROID = path.join(ROOT, "android");
const KEYSTORE = path.join(ROOT, "android-keys", "upload.keystore");
const KEYSTORE_PASSWORD = "superlist";

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function write(file, content) {
  fs.writeFileSync(file, content, "utf8");
}

function log(message) {
  console.log(`  ${message}`);
}

// ---------------------------------------------------------------------------
// 1) Plugin de Google para Firebase
// ---------------------------------------------------------------------------

// OJO, esto ya lo hace Capacitor solo: cuando genera android/app/build.gradle
// deja un bloque try/catch que aplica com.google.gms.google-services SOLO si
// encuentra google-services.json. Ese bloque esta al final del archivo.
//
// Agregarlo de nuevo aca seria contraproducente: aplicarlo dos veces rompe el
// build. Asi que esta funcion no parchea nada, solo verifica y avisa. Si una
// version futura de Capacitor dejara de hacerlo, el warning lo delata.
function checkFirebasePlugin() {
  const appGradle = path.join(ANDROID, "app", "build.gradle");
  const rootGradle = path.join(ANDROID, "build.gradle");

  if (!fs.existsSync(appGradle) || !fs.existsSync(rootGradle)) {
    log("No se encontraron los build.gradle: se omite la revision de Firebase.");
    return;
  }

  const app = read(appGradle);
  const root = read(rootGradle);

  if (app.includes("com.google.gms.google-services")) {
    log("Capacitor ya aplica el plugin de Google Services por su cuenta. OK.");
  } else {
    log("AVISO: el plugin de Google Services no esta en app/build.gradle.");
    log("  Las notificaciones push no van a funcionar hasta arreglar esto.");
  }

  if (!root.includes("com.google.gms:google-services")) {
    log("AVISO: falta la clase de Google Services en android/build.gradle.");
  }
}

// ---------------------------------------------------------------------------
// 2) Clave de firma fija
// ---------------------------------------------------------------------------

// La clave va en el bloque signingConfigs del build.gradle de la app, y
// buildTypes.debug tiene que usarla. Sin esto, Gradle genera una clave
// aleatoria en cada build y FCM deja de funcionar.
function applyFixedSigningKey() {
  if (!fs.existsSync(KEYSTORE)) {
    log("No esta android-keys/upload.keystore: se deja la clave que genera Gradle.");
    log("  OJO: sin esta clave las notificaciones push NO van a funcionar en el APK.");
    return false;
  }

  const file = path.join(ANDROID, "app", "build.gradle");
  if (!fs.existsSync(file)) {
    log("No se encontro android/app/build.gradle: se omite la clave de firma.");
    return false;
  }

  let gradle = read(file);

  if (gradle.includes('storeFile file("../../android-keys/upload.keystore")')) {
    log("La clave de firma fija ya estaba aplicada.");
    return true;
  }

  // El signingConfig se declara adentro del bloque android.
  const signingConfig = `
    signingConfigs {
        release {
            storeFile file("../../android-keys/upload.keystore")
            storePassword "${KEYSTORE_PASSWORD}"
            keyAlias "superlist-upload"
            keyPassword "${KEYSTORE_PASSWORD}"
        }
    }
`;

  gradle = gradle.replace(/(android\s*\{)/, `$1${signingConfig}`);

  // El APK que publicamos es assembleDebug, asi que es el buildType "debug" el
  // que tiene que usar la clave fija. El archivo que genera Capacitor solo trae
  // un bloque "release", asi que hay que agregar "debug" a mano.
  if (!gradle.includes("signingConfig signingConfigs.release")) {
    gradle = gradle.replace(
      /(buildTypes\s*\{\s*\n)(\s*)(release\s*\{)/,
      `$1$2debug {
$2    signingConfig signingConfigs.release
$2}
$2$3`
    );
  }

  write(file, gradle);
  log("Aplicada la clave de firma fija al buildType debug.");
  return true;
}

// ---------------------------------------------------------------------------

function main() {
  console.log("Configurando el proyecto Android para push con Firebase...");

  if (!fs.existsSync(ANDROID)) {
    console.log("El proyecto android/ todavia no existe. Se omite todo.");
    return;
  }

  checkFirebasePlugin();
  applyFixedSigningKey();

  console.log("Listo.");
}

main();
