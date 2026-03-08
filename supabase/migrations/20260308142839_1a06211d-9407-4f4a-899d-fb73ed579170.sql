CREATE OR REPLACE FUNCTION public.can_device_export(p_fingerprint text, p_ip text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.device_fingerprints
    WHERE (fingerprint = p_fingerprint OR ip_address = p_ip)
      AND (is_blocked = true OR export_count >= 15)
  );
$$;