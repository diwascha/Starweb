import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const env = await initializeTestEnvironment({
  projectId: 'starsutra-rules',
  firestore: { rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});

// Start from an empty database: the emulator keeps documents between runs,
// which turns a second run's "create" checks into updates.
await env.clearFirestore();

let pass = 0; const fails = [];
const ok = (name, cond, detail='') => { if (cond) pass++; else fails.push(`${name} ${detail}`); };

const allow = async (name, op) => {
  try { await op(); pass++; } catch (e) { fails.push(`${name} -> DENIED (${e.code||e.message}) but should be ALLOWED`); }
};
const deny = async (name, op) => {
  try { await op(); fails.push(`${name} -> ALLOWED but should be DENIED`); }
  catch { pass++; }
};

const HR_COLS = ['employees','attendance','payroll','raw_machine_logs','bonus_ledger','bonus_summaries',
  'behavior_ledger','behavior_analytics','analytics_reports','hr_shifts','leave_requests',
  'public_holidays','attendance_periods','payroll_periods'];
const FIN_COLS = ['tdsCalculations','estimatedInvoices','cheques','expenses','payment_tracker','accounts'];
const FLEET_COLS = ['vehicles','drivers','policies','transactions','trips','destinations'];
const RENTAL_COLS = ['rentalProperties','rentalUnits','rentalAgreements','rentalBills'];
const CRM_COLS = ['crm_contacts','crm_deals','crm_followups','crm_interactions','costReports'];
const PO_COLS = ['purchaseOrders','rawMaterials'];
const REPORT_COLS = ['reports','gsm_reports'];
const SHARED = ['parties','products','uom','numberCounters'];
const ALL = [...HR_COLS,...FIN_COLS,...FLEET_COLS,...RENTAL_COLS,...CRM_COLS,...PO_COLS,...REPORT_COLS,...SHARED,'notes','pageVisits'];

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db,'system_users/boss'),   { username:'boss', isApproved:true, isAdmin:true, permissions:{} });
  await setDoc(doc(db,'system_users/hrview'), { username:'hrview', isApproved:true, isAdmin:false,
    permissions:{ hr:{actions:['view'],ownerships:[]} } });
  await setDoc(doc(db,'system_users/hrfull'), { username:'hrfull', isApproved:true, isAdmin:false,
    permissions:{ hr:{actions:['all'],ownerships:[]} } });
  await setDoc(doc(db,'system_users/finedit'),{ username:'finedit', isApproved:true, isAdmin:false,
    permissions:{ finance:{actions:['view','add','edit'],ownerships:[]} } });
  await setDoc(doc(db,'system_users/nobody'), { username:'nobody', isApproved:true, isAdmin:false, permissions:{} });
  await setDoc(doc(db,'system_users/pending'),{ username:'pending', isApproved:false, isAdmin:false,
    permissions:{ hr:{actions:['all'],ownerships:[]} } });
  // A separate fixture for the approval test, so approving it does not
  // silently make the "unapproved user" assertions below meaningless.
  await setDoc(doc(db,'system_users/promote_me'),{ username:'promote', isApproved:false, isAdmin:false, permissions:{} });
  // Legacy permission shape: actions stored as a bare list, which the browser
  // still honours. The rules must agree or these accounts break.
  await setDoc(doc(db,'system_users/legacy'), { username:'legacy', isApproved:true, isAdmin:false, permissions:{ hr:['view'] } });
  // Settings-page permissions, as granted in Settings > System.
  await setDoc(doc(db,'system_users/setview'), { username:'setview', isApproved:true, isAdmin:false,
    permissions:{ settings:{actions:['view'],ownerships:[]} } });
  await setDoc(doc(db,'system_users/setedit'), { username:'setedit', isApproved:true, isAdmin:false,
    permissions:{ settings:{actions:['view','edit'],ownerships:[]} } });
  await setDoc(doc(db,'system_users/crmedit'), { username:'crmedit', isApproved:true, isAdmin:false,
    permissions:{ crm:{actions:['view','edit'],ownerships:[]} } });
  for (const c of ALL) await setDoc(doc(db, `${c}/seed`), { v: 1 });
  await setDoc(doc(db,'unknown_collection/seed'), { v: 1 });
  await setDoc(doc(db,'settings/companyProfile'), { nameEn:'X' });
  await setDoc(doc(db,'sessions/boss_dev'), { userId:'boss' });
  await setDoc(doc(db,'sessions/hrview_dev'), { userId:'hrview' });
});

