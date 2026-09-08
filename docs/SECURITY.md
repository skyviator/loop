# Loop security architecture

Steps 2 through 4 implement and locally test the initial database, application, private-media, and communication authorization boundary. This remains a foundation, not a claim that a future deployment is secure.

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
- Active child and staff plan limits are enforced by serialized database triggers, not UI counters.
- Whole-class care recording is an invoker RPC that rechecks the actor, active staff membership, classroom assignment, school feature entitlement, active enrollment, and present/not-checked-out attendance. It performs one set-based insert and raises if the inserted count differs, so a mixed valid/invalid selection rolls back instead of partially saving.
- A partial unique index permits only one active sleep row per child. Ending sleep is a separate assignment-scoped batch RPC. Child classroom moves complete the previous enrollment and create the new one in one transaction.
- School plan/status fields are protected by a trigger as well as RLS; plan limits and entitlements remain platform-administrator controls.
- Teacher timetable writes require the school permission, an active teacher membership, the timetable feature, and an active assignment to that classroom.
- Invitation redemption uses a non-exposed `private` definer function behind an invoker wrapper. It requires an authenticated user, compares the Auth email with the stored invitation email, locks the pending unexpired token-hash row, creates only the invited role, and prevents replay.
- pgTAP exercises anonymous, School A/B admins, assigned and unassigned teachers, guardians, and a platform administrator across SELECT, INSERT, UPDATE, DELETE, and protected RPCs. Step 4 adds negative coverage for media consent, assignment, tenant, platform and anonymous access, quotas, private guardian threads, Realtime topic authorization, targeted announcements/calendar, and teacher/guardian mutation denial. Fixtures roll back.

## Private media boundary

- The R2 bucket remains private. Privacy also depends on a fresh RLS-authorized database lookup before every signed GET; knowing an object key is insufficient. Guardians need an active link to a tagged child, teachers need a current classroom assignment, and school administrators remain tenant-scoped. Platform administrators receive no casual child-media access.
- Teachers receive only exact, short-lived PUT URLs after server and transactional database checks. The server generates opaque keys and signs the required object, method, and JPEG content type. The browser receives no list/delete capability or R2 credential.
- Finalization uses a local server-only privileged client only after authenticating the uploader, checking reservation ownership/expiry, and HEAD-checking every exact R2 object against its reserved content type and byte count. Invalid uploads are deleted where practical and never become `ready`.
- Client-side canvas re-encoding removes embedded EXIF/location segments from supported decoded JPEG, PNG, and WebP inputs and preserves browser-decoded orientation. HEIC/HEIF and undecodable formats fail clearly; raw source bytes are never used as a fallback.
- The `originals/` variant is a sanitized, re-encoded high-quality copy rather than the untouched camera source. Its manually configured R2 lifecycle rule expires only the `originals/` prefix after 30 days; `display/` and `thumbs/` retention is separate.
- Storage allowance enforcement is serialized in PostgreSQL using reserved and ready byte counters. Frontend estimates are not the quota boundary.
- Presigned URLs are short-lived bearer capabilities. Do not persist, log, share, or place them in analytics. R2 account credentials must remain in ignored server-only variables without a `NEXT_PUBLIC_` prefix.
- Staff must still follow nursery consent policy: Loop cannot detect an untagged child appearing in a photo background. `not_recorded` and `denied` both block tagging, but the consent table is not a legal conclusion.

The R2 browser CORS allowlist must contain only the exact Loop development/production origins and required `PUT`/`GET` methods and `Content-Type` header. Application credentials must not alter bucket CORS or lifecycle settings. The bucket remains private: no `r2.dev` or other public URL is enabled.

## Application authentication boundary

- Next.js Proxy refreshes/validates Auth claims; every protected role page independently resolves the role from database membership tables and fails closed when no membership exists.
- Browser clients receive only the local publishable key. The service-role key is permitted only in ignored local server environment for the localhost-guarded seed and local invitation account creator. It is never prefixed `NEXT_PUBLIC`, returned to the browser, logged, or stored in generated credentials.
- Local copyable invite URLs are emitted only when `NODE_ENV=development` and the Supabase API URL is exactly localhost. Production email delivery is intentionally absent.
- Browser verification covers a valid local invitation, wrong-email denial without consuming the invitation, one successful activation, replay denial, sign-out, and denial of the protected route after sign-out.

## Still required in later steps

- Production email delivery, account lifecycle administration, stronger abuse controls, CSRF review for any future non-form APIs, and audit retention still need implementation and testing.
- Automated cleanup of expired reservations and retained originals, production secrets management, media moderation/incident procedures, and notification privacy still require a deployed-job design.
- Deployment hardening, secrets management, backups, recovery, monitoring, dependency response, and penetration/security review remain outstanding.
- Local Supabase must start through the pre-created `loop-local-network` Docker bridge. `pnpm supabase:start` supplies it through the supported CLI `--network-id` flag; do not replace it with the default generated network, forward these ports, or expose them through a tunnel.
- On the current Windows Docker Desktop 29.7.2 host, the documented bridge option was not honored for published ports: Docker reports blank `HostIp` values rather than a localhost-only binding. Microsoft Defender Firewall is enabled, and a manual same-Wi-Fi test from another device confirmed that Studio was not reachable at the PC's LAN address (`192.168.18.35:54323`). Local Supabase may only run while host firewall protection remains enabled; the network flag alone is not a proven isolation boundary on this machine.
- This Docker Desktop/host-firewall caveat affects only the local development stack. It is not part of, or a substitute for, the future production Loop network and deployment architecture.

## Privacy by design

Do not include sensitive child details in lock-screen notification copy by default. Avoid third-party trackers, runtime fonts, and remote decorative assets in authenticated child views without privacy review. Media controls must reflect real authorization rather than merely hiding UI.

## Implementation rule

Security behavior must be backed by enforceable server/database/storage controls and verified tests. Documentation and frontend-only checks are not guarantees.
