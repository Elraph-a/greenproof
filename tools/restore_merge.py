#!/usr/bin/env python3
"""Undo a duplicate-tree merge, from the backup taken before it ran.

    python tools/restore_merge.py backups/2026-08-26-merge-backup.json          # dry run
    python tools/restore_merge.py backups/2026-08-26-merge-backup.json --apply

WHY THIS EXISTS

Merging duplicate registrations deletes tree rows. That is the one genuinely
destructive thing done to this database, and the pilot data is unrepeatable -
the check-in rounds are calendar-bound and the trees were photographed on days
that will not come back. A destructive operation without a tested way back is
not a finished operation.

WHAT IT RESTORES

    1. the deleted `trees` rows, with their ORIGINAL ids
    2. every check-in back to the tree it belonged to
    3. every ledger entry back to the tree it was accrued against

WHAT IT CANNOT RESTORE, AND WHY THAT IS FINE

Verdicts, confidences and signal breakdowns are DERIVED. They are not in the
backup because they do not need to be: the photographs are the evidence and
`tools/score_pilot.py` recomputes every verdict from them. Run it afterwards and
the numbers come back identical - that replayability is the reason scoring was
built as a separate pass in the first place.

Advice rows are likewise not restored. They are advisory, they were written
after the merge, and `tools/advise_pilot.py` regenerates them.

DRY RUN BY DEFAULT. It prints exactly what it would do and changes nothing until
--apply. Given what this touches, defaulting to the destructive direction would
be the wrong shape for a tool used at 2am.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ml"))
sys.path.insert(0, str(ROOT / "tools"))

from score_pilot import load_env  # noqa: E402

# Columns that exist on `trees` and are safe to write back. Generated columns
# (location) and anything the database owns are excluded deliberately - Postgres
# recomputes `location` from lat/lng and rejects an explicit value.
TREE_COLUMNS = [
    "id", "tag_code", "species", "planted_estimate", "plot_id",
    "owner_id", "registered_by", "lat", "lng", "heading_deg",
    "status", "current_confidence", "created_at",
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("backup", help="the merge_backup.json written before the merge")
    ap.add_argument("--apply", action="store_true", help="actually write (default is a dry run)")
    args = ap.parse_args()

    path = Path(args.backup)
    if not path.exists():
        print(f"No such backup: {path}", file=sys.stderr)
        return 2

    load_env()
    from greenproof_ml import store

    d = store.db()
    data = json.loads(path.read_text(encoding="utf-8"))
    print(f"backup taken {data['taken_at'][:19]}")
    print("DRY RUN - nothing will change\n" if not args.apply else "APPLYING\n")

    live = {t["id"] for t in (d.table("trees").select("id").execute().data or [])}

    for gname, g in data["groups"].items():
        keeper = g["keeper"]
        print(f"--- {gname} (keeper {keeper['id'][:8]}) ---")

        for tree in g["duplicates"]:
            if tree["id"] in live:
                print(f"  {tree['id'][:8]}  already present, skipping")
                continue
            row = {k: tree.get(k) for k in TREE_COLUMNS if k in tree}
            if args.apply:
                d.table("trees").insert(row).execute()
            print(f"  {tree['id'][:8]}  {'restored' if args.apply else 'would restore'} tree row")

        # Put each check-in back on the tree it was recorded against.
        for ck in g["checkins"]:
            cur = d.table("checkins").select("tree_id").eq("id", ck["id"]).execute().data
            if not cur:
                print(f"  {ck['id'][:8]}  check-in no longer exists, skipping")
                continue
            if cur[0]["tree_id"] == ck["tree_id"]:
                continue
            if args.apply:
                d.table("checkins").update({"tree_id": ck["tree_id"]}).eq("id", ck["id"]).execute()
            print(f"  {ck['id'][:8]}  {'moved' if args.apply else 'would move'} back to {ck['tree_id'][:8]}")

        for led in g["ledger"]:
            cur = d.table("ledger_entries").select("tree_id").eq("id", led["id"]).execute().data
            if not cur or cur[0]["tree_id"] == led["tree_id"]:
                continue
            if args.apply:
                d.table("ledger_entries").update({"tree_id": led["tree_id"]}).eq("id", led["id"]).execute()
            print(f"  ledger {led['id'][:8]}  {'repointed' if args.apply else 'would repoint'} to {str(led['tree_id'])[:8]}")
        print()

    if args.apply:
        print("Restored. Now recompute the derived values:\n")
        print("    python tools/score_pilot.py")
        print("\nVerdicts are derived from the photographs, so they come back identical.")
    else:
        print("Nothing changed. Re-run with --apply to perform the restore.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
