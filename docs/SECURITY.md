# Loop security architecture

Steps 2 through 5 implement and locally test the initial database, application, private-media, communication, and PWA/Web Push authorization boundary. Step 6B applies the reviewed schema only to an isolated, disposable staging project. This remains a foundation, not a claim that a future deployment is secure.

## Trust boundaries

The browser and future mobile client are untrusted presentation layers. Authorization must be enforced server-side and at the database/storage boundary. Hiding a control in the frontend is never authorization.

## Implemented database controls

- All public application tables have RLS enabled and explicit Data API grants; `anon` has no application-table privileges.
- Tenant-owned rows carry `school_id`. Composite foreign keys bind classroom, child, enrollment, guardian, recorder, timetable, and attendance references to the same tenant instead of trusting client-supplied identifiers.
- Roles live in application membership tables linked to `auth.users`, never browser-editable user metadata. The `platform_administrators` table is separate from school roles.
- Private `SECURITY DEFINER` helpers read `auth.uid()` internally, set `search_path = ''`, schema-qualify references, live outside exposed schemas, and have narrowly granted execution. They avoid recursive RLS policy queries.
- School administrators manage their tenant but cannot assign platform status or change a plan. Teachers cannot alter memberships or classroom assignments. Guardian writes to staff care records are denied.
- Platform administrators can manage plans, features, schools, invitations, and non-child starter branch/classroom structure. They remain intentionally absent from child, enrollment, guardian, care, and attendance access policies.
- Invitation tokens are stored only as hashes; the API select grant excludes the hash column. Invitations model expiry, revocation, and acceptance without default passwords.
- Administrative/security triggers append a reduced, allow-listed record to `audit_log`. Invitation email and token hash, child details, care notes, and other child-private content are not copied. Application roles have no audit insert/update/delete grant.
- Operational authorization now fails closed unless the school is active. Teacher and guardian access additionally requires an active branch and classroom, an active/current child enrollment, an active child, and the applicable active assignment or guardian link. Active School Admins retain same-school archived/history visibility needed to reactivate structure, while an inactive school removes their ordinary workspace access. Platform administration remains a separate reactivation path and is not a child-data bypass.
- Authenticated clients have read-only table privileges on `school_memberships`. School Admin status changes use one narrow RPC that derives the caller, locks the school, permits only the status field to change, and rejects cross-school targets. A database trigger serializes administrator removal per school with a transaction advisory lock and prevents updating or deleting the final active School Admin of an active school from every write path.
- Active child and staff plan limits are enforced by serialized database triggers, not UI counters.
- Whole-class care recording is an invoker RPC that rechecks the actor, active staff membership, classroom assignment, school feature entitlement, active enrollment, and present/not-checked-out attendance. It performs one set-based insert and raises if the inserted count differs, so a mixed valid/invalid selection rolls back instead of partially saving.
- A partial unique index permits only one active sleep row per child. Ending sleep is a separate assignment-scoped batch RPC. Child classroom moves complete the previous enrollment and create the new one in one transaction.
- School plan/status fields are protected by a trigger as well as RLS; plan limits and entitlements remain platform-administrator controls.
- Teacher timetable writes require the school permission, an active teacher membership, the timetable feature, and an active assignment to that classroom.
- Invitation redemption uses a non-exposed `private` definer function behind an invoker wrapper. It requires an authenticated user, compares the Auth email with the stored invitation email, locks the pending unexpired token-hash row, creates only the invited role, and prevents replay.
- pgTAP exercises anonymous, School A/B admins, assigned and unassigned teachers, guardians, and a platform administrator across SELECT, INSERT, UPDATE, DELETE, and protected RPCs. Step 4 adds negative coverage for media consent, assignment, tenant, platform and anonymous access, quotas, private guardian threads, Realtime topic authorization, targeted announcements/calendar, and teacher/guardian mutation denial. Fixtures roll back.

## PWA and Web Push boundary

