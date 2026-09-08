# Loop.lk Brand & UI Foundation v1

Status: Approved direction for prototype/MVP reference
Date: 6 September 2026

## 1. Brand position

Loop should feel **calm, warm, trustworthy, fast and quietly premium**. It is a nursery product, but it must not look childish, toy-like, medical, corporate-ERP, or like a generic AI-generated SaaS template.

Core test:
- Teacher: "I can do this quickly."
- Parent: "I understand my child's day immediately."
- Nursery owner: "This feels professional and trustworthy."

### Visual personality
Use: calm, human, clear, warm, restrained, modern, familiar.
Avoid: rainbow palettes, neon colors, purple/blue gradients, glassmorphism, decorative dashboards, excessive pills, excessive cards, default emojis, AI-style illustrations, 3D blobs, cartoon overload, heavy shadows.

## 2. Core color system

### Primary brand
- Loop Evergreen 700: `#2F6F68` - primary actions, active states, key links.
- Loop Evergreen 800: `#255C57` - pressed states and higher-contrast primary surfaces.
- Loop Evergreen 100: `#E7F1EE` - selected rows, soft highlights, calm badges.

### Neutrals
- App background: `#F7F6F2` - warm ivory; default scrollable canvas.
- Surface: `#FFFFFF` - cards, sheets, inputs when separation is needed.
- Text primary: `#243238` - near-charcoal, not pure black.
- Text secondary: `#5F6D73` - secondary copy; passes AA on the chosen light backgrounds.
- Divider/subtle border: `#DEE3DF` - decorative separation only.
- Strong control border: `#83918B` - form/control boundaries when a visible outline is required.

### Warm accent
- Loop Apricot: `#E3A46D` - small moments of warmth only: illustration accents, onboarding detail, special non-critical highlights.
- Do **not** use white text on Apricot. Use dark text (`#243238`) when text is required.

### Semantic colors
- Success: `#2E6B4F`
- Warning: `#8A651F`
- Error: `#A94747`
- Information: `#3F6F96`

Semantic color is never the only signal. Pair it with text, iconography, or state labels.

### Color balance
Aim for roughly:
- 80-85% neutral backgrounds/surfaces
- 10-15% Loop Evergreen
- <=5% accent and semantic colors

Do not tint every card. Color should signal hierarchy or state, not decorate every element.

## 3. Typography

### Primary Latin UI typeface
**Manrope** (self-hosted, variable font), weights 400, 500, 600, 700 only.

Why: highly legible, modern without looking sterile, slightly rounded/geometric without becoming childish, open-source under SIL OFL 1.1, and easy to bundle later in a native Expo app.

### Sinhala and Tamil
When Loop is localized:
- Sinhala UI: **Noto Sans Sinhala UI**
- Tamil UI: **Noto Sans Tamil UI**

Do not force Manrope onto scripts it does not support. Build locale-aware font tokens from the start.

### Font delivery
Self-host font files from Loop's own static assets rather than loading authenticated app UI fonts from a third-party CDN. This improves privacy control, reliability and caching.

### Type scale
- Screen title: 28px / 34px, 700
- Page title: 24px / 30px, 700
- Section heading: 20px / 26px, 600
- Subheading / strong row label: 17px / 24px, 600
- Body: 16px / 24px, 400
- Body strong: 16px / 24px, 600
- Label / button: 14px / 20px, 600
- Metadata: 13px / 18px, 500
- Micro: 12px / 16px, 500 - only for non-critical supporting information

Do not make essential information smaller than 13px. Use responsive `rem` sizing and allow browser text scaling. Native versions must support Dynamic Type / platform text scaling.

Use tabular numerals for times, attendance counts and other frequently aligned numeric data.

## 4. Layout and spacing

Base spacing unit: **4px**.
Approved scale: 4, 8, 12, 16, 20, 24, 32, 40, 48.

Mobile default horizontal padding: 16px.
Use 20px on larger mobile screens where space allows.

### Touch targets
All common interactive targets should be at least **48 x 48px** in the PWA. This clears Android's 48dp recommendation and exceeds Apple's 44pt minimum target guidance.

### Radius
- Small elements: 8px
- Inputs/buttons: 12px
- Cards/sheets: 14px
- Full pill radius only for genuine pills/tags/toggles

Avoid 20-32px radius on every container. That is one of the common visual cues of template/AI-generated interfaces.

### Shadows
Prefer borders, spacing and surface contrast over shadows.
Use shadows only for temporary elevation such as menus, sheets and dialogs.
No large blurred floating-card shadows.

## 5. Buttons and controls

Primary button:
- 48-52px high
- Evergreen 700 background
- white label
- 12px radius
- medium/semibold label
- clear pressed, focus and disabled states

Secondary button:
- surface background
- dark text
- visible border when needed

Only one strongly prominent primary action per area whenever possible.

Form inputs:
- minimum 48px high
- persistent label where ambiguity is possible
- error text in plain language
- error is not shown by color alone

## 6. Iconography - no default emoji

**Do not use system/default emojis anywhere in the Loop product UI.**

Use a small branded SVG icon set instead.

Icon rules:
- 24px master grid
- 1.75-2px stroke
- rounded caps and joins
- simple geometric silhouettes
- monochrome by default
- 20px icons for compact rows, 24px for standard actions
- always provide a 44-48px tap area around icon-only buttons

Initial custom care icon set should cover:
check-in, check-out, meal, bottle, water, nap, toilet, nappy, activity, mood, note, photo, message, announcement, calendar, incident, child, guardian, classroom, staff.

