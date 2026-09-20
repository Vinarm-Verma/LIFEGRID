$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$venv = Join-Path (Split-Path -Parent $project) '.venv'
if (Test-Path (Join-Path $venv 'Scripts\Activate.ps1')) {
  & (Join-Path $venv 'Scripts\Activate.ps1')
}
Set-Location (Join-Path $project 'backend')
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
