-- Supabase-only build: live updates and file storage.

-- Live updates: every app table publishes changes to Supabase Realtime.
--    Realtime applies the same row-level security, so a user only hears about
--    rows they can read.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = r.tablename
    ) then
      execute format('alter publication supabase_realtime add table public.%I', r.tablename);
    end if;
  end loop;
end $$;

-- File storage (employee/driver photos, attachments): public bucket
--    `files` - readable by URL, like Firebase download URLs; only approved
--    users can upload, replace or delete.
insert into storage.buckets (id, name, public)
values ('files', 'files', true)
on conflict (id) do update set public = true;

drop policy if exists files_insert on storage.objects;
drop policy if exists files_update on storage.objects;
drop policy if exists files_delete on storage.objects;
create policy files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and app.is_approved());
create policy files_update on storage.objects for update to authenticated
  using (bucket_id = 'files' and app.is_approved()) with check (bucket_id = 'files' and app.is_approved());
create policy files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and app.is_approved());