const as = id => env.authenticatedContext(id).firestore();
const anon = env.unauthenticatedContext().firestore();
const boss = as('boss'), hrview = as('hrview'), hrfull = as('hrfull'),
      finedit = as('finedit'), nobody = as('nobody'), pending = as('pending'),
      setview = as('setview'), setedit = as('setedit'), crmedit = as('crmedit');

console.log('\n=== 1. The escalation that was open ===');
await deny('non-admin sets isAdmin on self', () => updateDoc(doc(hrview,'system_users/hrview'), { isAdmin:true }));
await deny('unapproved user approves self', () => updateDoc(doc(pending,'system_users/pending'), { isApproved:true }));
await deny('non-admin grants self permissions', () => updateDoc(doc(hrview,'system_users/hrview'), { permissions:{finance:{actions:['all'],ownerships:[]}} }));
await deny('non-admin rewrites the admin', () => updateDoc(doc(hrview,'system_users/boss'), { isAdmin:false }));
await deny('non-admin reads another profile', () => getDoc(doc(hrview,'system_users/boss')));
await deny('non-admin lists all users', () => getDocs(collection(hrview,'system_users')));
await allow('user reads own profile', () => getDoc(doc(hrview,'system_users/hrview')));
await allow('admin lists users', () => getDocs(collection(boss,'system_users')));
await allow('admin approves another user', () => updateDoc(doc(boss,'system_users/promote_me'), { isApproved:true }));

console.log('\n=== 2. Module isolation (the point of the exercise) ===');
for (const c of FIN_COLS) await deny(`hr-only reads finance/${c}`, () => getDoc(doc(hrview, `${c}/seed`)));
for (const c of FLEET_COLS) await deny(`hr-only reads fleet/${c}`, () => getDoc(doc(hrview, `${c}/seed`)));
for (const c of HR_COLS) await allow(`hr:view reads ${c}`, () => getDoc(doc(hrview, `${c}/seed`)));
for (const c of HR_COLS) await deny(`hr:view cannot write ${c}`, () => setDoc(doc(hrview, `${c}/new1`), { v:2 }));
for (const c of HR_COLS) await allow(`hr:all writes ${c}`, () => setDoc(doc(hrfull, `${c}/new2`), { v:2 }));
for (const c of HR_COLS) await allow(`hr:all deletes ${c}`, () => deleteDoc(doc(hrfull, `${c}/new2`)));

console.log('\n=== 3. Action granularity ===');
await allow('finance view+add+edit: read',   () => getDoc(doc(finedit,'cheques/seed')));
await allow('finance view+add+edit: create', () => setDoc(doc(finedit,'cheques/c1'), { amt:1 }));
await allow('finance view+add+edit: update', () => updateDoc(doc(finedit,'cheques/c1'), { amt:2 }));
await deny ('finance without delete: delete',() => deleteDoc(doc(finedit,'cheques/c1')));
await deny ('finance user reads payroll',    () => getDoc(doc(finedit,'payroll/seed')));

console.log('\n=== 4. Approved-but-no-permissions is no longer full access ===');
for (const c of [...HR_COLS,...FIN_COLS,...FLEET_COLS,...CRM_COLS]) {
  await deny(`no-permission user reads ${c}`, () => getDoc(doc(nobody, `${c}/seed`)));
  await deny(`no-permission user writes ${c}`, () => setDoc(doc(nobody, `${c}/x`), { v:1 }));
}

console.log('\n=== 5. Unapproved user gets nothing, despite hr:all ===');
for (const c of HR_COLS) await deny(`pending reads ${c}`, () => getDoc(doc(pending, `${c}/seed`)));
await deny('pending writes payroll', () => setDoc(doc(pending,'payroll/x'), { v:1 }));

console.log('\n=== 6. Anonymous ===');
await deny('anon reads payroll', () => getDoc(doc(anon,'payroll/seed')));
await deny('anon writes logs',   () => setDoc(doc(anon,'logs/x'), { m:'x' }));
await allow('anon reads companyProfile (login screen needs it)', () => getDoc(doc(anon,'settings/companyProfile')));
await allow('anon reads a username doc (login resolves email)', async () => {
  await env.withSecurityRulesDisabled(async c => setDoc(doc(c.firestore(),'usernames/bob'), { uid:'u', email:'b@x' }));
  return getDoc(doc(anon,'usernames/bob'));
});
await deny('anon lists usernames', () => getDocs(collection(anon,'usernames')));

