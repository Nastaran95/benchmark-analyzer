# Bundle data, start API + Vite dev server
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

python scripts/bundle_data.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$judgeSrc = Join-Path $root "..\CPJudgeBench\logs\judge-status.csv"
$judgeDst = Join-Path $root "data\judge-status.csv"
if (Test-Path $judgeSrc) {
    Copy-Item -Path $judgeSrc -Destination $judgeDst -Force
    Write-Host "Copied judge-status.csv -> data\"
} else {
    Write-Warning "judge-status.csv not found at $judgeSrc (judge stats table will be empty)"
}

# Stop any previous API on port 8000 so code changes are picked up
$on8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
if ($on8000) { $on8000 | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; uvicorn server.main:app --reload --host 127.0.0.1 --port 8000"
Start-Sleep -Seconds 2
Set-Location "$root\web"
if (-not (Test-Path node_modules)) { npm install }
npm run dev
