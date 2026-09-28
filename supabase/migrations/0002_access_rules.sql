-- =============================================================================
-- StarSutra access rules for Supabase: the Postgres equivalent of
-- firestore.rules. Same model: each user's system_users record holds
-- isApproved, isAdmin and per-module permissions ({ module: { actions: [...] } }
-- or { module: [...] }); every table belongs to a module (or to several shared
-- modules), and view/add/edit/delete on it follow that user's actions.
--
-- Who is the caller: the Supabase login's email, matched to system_users.email.
-- Safe because Supabase requires email confirmation before issuing a session
-- ("Confirm email" must stay ON): nobody can sign in as a staff email without
-- that mailbox. A login with no matching, approved system_users record gets
-- nothing.
--
-- Helper functions live in schema `app`, which the API does not expose.
-- They are SECURITY DEFINER so they can read system_users and the period-lock
-- tables without tripping those tables' own policies (no recursion).
-- =============================================================================

create schema if not exists app;
grant usage on schema app to anon, authenticated;

-- ---------------------------------------------------------------- identity ---

create or replace function app.profile() returns jsonb
language sql stable security definer set search_path = '' as $$
  select u.data || jsonb_build_object('_id', u.id)
  from public.system_users u
  where coalesce(auth.jwt() ->> 'email', '') <> ''
    and lower(u.data ->> 'email') = lower(auth.jwt() ->> 'email')
  limit 1
$$;

-- The caller's system_users id (the id sessions/logs/userId fields refer to).
create or replace function app.my_id() returns text
language sql stable security definer set search_path = '' as $$
  select app.profile() ->> '_id'
$$;

create or replace function app.is_approved() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((app.profile() ->> 'isApproved')::boolean, false)
$$;

create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((app.profile() ->> 'isAdmin')::boolean, false)
$$;

-- Database owner / service role (SQL editor, migrations): rules don't apply.
create or replace function app.is_backend() returns boolean
language sql stable as $$
  select current_user not in ('anon', 'authenticated')
$$;

