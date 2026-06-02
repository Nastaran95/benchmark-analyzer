# Deploy publicly (free, beginner-friendly)

**Recommended platform: [Render](https://render.com)** — free tier, public HTTPS URL, deploy from GitHub with almost no server knowledge.

Your app will be available at a URL like:

`https://benchmark-analyzer-xxxx.onrender.com`

---

## What you need

1. A **GitHub** account ([github.com](https://github.com))
2. This project pushed to a **GitHub repository** (public or private)
3. The data file **`data/benchmark-bundle.json`** included in the repo (see step 1 below)

Render’s free plan spins the app down after ~15 minutes without visitors. The first visit after that may take **30–60 seconds** to wake up — normal for free hosting.

---

## Step 1 — Prepare the data file (one time per data update)

On your PC, in the project folder:

```powershell
cd benchmark-analyzer
python scripts/bundle_data.py
```

Then add the bundle to Git (it is required for cloud deploy):

```powershell
git add -f data/benchmark-bundle.json
git add .
git commit -m "Add benchmark bundle for deploy"
git push
```

Whenever benchmark results change, run `bundle_data.py` again, commit, and push — Render redeploys automatically.

---

## Step 2 — Push the project to GitHub

If the repo does not exist yet:

1. On GitHub: **New repository** → name it e.g. `benchmark-analyzer` → Create.
2. In PowerShell (in your project folder):

```powershell
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/benchmark-analyzer.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

---

## Step 3 — Deploy on Render

1. Go to [render.com](https://render.com) and sign up (use **Sign in with GitHub**).
2. Click **New +** → **Blueprint** (or **Web Service** if Blueprint is not shown).
3. **Connect** your GitHub account and select the `benchmark-analyzer` repository.
4. Render should detect `render.yaml`. Click **Apply** / **Create**.
5. Wait for the build (about 5–10 minutes the first time). Status should become **Live**.
6. Open the URL shown at the top (e.g. `https://benchmark-analyzer-xxxx.onrender.com`).

That URL is **fully public** — anyone with the link can open it.

### If you use “Web Service” instead of Blueprint

| Setting | Value |
|---------|--------|
| Language | **Docker** |
| Branch | `main` |
| Dockerfile path | `./Dockerfile` |
| Plan | **Free** |
| Health check path | `/api/meta` |

---

## Step 4 — Update the live site later

1. Run `python scripts/bundle_data.py` when CPJudgeBench data changes.
2. `git add -f data/benchmark-bundle.json`
3. `git commit` and `git push`

Render rebuilds and redeploys on each push to `main`.

---

## Test the production image on your PC (optional)

```powershell
docker build -t benchmark-analyzer .
docker run -p 8000:8000 benchmark-analyzer
```

Open http://127.0.0.1:8000

---

## Other cheap / free options

| Platform | Difficulty | Free tier | Notes |
|----------|------------|-----------|--------|
| **Render** (recommended) | Easy | Yes | GitHub deploy, Docker, HTTPS included |
| [Fly.io](https://fly.io) | Medium | Small free allowance | Needs CLI (`fly launch`) |
| [Railway](https://railway.app) | Easy | Limited free credit | Similar to Render |
| [Hugging Face Spaces](https://huggingface.co/spaces) | Easy | Yes | Good for demos; Docker Space |

For a non-expert, **stay with Render** unless you already use another platform.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails: `benchmark-bundle.json` not found | Run `python scripts/bundle_data.py` and `git add -f data/benchmark-bundle.json` then push |
| Site shows “503” / bundle error | Same as above — bundle missing in the repo |
| Very slow first load | Free tier cold start; wait up to a minute |
| Old data on the site | Re-run bundle script, commit, push |

---

## Security note

The deployed app is **public**. Do not put secrets in the bundle or repository. Benchmark problem text and generated models are visible to anyone with the URL.
