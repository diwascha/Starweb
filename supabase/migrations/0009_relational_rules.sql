-- Access rules for the relational schema (0008). Same rules as 0002-0006;
-- only the way they read a record changed: real columns instead of the
-- JSON "data" column. Apply together with 0008 - until this runs, the new
-- tables have row-level security on and no policies, so nothing is reachable.

-- ---------------------------------------------------------------- identity ---

create or replace function app.profile() returns jsonb
language sql stable security definer set search_path = '' as $$
  select app.row_doc('system_users', to_jsonb(u)) || jsonb_build_object('_id', u.id)
  from public.system_users u
  where coalesce(auth.jwt() ->> 'email', '') <> ''
    and lower(u.email) = lower(auth.jwt() ->> 'email')
  limit 1
$$;
create index if not exists system_users_email_idx on public.system_users (lower(email));

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
-- Same rule as before: a locked month's payroll and attendance are final.
-- Admins may add or delete in a locked month, but nobody edits its records
-- (unlock first); an employee merge may still re-point them.

create or replace function app.period_locked(d jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select d ? 'bsYear' and d ? 'bsMonth' and exists (
    select 1 from (
      select locked from public.payroll_periods where id = (d ->> 'bsYear') || '-' || (d ->> 'bsMonth')
      union all
      select locked from public.attendance_periods where id = (d ->> 'bsYear') || '-' || (d ->> 'bsMonth')
    ) p where coalesce(p.locked, false)
  )
$$;

create or replace function app.enforce_period_lock() returns trigger
-- SECURITY INVOKER on purpose: app.is_backend() checks current_user.
language plpgsql security invoker set search_path = '' as $$
declare
  changed text[];
  n jsonb;
  o jsonb;
begin
  if app.is_backend() then
    return coalesce(new, old);
  end if;
  if tg_op <> 'DELETE' then n := app.row_doc(tg_table_name, to_jsonb(new)); end if;
  if tg_op <> 'INSERT' then o := app.row_doc(tg_table_name, to_jsonb(old)); end if;
  if tg_op = 'INSERT' then
    if app.period_locked(n) and not app.is_admin() then
      raise exception 'That month is locked. Unlock it before adding records.' using errcode = '42501';
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if app.period_locked(o) and not app.is_admin() then
      raise exception 'That month is locked. Unlock it before deleting records.' using errcode = '42501';
    end if;
    return old;
  else
    select coalesce(array_agg(k), '{}') into changed
    from (
      select key as k from jsonb_each(n) x where not (o ? x.key) or o -> x.key is distinct from x.value
      union
      select key from jsonb_each(o) y where not (n ? y.key)
    ) diff;
    if (app.period_locked(o) or app.period_locked(n))
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

drop policy if exists users_read on public.system_users;
drop policy if exists users_create on public.system_users;
drop policy if exists users_update on public.system_users;
drop policy if exists users_delete on public.system_users;
create policy users_read on public.system_users for select to authenticated
  using (app.is_admin() or id = app.my_id());
create policy users_create on public.system_users for insert to authenticated
  with check (
    app.is_admin() or (
      lower(email) = lower(auth.jwt() ->> 'email')
      and coalesce(is_approved, false) = false
      and coalesce(is_admin, false) = false
      and app.my_id() is null
    )
  );
create policy users_update on public.system_users for update to authenticated
  using (app.is_admin() or id = app.my_id())
  with check (app.is_admin() or id = app.my_id());
create policy users_delete on public.system_users for delete to authenticated
  using (app.is_admin() and id <> app.my_id() and coalesce(is_admin, false) = false);

create or replace function app.guard_user_update() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if app.is_backend() then return new; end if;
  if app.is_admin() and old.id <> app.my_id() then return new; end if;
  if new.is_approved is distinct from old.is_approved
     or new.is_admin is distinct from old.is_admin
     or new.permissions is distinct from old.permissions
     or lower(new.email) is distinct from lower(old.email) then
    raise exception 'Only an administrator can change approval, admin rights, permissions or email.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_user_update on public.system_users;
create trigger guard_user_update before update on public.system_users
  for each row execute function app.guard_user_update();

-- ------------------------------------------------------------- usernames ---

drop policy if exists usernames_admin on public.usernames;
create policy usernames_admin on public.usernames for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create or replace function public.email_for_username(p_username text) returns text
language sql stable security definer set search_path = '' as $$
  select u.email from public.usernames u
  where u.id = lower(trim(p_username)) or lower(u.username) = lower(trim(p_username))
  limit 1
$$;
revoke all on function public.email_for_username(text) from public;
grant execute on function public.email_for_username(text) to anon, authenticated;

-- -------------------------------------------------------------- sessions ---

drop policy if exists sessions_own on public.sessions;
create policy sessions_own on public.sessions for all to authenticated
  using (user_id = app.my_id() or app.is_admin())
  with check (user_id = app.my_id() or app.is_admin());

-- ------------------------------------------------------------------ logs ---

drop policy if exists logs_add on public.logs;
drop policy if exists logs_admin_read on public.logs;
drop policy if exists logs_admin_delete on public.logs;
create policy logs_add on public.logs for insert to authenticated
  with check (app.my_id() is not null and user_id = app.my_id());
create policy logs_admin_read on public.logs for select to authenticated using (app.is_admin());
create policy logs_admin_delete on public.logs for delete to authenticated using (app.is_admin());

-- -------------------------------------------------------------- settings ---

drop policy if exists settings_public_read on public.settings;
drop policy if exists settings_read on public.settings;
drop policy if exists settings_write on public.settings;
create policy settings_public_read on public.settings for select to anon, authenticated
  using (id in ('companyProfile', 'fleetCompanyProfile', 'appBranding', 'ownership_categories'));
create policy settings_read on public.settings for select to authenticated
  using (app.is_approved());
create policy settings_write on public.settings for all to authenticated
  using (app.is_admin() or (app.setting_write_module(id) <> '' and app.can(app.setting_write_module(id), 'edit')))
  with check (app.is_admin() or (app.setting_write_module(id) <> '' and app.can(app.setting_write_module(id), 'edit')));

-- ------------------------------------------------------------ pageVisits ---

drop policy if exists page_visits_read on public."pageVisits";
create policy page_visits_read on public."pageVisits" for select to authenticated
  using (app.can('settings', 'view'));

create or replace function public.record_page_visit(p_id text, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_approved() or coalesce(p_id, '') = '' then return; end if;
  insert into public."pageVisits" (id, path, count, last_visited)
  values (p_id, p_path, 1, app.ts_text(now()))
  on conflict (id) do update
    set path = excluded.path,
        count = coalesce(public."pageVisits".count, 0) + 1,
        last_visited = excluded.last_visited;
end $$;
revoke all on function public.record_page_visit(text, text) from public, anon;
grant execute on function public.record_page_visit(text, text) to authenticated;

grant execute on all functions in schema app to anon, authenticated;
