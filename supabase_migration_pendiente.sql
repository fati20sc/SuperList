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
