# How GreenProof verifies a tree

**Read this before [DEFEND.md](DEFEND.md).** This document explains *what every
part is and what it does*. DEFEND.md explains *why each choice beat the
alternatives*, which only makes sense once you know what the parts are.

Written so anyone on the team can answer a judge without having read the code.
Every number here came out of the source, and the file it came from is named at
the end of each section.

| | |
|---|---|
| Model | DINOv2 ViT-S/14 (`onnx-community/dinov2-small`) |
| Runtime | onnxruntime, not PyTorch |
| Embedding | 384 numbers, L2-normalised |
| Version string | `dinov2-small-onnx` / `2026.08.1` |

---

## 1. The problem, in one paragraph

Someone is paid for each tree they plant that stays alive. To pay them we have
to know the tree is real, is the same tree as last time, and is still living.
Doing that with people reviewing photographs works and does not scale. Doing it
with a tag on the tree fails, because tags fall off, and a tag moved to a
healthier tree steals that tree's identity.

So GreenProof treats identity as **accumulated evidence**: a chain of consistent
observations rather than a token. Each visit adds GPS, two photographs, a
compass heading and a timestamp. Confidence in a tree grows with every visit
that agrees with the ones before it.

**The part that is actually novel.** Everyone in this field asserts their
verification works. Nobody publishes how often theirs is wrong. We measure our
own error rate, cross-validate it, and put the number on the slide, including
the parts that look bad.

---

## 2. How the system is built

Three pieces, and only one of them is new.

**A. The app** (React PWA on Vercel). Captures the photos, reads GPS and
compass, resizes images to 800px before upload, and queues everything if there
is no signal. It reads verdicts. It never writes them.

**B. The database and storage** (Supabase: Postgres, PostGIS, Storage). Holds
trees, check-ins, photos, earnings. The app talks to it directly. Row-level
security plus *column-level grants* decide who may write what.

**C. The verification service** (FastAPI + onnxruntime). Takes a check-in ID,
fetches that check-in's photos from storage, runs every detector, and writes
back a confidence, a verdict and a full signal breakdown.

### Why this shape matters

**The app and the service never talk to each other.** Both talk to Supabase.
That means the service can be down for a week and nothing is lost: check-ins
queue as `pending` and get scored whenever it comes back up.

It also means hosting buys exactly one thing, which is scoring a check-in
*live, on stage, while someone watches*. Every other number (the map, the review
queue, every figure in the deck) comes from rows `tools/score_pilot.py` writes
from a laptop.

The service currently runs on a laptop behind a Cloudflare tunnel, because free
container hosting collapsed during the build: Hugging Face, Koyeb and Fly all
closed their free tiers, and Google Cloud billing is blocked on a risk check.

> Files: `app/`, `supabase/migrations/`, `ml/app.py`

---

## 3. The one rule that makes it safe

The app ships with a public key. Anyone can read it out of the JavaScript. So we
assume an attacker has it, and make sure it is not enough.

> **The client can never write its own verification result.**
> `confidence`, `verdict` and `signals` are writable only by the ML service key.
> Rows arrive `pending` and fail safe.

This is enforced in Postgres with column-level `GRANT`s, not in application
code. A forged request cannot claim a verdict, because the key it would have to
use has no permission to write that column. Row-level security controls *which
rows* you touch; it cannot stop you writing a particular *column*. That is why
grants and not policies.

The same applies to money. The ledger is written by a database trigger when a
check-in reaches `verified`, so no client can pay itself, not even the person it
would pay.

> Files: `supabase/migrations/0002_rls_grants.sql`, `0008_lock_anon.sql`,
> `0009_sponsor_role.sql`

---

## 4. The model, explained plainly

We use **DINOv2 ViT-S/14**, a vision transformer published by Meta. We did not
train it and we do not fine-tune it. It is used exactly as published.

What it does is turn a photograph into **384 numbers**. That list is called an
*embedding*, and the useful property is that photographs of similar things end
up with similar numbers. So "do these two photos show the same place?" becomes
ordinary arithmetic: multiply the two lists together and you get a similarity
between -1 and 1.

We normalise every embedding to length 1, which makes that multiplication
exactly the cosine of the angle between them. That is why the code says
`cosine` and does a dot product: they are the same thing once normalised.

