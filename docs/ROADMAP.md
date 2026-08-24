# GreenProof - Roadmap

**Today 28 July · Pitch 26 August · 29 days**

The single source of truth for what gets built, when, and what number it produces.

---

## The one thing to keep straight

**We are not selling an image-matching model. We are selling an automated
verification system.**

Those have very different accuracy numbers:

| | |
|---|---|
| Image matching alone | 54% (measured) - modest |
| The whole system | 90%+ expected - because five of six fraud types never reach the AI |

Greenstand pays a human to look at every photo. We don't. **That** is the
product, and it works whether or not the AI is brilliant.

---

## What actually catches fraud

| Attack | Caught by | Depends on AI? |
|---|---|---|
| Resubmit an identical photo | duplicate check (pHash) | No |
| Photo pulled from the internet | duplicate + GPS | No |
| Right tree, wrong location | GPS distance check | No |
| Dead brown stick | liveness (green fraction) | No |
| Old gallery photo of that tree | duplicate check | No |
| **Different tree, same spot** | **image matching** | **Yes - the only one** |

Deterministic checks do the heavy lifting. The AI covers the residual case.
Say this on stage; it is the honest reason the system works.

---

## Measuring trees - the growth plausibility signal

A photo has no scale: a thin trunk close up looks like a thick trunk far away.
Fix scale and this signal becomes real rather than a hand-wave.

### How we do it in the pilot

**One printed ArUco marker (~80mm), reused for all 40 trees.** Not a tag on a
tree - one card in the surveyor's pocket. OpenCV detects ArUco instantly and it
solves two problems at once:

- **scale** - the square's real width is known, so we get millimetres per pixel
- **tilt** - four corners in a known square let us correct for photographing at
  an angle. A plain card cannot do this.

Then **tap the two edges of the trunk on screen** → width in millimetres.
Deliberately not automatic: finding trunk edges against a messy background is
unreliable, and two taps take two seconds. It is still a real measurement.

Measure at **1.3 m from the ground** - that is *diameter at breast height*, the
standard every forestry dataset in the world uses.

### The validation that makes this worth doing

**Bring a tape measure to T0 and physically measure ~20 trunks.** Compare against
what the photo method produced.

> *"We measure trunk diameter in millimetres from a phone photo using a printed
> reference marker. On 20 trees we validated against tape measurements and agreed
> to within X mm."*

Real metrology, independently checked, from our own field data. About an hour of
work at T0. No other team will have this.

### Be honest about four weeks

Trunk diameter barely moves in a month on a 1–3 year old tree. **We will not
demonstrate growth.** So the signal's job is catching the impossible:

- a trunk that **shrank**
- a seedling that became a mature tree (someone swapped trees)
- growth beyond any species' physical maximum

### Canopy area - the signal that actually moves

**How much green the tree occupies in the wide shot.** Unlike trunk width, this
changes in weeks - a stressed tree drops leaves, and July–August is the rainy
season so healthy trees are putting on leaf.

Framing is controlled by GPS + compass heading + ghost overlay, and we align the
two photos on the static background before measuring.

**This is the dying-tree detector**, and it is why the pilot deliberately
includes 5–8 struggling trees. One visible decline across four rounds is a real
detection to show on stage.

### How this scales after the pilot

The measurement technique changes; **the loop does not**.

| Stage | How trunk width is measured |
|---|---|
| Pilot (now) | printed ArUco marker + tap two points |
| Soon | any object people already carry - ID card (85.6 mm worldwide) or a banknote |
| Production | **no object at all** - ARCore depth sensing in a native app |

**And in production you do not measure every tree.** Every tree gets a photo
check every visit (survival, payment, fraud). Only a **sample** gets physically
measured, quarterly - which is how forest inventory has always worked and what
carbon standards require.

### Measuring a whole grove - three layers

| Layer | What it gives | Who else has it |
|---|---|---|
| **Per-tree photos** | survival · payment attribution · fraud | **nobody - this is ours** |
| **Sample plots** | trunk/height → biomass estimates | industry standard |
| **Satellite** | grove-level canopy and greening trend | Sentinel-2 free at 10 m - too coarse for one tree, fine for a grove |

