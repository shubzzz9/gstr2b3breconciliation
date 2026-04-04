
-- Block all direct writes to user_roles (managed via admin functions only)
CREATE POLICY "No direct insert on user_roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (false);

CREATE POLICY "No direct update on user_roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (false) WITH CHECK (false);

CREATE POLICY "No direct delete on user_roles"
ON public.user_roles FOR DELETE TO authenticated
USING (false);

-- Block all direct writes to device_fingerprints (managed via security definer functions only)
CREATE POLICY "No direct insert on device_fingerprints"
ON public.device_fingerprints FOR INSERT TO authenticated
WITH CHECK (false);

CREATE POLICY "No direct update on device_fingerprints"
ON public.device_fingerprints FOR UPDATE TO authenticated
USING (false) WITH CHECK (false);

CREATE POLICY "No direct delete on device_fingerprints"
ON public.device_fingerprints FOR DELETE TO authenticated
USING (false);
