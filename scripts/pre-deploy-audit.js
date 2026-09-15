/**
 * Tells you exactly what needs fixing in Firestore BEFORE deploying the rules.
 *
 * Read-only - it changes nothing. Run it from a trusted machine with a service
 * account key; it never needs to be committed anywhere or pasted into a chat.
 *
 *   npm i firebase-admin
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/pre-deploy-audit.js
 *
 * The rules changed from "any approved user gets everything" to "an approved
 * user gets exactly the modules set in Settings > System". So the two things
 * that will strand a real person are an account with no isApproved field, and
 * an account with no permissions.
 */
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

const MODULES = ['dashboard','finance','reports','purchaseOrders','crm','hr','fleet','rental','notes','settings'];

const actionsOf = (entry) =>
  Array.isArray(entry) ? entry : (entry && Array.isArray(entry.actions) ? entry.actions : []);

(async () => {
  const snap = await db.collection('system_users').get();
  console.log(`${snap.size} accounts in system_users\n`);

  const missingApproved = [], noPermissions = [], legacyShape = [], admins = [], ok = [];

  snap.docs.forEach(d => {
    const u = d.data();
    const label = `${d.id}  ${u.username || '(no username)'}  ${u.email || ''}`;
    if (u.isAdmin === true) { admins.push(label); return; }
    if (u.isApproved === undefined) missingApproved.push(label);

    const perms = u.permissions || {};
    const granted = MODULES.filter(m => actionsOf(perms[m]).length > 0);
    if (granted.length === 0) noPermissions.push(label);
    else ok.push(`${label}\n        -> ${granted.map(m => `${m}:[${actionsOf(perms[m]).join(',')}]`).join('  ')}`);

    if (MODULES.some(m => Array.isArray(perms[m]))) legacyShape.push(label);
  });

  const section = (title, rows, note) => {
    console.log(`\n=== ${title} (${rows.length}) ===`);
    if (note) console.log(note);
    rows.forEach(r => console.log('   ', r));
  };

  section('ADMINISTRATORS', admins,
    'These keep full access regardless of permissions. If this list is empty,\nSTOP: set one admin from the console first or nobody can manage users.');

  section('NO isApproved FIELD - THESE WILL BE LOCKED OUT', missingApproved,
    'The rules treat a missing flag as not approved. Set isApproved: true on the\nones you recognise. Do NOT blanket-approve: an unknown document may be\nsomeone who exploited the old open create rule.');

  section('APPROVED BUT NO PERMISSIONS - THESE WILL SIGN IN TO AN EMPTY APP', noPermissions,
    'Previously these had full access to everything, which is the bug. Give each\none its modules in Settings > System before deploying.');

  section('LEGACY PERMISSION SHAPE (bare list, not { actions: [...] })', legacyShape,
    'Supported by both the app and the rules, so nothing breaks. Re-saving the\nuser in Settings > System normalises it.');

  section('READY', ok);

  const blocking = missingApproved.length + noPermissions.length;
  console.log('\n' + '='.repeat(64));
  console.log(admins.length === 0
    ? 'BLOCKED: no administrator. Set one from the console before deploying.'
    : blocking === 0
      ? 'Nothing blocking. Safe to deploy the rules.'
      : `${blocking} account(s) need attention before you deploy.`);
})().catch(e => { console.error(e); process.exit(1); });