console.log('\n=== 7. Shared reference data ===');
// Finance genuinely reads and writes products (the invoice calculator calls
// addProduct/updateProduct). It has no business with uom, which is a purchase
// order / fleet concern.
for (const c of ['parties','products','numberCounters']) {
  await allow(`finance user reads ${c}`, () => getDoc(doc(finedit, `${c}/seed`)));
  await allow(`finance user creates in ${c}`, () => setDoc(doc(finedit, `${c}/s1`), { v:1 }));
}
await deny('finance user reads uom', () => getDoc(doc(finedit,'uom/seed')));
for (const c of SHARED) await deny(`no-permission user reads ${c}`, () => getDoc(doc(nobody, `${c}/seed`)));

console.log('\n=== 7b. Legacy permission shape ===');
{
  const legacy = as('legacy');
  await allow('legacy hr:[view] reads payroll', () => getDoc(doc(legacy,'payroll/seed')));
  await deny ('legacy hr:[view] cannot write payroll', () => setDoc(doc(legacy,'payroll/L1'), { v:1 }));
  await deny ('legacy hr:[view] cannot read finance', () => getDoc(doc(legacy,'cheques/seed')));
}

console.log('\n=== 8. Sessions ===');
await allow('user reads own session',  () => getDoc(doc(hrview,'sessions/hrview_dev')));
await deny ('user reads other session',() => getDoc(doc(hrview,'sessions/boss_dev')));
await deny ('user deletes other session', () => deleteDoc(doc(hrview,'sessions/boss_dev')));
await deny ('user lists all sessions', () => getDocs(collection(hrview,'sessions')));
await allow('admin lists sessions',    () => getDocs(collection(boss,'sessions')));

console.log('\n=== 10. Settings documents follow the screen that saves them ===');
for (const id of ['companyProfile','fleetCompanyProfile','personalProfile','appBranding','documentPrefixes','ownership_categories'])
  await allow(`settings editor saves ${id}`, () => setDoc(doc(setedit, `settings/${id}`), { value: 1 }));
for (const id of ['companyProfile','documentPrefixes'])
  await deny (`settings view-only saves ${id}`, () => setDoc(doc(setview, `settings/${id}`), { value: 1 }));
await allow('settings view-only reads companyProfile', () => getDoc(doc(setview, 'settings/companyProfile')));
for (const id of ['session_config','hr_feature_locks','hr_config','chequeLayout','costing'])
  await deny (`settings editor saves ${id}`, () => setDoc(doc(setedit, `settings/${id}`), { value: 1 }));
await allow('hr editor saves hr_config',        () => setDoc(doc(hrfull, 'settings/hr_config'), { value: 1 }));
await deny ('hr view-only saves hr_config',     () => setDoc(doc(hrview, 'settings/hr_config'), { value: 1 }));
await allow('finance editor saves chequeLayout',() => setDoc(doc(finedit, 'settings/chequeLayout'), { value: 1 }));
await deny ('finance editor saves companyProfile', () => setDoc(doc(finedit, 'settings/companyProfile'), { value: 1 }));
await allow('crm editor saves costing',         () => setDoc(doc(crmedit, 'settings/costing'), { value: 1 }));
await deny ('crm editor saves hr_config',       () => setDoc(doc(crmedit, 'settings/hr_config'), { value: 1 }));
await allow('admin saves session_config',       () => setDoc(doc(boss, 'settings/session_config'), { value: 1 }));

// Settings > Finance manages parties, accounts and period locks; Settings > General manages units.
for (const c of ['parties','accounts','uom','payroll_periods','attendance_periods']) {
  await allow(`settings editor edits ${c}`,   () => updateDoc(doc(setedit, `${c}/seed`), { v: 2 }));
  await deny (`settings view-only edits ${c}`, () => updateDoc(doc(setview, `${c}/seed`), { v: 3 }));
}
for (const c of ['employees','payroll','attendance'])
  await deny (`settings editor edits HR ${c}`, () => updateDoc(doc(setedit, `${c}/seed`), { v: 2 }));
await allow('hr editor still edits payroll_periods', () => updateDoc(doc(hrfull, 'payroll_periods/seed'), { v: 4 }));

console.log('\n=== 11. Unmapped collections are admin-only ===');
for (const [name, db] of [['approved no-perm user', nobody], ['hr full user', hrfull], ['settings editor', setedit]]) {
  await deny (`${name} reads unknown collection`,  () => getDoc(doc(db, 'unknown_collection/seed')));
  await deny (`${name} writes unknown collection`, () => setDoc(doc(db, 'unknown_collection/x'), { v: 1 }));
}
await allow('admin writes unknown collection', () => setDoc(doc(boss, 'unknown_collection/adm'), { v: 1 }));

