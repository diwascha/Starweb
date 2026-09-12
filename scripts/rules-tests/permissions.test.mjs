import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const env = await initializeTestEnvironment({
  projectId: 'starsutra-rules',
  firestore: { rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});

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
const ALL = [...HR_COLS,...FIN_COLS,...FLEET_COLS,...RENTAL_COLS,...CRM_COLS,...PO_COLS,...REPORT_COLS,...SHARED,'notes','files','pageVisits'];

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
  for (const c of ALL) await setDoc(doc(db, `${c}/seed`), { v: 1 });
  await setDoc(doc(db,'settings/companyProfile'), { nameEn:'X' });
  await setDoc(doc(db,'sessions/boss_dev'), { userId:'boss' });
  await setDoc(doc(db,'sessions/hrview_dev'), { userId:'hrview' });
});

const as = id => env.authenticatedContext(id).firestore();
const anon = env.unauthenticatedContext().firestore();
const boss = as('boss'), hrview = as('hrview'), hrfull = as('hrfull'),
      finedit = as('finedit'), nobody = as('nobody'), pending = as('pending');

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

console.log('\n=== 9. Admin still has everything ===');
for (const c of ALL) await allow(`admin writes ${c}`, () => setDoc(doc(boss, `${c}/adm`), { v:1 }));

console.log('\n' + '='.repeat(64));
if (fails.length) { fails.slice(0,40).forEach(f => console.log('  FAIL ' + f));
  console.log('='.repeat(64)); console.log(`${pass} passed, ${fails.length} FAILED`); }
else { console.log(`${pass} passed, 0 failed`); console.log('='.repeat(64)); }
await env.cleanup();
process.exit(fails.length ? 1 : 0);
