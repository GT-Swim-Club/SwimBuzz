# SwimBuzz Run scraper — Windows installer
# Usage: powershell -ExecutionPolicy Bypass -File install.ps1 -AppUrl https://your-app

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$AppUrl
)

$ErrorActionPreference = "Stop"

$AppUrl = $AppUrl.TrimEnd("/")
$ScraperDir = if ($env:SWIMBUZZ_SCRAPER_DIR) { $env:SWIMBUZZ_SCRAPER_DIR } else { Join-Path $env:USERPROFILE ".swimbuzz-scraper" }
$BinDir = Join-Path $env:USERPROFILE ".local\bin"
$VenvDir = Join-Path $ScraperDir ".venv"
$PythonExe = Join-Path $VenvDir "Scripts\python.exe"
$ScraperCmd = Join-Path $BinDir "swimbuzz-scraper.cmd"

function Ensure-Uv {
    $uv = Get-Command uv -ErrorAction SilentlyContinue
    if ($uv) { return $true }

    Write-Host "Installing uv (downloads a working Python)…"
    irm https://astral.sh/uv/install.ps1 | iex
    $env:Path = "$(Join-Path $env:USERPROFILE '.local\bin');$env:Path"
    return [bool](Get-Command uv -ErrorAction SilentlyContinue)
}

function Install-WithUv {
    if (-not (Ensure-Uv)) { return $false }

    Write-Host "Creating scraper environment with uv…"
    if (Test-Path $VenvDir) { Remove-Item -Recurse -Force $VenvDir }
    New-Item -ItemType Directory -Force -Path $ScraperDir, $BinDir | Out-Null

    uv venv $VenvDir --python 3.12
    uv pip install --python $PythonExe -r (Join-Path $ScraperDir "requirements.txt")
    & $PythonExe -m playwright install chromium
    Write-Host "Using uv-managed Python 3.12"
    return $true
}

if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue) -and -not (Get-Command Invoke-WebRequest -ErrorAction SilentlyContinue)) {
    Write-Error "curl or PowerShell web requests are required."
}

New-Item -ItemType Directory -Force -Path $ScraperDir, $BinDir | Out-Null

Write-Host "Installing SwimBuzz scraper to $ScraperDir …"

foreach ($file in @("scraper.py", "swimcloud_scrape.py", "swimphone_parse.py", "pdf_parse.py", "packet_parse.py", "sheet_parse.py", "nqt_parse.py", "requirements.txt")) {
    $dest = Join-Path $ScraperDir $file
    curl.exe -fsSL "$AppUrl/scraper/$file" -o $dest
}

function Sync-Deps {
    Write-Host "Installing / updating Python packages…"
    $uv = Get-Command uv -ErrorAction SilentlyContinue
    if ($uv) {
        uv pip install --python $PythonExe -r (Join-Path $ScraperDir "requirements.txt")
    } else {
        & $PythonExe -m pip install -q --upgrade pip
        & $PythonExe -m pip install -q -r (Join-Path $ScraperDir "requirements.txt")
    }
    & $PythonExe -c "import pdfplumber, httpx, playwright"
}

if (-not (Test-Path $PythonExe) -or -not (& $PythonExe -c "import httpx" 2>$null)) {
    if (-not (Install-WithUv)) {
        Write-Error "Could not set up Python. Try running PowerShell as your normal user (not restricted)."
    }
} else {
    Sync-Deps
}

try {
    & $PythonExe -c "import pdfplumber" 2>$null
    if ($LASTEXITCODE -ne 0) { throw "missing" }
} catch {
    Write-Host "pdfplumber missing — reinstalling packages…"
    Sync-Deps
}

$cmdContent = @"
@echo off
set PLAYWRIGHT_HEADLESS=false
"$PythonExe" "$ScraperDir\scraper.py" %*
"@

Set-Content -Path $ScraperCmd -Value $cmdContent -Encoding ASCII

Write-Host ""
Write-Host "Done! Then run:"
Write-Host "  & `"$ScraperCmd`" --url $AppUrl --code YOUR_CODE"
Write-Host ""
Write-Host "Generate a run command in the app under Run scraper."
