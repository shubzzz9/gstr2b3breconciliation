
-- 1. Create a BEFORE UPDATE trigger to enforce immutability of admin-only fields
CREATE OR REPLACE FUNCTION public.protect_admin_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If the caller is an admin, allow all changes
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- For non-admin users, prevent changes to admin-controlled fields
  IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked THEN
    RAISE EXCEPTION 'Cannot modify is_blocked field';
  END IF;
  IF NEW.max_exports IS DISTINCT FROM OLD.max_exports THEN
    RAISE EXCEPTION 'Cannot modify max_exports field';
  END IF;
  IF NEW.access_mode IS DISTINCT FROM OLD.access_mode THEN
    RAISE EXCEPTION 'Cannot modify access_mode field';
  END IF;
  IF NEW.access_expires_at IS DISTINCT FROM OLD.access_expires_at THEN
    RAISE EXCEPTION 'Cannot modify access_expires_at field';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_profile_admin_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_admin_profile_fields();

-- 2. Replace the self-referential UPDATE policy with a simple owner check
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
