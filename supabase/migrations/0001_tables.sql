-- One table per Firebase collection: the Firestore document id plus the
-- document itself as jsonb. RLS is enabled on every table; access rules are in
-- 0002_access_rules.sql. (Applied to the project on 2026-09-28.)
do $$
declare t text;
begin
  foreach t in array array[
    'reports','products','purchaseOrders','rawMaterials','employees','attendance','payroll','vehicles','drivers','policies',
    'transactions','parties','accounts','uom','destinations','trips','settings','notes','pageVisits','tdsCalculations',
    'estimatedInvoices','cheques','expenses','logs','rentalProperties','rentalUnits','rentalAgreements','rentalBills',
    'system_users','usernames','raw_machine_logs','bonus_ledger','bonus_summaries','behavior_ledger','behavior_analytics',
    'analytics_reports','hr_shifts','leave_requests','public_holidays','attendance_periods','payroll_periods','numberCounters',
    'crm_contacts','crm_deals','crm_followups','crm_interactions','costReports','gsm_reports','payment_tracker','sessions'
  ] loop
    execute format('create table if not exists public.%I (id text primary key, data jsonb not null default ''{}''::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now())', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
