# Loop database foundation

## Tenancy and identities

The hierarchy is platform -> school -> branch -> classroom -> enrollment/child. `auth.users` is authentication identity; `user_profiles`, `school_memberships`, `classroom_staff_assignments`, and `child_guardians` carry application relationships. School roles are `school_admin`, `teacher`, and `guardian`; platform administrators are held separately.

Every school-owned table carries `school_id`. Composite foreign keys enforce that referenced branches, classrooms, children, enrollments, memberships, and timetable slots belong to that same school. RLS derives access from the authenticated user and stored relationships, not a role or tenant identifier supplied by the browser.

## Feature availability

`feature_catalogue` contains stable authorization keys. Labels are display text. `plans` contains active-child, staff, and storage limits; `plan_features` records entitlements; `school_feature_settings` records a school's explicit choices.

An enabled action requires: active built-in feature + active plan and entitlement + enabled school setting + an RLS-permitted actor. Step 2 enforces this composition for writes to timetable, attendance, and care-event categories. Disabling a feature does not delete historical records.

## Timetable

`timetable_slots` stores one recurring weekly row with ISO weekday, local wall-clock start/end time, classroom, activity title, and optional care feature. The school's IANA timezone defaults to `Asia/Colombo` and is validated.

`timetable_exceptions` stores date-specific cancellation, time change, replacement, or additional activity without changing the recurring slot. No minute-by-minute rows or stored "completed because time passed" state exists. Future presentation derives scheduled/in-progress/ended-by-schedule from school-local time; actual completion requires staff/attendance evidence. Care events may link to a slot and service date.

## Care and attendance

`care_events` supports meal, bottle, water, sleep, toilet, nappy, mood, activity, and note categories, with timestamps, status/outcome, quantity/unit, short note, recorder, optional timetable association, and a shared bulk batch ID. Meal outcomes are constrained to all/most/some/little/none-refused. Context triggers verify that child, enrollment, classroom, school, and recorder match. `record_care_batch` additionally checks the effective feature, classroom assignment, active enrollment, and present/not-checked-out attendance for every selected child, then inserts the whole batch atomically. One invalid child rejects every row.

Sleep start is a care batch with `started_at`; a partial unique index prevents a second active sleep for the child. `end_sleep_batch` stamps `ended_at` for the selected active rows in one operation. Parent presentation derives start, end, and duration from these timestamps.

`attendance_records` has one row per child/service date, enrollment and classroom context, expected/present/absent/excused state, check-in/out timestamps, recorder, and constraints against checkout-before-checkin or absent-with-checkin states.

## Invitations and audit

`invitations` supports guardian, teacher, and school-admin invitations. Tokens are generated with cryptographic randomness and only their SHA-256 hashes are stored. Redemption is atomic in the database and requires both a pending unexpired token and a matching authenticated Auth email. Local-only activation creates the Auth identity through a server-only privileged client; production email delivery remains deferred.

`audit_log` is append-oriented. Triggers record allow-listed administrative state for memberships, classroom assignments, school feature settings, timetable changes, invitations, platform assignments, and school plan/status changes. Application roles cannot mutate audit rows.

Lifecycle authorization treats `schools.status = active` as the universal school-workspace boundary. Teacher/guardian operational access also requires active branch/classroom/child records, a current active enrollment, an active membership, and the relevant current assignment or guardian link. School Admin reads deliberately retain same-school archived structure and child history while the school remains active. Branch, classroom, child, enrollment, and guardian-link lifecycle changes are added to the reduced audit allow-list without copying names or child content.

Direct authenticated INSERT, UPDATE, and DELETE privileges on `school_memberships` are revoked. `set_school_membership_status` is the sole School Admin mutation surface: it accepts only a membership identifier and `record_status`, re-derives the caller and tenant, and updates only `status`. A database trigger uses a per-school transaction advisory lock before any update/delete that would remove an active administrator, so concurrent requests cannot remove the last active School Admin from an active school.

## Step 3 enforcement and local data

