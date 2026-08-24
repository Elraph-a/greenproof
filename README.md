# GreenProof

**Plant a tree. Prove it lives. Get paid.**

AI-verified tree ownership for Ghana. People photograph the trees they plant;
the system verifies the tree is still alive and attributes it to them, so
payment can follow survival rather than planting.

> Pitch: **26 August 2026**, TeProD Ulysseus Innovation Challenge final,
> University of Ghana.

---

## What makes it different

Everyone in reforestation verification asserts their verification works. **None
of them publish how often it is wrong.**

1. **Identity as accumulated evidence** - a chain of consistent observations,
   not a tag or a fingerprint
2. **A system that tests itself** - known-bad check-ins injected to confirm the
   detectors still fire
3. **We publish our own false-accept rate** - measured, cross-validated
4. **Designed to degrade, not break** - any signal can fail; confidence drops
   and a human reviews

---

## Layout

```
app/       React PWA (Vercel)          - capture, check-in, map, wallet
ml/        FastAPI service (HF Spaces) - the only server-side surface
supabase/  Postgres schema + RLS + column grants
spike/     the image-matching feasibility study and its findings
tools/     icon and ArUco marker generators
docs/      roadmap, setup, deploy, design prompts, defend-this notes
data/      pilot and spike photos
```

## Start here

| Doc | What it is |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | accounts and keys - **do this first** |
| [docs/DEPLOY.md](docs/DEPLOY.md) | deploy, field-test checklist, T0 plan |
| [docs/ROADMAP.md](docs/ROADMAP.md) | week by week, and what each week produces |
| [docs/DEFEND.md](docs/DEFEND.md) | one note per subsystem, written for Q&A |
| [spike/FINDINGS.md](spike/FINDINGS.md) | what we measured, including what failed |
| [docs/STITCH_PROMPT.md](docs/STITCH_PROMPT.md) | design prompts, batched by priority |

## Run it

```bash
# frontend
cd app && npm install && npm run check && npm run dev

# ML service
cd ml && pip install -r requirements.txt
export SUPABASE_URL=... SUPABASE_SERVICE_KEY=...
uvicorn app:app --reload --port 7860

# analysis
python ml/test_scoring.py        # 13 verdict-logic regression tests
python ml/attack_set.py --plan   # the six fraud types
python ml/calibrate.py           # LOTO cross-validation, fitted weights
```

## Measured, not asserted

| | |
|---|---|
| Image matching, rank-1 | **54.2%** vs 5.1% chance - real signal, not identity |
| Pooled AUC | 0.77 - bimodal: strong on distinctive trees, ~0 in a dense stand |
| pHash duplicate gate | 0 of 42 genuine pairs wrongly flagged; a re-encoded copy still scores 0 bits |
| ORB/RANSAC | **measured and switched off** - no discrimination on real photos |
| Trunk measurement | 60.3 mm against a true 60.0 mm on known geometry |
| Verdict logic | a false accept on attack #4, **found and fixed** before any pilot data |

Full write-ups in [spike/FINDINGS.md](spike/FINDINGS.md).

## Non-negotiables

- The client can **never** write its own verification result - enforced by
  Postgres column grants, not application code
- Two scored photos per visit, **no tag in either** - a numbered card in frame
  means the model may match the card
- Tags are field convenience, **never identity**
- Gates run **before** scoring; a gate failure is disqualifying
- NDVI is **never** folded into a per-tree score
- Accuracy is measured by **leave-one-tree-out** cross-validation

## Stack

React PWA · Supabase (Postgres + pgvector + PostGIS + Storage + Auth), called
directly from the client · one FastAPI service on Hugging Face Spaces · DINOv2
ViT-S/14 via **onnxruntime** · Leaflet · Sentinel-2 · MTN MoMo sandbox behind a
mock adapter.

**Free tiers only.**