| Choice | What we did | Why |
|---|---|---|
| Model | `dinov2-small` | Self-supervised, so it was never taught our task and cannot have memorised our trees |
| Output | 384-dim, L2-normalised | Normalising makes a dot product equal a cosine, so comparison is one multiply |
| Input | 224 x 224 | What the network expects. Photos are resized identically at every stage, so numbers stay comparable |
| Runtime | onnxruntime | PyTorch pulls about 2 GB and would not fit the memory we have. Torch stays a dev-only dependency |
| Where it runs | Server-side only | An embedding computed in the browser is forgeable. Verification never happens on a device the user controls |

**Say this if asked whether we trained a model:** we did not, and that is
deliberate. A model fine-tuned on fifteen plants we photographed ourselves would
memorise those fifteen plants and tell us nothing about the sixteenth.

> File: `ml/greenproof_ml/embed.py`

---

## 5. The pipeline, stage by stage

Two stages, in this order, and the order is the whole design. **Gates are
disqualifying facts. Scores are opinions. A disqualifying fact must never be
outvoted by opinions.**

### Stage 1: gates. Fail one and the visit is flagged, confidence 0.

| Gate | What it does |
|---|---|
| `duplicate_image` | A perceptual hash of the photo, compared against every photo we hold. Differ by **6 bits or fewer** out of 64 and it is the same picture. Re-saving or recompressing moves a hash by 0 to 2 bits, so re-encoding does not evade it. |
| `gps_radius` | How far the check-in is from where the tree was registered. The allowance is **not a flat radius**: 15 m of slack plus the reported accuracy of *both* readings, capped at 60 m. A +/-3 m fix and a +/-18 m fix deserve different tolerances. |
| `travel_speed` | Distance and time since that person's previous check-in. Above **120 km/h** a human did not travel between those two points. Catches one account submitting from two places at once. |

### Stage 1b: review flags. Fail one and it goes to a human, confidence kept.

| Flag | What it does |
|---|---|
| `plant_plausibility` | Is this even a plant? The photo's embedding is compared to a reference set of known plant photos. Below **0.30** cosine it does not look like vegetation. This is what stops someone registering a chair. |
| `proximity` | Two trees registered within **8 m** may be one tree entered twice, which is the double-payment case. Deliberately not a gate: trees really do grow 3 m apart, and phone GPS cannot tell the two situations apart, so the honest response is a human look rather than an accusation. |

### Stage 2: scores. A weighted sum, producing a confidence out of 100.

| Signal | Weight | Shape |
|---|---|---|
| `location` | 0.35 | Full marks within 10 m, nothing at 60 m, ramped in between |
| `liveness` | 0.30 | Fraction of the frame that is vegetation-coloured. Ramps from 0.05 to 0.30 |
| `scene_match` | 0.25 | Embedding similarity to this tree's previous photos. Below 0.35 cosine counts as no evidence, 0.75 is as good as it gets |
| `growth` | 0.10 | Change in canopy area between aligned wide shots |

The weights are **deliberately not equal**. Image matching is the weakest signal
we measured, so it must not dominate. Location and liveness are cheap,
deterministic and reliable, so they carry more.

### Turning the number into a decision

| Verdict | When |
|---|---|
| **Verified** | Confidence **70 or above**, no critical floor breached, and at least half the signals actually available |
| **Needs review** | Confidence **45 to 69**, or any score a critical floor vetoed |
| **Flagged** | Confidence **below 45**, or any gate failed |

### Critical floors: a real bug we found and fixed

A plain weighted sum lets strong signals **compensate** for a failed one. Tested
against "a different tree photographed at the correct GPS", the one attack that
genuinely needs the AI, we got:

```
scene_match 0.00, location 1.00, liveness 1.00, growth 1.00  ->  75/100  ->  VERIFIED
```

The system auto-approved the exact fraud it exists to catch, because scene match
carries only a quarter of the weight and the other three were perfect.
Compensation is correct for a quality score and wrong for a fraud decision.

So a signal that is present and near-zero now **vetoes auto-approval**: liveness
below 0.35, or scene match below 0.12, sends the visit to a human. It does not
flag it, because "this looks wrong but we are not certain" deserves a person and
not an accusation. Confidence is still reported unchanged so the disagreement
stays visible in the data.

> Files: `ml/greenproof_ml/scoring.py`, `ml/greenproof_ml/pipeline.py`

---

## 6. Every signal, and where it fails

The honest framing is **layered identity**, not "AI re-identifies trees". No
single signal is trusted alone, and the weakest one is the AI.

### Perceptual hash (gate)

**Does.** Shrinks the image to 32x32, runs a DCT, keeps the low-frequency 8x8
block, turns it into 64 bits. Similar-looking images get similar bits.

