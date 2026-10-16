# dev.ps1: Build simulator and run dev environment
$ErrorActionPreference = "Stop"

Write-Host "==> Building BharatRoute simulator (brsim)..." -ForegroundColor Cyan
go build -o bin/brsim.exe ./cmd/brsim
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to build brsim.exe"
    exit 1
}

Write-Host "==> Starting brsim in background (127.0.0.1:8080)..." -ForegroundColor Green
$simProc = Start-Process -FilePath ".\bin\brsim.exe" -ArgumentList "--scenario scenarios/india.json --api 127.0.0.1:8080" -PassThru

Write-Host "==> Starting web frontend (Vite)..." -ForegroundColor Green
Write-Host "    Web UI will be available at http://localhost:5173" -ForegroundColor Yellow
Write-Host "    Press Ctrl+C to stop both processes" -ForegroundColor Yellow

try {
    npm --prefix web run dev
}
finally {
    if ($simProc -and !$simProc.HasExited) {
        Write-Host "==> Stopping brsim..." -ForegroundColor Cyan
        Stop-Process -Id $simProc.Id -Force -ErrorAction SilentlyContinue
    }
}
