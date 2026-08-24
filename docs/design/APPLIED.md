# What was taken from the Stitch designs

Source: `docs/design/New folder/` - 22 screens, design system **Forest Guardian**
(`forest_guardian/DESIGN.md`, three identical copies).

> **SUPERSEDED 6 August 2026 by "Canopy".** The Stitch *layouts* still stand and
> the table below is still an accurate record of which screen came from where.
> The Stitch *palette* has been replaced - see [Why Forest Guardian was
> replaced](#why-forest-guardian-was-replaced) at the bottom. Token names did not
> change, so everything in this document still resolves.

---

## The system, applied wholesale

Everything below now lives in the `@theme` block at the top of
[`app/src/index.css`](../../app/src/index.css). Names are kept **exactly** as the
design system defines them (`primary` / `on-primary` / `surface-container` /
`on-surface-variant`) rather than renamed to something friendlier, so any screen
in `docs/design/` can be read straight across into a component with no
translation step.

| | Value |
|---|---|
| Primary | `#003527` |
| Primary container | `#064e3b` |
| Secondary container | `#caead6` |
| Surface / background | `#f9f9ff` |
| On surface (ink) | `#141b2b` |
| On surface variant (muted) | `#404944` |
| Outline variant (borders) | `#bfc9c3` |
| Tertiary container (*needs review*) | `#584000` |
| Error (*flagged*) | `#ba1a1a` |
| Verified chip | `#006a4e` |
| Headings | Be Vietnam Pro 700/800 |
| Body | Work Sans 400–700 |
| Radii | 0.25 / 0.5 / 0.75 / 1 rem |
| Tap target | 56 px minimum |
| Spacing | 8 / 12 / 16 / 20 / 24 / 40 px |

Verified: **all 59 custom theme classes used in the app generate in the built
CSS.** Tailwind silently drops classes it cannot resolve, so this is checked
rather than assumed.

---

## Screens built from the designs

| Design folder | Route | Notes |
|---|---|---|
| `landing` | `/` | layout kept, copy replaced - see deviations |
| `sign_in` | `/signin` | + the "check your email" state |
| `profile_setup` | `/profile/setup` | |
| `my_grove_dashboard` | `/grove` | summary strip, cards, FAB, tab bar |
| `my_grove_empty_state` | `/grove` | |
| `my_grove_loading_state` | `/grove` | skeleton cards |
| `my_grove_offline_sync` | app-wide | hoisted above the router - see below |
| `register_location_good_gps` | `/register` 1 | |
| `register_location_poor_gps` | `/register` 1 | amber state |
| `register_location_too_poor` | `/register` 1 | button disabled |
| `register_wide_photo_camera` | `/register` 2 | |
| `register_wide_photo_blur_warning` | `/register` 2 | buttons swapped - see deviations |
| `register_close_up_camera` | `/register` 3 | |
| `community_leaderboard` | `/leaderboard` | |
| `user_profile_stats` | `/profile` | |
| `reviewer_pending_verification_queue` | `/review` | + the random-audit banner |
| `sponsor_dashboard_overview` | `/sponsor` | charts built - Stitch omitted them |
| `sponsor_dashboard_empty_state` | `/sponsor` | |
| `sponsor_dashboard_loading_state` | `/sponsor` | |
| `a_vibrant_young_sapling…` | `/` | compressed to `app/public/hero-sapling.jpg` (147 KB) |
| `greenproof_logo` | - | not used; the wordmark uses the inline SVG tree |

**Screens with no Stitch design**, built to match the system: check-in flow
(ghost overlay, compass, tap-to-measure, verdict reveal), tree detail, map,
wallet.

---

## Deviations, and why

Full reasoning in [`../DEFEND.md`](../DEFEND.md) §15.

1. **Landing copy** - the design said "Web3 Verification" and "decentralized
   network". There is no blockchain in this stack.
2. **Blur warning buttons swapped** - "Retake" is now primary, not "Use anyway".
3. **Material Symbols → inline SVG**, fonts self-hosted - a ~200 KB icon webfont
   that fails on one bar of signal renders raw ligature text on every button.
4. **Register step 1 shows a card, not a live map** - Leaflet is ~157 KB on the
   one screen that must load fast at T0.
5. **Offline banner hoisted above the router** - the design placed it inside My
   Grove. At T0 the user is inside `/register` for the whole session, so a run
   of failing uploads would have stayed invisible for an hour.

---

## Re-skinning later

Change the `@theme` block in `app/src/index.css` and nothing else. No component
hardcodes a colour.

Two exceptions, both unavoidable and both commented in place:

- `MapScreen.tsx` - Leaflet paints SVG through JS, so pin colours must be
  literal hex; a `var(--color-…)` string is not resolved by its path renderer.
- `tools/make_icons.py` - the PWA icons are raster PNGs generated from a script;
  re-run it after a palette change.

**This claim was tested on 6 August and held.** The entire palette was replaced
by editing one file. Only `MapScreen.tsx`'s four literal pin colours needed a
manual follow-up, exactly as predicted above.

---

## Why Forest Guardian was replaced

The Stitch export was a **stock Material 3 tonal palette**, and it made the app
look like a template because it was one. Three specific faults, all visible on
every screen:

1. **The neutrals were blue.** `surface #f9f9ff`, `surface-container #e9edff` -
   lavender-greys. An app about trees had a faintly violet background.
2. **Everything was on one plane.** Card `#e9edff` on surface `#f9f9ff` is ~2%
   contrast. Nothing floated, nothing receded, no screen had a focal point -
   My Grove opened with three stats at *equal* weight, so the eye had nowhere
   to land.
3. **Outlined everything.** A 1.5px border on every card, header, field and
   note. Depth now comes from tint and shadow; outlines survive only where they
   earn their keep - a text input, and the edge of a photograph.

### What replaced it

| | Forest Guardian | Canopy |
|---|---|---|
| Surface | `#f9f9ff` (blue) | `#fafaf8` (warm, faintly green) |
| Container | `#e9edff` | `#eef1ea` |
| Primary | `#003527` | `#0b4433` |
| Accent | *none - single hue* | `#d4a02c` gold |
| Largest type | 32 px | **56 px**, tracking −0.035em |
| Card | 1.5px outline, 4px radius | tint + shadow, 18px radius |
| Nav | full-width bordered bar | floating pill |

### The `.night` scope - how one class flips a screen

Tailwind v4 utilities compile to `var(--color-…)`, so **redefining those
variables on an ancestor re-colours every utility beneath it**. `.night` is one
CSS block that overrides ~30 tokens; putting it on `Shell` flips all seven
tabbed screens at once, and no component needs a dark variant. Verified in the
built CSS: `.bg-surface{background-color:var(--color-surface)}`.

### Why only some screens are dark

**This app is used outdoors at midday in Ghana.** Dark UIs are harder to read in
direct sun - low average picture level fights the display's own reflectance, and
auto-brightness makes it worse. So:

| | Screens |
|---|---|
| **Night** | Landing, Sign in, My Grove, Tree detail, Map, Wallet, Leaderboard, Profile, Review, Sponsor |
| **Light** | **Register and Check-in** - the capture flow, used standing at a tree |

If a judge asks why the app changes character: the capture screens are optimised
for the field, the rest for reading. That is the honest answer and it is also
the correct engineering one.

### Two bugs found by screenshotting rather than assuming

Both would have shipped invisibly:

1. **The landing photograph did not render.** `.night` paints its own
   `background-color`, and the image wrapper was `-z-10` - a negatively-stacked
   child renders *behind its parent's background*. It downloaded 150 KB on every
   load and displayed nothing. Now `z-0` with the foreground at `z-10`.
2. **Disabled buttons were the loudest thing on the dark screens.** `.btn:disabled`
   is `opacity-40`, which recedes a dark green button but leaves a *white* pill
   still bright. Disabled primaries in `.night` now recede into a surface tint
   instead of fading.
