
-- Add IP and fingerprint tracking to export_logs
ALTER TABLE public.export_logs 
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS device_fingerprint text;

-- Create device_fingerprints table to track unique devices
CREATE TABLE IF NOT EXISTS public.device_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  ip_address text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  export_count integer NOT NULL DEFAULT 0,
  is_blocked boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Index for fast fingerprint lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_fingerprints_fp ON public.device_fingerprints(fingerprint);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_ip ON public.device_fingerprints(ip_address);
CREATE INDEX IF NOT EXISTS idx_export_logs_fingerprint ON public.export_logs(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_export_logs_ip ON public.export_logs(ip_address);

-- Enable RLS
ALTER TABLE public.device_fingerprints ENABLE ROW LEVEL SECURITY;

-- RLS: Only allow inserts/updates via service role (edge function). 
-- Authenticated users can read their own fingerprint record.
CREATE POLICY "Users can view own fingerprint" ON public.device_fingerprints
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Function to check if a device (fingerprint or IP) is blocked or over limit
CREATE OR REPLACE FUNCTION public.can_device_export(p_fingerprint text, p_ip text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.device_fingerprints
    WHERE (fingerprint = p_fingerprint OR ip_address = p_ip)
      AND (is_blocked = true OR export_count >= 30)
  );
$$;

-- Function to log export with fingerprint + IP and update device tracking
CREATE OR REPLACE FUNCTION public.log_export_with_device(
  p_user_id uuid,
  p_export_type text,
  p_fingerprint text,
  p_ip text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert export log with device info
  INSERT INTO public.export_logs (user_id, export_type, device_fingerprint, ip_address)
  VALUES (p_user_id, p_export_type, p_fingerprint, p_ip);
  
  -- Upsert device fingerprint record
  INSERT INTO public.device_fingerprints (fingerprint, ip_address, user_id, export_count)
  VALUES (p_fingerprint, p_ip, p_user_id, 1)
  ON CONFLICT (fingerprint) 
  DO UPDATE SET 
    last_seen_at = now(),
    export_count = device_fingerprints.export_count + 1,
    ip_address = COALESCE(EXCLUDED.ip_address, device_fingerprints.ip_address),
    user_id = COALESCE(EXCLUDED.user_id, device_fingerprints.user_id);
  
  RETURN true;
END;
$$;
