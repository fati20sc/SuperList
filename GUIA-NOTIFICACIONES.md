# Notificaciones push de SuperList — guía de puesta en marcha

Hay **dos caminos distintos** según dónde querés recibir los avisos, y no son
mutuamente excluyentes: una persona puede tener el APK y la PWA y le llegan
por los dos.

| Dónde | Tecnología | Estado |
|---|---|---|
| Navegador / PWA | Web Push (VAPID) | Funciona, falta activar VAPID |
| APK de Android | FCM (Firebase) | **Necesitás hacer los pasos de abajo** |

La razón de que sean dos: los navegadores no tienen Push API dentro de un
WebView de Android, que es lo que usa el APK. Por eso el APK usa el plugin
nativo de Capacitor y Firebase.

---

## Parte 1 — El APK (lo que tenés que hacer vos)

Son tres pasos, en este orden. Tiempo estimado: 15-20 minutos.

### Paso 1 — Crear el proyecto en Firebase

1. Entrá a <https://console.firebase.google.com> con tu cuenta de Google.
2. **Agregar proyecto** → nombralo `superlist` → **Continuar**.
   (Google Analytics no hace falta: apagalo con **No**.)
3. Cuando termine, vas al ícono de **Configuración del proyecto** (la rueda)
   → **Tus apps** → ícono de Android `</>`.
4. Completá:
   - **Nombre de app**: `SuperList Android`
   - **Package name**: `com.rosario.superlist` ← tiene que ser exacto
5. Registrá la app y **descargá `google-services.json`**.

> `google-services.json` **no es un secreto**. Dentro de cualquier APK las
> claves de Firebase viajan en texto plano, así que subirlo al repo no agrega
> riesgo. Por eso el workflow lo toma de la raíz del repo.

### Paso 2 — Registrar la huella del APK

Firebase no manda nada hasta saber qué APK es legítimo. Para eso usa la huella
de la clave con la que está firmado. SuperList usa siempre la misma:

```
A7:FB:F6:E2:AC:94:D2:DF:90:9D:4D:2C:4E:AF:3C:27:CF:1B:2A:56
```

1. En Firebase: **Configuración del proyecto** → **Tus apps** → tu app Android.
2. Abajo del todo, en la segunda tarjeta, tocá **Agregar huella SHA-1**.
3. Pegá el valor de arriba.
4. Guardá.

> **¿Por qué una clave fija?** Si cada build usara una clave distinta, Google
> rechazaría el token y las notificaciones nunca llegarían. La clave está en
> `android-keys/upload.keystore` y el script `tools/android-push-setup.js` la
> aplica siempre.

### Paso 3 — Subir el archivo y disparar el build

1. Copiá `google-services.json` a la **raíz del repo** (junto a `index.html`).
2. `git add google-services.json && git commit -m "Configura Firebase" && git push`
3. Esperá GitHub Actions. El log dice si setook:
   ```
   google-services.json instalado: las notificaciones push van a funcionar.
   ```
4. Bajá el APK nuevo e instalalo.

### Paso 4 (opcional pero recomendado) — Que la Edge Function mande al APK

La app ya registra el token del teléfono. Falta que algo se lo mande.

1. En Firebase: **Configuración del proyecto** → **Cuentas de servicio**.
2. **Generar nueva clave privada**. Google muestra un JSON.
3. En Supabase → **Edge Functions** → `send-push` → **Secrets**:

| Nombre | Valor |
|---|---|
| `FIREBASE_PROJECT_ID` | el `project_id` del JSON |
| `FIREBASE_CLIENT_EMAIL` | el `client_email` del JSON |
| `FIREBASE_PRIVATE_KEY` | el `private_key` **completo**, con los `\n` |

4. Redeploy de la función.

Sin esto, el APK registra el token pero no llega nada. El botón de "Mi cuenta"
lo aclara en vez de fingir que anda.

---

## Parte 2 — Base de datos y Edge Function (una sola vez)

### Migración

1. Supabase → **SQL Editor** → **New query**.
2. Pegá todo el contenido de `supabase_migration_pendiente.sql`.
3. **Run**.

Verificá que se creó lo nuevo:

```sql
SELECT COUNT(*) FROM pg_tables WHERE tablename = 'device_tokens';
-- tiene que dar 1
```

### Edge Function

Supabase → **Edge Functions** → **New Function** → nombre `send-push`, pegá el
contenido de `supabase/functions/send-push/index.ts`, y en **Secrets**:

| Nombre | Para qué |
|---|---|
| `SUPABASE_VAPID_PRIVATE_KEY` | clave privada VAPID (la del navegador) |
| `SUPABASE_VAPID_SUBJECT` | `mailto:tu@email.com` |
| `FIREBASE_*` | solo si querés que el APK también notifique |

> La clave **privada** VAPID nunca va en el repo ni en el cliente. La pública sí
> está en `js/11-push.js` y es correcto que esté ahí.

---

## Cómo probar que anda

Con **dos cuentas** en dos navegadores (o un navegador y el APK):

1. Entrá con la cuenta A, activá las notificaciones.
2. Entrá con la cuenta B, activá las notificaciones.
3. Cerrá la app o la pestaña de B.
4. Desde A, agregá un producto a la lista compartida.
5. B debería ver la notificación del sistema.

Si no llega, revisá en este orden:

| Síntoma | Causa probable |
|---|---|
| El botón dice "compilado sin Firebase" | Falta `google-services.json` en el build |
| El botón dice "no disponibles acá" | Estás en el navegador: usá HTTPS o instalá la PWA |
| Registra el token pero no llega nada | Faltan los secretos `FIREBASE_*` |
| Llega en el navegador pero no en el APK | Falta registrar el SHA-1 en Firebase |
| No llega a ninguno | Falta invocar `send-push` (no hay trigger todavía) |

---

## Lo que todavía NO está hecho

- **No hay trigger que llame a `send-push`.** La función existe y está
  protegida, pero nadie la invoca automáticamente al agregar un producto. Sin
  eso, no se manda nada: hay que llamarla a mano.
- **La Edge Function no está desplegada.** Es un archivo en el repo, no algo
  corriendo.
- Falta probar en un teléfono real.

---

## Archivos que hacen que esto funcione

| Archivo | Para qué |
|---|---|
| `js/12-push-native.js` | registro con FCM, canal, token |
| `js/11-push.js` | Web Push + el botón que decide qué camino usar |
| `tools/android-push-setup.js` | aplica la clave fija al proyecto Gradle |
| `android-keys/upload.keystore` | la clave que Firebase tiene registrada |
| `supabase/functions/send-push/index.ts` | envía por VAPID y por FCM |
| `tests/push-native.test.js` | 9 tests del camino nativo |
