# Dayflit Oracle Cloud VM Deployment Pipeline
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Deploying Dayflit to Oracle Cloud VM..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

Write-Host "1. Pushing commits to Oracle VM..." -ForegroundColor Yellow
git push vm main

Write-Host "`n2. Fetching live Cloudflare Tunnel URL..." -ForegroundColor Yellow
$raw = ssh oracle-vm "grep -o 'https://[a-zA-Z0-9.-]*\.trycloudflare\.com' ~/.pm2/logs/dayflit-tunnel-error.log 2>/dev/null | tail -n 1"
$tunnelUrl = ""
if ($null -ne $raw) {
    $tunnelUrl = $raw.ToString().Trim()
}

Write-Host "`nDEPLOYMENT SUCCESSFUL!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
if ($tunnelUrl) {
    Write-Host "Live Website URL: $tunnelUrl" -ForegroundColor Green
}
Write-Host "==========================================" -ForegroundColor Cyan
