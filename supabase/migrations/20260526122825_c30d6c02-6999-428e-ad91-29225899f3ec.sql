-- Revoke EXECUTE from anon and public on all SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.admin_get_all_profiles() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_all_export_logs() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_all_devices() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_blocked(uuid, boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_device_blocked(text, boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_max_exports(uuid, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_access_mode(uuid, text, timestamptz) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_export_count(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_user_export(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_device_export(text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_export_with_device(uuid, text, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, PUBLIC;

-- Ensure authenticated users still have access where required
GRANT EXECUTE ON FUNCTION public.admin_get_all_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_export_logs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_devices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_blocked(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_device_blocked(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_max_exports(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_access_mode(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_export_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_user_export(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_device_export(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_export_with_device(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;