`schools.teachers_can_manage_timetable` is the explicit school-level permission for assigned teachers. RLS combines it with membership, classroom assignment, and the timetable feature. Database triggers serialize active-child and active-staff counts and reject writes beyond the school plan, so plan limits do not depend on UI checks. `move_child_enrollment` locks and completes the prior active enrollment before inserting the destination enrollment; school plan/status edits are independently trigger-protected as platform-owned fields.

`pnpm seed:local` loads two fictional schools plus platform, school-admin, teacher, and guardian accounts; classroom structure; a 15-child operational QA roster; timetable; attendance; and care examples. It writes newly generated test passwords and one local invite URL only to `supabase/.temp/test-credentials.json`, which is ignored by Git. Run the seed only against the guarded localhost stack after `pnpm supabase:reset`.

`pnpm seed:staging` is a separate staging-only fixture command. It fails closed unless `LOOP_ENV=staging`, the Supabase URL is the approved `Loop Staging` project, the site URL is the stable staging origin, the R2 bucket is exactly `loop-media-staging`, and a current `sb_secret_` key is supplied server-side. It also refuses unknown Auth users or schools. The command creates or reuses only deterministic fictional TEST records and writes newly generated passwords to the Git-ignored `supabase/.temp/staging-test-credentials.json`; never copy that file into source control, logs, screenshots, or chat.

Timetable display state is derived from an injected clock, the school IANA timezone, attendance, exceptions, and explicit care confirmation. Time passing produces `ended_unconfirmed`, never `confirmed`; absence produces `absent`, never completion.

## Step 4 private media

`child_media_consents` records `not_recorded`, `granted`, or `denied`, plus who and when changed the state. This is a technical record of a school's approved process, not a legal determination. Both `not_recorded` and `denied` block child tagging and reservation creation. Teachers can read only consent relevant to children they may access; school administrators record changes.

`media_upload_reservations`, `media_assets`, `media_variants`, and `media_asset_children` separate transactional authorization metadata from private R2 bytes. A security-invoker reservation RPC locks the school's `school_storage_usage` row, validates effective feature access, current assignment, every child/enrollment and consent state, exact JPEG variant limits, then reserves expected bytes. Finalization is service-only after R2 HEAD checks and atomically replaces reserved bytes with actual ready bytes. Failed verification releases the reservation and marks metadata failed. No request scans the bucket.

Abandoned reservations expire after 10 minutes but their eventual cleanup is deferred until Loop has a scheduled-job environment. A future cleanup job must delete any objects for expired `reserved` rows, call the failure/release operation, and remain idempotent.

High-quality, display, and thumbnail keys use separate global prefixes: `originals/<school UUID>/<asset UUID>/<variant UUID>.jpg`, `display/<school UUID>/<asset UUID>/<variant UUID>.jpg`, and `thumbs/<school UUID>/<asset UUID>/<variant UUID>.jpg`. The `originals/` object is a sanitized, browser-decoded, re-encoded high-quality copy; it is not the untouched camera source. The owner manually configured an R2 object lifecycle rule scoped only to `originals/` that expires objects after 30 days. `display/` and `thumbs/` remain outside that rule and have separate retention.

## Step 4 communication

`message_threads` identifies one guardian/child school conversation; `messages` stores text and sender identity, and `message_thread_reads` stores one read cursor per participating membership. RLS grants the named guardian, active school administrators, and active teachers currently assigned to the child's active classroom. Assignment, guardian-link, membership, feature, tenant, and structure lifecycle changes are evaluated on every Data API access.

Supabase private-channel authorization is cached for an existing Realtime connection, so Loop does not use the channel payload as a data-delivery boundary. The message trigger sends only a constant `message_changed` invalidation signal. The browser then fetches messages through RLS; a revoked stale socket may briefly see the signal but cannot receive a new message body from Broadcast or from the subsequent database request.

`announcements` and `calendar_events` have normalized school, branch, or classroom targets. RLS filters guardian and teacher reads to current linked/assigned contexts, while mutations combine the feature gate, tenant target validation, administrator role, and the two default-off teacher permission settings. Times are stored as instants and form input is interpreted in the school's IANA timezone.

