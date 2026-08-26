# Rollback

**Read this if something breaks and you need to get back to a known-good state.**

Everything done on 26 August is reversible. This page says how, in the order you
would actually need it, from cheapest to most drastic.

> **First, the reassuring part.** The verification engine was never modified.
> `scoring.py`, `pipeline.py`, `signals.py` and `embed.py` have zero changes, all
> 26 regression tests pass, and re-scoring all 38 check-ins reproduces every
> verdict and confidence exactly. Nothing added on 26 August can change a score.

---

## The fastest fix, if the demo misbehaves on stage

**Do nothing.** A check-in that cannot be scored stays `pending`, which is
documented, intended behaviour. Say so - it is one of the four claims the project
is built on:

> *"The scoring service is unreachable right now, so this check-in is queued.
> That is exactly what should happen - verification is asynchronous by design."*

---

## 1 · The scoring service (30 seconds)

The app finds the service through one row of `app_config`, so switching hosts
needs no rebuild and no phone setup.

```bash
python tools/set_ml_url.py --show                     # where it points now
python tools/start_demo.py                            # back to the laptop tunnel
python tools/set_ml_url.py https://elraphaa-greenproof-ml.hf.space   # back to the Space
```

Verify before trusting either:

```bash
python tools/check_ml.py <url>
```

Exits 0 only when scoring is genuinely ready. Do not publish a URL that fails it.

---

## 2 · The capture flow (the real risk)

Registration went from **five steps to six**, and the leaf photo is **required**.
This is the flow that runs live at minute 3, and it is the only change on 26
August that touches it.

**If the leaf step misbehaves on the phone**, make it optional again:

- `app/src/screens/Register.tsx` - in `canAdvance`, change the `step === 4` branch
  from `Boolean(leaf)` to `true`
- `app/src/screens/CheckIn.tsx` - in the pinned action for step 5, drop `!leaf`
  from `disabled`

Nothing else needs touching. The upload already tolerates a missing leaf photo,
`leaf_photo` is nullable, and every downstream consumer handles null - the
advisory layer runs on whatever photographs exist, which is how it worked on all
38 pilot check-ins that predate the column.

**Or revert the whole capture change:**

```bash
git revert 5332165      # "Make the leaf photo a required step"
```

---

## 3 · The duplicate merge (tested)

Three tree rows were deleted on 26 August after visual confirmation. This is the
one genuinely destructive change, and it has a backup and a tested restore.

```bash
python tools/restore_merge.py backups/2026-08-26-merge-backup.json          # dry run
python tools/restore_merge.py backups/2026-08-26-merge-backup.json --apply
python tools/score_pilot.py                                                 # recompute
```

Restores the deleted trees with their **original ids**, puts every check-in back
on the tree it belonged to, and repoints the ledger entries.

Verdicts are not in the backup and do not need to be - they are derived from the
photographs and `score_pilot.py` recomputes them identically.

> **The backup lives in `backups/`, which is gitignored.** It exists on this
> laptop and nowhere else. Copy it somewhere else before wiping anything.

---

## 4 · The advisory layer

Advisory columns are additive and inert. Nothing reads them but the Care advice
card; no gate, score, verdict or payment consults them.

**To switch advice off entirely**, remove `GEMINI_API_KEY` (and
`ANTHROPIC_API_KEY`) from the environment and from the Space settings. `/score`
is unaffected; `/advise` returns `{"written": false}`. That is a supported state,
not a failure.

**To drop the columns** - rarely correct, and it destroys every advice row
already generated:

```
supabase/migrations/0011_advice_down.sql
```

---

## 5 · The code, wholesale

Fourteen commits were made on 26 August, on top of `6698560`. **None were
pushed.**

```bash
git log --oneline 6698560..HEAD     # what changed
git diff 6698560..HEAD -- ml/       # review before discarding
git reset --hard 6698560            # DESTRUCTIVE: discards all fourteen
```

Prefer reverting the single commit that causes trouble over resetting the lot -
the advisory layer, the Space deployment and the duplicate fixes are independent
of each other.

| Commit | What it does |
|---|---|
| `0996f1b` | the advisory layer |
| `5332165` | leaf photo becomes a required step |
| `fa8d464` | duplicate ranking by photograph |
| `4ca515e` | `ADVISE_TOKEN` on `/advise` |
| `c3aa7bf` | two providers, Gemini default |

**Note the schema does not roll back with the code.** If you reset past `0011`,
the database still has the columns - which is harmless, because an older client
simply never writes them.

---

## What is genuinely not recoverable

**Nothing, as of 26 August.** The photographs are the evidence and they are
untouched in Supabase Storage. Every verdict is derived and replayable. The one
destructive operation has a backup and a tested restore.

The thing to protect is `backups/` and the Storage bucket. Everything else can be
rebuilt from them.
