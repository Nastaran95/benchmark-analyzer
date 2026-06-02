from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import BUNDLE_PATH, CORRECTNESS_LABELS, LANGUAGES


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

    for item in history:
        attempt_num = item.get("attempt", len(attempts) + 1)
        code = item.get("code")
        attempts.append(
            {
                "attempt": attempt_num,
                "code": code,
                "exec_status": item.get("exec_status"),
                "observed_label": item.get("observed_label"),
                "error_summary": item.get("error_summary", ""),
            }
        )

    if not attempts and final_code:
        attempts = [
            {
                "attempt": 1,
                "code": final_code,
                "exec_status": label_data.get("final_exec_status"),
                "observed_label": label_data.get("final_observed_label"),
                "error_summary": label_data.get("final_error_summary", ""),
            }
        ]

    if attempts and final_code:
        for entry in reversed(attempts):
            if entry.get("label_match") or entry.get("exec_status") == "ok":
                if not entry.get("code"):
                    entry["code"] = final_code
                break
        else:
            if not attempts[-1].get("code"):
                attempts[-1]["code"] = final_code

    return {
        "llm": llm,
        "attempts": attempts,
        "final_code": final_code,
        "attempts_used": label_data.get("attempts_used"),
        "final_observed_label": label_data.get("final_observed_label"),
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
