-- ==============================================================================
-- SuperList: Esquema Completo de Base de Datos para Supabase
-- Tablas: profiles, shopping_groups, shopping_group_members, shopping_products
-- Incluye: Triggers de perfil, RLS (Row Level Security), Políticas, Índices y Realtime
-- ==============================================================================

-- 1. Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Tabla de Perfiles de Usuario (vinculada a auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Usuario',
    email TEXT DEFAULT '',
    birthdate DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger para sincronizar automáticamente auth.users con public.profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, birthdate)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', 'Usuario'),
    COALESCE(new.email, ''),
    CASE 
      WHEN new.raw_user_meta_data->>'birthdate' IS NOT NULL AND new.raw_user_meta_data->>'birthdate' <> '' 
      THEN (new.raw_user_meta_data->>'birthdate')::date 
      ELSE NULL 
    END
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    birthdate = EXCLUDED.birthdate,
    updated_at = now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Sincronizar usuarios existentes en auth.users con public.profiles
INSERT INTO public.profiles (id, name, email, birthdate)
SELECT 
  id,
  COALESCE(raw_user_meta_data->>'name', 'Usuario'),
  COALESCE(email, ''),
  CASE 
    WHEN raw_user_meta_data->>'birthdate' IS NOT NULL AND raw_user_meta_data->>'birthdate' <> '' 
    THEN (raw_user_meta_data->>'birthdate')::date 
    ELSE NULL 
  END
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  birthdate = EXCLUDED.birthdate;

-- 3. Tabla de Listas / Grupos
CREATE TABLE IF NOT EXISTS public.shopping_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '🏠',
    type TEXT NOT NULL DEFAULT 'individual' CHECK (type IN ('individual', 'shared')),
    invite_code TEXT UNIQUE,
    categories JSONB DEFAULT '["Frutas y verduras", "Lácteos", "Carnes", "Almacén", "Panadería", "Congelados", "Bebidas", "Snacks", "Limpieza", "Higiene", "Mascotas", "Otros"]'::jsonb,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_opened_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabla de Miembros de Listas
CREATE TABLE IF NOT EXISTS public.shopping_group_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES public.shopping_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    joined_at TIMESTAMPTZ DEFAULT now(),
    user_name TEXT DEFAULT 'Usuario',
    user_email TEXT DEFAULT '',
    UNIQUE (group_id, user_id)
);

-- 5. Tabla de Productos
CREATE TABLE IF NOT EXISTS public.shopping_products (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES public.shopping_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'Otros',
    status TEXT NOT NULL DEFAULT 'tengo' CHECK (status IN ('tengo', 'agotarse', 'falta', 'quiero')),
    quantity TEXT DEFAULT '',
    unit TEXT DEFAULT '',
    brand TEXT DEFAULT '',
    expiry TEXT,
    planned_for TEXT DEFAULT '',
    note TEXT DEFAULT '',
    history JSONB DEFAULT '[]'::jsonb,
    added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    added_by_name TEXT DEFAULT '',
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Índices para consultas de alto rendimiento
CREATE INDEX IF NOT EXISTS idx_groups_created_by ON public.shopping_groups(created_by);
CREATE INDEX IF NOT EXISTS idx_groups_invite_code ON public.shopping_groups(invite_code);
CREATE INDEX IF NOT EXISTS idx_members_user_id ON public.shopping_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_group_id ON public.shopping_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_products_group_id ON public.shopping_products(group_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.shopping_products(status);
CREATE INDEX IF NOT EXISTS idx_products_added_by ON public.shopping_products(added_by);

-- 7. Funciones de verificación de membresía (SECURITY DEFINER para prevenir recursión RLS)
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id TEXT, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shopping_group_members
    WHERE group_id = _group_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_admin(_group_id TEXT, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shopping_group_members
    WHERE group_id = _group_id AND user_id = _user_id AND role = 'admin'
  );
$$;

-- 8. Habilitar Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_products ENABLE ROW LEVEL SECURITY;

-- 9. Políticas para profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- 10. Políticas para shopping_groups
DROP POLICY IF EXISTS "shopping_groups_select" ON public.shopping_groups;
CREATE POLICY "shopping_groups_select" ON public.shopping_groups
FOR SELECT TO authenticated
USING (
  is_group_member(id, auth.uid())
  OR (type = 'shared' AND invite_code IS NOT NULL)
);

DROP POLICY IF EXISTS "shopping_groups_insert" ON public.shopping_groups;
CREATE POLICY "shopping_groups_insert" ON public.shopping_groups
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "shopping_groups_update" ON public.shopping_groups;
CREATE POLICY "shopping_groups_update" ON public.shopping_groups
FOR UPDATE TO authenticated
USING (is_group_member(id, auth.uid()))
WITH CHECK (is_group_member(id, auth.uid()));

DROP POLICY IF EXISTS "shopping_groups_delete" ON public.shopping_groups;
CREATE POLICY "shopping_groups_delete" ON public.shopping_groups
FOR DELETE TO authenticated
USING (is_group_admin(id, auth.uid()) OR created_by = auth.uid());

-- 11. Políticas para shopping_group_members
DROP POLICY IF EXISTS "shopping_members_select" ON public.shopping_group_members;
CREATE POLICY "shopping_members_select" ON public.shopping_group_members
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR is_group_member(group_id, auth.uid())
);

DROP POLICY IF EXISTS "shopping_members_insert" ON public.shopping_group_members;
CREATE POLICY "shopping_members_insert" ON public.shopping_group_members
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR is_group_admin(group_id, auth.uid())
);

DROP POLICY IF EXISTS "shopping_members_update" ON public.shopping_group_members;
CREATE POLICY "shopping_members_update" ON public.shopping_group_members
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR is_group_admin(group_id, auth.uid())
);

DROP POLICY IF EXISTS "shopping_members_delete" ON public.shopping_group_members;
CREATE POLICY "shopping_members_delete" ON public.shopping_group_members
FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR is_group_admin(group_id, auth.uid())
);

-- 12. Políticas para shopping_products
DROP POLICY IF EXISTS "shopping_products_select" ON public.shopping_products;
CREATE POLICY "shopping_products_select" ON public.shopping_products
FOR SELECT TO authenticated
USING (is_group_member(group_id, auth.uid()));

DROP POLICY IF EXISTS "shopping_products_insert" ON public.shopping_products;
CREATE POLICY "shopping_products_insert" ON public.shopping_products
FOR INSERT TO authenticated
WITH CHECK (is_group_member(group_id, auth.uid()));

DROP POLICY IF EXISTS "shopping_products_update" ON public.shopping_products;
CREATE POLICY "shopping_products_update" ON public.shopping_products
FOR UPDATE TO authenticated
USING (is_group_member(group_id, auth.uid()))
WITH CHECK (is_group_member(group_id, auth.uid()));

DROP POLICY IF EXISTS "shopping_products_delete" ON public.shopping_products;
CREATE POLICY "shopping_products_delete" ON public.shopping_products
FOR DELETE TO authenticated
USING (is_group_member(group_id, auth.uid()));

-- 13. Habilitar Supabase Realtime para sincronización en tiempo real
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'shopping_groups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_groups;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'shopping_group_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_group_members;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'shopping_products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_products;
  END IF;
END $$;
