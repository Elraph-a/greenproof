# GreenProof - Project Context & Build Handoff

> **Purpose of this file:** full context for continuing development in Claude Code.
> Everything below is already decided and stress-tested. Start from here rather than
> re-litigating the concept. What's needed now is **building**, not ideating.

---

## 0. Situation

- **Competition:** TeProD Ulysseus Innovation Challenge 2026, University of Ghana.
- **Theme:** *Twin Transition - Innovate with AI and Green Technologies to Transform our Economy.*
- **Status:** Shortlisted - **top 10 out of 56 teams.**
- **Time remaining:** ~1 month to the final.
- **Final format:** **20-minute pitch. Live demos encouraged. Judges will ask deep technical questions** - the team must own every detail.
- **Team:** 4 final-year undergraduates (Business Analytics / Data Science background: NLP, social network analysis, data visualisation).
- **Constraint:** Tooling must be **free or very cheap**. No budget.

**Honest external assessment of the idea as it stands:** ~7.5–8/10 on paper. Strong problem, strong theme fit, good feasibility. Weaknesses: novelty (a manual predecessor exists) and unproven technical claim (young-seedling matching). **Both are closed by a working demo + a real pilot number, not by more words.**

---

## 1. The idea in one paragraph

Ghana plants millions of trees yearly (Green Ghana Day and similar), but a large share die within months because **once a tree is planted, nobody owns it and nobody checks on it.** Meanwhile companies and government bodies spending on reforestation have **no trustworthy proof** their money produced living trees.

**GreenProof turns a planted tree into a trackable, income-earning asset.** A person or institution registers a tree with a phone photo + GPS. An **AI verification engine** confirms over time that the same tree is still alive and growing. On survival milestones, the owner is paid via **Mobile Money**, funded by sponsors (companies/government) who receive live dashboards proving how many of their trees survived.

**One-liner:** *We make a living tree worth more than a dead one.*

---

## 2. The user loop (what we're building)

1. **Register** - user plants/adopts a seedling, submits photo. App captures GPS + timestamp. Tree gets unique ID, appears on map. Tree is now theirs.
2. **Check in** - every few weeks, user re-photographs the same tree. Streaks/leaderboards for engagement.
3. **AI verifies** - the verification engine scores each check-in (see §3).
4. **Milestone payout** - on survival milestones (e.g. 6 months, 12 months), earnings accrue in an in-app wallet and pay out to MoMo **in batches** (never per check-in - fees would kill it).
5. **Sponsors fund it** - companies/government buy verified groves, see live dashboards ("your 5,000 trees - 87% alive, verified monthly").

**Users are not only individuals:** schools, churches, farmer groups, NGOs, communities. These institutional users are the *durable* users (individuals churn).

---

## 3. The AI verification engine (the core innovation)

**Design principle: no single signal is trusted alone.** Four independent signals combine into a confidence score, like real fraud-detection systems. Any one can be fooled; all four agreeing is hard to fake.

