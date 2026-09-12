# What to do in Firebase before and after deploying

Everything here is done by you, in your own project (`testreportgen`). None of
it needs to be shared with anyone — and **do not paste a service-account key
into a chat window**; a key that can read payroll is not worth the convenience.

The rules changed from *"any approved user gets everything"* to *"an approved
user gets exactly the modules set in Settings → System"*. That is the whole
reason this checklist exists: a wrong permission now shows up as a member of
staff locked out of their own screen.

---

## 1. Check the rules pass, with no credentials

```bash
npm install --no-save firebase-tools @firebase/rules-unit-testing firebase
npx firebase emulators:start --only firestore --project starsutra-test   # terminal 1
node scripts/rules-tests/permissions.test.mjs                            # terminal 2
```

Expect `229 passed, 0 failed`. This runs entirely against the local emulator —
it never touches your live project.

## 2. Back up

```bash
gcloud firestore export gs://<your-bucket>/pre-rules-$(date +%Y%m%d)
```

Do this even though nothing below deletes data. The `isApproved` default flip
changes who can sign in, and a backup is what makes that reversible.

## 3. See exactly which accounts need attention

```bash
npm i firebase-admin
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/pre-deploy-audit.js
```

Read-only. It lists, per account:

- **Administrators** — unaffected, they keep full access. **If this list is
  empty, stop.** Set one admin from the console first (step 4) or nobody can
  manage users afterwards.
- **No `isApproved` field** — these will be locked out. The rules treat a
  missing flag as *not approved*.
- **Approved but no permissions** — these will sign in to an empty app. They
  previously had full access to everything, which is precisely the bug.
- **Legacy permission shape** — informational. Both the app and the rules
  accept the old bare-list form, so nothing breaks; re-saving the user in
  Settings → System normalises it.

## 4. Fix what it found

**Set the first administrator by hand, once.** Firebase console → Firestore →
`system_users` → your uid → `isAdmin: true`, `isApproved: true`.

This is deliberately not something the app can do. It used to write
`isAdmin: true` from the browser as a "recovery" path, which on a statically
exported app — where the rules are the only boundary — is an escalation path,
not a recovery tool.

**Approve the accounts you recognise.** Set `isApproved: true` on each. Do not
blanket-approve: under the old rules anyone could create a `system_users`
document for themselves, so an unfamiliar entry may be exactly that. Anything
left unapproved simply cannot sign in, and you can approve it later from the
app.

**Give each person their modules** in Settings → System, before deploying.
This is the step that used to be optional and no longer is.

## 5. Deploy

```bash
firebase deploy --only firestore:rules
```

Firestore rules only. There is nothing to deploy for indexes — every query in
the app is either a single-field equality or a single-field `orderBy`, both of
which Firestore indexes automatically. No `firestore.indexes.json` is needed.

## 6. Confirm the hole is shut

From a signed-in **non-admin** browser console, this must now fail:

```js
// Expect: FirebaseError: Missing or insufficient permissions
await firebase.firestore().collection('system_users').doc(firebase.auth().currentUser.uid)
  .update({ isAdmin: true });
```

Before this change it succeeded. A permissive catch-all at the bottom of the
rules file was being OR-ed with the strict `system_users` block — Firestore
grants access if **any** matching rule allows it — so every restriction there
was ineffective.

## 7. Have one person from each role sign in

HR to payroll, finance to the cheque ledger, purchasing to the PO list. A wrong
collection-to-module mapping now presents as a lockout, not a leak.

If someone is denied where they should not be, fix the mapping in
`firestore.rules` — `moduleOf()` for a collection owned by one module,
`sharedModulesOf()` for reference data used by several — and add the case to
`scripts/rules-tests/permissions.test.mjs` first so it cannot regress.

Two mappings were wrong on the first attempt and only the test suite caught
them: estimate invoices genuinely read *and write* `products`, and
`gsm_reports` is a finance screen despite the name.

---

## Also worth doing in the console

**Turn off self-signup.** Authentication → Settings → User actions → uncheck
"Enable create (sign-up)". There is no signup page in this app; accounts are
provisioned by an admin. Left on, anyone can create an Auth account against the
public API key. They would land unapproved and get nothing, but there is no
reason to leave the door open.

**Storage stays off.** Firebase Storage needs the Blaze plan, so the file
screen at `/filesystem` cannot work on the free plan — it now says so plainly
instead of failing with a raw SDK error. `storage.rules` is written and waiting
in the repo but deliberately left out of `firebase.json`, so a plain
`firebase deploy` will not fail against a project with no bucket. If you ever
move to Blaze, add `"storage": { "rules": "storage.rules" }` to `firebase.json`
and deploy it **at the same time** as enabling the bucket — an unruled bucket
is how they end up public.

**The API key in `src/firebase/config.ts` is not a secret.** Client Firebase
keys are public project identifiers and ship in every web app's bundle. What it
does mean is that these rules are genuinely the only thing between that key and
your data.