- The service worker does not intercept `fetch` and does not use Cache Storage or background sync. Loop therefore never treats stale cached child, attendance, care, message, or media data as authoritative offline.
- Notification permission is requested only after the signed-in user selects the device enable action. On iOS/iPadOS, Loop first requires the Home Screen installed-app context. Browser states remain explicit: default, granted, denied, or unsupported.
- VAPID private material is server-only. The public VAPID key is intentionally client-visible; the private key and subject remain in ignored local environment configuration. No R2 credential, Supabase secret key, push endpoint, encryption key, or signed URL is placed in a `NEXT_PUBLIC_` variable, rendered HTML, database notification payload, or application log.
- Raw push endpoints plus `p256dh` and auth keys live only in the unexposed `private` schema. Authenticated wrappers derive `auth.uid()` internally, prevent takeover of another active device endpoint, and allow only the current user to deactivate their registration. Platform administrators are excluded.
- The outbox stores only event type, authoritative source ID, school, generic copy, and a relative internal route. Delivery claims derive recipients from current database relationships and preferences immediately before send. A revoked guardian link, inactive membership, ended teacher assignment, disabled feature, or disabled preference prevents future delivery.
- Push recipient derivation also requires the source school, child, current enrollment, classroom, and branch to remain active as applicable. Existing historical relationships cannot keep an otherwise ineligible recipient active.
- Lock-screen copy never contains message bodies, care details, child names, R2 object keys/URLs, signed URLs, tokens, or secrets. A click may open only a same-origin relative route, and the destination page still reauthorizes data through normal server/RLS controls.
- HTTP 404/410 deactivates an expired subscription. Temporary failures use bounded retry metadata; stored delivery results contain status class and HTTP status only, never provider response bodies or capabilities.
- Message delivery uses direct Vercel `waitUntil()` only after the authorized database insert commits. The browser never starts push processing, and a push failure cannot turn the committed message into an application failure. The durable database outbox is independently revisited every minute by a server-to-server worker.
- The worker accepts only `POST /api/internal/push/retry` with an empty JSON object and a dedicated `PUSH_WORKER_SECRET` bearer credential. It ignores user cookies, accepts no tenant/user/event selector or query string, processes one bounded server-owned batch, returns only a generic result, and is `no-store`. The credential is separate from Supabase, VAPID, and R2 credentials and is compared using fixed-length digests.
- Claims have a two-minute stale lease around a 15-second provider timeout. Atomic row locking prevents an overlapping worker from stealing active work; abandoned work is reclaimed with its existing attempt count and backoff rules. Delivery is at-least-once because an external provider acknowledgement can be lost, not exactly-once. The service worker's stable non-sensitive event/delivery tag is retained to reduce visible duplicates.
- The local Edge desktop attempt reached explicit notification permission but `PushManager.subscribe()` failed with `AbortError: Registration failed - permission denied`; this is recorded as an environment limitation, not a successful operating-system notification test and not an application-security bypass.
- Final physical iPhone/iPad verification remains pending an HTTPS staging deployment. It must test Safari Add to Home Screen, opening the installed web app, explicit notification permission, receipt, and an authenticated deep-link destination; no insecure public development tunnel is permitted as a substitute.

## Private media boundary

- The R2 bucket remains private. Privacy also depends on a fresh RLS-authorized database lookup before every signed GET; knowing an object key is insufficient. Guardians need an active link to a tagged child, teachers need a current classroom assignment, and school administrators remain tenant-scoped. Platform administrators receive no casual child-media access.
- Media reads and upload finalization recheck the current lifecycle boundary. Revoked staff/guardian relationships and inactive schools, branches, classrooms, children, or current enrollments cannot mint a new signed GET or complete an upload; the private R2 bucket has no permanent public object URL.
- Teachers receive only exact, short-lived PUT URLs after server and transactional database checks. The server generates opaque keys and signs the required object, method, and JPEG content type. The browser receives no list/delete capability or R2 credential.
- Finalization uses a server-only privileged client only after authenticating the uploader, checking reservation ownership/expiry, and HEAD-checking every exact R2 object against its reserved content type and byte count. Remote endpoints must use HTTPS. Invalid uploads are deleted where practical and never become `ready`.
- Client-side canvas re-encoding removes embedded EXIF/location segments from supported decoded JPEG, PNG, and WebP inputs and preserves browser-decoded orientation. HEIC/HEIF and undecodable formats fail clearly; raw source bytes are never used as a fallback.
- The `originals/` variant is a sanitized, re-encoded high-quality copy rather than the untouched camera source. Its manually configured R2 lifecycle rule expires only the `originals/` prefix after 30 days; `display/` and `thumbs/` retention is separate.
- Storage allowance enforcement is serialized in PostgreSQL using reserved and ready byte counters. Frontend estimates are not the quota boundary.
- Presigned URLs are short-lived bearer capabilities. Do not persist, log, share, or place them in analytics. R2 account credentials must remain in ignored server-only variables without a `NEXT_PUBLIC_` prefix.
- Staff must still follow nursery consent policy: Loop cannot detect an untagged child appearing in a photo background. `not_recorded` and `denied` both block tagging, but the consent table is not a legal conclusion.

The R2 browser CORS allowlist must contain only the exact Loop development/production origins and required `PUT`/`GET` methods and `Content-Type` header. Application credentials must not alter bucket CORS or lifecycle settings. The bucket remains private: no `r2.dev` or other public URL is enabled.

## Application authentication boundary

- Next.js Proxy refreshes/validates Auth claims; every protected role page independently resolves the role from database membership tables and fails closed when no membership exists.
- Browser clients receive only the environment's publishable key. `SUPABASE_SECRET_KEY` must contain the environment's `sb_secret_` key and remains server-only: staging media finalization uses it for metadata verification/finalization, and the push dispatcher uses it for the elevated claim/completion RPCs. Local development also uses its local secret key for the localhost-guarded seed and invitation account creator. The separate privileged client disables session persistence, automatic refresh, and URL session detection. The key is never prefixed `NEXT_PUBLIC`, returned to the browser, logged, or stored in generated credentials.
- Local copyable invite URLs are emitted only when `NODE_ENV=development` and the Supabase API URL is exactly localhost. Production email delivery is intentionally absent.
- Browser verification covers a valid local invitation, wrong-email denial without consuming the invitation, one successful activation, replay denial, sign-out, and denial of the protected route after sign-out.