| # | Signal | How it works |
|---|--------|--------------|
| 1 | **Same-tree matching** | Convert each photo to an **image embedding** (numeric fingerprint); compare similarity against that tree's previous photos. High similarity → same tree. Low → flag. |
| 2 | **Liveness & growth plausibility** | Species check (still same species?) + growth logic: a tree can't shrink, change species, or jump outside a known growth curve. Implausible → flag. |
| 3 | **Location integrity** | GPS + timestamp per photo; detect **GPS spoofing** and **duplicate/reused images** (one tree can't be registered twice; stock photos rejected). |
| 4 | **Satellite cross-check** | Free **Sentinel-2** imagery + **NDVI** to confirm the registered *area* is actually greening over time. Plot-level, not tree-level. |

**Output:** confidence score → high = auto-verify; low = human review queue.

**Research backing:** deep-learning tree-bark re-identification is established - ~**93.88% accuracy single-image, 97.81% multi-image** (BarkNet/DeepBark line of research).

### Known hard problem: young seedlings
Bark re-ID is strong on *mature* bark. **Young seedlings look alike** - this is the single most likely technical attack from judges.
**Mitigation (must be able to defend live):**
- Cheap **physical tag** (numbered/QR or biodegradable stake) planted with each seedling.
- **Wider context shot** - surrounding rocks, structures, neighbouring plants form a scene fingerprint.
- Precise GPS + the other signals.
- Confidence **rises as the tree matures** and bark re-ID takes over.
- Low-confidence cases → human review.

### Known hard problem: canopy closure ("it becomes a forest")
Individual tracking matters most in **years 1–5** (when trees die). Once trees mature into dense canopy and individual tracking breaks down, **ownership converts to a plot-share** (e.g. "you own 3% of this grove"), verified at grove level by satellite. This mirrors how real carbon projects verify at scale.

---

## 4. Seedling supply model (locked)

**We are NOT in the seedling business.** We sit on top of supply that already exists. Two channels, one platform:

- **Channel A - Nursery partner network (year-round engine).** Community/private nurseries onboarded as registered supply partners. Sponsor money buys seedlings from them; planters collect and register. Creates local jobs, keeps platform alive all year.
- **Channel B - Green Ghana Day (annual accelerator + cold-start engine).** Forestry Commission gives out millions of free seedlings each June; GreenProof registers that surge. Requires **no sponsor money**, so it breaks the chicken-and-egg problem.

**Nursery payment model (locked):** split - **majority on delivery + a survival bonus.**
Rationale: paid fully on delivery, a nursery has no incentive to supply healthy seedlings. But responsibility is split **fairly**:
- **Nursery bonus** → tied to **early establishment survival (first 4–8 weeks)** = seedling quality.
- **Planter reward** → tied to **long-term survival** = care.
Each party judged only on what they control.

**Long-term:** full traceable chain (nursery → planter → living tree) is a moat for carbon buyers.

---

## 5. Business model (locked sequencing)

- **Phase 1 (now, provable at pitch): Corporate & government CSR.** Banks, telcos, breweries already spend on tree-planting PR that yields dead trees and no proof. Sell **verified sponsored groves + live dashboards**. Government is also a customer: an independent audit layer for Green Ghana Day's own numbers.
- **Phase 2: Verified impact-as-a-service.** Subscription dashboards, ESG reporting data, proof-of-survival certificates.
- **Phase 3 (long-term): Carbon credits.** Bundled verified trees feed the voluntary carbon market, where verification quality commands the ~4x price premium.

**CRITICAL FRAMING:** Do **not** lead with carbon. A young tree's raw carbon value is **cents** - it cannot fund a seedling + planter reward + nursery bonus + fees. Phase 1 revenue is **proof-of-impact / CSR**, sold at a premium far above tonnage value. A sharp judge doing the carbon math will catch any overclaim.

---

## 6. Tech stack (free / cheap, student-buildable)

| Layer | Tools | Cost |
|---|---|---|
| Mobile / UI | **Flutter** (Android+iOS, one codebase) *or* light **React** web app for demo; **WhatsApp Cloud API** for basic-phone access | Free / OSS |
| Backend / API | **Python + FastAPI** | Free / OSS |
| Database + geo | **PostgreSQL + PostGIS** | Free / OSS |
| Hosting | **Render / Railway free tier**, or small low-cost VPS | Free tier |
| AI / vision | **PyTorch** or TensorFlow; pre-trained CNN (**MobileNet** / ResNet) fine-tuned for **image embeddings**; **OpenCV** for image handling, duplicate/spoof checks; **plant-ID model/API** for species | Free / OSS |
| Satellite / maps | **Sentinel-2** via **Google Earth Engine** (free for research) or **Copernicus** hub; **NDVI** over plots; **Leaflet** or Mapbox free tier for live map | Free / free tier |
| Payments | **MTN MoMo API** (public developer sandbox) | Free sandbox |
| Physical tag | Cheap numbered/QR or biodegradable stake per seedling | Pennies |

### Architecture

```
USER (smartphone app OR basic phone via WhatsApp/USSD)
  • plants tree  • takes photo  • periodic check-ins
        │  photo + GPS + timestamp
        ▼
BACKEND API (Python / FastAPI)
        ├──────────────────────────────┐
        ▼                              ▼
AI VERIFICATION ENGINE          GEO + SATELLITE LAYER
 1. same-tree match (embeddings)  • PostGIS tree map
 2. species + growth check   ◄───►• Sentinel-2 NDVI greening
 3. duplicate / spoof check
 → CONFIDENCE SCORE
        │  high → auto-verify   |   low → human review queue
        ▼
TREE LEDGER (PostgreSQL)  ──────►  PAYOUT ENGINE
 • ownership, age, status           MTN MoMo API,
 • survival milestones              batched on milestones
        │
        ▼
DASHBOARDS
 • User: "my grove" - trees, age, earnings, streaks
 • Sponsor: grove health, % alive, verified
 • Public: live national tree map
```

---

## 7. WHAT TO BUILD IN THE NEXT MONTH (priority order)

> We do **not** need a real carbon market, real payouts, or millions of users.
> We need a **thin vertical slice that runs live on stage** + a **real pilot number.**

### Priority 1 - The demo loop (weeks 1–3)
`register → check-in → AI same-tree match → confidence score → dashboard`

- [ ] Registration flow: photo upload + GPS + timestamp → tree ID in DB
- [ ] Check-in flow: new photo against existing tree record
- [ ] **Same-tree matching model** running live (embeddings + similarity threshold)
- [ ] Confidence scoring combining available signals
- [ ] Duplicate-image + basic spoof detection
- [ ] **Live map** of registered trees (this is a strong visual moment - plays to team's data-viz strength)
- [ ] Sponsor dashboard: total trees, % verified alive
- [ ] **Simulated MoMo payout** (sandbox is fine; must *look* real on stage)
- [ ] Real **Sentinel-2 / NDVI** pull for ONE Ghanaian pilot location

### Priority 2 - The pilot number (weeks 1–4, runs in parallel - DO NOT SKIP)
This is the single biggest differentiator and most teams skip it.
- [ ] Register **30–50 real trees** at one unambiguous site (school compound / church land / family farm)
- [ ] Run **2–3 real check-in cycles** before the final
- [ ] Result to quote on stage: *"We registered 42 real trees three weeks ago and verified 39 alive yesterday."*
- Note: trees need not be newly planted - existing young trees on known land prove the verification loop fine.

### Priority 3 - Polish (week 4)
- [ ] Rehearse pitch to finish at **18–19 min**, never 20
- [ ] **Backup demo video** (stage wifi always dies)
- [ ] Mock Q&A sessions; assign a primary owner per likely question

### Suggested role split
- **ML & verification engine** - embeddings, same-tree matching, confidence scoring
- **Backend & data** - FastAPI, PostgreSQL/PostGIS, MoMo sandbox, tree ledger + wallet
- **Geospatial & visualisation** - Sentinel-2/NDVI pipeline, live map, dashboards
- **Product, pitch & partnerships** - nursery/Forestry outreach, pilot logistics, demo script, slides

---

## 8. Pitch structure (20 minutes)

| Time | Section |
|---|---|
| 2 min | Problem + the numbers |
| 3 min | Solution loop: plant → register → check in → verify → get paid |
| **6 min** | **LIVE DEMO** - register a seedling on stage, run same-tree match, show confidence score, show map, trigger simulated payout |
| 3 min | Pilot results + how verification works (the four signals) |
| 3 min | Business model sequencing, regulatory drivers, honest Greenstand comparison |
| 2 min | Impact, SDGs, closing one-liner |

---

## 9. Technical Q&A prep (judges WILL ask these)

Every team member should be able to answer without deferring. Assign a primary owner to each.

1. **How does same-tree matching actually work?** → embeddings, similarity threshold, which model, and where it fails.
2. **Seedlings look identical - so how?** → four fused signals + physical tag + wider context shot + confidence grows with maturity + human review queue.
3. **False positives / fraud?** → duplicate detection, GPS spoof detection, growth curves, satellite cross-check. Honest goal: make fraud **cost more than the payout is worth** (no system is perfect).
4. **How does the satellite check work?** → Sentinel-2, NDVI, plot-level not tree-level, revisit frequency.
5. **Unit economics per tree?** → know the cents-per-tree carbon math cold; explain why Phase 1 is CSR, not carbon.
6. **How is this not Greenstand?** → manual vs automated, NGO-gated vs consumer, foreign vs Ghana-native, no satellite/MoMo layer.
7. **What happens at forest density?** → plot-share conversion.
8. **Whose land is the tree on?** → you own the **tree asset in the app, not the land**; pilots on unambiguous land (school/church/family farm). Ghana land tenure is customary and contested - say this before they ask.
9. **Who really pays, and will they?** → Phase 1 CSR budgets already being spent on unverifiable planting.
10. **Are you legally allowed to move this money?** → we're the **tech + verification layer**; disbursement runs **through a licensed MoMo provider / payment partner**, we don't hold deposits.

---

## 10. Competitor: Greenstand Treetracker (be honest, don't hide it)

An existing US-founded NGO platform. Growers take geotagged photos of trees; images are verified; growers get paid. 500,000+ trees tracked, mostly sub-Saharan Africa.

| Greenstand | GreenProof |
|---|---|
| **Humans manually screen every photo** | **AI verifies automatically**; humans review only flagged cases |
| Works through NGOs recruiting growers | Direct consumer + institution app |
| Photo verification only | Photo + satellite + growth-curve cross-checks |
| "Impact tokens," experimental payout | Mobile Money milestone payouts |
| Infrastructure in US/Europe, not localised | Ghana-first; Green Ghana Day + local nurseries |
| No gamification | Ownership, streaks, leaderboards, inheritance |

**Positioning line:** *"Tree tracking exists - but it's manual, NGO-gated, and foreign. We automate it with AI, make it consumer-scale, and localise it to Ghana."* Claiming to be first would be false and judges will check.

---

## 11. Stress-tested bottlenecks & fixes (all already resolved)

| Bottleneck | Fix |
|---|---|
| **Unit economics tight** - young tree's carbon value is cents | Phase 1 = CSR/proof-of-impact premium, **not** carbon |
| **MoMo fees eat micro-payments** | Never pay per check-in; accumulate in wallet, **batch payouts** on threshold |
| **Nursery survival bonus unfair** (weak seedling vs poor watering?) | Nursery judged on **early establishment (4–8 wks)**; planter on **long-term survival** |
| **Cold start** (sponsors want proof; planters want money) | **Green Ghana Day** - free seedlings, no sponsor money needed, generates first verified batch |
| **Financial regulation** (holding/disbursing funds) | We're the tech/verification layer; disbursement via **licensed MoMo provider** |
| **Overselling carbon certification** | Verra/Gold Standard demand additionality + permanence; scattered smallholder trees are hard to certify → Phase 3, framed as long-term |
| **Young seedlings look alike** | Physical tag + context shot + GPS + four-signal fusion; confidence rises with maturity |
| **User attrition** | Durable users are **institutions** (schools, churches, farmer groups); possibly paid community "tree rangers" |
| **It's a partnership business, not just software** | The app is the easy part; real risk is offline partnerships (nurseries, Forestry Commission). Anchor on **one crisp pilot**, not claimed national scale |

---

## 12. Evidence base (verified - cite these, don't invent new ones)

### Problem
- ~**42 million trees** planted under Green Ghana Day since 2021.
- Official average survival ~**73.3%** (67% 2021, 72% 2022, 81% 2023) → **10M+ dead trees** by official count.
- Independent monitoring worse: Compassion International Ghana tracked its own planting - only **8,030 of 16,670 survived (~48%)**.
- A Forestry Commission manager attributed first-year poor survival to **weak monitoring**.

### Market
- Voluntary carbon market ~**USD 1.7 billion (2024)**, projected ~**25% CAGR** into the mid-2030s.
- **4,200+ companies** globally committed to science-based climate targets.
- **Verification quality = price:** high-rated credits ~**USD 14.80/tonne** vs low-quality ~**USD 3.50/tonne** (4x gap).
- **Microsoft bought 3.5M+ carbon credits (Jan 2025)**, partly to offset AI development emissions.

### Rails
- Mobile Money: ~**59.7% of Ghanaian adults** active; ~**74M registered accounts**; **491,000 active agents** (Dec 2025); **GH₵518bn** moved in Dec 2025; Ghana **#1 on GSMA Mobile Money Regulatory Index**; works on basic phones via **USSD**.

### Technical
- Tree-bark re-identification: ~**93.88% single-image / 97.81% multi-image** accuracy (BarkNet/DeepBark research).

---

## 13. Regulatory drivers (verified - note the honest framing)

**Critical:** **No law orders a company to plant a tree.** What regulation does is force large companies to **measure, disclose and stand behind** their carbon claims - and build the official market infrastructure verified trees plug into. Overclaiming here destroys credibility.

### Ghana
- **Environmental Protection Act, 2025 (Act 1124)** - assented **6 January 2025**. Creates the statutory **Carbon Markets Office (CMO)** and the digital **Ghana Carbon Registry (GCR)**, tracking mitigation activities at sector, city and corporate levels. Ghana has now built official "trust infrastructure" for carbon - our verified-tree data is exactly what it needs.
- **Bank of Ghana Climate-Related Financial Risk Directive** - issued **Nov 2024**, effective **Jan 2026** for banks (Jan 2027 others). **Mandatory** climate-risk management; banks must **disclose climate risks in audited financial statements and annual reports**. Every bank we'd approach as a sponsor sits under this.
- **REDD+ / FCPF** - Ghana paid **USD 4.86M for 972,456 tonnes** reduced (first monitoring period); eligible for up to **USD 50M** for 10M tonnes.
- **Article 6.2, Paris Agreement** - Ghana was the **first African country** to execute an Article 6.2 transfer, selling verified reductions to **Switzerland on 8 July 2025**.
- **GSE ESG Disclosure Guidance Manual (2022)** - *honest note:* **largely voluntary**, not a hard mandate. Use as context only.

### International
- **EU CSRD** - large companies must publicly report environmental performance against standardised, independently-assured standards. The **2025 "Omnibus"** narrowed scope (now 1,000+ employees and >€450m turnover; ~90% fewer firms in scope) - but those remaining are the **largest, most reputation-sensitive buyers**. Reaches **non-EU companies** earning >€450m in the EU with a qualifying subsidiary.
- **EU CSDDD** - beyond reporting: largest firms (5,000+ employees, >€1.5bn turnover) must identify and address environmental harm across supply chains, phasing in **2028–2029**. *Honest caveat:* the Omnibus **removed** the CSDDD obligation to adopt climate transition plans - do **not** claim it forces transition plans.

**Defensible line for judges:** *"No single law orders a company to plant a tree. But a wave of regulation - Ghana's EPA Act 2025 and Bank of Ghana climate directive, and the EU's CSRD and CSDDD - now forces large companies to measure, disclose and stand behind their carbon claims under independent assurance. That turns vague tree-planting PR into a legal-grade reporting problem, and the market pays a premium for proof. GreenProof sells the proof."*

---

## 14. SDG alignment

Lead with the first four - they tell the "climate + livelihoods" story in one breath.

- **SDG 13 - Climate Action.** Verified carbon sequestration, credible climate finance.
- **SDG 15 - Life on Land.** Reforestation, halting land degradation - most direct fit.
- **SDG 8 - Decent Work & Economic Growth.** Planter income, nursery jobs, tree rangers.
- **SDG 1 - No Poverty.** MoMo payouts turn surviving trees into rural income and an inheritable asset.
- **SDG 17 - Partnerships for the Goals.** Government + nurseries + corporates + communities on one platform.
- **SDG 9 - Industry, Innovation & Infrastructure.** The AI verification engine itself.
- Also supported: **SDG 12** (offset integrity), **SDG 11** (urban greening).

---

## 15. Submitted 250-word description (for reference)

> **GreenProof: AI-Verified Tree Ownership**
>
> Ghana plants millions of trees every year through Green Ghana Day and similar initiatives, yet independent monitoring shows a large share die within months. Once a tree is planted, nobody owns it and nobody checks on it. Meanwhile, companies and government bodies spending heavily on reforestation have no trustworthy proof that their money produced living trees. Tree-tracking platforms exist, but they depend on humans manually reviewing photos, which cannot scale.
>
> GreenProof automates that trust with AI. When anyone plants a seedling, whether a farmer, student, school, church, or NGO, they register it in our app with a photo capturing its location and date. The tree becomes theirs. Periodically, they photograph it again, and our verification engine combines four independent signals: image matching against earlier photos, growth plausibility checks, fraud and location detection, and free satellite imagery confirming the area is actually greening. No single signal is trusted alone, which is what makes verifying even young trees reliable. When a tree passes survival milestones, the owner is paid through Mobile Money.
>
> Sponsoring companies and government institutions fund these payouts and receive live dashboards proving how many of their trees survived, evidence they increasingly need for environmental reporting and Ghana's new carbon market. Schools, churches, and communities compete on leaderboards, turning tree survival into a lasting shared habit rather than a one-day event.
>
> GreenProof advances SDGs 13, 15, 8, and 1, using AI to make green investment verifiable. That is the Twin Transition in action.

---

## 16. Guidance for the build assistant

- **Don't re-open settled decisions** (§4 seedling model, §5 revenue sequencing, §3 four-signal design). They were stress-tested deliberately.
- **Optimise for the demo, not for production.** A thin vertical slice that runs live beats a well-architected system that isn't finished.
- **Free tools only.** No paid APIs, no paid hosting, no paid model training.
- **Be honest about technical limits.** Especially young-seedling matching - the team must be able to defend accuracy claims live. Don't let the build imply accuracy the model doesn't have.
- **The map and dashboards matter more than they look.** They're the visual payoff on stage, and they play to the team's data-visualisation strength.
- **Deadline-driven:** ~1 month. Prioritise ruthlessly; ship the loop first, polish later.
