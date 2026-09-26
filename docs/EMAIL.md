# Transactional email and invitation activation

Loop uses an invite-only account model. Public signup and anonymous sign-in remain disabled. The application sends Loop invitation messages through a small server-only adapter; Supabase Auth sends password-recovery messages through its custom SMTP configuration. Marketing, campaigns, and automated reminders are outside this system.

## Invitation flow

The application generates a 192-bit random token and emails an HTTPS `/invite?token=...` link. PostgreSQL stores only its SHA-256 hash. The invitation row is the authority for email, school, role, and (for a Guardian) child relationship. A new user chooses only a password; an existing user signs in first. Atomic redemption locks the pending row, compares the verified Auth email, applies only the stored relationship, and marks the token accepted. Expired, revoked, replaced, used, tampered, and wrong-email tokens fail closed.

Invitation creation moves stale pending rows to `expired` before inserting, inside the same database transaction. Reissue is serialized by row lock, limited to one attempt per minute, invalidates the old pending token, and creates a new seven-day token. A provider rejection marks the new row `failed` without claiming delivery; an administrator can reissue it later. Resend requests use an invitation-specific idempotency key.

`delivery_status = sent` means the provider accepted the API request, not that the recipient mailbox delivered it. The database also records attempt time/count and a coarse failure category, never email bodies, provider responses, credentials, or raw tokens. Verified Resend delivery/bounce/complaint webhooks are intentionally the immediate P1 follow-up: current webhook verification requires the raw request body plus the `svix-id`, `svix-timestamp`, and `svix-signature` headers and a server-only signing secret. Loop does not claim delivered/bounced status until that endpoint exists.

## Staging and production setup

Use separate Resend projects/keys and sending domains for staging and production. Do not reuse secrets.

1. Add and verify a transactional sending subdomain in Resend. Use a staging-specific subdomain for staging and `auth.loop.lk` (or the final approved equivalent) for production.
2. Publish the exact SPF and DKIM records Resend supplies. Publish and monitor an appropriate DMARC policy for the sending domain. Confirm verification before sending.
3. Create a least-privilege sending API key. In the matching Vercel environment set server-only `RESEND_API_KEY`, `EMAIL_FROM` (for example `Loop <no-reply@auth.loop.lk>`), and `EMAIL_SUPPORT_ADDRESS`. Never prefix these with `NEXT_PUBLIC_`.
4. In the matching Supabase project configure custom SMTP for Auth recovery: host `smtp.resend.com`, port `465` with SSL/TLS, username `resend`, password a separate environment-specific Resend key, the approved sender address, and sender name `Loop`. Do not store this password in Git or Vercel unless Vercel itself needs it.
5. Set the Supabase Site URL to the environment's stable HTTPS origin. The staging value is `https://loop-staging-pi.vercel.app`. Allow only the exact callback URL `https://loop-staging-pi.vercel.app/auth/callback` for staging. Replace both with the final production origin for production; do not allow wildcard preview URLs.
6. Keep global public signup OFF and anonymous sign-ins OFF. Keep email/password sign-in enabled so invited users and password recovery continue to work. Review Auth email/OTP expiry, password-recovery rate limits, and CAPTCHA/abuse controls before pilot launch.
7. Test invitation and password recovery with fictional addresses first. Verify the link returns to the stable HTTPS origin, is one-time, expires correctly, and does not expose a token in logs or analytics.

Local development with no `RESEND_API_KEY` returns an explicit localhost preview link and leaves delivery as `not_sent`. Mailpit continues to capture Supabase Auth recovery mail. Blank variable names live in `apps/web/.env.example`; populated values belong only in ignored local files or environment secret stores.

Official references: [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Supabase password recovery](https://supabase.com/docs/guides/auth/passwords), [Resend SMTP](https://resend.com/docs/send-with-smtp), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), and [Resend webhook verification](https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests).
