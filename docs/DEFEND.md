# Defend this

One note per subsystem: **what it does · why this choice beat the alternatives ·
where it fails · what we'd do with more time.**

Written for Q&A. Every claim here is either measured or explicitly labelled as a
judgement call.

---

## 1 · The client can never write its own verdict

**What.** `confidence`, `verdict`, `signals`, `phash` and the embeddings are not
granted to `authenticated` at the **column** level. Rows arrive `pending`. Only
the ML service, holding the `service_role` key, can move them.

**Why this over the alternatives.** Row Level Security controls *which rows* you
touch; it cannot stop you writing a particular *column*. Hiding the endpoint
would be security by obscurity - the anon key ships inside the browser and must
be assumed public. Column grants are enforced by Postgres itself, so there is no
application code to get wrong.

**Where it fails.** If the service key leaks, everything falls. It exists only in
the Hugging Face Space's secrets and never in `app/`.

**More time.** Rotate the key per round; sign each verdict so tampering is
detectable after the fact.

> *"The anon key is public - we assume the attacker has it. What stops them is
> that Postgres will not let that key write to those columns."*

---

## 2 · Registration is check-in number one

**What.** `trees` has no photo columns. Registering inserts a tree **and** a
check-in.

**Why.** A tree's evidence is its chain of visits, and the first visit is not
special. One code path means `blur_score`, resize and storage layout mean
exactly the same thing in both flows, so the pilot data is internally
comparable. Two paths would have drifted within a week.

**Where it fails.** A tree can exist with zero check-ins if the second insert
fails. It shows as "not checked yet", which is honest.

---

## 3 · Scoring is a separate, replayable pass

**What.** The app uploads and inserts. Scoring happens afterwards, triggered by
a fire-and-forget call, and `POST /backfill` sweeps anything missed.

**Why.** This is what made T0 safe to run before the ML service existed at all.
It also means **every threshold change can be replayed over the entire pilot
dataset without returning to the field** - the photos are the raw evidence, the
verdict is derived and disposable. Given the four check-in rounds are
calendar-bound and unrepeatable, that property is worth more than any amount of
inference speed.

**Where it fails.** A user watching the check-in screen waits for a cold Space
(~40 s). The UI shows progress and the row stays `pending`, which is the safe
default.

---

## 4 · Two-stage: gates before scores

**What.** Duplicate image, GPS radius and travel speed are **disqualifying**,
run before any scoring. Only then do the four weighted signals run.

**Why.** A duplicate photo is a duplicate photo; no amount of scene similarity
should rescue it. Ordering also means five of the six attacks never reach the
neural network - which is why overall accuracy is far better than the 54% rank-1
of image matching alone.

**Where it fails.** A patient attacker who defeats all three gates gets a real
scoring decision, and that decision rests on a signal we know is weak.

> *"Five of our six fraud types are caught by ordinary deterministic code, not
> by AI. That's the honest reason the system works."*

---

## 5 · Critical floors - the false accept we found and fixed

**What.** A signal that is present and near-zero **vetoes auto-approval** and
routes to a human. It does not flag the visit.

**Why.** Testing the verdict logic against ten designed scenarios - before any
pilot photo existed - showed attack #4, *a different tree at the correct GPS*,
scoring **75/100 and being auto-approved**. Location, liveness and growth were
all perfect and compensated for a `scene_match` of zero. Compensation is right
for a quality score and wrong for a fraud decision.

Floors sit between two measured cases: a genuine dense-stand visit scores ~0.19
and must still auto-approve; a different tree scores 0.00 and must not. Floor at
0.12.

**Where it fails.** Sets a policy that weak evidence means "ask a human", so a
plantation generates more review load than scattered trees. That is the correct
trade and we say so.

**Pinned by** 13 regression tests in `ml/test_scoring.py`, because
`calibrate.py` refits the weights after every round.

See `spike/FINDINGS.md` for the full write-up.

---

## 6 · ORB/RANSAC: built, measured, switched off

**What.** Computed and recorded, but contributes **nothing** to the score.

**Why.** Measured on 287 pairs of real photos:

| | zero inliers | mean | max |
|---|---|---|---|
| Same tree | 63.2% | 1.7 | 8 |
| Different tree | 75.0% | 1.1 | 6 |

The distributions overlap almost entirely. It was adding up to +0.08 of
essentially random confidence - which helps an impostor exactly as readily as a
genuine visit.

