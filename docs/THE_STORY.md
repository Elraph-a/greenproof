# GreenProof: the full flow, problem to end

**The narrative spine for the slide deck.** Every section is one slide's worth
of argument, in the order it should be told. Numbers here are measured or
sourced; nothing is invented.

Scoring weights, so you know where to spend time:

| Criterion | Points |
|---|---|
| Innovation and originality | **30** |
| Impact and sustainability | 25 |
| Technical soundness and feasibility | 20 |
| Scalability | 15 |
| Clarity of presentation | 10 |

---

## Act 1 - The problem

### 1. Money moves. Trees do not follow.

Ghana's **Auditor-General, July 2026**, on the Green Ghana Project:

> The Forestry Commission distributed seedlings **"without establishing
> adequate mechanisms to verify whether the seedlings were actually planted."**

- **GH¢226 million** spent 2021-2024, about **52 million trees** claimed
- **GH¢94.6 million** identified as avoidable: seedlings bought at GH¢9-10
  against Forestry Commission prices of GH¢0.50-1.50
- **GH¢39.5 million** still owed to local suppliers from 2021-22
- **No funding allocated for post-planting care** at all

That is our thesis, written by the state auditor, one month before this pitch.

### 2. It is not a Ghana problem. It is the whole category.

| Case | What happened |
|---|---|
| **Turkey, 2019** | 11 million trees planted in one day, a world record. Within three months the forestry workers' union found up to **90% dead**. The ministry claimed 95% survival. Nobody could settle it, because nobody was monitoring. |
| **Mexico, Sembrando Vida** | Farmers need cleared land to qualify for the payment, so they cleared forest to get it. WRI estimated **73,000 hectares deforested in 2019 alone**. |
| **Verra** | The Guardian, Die Zeit and SourceMaterial found **over 90% of rainforest credits were "phantom"**, threat overstated by ~400%. Buyers: Disney, Shell, Gucci, easyJet, Salesforce, BHP. |
| **Kariba, Zimbabwe** | Verra's own review found **15.2 million credits over-issued**, ~57% of the total. Buyers: Volkswagen, Nestlé, Gucci, Porsche, Delta, McKinsey. |
| **Plant-for-the-Planet, Yucatán** | Corporations bought named forests: Bitburger, Ritter Sport, REWE, L'Oréal, SAP, eBay, Procter & Gamble. Die Zeit found inflated tree counts and implausible survival rates. **The foundation compiled the counts itself.** |
| **Compassion International Ghana** | Tracked its own planting honestly: **8,030 of 16,670 survived, about 48%**. |

**The one line to say:** every one of these is a *monitoring* failure, not a
planting failure. The trees were paid for. Nobody checked.

### 3. Why the obvious fixes do not work

- **Humans reviewing photos.** Works, does not scale. TIST and Greenstand both
  do it. It is the cost ceiling on the whole model.
- **Satellites.** Sentinel-2 is **10 m per pixel**. Forty young trees do not
  move a pixel. Useful for grove trend, useless per tree.
- **Tags on trees.** They fall off. Worse, if a tag *is* the identity, moving
  one to a healthier tree steals that tree's identity.

---

## Act 2 - The idea

### 4. Identity as accumulated evidence

A tree is not a token. It is **a chain of consistent observations**.

Each visit adds GPS, two photographs, a compass heading and a timestamp.
Confidence grows with every visit that agrees with the ones before it. A tree
with four aligned photographs is far harder to fake than one registration shot,
and the only way to show that is to put the four photographs next to each other.

**Layered identity, said plainly:** GPS narrows the candidates, the planter
confirms against the previous photo, scene match corroborates, liveness and
duplicate checks confirm it is real and not reused.

### 5. The money only moves on evidence

- A check-in is written `pending` and **fails safe**
- Only the verification service can write a verdict
- `ledger_entries` is written by a **database trigger** when a check-in reaches
  `verified`

> **You cannot pay yourself. You can only pass verification.**

Two independent locks, both in Postgres, neither in application code.

### 6. Credits, not just cash

A verified check-in pays **credits**. One credit is one cedi, deliberately -
a separate exchange rate is just a second number to distrust.

A credit leaves two ways:

- **Cash out** to Mobile Money
- **Redeem into trees** - 11 credits funds another tree for a year of monitoring

Cashing out is a leak: the money goes and the grove is no bigger. Redemption
recirculates it, and the person choosing already knows which land needs
planting. **It answers the hardest question about any pay-per-tree scheme:
what happens when the sponsor money stops.** A grove with a credit economy
keeps planting out of its own earnings.

---

## Act 3 - How it actually works

### 7. Three pieces, one shared database

