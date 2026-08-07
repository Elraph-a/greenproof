# Drop Stitch designs here

**Just put everything in this folder. Don't sort, don't rename, don't organise.**

Screenshots, exported HTML/CSS, ZIPs, a screen-recording, a photo of your
screen — all fine, all in here. I work out which screen is which and which batch
it belongs to by looking at them.

Whatever Stitch gives you, drop it in.

---

## If you only have thirty seconds

Paste the **hex codes** into `PALETTE.md` in this folder (there's a template
below, and a blank one already there).

That single step restyles the entire app. Every screen already reads its colours
from one token block at the top of [`app/src/index.css`](../../app/src/index.css),
so six hex values is a ten-minute change instead of a three-hour one.
Screenshots are useful; the hex codes are what actually move the build.

---

## What I'll do with what lands here

| You drop | I do |
|---|---|
| Screenshots of any screen | identify it, match it to the built component, rebuild the layout |
| Hex codes / a palette | swap the `@theme` block — every screen restyles at once |
| Exported HTML/CSS | lift spacing, radii, type scale and shadows directly |
| Something I can't place | ask you about that one specific image, not all of them |

You don't need to tell me which prompt produced which image, or which batch it
came from. That's my job.

---

## What's already built and waiting to be skinned

Everything below exists, works, and is styled with placeholder tokens. A design
for any of these drops straight onto a working screen — nothing needs to be
built from scratch.

| Screen | Route | Built |
|---|---|---|
| Landing | `/` | ✅ |
| Sign in | `/signin` | ✅ |
| Profile setup | `/profile/setup` | ✅ |
| My Grove | `/grove` | ✅ |
| Register a tree (5 steps) | `/register` | ✅ |
| Check in (5 steps, ghost overlay) | `/checkin` | ✅ |
| Tree detail + photo timeline | `/tree/:id` | ✅ |
| Map | `/map` | ✅ |
| Wallet | `/wallet` | ✅ |
| Leaderboard | `/leaderboard` | ✅ |
| Review queue | `/review` | ✅ |
| Sponsor dashboard | — | not yet — post-T0 |

**Priority if you're short on time:** Landing, Sign in, My Grove, Register.
Those four are the only screens Monday needs. Everything else can be skinned any
time before 20 August.

---

## Two things that would slow me down

- **A single flattened image of all screens at once.** Individual screens are
  much easier to work from. If Stitch gives you a contact sheet, that's fine —
  just note it.
- **Colours only visible in a screenshot.** I can eyedrop them, but an
  eyedropped colour off a compressed PNG is approximately right, and
  approximately right applied to twelve screens looks wrong. The actual hex
  values are better.

---

## PALETTE.md template

```markdown
Primary (deep forest green):  #
Primary dark (pressed):       #
Primary light (tints/chips):  #
Background (warm off-white):  #
Card / surface:               #
Text (ink, near-black):       #
Text muted (secondary):       #
Border / divider:             #
Accent (success, bright):     #

Verified:      #
Needs review:  #
Flagged:       #

Font:          (if Stitch picked one)
Corner radius: (cards / buttons, in px)
```

Anything you don't have, leave blank — I'll keep the current value for it.