## Step 5 PWA and push

`notification_preferences` is the sole exposed Step 5 table. RLS permits an active school user to select, insert, or update only their own row. Attendance, messages, and important announcements default on; photo notifications default off. Platform administrators have no school-notification preference or subscription path.

`private.push_subscriptions` stores endpoint capabilities and Web Push encryption keys outside the exposed schema. Registration and deactivation wrappers derive the caller from `auth.uid()` and never accept a recipient/user ID. One person may register multiple devices; an active endpoint cannot be reassigned to another account, and current-device sign-out attempts deactivation first.

`private.notification_outbox` stores minimal event references and generic privacy-safe copy. Database triggers enqueue only attendance check-in/check-out, new message, newly published important announcement, and ready photo events. `care_events`, timetable tables, normal announcements, and other routine activity have no push trigger. `private.push_deliveries` records per-subscription delivery state, bounded attempts, status class, and HTTP status without response bodies.

The service-only claim function materializes and rechecks recipients from active schools, branches, classrooms, children, current enrollments, memberships, guardian links, classroom assignments, targets, feature state, and preferences using `FOR UPDATE SKIP LOCKED`. Revocation therefore blocks pending as well as future delivery. A 404/410 completion marks the endpoint inactive; temporary failures receive bounded exponential retry metadata. A claim enters `sending` with `updated_at` as its lease timestamp. Because Web Push has a 15-second network timeout, a two-minute lease provides completion margin; a later claim atomically recovers an older abandoned lease without creating a duplicate `(outbox_id, subscription_id)` row. The every-minute Cron frequency never bypasses `available_at`, and five abandoned or failed attempts become terminal.

Migration `20260913173724_improve_push_delivery_reliability.sql` schedules `loop-push-retry-worker` every minute. Its private fixed-`search_path` helper reads `loop_push_worker_url` and `loop_push_worker_secret` from Supabase Vault at execution time and calls the POST-only Vercel worker through `pg_net`. If either Vault value is absent, invalid, or too short, local reset remains quiet and no HTTP request is queued. The function is unavailable to `anon`, `authenticated`, and `service_role`; only the database-owned Cron job invokes it.

## Deferred

Step 5 included no cloud database or deployment. Step 6B applies only the ordered migration chain to the isolated, disposable `Loop Staging` Supabase project; local seed data is never included and real nursery data is prohibited. Billing, production email delivery, external calendar sync, attachments, production resources, and deployment remain deferred. Short video remains disabled because browser-only handling cannot provide a dependable cross-platform metadata-removal and transcoding pipeline; a later native media or Cloudflare Stream design is required.

When staging data is explicitly authorized later, create only clearly fictional schools, staff, guardians, and children with reserved non-deliverable email domains; generate synthetic media with no people or metadata; keep credentials in the approved secret store rather than Git; include two tenants plus assigned/unassigned role cases for RLS checks; and provide a documented full cleanup path. Do not run `seed:local` against the linked project or copy any local/production records into staging.

## Local Docker network

Before the first local start, create the required loopback-only bridge once:

```text
docker network create -o "com.docker.network.bridge.host_binding_ipv4=127.0.0.1" loop-local-network
```

`pnpm supabase:start` then passes `--network-id loop-local-network` to the pinned Supabase CLI. Reset, test, type-generation, and stop scripts pass the same network because they may create helper containers. This is required because the local stack uses development credentials and must not be reachable from the LAN. If the network is missing, recreate it with the command above rather than removing the flag.

After every Docker/CLI upgrade, verify `docker inspect supabase_kong_loop --format "{{json .HostConfig.PortBindings}}"` and confirm the API/Studio ports fail when addressed through the machine's LAN IP from another device. Docker Desktop 29.7.2 on the current Windows host does not report a localhost-only `HostIp`; Microsoft Defender Firewall is therefore a required local control. With the firewall enabled, a manual same-Wi-Fi test confirmed Studio was not reachable at `192.168.18.35:54323`. This requirement applies to local development only, not the future production architecture.
