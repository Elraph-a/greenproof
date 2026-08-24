# Spike findings — image matching feasibility

**28 July 2026 · 15 plants · 59 photos · DINOv2 ViT-S/14 (ONNX)**

The "defend this" note for the verification engine's same-tree signal: what we
measured on our own data, what went wrong along the way, and what we concluded.

---

## Result

| Metric | Value |
|---|---|
| **Rank-1 retrieval** | **54.2%** (chance 5.1%) |
| Rank-3 retrieval | 74.6% |
| Rank-5 retrieval | 89.8% |
| Pooled AUC (same-tree vs different-tree pairs) | **0.77** |
| Mean similarity | same-tree 0.622 · different-tree 0.409 |

**Read:** image embeddings carry **real instance information** — ten times better
than chance at picking the right tree. But nearly half of photos still retrieve
the wrong tree first, and an AUC of 0.77 means the two distributions overlap far
too much to authorise a payout on.

**Conclusion: a genuine supporting signal, not a basis for identity.** Exactly
what the layered-identity framing already assumes. Tag + GPS assert which tree it
is; image matching corroborates.

---

## Where it works and where it fails

Per-tree rank-1 accuracy is **bimodal**, not uniformly mediocre:

- **100%** — trees 4, 6, 8, 9, 14
- **0%** — trees 1, 2, 10, 15

Failures cluster in the **dense banana stand**: same species, same backdrop,
plants packed close together. Successes are trees with distinctive surroundings.

This is the single most useful thing the spike told us, and it has a direct
product reading:

> Matching works when a tree or its immediate setting is visually distinctive.
> It fails inside a dense uniform stand of one species.

A sponsor's plantation is therefore the **hard** case; scattered campus,
school and community trees are the **easy** one. The UG campus pilot should
score above these numbers.

---

## Three failed attempts before this number was trustworthy

Recorded because the mistakes are instructive, and because the earlier versions
of this file were wrong.

**1. Assumed shot order — WRONG.**
Decoded each tree as `wide → close → wide → close` based on position, after
verifying it on two trees and generalising. In fact 11 of 14 trees were shot
`wide → close → close → wide` (you step in for the close-ups, then step back
out), and only 3 used the alternating order. So "same-tree" pairs were comparing
a wide shot against a close-up. First result (AUC 0.79 / 0.68) was measuring a
decoding bug.

*Caught by Raphael* asking whether the arrangement could have got mixed up,
after Claude had explicitly ruled it out.

**2. Claude's ruling-out was bad reasoning.**
The diagnostic looked for *bimodality* in per-tree scores; seeing a smooth
continuum, it concluded the protocol was consistent. Wrong — a mix of correctly
and incorrectly paired trees produces a spread, not a visible gap.

**3. Two attempts to infer roles automatically also failed.**
- *KMeans on embeddings*: split by **content** (banana grove vs open yard), not
  by zoom level. Produced trees labelled `W W W W`.
- *Sky fraction*: overcast day, so sky, sand and pale walls all read as bright.
  Within-tree values differed by ~0.05 — noise. Contradicted photos visually
  confirmed by eye.

**Resolution:** stop trying to label roles. Use **rank-1 retrieval**, which needs
no role labels and asks the operational question directly — *a check-in arrives;
does the right tree come back first?*

> **This ambiguity is an artifact of the spike, not the product.** The app
> captures wide shot and close-up as separate labelled fields, so roles are never
> uncertain in the real system.

---

## What this means for the build

**No change to the plan.** Layered identity was chosen precisely so that a weak
matching result would not force a strategy change, and it holds.

- Identity: **tag + GPS**
- Image matching: a **supporting** signal, weighted accordingly by the logistic
  regression during calibration
- The AI's defensible job: **alive, in the right place, not a duplicate**

**Do not claim tree re-identification on stage.**

### The Q&A answer this buys

> *"We tested whether off-the-shelf embeddings could re-identify individual trees,
> on 15 plants we photographed ourselves. Rank-1 retrieval was 54% against 5%
> chance — real signal, but AUC 0.77, so nowhere near reliable enough to authorise
> a payment. And it's bimodal: perfect on trees with distinctive surroundings,
> zero inside a dense stand of one species. So we treat it as corroboration, not
> identity. The tag and GPS say which tree it is."*

Most teams will assert their AI works. This is a measured limit, with the failure
mode characterised and the design built around it.

---

## 1 August — the production pipeline, measured against the same photos

Three checks run when the verification service was built, on the same 59 photos.

### The production embedding path reproduces the published numbers

`ml/greenproof_ml/embed.py` re-measured on the spike set:

| | spike (28 Jul) | production path (1 Aug) |
|---|---|---|
| rank-1 | 54.2% | 57.6% |
| rank-5 | 89.8% | 93.2% |
| AUC | 0.77 | 0.782 |
| same / different cosine | 0.622 / 0.409 | 0.637 / 0.418 |