**Catches.** Resubmitting an old photo, including after re-saving it.

**Fails on.** A genuinely new photograph of the same fake scene. It only knows
about images we already stored.

### GPS and travel speed (gates)

**Does.** Compares position to the registered point, with a tolerance built from
both readings' own reported accuracy.

**Catches.** Photographing the right tree from the wrong place; one account
submitting from two places faster than a person could travel.

**Fails on.** Phone GPS under canopy drifts 5 to 15 m. That is wider than the
spacing between neighbouring trees, so GPS narrows the candidates but cannot
pick between them.

### Excess green, "liveness" (0.30)

**Does.** A per-pixel arithmetic index: how much greener a pixel is than it is
red or blue. No model involved. Gives the fraction of the frame that is
vegetation-coloured.

**Catches.** A dead tree, bare ground, a photograph of a wall.

**Fails on.** It measures colour, not life. **A green bedsheet scores 1.00.**
That is measured, not assumed, and it is exactly why plant plausibility exists.

### Scene match, DINOv2 (0.25)

**Does.** Compares this visit's embedding to the tree's previous photographs.
This is the only place the neural network affects the score.

**Catches.** A different tree submitted against this tree's record, at the
correct GPS.

**Fails on.** Our weakest signal, and it is **bimodal**: near-perfect on trees
with distinctive surroundings, near-zero in a dense same-species stand. It also
matches partly on the *background* rather than the tree, which we say out loud
because it is true.

### Plant plausibility (review flag)

**Does.** Reuses the same embedding and asks how close it is to any known plant
photograph. Below 0.30 cosine, it is not a plant.

**Catches.** The chair. In the field on 24 August it caught someone
photographing a laptop screen: plant similarity 0.224, liveness 0.06, scene
match 0.00. Three independent signals agreed.

**Fails on.** The reference set is small. It improves on its own as the system
runs, because every verified check-in is another known-good plant photograph.

### Growth plausibility (0.10)

**Does.** Trunk diameter from an ArUco marker in frame, a printed card of known
size that gives millimetres-per-pixel and corrects for camera tilt using its
four known corners. The user taps the two trunk edges, deliberately not
automatic, because edge detection against messy backgrounds is unreliable.
Measured at 1.3 m, the global forestry standard for diameter at breast height.

**Catches.** The impossible: shrinkage, a seedling becoming mature overnight,
growth beyond a species maximum.

**Fails on.** Trunk diameter barely moves in four weeks, so it will not confirm
healthy growth on our timescale. Canopy area from aligned wide shots is the
signal that does move, and it is the dying-tree detector.

### ORB / RANSAC keypoints (built, measured, disabled)

**Does.** Classical computer vision: find repeatable corner features in two
images, check whether a consistent geometry maps one to the other.

**Why it is off.** Measured on 287 photo pairs from the spike:

| | zero inliers | mean | max |
|---|---|---|---|
| Same tree | 63.2% | 1.7 | 8 |
| Different tree | 75.0% | 1.1 | 6 |

The distributions overlap almost entirely. Leaving it in the score would have
added up to +0.08 of essentially random confidence, which helps an impostor as
readily as a genuine visit.

It is still **computed and recorded** in `signals` but contributes 0, so the
decision can be revisited once framing-controlled photos exist. The ghost
overlay and compass heading exist precisely to reproduce framing.

> Files: `ml/greenproof_ml/signals.py`, `spike/FINDINGS.md`

---

## 7. The numbers we can defend

Measured on 15 plants we photographed ourselves, then re-measured on real pilot
data. These are ours, not a paper's.

| Measurement | Result | What it means |
|---|---|---|
| Rank-1 retrieval | **54.2%** (chance 5.1%) | Given a photo, the correct tree comes back first just over half the time. Ten times better than chance, so real signal |
| Rank-3 retrieval | 74.6% | |
| Rank-5 retrieval | 89.8% | The right tree is in the top five almost always. Good enough to narrow a shortlist for a person |
| Pooled AUC | **0.77** | Same-tree and different-tree similarity distributions overlap a lot. Nowhere near enough to authorise a payment on its own |
| Plant plausibility AUC | **0.966** | Real pilot photos against 300 ordinary photographs. At threshold 0.30: 1 check-in in 9 goes to a human, about 99% of non-plants rejected |
| ORB separation | none | Measured, found useless, disabled |

