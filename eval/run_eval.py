"""Run the checks service over eval/datasets and report per-class metrics + calibration.

Usage: uv run --project services/checks python eval/run_eval.py --labels eval/datasets/labels.csv --out eval/reports/<version>.json
Phase 1 fills this in; the skeleton exists so CI can gate on it from the start.
"""
import argparse, csv, json, sys
from pathlib import Path

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--labels", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    rows = list(csv.DictReader(open(a.labels)))
    if not rows:
        print("no labelled rows; nothing to evaluate"); return 0
    # TODO Phase 1: call registry.run per check, aggregate(), compare to label, compute
    #   precision/recall per class, FPR on real-*, ECE + reliability curve, and post-recompression deltas.
    Path(a.out).write_text(json.dumps({"n": len(rows), "status": "skeleton"}, indent=2))
    return 0

if __name__ == "__main__":
    sys.exit(main())