The small gain is the watermark crop: the spike removed the camera's burned-in
timestamp, production does not. **Quote the spike numbers.** They are the
conservative pair, and app photos carry no watermark so neither set is exactly
the production case.

The point of this check is that the number we publish describes the code we
shipped, rather than a notebook that no longer resembles it.

### ORB/RANSAC does not work, and has been switched off

Tested across 287 pairs — 87 same-tree, 200 different-tree:

| | zero inliers | mean | max |
|---|---|---|---|
| **Same tree** | 63.2% | 1.7 | 8 |
| **Different tree** | 75.0% | 1.1 | 6 |

The distributions overlap almost entirely. ORB finds no consistent geometry
between two genuine photos of the same tree taken **minutes apart** — foliage
moves between frames, and bark photographed at two scales shares almost no
repeatable keypoints.

It was contributing up to +0.08 confidence, which helps an impostor exactly as
readily as a genuine visit. **Removed from scoring** (`ORB_CONTRIBUTES_TO_SCORE
= False`), still computed and recorded in `signals` so the decision can be
revisited.

**Caveat that keeps it alive:** the spike had *no framing control*. The ghost
overlay and compass heading exist precisely to reproduce framing. Re-measure
after check-in round 1 against aligned pairs, and switch it back on only if the
two distributions actually separate.

> This is the self-testing claim working on our own component. We built a
> signal, measured it, found it did nothing, and took it out. Most teams would
> have left it in the architecture diagram.

### The scoring engine auto-approved the one attack the AI exists to catch

Found by running the verdict logic across ten designed scenarios before any real
data existed. **Attack #4 — a different tree photographed at the correct GPS:**

```
scene_match 0.00 · location 1.00 · liveness 1.00 · growth 1.00
   -> 75/100 -> VERIFIED
```

A plain weighted sum let three strong signals **compensate** for the one that
had failed. Since `scene_match` carries only 0.25 of the weight, a score of zero
still left 75. The system would have paid out on the exact fraud the image
matching is responsible for — a **false accept**, the fatal error class.

Compensation is correct behaviour for a quality score and wrong for a fraud
decision.

**Fix — critical floors.** A signal that is present and near-zero now *vetoes
auto-approval*. It does not flag the visit; it routes it to a human, which is
the honest response to "this looks wrong but we are not certain". Confidence is
still reported unchanged, so the disagreement stays visible in the data.

The floors sit between two measured cases:

| Case | scene_match | Must be |
|---|---|---|
| Genuine visit, dense same-species stand | ~0.19 | still auto-approved |
| A different tree entirely | 0.00 | vetoed |

Floor set at 0.12. Both behaviours confirmed:

| Scenario | Before | After |
|---|---|---|
| Different tree at correct GPS | 75 → verified ✗ | 75 → **review** ✓ |
| Only one signal available | 74 → verified ✗ | 74 → **review** ✓ |
| Genuine dense-stand weak match | 80 → verified ✓ | 80 → verified ✓ |

Pinned by 13 regression tests in `ml/test_scoring.py`, because `calibrate.py`
refits the weights after every check-in round and a refit must never quietly
reopen the hole.

> **This is the self-testing claim, working.** We designed an attack against our
> own scoring, ran it before collecting a single pilot photo, found the system
> would have paid the attacker, and fixed it. The number we publish in August
> will be a measurement of a system that has been attacked — not an assertion.

### pHash has a large safety margin

| Case | Hamming distance |
|---|---|
| Identical file | 0 |
| Re-encoded at 800px / q75 — *the resubmission attack* | 0 |
| Genuine same-tree, different photo | min 22, mean 30.6 |
| Different tree | min 18, mean 30.8 |

Threshold is 6. **Zero of 42 genuine same-tree pairs would be wrongly flagged**,
while the client-side resize an attacker would use to disguise a resubmission
does not move the hash at all. The duplicate gate is the strongest signal in the
system and the cheapest.

Note pHash does **not** separate same-tree from different-tree (30.6 vs 30.8) —
and it is not supposed to. It answers "is this the same *image*", not "is this
the same *tree*".

---

## Still open — the control experiment

All photos were taken within ~19 minutes: no weather, growth or lighting change.
**Treat these as an upper bound on cross-week performance.**

The untested variable is framing consistency. Worth 15 minutes:

- 10 plants, same species, in a row
- wide + close-up from a natural standing spot; walk away 10 m; return to the
  **same spot**; shoot both again. Do **not** circle the plant
- if same-position pairs score far higher, the fix is a **ghost overlay** of the
  previous photo in the camera view so people reproduce the framing

---

## Reproduce

```
python spike/measure.py
```

The scripts behind the wide/close split and the shot-order investigation have
been removed — their conclusions are recorded above and none of them produced a
number worth keeping.

Photos in `data/spike/`: numbered newest-first, cards at indices ≡ 4 (mod 5),
each card followed by that tree's four photos.
