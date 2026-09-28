-- Page visits keep their existing ids (e.g. 'hr--payroll'), which the app
--    computes; one atomic +1 per call, approved users only.
drop function if exists public.record_page_visit(text);
create or replace function public.record_page_visit(p_id text, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_approved() or coalesce(p_id, '') = '' then return; end if;
  insert into public."pageVisits" (id, data)
  values (p_id, jsonb_build_object('path', p_path, 'count', 1, 'lastVisited', now()))
  on conflict (id) do update
    set data = public."pageVisits".data
               || jsonb_build_object('path', p_path,
                                     'count', coalesce((public."pageVisits".data ->> 'count')::int, 0) + 1,
                                     'lastVisited', now()),
        updated_at = now();
end $$;
revoke all on function public.record_page_visit(text, text) from public, anon;
grant execute on function public.record_page_visit(text, text) to authenticated;