Mood can use custom Loop-designed faces later; never fall back to Apple/Google emoji faces.

## 7. Photography and illustration

Inside the product, real nursery/child media should be the visual focus where appropriate. Do not clutter screens with decorative stock imagery.

For marketing/onboarding:
- prefer commissioned/simple vector illustration or carefully art-directed real photography
- avoid obvious AI-generated children/family imagery
- avoid generic 3D characters and blob scenes
- keep illustration palette constrained to Loop colors

Child media is content, not decoration. Never place sensitive photos behind UI solely for visual effect.

## 8. Motion

Motion should confirm state, not entertain.
- Standard UI transitions: about 120-180ms
- No bouncing buttons
- No looping decorative animation
- No parallax in core workflows
- Respect `prefers-reduced-motion`

Teacher workflows should feel instantaneous.

## 9. How Loop avoids the "AI-generated app" look

Never let Codex/AI invent visual styling per component. Every screen must use this design system.

Specific anti-template rules:
1. No purple-to-blue gradients.
2. No glassmorphism.
3. No default Inter + shadcn appearance.
4. No card around every piece of content; use flat lists and dividers where better.
5. No excessive pill badges.
6. No random icon colors or colored squares for decoration.
7. No giant rounded containers.
8. No default emojis.
9. No vague AI-style copy such as "unlock", "empower", "reimagine" or "supercharge" in product UI.
10. Use childcare language: "Checked in", "Lunch", "Nap started", "New message".
11. Build real empty/loading/error states rather than decorative placeholder panels.
12. Use photos, child names and actual task context to create personality rather than decoration.

## 10. Parent UI direction

Parent Home is a timeline first, not a dashboard.

Recommended structure:
- compact school/child header
- current state (checked in/out)
- today's chronological timeline
- media naturally embedded in timeline
- bottom navigation: Home, Messages, Calendar, More

Use generous whitespace. Avoid turning every event into a large card. A clean timeline row with subtle grouping should be the default.

## 11. Teacher UI direction

Teacher UI prioritizes speed over visual storytelling.

Recommended class screen:
- class name + present count
- 2-3 high-frequency actions visible
- quick action sheet for care logs
- child list with selection/bulk action support
- edit exceptions after applying a class default

Use stronger information density than the parent interface, but preserve 48px touch targets and readable text.

## 12. Accessibility baseline

Target WCAG 2.2 AA for the web app.
- normal text contrast >= 4.5:1
- large text >= 3:1
- do not communicate state by color alone
- keyboard-visible focus states
- screen-reader labels for icon-only controls
- support text zoom to 200% without loss of function
- respect reduced motion
- keep form errors explicit and adjacent to fields

Chosen key contrast ratios:
- `#243238` on `#F7F6F2`: ~12.2:1
- `#5F6D73` on `#F7F6F2`: ~5.0:1
- white on `#2F6F68`: ~5.8:1
- white on `#255C57`: ~7.6:1

## 13. PWA and future native-app architecture

Build the MVP so native iOS/Android can be added without rewriting domain logic.

Recommended repository shape from the start:

```text
apps/
  web/              # Next.js PWA; all roles initially
  mobile/           # future Expo/React Native app
packages/
  design-tokens/    # colors, spacing, typography, radii, semantic tokens
  domain/           # role/permission and business-domain logic safe to share
  validation/       # shared schemas
  types/            # shared TypeScript contracts
  i18n/             # locale keys and formatting rules
```

Do not prematurely share DOM/React web components with React Native. Share **tokens, schemas, business logic, validation, types and API contracts**. Keep platform UI components native to each platform where that produces better UX.

Expo's current documentation has first-class monorepo support, so this structure preserves a clean path to an App Store/Google Play app later without forcing a native build now.

## 14. PWA identity

Initial installed app identity:
- App name: **Loop**
- Home Screen icon: one global Loop icon
- Per-school custom Home Screen icons: not MVP
- `display: standalone`
- matching theme/background colors from the Loop palette
- provide maskable icon assets for platforms that apply icon masks

School branding can appear inside the app (school logo/name/accent) without changing Loop's installed app identity.

## 15. Security/privacy implications of design

Design must not weaken security:
- no sensitive child details in lock-screen notification copy by default
- no public child-media URLs
- no third-party trackers/fonts/remote decorative assets inside authenticated child views without review
- media controls must reflect authorization, not merely hide UI
- sensitive admin actions require clear confirmations and auditability
- role and tenant boundaries are server/database enforced

## 16. Brand implementation rule for Codex

Before building a screen, Codex should read this document and the design tokens. It must not invent new colors, radii, font sizes, icon styles or shadows unless the design system is deliberately updated.

Any new visual token requires a reason and should be added centrally rather than hard-coded locally.

---

## Research basis

This direction was checked against current sources including:
- Apple Human Interface Guidelines: Accessibility, Buttons, Branding and current WWDC design guidance.
- W3C WCAG 2.2 contrast and text-resize requirements.
- Android Developers accessibility guidance (48dp touch targets).
- MDN PWA manifest/icon guidance.
- Expo 2026 monorepo documentation for future React Native/Expo expansion.
- Current public interfaces/positioning of Brightwheel, Famly, Lillio and Illumine.
- Recent designer/developer community discussions identifying repetitive AI-generated UI patterns such as purple gradients, excessive rounded cards, generic component-library styling and decorative visual clutter.

This is a design recommendation, not a claim that a specific color has a scientifically proven emotional effect. The palette is chosen for readability, restraint, product context, competitor differentiation and brand intent.
