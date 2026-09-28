// Tests supabase/migrations/0002_access_rules.sql against an in-memory
// Postgres (PGlite) with stand-ins for Supabase's roles and auth.jwt().
// Run:  npm install --no-save @electric-sql/pglite@0.2 && node scripts/supabase-tests/access-rules.test.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';

const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const db = new PGlite();

// --- Supabase stand-ins ------------------------------------------------------
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.jwt() to anon, authenticated;
`);
await db.exec(read('supabase/migrations/0001_tables.sql'));
await db.exec(read('supabase/migrations/0002_access_rules.sql'));
await db.exec(read('supabase/migrations/0003_hardening.sql'));
await db.exec(`
  grant usage on schema public to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to anon, authenticated;
`);

// --- Seed data (as the database owner; rules don't apply) -------------------
const j = (o) => JSON.stringify(o).replace(/'/g, "''");
const seed = (t, id, data) => db.exec(`insert into public."${t}" (id, data) values ('${id}', '${j(data)}')`);
await seed('system_users', 'u-boss', { email: 'boss@x.com', username: 'boss', isApproved: true, isAdmin: true, permissions: {} });
await seed('system_users', 'u-boss2', { email: 'boss2@x.com', username: 'boss2', isApproved: true, isAdmin: true, permissions: {} });
await seed('system_users', 'u-hrview', { email: 'hrview@x.com', username: 'hrview', isApproved: true, isAdmin: false, permissions: { hr: { actions: ['view'] } } });
await seed('system_users', 'u-hredit', { email: 'HREdit@x.com', username: 'hredit', isApproved: true, isAdmin: false, permissions: { hr: { actions: ['view', 'add', 'edit', 'delete'] } } });
await seed('system_users', 'u-fin', { email: 'fin@x.com', username: 'fin', isApproved: true, isAdmin: false, permissions: { finance: ['all'] } });
await seed('system_users', 'u-set', { email: 'set@x.com', username: 'set', isApproved: true, isAdmin: false, permissions: { settings: { actions: ['view'] } } });
await seed('system_users', 'u-pending', { email: 'pending@x.com', username: 'pending', isApproved: false, isAdmin: false, permissions: { hr: ['all'] } });
await seed('usernames', 'hrview', { username: 'hrview', email: 'hrview@x.com' });
await seed('payroll_periods', '2081-1', { bsYear: 2081, bsMonth: 1, locked: true });
await seed('payroll', 'p-locked', { bsYear: 2081, bsMonth: 1, employeeName: 'Ram', netPayment: 500 });
await seed('payroll', 'p-open', { bsYear: 2081, bsMonth: 2, employeeName: 'Sita', netPayment: 600 });
await seed('cheques', 'c1', { amount: 10 });
await seed('transactions', 't1', { amount: 20 });
await seed('parties', 'pa1', { name: 'ABC' });
await seed('settings', 'appBranding', { value: { name: 'StarSutra' } });
await seed('settings', 'costing', { value: { secret: 1 } });
await seed('settings', 'hr_config', { value: {} });
await seed('logs', 'l1', { userId: 'u-boss', message: 'x' });
await seed('sessions', 's-hrview', { userId: 'u-hrview' });
await seed('sessions', 's-fin', { userId: 'u-fin' });

// --- Harness -----------------------------------------------------------------
let pass = 0; const fails = [];
async function as(who, sql) {
  const role = who === 'anon' ? 'anon' : 'authenticated';
  const claims = who === 'anon' ? '' : j({ email: who, role });
  await db.exec(`begin; set local role ${role}; set local request.jwt.claims = '${claims}';`);
  try { const r = await db.query(sql); await db.exec('commit'); return r; }
  catch (e) { await db.exec('rollback'); throw e; }
}
const rows = async (who, sql) => (await as(who, sql)).rows;
const count = async (who, sql) => (await rows(who, sql)).length;
const ok = (name, cond, extra = '') => { if (cond) pass++; else fails.push(name + (extra ? ` (${extra})` : '')); };
const allows = async (name, who, sql) => { try { const r = await as(who, sql); ok(name, (r.affectedRows ?? 1) > 0, 'affected 0 rows'); } catch (e) { ok(name, false, e.message); } };
const denies = async (name, who, sql) => { try { const r = await as(who, sql); ok(name, (r.affectedRows ?? 0) === 0, 'was allowed'); } catch { pass++; } };
const get = async (t, id) => (await db.query(`select data from public."${t}" where id = '${id}'`)).rows[0]?.data;

// --- Anonymous ---------------------------------------------------------------
ok('anon: no payroll', await count('anon', 'select * from payroll') === 0);
ok('anon: no system_users', await count('anon', 'select * from system_users') === 0);
ok('anon: no usernames list', await count('anon', 'select * from usernames') === 0);
ok('anon: public branding', await count('anon', "select * from settings where id = 'appBranding'") === 1);
ok('anon: not costing', await count('anon', "select * from settings where id = 'costing'") === 0);
ok('anon: username lookup', (await rows('anon', "select public.email_for_username('HRView') as e"))[0].e === 'hrview@x.com');
ok('anon: unknown username', (await rows('anon', "select public.email_for_username('nobody') as e"))[0].e === null);
await denies('anon: insert parties', 'anon', `insert into parties (id, data) values ('x', '{}')`);

// --- Signed in but no record / not approved ----------------------------------
for (const who of ['stranger@x.com', 'pending@x.com']) {
  ok(`${who}: no payroll`, await count(who, 'select * from payroll') === 0);
  ok(`${who}: no parties`, await count(who, 'select * from parties') === 0);
  ok(`${who}: no settings beyond public`, await count(who, 'select * from settings') === 1);
  await denies(`${who}: insert payroll`, who, `insert into payroll (id, data) values ('z', '{"bsYear":2081,"bsMonth":3}')`);
}

// --- Module permissions --------------------------------------------------------
ok('hrview: reads payroll', await count('hrview@x.com', 'select * from payroll') === 2);
ok('hrview: no cheques', await count('hrview@x.com', 'select * from cheques') === 0);
ok('hrview: no parties (shared, not hr)', await count('hrview@x.com', 'select * from parties') === 0);
await denies('hrview: add payroll', 'hrview@x.com', `insert into payroll (id, data) values ('v1', '{"bsYear":2081,"bsMonth":3}')`);
await denies('hrview: edit payroll', 'hrview@x.com', `update payroll set data = data || '{"netPayment":1}' where id = 'p-open'`);
ok('email match ignores case', await count('hredit@x.com', 'select * from payroll') === 2);
ok('fin (array perms): cheques', await count('fin@x.com', 'select * from cheques') === 1);
ok('fin: transactions (shared)', await count('fin@x.com', 'select * from transactions') === 1);
ok('fin: parties (shared)', await count('fin@x.com', 'select * from parties') === 1);
ok('fin: no payroll', await count('fin@x.com', 'select * from payroll') === 0);
await allows('fin: add cheque', 'fin@x.com', `insert into cheques (id, data) values ('c2', '{"amount":5}')`);
await allows('fin: delete cheque', 'fin@x.com', `delete from cheques where id = 'c2'`);
ok('admin: reads everything', await count('boss@x.com', 'select * from payroll') === 2 && await count('boss@x.com', 'select * from cheques') === 1);

// --- Locked months -------------------------------------------------------------
await allows('hredit: add open month', 'hredit@x.com', `insert into payroll (id, data) values ('e1', '{"bsYear":2081,"bsMonth":3}')`);
await denies('hredit: add locked month', 'hredit@x.com', `insert into payroll (id, data) values ('e2', '{"bsYear":2081,"bsMonth":1}')`);
await denies('hredit: edit locked amount', 'hredit@x.com', `update payroll set data = data || '{"netPayment":999}' where id = 'p-locked'`);
ok('locked amount unchanged', (await get('payroll', 'p-locked')).netPayment === 500);
await allows('hredit: rename in locked (merge)', 'hredit@x.com', `update payroll set data = data || '{"employeeName":"Ram B"}' where id = 'p-locked'`);
await denies('hredit: move open row into locked month', 'hredit@x.com', `update payroll set data = data || '{"bsMonth":1}' where id = 'p-open'`);
await allows('hredit: edit open month', 'hredit@x.com', `update payroll set data = data || '{"netPayment":650}' where id = 'p-open'`);
await denies('hredit: delete locked', 'hredit@x.com', `delete from payroll where id = 'p-locked'`);
await denies('admin: edit locked amount', 'boss@x.com', `update payroll set data = data || '{"netPayment":1}' where id = 'p-locked'`);
await allows('admin: add locked month', 'boss@x.com', `insert into payroll (id, data) values ('e3', '{"bsYear":2081,"bsMonth":1}')`);
await allows('admin: delete locked', 'boss@x.com', `delete from payroll where id = 'e3'`);
await denies('hrview: cannot unlock a period', 'hrview@x.com', `update payroll_periods set data = data || '{"locked":false}' where id = '2081-1'`);

// --- system_users ----------------------------------------------------------------
ok('hrview: reads own record only', (await rows('hrview@x.com', 'select id from system_users')).map(r => r.id).join() === 'u-hrview');
ok('admin: reads all users', await count('boss@x.com', 'select * from system_users') === 7);
await denies('hrview: make self admin', 'hrview@x.com', `update system_users set data = data || '{"isAdmin":true}' where id = 'u-hrview'`);
await denies('hrview: grant self permissions', 'hrview@x.com', `update system_users set data = jsonb_set(data, '{permissions}', '{"finance":["all"]}') where id = 'u-hrview'`);
await denies('hrview: change own email', 'hrview@x.com', `update system_users set data = data || '{"email":"boss@x.com"}' where id = 'u-hrview'`);
await allows('hrview: edit own username', 'hrview@x.com', `update system_users set data = data || '{"username":"hrv"}' where id = 'u-hrview'`);
await denies('hrview: edit someone else', 'hrview@x.com', `update system_users set data = data || '{"username":"hacked"}' where id = 'u-fin'`);
ok('someone else untouched', (await get('system_users', 'u-fin')).username === 'fin');
await allows('admin: grant permissions to other', 'boss@x.com', `update system_users set data = jsonb_set(data, '{permissions}', '{"fleet":["view"]}') where id = 'u-fin'`);
await denies('admin: remove own admin', 'boss@x.com', `update system_users set data = data || '{"isAdmin":false}' where id = 'u-boss'`);
await denies('admin: delete another admin', 'boss@x.com', `delete from system_users where id = 'u-boss2'`);
await denies('admin: delete self', 'boss@x.com', `delete from system_users where id = 'u-boss'`);
await allows('admin: delete non-admin', 'boss@x.com', `delete from system_users where id = 'u-set'`);
await seed('system_users', 'u-set', { email: 'set@x.com', username: 'set', isApproved: true, isAdmin: false, permissions: { settings: { actions: ['view'] } } });
await allows('stranger: self sign-up pending', 'new@x.com', `insert into system_users (id, data) values ('u-new', '{"email":"new@x.com","isApproved":false,"isAdmin":false}')`);
await denies('stranger: self sign-up as admin', 'new2@x.com', `insert into system_users (id, data) values ('u-new2', '{"email":"new2@x.com","isApproved":false,"isAdmin":true}')`);
await denies('stranger: sign-up approved', 'new3@x.com', `insert into system_users (id, data) values ('u-new3', '{"email":"new3@x.com","isApproved":true}')`);
await denies('stranger: record for another email', 'new4@x.com', `insert into system_users (id, data) values ('u-new4', '{"email":"boss9@x.com"}')`);
await denies('hrview: second record for own email', 'hrview@x.com', `insert into system_users (id, data) values ('u-dup', '{"email":"hrview@x.com"}')`);
ok('pending new user gets nothing', await count('new@x.com', 'select * from payroll') === 0);

// --- usernames, sessions, logs --------------------------------------------------
ok('hrview: no usernames', await count('hrview@x.com', 'select * from usernames') === 0);
ok('admin: usernames', await count('boss@x.com', 'select * from usernames') === 1);
await denies('hrview: hijack username', 'hrview@x.com', `update usernames set data = data || '{"email":"x@x.com"}' where id = 'hrview'`);
ok('hrview: own session only', (await rows('hrview@x.com', 'select id from sessions')).map(r => r.id).join() === 's-hrview');
await denies('hrview: forge session for fin', 'hrview@x.com', `insert into sessions (id, data) values ('s-x', '{"userId":"u-fin"}')`);
await allows('hrview: log as self', 'hrview@x.com', `insert into logs (id, data) values ('l2', '{"userId":"u-hrview","message":"hi"}')`);
await denies('hrview: forge log as admin', 'hrview@x.com', `insert into logs (id, data) values ('l3', '{"userId":"u-boss","message":"x"}')`);
await denies('stranger: log', 'stranger@x.com', `insert into logs (id, data) values ('l4', '{"userId":null}')`);
ok('hrview: cannot read logs', await count('hrview@x.com', 'select * from logs') === 0);
ok('admin: reads logs', await count('boss@x.com', 'select * from logs') === 2);

// --- settings ----------------------------------------------------------------------
ok('approved: reads costing', await count('hrview@x.com', "select * from settings where id = 'costing'") === 1);
await allows('hredit: edit hr_config', 'hredit@x.com', `update settings set data = '{"value":{"a":1}}' where id = 'hr_config'`);
await denies('hredit: edit costing', 'hredit@x.com', `update settings set data = '{"value":{}}' where id = 'costing'`);
await denies('hrview: edit hr_config', 'hrview@x.com', `update settings set data = '{"value":{}}' where id = 'hr_config'`);
await denies('hredit: create unmapped setting', 'hredit@x.com', `insert into settings (id, data) values ('unknown', '{}')`);
await allows('admin: create any setting', 'boss@x.com', `insert into settings (id, data) values ('unknown', '{}')`);

// --- pageVisits ----------------------------------------------------------------------
await as('hrview@x.com', "select public.record_page_visit('/hr/payroll')");
await as('hrview@x.com', "select public.record_page_visit('/hr/payroll')");
await as('pending@x.com', "select public.record_page_visit('/hr/payroll')");
ok('page visits counted (approved only)', (await get('pageVisits', '_hr_payroll')).count === 2);
ok('hrview: cannot read visits', await count('hrview@x.com', 'select * from "pageVisits"') === 0);
ok('settings viewer: reads visits', await count('set@x.com', 'select * from "pageVisits"') === 1);
await denies('hrview: write visits directly', 'hrview@x.com', `insert into "pageVisits" (id, data) values ('x', '{"count":999}')`);

console.log(`${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log('FAIL', f);
process.exit(fails.length ? 1 : 0);
