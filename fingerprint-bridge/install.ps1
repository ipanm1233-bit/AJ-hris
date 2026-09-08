param(
  [string]$HrisUrl = "https://andela-hris.vercel.app",
  [string]$PairingCode = ""
)

$ErrorActionPreference = "Stop"
$bridgeDirectory = Join-Path $env:LOCALAPPDATA "AJHRIS-FingerprintBridge"
$sourceBase = "https://raw.githubusercontent.com/ipanm1233-bit/AJ-hris/security/firebase-auth-hardening/fingerprint-bridge"

Write-Host "`nAJ HRIS - Pemasangan Fingerprint Connector" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js belum terpasang. Pasang Node.js 22 LTS, lalu jalankan pemasangan ini kembali." -ForegroundColor Red
  exit 1
}
$nodeMajor = [int]((& node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) {
  Write-Host "Versi Node.js terlalu lama. Pasang Node.js 22 LTS, lalu jalankan pemasangan ini kembali." -ForegroundColor Red
  exit 1
}

if ([string]::IsNullOrWhiteSpace($PairingCode)) {
  $PairingCode = Read-Host "Masukkan kode pairing dari HRIS"
}
$PairingCode = ($PairingCode.ToUpper() -replace '[^A-Z0-9]', '')
if ($PairingCode.Length -ne 12) {
  Write-Host "Format kode pairing tidak valid." -ForegroundColor Red
  exit 1
}

$HrisUrl = $HrisUrl.Trim().TrimEnd('/')
if (-not $HrisUrl.StartsWith('https://')) {
  Write-Host "Alamat HRIS wajib menggunakan HTTPS." -ForegroundColor Red
  exit 1
}

Write-Host "Memasangkan komputer dengan HRIS..." -ForegroundColor Yellow
$pairResponse = Invoke-RestMethod -Method Post -Uri "$HrisUrl/api/sync-absen" -ContentType "application/json" -Body (@{
  action = "pair"
  pairingCode = $PairingCode
} | ConvertTo-Json -Compress)

if (-not $pairResponse.success -or -not $pairResponse.deviceId -or -not $pairResponse.deviceToken) {
  throw "Pairing gagal. Buat kode pairing baru dari HRIS lalu coba kembali."
}

New-Item -ItemType Directory -Path $bridgeDirectory -Force | Out-Null
foreach ($fileName in @("bridge.js", "package.json", "package-lock.json")) {
  Invoke-WebRequest "$sourceBase/$fileName" -OutFile (Join-Path $bridgeDirectory $fileName)
}

$envLines = @(
  "HRIS_BASE_URL=$HrisUrl"
  "FINGERPRINT_DEVICE_ID=$($pairResponse.deviceId)"
  "FINGERPRINT_DEVICE_TOKEN=$($pairResponse.deviceToken)"
  "FINGERPRINT_REQUEST_TIMEOUT_MS=30000"
)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines((Join-Path $bridgeDirectory ".env"), $envLines, $utf8NoBom)

Write-Host "Memasang komponen connector..." -ForegroundColor Yellow
Push-Location $bridgeDirectory
try {
  & npm install --omit=dev
  if ($LASTEXITCODE -ne 0) { throw "npm install gagal." }
  & npm run check
  if ($LASTEXITCODE -ne 0) { throw "Tes koneksi mesin gagal." }
} finally {
  Pop-Location
}

$runnerPath = Join-Path $bridgeDirectory "run-bridge.cmd"
$logPath = Join-Path $bridgeDirectory "bridge.log"
$runnerLines = @(
  "@echo off"
  "cd /d `"$bridgeDirectory`""
  "npm start >> `"$logPath`" 2>&1"
)
Set-Content -Path $runnerPath -Value $runnerLines -Encoding ASCII

$taskName = "AJ HRIS Fingerprint Bridge"
try {
  & schtasks.exe /Create /SC ONLOGON /RL LIMITED /F /TN $taskName /TR "`"$runnerPath`"" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Task Scheduler menolak pembuatan tugas." }
  & schtasks.exe /Run /TN $taskName | Out-Null
  Write-Host "`nBerhasil. Connector aktif otomatis setiap komputer login Windows." -ForegroundColor Green
} catch {
  Start-Process -FilePath $runnerPath -WindowStyle Hidden
  Write-Host "`nConnector berhasil dipasang dan sedang berjalan." -ForegroundColor Green
  Write-Host "Windows menolak auto-start. Minta administrator komputer menjalankan pemasangan sekali lagi." -ForegroundColor Yellow
}

Write-Host "Cabang: $($pairResponse.config.branch)"
Write-Host "Mesin:  $($pairResponse.config.name) ($($pairResponse.config.ip):$($pairResponse.config.port))"
Write-Host "Log:     $logPath"
