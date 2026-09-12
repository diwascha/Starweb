# Firestore rules tests

These run against the **local Firestore emulator**. They need no credentials,
no service-account key and no access to the live project — the emulator loads
`firestore.rules` from the repo and answers as Firestore would.

That matters: the rules are the entire security boundary for this app (it is a
static export, so there is no server), and the one bug these tests were written
to catch is invisible by inspection — Firestore evaluates **every** matching
`match` block and grants access if **any** of them allows it. A permissive
catch-all at the bottom of the file therefore ORs away every restriction above
it. That is what let any approved user set `isAdmin: true` on their own profile.

## Running them

```bash
npm install --no-save firebase-tools @firebase/rules-unit-testing firebase

# terminal 1
npx firebase emulators:start --only firestore --project starsutra-test

# terminal 2
node scripts/rules-tests/permissions.test.mjs
```

`firebase.json` needs a firestore block pointing at the rules:

```json
{
  "emulators": { "firestore": { "port": 8080 }, "ui": { "enabled": false } },
  "firestore": { "rules": "firestore.rules" }
}
```

## What is covered

- The escalation paths: a non-admin raising their own `isAdmin`, `isApproved`
  or `permissions`; rewriting the administrator; listing all staff.
- Module isolation: an HR user cannot read finance or fleet, and vice versa.
- Action granularity: `view` does not imply write; a user with
  view/add/edit cannot delete.
- An approved user with **no** permissions can reach nothing.
- An unapproved user gets nothing even with `hr: all`.
- Anonymous access: denied everywhere except the two things the login screen
  genuinely needs before sign-in (the company profile, and a single username
  document to resolve an email).
- Shared reference data (parties, products, numberCounters) reachable from any
  module that legitimately uses it.
- **Both permission shapes** — the current `{ actions: [...] }` and the legacy
  bare list — because older accounts still hold the legacy form and the browser
  honours it. If the rules understood only one, those accounts would see their
  modules in the UI and be denied by the server.
- Sessions: a user sees and ends only their own.

## Before changing the rules

Add the case to this file first, watch it fail, then change the rules. Two of
the mappings in `firestore.rules` were wrong on the first attempt — finance
genuinely reads and writes `products`, and `gsm_reports` is a finance screen
despite the name — and only this suite caught them. Guessing at that mapping
locks real staff out of their own screens.
