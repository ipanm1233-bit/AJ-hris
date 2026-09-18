$ErrorActionPreference = "Stop"
$bridgeDirectory = Join-Path $env:LOCALAPPDATA "AJHRIS-FingerprintBridge"
$sourceBase = "https://raw.githubusercontent.com/ipanm1233-bit/AJ-hris/main/fingerprint-bridge"
$taskName = "AJ HRIS Fingerprint Bridge"

Write-Host "`nAJ HRIS - Pembaruan Fingerprint Connector" -ForegroundColor Cyan

if (-not (Test-Path (Join-Path $bridgeDirectory ".env"))) {
  throw "Connector belum terpasang pada komputer ini. Gunakan kode pairing dari HRIS terlebih dahulu."
}

foreach ($fileName in @("bridge.js", "package.json", "package-lock.json")) {
  Invoke-WebRequest "$sourceBase/$fileName" -OutFile (Join-Path $bridgeDirectory $fileName)
}

Push-Location $bridgeDirectory
try {
  & npm install --omit=dev
  if ($LASTEXITCODE -ne 0) { throw "npm install gagal." }
} finally {
  Pop-Location
}

& schtasks.exe /End /TN $taskName 2>$null | Out-Null
& schtasks.exe /Run /TN $taskName | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Connector sudah diperbarui, tetapi gagal dimulai ulang. Silakan login ulang Windows."
}

Write-Host "Connector berhasil diperbarui dan dimulai ulang." -ForegroundColor Green
