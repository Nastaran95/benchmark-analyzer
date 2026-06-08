# Benchmark Analyzer

Web app to visualize DCP-Bench generation status across problems, languages (MiniZinc, CPMpy, pyCSP3), and semantic correctness labels.

All runtime data lives in a single bundled file: `data/benchmark-bundle.json`.

## Bundle the data (required once, re-run when sources change)

The bundle script reads external sources and writes one JSON file:

```powershell
cd benchmark-analyzer
python scripts/bundle_data.py
```

Custom source paths:

```powershell
python scripts/bundle_data.py 
```

Override the bundle location for the app with `BENCHMARK_BUNDLE`.

## Run the app

```powershell
pip install -r requirements.txt
python scripts/bundle_data.py   # if bundle missing or stale
uvicorn server.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend (development):

```powershell
cd web
npm install
npm run dev
```

Open http://127.0.0.1:5173 (Vite proxies `/api`) or http://127.0.0.1:8000 after `npm run build` in `web`.

Or use `.\run.ps1` to bundle, start API, and Vite together.

## Public deploy (free)

See **[DEPLOY.md](DEPLOY.md)** for a step-by-step guide to host on **Render** (free HTTPS, deploy from GitHub, no server admin skills required).

## UI

- **Table**: rows sorted by problem id; **Type / Space** column (CSP/COP, solution space size, time/solution limit); cells show succeed/failed and attempt count.
- **Click a cell**: modal with problem details and generated code (tabs per attempt when available).
