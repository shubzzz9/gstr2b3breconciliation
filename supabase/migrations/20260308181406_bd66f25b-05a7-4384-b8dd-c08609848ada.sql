
ALTER TABLE public.profiles ADD COLUMN access_expires_at timestamp with time zone DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN access_mode text NOT NULL DEFAULT 'exports';

COMMENT ON COLUMN public.profiles.access_expires_at IS 'If set, user access expires at this date regardless of export count';
COMMENT ON COLUMN public.profiles.access_mode IS 'Access control mode: exports, days, or both';

CREATE OR REPLACE FUNCTION public.can_user_export(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    NOT p.is_blocked AND 
    CASE p.access_mode
      WHEN 'exports' THEN (SELECT COUNT(*) FROM public.export_logs WHERE user_id = p_user_id) < p.max_exports
      WHEN 'days' THEN (p.access_expires_at IS NULL OR p.access_expires_at > now())
      WHEN 'both' THEN (
        (SELECT COUNT(*) FROM public.export_logs WHERE user_id = p_user_id) < p.max_exports
        AND (p.access_expires_at IS NULL OR p.access_expires_at > now())
      )
      ELSE false
    END
  FROM public.profiles p
  WHERE p.user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_access_mode(p_target_user_id uuid, p_mode text, p_expires_at timestamp with time zone DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.profiles 
  SET access_mode = p_mode, access_expires_at = p_expires_at, updated_at = now() 
  WHERE user_id = p_target_user_id;
END;
$$;
