#!/usr/bin/env python3
"""
Collect benchmark problems, generation status, and candidate models from
external sources into a single JSON bundle for the web app.

Usage:
  python scripts/bundle_data.py
  python scripts/bundle_data.py --output data/benchmark-bundle.json
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_JSONL = ROOT / "dcp-bench-open.jsonl"
DEFAULT_SUMMARY_CSV = ROOT / "dcp_bench_open_summary.csv"
DEFAULT_STATUS_CSV = Path(
    r"C:\Users\nmofa\Nastaran\configit\CPJudgeBench\logs\benchmark-status.csv"
)
DEFAULT_DATA_STORAGE = Path(
    r"C:\Users\nmofa\Nastaran\configit\CPJudgeBench\data-storage"
)
DEFAULT_OUTPUT = ROOT / "data" / "benchmark-bundle.json"

LANGUAGES = ["minizinc", "CPMpy", "pyCSP3"]
CORRECTNESS_LABELS = [
    "non-executable",
    "equivalent",
    "unsound",
    "incomplete",
    "unsound-incomplete",
]


def _extract_family(metadata: list[str]) -> str:
    for line in metadata:
        if "Category:" in line:
            return line.split("Category:", 1)[1].strip()
    return "unknown"


def load_problems(jsonl_path: Path) -> list[dict]:
    problems: list[dict] = []
    with jsonl_path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            example_instance = row.get("example_instance") or ""
            if not example_instance and row.get("instances"):
                example_instance = json.dumps(row["instances"][0], indent=2)
            problems.append(
                {
                    "id": row["id"],
                    "family": _extract_family(row.get("metadata", [])),
                    "description": row.get("description", ""),
                    "model": row.get("model", ""),
                    "decision_variables": row.get("decision_variables", []),
                    "example_instance": example_instance,
                    "example_solution": row.get("example_solution"),
                }
            )
    problems.sort(key=lambda p: p["id"])
    return problems


def _parse_float(value: str | None) -> float | None:
    if value is None or value == "" or value.lower() == "nan":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_bool(value: str | None) -> bool | None:
    if value is None or value == "":
        return None
    return value.strip().lower() in ("true", "1", "yes")


def load_summary(summary_csv: Path) -> dict[str, dict]:
    """Key: problem id."""
    index: dict[str, dict] = {}
    if not summary_csv.is_file():
        print(f"Warning: summary CSV not found: {summary_csv}", file=sys.stderr)
        return index

    with summary_csv.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            pid = row.get("id", "").strip()
            if not pid:
                continue
            index[pid] = {
                "problem_type": row.get("problem_type", ""),
                "solution_space_size": _parse_float(row.get("solution_space_size")),
                "stop_reason": row.get("stop_reason", ""),
                "is_solution_space_complete": _parse_bool(
                    row.get("is_solution_space_complete")
                ),
                "runtime_sec": _parse_float(row.get("runtime_sec")),
            }
    return index


def attach_summary(problems: list[dict], summary: dict[str, dict]) -> None:
    missing: list[str] = []
    for problem in problems:
        entry = summary.get(problem["id"])
        if entry:
            problem["summary"] = entry
        else:
            problem["summary"] = None
            missing.append(problem["id"])
    if missing:
        print(
            f"Warning: no summary row for {len(missing)} problem(s)",
            file=sys.stderr,
        )


def load_status(status_csv: Path) -> dict[str, dict]:
    index: dict[str, dict] = {}
    if not status_csv.is_file():
        print(f"Warning: status CSV not found: {status_csv}", file=sys.stderr)
        return index

    with status_csv.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = f"{row['problem_id']}|{row['language']}|{row['target_label']}"
            succeed_raw = (row.get("succeed") or "").strip().lower()
            index[key] = {
                "succeed": succeed_raw in ("yes", "true", "1"),
                "attempts": int(row.get("attempts") or 0),
                "generator_llm": row.get("generator_llm", ""),
            }
    return index


def load_generation_for_problem(data_storage: Path, problem_id: str) -> dict | None:
    candidates = data_storage / problem_id / "candidates"
    for name in (
        "candidate-models-data-generation.json",
        "candidate-models.json",
    ):
        path = candidates / name
        if path.is_file():
            with path.open(encoding="utf-8") as f:
                return json.load(f)
    return None


def build_bundle(
    jsonl_path: Path,
    status_csv: Path,
    data_storage: Path,
    summary_csv: Path,
) -> dict:
    problems = load_problems(jsonl_path)
    attach_summary(problems, load_summary(summary_csv))
    status = load_status(status_csv)

    generation_by_problem: dict[str, dict | None] = {}
    missing_generation: list[str] = []

    for problem in problems:
        pid = problem["id"]
        data = load_generation_for_problem(data_storage, pid)
        generation_by_problem[pid] = data
        if data is None:
            missing_generation.append(pid)

    if missing_generation:
        print(
            f"Warning: no generation data for {len(missing_generation)} problem(s)",
            file=sys.stderr,
        )

    return {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources": {
            "benchmark_jsonl": str(jsonl_path.resolve()),
            "summary_csv": str(summary_csv.resolve()),
            "status_csv": str(status_csv.resolve()),
            "data_storage": str(data_storage.resolve()),
        },
        "meta": {
            "languages": LANGUAGES,
            "labels": CORRECTNESS_LABELS,
        },
        "problems": problems,
        "status": status,
        "generation_by_problem": generation_by_problem,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Bundle benchmark data into one JSON file")
    parser.add_argument("--jsonl", type=Path, default=DEFAULT_JSONL)
    parser.add_argument("--summary-csv", type=Path, default=DEFAULT_SUMMARY_CSV)
    parser.add_argument("--status-csv", type=Path, default=DEFAULT_STATUS_CSV)
    parser.add_argument("--data-storage", type=Path, default=DEFAULT_DATA_STORAGE)
    parser.add_argument("--output", "-o", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    if not args.jsonl.is_file():
        print(f"Error: benchmark JSONL not found: {args.jsonl}", file=sys.stderr)
        return 1

    bundle = build_bundle(
        args.jsonl, args.status_csv, args.data_storage, args.summary_csv
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False, indent=2)

    size_mb = args.output.stat().st_size / (1024 * 1024)
    print(f"Wrote {args.output}")
    print(f"  problems: {len(bundle['problems'])}")
    print(f"  status entries: {len(bundle['status'])}")
    print(
        "  generation files: "
        f"{sum(1 for v in bundle['generation_by_problem'].values() if v)}"
    )
    print(f"  size: {size_mb:.2f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
