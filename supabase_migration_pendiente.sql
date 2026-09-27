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
--   3) Trigger protect_group_invite_code → solo el admin rota el código,
--      aunque se llame a la API directo (el frontend solo no alcanza).
--   4) Realtime → las solicitudes llegan sin tener que recargar.
-- ==============================================================================


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
-- Verificación: corré esto después. Tiene que dar 1 tabla y 4 políticas.
--   SELECT COUNT(*) AS tablas FROM pg_tables WHERE tablename = 'shopping_join_requests';
--   SELECT COUNT(*) AS politicas FROM pg_policies WHERE tablename = 'shopping_join_requests';
-- ==============================================================================
