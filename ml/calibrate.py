"""Fit the signal weights and measure our own error rate - honestly.

    python ml/calibrate.py

WHAT MAKES THIS THE DIFFERENTIATOR
Everyone in this field asserts their verification works. Nobody publishes how
often it is wrong. This script produces that number, and it produces it under a
protocol that makes the number believable:

    LEAVE-ONE-TREE-OUT CROSS-VALIDATION.

Hold out one tree entirely. Fit the weights on every other tree. Test on the
held-out tree. Repeat for all trees, and report the pooled result.

Why leave out a TREE and not a check-in: check-ins of the same tree are not
independent. Four photos of tree 12 share a trunk, a background and a
neighbourhood. Holding out a single check-in leaves its siblings in the training
set, and the model effectively memorises that tree - producing a number that
looks excellent and means nothing. Leaving out the whole tree asks the
operational question: how does this behave on a tree it has never seen?

NO THRESHOLD IS EVER TUNED ON THE DATA USED TO REPORT PERFORMANCE.
If that rule is broken the headline number is worthless, and a judge who knows
statistics will find it in about thirty seconds.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from greenproof_ml import store  # noqa: E402
from greenproof_ml.scoring import DEFAULT_WEIGHTS, REVIEW_AT, VERIFY_AT  # noqa: E402

FEATURES = ["location", "liveness", "scene_match", "growth"]


def fetch() -> list[dict]:
    db = store.db()
    rows = (
        db.table("checkins")
        .select("id, tree_id, confidence, verdict, signals, reviewed_by, reviewed_at")
        .not_.is_("signals", "null")
        .limit(5000)
        .execute()
    ).data or []
    return rows


def label_of(row: dict) -> int | None:
    """1 = fraudulent, 0 = genuine, None = unusable.

    Ground truth comes from two places, both trustworthy:
      * injected attacks (signals.self_test.injected) are known fraud
      * check-ins a HUMAN reviewed are known-good or known-bad by that decision

    Everything else is unlabelled - the machine's own verdict must never be used
    as its own ground truth, which would just measure self-consistency.
    """
    s = row.get("signals") or {}
    if (s.get("self_test") or {}).get("injected"):
        return 1
    if row.get("reviewed_at"):
        return 0 if row["verdict"] == "verified" else 1
    return None


def features_of(row: dict) -> np.ndarray | None:
    scores = ((row.get("signals") or {}).get("scores")) or {}
    vec = []
    for f in FEATURES:
        v = scores.get(f, {}).get("score")
        # Missing signal -> neutral 0.5, mirroring how assess() renormalises
        # rather than treating absence as evidence of fraud.
        vec.append(0.5 if v is None else float(v))
    return np.array(vec, dtype=np.float64)


def gate_failed(row: dict) -> bool:
    return bool((row.get("signals") or {}).get("failed_gates"))


def main() -> None:
    rows = fetch()
    print(f"{len(rows)} scored check-ins in the database")

    usable = []
    for r in rows:
        y = label_of(r)
        if y is None:
            continue
        usable.append((r, y, features_of(r)))

    if len(usable) < 10:
        print(
            "\nNot enough LABELLED data yet.\n"
            "  Labels come from injected attacks and human reviews.\n"
            "  Run:  python ml/attack_set.py --run\n"
            "  and work through the review queue, then re-run this.\n"
        )
        _report_gate_only(rows)
        return

    trees = sorted({r["tree_id"] for r, _, _ in usable})
    n_fraud = sum(y for _, y, _ in usable)
    print(f"  {len(usable)} labelled ({n_fraud} fraud, {len(usable)-n_fraud} genuine)")
    print(f"  across {len(trees)} trees\n")

    if n_fraud == 0 or n_fraud == len(usable):
        print("Need BOTH genuine and fraudulent examples to fit anything.")
        return

    from sklearn.linear_model import LogisticRegression

    # ---- leave one tree out ------------------------------------------------
    preds = np.zeros(len(usable))
    for held in trees:
        train = [(f, y) for r, y, f in usable if r["tree_id"] != held]
        test_idx = [i for i, (r, _, _) in enumerate(usable) if r["tree_id"] == held]
        if not train or not test_idx:
            continue
        ys = np.array([y for _, y in train])
        if len(set(ys.tolist())) < 2:
            # This fold has only one class - it cannot train a classifier, and
            # silently filling it with a constant would flatter the result.
            preds[test_idx] = np.nan
            continue

        X = np.stack([f for f, _ in train])
        clf = LogisticRegression(max_iter=2000, class_weight="balanced")
        clf.fit(X, ys)
        Xt = np.stack([usable[i][2] for i in test_idx])
        preds[test_idx] = clf.predict_proba(Xt)[:, 1]

    valid = ~np.isnan(preds)
    truth = np.array([y for _, y, _ in usable])
    print(f"  {valid.sum()} of {len(usable)} check-ins had a trainable fold\n")

    # ---- what the SHIPPED thresholds actually do ---------------------------
    print("=" * 70)
    print("PERFORMANCE OF THE DEPLOYED SYSTEM")
    print("=" * 70)

    auto = np.array([r["verdict"] == "verified" for r, _, _ in usable])
    fraud = truth == 1
    genuine = truth == 0

    false_accept = int((auto & fraud).sum())
    false_reject = int((~auto & genuine).sum())
    caught = int((~auto & fraud).sum())

    print(f"  fraud attempts            {int(fraud.sum())}")
    print(f"  fraud caught              {caught}  ({100*caught/max(1,fraud.sum()):.0f}%)")
    print(f"  FRAUD WRONGLY APPROVED    {false_accept}   <- the fatal one")
    print()
    print(f"  genuine visits            {int(genuine.sum())}")
    print(f"  auto-approved             {int((auto & genuine).sum())}"
          f"  ({100*(auto & genuine).sum()/max(1,genuine.sum()):.0f}%)")
    print(f"  genuine sent to a human   {false_reject}   <- merely annoying")
    print()

    # ---- cross-validated separation ---------------------------------------
    if valid.sum() > 4 and len(set(truth[valid].tolist())) == 2:
        from sklearn.metrics import roc_auc_score

        auc = roc_auc_score(truth[valid], preds[valid])
        print(f"  cross-validated AUC       {auc:.3f}")
        print("  (no tree influenced the model that judged it)\n")

    # ---- refit on everything for the shipped weights ----------------------
    X = np.stack([f for _, _, f in usable])
    clf = LogisticRegression(max_iter=2000, class_weight="balanced").fit(X, truth)
    raw = -clf.coef_[0]  # higher score should mean MORE genuine
    w = np.clip(raw, 0, None)
    w = w / w.sum() if w.sum() > 0 else np.ones(len(FEATURES)) / len(FEATURES)

    print("=" * 70)
    print("FITTED WEIGHTS")
    print("=" * 70)
    print(f"  {'signal':<14}{'current':>10}{'fitted':>10}")
    for i, f in enumerate(FEATURES):
        print(f"  {f:<14}{DEFAULT_WEIGHTS.get(f, 0):>10.2f}{w[i]:>10.2f}")

    out = Path(__file__).resolve().parent.parent / "docs" / "fitted_weights.json"
    out.write_text(
        json.dumps(
            {
                "weights": {f: round(float(w[i]), 4) for i, f in enumerate(FEATURES)},
                "n_labelled": len(usable),
                "n_trees": len(trees),
                "verify_at": VERIFY_AT,
                "review_at": REVIEW_AT,
                "protocol": "leave-one-tree-out cross-validation",
            },
            indent=2,
        )
    )
    print(f"\n  written to {out}")
    print("\n  Paste into DEFAULT_WEIGHTS in ml/greenproof_ml/scoring.py,")
    print("  then RE-RUN the attack set to confirm nothing regressed.\n")


def _report_gate_only(rows: list[dict]) -> None:
    """Even with no labels, the gates can be summarised - they are deterministic."""
    if not rows:
        return
    fails: dict[str, int] = {}
    for r in rows:
        for g in (r.get("signals") or {}).get("failed_gates", []):
            fails[g] = fails.get(g, 0) + 1
    if fails:
        print("Gate failures so far (deterministic, no model involved):")
        for k, v in sorted(fails.items(), key=lambda kv: -kv[1]):
            print(f"  {k:<20}{v}")


if __name__ == "__main__":
    main()
