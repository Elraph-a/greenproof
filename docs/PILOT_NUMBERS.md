# The pilot, in numbers

**Everything here comes from rows in the database on 26 August 2026.** Nothing is
projected, rounded up, or borrowed from a paper. Where a number looks bad it is
printed anyway, because a measured number that flatters us is worth nothing if
the unflattering ones are hidden.

---

## 1. What we photographed

| | |
|---|---|
| Trees registered | **35** |
| Visits to those trees | **44** |
| Photographs taken | **94** |

Every visit captures a **wide shot** of the whole tree and a **close-up of the
trunk** — both scored. Six visits also carry a **leaf photograph**, which is
never scored and feeds only the care advice.

| Photograph | Count | Scored? |
|---|---|---|
| Wide | 44 | yes |
| Close-up | 44 | yes |
| Leaf | 6 | **no** — advisory only |

> **The honest note on 44 rather than 71.** The database holds 71 check-in rows.
> Twenty-seven are byte-identical repeats produced by a bug in our own
> registration screen on the night of 26 August: a successful registration
> returned to the wrong screen, so the button was pressed again, and again.
>
> We quote **44**. The repeats are excluded because they are the same
> photograph submitted more than once, not evidence of anything.
>
> They were caught by our own duplicate gate, which is the point.

---

## 2. What the system decided

| Verdict | Count | Share |
|---|---|---|
| **Verified** — paid automatically | **25** | **57%** |
| Needs review — a human looks | 12 | 27% |
| Flagged — disqualified | 7 | 16% |

Mean confidence **72 / 100**, spanning the full range 0–100.

### Why each non-verified visit landed there

This is the part worth showing, because it says which component did the work.

**Disqualifying gate failures — no AI involved:**

| Gate | Count |
|---|---|
| Duplicate image (pHash) | 5 |
| GPS radius | 1 |

**Review flags — a person is asked, not accused:**

| Flag | Count |
|---|---|
| Duplicate registration (proximity) | 12 |
| Plant plausibility | 4 |

**Every single one was caught by deterministic code.** Not one non-verified
visit in this pilot required the neural network. That is the honest reason the
system works, and it is why the AI's weakness does not sink it.

---

## 3. What the model can and cannot do

Measured on 15 plants we photographed ourselves, 59 photographs.

| Measurement | Result | Read |
|---|---|---|
| **Rank-1 retrieval** | **54.2%** (chance 5.1%) | Ten times better than chance. Real signal |
| Rank-3 retrieval | 74.6% | |
| Rank-5 retrieval | 89.8% | Good enough to shortlist for a human |
| **Pooled AUC** | **0.77** | Distributions overlap far too much to authorise a payment |
| Mean cosine, same tree | 0.622 | |
| Mean cosine, different tree | 0.409 | |

**Say the weakness first: rank-1 is bimodal.** Five of fifteen trees scored
100%, four scored 0%. Excellent on distinctive trees, useless inside a dense
same-species stand. Averaging those to "54%" hides the only interesting thing
about the signal.

**ORB / RANSAC keypoint matching: built, measured, switched off.** Across 287
photo pairs the same-tree and different-tree distributions overlapped almost
entirely (63.2% vs 75.0% zero-inlier rate). It was contributing up to +0.08 of
essentially random confidence, which helps an impostor as readily as a genuine
visit. It is still computed and recorded, and contributes nothing.

**Duplicate detection (pHash).** Zero of 42 genuine same-tree pairs wrongly
flagged; a re-encoded copy still scores 0 bits of difference. The strongest and
cheapest signal in the system.

**Trunk measurement.** 60.3 mm against a true 60.0 mm on known geometry.

---

## 4. Attacking our own system

Seven deliberate fraud attempts, run against the live system.

| # | Attack | Verdict | Caught by |
|---|---|---|---|
| 1 | Resubmit an identical photo | flagged | duplicate gate |
| 2 | Internet photo of the same species | review | image matching |
| 3 | Correct tree, wrong place | flagged | GPS gate |
| 4 | Different tree at the correct GPS | review | image matching |
| 5 | Dead or brown plant | flagged | liveness |
| 6 | Impossible travel | flagged | travel-speed gate |
| 7 | Same tree registered twice | review | proximity |

**7 of 7 caught. 0 auto-approved.** Five of the seven never reached the neural
network at all.

---

## 5. What the advisory layer found

Species identification and care advice, from the same photographs, using Gemini.
**Advisory only** — it cannot move a confidence, a verdict or a payment.

| | |
|---|---|
| Visits assessed | **36 of 44** |
| Species identified | **26 of 36** (72%) |

| Condition reported | Count |
|---|---|
| Healthy | 30 |
| Cannot tell from the photographs | 4 |
| Stressed | 2 |

**Species named:** Manila Palm (4), African Mahogany (3), Ofram (2), Areca Palm
(2), Avocado (2), Mango (2), Papaya (2), Odum, Cassia, Plantain, Crown of Thorns.

**It says when it cannot tell.** Four assessments returned "cannot tell" with
self-reported confidence as low as 0.1 rather than inventing a species. One of
them described its subject as *"a green jointed stem segment held in hand
indoors — no leaves, canopy, base or soil visible"*, which is exactly what that
photograph was.

---

## 6. Two things we found by running this on ourselves

### We paid ourselves twice for one tree

Our duplicate-registration check flagged a cluster of trees registered within a
few metres of each other. Comparing the *photographs* rather than just the GPS —
which is the one job the neural network is genuinely for — separated them:

- Two trees **1.0 m apart** scored cosine **0.067**. Different trees standing
  close together.
- Three trees within **2.8 m** scored **0.76–0.86** against each other. One trunk
  registered three times.

Two of those rows had each accrued **GH₵5**. **GH₵10 paid for one tree.** That is
the double-payment fraud the check exists to catch, found in our own pilot, with
our own money.

### Our own app produced 27 fraudulent-looking rows, and the gate caught them

A bug in the registration screen caused one tap to become many. Twenty-seven
identical check-ins entered the database — same perceptual hash,
`b31c29be06a1f31e`, repeated across three different trees.

Every one was **flagged** by the duplicate-image gate before anybody noticed the
bug existed. The verification engine detected a defect in the application it was
verifying.

---

## 7. What we will not claim

- Image matching is **corroboration, not identity**. 54% rank-1 is real signal
  and nowhere near enough to authorise a payment on its own.
- It is **bimodal** — near-perfect on distinctive trees, near-zero in a dense
  same-species stand. A plantation is the hard case; a scattered campus is easy.
- Wide-shot matching works partly off the **background**, not the tree.
- Young bark is smooth. BarkNet's ~94% figures are on **mature** bark.
- **One site, one season.** 35 trees is small and we say the number.
- Only **6 visits** carry a leaf photograph, so the species figures above come
  mostly from whole-tree and trunk shots rather than foliage.
- Care advice and species identification are **unmeasured**. We have no
  agronomist-labelled ground truth, they cannot affect a verdict, and we do not
  report an accuracy for them.
- Thresholds are **provisional** until `calibrate.py` runs on more rounds.
- **TIST already pays per living tree at 265,000 farmers. We are not first.**

---

## The sentence to say out loud

> *"Thirty-five trees, forty-four visits, ninety-four photographs. Fifty-seven
> per cent auto-approved, and every single visit that was not auto-approved was
> caught by ordinary deterministic code rather than by AI. We attacked our own
> system seven ways and it caught all seven. Then it caught a bug in our own app
> that had paid us twice for the same tree. Every number on this slide came out
> of our database this morning, including the ones that make us look bad."*
