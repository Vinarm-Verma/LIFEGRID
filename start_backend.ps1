$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\backend"
if (-not $env:LIFEGRID_LOCAL_DEMO) { $env:LIFEGRID_LOCAL_DEMO = "false" }
if (-not $env:LIFEGRID_SEED_DEMO) { $env:LIFEGRID_SEED_DEMO = "false" }
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
