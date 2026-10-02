-- Foreign keys: the database now refuses a record that points at a party,
-- employee, vehicle, account, ... that does not exist, and refuses deleting
-- one that records still point at (the app checks this first; this is the
-- guarantee behind it).
--
-- Left out on purpose:
--   policies.member_id      points at a vehicle OR a driver
--   transactions.expense_id / trip_id
--                           the app deletes the expense/trip and then its
--                           ledger entries in separate steps
--
-- payroll.employee_id is NOT VALID: 55 historical payroll rows belong to
-- employees deleted before this migration. They are kept as they are; every
-- new or re-pointed payroll row is checked.

-- "" meant "none" in 4 expenses; SQL uses null for that.
update public.expenses set party_id = null where party_id = '';
update public.expenses set account_id = null where account_id = '';

alter table public.attendance          add constraint attendance_employee_fk          foreign key (employee_id) references public.employees (id);
alter table public.payroll             add constraint payroll_employee_fk             foreign key (employee_id) references public.employees (id) not valid;
alter table public.bonus_ledger        add constraint bonus_ledger_employee_fk        foreign key (employee_id) references public.employees (id);
alter table public.behavior_ledger     add constraint behavior_ledger_employee_fk     foreign key (employee_id) references public.employees (id);
alter table public.behavior_analytics  add constraint behavior_analytics_employee_fk  foreign key (employee_id) references public.employees (id);
alter table public.leave_requests      add constraint leave_requests_employee_fk      foreign key (employee_id) references public.employees (id);

alter table public.transactions        add constraint transactions_vehicle_fk         foreign key (vehicle_id) references public.vehicles (id);
alter table public.transactions        add constraint transactions_party_fk           foreign key (party_id) references public.parties (id);
alter table public.transactions        add constraint transactions_account_fk         foreign key (account_id) references public.accounts (id);
alter table public.expenses            add constraint expenses_vehicle_fk             foreign key (vehicle_id) references public.vehicles (id);
alter table public.expenses            add constraint expenses_party_fk               foreign key (party_id) references public.parties (id);
alter table public.expenses            add constraint expenses_account_fk             foreign key (account_id) references public.accounts (id);
alter table public.cheques             add constraint cheques_account_fk              foreign key (account_id) references public.accounts (id);
alter table public.trips               add constraint trips_vehicle_fk                foreign key (vehicle_id) references public.vehicles (id);
alter table public.trips               add constraint trips_party_fk                  foreign key (party_id) references public.parties (id);
alter table public.vehicles            add constraint vehicles_driver_fk              foreign key (driver_id) references public.drivers (id);

alter table public.products            add constraint products_party_fk               foreign key (party_id) references public.parties (id);
alter table public."purchaseOrders"    add constraint purchase_orders_party_fk        foreign key (party_id) references public.parties (id);
alter table public."costReports"       add constraint cost_reports_party_fk           foreign key (party_id) references public.parties (id);
alter table public.gsm_reports         add constraint gsm_reports_vendor_fk           foreign key (vendor_id) references public.parties (id);
alter table public.crm_contacts        add constraint crm_contacts_party_fk           foreign key (party_id) references public.parties (id);
alter table public.crm_deals           add constraint crm_deals_party_fk              foreign key (party_id) references public.parties (id);
alter table public.crm_followups       add constraint crm_followups_party_fk          foreign key (party_id) references public.parties (id);
alter table public.crm_followups       add constraint crm_followups_deal_fk           foreign key (deal_id) references public.crm_deals (id);
alter table public.crm_interactions    add constraint crm_interactions_party_fk       foreign key (party_id) references public.parties (id);
alter table public."costReports"       add constraint cost_reports_deal_fk            foreign key (deal_id) references public.crm_deals (id);

alter table public."rentalUnits"       add constraint rental_units_property_fk        foreign key (property_id) references public."rentalProperties" (id);
alter table public."rentalAgreements"  add constraint rental_agreements_unit_fk       foreign key (unit_id) references public."rentalUnits" (id);
alter table public."rentalAgreements"  add constraint rental_agreements_property_fk   foreign key (property_id) references public."rentalProperties" (id);
alter table public."rentalAgreements"  add constraint rental_agreements_tenant_fk     foreign key (tenant_id) references public.parties (id);
alter table public."rentalBills"       add constraint rental_bills_agreement_fk       foreign key (agreement_id) references public."rentalAgreements" (id);
alter table public."rentalBills"       add constraint rental_bills_unit_fk            foreign key (unit_id) references public."rentalUnits" (id);
alter table public."rentalBills"       add constraint rental_bills_property_fk        foreign key (property_id) references public."rentalProperties" (id);
alter table public."rentalBills"       add constraint rental_bills_tenant_fk          foreign key (tenant_id) references public.parties (id);

-- A login session belongs to its user; removing the user removes them.
alter table public.sessions            add constraint sessions_user_fk                foreign key (user_id) references public.system_users (id) on delete cascade;

-- Indexes for the new links that do not have one yet (joins and the
-- delete-time checks use them).
create index if not exists expenses_party_idx on public.expenses (party_id);
create index if not exists expenses_account_idx on public.expenses (account_id);
create index if not exists cheques_account_idx on public.cheques (account_id);
create index if not exists trips_party_idx on public.trips (party_id);
create index if not exists vehicles_driver_idx on public.vehicles (driver_id);
create index if not exists cost_reports_party_idx on public."costReports" (party_id);
create index if not exists gsm_reports_vendor_idx on public.gsm_reports (vendor_id);
create index if not exists crm_contacts_party_idx on public.crm_contacts (party_id);
create index if not exists rental_units_property_idx on public."rentalUnits" (property_id);
