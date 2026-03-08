
-- Create admin role enum and user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS: only admins can view roles
CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admin functions to fetch all data (security definer bypasses RLS)
CREATE OR REPLACE FUNCTION public.admin_get_all_profiles()
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.profiles ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_all_export_logs()
RETURNS SETOF public.export_logs
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.export_logs ORDER BY created_at DESC LIMIT 500;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_all_devices()
RETURNS SETOF public.device_fingerprints
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.device_fingerprints ORDER BY last_seen_at DESC;
$$;

-- Admin function to block/unblock a user
CREATE OR REPLACE FUNCTION public.admin_set_user_blocked(p_target_user_id uuid, p_blocked boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.profiles SET is_blocked = p_blocked, updated_at = now() WHERE user_id = p_target_user_id;
END;
$$;

-- Admin function to block/unblock a device
CREATE OR REPLACE FUNCTION public.admin_set_device_blocked(p_fingerprint text, p_blocked boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.device_fingerprints SET is_blocked = p_blocked WHERE fingerprint = p_fingerprint;
END;
$$;

-- Admin function to update max_exports for a user
CREATE OR REPLACE FUNCTION public.admin_set_max_exports(p_target_user_id uuid, p_max integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.profiles SET max_exports = p_max, updated_at = now() WHERE user_id = p_target_user_id;
END;
$$;
