$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $project 'web')
npm install
npm run dev