create or replace function app.actions_for(mod text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case jsonb_typeof(p)
           when 'array' then p
           when 'object' then coalesce(p -> 'actions', '[]'::jsonb)
           else '[]'::jsonb
         end
  from (select app.profile() -> 'permissions' -> mod as p) x
$$;

create or replace function app.can(mod text, action text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_approved() and (app.is_admin() or app.actions_for(mod) ?| array['all', action])
$$;

create or replace function app.can_any(mods text[], action text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_approved() and (
    app.is_admin() or exists (select 1 from unnest(mods) m where app.actions_for(m) ?| array['all', action])
  )
$$;

-- ------------------------------------------------------- table -> module ---

create or replace function app.module_of(tbl text) returns text
language sql immutable as $$
  select coalesce(('{
    "employees":"hr","attendance":"hr","payroll":"hr","raw_machine_logs":"hr","bonus_ledger":"hr",
    "bonus_summaries":"hr","behavior_ledger":"hr","behavior_analytics":"hr","analytics_reports":"hr",
    "hr_shifts":"hr","leave_requests":"hr","public_holidays":"hr",
    "tdsCalculations":"finance","cheques":"finance","expenses":"finance","payment_tracker":"finance",
    "gsm_reports":"finance",
    "vehicles":"fleet","drivers":"fleet","policies":"fleet","trips":"fleet","destinations":"fleet",
    "rentalProperties":"rental","rentalUnits":"rental","rentalAgreements":"rental","rentalBills":"rental",
    "crm_contacts":"crm","crm_deals":"crm","crm_followups":"crm","crm_interactions":"crm","costReports":"crm",
    "purchaseOrders":"purchaseOrders","rawMaterials":"purchaseOrders",
    "reports":"reports","notes":"notes"
  }'::jsonb) ->> tbl, '')
$$;

create or replace function app.shared_modules_of(tbl text) returns text[]
language sql immutable as $$
  select coalesce(array(select jsonb_array_elements_text(('{
    "products":["reports","crm","finance","purchaseOrders"],
    "parties":["finance","purchaseOrders","crm","fleet","rental","settings"],
    "uom":["purchaseOrders","fleet","reports","settings"],
    "accounts":["finance","fleet","rental","settings"],
    "attendance_periods":["hr","settings"],
    "payroll_periods":["hr","settings"],
    "estimatedInvoices":["finance","crm"],
    "transactions":["fleet","finance"],
    "numberCounters":["finance","purchaseOrders","crm","reports","hr","fleet","rental"]
  }'::jsonb) -> tbl)), '{}')
$$;

-- view/add/edit/delete on a business table. Tables in neither map are
-- admin-only, like the catch-all in firestore.rules.
create or replace function app.table_access(tbl text, action text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when app.module_of(tbl) <> '' then app.can(app.module_of(tbl), action)
    when cardinality(app.shared_modules_of(tbl)) > 0 then app.can_any(app.shared_modules_of(tbl), action)
    else app.is_admin()
  end
$$;

-- ------------------------------------------------------ generic policies ---

do $$
declare t text;
begin
  foreach t in array array[
    'reports','products','purchaseOrders','rawMaterials','employees','attendance','payroll','vehicles','drivers','policies',
    'transactions','parties','accounts','uom','destinations','trips','notes','tdsCalculations',
    'estimatedInvoices','cheques','expenses','rentalProperties','rentalUnits','rentalAgreements','rentalBills',
    'raw_machine_logs','bonus_ledger','bonus_summaries','behavior_ledger','behavior_analytics',
    'analytics_reports','hr_shifts','leave_requests','public_holidays','attendance_periods','payroll_periods','numberCounters',
    'crm_contacts','crm_deals','crm_followups','crm_interactions','costReports','gsm_reports','payment_tracker'
  ] loop
    execute format('drop policy if exists app_view on public.%I', t);
    execute format('drop policy if exists app_add on public.%I', t);
    execute format('drop policy if exists app_edit on public.%I', t);
    execute format('drop policy if exists app_delete on public.%I', t);
    execute format('create policy app_view on public.%I for select to authenticated using (app.table_access(%L, ''view''))', t, t);
    execute format('create policy app_add on public.%I for insert to authenticated with check (app.table_access(%L, ''add''))', t, t);
    execute format('create policy app_edit on public.%I for update to authenticated using (app.table_access(%L, ''edit'')) with check (app.table_access(%L, ''edit''))', t, t, t);
    execute format('create policy app_delete on public.%I for delete to authenticated using (app.table_access(%L, ''delete''))', t, t);
  end loop;
end $$;

-- ------------------------------------------------ locked payroll months ---
-- A locked month's payroll and attendance are final. Mirrors firestore.rules:
--   create: admin, or month not locked
--   update: only employeeId/employeeName/ownership change (employee merge),
--           or neither the old nor the new month is locked
--   delete: admin, or month not locked

create or replace function app.period_locked(d jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select d ? 'bsYear' and d ? 'bsMonth' and exists (
    select 1 from (
      select data from public.payroll_periods where id = (d ->> 'bsYear') || '-' || (d ->> 'bsMonth')
      union all
      select data from public.attendance_periods where id = (d ->> 'bsYear') || '-' || (d ->> 'bsMonth')
    ) p where coalesce((p.data ->> 'locked')::boolean, false)
  )
$$;

create or replace function app.enforce_period_lock() returns trigger
-- SECURITY INVOKER on purpose: app.is_backend() checks current_user, which
-- inside a SECURITY DEFINER function would always be the owner.
language plpgsql security invoker set search_path = '' as $$
declare changed text[];
begin
  if app.is_backend() then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    if app.period_locked(new.data) and not app.is_admin() then
      raise exception 'That month is locked. Unlock it before adding records.' using errcode = '42501';
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if app.period_locked(old.data) and not app.is_admin() then
      raise exception 'That month is locked. Unlock it before deleting records.' using errcode = '42501';
    end if;
    return old;
  else
    select coalesce(array_agg(k), '{}') into changed
    from (
      select key as k from jsonb_each(new.data) n
      where not (old.data ? n.key) or old.data -> n.key is distinct from n.value
      union
      select key from jsonb_each(old.data) o where not (new.data ? o.key)
    ) diff;
    if (app.period_locked(old.data) or app.period_locked(new.data))
       and not (changed <@ array['employeeId', 'employeeName', 'ownership']) then
      raise exception 'That month is locked. Unlock it before changing its records.' using errcode = '42501';
    end if;
    return new;
  end if;
end $$;

drop trigger if exists enforce_period_lock on public.payroll;
create trigger enforce_period_lock before insert or update or delete on public.payroll
  for each row execute function app.enforce_period_lock();
drop trigger if exists enforce_period_lock on public.attendance;
create trigger enforce_period_lock before insert or update or delete on public.attendance
  for each row execute function app.enforce_period_lock();

-- ---------------------------------------------------------- system_users ---
-- Read: own record or admin. Create: admin, or a new pending (unapproved,
-- non-admin) record for one's own email. Update: admin editing someone else,
-- or a user editing their own record without touching isApproved, isAdmin or
-- permissions (trigger below). Delete: admin, never self, never an admin.

drop policy if exists users_read on public.system_users;
drop policy if exists users_create on public.system_users;
drop policy if exists users_update on public.system_users;
drop policy if exists users_delete on public.system_users;

create policy users_read on public.system_users for select to authenticated
  using (app.is_admin() or id = app.my_id());
create policy users_create on public.system_users for insert to authenticated
  with check (
    app.is_admin() or (
      lower(data ->> 'email') = lower(auth.jwt() ->> 'email')
      and coalesce((data ->> 'isApproved')::boolean, false) = false
      and coalesce((data ->> 'isAdmin')::boolean, false) = false
      and app.my_id() is null
    )
  );
create policy users_update on public.system_users for update to authenticated
  using (app.is_admin() or id = app.my_id())
  with check (app.is_admin() or id = app.my_id());
create policy users_delete on public.system_users for delete to authenticated
  using (app.is_admin() and id <> app.my_id() and coalesce((data ->> 'isAdmin')::boolean, false) = false);

create or replace function app.guard_user_update() returns trigger
-- SECURITY INVOKER on purpose: app.is_backend() checks current_user, which
-- inside a SECURITY DEFINER function would always be the owner.
language plpgsql security invoker set search_path = '' as $$
begin
  if app.is_backend() then return new; end if;
  -- An admin may change anyone else's access fields - but not their own, so
  -- an admin cannot accidentally lock themselves out or be the only check.
  if app.is_admin() and old.id <> app.my_id() then return new; end if;
  if new.data -> 'isApproved' is distinct from old.data -> 'isApproved'
     or new.data -> 'isAdmin' is distinct from old.data -> 'isAdmin'
     or new.data -> 'permissions' is distinct from old.data -> 'permissions'
     or lower(new.data ->> 'email') is distinct from lower(old.data ->> 'email') then
    raise exception 'Only an administrator can change approval, admin rights, permissions or email.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_user_update on public.system_users;
create trigger guard_user_update before update on public.system_users
  for each row execute function app.guard_user_update();

-- ------------------------------------------------------------- usernames ---
-- Admin only. The login screen resolves a username through
-- public.email_for_username(), which returns one email for an exact match
-- and never lists the table.

drop policy if exists usernames_admin on public.usernames;
create policy usernames_admin on public.usernames for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create or replace function public.email_for_username(p_username text) returns text
language sql stable security definer set search_path = '' as $$
  select u.data ->> 'email' from public.usernames u
  where u.id = lower(trim(p_username)) or lower(u.data ->> 'username') = lower(trim(p_username))
  limit 1
$$;
revoke all on function public.email_for_username(text) from public;
grant execute on function public.email_for_username(text) to anon, authenticated;

-- -------------------------------------------------------------- sessions ---

drop policy if exists sessions_own on public.sessions;
create policy sessions_own on public.sessions for all to authenticated
  using (data ->> 'userId' = app.my_id() or app.is_admin())
  with check (data ->> 'userId' = app.my_id() or app.is_admin());

-- ------------------------------------------------------------------ logs ---
-- Anyone signed in may add an entry, but only under their own id (entries
-- cannot be forged). Only admins read or delete.

drop policy if exists logs_add on public.logs;
drop policy if exists logs_admin_read on public.logs;
drop policy if exists logs_admin_delete on public.logs;
create policy logs_add on public.logs for insert to authenticated
  with check (app.my_id() is not null and data ->> 'userId' = app.my_id());
create policy logs_admin_read on public.logs for select to authenticated using (app.is_admin());
create policy logs_admin_delete on public.logs for delete to authenticated using (app.is_admin());

-- -------------------------------------------------------------- settings ---

create or replace function app.setting_write_module(setting_id text) returns text
language sql immutable as $$
  select coalesce(('{
    "hr_config":"hr","chequeLayout":"finance","costing":"crm",
    "companyProfile":"settings","fleetCompanyProfile":"settings","personalProfile":"settings",
    "appBranding":"settings","documentPrefixes":"settings","ownership_categories":"settings"
  }'::jsonb) ->> setting_id, '')
$$;

drop policy if exists settings_public_read on public.settings;
drop policy if exists settings_read on public.settings;
drop policy if exists settings_write on public.settings;
-- The login screen shows the company name and branding before sign-in.
create policy settings_public_read on public.settings for select to anon, authenticated
  using (id in ('companyProfile', 'fleetCompanyProfile', 'appBranding', 'ownership_categories'));
create policy settings_read on public.settings for select to authenticated
  using (app.is_approved());
create policy settings_write on public.settings for all to authenticated
  using (app.is_admin() or (app.setting_write_module(id) <> '' and app.can(app.setting_write_module(id), 'edit')))
  with check (app.is_admin() or (app.setting_write_module(id) <> '' and app.can(app.setting_write_module(id), 'edit')));

-- ------------------------------------------------------------ pageVisits ---
-- Counted through a function (one +1 per call) rather than direct writes;
-- read by those who can view Settings.

drop policy if exists page_visits_read on public."pageVisits";
create policy page_visits_read on public."pageVisits" for select to authenticated
  using (app.can('settings', 'view'));

create or replace function public.record_page_visit(p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare vid text := regexp_replace(coalesce(p_path, ''), '[^A-Za-z0-9_-]', '_', 'g');
begin
  if not app.is_approved() or vid = '' then return; end if;
  insert into public."pageVisits" (id, data)
  values (vid, jsonb_build_object('path', p_path, 'count', 1, 'lastVisited', now()))
  on conflict (id) do update
    set data = public."pageVisits".data
               || jsonb_build_object('count', coalesce((public."pageVisits".data ->> 'count')::int, 0) + 1,
                                     'lastVisited', now()),
        updated_at = now();
end $$;
revoke all on function public.record_page_visit(text) from public;
grant execute on function public.record_page_visit(text) to authenticated;

-- ---------------------------------------------------------------- grants ---
-- Supabase grants table privileges to anon/authenticated by default; RLS is
-- what limits them. Make the helper functions callable from policies.
grant execute on all functions in schema app to anon, authenticated;