**Say this before anyone asks.** Rank-1 is **bimodal**. Five of the fifteen
trees scored 100%, four scored 0%. It is not uniformly mediocre. It is excellent
on distinctive trees and useless in a dense same-species stand. Averaging those
into "54%" hides the thing that actually matters about the signal.

**Why the system works anyway.** Five of the six fraud types in the attack set
are caught by **deterministic checks, not by AI**: duplicate photo, wrong GPS,
impossible travel speed, non-plant, duplicate registration. The AI does the one
job the deterministic checks cannot, which is telling two different trees apart
at the same location. That is the honest reason a 54% signal is enough.

Accuracy is measured with **leave-one-tree-out cross-validation**, so thresholds
are never tuned on the data used to report performance. The weights above are
provisional informed guesses that let the pipeline run from day one, and are
replaced by fitted weights once enough check-in rounds exist.

> Files: `spike/FINDINGS.md`, `docs/plant_check_validation.json`,
> `docs/attack_results.json`, `ml/calibrate.py`

---

## 7b. Care advice, and why it is not a signal

Everything above this point decides whether to *believe* a planter. None of it
helps them keep the tree alive. That gap is the one Ghana's Auditor-General
named in the same report we open the pitch with:

> **"No funding allocated for post-planting care at all."**

So a check-in now also produces two advisory outputs: **what species the tree
appears to be**, and **what condition it is in and what to do about it**, written
in plain language for the person standing in front of it. Both come from one
call to **Claude Opus 5** with the visit's photographs.

### It is advisory, and the separation is structural

> **Advice never touches `confidence`, `verdict` or `signals`.**

That is not a promise in a comment. It is enforced in four places:

| Where | How |
|---|---|
| Schema | Its own `species_guess` / `advice` columns, **not** inside `signals` — which is replaced wholesale on every re-score, and is what once destroyed our attack-row provenance |
| Grants | Service-role only, exactly like `confidence`. The client is granted the leaf photo and nothing else |
| Imports | `pipeline.py` never imports `advisor.py`, so no slow or wrong advisory call can reach a verdict. `grep -rn "advisor" ml/greenproof_ml/pipeline.py` must stay empty |
| UI | A separate card under its own heading, visually unlike the score, footed "Powered by Claude" |

**Why so much care about a helpful feature.** This project's entire claim is that
we measure and publish our own error rate. We cannot publish one for this — there
is no agronomist-labelled ground truth for our trees. A component we cannot
measure therefore must not be able to move a number we report, and the honest
way to hold that line is to make it impossible rather than discouraged.

### Why not a disease classifier

The obvious build is a CNN trained on PlantVillage. We rejected it, and the first
reason is disqualifying:

1. **PlantVillage is single leaves on uniform lab backgrounds.** Published
   cross-domain results collapse from ~99% to roughly 30-50% on real field
   photographs. **We have already made this exact mistake once** — the plant
   check that scored a perfect AUC of 1.000 and then flagged five of nine real
   check-ins, because it had learned photo *style* rather than subject (§8.2).
   Shipping it would be repeating a documented lesson.
2. **It covers fourteen crops** — tomato, potato, corn, grape. None of them Odum,
   Wawa, Ofram or Ceiba.
3. **We could not publish its error rate**, which is the one thing we claim.

An LLM's output is hedged natural language a person reads and judges, not a
number that authorises a payment — so it clears a much lower bar.

The `limitations` field is **required and stored**, though not shown on the tree
page: forcing the model to state what it could not see measurably reduces
overconfident claims in the rest of the answer, and it is there in the data for
the review queue and for Q&A. A paragraph of caveats on every card is noise to
someone standing in front of a tree.

### The leaf photo

Species identification and health assessment both want foliage, and our two
scored photos are a whole tree and a trunk. So every visit now captures a third
photograph of a single leaf, as its own step in both capture flows.

**Required to capture, never scored.** Those sit together deliberately. It is
required because advice from a leaf is much better than advice from a piece of
bark — species identification especially. It is not scored because it is
advisory: no verdict, confidence or payment moves because of what is in it.

**Required to capture, tolerant on upload.** Once the photo has been taken the
planter has done what was asked, so a failed upload of an advisory photo must not
cost them the visit and the payment behind it. It uploads last and its failure is
swallowed — degrade, don't break.

`checkins.leaf_photo` is **nullable** regardless, because the nine pilot
check-ins predate the column and a `NOT NULL` would have failed the migration
outright. The requirement lives in the capture flow, which is the only place that
can enforce it without invalidating data already collected — and it is why the
assessment still works on **every pilot row**, sending whatever photographs are
present.