**Where it might come back.** The spike had *no framing control*. The ghost
overlay and compass exist to reproduce framing. Re-measure after round 1 against
aligned pairs; switch on only if the distributions separate.

> *"We built a signal, measured it, found it did nothing, and took it out. Most
> teams would have left it in the architecture diagram."*

---

## 7 · Identity is layered, and the tag is not part of it

**What.** GPS narrows candidates → the **person** confirms against the previous
photo → scene match corroborates → embeddings and liveness confirm it is real
and not duplicated. Confidence grows with every consistent visit.

**Why not tags.** Tags fall off. Worse, if a tag *were* identity then moving one
to a healthier tree would **steal that tree**. The app says this on the
registration screen, not just in a slide.

**Why not "AI re-identifies trees".** Because it does not. Measured: rank-1
54.2% against 5% chance, AUC 0.77, and **bimodal** - near-perfect on distinctive
trees, near-zero inside a dense same-species stand.

**Where it fails.** In a uniform plantation the image signal is close to
useless, so those check-ins lean on GPS, liveness and human confirmation.

---

## 8 · The offline queue

**What.** Every registration is written to IndexedDB **before** any network call
and deleted only once the database row exists. Three steps - upload, insert
tree, insert check-in - each recording progress so a retry resumes rather than
restarts.

**Why.** T0 is 40 trees, outdoors, on mobile data, under canopy. Without a
queue, a failure means the tree is simply gone - the photos existed only in a
React state variable and the user has walked on. Losing four of forty is a 10%
hole that cannot be patched, because T0 is a fixed moment in time.

**Why IndexedDB not localStorage.** localStorage stores strings only; two 60 KB
JPEGs would need base64 (+33%) inside a 5 MB quota.

**Why the tree id is recorded mid-flight.** Without it, a retry after step 2
succeeded would insert the tree *twice* - giving one physical tree two rows at
the same point, which is exactly what the "two people registered the same tree"
check is meant to detect. We would have manufactured our own fraud signal.

---

## 9 · Millimetres are computed server-side

**What.** The client stores **where the user tapped** (normalised 0..1). The
server detects the ArUco marker and converts to millimetres.

**Why.** `mm = pixels × (marker_mm / marker_px)`. If the client computed the
width, a forged request could claim any diameter - defeating the "a trunk cannot
shrink" check. Taps are raw observation; millimetres are a derived verification
result, and derived results are service-role only.

**Why ArUco over a coin or a ruler.** Any known object fixes scale. ArUco also
fixes **tilt**: four corners of a known square reveal foreshortening, so we can
tell the measurement is unreliable. A coin photographed at an angle just
silently reports a smaller diameter.

**Verified.** Synthetic scene of known geometry: measured **60.3 mm against a
true 60.0 mm** - 0.3 mm error, from the detector resolving the marker at 199px
instead of 200.

**Where it fails.** No marker in frame → no measurement. The visit still counts;
confidence drops via the coverage term. And **printers lie** - the marker must
be measured with a ruler after printing and `DEFAULT_MARKER_MM` corrected.

**Honest limit.** Trunk diameter barely moves in four weeks. This signal's job
is catching the *impossible* - shrinkage, seedling→mature overnight, growth past
species maxima. **Canopy area** is the signal that moves, and it is the
dying-tree detector.

---

## 10 · Native camera for registration, live camera for check-in

**What.** Registration uses `<input capture>`; check-in uses `getUserMedia`.

**Why both.** The native camera gives autofocus, exposure metering, HDR and full
sensor resolution for free - and a soft close-up wrecks both the blur gate and
the trunk measurement. But it cannot draw on its viewfinder, and the ghost
overlay is the whole point of the check-in screen. Registration has no previous
photo to align against, so it takes the quality; check-in takes the overlay.

**Where it fails.** `getUserMedia` gives a softer frame. If permission is
refused we fall back to the native camera and lose the overlay, not the visit.

---

## 11 · Leave-one-tree-out cross-validation

**What.** Hold out one **tree** entirely, fit on the rest, test on the held-out
tree, repeat, pool.

**Why not leave-one-check-in-out.** Check-ins of the same tree are not
independent - four photos of tree 12 share a trunk, a background and a
neighbourhood. Holding out one check-in leaves its siblings in training and the
model memorises the tree, producing a number that looks excellent and means
nothing.

