# Loop.lk repository rules

Loop is a privacy-sensitive, multi-tenant nursery/preschool parent communication product for Sri Lanka. This file is the concise source of truth for future work. Read the relevant document in `docs/` and the approved brand sources before changing behavior or UI.

## Current boundary

- Step 5 adds installable PWA guidance, a first-party no-fetch-cache service worker, safe update/offline UI, and privacy-preserving Web Push for focused attendance, message, important-announcement, and optional-photo events.
- Supabase remains local. Do not link or deploy a cloud Supabase project, deploy Loop, connect Vercel or GitHub, or add billing, payments, production email delivery, attachments, broad offline caching/background sync, or short video without an explicit later step.
- Use pnpm from the repository root. App checks are `pnpm lint`, `pnpm typecheck`, `pnpm build`; local database commands are `pnpm supabase:start`, `pnpm supabase:stop`, `pnpm supabase:reset`, `pnpm supabase:test`, and `pnpm supabase:types`.
- Create schema changes with a new migration. Never hand-edit generated database types; regenerate them from the local database after a successful reset.

## Product rules

- Minimalism and ease of use first. Mobile-first and PWA-first.
- Teacher workflows use few taps, bulk actions, smart defaults, and exception editing.
- Parent experience centers on Child -> Today.
- No ERP-style feature bloat.
- No default/system emojis anywhere. Extend the first-party rounded-stroke `LoopIcon` set consistently when a new icon is justified.
- The product must feel calm, premium, friendly, trustworthy, and human-designed, never generic or AI-generated.

## Design rules

- The supplied brand guide is authoritative. Consume shared tokens from `@loop/brand`; add justified new tokens centrally, not per screen.
- Core colors: Evergreen `#2F6F68`, Dark Evergreen `#255C57`, Soft Evergreen `#E7F1EE`, background `#F7F6F2`, surface `#FFFFFF`, text `#243238`, secondary text `#5F6D73`, warm accent `#E3A46D`.
- Latin UI uses the repository-hosted Manrope variable font through `next/font/local`. Never add a runtime font CDN request.
- Preserve `reference-assets/brand/loop-logo-approved-master.jpeg` as the approved master. Do not redesign, regenerate, recolour, crop, trace, or overwrite it. Only create proportional technical resizes when required.
- Avoid purple/blue AI gradients, glassmorphism, excessive pills/badges/radius, a card around every section, random coloured icon boxes, emojis, generic SaaS styling, and decorative complexity.
- Use 48px minimum common touch targets, visible keyboard focus, accessible contrast, text zoom support, and reduced-motion handling. Target WCAG 2.2 AA.

## Architecture rules

- `apps/web`: Next.js App Router PWA. Keep web UI here.
- Future `apps/mobile`: Expo/React Native, not created yet.
- `packages/brand`: cross-platform tokens and approved assets; web-only CSS is exported separately.
- `packages/domain`, `packages/types`, `packages/validation`: platform-neutral shared code only. Do not import DOM or web UI code.
- Share domain logic, types, schemas, validation, design values, and API contracts across platforms; do not force reuse of web UI components in native apps.

## Security rules

- Enforce multi-tenant isolation, least privilege, and authorization server-side and in the database; frontend visibility is never a security boundary.
- Use Supabase RLS on relevant exposed tables. Keep child media private and issue short-lived signed URLs.
- Never expose service-role keys. Validate untrusted input and protect against IDOR, XSS, CSRF, SQL injection, and privilege escalation.
- Use secure session handling and audit security-relevant/admin actions. Do not put sensitive child details in notification or lock-screen copy by default.
- Platform administration is not a child-data bypass. Keep privileged helpers in the unexposed `private` schema with explicit `search_path` and execute grants.

## Change checklist

- Keep dependencies minimal and use strict TypeScript.
- Run lint, typecheck, and production build. For UI changes, inspect the real render at mobile and desktop sizes and fix observed console, accessibility, overflow, and interaction issues.
- Do not claim security, browser, test, or build verification that was not actually performed.
