# Loop architecture foundation

## Workspace shape

```text
apps/
  web/              Next.js App Router PWA
packages/
  brand/            design values, CSS tokens, local fonts, approved artwork
  domain/           platform-neutral domain logic (empty foundation)
  types/            shared contracts and generated local database types
  validation/       platform-neutral validation (empty foundation)
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

The web app uses stable Next.js with the App Router, React, strict TypeScript, Tailwind CSS, ESLint, and local Manrope via `next/font/local`. The manifest provides a standalone PWA identity and proportional derivatives of the approved master artwork. A service worker, offline/update lifecycle, Web Push, and caching strategy are explicitly deferred.

`apps/web/lib/supabase` contains typed browser and server client factories using `@supabase/ssr`. Next.js `proxy.ts` performs Auth claim validation/session cookie refresh when local public environment variables exist; it does not authorize database rows or redirect the Step 1 welcome page. RLS remains the data boundary. Browser code uses only the publishable key.

## Local backend

Supabase CLI and JavaScript packages are project-scoped and pinned. The local stack uses PostgreSQL 17 plus Auth, Data API, Studio, and the default local supporting services. The observed full stack fit the approximately 8 GB Docker allocation, so no services are excluded.

On the current Windows/Docker Desktop host, the CLI publishes ports 54321-54327 on all host interfaces and Windows Firewall is disabled. The stack was therefore stopped after verification. Before starting it again, enable a host firewall that blocks inbound access to those ports (especially on the Public profile), and never add router forwarding or a public tunnel. The current CLI has no supported project configuration for changing its Docker host bind address to loopback only.

From the repository root:

```text
pnpm supabase:start
pnpm supabase:stop
pnpm supabase:reset
pnpm supabase:test
pnpm supabase:types
```

Copy `apps/web/.env.example` to an ignored `.env.local`, then obtain the local publishable key with `pnpm exec supabase status --output env`. Never put `SECRET_KEY`, `SERVICE_ROLE_KEY`, or the database password in a `NEXT_PUBLIC_` variable.

Create each database change with `pnpm exec supabase migration new <name>`. Edit that new migration, run `pnpm supabase:reset`, run `pnpm supabase:test`, then regenerate `packages/types/src/database.generated.ts` with `pnpm supabase:types`.

See `docs/DATABASE.md` for the tenancy, schedule, care, feature, and audit model.

## Configuration

Root scripts provide one entry point for development, linting, type checking, and production builds. Versions are pinned and recorded in the lockfile for reproducible installs.
