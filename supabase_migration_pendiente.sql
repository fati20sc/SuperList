-- ==============================================================================
-- SuperList — MIGRACION PENDIENTE
-- ==============================================================================
-- COMO USAR:
--   1) Abri Supabase > SQL Editor > New query
--   2) Pegá TODO este archivo
--   3) Dale Run
--
-- Es idempotente: si lo corrés dos veces no rompe nada.
-- NO hace falta tocar el esquema completo (supabase_schema.sql), porque eso
-- es para bases nuevas y ya está aplicado.
--
-- QUE RESUELVE:
--   1) Tabla shopping_join_requests → las solicitudes de ingreso quedan en
--      estado "pending" y el administrador tiene que aceptarlas.
--   2) RLS de esa tabla → nadie se auto-acepta ni ve solicitudes ajenas.
--   3) Tabla push_subscriptions → dónde se guarda la suscripción push de cada
--      dispositivo, para poder avisarle aunque la app esté cerrada.
--   4) Trigger protect_group_invite_code → solo el admin rota el código,
--      aunque se llame a la API directo (el frontend solo no alcanza).
--   5) Realtime → las solicitudes llegan sin tener que recargar.
-- ==============================================================================


-- 0) Suscripciones de notificaciones push ---------------------------------------
-- Una fila por usuario/dispositivo. El endpoint es lo que manda el navegador
-- cuando se suscribe con la Push API.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL DEFAULT '',
    auth TEXT NOT NULL DEFAULT '',
    user_agent TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Cada uno solo ve y borra la propia suscripción. Nadie más necesita leerla:
-- la Edge Function usa el service_role, que ignora RLS.
DROP POLICY IF EXISTS "push_subscriptions_own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_own" ON public.push_subscriptions
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());


-- 0b) Tokens de FCM para el APK -------------------------------------------------
-- El plugin nativo de Capacitor no usa la Push API del navegador: se registra
-- con Firebase y recibe un token (no un endpoint). Por eso va en su propia
-- tabla, y no se puede meter en push_subscriptions.
--
-- La clave es (user_id, token) y NO UNIQUE(user_id): una misma persona puede
-- tener el APK en dos teléfonos, o el APK y la PWA, y hay que avisarle por
-- todos los canales.
CREATE TABLE IF NOT EXISTS public.device_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'android',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON public.device_tokens(user_id);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Igual que push_subscriptions: cada uno solo administra sus propios tokens.
-- La Edge Function los lee con service_role, que ignora RLS.
DROP POLICY IF EXISTS "device_tokens_own" ON public.device_tokens;
CREATE POLICY "device_tokens_own" ON public.device_tokens
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());


-- 1) Tabla de solicitudes de ingreso --------------------------------------------
CREATE TABLE IF NOT EXISTS public.shopping_join_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES public.shopping_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_name TEXT DEFAULT 'Usuario',
    user_email TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_requests_group_id ON public.shopping_join_requests(group_id);
CREATE INDEX IF NOT EXISTS idx_requests_user_id ON public.shopping_join_requests(user_id);


-- 2) Row Level Security ---------------------------------------------------------
ALTER TABLE public.shopping_join_requests ENABLE ROW LEVEL SECURITY;

-- Solo se ve la propia solicitud o las de las listas donde se es admin.
DROP POLICY IF EXISTS "shopping_requests_select" ON public.shopping_join_requests;
CREATE POLICY "shopping_requests_select" ON public.shopping_join_requests
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_group_admin(group_id, auth.uid())
);

-- Se puede pedir entrar, pero solo a uno mismo y SIEMPRE en "pending".
-- El status forzado a 'pending' es lo que impide auto-aprobarse por la API.
DROP POLICY IF EXISTS "shopping_requests_insert" ON public.shopping_join_requests;
CREATE POLICY "shopping_requests_insert" ON public.shopping_join_requests
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.shopping_groups
    WHERE id = group_id AND type = 'shared' AND invite_code IS NOT NULL
  )
);

