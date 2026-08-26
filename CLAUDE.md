# GreenProof — Project Instructions

**Hard deadline: 26 August 2026.** 20-minute pitch, 6-minute live demo, deep technical Q&A at
the TeProD Ulysseus Innovation Challenge final (University of Ghana).

- [GreenProof_CONTEXT.md](GreenProof_CONTEXT.md) — the concept and business model (as submitted)
- [docs/ROADMAP.md](docs/ROADMAP.md) — **the operating plan.** Week by week, what gets measured
- [docs/APP_DESIGN.md](docs/APP_DESIGN.md) — every screen, with priorities
- [spike/FINDINGS.md](spike/FINDINGS.md) — what we measured about image matching
- [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) — **start here for the technical side.** What
  every part is and what it does, in plain language. Written for the team
- [docs/DEFEND.md](docs/DEFEND.md) — why each choice beat the alternatives. Read after HOW_IT_WORKS
- [docs/THE_STORY.md](docs/THE_STORY.md) — **the narrative for the deck.** Problem to close,
  in the order to tell it, with every external claim sourced
- [docs/DEMO_RUNBOOK.md](docs/DEMO_RUNBOOK.md) — **read before the pitch.** How the live
  demo comes up, the pre-flight list, and what to say if the network fails

**The schedule in the context doc is superseded by the roadmap.**

---

## What we're optimising for — the actual scoring rubric

| Criterion | Points |
|---|---|
| **Innovation & Originality** | **30** |
| Impact & sustainability | 25 |
| Technical soundness & feasibility | 20 |
| Scalability | 15 |
| Clarity of presentation | 10 |

**Innovation is worth the most and is where we are weakest.** Do not over-invest in technical
polish at the expense of originality. Anything that doesn't appear in the 20 minutes or survive
Q&A is waste.

**Where the originality actually is** — nobody in this field builds a verification system that
knows and proves its own error rate. Greenstand uses humans; TIST uses humans; veritree fuses
satellite and drone. All *assert* their verification works. None publish how often it is wrong.

Four claims, all true of what we're building:
1. **Identity as accumulated evidence** — a chain of consistent observations, not a token
2. **A system that tests itself continuously** — inject known-bad check-ins to confirm detectors fire
3. **We publish our own false-accept rate** — measured and cross-validated
4. **Designed to degrade, not break** — any signal can fail; confidence drops, a human reviews

---

## Stack — locked, do not re-litigate

| Layer | Choice |
|---|---|
| Frontend | React PWA on Vercel |
| Data / auth / storage | Supabase, called **directly from the client** (Postgres + pgvector + PostGIS + Storage + Auth) |
| ML | One FastAPI service, **on a laptop behind a Cloudflare tunnel** — the only new surface. Hugging Face, Koyeb and Fly all closed their free tiers mid-build and GCP billing is blocked; `tools/start_demo.py` brings it up in ~23s and rebuilds the tunnel when it dies |
| Model | DINOv2 ViT-S/14 (384-dim) + ORB/RANSAC + pHash + excess-green + ArUco |
| Map | Leaflet |
| Satellite | Sentinel-2 (free, 10 m). Also check **Planet NICFI** — free high-resolution imagery for the tropics, covers Ghana, much sharper than Sentinel-2 |
| Payments | Verified check-ins pay **credits** (1 credit = GH₵1), redeemable into trees or cashed out via MTN MoMo sandbox, behind an interface with a mock adapter |
| Cost | **Free tiers only.** No paid APIs, hosting or training |

**onnxruntime, not PyTorch, in production** — memory. Torch is a dev-only dependency.

**No in-browser ML** — a client-computed embedding is forgeable. Verification stays server-side.

---

## Non-negotiable correctness rules

1. **The client can never write its own verification result.** `confidence`, `verdict`, `signals`
   are writable only by the ML service key. Rows arrive `pending` and fail safe. The anon key
   ships in the frontend — assume it is public.
2. **Two scored photos per visit — wide and close-up — and no tag in either.** A numbered card in
   frame means the model may match the card, silently inflating accuracy.
3. **Tags are optional field convenience, never identity.** They fall off, and if a tag *were* the
   identity then moving one to a healthier tree would steal that tree. Identity = GPS + position +
   photo history + the person confirming against the previous photo.
4. **Record compass heading at capture.** Next visit the app says "stand here, face this way".
   Reproducing framing is the cheapest available improvement to image matching.
5. **NDVI is never folded into a per-tree score.** Sentinel-2 is 10 m/pixel; 40 young trees do not
   move it. Grove-scale signal, displayed separately.
6. **Gates run before scoring.** Duplicate image, GPS outside the accuracy radius, impossible
   travel speed — disqualifying regardless of any other signal.
7. **Accuracy is measured with leave-one-tree-out cross-validation.** Never tune a threshold on the
   data used to report performance.
8. **Resize client-side before upload** — 800px long edge, JPEG q75. Full-size photos would exceed
   the Supabase allowance mid-pilot.

