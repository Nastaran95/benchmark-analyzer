import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

BUNDLE_PATH = Path(
    os.environ.get(
        "BENCHMARK_BUNDLE",
        str(ROOT / "data" / "benchmark-bundle.json"),
    )
)

LANGUAGES = ["minizinc", "CPMpy", "pyCSP3"]

CORRECTNESS_LABELS = [
    "non-executable",
    "equivalent",
    "unsound",
    "incomplete",
    "unsound-incomplete",
]
