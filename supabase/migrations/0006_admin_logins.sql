-- Lets an approved administrator create a staff member's login, or reset
-- its password, from inside the app. Accounts are created already
-- confirmed, so no email is sent (Supabase's built-in mailer only delivers
-- to the project's own team). Only this function creates accounts: public
-- sign-up is switched off in the dashboard.
create or replace function public.admin_set_login(p_email text, p_password text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_id uuid;
begin
  if not (app.is_approved() and app.is_admin()) then
    raise exception 'Only an administrator can set logins.' using errcode = '42501';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email address is required.';
  end if;
  if p_password is null or length(p_password) < 8 then
    raise exception 'Password must be at least 8 characters.';
  end if;

  select id into v_id from auth.users where lower(email) = v_email limit 1;

  if v_id is not null then
    update auth.users
       set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           banned_until = null,
           updated_at = now()
     where id = v_id;
    return v_id;
  end if;

  v_id := gen_random_uuid();
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
  values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now()
  );
  return v_id;
end;
$$;

revoke execute on function public.admin_set_login(text, text) from public, anon;
grant execute on function public.admin_set_login(text, text) to authenticated;
