# Loop security architecture

Step 2 implements and locally tests the initial database authorization boundary. It is a foundation, not a claim that a future application or deployment is secure.

## Trust boundaries

The browser and future mobile client are untrusted presentation layers. Authorization must be enforced server-side and at the database/storage boundary. Hiding a control in the frontend is never authorization.

## Implemented database controls

- All 20 public application tables have RLS enabled and explicit Data API grants; `anon` has no application-table privileges.
- Tenant-owned rows carry `school_id`. Composite foreign keys bind classroom, child, enrollment, guardian, recorder, timetable, and attendance references to the same tenant instead of trusting client-supplied identifiers.
- Roles live in application membership tables linked to `auth.users`, never browser-editable user metadata. The `platform_administrators` table is separate from school roles.
- Private `SECURITY DEFINER` helpers read `auth.uid()` internally, set `search_path = ''`, schema-qualify references, live outside exposed schemas, and have narrowly granted execution. They avoid recursive RLS policy queries.
- School administrators manage their tenant but cannot assign platform status or change a plan. Teachers cannot alter memberships or classroom assignments. Guardian writes to staff care records are denied.
- Platform administrators can manage plans/features/school configuration but are intentionally absent from child, enrollment, guardian, care, attendance, timetable, branch, and classroom access policies.
- Invitation tokens are stored only as hashes; the API select grant excludes the hash column. Invitations model expiry, revocation, and acceptance without default passwords.
- Administrative/security triggers append a reduced, allow-listed record to `audit_log`. Invitation email and token hash, child details, care notes, and other child-private content are not copied. Application roles have no audit insert/update/delete grant.
- pgTAP exercises anonymous, School A/B admins, assigned and unassigned teachers, guardians, and a platform administrator across SELECT, INSERT, UPDATE, and DELETE. Fixtures roll back.

## Still required in later steps

- Protected server actions/routes must re-check authorization and validate input; Proxy/session refresh is not an authorization boundary.
- Authentication UI, invitation redemption, logout/revocation flows, CSRF decisions, abuse controls, and audit retention need implementation and testing.
- Private storage buckets, signed media URLs, upload validation, media access policies, and notification privacy do not exist yet.
- Deployment hardening, secrets management, backups, recovery, monitoring, dependency response, and penetration/security review remain outstanding.
- Local Supabase must start through the pre-created `loop-local-network` Docker bridge. `pnpm supabase:start` supplies it through the supported CLI `--network-id` flag; do not replace it with the default generated network, forward these ports, or expose them through a tunnel.
- On the current Windows Docker Desktop 29.7.2 host, the documented bridge option was not honored for published ports: Docker reports blank `HostIp` values rather than a localhost-only binding. Microsoft Defender Firewall is enabled, and a manual same-Wi-Fi test from another device confirmed that Studio was not reachable at the PC's LAN address (`192.168.18.35:54323`). Local Supabase may only run while host firewall protection remains enabled; the network flag alone is not a proven isolation boundary on this machine.
- This Docker Desktop/host-firewall caveat affects only the local development stack. It is not part of, or a substitute for, the future production Loop network and deployment architecture.

## Privacy by design

Do not include sensitive child details in lock-screen notification copy by default. Avoid third-party trackers, runtime fonts, and remote decorative assets in authenticated child views without privacy review. Media controls must reflect real authorization rather than merely hiding UI.

## Implementation rule

Security behavior must be backed by enforceable server/database/storage controls and verified tests. Documentation and frontend-only checks are not guarantees.