**The app** (React PWA, Vercel) captures photos, GPS and compass, resizes to
800px, and queues everything offline. It reads verdicts; it never writes them.

**Supabase** holds trees, check-ins, photos and money. Row-level security plus
**column-level grants** decide who may write what.

**The verification service** (FastAPI + onnxruntime) takes a check-in ID,
fetches its photos, runs every detector, writes back a confidence and a verdict.

**The app and the service never talk to each other.** Both talk to the
database. So the service can be down for a week and nothing is lost, and
scoring is a replayable pass we can re-run over the whole dataset.

### 8. The model, in one sentence each

**DINOv2 ViT-S/14**, published by Meta. We did not train it and do not
fine-tune it.

It turns a photograph into **384 numbers**. Photographs of similar things get
similar numbers, so "is this the same place?" becomes arithmetic. We run it
server-side only - a browser-computed embedding is forgeable.

**If asked why we did not train our own:** a model fine-tuned on fifteen plants
we photographed ourselves would memorise those fifteen plants and tell us
nothing about the sixteenth.

### 9. Gates before scores, and the order is the design

> **Gates are disqualifying facts. Scores are opinions. A fact must never be
> outvoted by opinions.**

**Gates** - fail one and the visit is flagged:

| Gate | Rule |
|---|---|
| Duplicate image | pHash within 6 bits of 64 |
| GPS radius | 15 m plus the accuracy of *both* readings, capped at 60 m |
| Travel speed | 120 km/h since that person's last check-in |

**Review flags** - fail one and a human looks:

| Flag | Rule |
|---|---|
| Plant plausibility | cosine to a known plant at least 0.30 |
| Proximity | two trees at least 8 m apart |

**Scores** - a weighted sum out of 100:

| Signal | Weight |
|---|---|
| Location | 0.35 |
| Liveness | 0.30 |
| Scene match | 0.25 |
| Growth | 0.10 |

Deliberately unequal: **image matching is our weakest signal, so it must not
dominate.**

Verdict: **70+** verified, **45-69** review, **below 45** flagged.

### 10. The bug that proves the design

A plain weighted sum lets strong signals compensate for a failed one. Against
"a different tree photographed at the correct GPS" - the one attack that
genuinely needs the AI:

```
scene_match 0.00, location 1.00, liveness 1.00, growth 1.00
   ->  75/100  ->  AUTO-APPROVED
```

**The system approved the exact fraud it exists to catch.**

Now a signal that is present and near-zero **vetoes auto-approval** and sends
the visit to a human. It does not flag it - "this looks wrong but we are not
certain" deserves a person, not an accusation.

---

## Act 4 - What we measured

### 11. Our own numbers, including the bad ones

| Measurement | Result |
|---|---|
| Rank-1 retrieval | **54.2%** against 5.1% chance |
| Rank-5 retrieval | 89.8% |
| Pooled AUC | **0.77** |
| Plant plausibility AUC | **0.966** |

**Say the weakness before anyone asks.** Rank-1 is **bimodal**: five of fifteen
trees scored 100%, four scored 0%. Excellent on distinctive trees, useless in a
dense same-species stand. Averaging to "54%" hides the only interesting thing
about the signal.

**Why the system still works:** five of the six fraud types are caught by
**deterministic checks, not AI**. The AI does the one job they cannot - telling
two different trees apart at the same GPS.

Thresholds are set by **leave-one-tree-out cross-validation**, never tuned on
the data used to report performance.

### 12. It caught a real one, unprompted

**24 August 2026.** Someone photographed a laptop screen and submitted it.

```
plant similarity 0.224    liveness 0.06    scene match 0.00
```

Three independent signals agreed. Flagged.

### 13. Three times our own tests lied to us

This is the strongest slide in the deck. Do not skip it.

1. **The attack set reported "caught" without testing anything.** Two attacks
   evaded the duplicate gate by re-encoding a photo - but re-encoding moves a
   pHash 0-2 bits against a threshold of 6, so the gate caught them every time
   and the AI was never exercised.
2. **The plant check scored a perfect AUC of 1.000** - then flagged five of
   nine of our own real check-ins as "not a plant". It had learned photo
   *style*, not subject. **An AUC of 1.000 is a warning, not a result.**
3. **Scoring destroyed the evidence that a row was a test.** Six injected
   attacks became indistinguishable from real pilot data in our own database.

**The line:** "Here is our error rate, here is how we found it, and here are
three times our own tests lied to us and how we caught them."

---

## Act 5 - Where we sit

### 14. The landscape, honestly