-- Solo el admin de la lista resuelve (acepta o rechaza).
DROP POLICY IF EXISTS "shopping_requests_update" ON public.shopping_join_requests;
CREATE POLICY "shopping_requests_update" ON public.shopping_join_requests
FOR UPDATE TO authenticated
USING (public.is_group_admin(group_id, auth.uid()))
WITH CHECK (public.is_group_admin(group_id, auth.uid()));

-- El solicitante puede cancelar la suya; el admin puede limpiarla.
DROP POLICY IF EXISTS "shopping_requests_delete" ON public.shopping_join_requests;
CREATE POLICY "shopping_requests_delete" ON public.shopping_join_requests
FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_group_admin(group_id, auth.uid())
);


-- 3) Trigger: solo el admin puede cambiar el código de invitación ----------------
-- La política "shopping_groups_update" deja editar a cualquier miembro (para el
-- nombre y el emoji). Eso no alcanza para el código, porque una política RLS no
-- puede comparar la fila vieja con la nueva. Por eso va como trigger.
CREATE OR REPLACE FUNCTION public.protect_group_invite_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invite_code IS DISTINCT FROM OLD.invite_code THEN
    IF NOT (public.is_group_admin(OLD.id, auth.uid()) OR OLD.created_by = auth.uid()) THEN
      RAISE EXCEPTION 'Solo el administrador puede cambiar el codigo de invitacion'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_group_invite_code_update ON public.shopping_groups;
CREATE TRIGGER on_group_invite_code_update
  BEFORE UPDATE ON public.shopping_groups
  FOR EACH ROW EXECUTE FUNCTION public.protect_group_invite_code();


-- 4) Realtime para las solicitudes ----------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'shopping_join_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_join_requests;
  END IF;
END $$;


-- ==============================================================================
-- Verificación: corré esto después. Tiene que dar 1, 1 y 4.
--   SELECT COUNT(*) FROM pg_tables WHERE tablename = 'shopping_join_requests';
--   SELECT COUNT(*) FROM pg_tables WHERE tablename = 'push_subscriptions';
--   SELECT COUNT(*) FROM pg_policies WHERE tablename = 'shopping_join_requests';
-- ==============================================================================
-- A PARTIR DE ACÁ ESTÁ TODO LO DE LAS NOTIFICACIONES PUSH:
--
-- 1) Copiá la Edge Function que está en supabase/functions/send-push/index.ts
--    a Supabase > Edge Functions > New Function, con el nombre "send-push".
--
-- 2) En Supabase > Edge Functions > Secrets, agregá estos dos secretos:
--       SUPABASE_VAPID_PRIVATE_KEY = la clave privada VAPID
--       SUPABASE_VAPID_SUBJECT     = "mailto:tu@email.com"
--
--    La clave pública ya está en el cliente (js/11-push.js) y también en la
--    Edge Function. Tiene que ser el MISMO par de claves que la privada.
--
-- 3) Para que la app mande el push cuando algo pasa en una lista, la Edge
--    Function tiene que invocarse. Puede ser con un trigger en la base o
--    desde el propio cliente. Hay un ejemplo de llamada arriba del archivo
--    supabase/functions/send-push/index.ts.
--
-- 4) PARA QUE EL APK ALSO RECIBA NOTIFICACIONES (Firebase):
--    La Push API de los navegadores no existe dentro de un WebView de Android,
--    asi que en el APK las notificaciones llegan por FCM, no por VAPID. Eso
--    usa la tabla device_tokens de mas arriba y necesita, una sola vez:
--      a) Crear el proyecto en Firebase con el mismo package name
--         (com.rosario.superlist) y bajar google-services.json a la raiz del repo.
--      b) Registrar en Firebase el SHA-1 de la clave de firma:
--         A7:FB:F6:E2:AC:94:D2:DF:90:9D:4D:2C:4E:AF:3C:27:CF:1B:2A:56
--         Sin esto, Android entrega el token pero Google no manda nada.
--      c) La Edge Function send-push tiene que poder enviar a device_tokens.
--    En el navegador y en la PWA sigue mandando VAPID como siempre.
-- ==============================================================================

