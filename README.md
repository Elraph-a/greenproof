# GreenProof

**Plant a tree. Prove it lives. Get paid.**

People photograph the trees they plant. The system checks each visit is real,
in the right place, and shows a living plant, then attributes it to the planter
so payment can follow survival rather than planting.

---

## Layout

```
app/       React PWA - capture, check-in, map, wallet
ml/        FastAPI verification service - the only server-side surface
supabase/  Postgres schema, row-level security, column grants
tools/     deployment and operational scripts
```

## Stack

React PWA on Vercel · Supabase (Postgres, pgvector, PostGIS, Storage, Auth)
called directly from the client · one FastAPI service on a Hugging Face Space ·
DINOv2 ViT-S/14 via onnxruntime · Leaflet

## Run it

```bash
# frontend
cd app && npm install && npm run dev

# verification service
cd ml && pip install -r requirements.txt
export SUPABASE_URL=... SUPABASE_SERVICE_KEY=...
uvicorn app:app --reload --port 7860
```

See [docs/SETUP.md](docs/SETUP.md) for accounts and keys, and
[docs/DEPLOY.md](docs/DEPLOY.md) to deploy.

## One rule worth knowing

The client can never write its own verification result. `confidence`, `verdict`
and `signals` are writable only by the service key, enforced by Postgres column
grants rather than by application code. Check-ins arrive `pending` and fail safe.
