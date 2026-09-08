# Step 3 reference concepts

These four generated UI references are design inputs, not shipped product assets. The implementation uses the untouched approved repository logo and code-native Loop SVG icons.

## Parent Today mobile

Saved as `concepts/parent-today-mobile.png`.

```text
Use case: ui-mockup
Asset type: retained high-fidelity product UI reference, portrait mobile 390x844
Primary request: Parent Today screen for Loop.lk, a privacy-sensitive Sri Lankan nursery parent communication PWA. Show a compact child switcher, date header, calm chronological timeline combining arrival, timetable activity, meal care update, rest, and pickup. Clearly distinguish "happening now", "completed and confirmed", and "ended without confirmation"; the latter must never look completed.
Style/medium: high-fidelity flat mobile interface, human-designed, premium, practical, native-feeling
Composition/framing: full phone viewport, edge-to-edge application chrome, bottom navigation, information hierarchy through type, thin dividers, whitespace and one restrained soft evergreen highlight; no device frame
Color palette: warm off-white #F7F6F2, white #FFFFFF, evergreen #2F6F68, dark evergreen #255C57, soft evergreen #E7F1EE, charcoal #243238, muted #5F6D73, warm accent #E3A46D
Typography: Manrope-like rounded geometric sans serif, accessible sizes
Text (verbatim where rendered): "Today", "Maya", "Arrived", "Circle time", "Lunch", "Rest", "Pickup", "Now", "Confirmed"
Constraints: reserve a simple blank logo area at top; do not invent or redraw a logo. 48px touch targets. Use small consistent outline icon placeholders only. No child photos or media. No sensitive notification copy.
Avoid: gradients, glassmorphism, illustrations, emojis, purple, blue AI styling, excessive rounded cards, pills everywhere, dashboard tiles, generic SaaS decoration, fabricated photography, watermarks
```

## Teacher Classroom Today mobile

Saved as `concepts/teacher-classroom-today-mobile.png`.

```text
Use case: ui-mockup
Asset type: retained high-fidelity product UI reference, portrait mobile 390x844
Primary request: Teacher Classroom Today screen for Loop.lk. Show classroom "Sunbirds", attendance summary 12 present of 14, clear NOW and NEXT timetable rows, a fast attendance list with child names and check-in states, and quick actions only for enabled features: Attendance, Meal, Water, Rest, Toilet, Nappy, Mood, Activity, Note. Make bulk care recording feel like a few taps with sensible defaults and exception editing.
Style/medium: high-fidelity flat mobile application, calm premium nursery operations tool, practical and highly legible
Composition/framing: full viewport without device frame; compact top bar, strong present/total metric, timetable strip, efficient list, sticky bottom action area; use lines and whitespace more than cards
Color palette: #F7F6F2 background, #FFFFFF surface, #2F6F68 evergreen, #255C57 dark evergreen, #E7F1EE soft evergreen, #243238 text, #5F6D73 secondary, #E3A46D accent
Typography: Manrope-like geometric sans serif
Text (verbatim where rendered): "Classroom today", "Sunbirds", "12 present", "of 14", "NOW", "NEXT", "Circle time", "Lunch", "Attendance", "Record care"
Constraints: blank logo area only; do not invent a logo. 48px targets. Small consistent rounded-stroke outline icon placeholders. No child photos, video, messaging, payments or media controls.
Avoid: gradients, glass, emojis, illustrations, excessive pills, a card around every section, colored icon boxes, generic SaaS, purple or electric blue, watermarks
```

## School Admin desktop

Saved as `concepts/school-admin-desktop.png`.

```text
Use case: ui-mockup
Asset type: retained high-fidelity product UI reference, landscape desktop 1440x900
Primary request: School Admin workspace for Loop.lk. Show real operational overview for one nursery: children, active staff, branches and classrooms; a weekly timetable management area; concise staff and guardian invitation management; plan-limit meter; feature settings; and a small recent audit trail. Use a sober sidebar and content-first workspace suitable for tablet and desktop.
Style/medium: high-fidelity flat responsive web application, calm premium, human-designed, operational but not ERP-like
Composition/framing: full browser viewport, slim left navigation, top school context, two-column content where useful, table/list detail with restrained borders and almost no elevated cards
Color palette: #F7F6F2, #FFFFFF, #2F6F68, #255C57, #E7F1EE, #243238, #5F6D73, #E3A46D
Typography: Manrope-like geometric sans serif
Text (verbatim where rendered): "Little Harbour Preschool", "Overview", "People", "Classrooms", "Timetable", "Features", "Settings", "42 children", "8 active staff", "Plan usage", "Recent changes"
Constraints: blank logo area only; do not redraw logo. accessible focus-ready controls and 48px common targets. No child photos/media. No messaging, billing, cloud setup or analytics charts.
Avoid: gradients, glassmorphism, giant KPI cards, excessive pills, colorful icon tiles, generic SaaS dashboard, ERP density, emojis, illustrations, purple, watermarks
```

## Loop Super Admin desktop

Saved as `concepts/super-admin-desktop.png`.

```text
Use case: ui-mockup
Asset type: retained high-fidelity product UI reference, landscape desktop 1440x900
Primary request: Loop Super Admin workspace. Show a minimal platform-level school setup interface with schools list, selected school details, plan limits and allowed features, branch/classroom starter structure, first school-admin invitation, and an audit trail. Explicitly exclude children and child data.
Style/medium: high-fidelity flat desktop web application, trustworthy and restrained operations console
Composition/framing: full viewport; compact left navigation; clear schools table; selected school editing panel; visible privacy boundary note; use typography, whitespace and thin dividers, not a grid of cards
Color palette: #F7F6F2 warm background, white, evergreen #2F6F68, dark evergreen #255C57, soft evergreen #E7F1EE, charcoal #243238, muted #5F6D73, warm accent #E3A46D
Typography: Manrope-like geometric sans serif
Text (verbatim where rendered): "Loop administration", "Schools", "Plans", "Features", "Audit", "Add school", "Plan limits", "First administrator", "Child data is not available here"
Constraints: blank logo area only; do not invent or redraw logo. Accessible, clear focus-ready controls. No children UI, no child counts, no photos/media, no deployment/cloud credentials.
Avoid: gradients, glass, excessive cards, pills everywhere, charts, generic SaaS styling, emojis, illustrations, purple or bright blue, watermarks
```
