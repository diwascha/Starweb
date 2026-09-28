# Supabase migration plan

Work happens on the `supabase-migration` branch. `main` (the live Firebase app)
is not touched until the switch-over. Vercel builds this branch at its own
preview URL.

- Supabase project: `https://bklhxebyzlhmfthoirlf.supabase.co`
- The publishable (anon) key is public by design, like the Firebase web key.
  **Security comes entirely from Row Level Security (RLS) policies**, the
  Postgres equivalent of `firestore.rules`. Every table must have RLS enabled.
  The service-role key must never be in this repo or the browser.

## Why

Firestore's free plan counts every document read (50,000/day). Supabase's free
plan counts storage (500 MB) and egress (5 GB/month) instead, with unlimited
API requests. Postgres can also total and group data itself, so reports no
longer download every record to add them up.

## What changes

| Firebase today | Supabase |
|---|---|
| Firestore collections (~45) | Postgres tables, one per collection |
| `firestore.rules` | RLS policies (same permission model: modules + actions per user) |
| Firebase Auth (email/password, usernames) | Supabase Auth (email/password); usernames table kept |
| `onSnapshot` live listeners | Plain queries, plus Supabase Realtime only where live updates matter |
| Offline cache (IndexedDB) | None built in; the app needs a connection |
| Firebase Storage (photos) | Supabase Storage |

Data model: each table keeps the Firestore document id as its primary key
(`id text`), common fields as columns, and anything irregular in a `data jsonb`
column, so documents can be copied across without loss and re-exported.

## Phases (one module at a time; each ends with owner sign-off)

1. **Foundation**: Supabase client, auth (login, sessions, roles/permissions),
   `system_users` / `usernames` / `settings` tables and RLS. A permissions test
   suite equivalent to `scripts/rules-tests` (313 checks) runs against RLS.
2. **Data copy tool**: imports a StarSutra backup file (the same file the
   sidebar backup icon downloads) into Supabase. Re-runnable, so the final
   switch-over re-copies the latest data.
3. **Modules**, smallest and least risky first:
   Settings & masters (parties, accounts, UOM) -> Reports & products ->
   CRM -> Purchase orders -> Rental -> Fleet -> Finance -> HR & payroll.
   Each module: service layer rewritten, pages checked against the Firebase
   numbers on the same data copy.
4. **Switch-over day**: final backup from Firebase, import, users set new
   passwords (Firebase password hashes cannot be moved), point the live domain
   to the Supabase build. Firebase stays untouched as a fallback.

## Needed from the owner

- Allow `*.supabase.co` in the Claude Code environment's network access.
- Run the schema SQL (generated here) once in Supabase -> SQL Editor. The
  publishable key cannot create tables, by design.
- Sign off each module after comparing it with the live app.

## Status

- [x] Database reset (2026-09-28): the earlier partial schema was dropped;
      50 tables created (one per Firebase collection, `id text` + `data jsonb`),
      RLS on for all, no policies yet (nothing reachable with the public key).
- [x] Data copy (2026-09-28): 3,276 rows loaded from the 05:26 UTC backup via a
      token-protected temporary function, which was dropped straight after.
- [x] Phase 1 - Foundation (2026-09-28)
  - `supabase/migrations/0002_access_rules.sql`: RLS equivalent of
    firestore.rules (module permissions, shared tables, admin-only fallback,
    settings exceptions, own-record rules for users/sessions/logs). Locked
    payroll/attendance months enforced by triggers. Username lookup and page
    visits via two small functions, so neither table is publicly readable.
  - `scripts/supabase-tests/access-rules.test.mjs`: 80 checks against an
    in-memory Postgres; all pass. Also verified on the live project with
    simulated logins (rolled back): no login / unknown login see only the 4
    public settings; the admin sees all 945 payroll rows.
  - App: `src/lib/supabase.ts` (client + record helpers returning the same
    `{ id, ...fields }` shape as the Firestore services) and
    `src/lib/supabase-auth.ts` (after a Firebase sign-in, the same email and
    password sign in to Supabase; first time, Supabase emails a confirmation
    link). CSP allows the project URL.
  - Owner settings needed in Supabase: Authentication -> URL Configuration ->
    Site URL = the app's URL (confirmation links point there); keep
    "Confirm email" ON; turn on leaked-password protection.
- [x] Supabase-only build (2026-09-28, owner decision: this branch uses no
      Firebase at all). `src/lib/supabase-compat/` implements the
      `firebase/firestore`, `firebase/auth`, `firebase/app`, `firebase/storage`
      and `firebase/database` functions the app uses, on Supabase; the build
      points those imports there (next.config.ts webpack alias + tsconfig
      paths). The production bundle contains no Firebase SDK. Login: username
      -> email via `email_for_username`, then Supabase sign-in; page visits via
      `record_page_visit`. Live updates via Supabase Realtime; photos in the
      public `files` storage bucket. Batches/transactions are sequential, not
      atomic (acceptable at this scale; revisit number reservation later).
  - Each staff member needs a Supabase login with the same email as their
    user record: Supabase -> Authentication -> Users -> Add user (tick
    Auto Confirm User).
- [ ] Phase 2 - Re-runnable data copy tool for switch-over day
- [ ] Phase 3 - Modules
- [ ] Phase 4 - Switch-over
