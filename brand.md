# Brand — LiftPage

Status: live

Tagline: Attention into traction.

LiftPage is an AI-first social desk for technology startups, founders, hackathons, and innovation communities.

## Direction

Light editorial, with a matching dark mode. Warm paper, deep ink, one signal-orange accent. A large serif for headlines, a clean grotesk for everything you read, small mono labels for days, prices, and statuses. Rounded cards with hairline borders and soft shadows only where something lifts off the page (the hero card, the form).

## Color

Tokens live in `app/globals.css` as CSS variables and switch with the theme. Use the Tailwind names (`bg-canvas`, `text-muted`, `border-line`, …), never hex.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| canvas | `#F5F2EC` | `#13120F` | page |
| card | `#FFFFFF` | `#1C1A16` | panels, inputs, alternating sections |
| sunken | `#EDE8DF` | `#0E0D0B` | chips, hover fills |
| ink | `#17150F` | `#F3EFE7` | text, primary buttons |
| muted | `#655F55` | `#A8A194` | secondary text |
| line | `#DED7CB` | `#302C26` | hairlines |
| accent | `#C2410C` | `#FF7A4D` | eyebrows, days, prices, link underlines, the italic word |
| danger | `#B42318` | `#FF8A7A` | errors |

All text tokens pass WCAG AA on canvas and card in both themes. Accent is for emphasis, not for fills behind small text.

## Theme

Follows the system by default. The header toggle cycles system → light → dark and saves to `localStorage` (`lp-theme`); a script in the root layout applies it before first paint.

## Type

- Instrument Serif (`.display`) for headlines and big numbers. One weight; never bold it.
- Geist for body and UI.
- Geist Mono (`.eyebrow`) for small uppercase labels, days, and statuses.

## Components

`app/globals.css` holds `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-sm`, `.field`, `.panel`, `.link`, `.eyebrow`, `.display`. Buttons are pills; primary is ink, and turns accent on hover.

## Voice

Short lines. Name the client, the day, and the offer. No fake metrics. No "excited to announce".

## Motion

The hero rises once, 520ms, staggered. Reduced motion kills it.
