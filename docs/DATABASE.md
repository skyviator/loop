# Loop local database foundation

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

## Step 3 enforcement and local data

`schools.teachers_can_manage_timetable` is the explicit school-level permission for assigned teachers. RLS combines it with membership, classroom assignment, and the timetable feature. Database triggers serialize active-child and active-staff counts and reject writes beyond the school plan, so plan limits do not depend on UI checks. `move_child_enrollment` locks and completes the prior active enrollment before inserting the destination enrollment; school plan/status edits are independently trigger-protected as platform-owned fields.

`pnpm seed:local` loads two fictional schools plus platform, school-admin, teacher, and guardian accounts; classroom structure; a 15-child operational QA roster; timetable; attendance; and care examples. It writes newly generated test passwords and one local invite URL only to `supabase/.temp/test-credentials.json`, which is ignored by Git. Run the seed only against the guarded localhost stack after `pnpm supabase:reset`.

Timetable display state is derived from an injected clock, the school IANA timezone, attendance, exceptions, and explicit care confirmation. Time passing produces `ended_unconfirmed`, never `confirmed`; absence produces `absent`, never completion.

## Deferred

No cloud project, billing, storage/media, messaging, push, production email delivery, or deployment is included in Step 3.

## Local Docker network

Before the first local start, create the required loopback-only bridge once:

```text
docker network create -o "com.docker.network.bridge.host_binding_ipv4=127.0.0.1" loop-local-network
```

`pnpm supabase:start` then passes `--network-id loop-local-network` to the pinned Supabase CLI. Reset, test, type-generation, and stop scripts pass the same network because they may create helper containers. This is required because the local stack uses development credentials and must not be reachable from the LAN. If the network is missing, recreate it with the command above rather than removing the flag.

After every Docker/CLI upgrade, verify `docker inspect supabase_kong_loop --format "{{json .HostConfig.PortBindings}}"` and confirm the API/Studio ports fail when addressed through the machine's LAN IP from another device. Docker Desktop 29.7.2 on the current Windows host does not report a localhost-only `HostIp`; Microsoft Defender Firewall is therefore a required local control. With the firewall enabled, a manual same-Wi-Fi test confirmed Studio was not reachable at `192.168.18.35:54323`. This requirement applies to local development only, not the future production architecture.
