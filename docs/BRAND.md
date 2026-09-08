# Loop brand implementation

The authoritative source is the supplied `reference-assets/brand/Loop_Brand_Pack_v1/loop-brand-ui-foundation-v1.md`, supported by its PDF and CSS tokens. This document records how the repository consumes that direction.

## Approved artwork

`reference-assets/brand/loop-logo-approved-master.jpeg` is the approved master artwork. Despite its filename extension, the file contains PNG data. Preserve it byte-for-byte: do not redesign, regenerate, recolour, crop, trace, or overwrite it. Proportional raster resizes are allowed only for technical delivery needs such as PWA icons.

## Core system

| Role | Token | Value |
| --- | --- | --- |
| Primary | Loop Evergreen | `#2F6F68` |
| Pressed/high contrast | Dark Evergreen | `#255C57` |
| Soft selection | Soft Evergreen | `#E7F1EE` |
| Canvas | Background | `#F7F6F2` |
| Raised surface | Surface | `#FFFFFF` |
| Primary copy | Main text | `#243238` |
| Supporting copy | Secondary text | `#5F6D73` |
| Restrained warmth | Apricot | `#E3A46D` |

Use roughly 80-85% neutral surfaces, 10-15% evergreen, and no more than about 5% accent/semantic color. Color signals hierarchy or state; it is not decoration.

## Typography and layout

- Latin UI: Manrope, weights 400-700, self-hosted under `packages/brand/assets/fonts` and loaded in the web app with `next/font/local`.
- Sinhala and Tamil will receive locale-aware type stacks later; do not force unsupported scripts into Manrope.
- Spacing follows a 4px base scale. Mobile horizontal padding starts at 16px.
- Common touch targets are at least 48x48px. Controls use 12px radius; cards/sheets use 14px only when a container is genuinely needed.
- Prefer spacing, dividers, and surface contrast to shadows.

## Visual guardrails

Do not use default emojis, purple/blue AI gradients, glassmorphism, excessive pills or cards, giant rounded containers, random colored icon tiles, generic 3D/AI children, decorative dashboards, or vague AI-style copy. Product media is content, not decoration.

## Accessibility

Target WCAG 2.2 AA: 4.5:1 normal-text contrast, visible keyboard focus, non-color state cues, 200% text zoom, explicit adjacent form errors, screen-reader names for icon-only controls, and reduced-motion support.