| | What it is | Publishes an error rate? |
|---|---|---|
| **Ecologi** | Funding layer for businesses | No - partners report |
| **OneSeed** | Distribution: a tree per order. RFID + QR tags | No |
| **The Good API** | Integration layer; resells veritree's verification | No |
| **veritree** | Verification: drones, LiDAR, dendrometers, IoT, blockchain | Methodology yes, error rate no |
| **Greenstand** | Verification: geotagged photos, open source, ML research-stage | **No accuracy reported anywhere** |
| **TIST** | Pays per living tree at 265,000 farmers, human-verified | No |

**Do not claim to be first.** TIST already pays per living tree. Greenstand
already captures geotagged photos. Say so.

### 15. What is actually ours

1. **The only one that publishes its own error rate**, cross-validated, with a
   random 10% audit of auto-approvals to keep measuring it
2. **Adversarial self-testing** - known-bad check-ins injected into the live
   system to confirm detectors fire
3. **Tag-free identity** - OneSeed uses RFID and QR; tags fall off and a moved
   tag steals an identity
4. **A phone, not a drone** - veritree needs LiDAR and soil sensors; we need a
   cheap Android and no network

**The sentence for a judge who names Greenstand:**

> "Greenstand is closest to us and it is open source, so we read their code.
> They describe the same pipeline. What none of them publishes is how often
> their verification is *wrong*. We do - 54% rank-1, AUC 0.77, bimodal - and we
> attack our own system to find out. In a field where Verra overstated by 400%
> and Plant-for-the-Planet counted its own trees for L'Oréal, the measured
> number is the product."

---

## Act 6 - Proof and path

### 16. What we ran

**The pilot: 6 trees, 9 check-ins, one day.** Not the 40 trees and 160
check-ins we planned. Say the real number - it is small, and the honesty is
worth more than the size.

Everything else is real: the app is deployed, the schema is applied, the
verification service scores live, and every figure in this deck comes from
rows in the database.

### 17. Where it fails

Volunteer these before you are asked.

- Image matching is **bimodal** and weak in dense same-species stands
- The plant reference set is **18 photos from 6 trees at one site**
- Thresholds are **provisional** until more rounds exist
- **Trunk diameter will not move** measurably in four weeks; canopy area is the
  signal that does
- A web app **cannot fully prevent a gallery upload**. The claim is that fraud
  costs more than the payout is worth, not that fraud is impossible
- **If the service key leaks, the whole model falls**
- The service runs on a **laptop behind a tunnel**, because free container
  hosting closed under us mid-build

### 18. Scaling

**Per-tree photos (ours) + sample plots (industry standard) + satellite (grove
trend).** Three layers, and only the first is new.

In production **only a sample is physically measured**; every tree gets a photo
check. The measurement card scales card → any ID card or banknote → ARCore
depth in a native app.

The plant reference set **improves on its own as the system runs**: every
verified check-in is another known-good plant photograph.

### 19. Close

> Ghana spent GH¢226 million and could not confirm the seedlings were planted.
> Every system in this field asserts its verification works. **We measure ours,
> we publish the error rate, and we attack our own system to find where it
> breaks.**
>
> That is the difference between a claim and a proof.

---

## Appendix - the six hardest questions

**"Can't someone upload a photo from their gallery?"**
A web app cannot fully prevent it. The claim is that fraud costs more effort
than the payout is worth: you would need a new photograph, at the right GPS, of
a real plant, resembling that tree's history, within a plausible travel time.

**"Is this AI recognising individual trees?"**
No, and we do not claim it. GPS narrows, the planter confirms, scene match
corroborates, liveness and duplicate checks confirm. Confidence grows with each
consistent visit.

**"Isn't bark recognition solved?"**
On **mature** bark, largely - the ~94% figures are on mature trees. Young bark
is smooth and far less distinctive, and young trees are what planting schemes
produce.

**"Are you first to pay per living tree?"**
No. TIST does it at 265,000 farmers.

**"What about satellites?"**
Sentinel-2 is 10 m per pixel. NDVI is a grove trend, shown separately, never
folded into a per-tree score.

**"What happens when a signal is missing?"**
Confidence drops and a human reviews. Auto-approval requires at least half the
signal set to have been available. **Designed to degrade, not break.**

---

## Sources

- Ghana Auditor-General on Green Ghana, July 2026
- The Guardian / Die Zeit / SourceMaterial on Verra, January 2023
- Verra review of Kariba REDD+, 15.2 million credits over-issued
- Die Zeit on Plant-for-the-Planet, 2020
- TARIM ORMAN-IS union survey, Turkey, January 2020
- World Resources Institute on Sembrando Vida
- Our own: `spike/FINDINGS.md`, `docs/plant_check_validation.json`,
  `docs/attack_results.json`, `ml/calibrate.py`

Technical detail behind every claim: `docs/HOW_IT_WORKS.md`. Why each choice
beat its alternatives: `docs/DEFEND.md`.
