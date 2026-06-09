from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import BUNDLE_PATH, CORRECTNESS_LABELS, JUDGE_CSV_LOCAL, JUDGE_CSV_PATH, LANGUAGES


class BundleNotFoundError(FileNotFoundError):
    pass


_bundle_cache: dict[str, Any] | None = None
_bundle_mtime: float | None = None


def load_bundle() -> dict[str, Any]:
    """Load bundle JSON; reload automatically when the file changes on disk."""
    global _bundle_cache, _bundle_mtime

    if not BUNDLE_PATH.is_file():
        raise BundleNotFoundError(
            f"Benchmark bundle not found at {BUNDLE_PATH}. "
            "Run: python scripts/bundle_data.py"
        )

    mtime = BUNDLE_PATH.stat().st_mtime
    if _bundle_cache is None or _bundle_mtime != mtime:
        with BUNDLE_PATH.open(encoding="utf-8") as f:
            _bundle_cache = json.load(f)
        _bundle_mtime = mtime

    return _bundle_cache


def _summary_for_problem(problem: dict[str, Any]) -> dict[str, Any] | None:
    summary = problem.get("summary")
    if summary:
        return summary
    return None


def load_problems() -> list[dict[str, Any]]:
    return list(load_bundle()["problems"])


def load_status_index() -> dict[str, dict[str, Any]]:
    return dict(load_bundle()["status"])


def _cell_key(language: str, label: str) -> str:
    return f"{language}|{label}"


def build_table_rows() -> list[dict[str, Any]]:
    bundle = load_bundle()
    problems = bundle["problems"]
    status = bundle["status"]
    rows: list[dict[str, Any]] = []

    for problem in problems:
        cells: dict[str, dict[str, Any]] = {}
        for language in LANGUAGES:
            for label in CORRECTNESS_LABELS:
                key = f"{problem['id']}|{language}|{label}"
                entry = status.get(key)
                if entry:
                    cells[_cell_key(language, label)] = {
                        "succeed": entry["succeed"],
                        "attempts": entry["attempts"],
                        "status": "recorded",
                    }
                else:
                    cells[_cell_key(language, label)] = {
                        "succeed": None,
                        "attempts": 0,
                        "status": "missing",
                    }
        rows.append(
            {
                "family": problem["family"],
                "problem_id": problem["id"],
                "summary": _summary_for_problem(problem),
                "cells": cells,
            }
        )
    return rows


def _load_generation_json(problem_id: str) -> dict[str, Any] | None:
    data = load_bundle()["generation_by_problem"].get(problem_id)
    return data if data else None