---

## Measurement — the growth plausibility signal

**Pilot:** one printed **ArUco marker (~80 mm)**, reused for all trees — not a tag on a tree. It
gives millimetres-per-pixel *and* corrects for camera tilt via its four known corners. User **taps
the two trunk edges** on screen (deliberately not automatic — unreliable against messy
backgrounds). Measure at **1.3 m** = diameter at breast height, the global forestry standard.

**Validation:** tape-measure ~20 trunks at T0 and compare. This is what makes the claim defensible.

**Honest limit:** trunk diameter barely moves in four weeks. The signal's job is catching the
impossible — shrinkage, seedling→mature overnight, growth beyond species maxima.

**Canopy area** from aligned wide shots is the signal that *does* move in weeks, and it is the
dying-tree detector.

**Scaling:** ArUco card → any ID card/banknote → ARCore depth in a native app. And in production
**only a sample is physically measured**; every tree gets a photo check. Groves use three layers —
per-tree photos (ours), sample plots (industry standard), satellite (grove trend).

---

## Honesty constraints

- Framing is **layered identity**, not "AI re-identifies trees": GPS narrows candidates, the person
  confirms against the previous photo, scene match corroborates, embeddings and liveness confirm
  it is real and not duplicated; confidence grows with every consistent visit.
- Measured on our own 15 plants: **rank-1 retrieval 54% vs 5% chance, AUC 0.77.** Real signal, not
  identity. **Bimodal** — near-perfect on distinctive trees, near-zero in a dense same-species
  stand. See `spike/FINDINGS.md`.
- **Five of six fraud types are caught by deterministic checks, not AI.** Say so; it is the honest
  reason the system works.
- Young bark is smooth. BarkNet's ~94% figures are on **mature** bark.
- Wide-shot matching partly works off the background. Say so.
- A web app cannot fully prevent a gallery upload. The claim is that fraud costs more than the
  payout is worth — not that fraud is impossible.
- Greenstand has an ML repo (research-stage, not deployed). Do not claim they are purely manual.
- TIST already pays per living tree at 265,000 farmers. We are **not** first.
- Ghana's programme is now **Tree for Life Reforestation Initiative**, not only Green Ghana Day.

---

## Do not change the submitted idea

The submitted description already says the right thing — *"no single signal is trusted alone"* is
layered identity, and *"humans manually reviewing photos, which cannot scale"* is the automation
argument. **Refine execution, add rigour, keep the concept.** Keep all four signals, keep the
leaderboards promise, keep "AI-verified tree ownership" as the headline. The theme is *Innovate
with AI* — burying the AI would cost points on the biggest criterion.

---

## Critical path

`capture app ready → T0 (~31 Jul) → 4 check-in rounds → 25 Aug → pitch 26 Aug`

No campus permission is required to photograph, so the gate is our own work. Check-in rounds are
calendar-bound and unaccelerable. **Nothing may delay T0** — if a feature is not ready, register
the trees without it.

> **CUT-LINE — 17 August.** If register → check-in → score → map is not solid, drop MoMo and NDVI
> and spend the rest on the pilot and rehearsal.

---

## Conventions

- Photos behind **one upload function and one URL column** — provider swappable in a single file
- `signals jsonb` holds the per-signal breakdown. Never collapse it — it is the debugging tool, the
  Q&A teaching aid, and it drives the progressive-reveal UI
- Secrets in `.env` only
- Spike and pilot photos in `data/`
- A short **"defend this"** note per subsystem as it is built: what it does, why this choice over
  the alternatives, where it fails, what we would do with more time
- **Palette is `canopy` paper and green, `gold` for money** — chosen from the real CSS of veritree,
  Sylvera, Wren, Ecologi and Farmerline. Gold not orange because every warm accent in that survey
  is golden and because money on a phone in Ghana is MTN MoMo yellow
- **Gold means money and nothing else.** Enforced structurally: the accent tokens sit outside every
  palette block so they cannot drift. Use the "needs review" amber for statuses
- **Secondary text is measured against the PAGE, not white** — that is where most of it sits, and a
  pale grey is unreadable on a phone in Ghanaian midday sun
- **The photograph is the interface.** My Grove leads with the overdue tree's own last photo, the
  tree list is a photo grid, and the tree page puts the confidence score on the image
- **Every screen needs a `DEMO` branch.** MapScreen and SponsorDashboard were both missed and both
  rendered "permission denied for table trees" in front of an audience
- **When behaviour changes, grep the docs for the old behaviour** before moving on. DEFEND.md and
  DEPLOY.md both described a camera flow that no longer existed

## Working with Raphael

He directs the build and asks questions throughout to own the material for Q&A. Explain **reasoning,
not just output** — every non-obvious choice comes with why it beat the alternatives. Final-year
Business Analytics student: strong on statistics and data visualisation, less so on web
infrastructure. He has caught real bugs in this project; take his objections seriously rather than
explaining them away.
