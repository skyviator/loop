# Loop architecture foundation

## Workspace shape

```text
apps/
  web/              Next.js App Router PWA
packages/
  brand/            design values, CSS tokens, local fonts, approved artwork
  domain/           platform-neutral schedule, timeline, role, feature, and bulk-care logic
  types/            shared contracts and generated local database types
  validation/       platform-neutral form/input validation
supabase/
  config.toml       local Supabase configuration
  migrations/       ordered, version-controlled database changes
  tests/database/   transaction-isolated pgTAP security tests
  seed.sql          intentionally empty persistent seed
docs/
```

The pnpm workspace is deliberately small. The current web app is the only runnable application. A future Expo/React Native project may be added at `apps/mobile` without moving shared platform-neutral logic.

## Dependency boundaries

- UI stays platform-specific: DOM/Next components in `apps/web`; future native components in `apps/mobile`.
- `packages/domain`, `packages/types`, and `packages/validation` must not import React DOM, Next.js, browser globals, or native UI.
- `packages/brand` exposes cross-platform TypeScript values and a separate CSS entry point for the web.
- Future API contracts may be shared only when they exist; this foundation does not invent them.

## Web foundation

The web app uses Next.js App Router, React Server Components, server actions, strict TypeScript, Tailwind CSS, ESLint, and local Manrope via `next/font/local`. Authenticated pages fetch independent RLS-scoped data in parallel on the server and send only rendered role data to small client boundaries. Stateful client boundaries are limited to focused workflows such as bulk care, private photo preparation/upload/viewing, an open message thread, and local PWA/device controls. The manifest provides a stable standalone PWA identity and proportional derivatives of the approved master artwork.

The first-party `/sw.js` service worker is registered with `updateViaCache: "none"` and a no-store response policy. It handles Push, notification clicks, optional app badging, and an explicit user-approved waiting-worker activation. It intentionally has no `fetch` listener, Cache Storage strategy, private-data cache, background sync, or offline mutation queue. The global offline state explains that private Loop data is unavailable rather than serving stale child information. Waiting workers activate only after the user accepts the update, and the guarded controller transition reloads once; normal Loop releases must update in place and must not require users to uninstall or reinstall the PWA. `pnpm dev:https` uses the supported Next.js development HTTPS flag for device/PWA checks; the ordinary local app remains available through `pnpm dev`.

Web Push writes are asynchronous. Database triggers append minimal event metadata after authoritative attendance, message, important-announcement, or ready-photo writes. The Next.js mutation path schedules a best-effort post-response dispatcher. Delivery claims recalculate current guardian links, memberships, classroom assignments, feature availability, and user preferences, then send a generic lock-screen payload with only a same-origin relative route. A retained outbox supports retries; a production scheduled worker and monitoring design remain required before deployment.

`apps/web/lib/supabase` contains typed browser and server client factories using `@supabase/ssr`. Next.js `proxy.ts` performs Auth claim validation/session cookie refresh when local public environment variables exist; it does not authorize database rows or redirect the Step 1 welcome page. RLS remains the data boundary. Browser code uses only the publishable key.

## Local backend

Supabase CLI and JavaScript packages are project-scoped and pinned. The local stack uses PostgreSQL 17 plus Auth, Data API, Studio, and the default local supporting services. The observed full stack fit the approximately 8 GB Docker allocation, so no services are excluded.

On the current Windows/Docker Desktop host, Docker still reports published ports without a localhost-only `HostIp`, despite the custom bridge option. Microsoft Defender Firewall is enabled, and manual same-Wi-Fi testing from another device could not reach Studio through the PC LAN address. Keep the firewall enabled whenever the local stack runs; never add router forwarding or a public tunnel. This is a local-development caveat, not the production network architecture.

From the repository root:

```text
pnpm supabase:start
pnpm supabase:stop
pnpm supabase:reset
pnpm supabase:test
pnpm supabase:types
```

Copy `apps/web/.env.example` to an ignored `.env.local`, then obtain the local publishable key with `pnpm exec supabase status --output env`. The local seed/invitation activator also needs the local service-role key in the server-only variable documented by the example. Never put `SECRET_KEY`, `SERVICE_ROLE_KEY`, or the database password in a `NEXT_PUBLIC_` variable.

Create each database change with `pnpm exec supabase migration new <name>`. Edit that new migration, run `pnpm supabase:reset`, run `pnpm supabase:test`, then regenerate `packages/types/src/database.generated.ts` with `pnpm supabase:types`.

See `docs/DATABASE.md` for the tenancy, schedule, care, feature, and audit model.

## Private media and communication

Cloudflare R2 stores private photo bytes while PostgreSQL stores authorization metadata and opaque object keys. The browser re-encodes supported photos into three JPEG variants, asks the authenticated server for exact short-lived PUT capabilities, uploads directly to R2, and then asks the server to HEAD-verify and finalize. Reads follow the inverse path: an RLS-authorized variant lookup produces a short-lived exact GET capability and normal media bytes flow directly from R2. Neither path proxies photo bytes through Next.js.

Object keys are generated server-side as `originals/<school UUID>/<asset UUID>/<variant UUID>.jpg`, `display/<school UUID>/<asset UUID>/<variant UUID>.jpg`, and `thumbs/<school UUID>/<asset UUID>/<variant UUID>.jpg`. The first is a sanitized, re-encoded high-quality copy, not untouched camera bytes. Names, emails, captions, and other personal text never enter a key. R2 credentials remain in ignored server-only environment variables. Presigned URLs are bearer capabilities and are never stored in the database or logged. The bucket has no public URL; only `originals/` has the manually configured 30-day lifecycle expiration rule, while `display/` and `thumbs/` retention remains separate.

Messaging uses one guardian-to-school thread per guardian/child pair. PostgreSQL RLS recalculates access from current guardian links, memberships, and classroom assignments. Only the open thread subscribes to a private Supabase Realtime Broadcast topic (`message-thread:<thread UUID>`), authorized through `realtime.messages`; the browser does not subscribe to school-wide messages.

## Configuration

Root scripts provide one entry point for development, linting, type checking, and production builds. Versions are pinned and recorded in the lockfile for reproducible installs.