**The rule.** No threshold is ever tuned on the data used to report performance.
Break it and the headline number is worthless - and a judge who knows statistics
will find it in thirty seconds.

**Where it fails.** With ~40 trees the folds are small and the confidence
interval is wide. We report the interval, not just the point estimate.

---

## 12 · Random audit of auto-approvals

**What.** 10% of *auto-approved* check-ins are pulled into the review queue.

**Why.** Reviewing only the uncertain cases tells you nothing about how often
you were confidently **wrong**. Sampling auto-approvals is the only way to
estimate the **false-accept rate** - and that is the number that matters, since
a wrongly rejected genuine visit is annoying while a wrongly approved fraud is
fatal.

**Where it fails.** 10% of a small pilot is a handful of samples, so the
estimate is loose. Say the sample size out loud.

> *"Nobody in this field publishes their false-accept rate. This queue is where
> ours comes from."*

---

## 13 · Money cannot be written by a client

**What.** `ledger_entries` has **no insert grant** for `authenticated`. Rows
appear only via the `accrue_on_verified` trigger when a check-in reaches
`verified`.

**Why.** The only route to money is passing verification - and verification is
the one thing the client also cannot touch. Two independent locks, both in the
database.

**Payment shape.** GH₵5 on establishment, GH₵2 per verified visit -
deliberately back-loaded. Paying most of the money on planting day is what makes
plant-and-abandon rational, and it is the failure mode of nearly every
reforestation grant.

---

## 14 · Leaderboard ranks survival, not volume

**What.** Default sort is survival rate. "Most trees" is the secondary toggle.

**Why.** Ranking by trees planted rewards planting and ignores keeping alive -
the exact failure this project exists to fix. A volume leaderboard would push
users toward the behaviour we are trying to price out.

---

## 15 · Where we deliberately departed from the design

The interface comes from a Stitch design system ("Forest Guardian", Material 3
tonal palette, Be Vietnam Pro + Work Sans). Four departures, each for a reason
worth stating if asked.

**Landing copy.** The design captioned the hero *"Web3 Verification"* and *"Join
the decentralized network"*. There is no blockchain anywhere in this stack, and
claiming one on the first screen is the first thing a technical judge would pull
at. Layout taken as designed; the words are ours.

**Blur warning, buttons swapped.** The design made *"Use photo anyway"* the
primary action and *"Retake"* secondary. Reversed. A blurry registration photo
degrades every future comparison against that tree and cannot be retaken once
you have walked away - the easy path should be the correct one.

**Material Symbols → inline SVG.** The design loads Google's icon webfont
(~200 KB, over the network). On a phone at a tree with one bar, an icon font
that fails to load leaves every button rendering its raw ligature text
(`account_balance_wallet`) across the screen. Inline SVG is a few hundred bytes
and cannot fail separately from the app. Same for the two text faces, which are
bundled rather than fetched from Google Fonts.

**Register step 1 has no live map.** The design shows a full-bleed map with an
accuracy circle. Leaflet is ~157 KB and registration is the one screen that must
load fast on Ghanaian mobile data at T0, so the map is deferred to its own tab
and step 1 shows the same information - accuracy, verified state,
coordinates - as a card. Revisit after T0 when bundle size stops being on the
critical path.

One thing the design got right that we kept without argument: `on-surface-variant`
is **#404944**, a genuinely dark muted tone at 8.4:1 on the surface. The usual
pale grey for secondary text is unreadable in direct sun, which is the most
common mobile-in-sunlight failure, and this app is used at midday in a field.

---

## Known weaknesses, volunteered

- One site, one season, four weeks, ~40 trees.
- 1–3 year old trees. Fresh seedlings are harder and unmeasured.
- Young bark is smooth; BarkNet's ~94% figures are on **mature** bark.
- Wide-shot matching works partly off the **background**, not the tree.
- A web app cannot fully prevent a gallery upload. The claim is that fraud costs
  more than the payout is worth - not that fraud is impossible.
- Sentinel-2 is 10 m/pixel; 40 young trees do not move NDVI. Grove-scale only,
  displayed separately, never folded into a per-tree score.
- Thresholds are provisional until `calibrate.py` runs on real rounds.
- **TIST already pays per living tree at 265,000 farmers. We are not first.**
- Greenstand has an ML repo - research-stage, not deployed. They are not purely
  manual.