-- ==============================================================================
-- 5) TRIGGER QUE MANDA LAS NOTIFICACIONES DE VERDAD
-- ==============================================================================
-- Aca se cierra el circuito: hasta ahora la Edge Function send-push existia
-- pero nadie la llamaba. Con esto, cada vez que alguien toca la lista
-- compartida, la base le manda el aviso a los demas.
--
-- COMO FUNCIONA: el trigger llama por HTTP a la Edge Function usando pg_net,
-- que hace la peticion en segundo plano y no traba la escritura del producto.
-- La funcion es la que busca a quien tiene notificaciones y envia.
--
-- REQUISITOS, EN ESTE ORDEN:
--   1) Correr ESTE archivo (crea el trigger).
--   2) Desplegar la Edge Function send-push.
--   3) Guardar el service_role en el vault (linea comentada mas abajo).
--   Sin el paso 3 el trigger no manda nada, pero tampoco rompe la app.
-- ==============================================================================

-- pg_net hace la llamada HTTP en segundo plano.
CREATE EXTENSION IF NOT EXISTS pg_net;


-- ------------------------------------------------------------------------------
-- Donde vive la clave de servicio.
--
-- Se probo usar el Vault de Supabase (supabase_vault) y en este proyecto NO
-- SIRVE: la vista vault.decrypted_secrets devuelve la clave PGP del vault en
-- lugar del secreto, y el header Authorization terminaba siendo basura, que
-- pg_net reportaba como "A libcurl function was given a bad argument".
--
-- Por eso va en un esquema "private". PostgREST solo publica el esquema
-- "public", asi que ni la clave anon ni la de un usuario llegan a esta tabla:
-- no es alcanzable desde la API. Los permisos se niegan de forma explicita
-- por si alguien amplia la exposicion en el futuro.
--
-- OJO: esta clave NO va en ningun archivo del repo. La escribe
-- tools/setup-notificaciones.mjs, tomandola del servidor de Supabase.
-- ------------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.app_secrets (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

REVOKE ALL ON SCHEMA private FROM public, anon, authenticated;
REVOKE ALL ON private.app_secrets FROM public, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;


-- ------------------------------------------------------------------------------
-- El trigger que arma el aviso y lo manda.
--
-- Va sobre shopping_products porque ahi esta todo lo que le importa a la
-- familia: que se agrego algo, que se marco como comprado, que se borro.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_list_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_group_id    TEXT;
    v_author      UUID;
    v_author_name TEXT;
    v_group_name  TEXT;
    v_group_emoji TEXT;
    v_group_type  TEXT;
    v_body        TEXT;
    v_product     TEXT;
    v_new_status  TEXT;
    v_old_status  TEXT;
    v_service_key TEXT;
    v_anon_key    TEXT;
    v_project_url TEXT := 'https://ismweucgziipplsnkwuh.supabase.co';
BEGIN
    -- OJO, esto parece un detalle y no lo es: en un trigger DELETE el registro
    -- NEW NO ESTA ASIGNADO, y tocarlo tira "record new is not assigned yet".
    -- Un COALESCE(NEW.group_id, OLD.group_id) parece seguro pero revienta en
    -- cada borrado. Por eso hay que preguntar por TG_OP antes de leer.
    IF TG_OP = 'DELETE' THEN
        v_group_id    := OLD.group_id;
        v_author      := COALESCE(OLD.added_by, OLD.updated_by);
        v_author_name := COALESCE(NULLIF(OLD.added_by_name, ''), 'Alguien');
        v_product     := OLD.name;
        v_new_status  := NULL;
        v_old_status  := NULL;
    ELSE
        v_group_id    := NEW.group_id;
        v_author      := COALESCE(NEW.added_by, NEW.updated_by);
        v_author_name := COALESCE(NULLIF(NEW.added_by_name, ''), 'Alguien');
        v_product     := NEW.name;
        v_new_status  := NEW.status;
        v_old_status  := OLD.status;
    END IF;

    SELECT type, name, emoji INTO v_group_type, v_group_name, v_group_emoji
    FROM public.shopping_groups WHERE id = v_group_id;

    -- Las listas individuales no tienen a quien avisar.
    IF v_group_type IS DISTINCT FROM 'shared' THEN
        RETURN NEW;
    END IF;

    -- Con una sola persona en la lista no vale la pena molestar.
    IF (SELECT count(*) FROM public.shopping_group_members WHERE group_id = v_group_id) < 2 THEN
        RETURN NEW;
    END IF;

    -- Las claves se leen de private.app_secrets. Si no esta, no se intenta
    -- nada: es preferible no notificar a romper la escritura.
    BEGIN
        SELECT value INTO v_service_key
        FROM private.app_secrets
        WHERE name = 'SUPABASE_SERVICE_ROLE_KEY';
    EXCEPTION WHEN OTHERS THEN
        v_service_key := NULL;
    END;

    IF v_service_key IS NULL THEN
        RAISE WARNING 'SuperList: falta la clave en private.app_secrets.';
        RETURN NEW;
    END IF;

    -- Traducir la operacion a algo que se entienda. Se usan las variables que
    -- se copiaron arriba, no NEW/OLD directos, por el tema del trigger DELETE.
    IF TG_OP = 'DELETE' THEN
        v_body := v_author_name || ' borro "' || v_product || '"';
    ELSIF v_new_status IS DISTINCT FROM v_old_status THEN
        v_body := v_author_name || ' cambio "' || v_product || '" a ' || v_new_status;
    ELSE
        v_body := v_author_name || ' agrego "' || v_product || '"';
    END IF;

    -- excludeUserId: el autor no se avisa a si mismo.
    -- El timeout se sube a 5s porque la Edge Function firma un JWT y despues
    -- llama a Google: con el default de 1s se cortaria antes de tiempo.
    PERFORM net.http_post(
        url     := v_project_url || '/functions/v1/send-push',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            -- OJO: la clave va SOLO en "apikey". Probado contra este proyecto:
            --   apikey=<sb_secret_>                        -> 200
            --   apikey=<sb_secret_> + Authorization=<igual> -> 200
            --   apikey=<publishable> + Authorization=<sb_secret_> -> 401
            --       "Conflicting API keys"
            -- Mandar la publica y la secreta en headers distintos NO anda.
            'apikey',        v_service_key
        ),
        body    := jsonb_build_object(
            'groupId',       v_group_id,
            'title',         COALESCE(v_group_emoji, '') || ' ' || v_group_name,
            'body',          v_body,
            'url',           './',
            'excludeUserId', v_author
        ),
        timeout_milliseconds := 5000
    );

    RETURN NEW;