## Realtime revocation boundary

- Supabase Realtime authorizes a private Broadcast channel when it is joined and caches that decision for the connection. Policy changes are recalculated on a new connection or new JWT; if no new JWT arrives, the connection is eventually disconnected when its JWT expires. Loop therefore does not claim immediate server eviction of an already-authorized socket.
- Database message triggers Broadcast only the constant private invalidation payload `{ "kind": "message_changed" }`. Message bodies, names, child details, media data, URLs, and row records are never included. On a signal, the client refetches the latest messages through the normal RLS-protected Data API. After revocation, a stale channel can at worst receive this non-sensitive signal; the refetch returns no authorized data and the client clears the thread.

## Staging boundary

- `Loop Staging` Supabase and Vercel `loop-staging` are isolated, disposable verification resources. They must never contain real nursery, child, family, staff, message, media, or push-subscription data and must never share credentials with future production resources.
- Vercel Production is the staging environment because it tracks only the `staging` branch. Every staging secret is scoped to that Vercel environment and remains outside Git; preview aliases are not added to Supabase Auth or R2 CORS unless a later test explicitly requires and reviews them.
- Supabase Auth must use the stable staging HTTPS origin as Site URL and allow only its exact `/auth/callback` route. Password recovery fails closed when `NEXT_PUBLIC_SITE_URL` is absent and never falls back to localhost in a production build.
- R2 CORS must name the same exact stable staging origin. The bucket stays private, with no `r2.dev` URL; CORS does not make an object public and does not replace short-lived signed URL authorization.
- Staging uses its own publishable/secret keys, R2 access pair/bucket, and VAPID pair. The local seed, local invitation activation, Mailpit, test credentials, and local Supabase runtime files are development-only and must not be deployed.
- Each deployed environment also needs its own dedicated Vercel `PUSH_WORKER_SECRET`. Supabase Vault must contain matching `loop_push_worker_secret` and the environment's exact HTTPS `/api/internal/push/retry` URL as `loop_push_worker_url`. Staging and production must never share these values. They remain outside Git, browser bundles, logs, and query parameters; absence is expected and quiet in unconfigured local development.
- Staging fixtures use a separate fail-closed command guarded by the immutable approved project ref, exact Supabase/site URLs, explicit staging environment marker, and exact `loop-media-staging` bucket name. Credentials remain only in `supabase/.temp/staging-test-credentials.json`. The seed refuses any unknown Auth user or school rather than inferring that a populated target is safe.
- Authenticated server-side Supabase requests force `cache: no-store`. Private role, tenant, attendance, care, message, media, and push data must be read per request and must never enter a shared Next.js/Vercel response or data cache.

## Still required in later steps

- Production email delivery, account lifecycle administration, stronger abuse controls, CSRF review for any future non-form APIs, and audit retention still need implementation and testing.
- Automated cleanup of expired reservations and retained originals, production secrets management, media moderation/incident procedures, and monitoring/alerting for the scheduled Web Push retry worker remain deployment work.
- Production deployment hardening, environment separation review, backups, recovery, monitoring, dependency response, and penetration/security review remain outstanding.
- The `Loop Staging` Supabase organization is currently on the Free plan, where leaked-password protection is unavailable. The staging advisor warning is therefore accepted only for fictional staging verification; upgrade to Pro or above and enable leaked-password protection before a production launch.
- Local Supabase must start through the pre-created `loop-local-network` Docker bridge. `pnpm supabase:start` supplies it through the supported CLI `--network-id` flag; do not replace it with the default generated network, forward these ports, or expose them through a tunnel.
- On the current Windows Docker Desktop 29.7.2 host, the documented bridge option was not honored for published ports: Docker reports blank `HostIp` values rather than a localhost-only binding. Microsoft Defender Firewall is enabled, and a manual same-Wi-Fi test from another device confirmed that Studio was not reachable at the PC's LAN address (`192.168.18.35:54323`). Local Supabase may only run while host firewall protection remains enabled; the network flag alone is not a proven isolation boundary on this machine.
- This Docker Desktop/host-firewall caveat affects only the local development stack. It is not part of, or a substitute for, the future production Loop network and deployment architecture.

## Privacy by design

Do not include sensitive child details in lock-screen notification copy by default. Avoid third-party trackers, runtime fonts, and remote decorative assets in authenticated child views without privacy review. Media controls must reflect real authorization rather than merely hiding UI.

## Implementation rule

Security behavior must be backed by enforceable server/database/storage controls and verified tests. Documentation and frontend-only checks are not guarantees.