def _first_llm_block(data: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    if not data:
        return "", {}
    llm_key = next(iter(data))
    return llm_key, data[llm_key]


def get_generated_codes(
    problem_id: str, language: str, label: str
) -> dict[str, Any]:
    data = _load_generation_json(problem_id)
    if not data:
        return {"attempts": [], "final_code": None, "llm": None}

    llm, llm_data = _first_llm_block(data)
    lang_data = (llm_data or {}).get(language, {})
    label_data = lang_data.get(label)
    if not label_data:
        return {"attempts": [], "final_code": None, "llm": llm}

    attempts: list[dict[str, Any]] = []
    history = label_data.get("attempt_history") or []
    final_code = label_data.get("code")
    attempts_used = label_data.get("attempts_used")

    def _attempt_entry(
        attempt_num: int,
        code: str | None,
        *,
        exec_status: str | None = None,
        observed_label: str | None = None,
        error_summary: str = "",
    ) -> dict[str, Any]:
        return {
            "attempt": attempt_num,
            "code": code,
            "exec_status": exec_status or label_data.get("final_exec_status"),
            "observed_label": observed_label or label_data.get("final_observed_label"),
            "error_summary": error_summary,
        }

    if not history:
        # No per-attempt history: only top-level code exists — show it on the last tab.
        if final_code:
            last_num = max(1, int(attempts_used or 1))
            for i in range(1, last_num):
                attempts.append(_attempt_entry(i, None))
            attempts.append(_attempt_entry(last_num, final_code))
    else:
        for item in history:
            attempt_num = item.get("attempt", len(attempts) + 1)
            attempts.append(
                _attempt_entry(
                    attempt_num,
                    item.get("code"),
                    exec_status=item.get("exec_status"),
                    observed_label=item.get("observed_label"),
                    error_summary=item.get("error_summary", ""),
                )
            )
        # History metadata only (no stored codes): final code belongs on the last attempt.
        if attempts and final_code:
            last = attempts[-1]
            stored = last.get("code")
            if not stored or not str(stored).strip():
                last["code"] = final_code

    return {
        "llm": llm,
        "attempts": attempts,
        "final_code": final_code,
        "attempts_used": label_data.get("attempts_used"),
        "final_observed_label": label_data.get("final_observed_label"),
        "final_fp": label_data.get("final_fp"),
        "final_fn": label_data.get("final_fn"),
        "final_candidate_space_size": label_data.get("final_candidate_space_size"),
        "final_candidate_truncated": label_data.get("final_candidate_truncated"),
    }


def compute_detailed_stats() -> dict[str, Any]:
    bundle = load_bundle()
    gbp: dict[str, Any] = bundle.get("generation_by_problem", {})

    all_problems: list[dict[str, Any]] = sorted(
        bundle["problems"], key=lambda p: p["id"]
    )
    problem_ids = {p["id"] for p in all_problems}

    LABEL_KEYS = [
        "equivalent",
        "unsound",
        "incomplete",
        "unsound-incomplete",
        "non-executable",
    ]
    VALID_LABELS = set(LABEL_KEYS)
    languages: list[str] = bundle.get("meta", {}).get("languages", LANGUAGES)

    # per_lang_label[lang][label] = list of case dicts
    per_lang_label: dict[str, dict[str, list[dict[str, Any]]]] = {
        lang: {lbl: [] for lbl in LABEL_KEYS} for lang in languages
    }

    for pid in problem_ids:
        gen_data = gbp.get(pid)
        if not gen_data:
            continue
        llm_key = next(iter(gen_data), None)
        if not llm_key:
            continue
        llm_data = gen_data[llm_key]

        for lang in languages:
            if lang not in llm_data:
                continue
            for lbl in LABEL_KEYS:
                v = llm_data[lang].get(lbl)
                if v is None:
                    continue
                attempts_used = int(v.get("attempts_used") or 1)
                ok = bool(v.get("ok"))
                target: str = v.get("target_label_attempted") or lbl
                history: list[dict[str, Any]] = v.get("attempt_history") or []

                first_ok = bool(
                    history and history[0].get("observed_label") == lbl
                )
                # Opportunistic: the session succeeded but was targeting a different
                # label slot — the result was captured under this slot incidentally.
                opp = ok and target != lbl

                per_lang_label[lang][lbl].append(
                    {
                        "attempts": attempts_used,
                        "ok": ok,
                        "first_ok": first_ok,
                        "opp": opp,
                    }
                )

    def _aggregate(cases: list[dict[str, Any]]) -> dict[str, Any]:
        if not cases:
            return {
                "cases": 0, "succ": 0, "fail": 0, "rate": 0.0,
                "tot": 0, "avg": 0.0, "med": 0.0, "first": 0, "opp": 0,
            }
        n = len(cases)
        succ = sum(1 for c in cases if c["ok"])
        tot = sum(c["attempts"] for c in cases)
        sorted_att = sorted(c["attempts"] for c in cases)
        mid = len(sorted_att) // 2
        med = (
            float(sorted_att[mid])
            if len(sorted_att) % 2 == 1
            else (sorted_att[mid - 1] + sorted_att[mid]) / 2.0
        )
        return {
            "cases": n,
            "succ": succ,
            "fail": n - succ,
            "rate": round(succ / n * 100, 1),
            "tot": tot,
            "avg": round(tot / n, 2),
            "med": med,
            "first": sum(1 for c in cases if c["first_ok"]),
            "opp": sum(1 for c in cases if c["opp"]),
        }

    result_langs: dict[str, Any] = {}
    all_cases: list[dict[str, Any]] = []

    for lang in languages:
        lang_cases: list[dict[str, Any]] = []
        lang_labels: dict[str, Any] = {}
        for lbl in LABEL_KEYS:
            cases = per_lang_label[lang][lbl]
            lang_labels[lbl] = _aggregate(cases)
            lang_cases.extend(cases)
        all_cases.extend(lang_cases)
        result_langs[lang] = {
            "all": _aggregate(lang_cases),
            "labels": lang_labels,
        }

    return {
        "problem_count": len(all_problems),
        "label_keys": LABEL_KEYS,
        "languages": languages,
        "overall": _aggregate(all_cases),
        "per_language": result_langs,
    }


def get_problem_detail(
    problem_id: str, language: str, label: str
) -> dict[str, Any] | None:
    problems = {p["id"]: p for p in load_problems()}
    problem = problems.get(problem_id)
    if not problem:
        return None

    status_key = f"{problem_id}|{language}|{label}"
    status = load_status_index().get(status_key)
    generated = get_generated_codes(problem_id, language, label)

    return {
        **problem,
        "language": language,
        "label": label,
        "generation": {
            "succeed": status["succeed"] if status else None,
            "attempts": status["attempts"] if status else generated.get("attempts_used"),
            "generator_llm": status.get("generator_llm") if status else generated.get("llm"),
        },
        "generated_codes": generated,
    }


def compute_judge_stats() -> dict[str, Any]:
    """Accuracy of each judge LLM per language and label (reference-free approach).

    On every call the source CSV is copied into data/judge-status.csv so the
    project folder always holds a fresh local snapshot.
    """
    import csv
    import shutil

    if JUDGE_CSV_PATH.is_file():
        JUDGE_CSV_LOCAL.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(JUDGE_CSV_PATH, JUDGE_CSV_LOCAL)

    read_path = JUDGE_CSV_LOCAL if JUDGE_CSV_LOCAL.is_file() else JUDGE_CSV_PATH
    if not read_path.is_file():
        return {"available": False}

    with read_path.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        rows = [r for r in reader if r.get("approach") == "reference_free"]

    if not rows:
        return {"available": False}

    LABEL_KEYS = [
        "equivalent",
        "unsound",
        "incomplete",
        "unsound-incomplete",
        "non-executable",
    ]

    judge_llms: list[str] = sorted({r["judge_llm"] for r in rows})
    languages: list[str] = sorted({r["language"] for r in rows})

    def _acc(subset: list[dict[str, str]]) -> dict[str, Any]:
        """Return {judge_llm: {acc, n}} over *subset* rows."""
        per_judge: dict[str, Any] = {}
        for judge in judge_llms:
            jrows = [r for r in subset if r["judge_llm"] == judge]
            if not jrows:
                per_judge[judge] = {"acc": None, "n": 0}
            else:
                correct = sum(1 for r in jrows if r["succeed"] == "yes")
                per_judge[judge] = {
                    "acc": round(correct / len(jrows) * 100, 1),
                    "n": len(jrows),
                }
        return per_judge

    def _cases(subset: list[dict[str, str]]) -> int:
        """Unique benchmark items (problem_id × label) regardless of judge."""
        return len({(r["problem_id"], r["label"]) for r in subset})

    per_language: dict[str, Any] = {}
    for lang in languages:
        lang_rows = [r for r in rows if r["language"] == lang]

        labels_stats: dict[str, Any] = {}
        for lbl in LABEL_KEYS:
            lbl_rows = [r for r in lang_rows if r["label"] == lbl]
            if not lbl_rows:
                continue
            labels_stats[lbl] = {
                "cases": _cases(lbl_rows),
                "per_judge": _acc(lbl_rows),
            }

        per_language[lang] = {
            "overall": {
                "cases": _cases(lang_rows),
                "per_judge": _acc(lang_rows),
            },
            "labels": labels_stats,
        }

    return {
        "available": True,
        "judge_llms": judge_llms,
        "label_keys": LABEL_KEYS,
        "languages": languages,
        "per_language": per_language,
    }
