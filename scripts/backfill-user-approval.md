# Before deploying the hardened Firestore rules

> **The rules now enforce per-module permissions, not just approval.** Run
> `scripts/rules-tests/permissions.test.mjs` against the emulator first (see
> that folder's README) — it needs no credentials and no access to the live
> project. Then work through the steps below.
>
> **Step 3 matters more than it used to.** An approved account no longer gets
> everything; it gets exactly the modules set in Settings > System. Confirm
> each person's permissions there *before* deploying, or they will sign in to
> an app with nothing in it.

The rules now treat a missing `isApproved` field as **not approved**. It
previously defaulted to `true`, which is what made the vulnerability possible:
`system_users` allowed `create: if true`, so anyone could write
`/system_users/<their-uid>` with no flags and be treated as an approved user
with read/write access to every collection — or set `isAdmin: true` in the
same write and become an administrator.

Flipping that default closes the hole. It also means **any existing staff
account whose document lacks `isApproved` will stop being able to sign in.**
Run this backfill FIRST, confirm it, then deploy the rules.

## 1. Back up

```
gcloud firestore export gs://<your-bucket>/pre-rules-$(date +%Y%m%d)
```

## 2. Check who would be locked out

In the Firebase console → Firestore → `system_users`, or with the Admin SDK:

```js
// node backfill.js  — needs a service account key, run from a trusted machine
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

(async () => {
  const snap = await db.collection('system_users').get();
  const missing = snap.docs.filter(d => d.get('isApproved') === undefined);

  console.log(`${snap.size} accounts, ${missing.length} missing isApproved:`);
  missing.forEach(d => console.log('  ', d.id, d.get('username'), d.get('email')));
})();
```

## 3. Backfill only the accounts you recognise

Do NOT blanket-approve. The whole point is that an unknown document may be
someone who exploited the old rule. Review the list from step 2 and approve by
id:

```js
const APPROVE = ['uid-of-real-staff-1', 'uid-of-real-staff-2'];   // fill in

const batch = db.batch();
APPROVE.forEach(id => batch.update(db.collection('system_users').doc(id), { isApproved: true }));
await batch.commit();
```

Anything left unapproved simply cannot sign in; you can approve it later from
the app's user admin screen.

## 4. Seed the administrator

`restoreAdminProfile` has been removed — it wrote `isAdmin: true` from the
browser, which on a statically exported app (where Firestore rules are the
only boundary) is an escalation path, not a recovery tool. Set the first
admin by hand, once:

Firebase console → Firestore → `system_users` → the admin's uid →
`isAdmin: true`, `isApproved: true`.

## 5. Deploy and verify

```
firebase deploy --only firestore:rules
```

Then confirm the hole is actually shut. From a signed-in NON-admin browser
console, this must now fail:

```js
// should throw FirebaseError: Missing or insufficient permissions
await firebase.firestore().collection('system_users').doc('some-other-uid')
  .set({ isApproved: true, isAdmin: true });
```

And an account with no `isApproved` must be unable to read any collection.


## 6. After deploying: check one person from each role

The rules stopped being a single `isApproved` check, so a wrong module mapping
now shows up as a member of staff locked out of their own screen rather than as
a security hole. Have one person from each role sign in and open their main
page — HR to payroll, finance to the cheque ledger, purchasing to the PO list.

If someone is denied where they should not be, the mapping in `firestore.rules`
is what to fix: `moduleOf()` for a collection owned by one module,
`sharedModulesOf()` for reference data used by several. Add the case to
`scripts/rules-tests/permissions.test.mjs` first so it cannot regress.

Two mappings were wrong on the first attempt and only the test suite caught
them: estimate invoices genuinely read and write `products`, and `gsm_reports`
is a finance screen despite the name.
