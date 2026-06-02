from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import CORRECTNESS_LABELS, LANGUAGES
from .data_loader import (
    BundleNotFoundError,
    build_table_rows,
    get_problem_detail,
    load_bundle,
)

app = FastAPI(title="Benchmark Analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/meta")
def meta():
    try:
        bundle_meta = load_bundle().get("meta", {})
        return {
            "languages": bundle_meta.get("languages", LANGUAGES),
            "labels": bundle_meta.get("labels", CORRECTNESS_LABELS),
        }
    except BundleNotFoundError as exc:
        raise HTTPException(503, str(exc)) from exc


@app.get("/api/table")
def table():
    try:
        return {"rows": build_table_rows()}
    except BundleNotFoundError as exc:
        raise HTTPException(503, str(exc)) from exc


@app.get("/api/problem/{problem_id}")
def problem_detail(
    problem_id: str,
    language: str = Query(...),
    label: str = Query(...),
):
    if language not in LANGUAGES:
        raise HTTPException(400, f"language must be one of {LANGUAGES}")
    if label not in CORRECTNESS_LABELS:
        raise HTTPException(400, f"label must be one of {CORRECTNESS_LABELS}")

    try:
        detail = get_problem_detail(problem_id, language, label)
    except BundleNotFoundError as exc:
        raise HTTPException(503, str(exc)) from exc
    if detail is None:
        raise HTTPException(404, "Problem not found")
    return detail


dist = Path(__file__).resolve().parent.parent / "web" / "dist"
if dist.is_dir():
    app.mount("/", StaticFiles(directory=str(dist), html=True), name="static")