console.log('\n=== 12. Settings need approval; logs are attributed to the caller ===');
await allow('approved user reads a settings doc',    () => getDoc(doc(nobody, 'settings/hr_config')));
await deny ('unapproved user reads a settings doc',  () => getDoc(doc(pending, 'settings/hr_config')));
await allow('unapproved user reads companyProfile (login screen)', () => getDoc(doc(pending, 'settings/companyProfile')));
await allow('anonymous reads companyProfile (login screen)',       () => getDoc(doc(anon, 'settings/companyProfile')));
await allow('user logs as themselves',  () => setDoc(doc(hrview, 'logs/own'), { userId: 'hrview', message: 'x' }));
await deny ('user logs as someone else',() => setDoc(doc(hrview, 'logs/forged'), { userId: 'boss', message: 'x' }));
await deny ('user logs without userId', () => setDoc(doc(hrview, 'logs/blank'), { message: 'x' }));
await deny ('anonymous writes a log',   () => setDoc(doc(anon, 'logs/anon'), { userId: '', message: 'x' }));

console.log('\n=== 13. Page-visit tracking works for every approved user ===');
await allow('approved user starts a visit counter', () => setDoc(doc(nobody, 'pageVisits/dash'), { path: '/dashboard', count: 1, lastVisited: 1 }));
await allow('approved user adds one visit',       () => updateDoc(doc(nobody, 'pageVisits/dash'), { count: 2, lastVisited: 2 }));
await deny ('approved user inflates a counter',   () => updateDoc(doc(nobody, 'pageVisits/dash'), { count: 999 }));
await deny ('approved user starts at 50',         () => setDoc(doc(nobody, 'pageVisits/other'), { path: '/x', count: 50, lastVisited: 1 }));
await deny ('approved user adds extra fields',    () => setDoc(doc(nobody, 'pageVisits/extra'), { path: '/x', count: 1, lastVisited: 1, note: 'x' }));
await deny ('approved user reads visit stats',    () => getDoc(doc(nobody, 'pageVisits/dash')));
await deny ('unapproved user records a visit',    () => setDoc(doc(pending, 'pageVisits/p'), { path: '/x', count: 1, lastVisited: 1 }));

console.log('\n=== 14. Username mappings cannot be hijacked ===');
await env.withSecurityRulesDisabled(async c => {
  await setDoc(doc(c.firestore(),'usernames/bossname'), { uid:'boss', email:'boss@x', username:'bossname' });
  await setDoc(doc(c.firestore(),'usernames/hrviewname'), { uid:'hrview', email:'hr@x', username:'hrviewname' });
});
await deny ('user overwrites admin username mapping', () => setDoc(doc(hrview,'usernames/bossname'), { uid:'hrview', email:'evil@x' }, { merge: true }));
await deny ('user creates a new username mapping',    () => setDoc(doc(hrview,'usernames/newname'), { uid:'hrview', email:'hr@x' }));
await deny ('user hands own mapping to someone else', () => updateDoc(doc(hrview,'usernames/hrviewname'), { uid:'boss' }));
await allow('user updates own mapping, stays own',    () => updateDoc(doc(hrview,'usernames/hrviewname'), { email:'hr2@x' }));
await deny ('user lists all usernames/emails',        () => getDocs(collection(hrview,'usernames')));
await deny ('user deletes a username mapping',        () => deleteDoc(doc(hrview,'usernames/bossname')));
await allow('admin lists usernames',                  () => getDocs(collection(boss,'usernames')));
await allow('admin provisions a username',            () => setDoc(doc(boss,'usernames/fresh'), { email:'f@x', username:'fresh' }));
await allow('admin attaches uid to it',               () => setDoc(doc(boss,'usernames/fresh'), { uid:'nobody' }, { merge: true }));
await allow('anyone resolves one username at login',  () => getDoc(doc(anon,'usernames/bossname')));

