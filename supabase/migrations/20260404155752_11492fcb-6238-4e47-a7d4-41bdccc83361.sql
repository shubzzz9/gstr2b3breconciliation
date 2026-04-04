
DROP POLICY "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id AND
  is_blocked IS NOT DISTINCT FROM (SELECT p.is_blocked FROM public.profiles p WHERE p.user_id = auth.uid()) AND
  max_exports IS NOT DISTINCT FROM (SELECT p.max_exports FROM public.profiles p WHERE p.user_id = auth.uid()) AND
  access_mode IS NOT DISTINCT FROM (SELECT p.access_mode FROM public.profiles p WHERE p.user_id = auth.uid()) AND
  access_expires_at IS NOT DISTINCT FROM (SELECT p.access_expires_at FROM public.profiles p WHERE p.user_id = auth.uid())
);
