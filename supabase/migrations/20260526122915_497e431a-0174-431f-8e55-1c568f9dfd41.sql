REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_profile_privileged_fields_on_insert() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_admin_profile_fields() FROM anon, PUBLIC;