**Worth investigating: [Planet NICFI](https://www.planet.com/nicfi/).** Funded by Norway's
International Climate & Forest Initiative, it provides **free high-resolution satellite imagery
of the tropics** - Ghana included - at roughly 4–5 m, versus Sentinel-2's 10 m. Monthly mosaics,
free for non-commercial monitoring use. Sharp enough to see canopy structure rather than just a
greenness average, which would make the grove-level layer considerably more convincing. Check
the licence terms before putting it in a slide.

**Each layer cross-checks the others.** If per-tree reports claim 90% survival
but the satellite shows no greening, something is wrong. Sampling can tell you
87% survived; it cannot tell you *whose* trees survived, so it cannot pay anyone.
That gap is the reason layer 1 exists.

---

## What we measure, and why

**Two numbers, both reported.** Reporting only the second looks like moving the
goalposts; reporting only the first understates the product.

1. **Open identification** - "find the tree among all of them." The hard
   academic framing. Currently 54% vs 5% chance.
2. **GPS-scoped verification** - "the user claims tree #7 and is standing 3m
   from it; is this consistent?" What the app actually does.

**Plus the three that matter commercially:**

- fraud attempts caught
- genuine check-ins auto-approved
- genuine check-ins wrongly rejected (annoying) vs fraud wrongly approved (fatal)

**Thresholds are chosen by leave-one-tree-out cross-validation** - hold out one
tree, fit on the rest, test on the held-out one, repeat. Never tune and report on
the same data.

---

## The attack set - design this deliberately

Six types, several attempts each, run against the live system in week 3 and
reported as a plain table.

| # | Attack | Expected catcher |
|---|---|---|
| 1 | Resubmit an identical photo | duplicate gate |
| 2 | Internet photo of the same species | duplicate + GPS |
| 3 | Correct tree photographed from the wrong place | GPS gate |
| 4 | A different tree at the correct GPS | image matching |
| 5 | A dead/brown plant | liveness |
| 6 | Two people registering the same physical tree | proximity check |

One of these gets performed **live on stage**.

---

## Week by week

### Week 1 · 28 Jul – 3 Aug - capture path

**Build:** Supabase project + schema · email sign-in · register a tree (wide +
close-up, GPS, compass heading, blur check, 800px resize) · My Grove list ·
deploy to Vercel.

**Pilot:** pick the site · mark trees for your own navigation · lock the four
check-in dates · **print one ArUco marker (~80 mm, laminated)** · **bring a tape
measure to T0 and record trunk width for ~20 trees**.

**Done when:** you can register a tree on your phone, standing outside, and see
it in a list.

> **~31 Jul - T0. Register ~40 trees.** Site needs ≥15 of one species near each
> other, and 5–8 visibly struggling trees.

### Week 2 · 4 – 10 Aug - the verification engine

**Build:** ML service on Hugging Face Spaces (DINOv2 via onnxruntime) ·
embeddings · duplicate detection · GPS + travel gates · liveness · confidence
score · check-in flow with **ghost overlay + "face this way"** · **ArUco
detection + tap-to-measure trunk width** · **canopy area from aligned wide
shots** · plausibility bounds (shrinkage, impossible jumps).

**Validate:** photo-derived trunk widths vs the T0 tape measurements.

**Measure:** score all T0 data. Test DINOv2-base against small. Run the
GPS-scoped metric for the first time.

**Done when:** a check-in produces a score and a verdict, live.

> **~7 Aug - Check-in round 1**

### Week 3 · 11 – 17 Aug - proving it

**Build:** "why this score" breakdown · progressive signal reveal · review queue
· live map.

**Measure:** build and run the **full attack set**. Fit signal weights by
logistic regression with leave-one-tree-out cross-validation. Produce the real
numbers.

**Done when:** you can state the fraud-catch rate and auto-approve rate from your
own data.

> **~14 Aug - Check-in round 2**
> **CUT-LINE 17 Aug** - if register→check-in→score→map isn't solid, drop MoMo and
> NDVI and spend the rest on pilot and rehearsal.

### Week 4 · 18 – 24 Aug - the rest of the story

**Build:** sponsor dashboard (trees, % alive, survival curve) · wallet · MoMo
sandbox behind a mock adapter · NDVI for the plot · random audits of
auto-approvals · **leaderboards** (schools/churches/communities - promised in the
submitted description, and it is a sorted query, about an hour).

> **~21 Aug - Check-in round 3**

### Week 5 · 25 – 26 Aug - stage

**~25 Aug - Check-in round 4.** The freshest number you quote.

Rehearsals against the offline fallback, wifi off, twice. Backup video. Mock Q&A.
Finish at 18–19 minutes, never 20.

> **26 Aug - Pitch**

---

## What you should be able to say on the day

> *"We registered 40 real trees on 31 July and checked them four times over four
> weeks - 160 check-ins. We also ran 20 deliberate fraud attempts across six
> types. The system caught 19 of 20, auto-approved 85% of genuine visits, and
> wrongly approved none. Those thresholds were cross-validated, so no tree
> influenced the threshold it was tested against."*

And the limits, volunteered before anyone asks:

- one site, one season, four weeks
- 1–3 year old trees; fresh seedlings are harder and unmeasured
- image matching alone is 54% - real signal, not identity. Tag-free by design.

---

## The actual scoring rubric

| Criterion | Points | Estimate now | Target |
|---|---|---|---|
| **Innovation & Originality** | **30** | 19–21 | **24** |
| Impact & sustainability | 25 | 19–21 | 22 |
| Technical soundness & feasibility | 20 | 16–17 | 18 |
| Scalability | 15 | 11–12 | 13 |
| Clarity of presentation | 10 | 8 | 9 |
| **Total** | **100** | **73–79** | **~86** |

**Innovation is worth more than anything else and is where we are weakest.** We
have spent most effort on Technical Soundness, which is a 20-point box we were
always going to score well in. Rebalance.

### Where the originality actually is

The components are not novel - DINOv2 is off the shelf, GPS is GPS. But **nobody
in this field builds a verification system that knows and proves its own error
rate.** Greenstand has humans check photos. TIST has humans count trees. veritree
fuses satellite and drone. All of them *assert* their verification works. None
publish how often it is wrong.

Four things to build and say, all true of what we are building anyway:

1. **Identity as accumulated evidence** - not a tag or a fingerprint, but a chain
   of consistent observations that strengthens with every visit. A tree with four
   consistent check-ins is far harder to fake than one registration photo.
2. **A system that tests itself continuously** - periodically inject known-bad
   check-ins to confirm the detectors still fire. Standard in payments and
   security; essentially unheard of in impact verification. About a day's work
   and the most original item here.
3. **Publishing our own false-accept rate** - measured, cross-validated, stated
   out loud. Turns honesty from a defensive posture into a contribution.
4. **Designed to degrade, not break** - tag gone, GPS poor, photo blurry: lower
   the confidence and route to a human rather than failing.

**The line:** *"We didn't build a tree classifier. We built a verification system
that measures its own reliability, tests itself continuously, and degrades
safely - and we're the first to do that for reforestation."*

### Cheap points elsewhere

- **Impact (25):** cover *financial* sustainability explicitly, not just
  environmental. Judges want to know it survives without grant money.
- **Scalability (15):** put two numbers on a slide - Greenstand needs 100,000
  human reviews for 100,000 trees; we need ~5,000.
- **Clarity (10):** cheapest points on the board. Rehearse to 18 minutes, backup
  video, one named owner per likely question.

### On the submitted description

**Do not change the idea.** The submitted text already says the right thing -
*"no single signal is trusted alone"* is layered identity, and *"humans manually
reviewing photos, which cannot scale"* is the automation argument. Refine
execution, add rigour, keep the concept. Judges reward iteration; they punish
bait-and-switch.

Keep all four signals, keep the leaderboards promise, keep "AI-verified tree
ownership" as the headline - the theme is *Innovate with AI*, so burying the AI
would cost points on the biggest criterion.

---

## Blocking right now

1. **Supabase project** - 15 minutes, only you can do it
2. **Plain screens now, or wait for Stitch?** - decides whether T0 lands 31 Jul
   (four rounds) or ~5 Aug (three rounds). Worth roughly half a point.