console.log('\n=== 15. Locked months cannot be rewritten (H5) ===');
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  await setDoc(doc(db,'payroll_periods/2082-5'),    { bsYear:2082, bsMonth:5, locked:true });
  await setDoc(doc(db,'attendance_periods/2082-5'), { bsYear:2082, bsMonth:5, locked:true });
  await setDoc(doc(db,'attendance_periods/2082-6'), { bsYear:2082, bsMonth:6, locked:true }); // one side locked is enough
  await setDoc(doc(db,'payroll_periods/2082-7'),    { bsYear:2082, bsMonth:7, locked:false });
  await setDoc(doc(db,'payroll/2082-5-e1'),   { bsYear:2082, bsMonth:5, employeeId:'e1', employeeName:'A', netPayment:100 });
  await setDoc(doc(db,'payroll/2082-6-e1'),   { bsYear:2082, bsMonth:6, employeeId:'e1', employeeName:'A', netPayment:100 });
  await setDoc(doc(db,'payroll/2082-7-e1'),   { bsYear:2082, bsMonth:7, employeeId:'e1', employeeName:'A', netPayment:100 });
  await setDoc(doc(db,'attendance/locked1'),  { bsYear:2082, bsMonth:5, employeeId:'e1', employeeName:'A', regularHours:8 });
});
await deny ('hr editor changes pay in a locked month',          () => updateDoc(doc(hrfull,'payroll/2082-5-e1'), { netPayment: 999 }));
await deny ('hr editor changes pay when only attendance side locked', () => updateDoc(doc(hrfull,'payroll/2082-6-e1'), { netPayment: 999 }));
await allow('hr editor changes pay in an unlocked month',       () => updateDoc(doc(hrfull,'payroll/2082-7-e1'), { netPayment: 150 }));
await deny ('hr editor moves a record into a locked month',     () => updateDoc(doc(hrfull,'payroll/2082-7-e1'), { bsMonth: 5 }));
await deny ('admin changes pay in a locked month',              () => updateDoc(doc(boss,'payroll/2082-5-e1'), { netPayment: 999 }));
await allow('hr editor re-points locked payroll (merge)',       () => updateDoc(doc(hrfull,'payroll/2082-5-e1'), { employeeId:'e2', employeeName:'B' }));
await allow('hr editor re-points locked attendance (merge)',    () => updateDoc(doc(hrfull,'attendance/locked1'), { employeeId:'e2', employeeName:'B', ownership:'Both' }));
await deny ('hr editor edits hours in a locked month',          () => updateDoc(doc(hrfull,'attendance/locked1'), { regularHours: 12 }));
await deny ('hr editor creates payroll in a locked month',      () => setDoc(doc(hrfull,'payroll/2082-5-e9'), { bsYear:2082, bsMonth:5, employeeId:'e9', netPayment:1 }));
await deny ('hr editor creates attendance in a locked month',   () => setDoc(doc(hrfull,'attendance/new1'), { bsYear:2082, bsMonth:5, employeeId:'e9' }));
await allow('hr editor creates payroll in an unlocked month',   () => setDoc(doc(hrfull,'payroll/2082-7-e9'), { bsYear:2082, bsMonth:7, employeeId:'e9', netPayment:1 }));
await deny ('hr editor deletes locked attendance',              () => deleteDoc(doc(hrfull,'attendance/locked1')));
await allow('admin creates payroll in a locked month (merge move)', () => setDoc(doc(boss,'payroll/2082-5-e2'), { bsYear:2082, bsMonth:5, employeeId:'e2', netPayment:100 }));
await allow('admin deletes locked attendance (purge)',          () => deleteDoc(doc(boss,'attendance/locked1')));
await allow('hr editor unlocks the month',                      () => updateDoc(doc(hrfull,'payroll_periods/2082-5'), { locked:false }));
await deny ('...but attendance side still locks it',            () => updateDoc(doc(hrfull,'payroll/2082-5-e1'), { netPayment: 999 }));
await allow('hr editor unlocks attendance side too',            () => updateDoc(doc(hrfull,'attendance_periods/2082-5'), { locked:false }));
await allow('now the month can be edited',                      () => updateDoc(doc(hrfull,'payroll/2082-5-e1'), { netPayment: 999 }));

console.log('\n=== 9. Admin still has everything ===');
for (const c of ALL) await allow(`admin writes ${c}`, () => setDoc(doc(boss, `${c}/adm`), { v:1 }));

console.log('\n' + '='.repeat(64));
if (fails.length) { fails.slice(0,40).forEach(f => console.log('  FAIL ' + f));
  console.log('='.repeat(64)); console.log(`${pass} passed, ${fails.length} FAILED`); }
else { console.log(`${pass} passed, 0 failed`); console.log('='.repeat(64)); }
await env.cleanup();
process.exit(fails.length ? 1 : 0);
