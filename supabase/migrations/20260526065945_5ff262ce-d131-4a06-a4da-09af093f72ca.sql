
-- 1. profiles: restrict INSERT to authenticated, reset privileged fields
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.reset_profile_privileged_fields_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.is_blocked := false;
    NEW.max_exports := 10;
    NEW.access_mode := 'exports';
    NEW.access_expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_reset_privileged_on_insert ON public.profiles;
CREATE TRIGGER profiles_reset_privileged_on_insert
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.reset_profile_privileged_fields_on_insert();

-- 2. profiles: attach existing protection trigger to block privilege escalation on UPDATE
DROP TRIGGER IF EXISTS profiles_protect_admin_fields ON public.profiles;
CREATE TRIGGER profiles_protect_admin_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_admin_profile_fields();

-- 3. device_fingerprints: explicitly deny anon access
CREATE POLICY "Deny anon select on device_fingerprints"
ON public.device_fingerprints FOR SELECT TO anon USING (false);
CREATE POLICY "Deny anon insert on device_fingerprints"
ON public.device_fingerprints FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY "Deny anon update on device_fingerprints"
ON public.device_fingerprints FOR UPDATE TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny anon delete on device_fingerprints"
ON public.device_fingerprints FOR DELETE TO anon USING (false);

-- 4. Lock down SECURITY DEFINER functions: revoke from anon/public, keep authenticated where needed
REVOKE EXECUTE ON FUNCTION public.admin_get_all_profiles() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_get_all_export_logs() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_get_all_devices() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_blocked(uuid, boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_set_device_blocked(text, boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_set_max_exports(uuid, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_set_access_mode(uuid, text, timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_export_count(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_user_export(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_device_export(text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_export_with_device(uuid, text, text, text) FROM anon, public;