### What it costs, and when we spend it

About **3 cents a check-in**. The designed production policy is to call it only
when the deterministic canopy signal already shows decline, which is a
`ADVISE_ON_EVERY_CHECKIN` constant away:

| Policy | One million trees, four visits a year |
|---|---|
| Every visit | ~$120k |
| On detected decline only | ~$6-12k |

It currently runs on every check-in, because at 6 trees and 9 check-ins most
visits are the first — where the growth score is a neutral 0.5 and a
decline-only trigger would fire zero times.

> Files: `ml/greenproof_ml/advisor.py`, `supabase/migrations/0011_advice.sql`,
> `tools/advise_pilot.py`

---

## 8. Three times our own tests lied to us

This is not an apology. The project's central claim is a system that knows and
publishes its own error rate, and this is that claim actually happening, with
the fixes in the commit log. It is far stronger evidence than asserting it on a
slide.

**1. The attack set reported "caught" without testing anything.** Two attacks
were designed to evade the duplicate gate by re-encoding a stored photo. But we
had already measured that re-encoding moves a pHash by 0 to 2 bits against a
threshold of 6, so the gate caught them every time and the AI and proximity
checks were never exercised. A passing test that never reached the code it was
testing is worse than no test. Fixed by using genuinely unseen photographs.

**2. The plant check scored a perfect AUC of 1.000.** Using a public plant
dataset as the reference, separation looked perfect. Applied to our own real
check-ins, that same threshold flagged **five of nine as "not a plant"**. The
reference images were cropped specimens; ours are wide shots with sky and
buildings in frame. It had learned photo *style*, not subject. **An AUC of 1.000
is a warning, not a result.** Re-measured honestly against unseen trees: 0.966.

**3. Scoring destroyed the evidence that a row was a test.** Writing a result
replaced the signal breakdown wholesale, which erased the tag marking injected
attack rows as synthetic. Six fake check-ins became indistinguishable from real
pilot data in our own database. Provenance has to survive every write: if you
cannot tell your test data from your real data, every number you report is
suspect.

---

## 9. Hard questions, short answers

**"Can't someone just upload a photo from their gallery?"**
A web app cannot fully prevent that. Our claim is not that fraud is impossible,
it is that fraud costs more effort than the payout is worth. You would need a
new photograph, at the right GPS, of a real plant, resembling that tree's
history, within a plausible travel time.

**"Is this AI recognising individual trees?"**
No, and we do not claim it. GPS narrows the candidates, the planter confirms
against the previous photo, scene match corroborates, and liveness and duplicate
checks confirm it is real and not reused. Confidence grows with every consistent
visit.

**"Isn't bark recognition solved?"**
On mature bark, largely. Published figures around 94% are on **mature** trees.
Young bark is smooth and far less distinctive, and young trees are exactly what
a planting scheme produces.

**"Are you the first to pay per living tree?"**
No. TIST already does it at 265,000 farmers. We are not first, and saying
otherwise would be the easiest thing for a judge to check.

**"What about satellites?"**
Sentinel-2 is 10 m per pixel. Forty young trees do not move it. We show NDVI as
a grove-scale trend, displayed separately, and it is never folded into a
per-tree score.

**"What happens when a signal is missing?"**
Confidence drops and a human reviews it. The system is designed to degrade, not
to break, and auto-approval requires at least half the signal set to have
actually been available.

**"Does Greenstand not already do this?"**
Greenstand uses human verification and has an ML repository that is
research-stage, not deployed. Do not claim they are purely manual.

---

## 10. Where to look in the code

| You want | Look at |
|---|---|
| Every threshold, with the reasoning beside it | `ml/greenproof_ml/scoring.py` |
| The detectors themselves | `ml/greenproof_ml/signals.py` |
| The model and preprocessing | `ml/greenproof_ml/embed.py` |
| The order things run in | `ml/greenproof_ml/pipeline.py` |
| Image-matching measurements | `spike/FINDINGS.md` |
| The fraud tests | `ml/attack_set.py` |
| Cross-validation | `ml/calibrate.py` |
| Why each choice beat the alternatives | [DEFEND.md](DEFEND.md) |
| Bringing the live demo up | [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md) |

The per-signal breakdown is stored as `signals jsonb` on every check-in and is
never collapsed into a single number. It is the debugging tool, the Q&A teaching
aid, and what drives the progressive reveal in the app.
