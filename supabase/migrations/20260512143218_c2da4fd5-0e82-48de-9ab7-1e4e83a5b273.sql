
DROP FUNCTION IF EXISTS public.admin_get_all_profiles();

CREATE OR REPLACE FUNCTION public.admin_get_all_profiles()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  full_name text,
  phone text,
  email text,
  is_blocked boolean,
  max_exports integer,
  access_mode text,
  access_expires_at timestamp with time zone,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.user_id, p.full_name, p.phone,
         u.email::text AS email,
         p.is_blocked, p.max_exports, p.access_mode, p.access_expires_at,
         p.created_at, p.updated_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.user_id
  ORDER BY p.created_at DESC;
$$;
