# Palette

Fill in whatever Stitch gives you. Leave the rest blank — anything blank keeps
its current value, so a half-filled file is still useful.

These map directly onto the `@theme` block in
[`app/src/index.css`](../../app/src/index.css). Filling this in restyles all
twelve screens at once.

```
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

Font:          
Corner radius: 
```

---

## Current placeholder values

What the app uses right now, so you can see what each one actually controls:

| Token | Now | Controls |
|---|---|---|
| Primary | `#1c5531` | buttons, active tab, progress bar, verified chip |
| Primary dark | `#174327` | pressed state |
| Primary light | `#dcefdf` | chip backgrounds, secondary buttons, stat tiles |
| Background | `#faf8f3` | page background |
| Card | `#ffffff` | cards, inputs, tab bar |
| Ink | `#16160f` | body text |
| Muted | `#52514a` | secondary text |
| Border | `#e2ded2` | dividers, input borders |
| Accent | `#7fd162` | success highlights, measurement line |
| Verified | `#1c5531` | verdict card, status chip |
| Needs review | `#a15c07` | verdict card, overdue check-ins, pending banner |
| Flagged | `#b3261e` | verdict card, failed checks, reject button |

**One constraint worth keeping.** Muted text is deliberately dark — 7.1:1
against the background. The usual `#9ca3af` grey is unreadable in direct sun,
which is the single most common mobile-in-sunlight failure and this app is used
standing in a field at midday. If Stitch hands back a pale grey for secondary
text, I'll darken it and say so.
