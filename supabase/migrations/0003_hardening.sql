-- From Supabase's security advisor after 0002:
-- pin search_path on the remaining helper functions, and page visits are for
-- signed-in users only (Supabase grants EXECUTE on new public functions to
-- anon by default). email_for_username stays callable without signing in on
-- purpose: the login screen needs it, and it returns one email for an exact
-- username, never a list.
alter function app.is_backend() set search_path = '';
alter function app.module_of(text) set search_path = '';
alter function app.shared_modules_of(text) set search_path = '';
alter function app.setting_write_module(text) set search_path = '';
revoke execute on function public.record_page_visit(text) from anon;