END;
$$;

-- AFTER, no BEFORE: el trigger no debe poder impedir la escritura del producto.
-- Se borra antes de crear para poder correr este archivo varias veces.
DROP TRIGGER IF EXISTS trg_list_activity_push ON public.shopping_products;
CREATE TRIGGER trg_list_activity_push
  AFTER INSERT OR UPDATE OR DELETE ON public.shopping_products
  FOR EACH ROW EXECUTE FUNCTION public.notify_list_activity();


-- ------------------------------------------------------------------------------
-- ULTIMO PASO: esto lo hace tools/setup-notificaciones.mjs automaticamente.
-- Si lo queres hacer a mano, es esto (con TU service_role):
--
--   INSERT INTO private.app_secrets (name, value)
--   VALUES ('SUPABASE_SERVICE_ROLE_KEY', 'PEGA_AQUI_TU_SERVICE_ROLE_KEY')
--   ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value;
--
-- Donde se consigue la clave: Supabase > Configuracion del proyecto >
-- API > Claves anon / service_role. Es la que dice "service_role", NO la "anon".
--
-- OJO: la service_role da acceso total a la base. Por eso vive en el esquema
-- "private", al que PostgREST no expone, y nunca en el codigo ni en un commit.
-- ------------------------------------------------------------------------------

-- Verificaciones. Cada una tiene que devolver 1:
--
--   SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_list_activity_push';
--   SELECT count(*) FROM private.app_secrets
--     WHERE name = 'SUPABASE_SERVICE_ROLE_KEY';
--   SELECT count(*) FROM pg_tables
--     WHERE schemaname = 'private' AND tablename = 'app_secrets';
--   SELECT count(*) FROM pg_tables WHERE tablename = 'device_tokens';
--
-- ==============================================================================
-- FIN DE LA MIGRACION
-- ==============================================================================

