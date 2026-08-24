# GreenProof - Team Brief

**Final: 26 August 2026. Today: 28 July. 29 days.**

---

## Where we stand

The final is a **20-minute pitch with a live demo**, and judges ask deep
technical questions. Everyone needs to be able to answer without deferring.

**How we're scored:**

| Criterion | Points |
|---|---|
| Innovation & Originality | **30** |
| Impact & sustainability | 25 |
| Technical soundness & feasibility | 20 |
| Scalability | 15 |
| Clarity of presentation | 10 |

Innovation is worth the most. Keep that in mind for everything below.

---

## What we're building

An app where someone photographs a tree, and software decides whether to believe them.

They register a tree with two photos and their location. Weeks later they photograph it again.
The system checks it's the right place, the plant is alive, and the photo hasn't been used
before. Trees that keep passing earn money, paid by sponsors who get a dashboard proving how
many of their trees survived.

**Four checks run on every visit:**

1. **Same tree?** - photos are turned into number-fingerprints and compared
2. **Alive?** - is there living green foliage
3. **Honest?** - right place, and has this photo been submitted before
4. **Greening?** - free satellite imagery on the wider area

No single check is trusted alone. That's the whole design.

---

## What we learned this week (important)

We tested whether AI can recognise an individual tree from a photo. We photographed 15 plants
and measured it.

**Result: it gets the right plant 54% of the time, where random guessing gets 5%.**

So there's real signal - ten times better than chance - but it's wrong nearly half the time.
Nowhere near good enough to pay someone based on it alone.

**It also failed in a specific way:** near-perfect on trees with distinctive surroundings,
near-zero on plants packed together in a dense patch of the same species.

### What this changes

**Identity doesn't come from the AI.** It comes from GPS plus the person confirming against
last month's photo. The AI's job is confirming the tree is alive, in the right place, and not
a copied photo.

**And here's the thing - that's fine.** Five of our six fraud checks don't involve AI at all.
Duplicate photo detection, GPS distance and liveness catch almost everything. The AI only
covers "someone photographed a different tree from the same spot."

**We're not hiding this. We're leading with it.** Most teams will claim their AI works and have
nothing to back it up. We tested ours, found the limit, and designed around it. That's a
stronger position, and it's worth real points on Innovation.

---

## No tags on trees

We considered numbering every tree. We're not going to.

Tags fall off, they damage young trunks, and they cost real money at scale. Worst of all: **if
a tag is the identity, then moving a tag to a healthier tree steals that tree.** The forestry
literature lists lost tags as a known problem with this approach.

Instead: GPS finds the nearby trees, the app shows you the previous photo, and you confirm.

**You can still mark trees however you like for your own navigation** - a dab of paint, a
ribbon. That's so you can find the same 40 trees four times in a hurry. The app doesn't read it.

---

## The pilot - the most important work

**We register ~40 real trees around 31 July, then re-photograph them four times before the
final.**

This is what gives us a sentence no other team will have, and it's how we measure whether the
software works.

### What we need at the site

- **~40 established young trees** (1–3 years old, not fresh seedlings)
- **At least 15 of the same kind, standing near each other** - this matters more than the total.
  Telling a mango from a palm proves nothing. Telling two mangoes apart is the real test.
- **5–8 visibly struggling trees** - if any decline, that's a real detection to show on stage
- Somewhere we can return to easily, four more times

**No permission is needed to photograph on campus**, which is why T0 moved earlier and we get
four rounds instead of three.

### Photographing a tree - two photos

1. **Wide shot** - the tree and its surroundings
2. **Close-up** - the trunk

The app records GPS, the time, and which direction you were facing.

About two hours per round for 40 trees.

### Two extra things to bring

**One printed marker card** (a black-and-white square, ~8cm). Hold it beside the trunk in the
close-up. It lets the software work out real sizes from the photo - a photo alone has no scale.
**One card for all 40 trees.** Nothing gets attached to any tree.

**A tape measure, at T0 only.** We physically measure ~20 trunks so we can check the software's
measurements against reality. That takes about an hour and it's what lets us say *"we validated
our measurements against a tape measure"* instead of just claiming it works.

---

## Who does what

**Developer** - building the software. Capture app, verification engine, dashboards, measurement.

**Pilot lead** - pick the site, print the marker card, organise all four check-in rounds.
This is the critical path: rounds can't be rushed, four rounds needs four real weeks.

**Partnerships** - nursery and Forestry Commission contact. Also check the current government
wording: it's now the **Tree for Life Reforestation Initiative**, not just Green Ghana Day.
Citing the old name in August 2026 will look out of date.

**Pitch** - the 20-minute script, slides, backup video, rehearsals.

**Everyone** - claim one technical question from §9 of the context doc and own it. **This week,
not the last week.**

---

## Dates - commit to these now

| When | What |
|---|---|
| This week | Site picked · marker printed · app built |
| **~31 Jul** | **T0 - register ~40 trees** (bring the tape measure) |
| **~7 Aug** | Check-in round 1 |
| **~14 Aug** | Check-in round 2 |
| **~21 Aug** | Check-in round 3 |
| **~25 Aug** | Check-in round 4 |
| 23–25 Aug | Rehearsals, backup video, mock Q&A |
| **26 Aug** | **Final** |

Two hours per round. Please put them in your calendar now - a round we miss is a round we can
never get back.

---

## The demo

We bring a potted plant on stage.

**Minute 3** - register it live. GPS fires, a pin drops on the map.

**Minute 12** - come back, photograph it again from a different angle. The four checks resolve
one at a time on screen and the score builds as they land.

**Then the pilot data** - 40 real trees, four rounds, over four weeks.

**Then we break it on purpose** - try to check in a *different* plant and let the system reject
it, live. Anyone planning to ask about fraud has now watched it refuse something.

We'll also bring a **dead plant** and check it in, so the liveness check fails visibly.

---

## What we need this week

1. **Site picked** - everything downstream waits on it
2. **Marker card printed**, tape measure sorted
3. **Four dates in everyone's calendar**
4. **Everyone claims a technical question**
