# Loop product foundation

Loop.lk is a privacy-sensitive, multi-tenant nursery/preschool parent communication product for Sri Lanka. It should make daily communication feel immediate and calm without becoming a nursery ERP.

## Product principles

- Minimalism and ease of use come first.
- The primary delivery strategy is mobile-first and PWA-first.
- A parent should open Loop and understand Child -> Today immediately.
- Teacher workflows should require few taps and favor bulk actions, smart defaults, and editing only the exceptions.
- Product language should be direct childcare language, not generic SaaS language.
- The visual and interaction design should feel calm, premium, friendly, trustworthy, and deliberately human-made.
- Default/system emojis are prohibited. Step 3 introduces the consistent rounded-stroke, `currentColor` first-party Loop SVG icon set.

## Experience direction

The future parent home is timeline-first, not a dashboard. The future teacher experience may be denser, but it must preserve readable type and 48px touch targets. These are product directions, not implemented features or API commitments.

## Current Step 5 scope

Step 3 connects the local backend to production-oriented role experiences: secure sign-in/recovery and one-time invitations, role routing, editable platform school/plan setup, editable school administration, mobile Classroom Today for teachers, and Child -> Today for guardians.

The teacher care workflow covers meal, bottle, water, sleep, toilet, nappy, mood, activity, and note. Each module follows the same few-tap pattern: choose the module, accept the class default, keep present children selected, change only exceptions, and save once. Sleep is deliberately a two-action lifecycle (start, then end); the parent timeline presents both moments and the duration. The fictional QA roster contains 15 children so the operational density is exercised rather than inferred from a tiny fixture.

The built-in feature catalogue and plan/school settings describe product availability. Availability requires a supported active feature, an active plan entitlement, the school setting, and the caller's action permission. This is not billing and does not imply that every catalogued feature has been implemented.

Steps 3 and 4 supply the role workflows, private photos, child-contextual messaging, targeted announcements, and calendar. Step 5 makes the web app installable, adds predictable service-worker updates and a clear offline state, and introduces a deliberately small notification-preferences area. Attendance arrival/departure, direct messages, and important announcements are on by default; new-photo push is optional and off by default. Routine care and timetable activity never produce lock-screen notifications.

Loop Push is the primary notification system. WhatsApp notifications are not used initially; families receive the focused events above through the installed Loop experience when they explicitly enable permission on a supported device.

Short video, broad offline data access/background sync, incidents workflow, billing, payments, production email delivery, production cloud resources, and deployment remain deferred. Step 6B uses only isolated disposable staging resources and adds no product functionality.
