# Stardust health check: syntax + two headless screenshots.
# Run: powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\healthcheck.ps1
# (Output kept ASCII on purpose: Windows PowerShell 5.1 misreads UTF-8 without BOM.)

$root  = Split-Path -Parent $PSScriptRoot
$shots = Join-Path (Split-Path -Parent $root) 'shots'
New-Item -ItemType Directory -Force -Path $shots | Out-Null

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  $guess = 'C:\Users\Lenovo\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
  if (Test-Path $guess) { $node = $guess }
}
if (-not $node) { Write-Output 'FAIL: node not found'; exit 1 }

& $node --check (Join-Path $root 'js\core.js')
if ($LASTEXITCODE -ne 0) { Write-Output 'FAIL: syntax error in core.js'; exit 1 }
& $node --check (Join-Path $root 'js\game.js')
if ($LASTEXITCODE -ne 0) { Write-Output 'FAIL: syntax error in game.js'; exit 1 }
Write-Output 'OK: syntax'

$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edge)) { Write-Output 'FAIL: Edge not found'; exit 1 }

$url   = ([System.Uri](Join-Path $root 'index.html')).AbsoluteUri
$base  = Split-Path -Parent $root
$shot1 = Join-Path $shots 'check_30.png'
$shot2 = Join-Path $shots 'check_95.png'
$jobs = @(
  @{ dir = '.edge-check1'; shot = $shot1; url = "$url" + '?demo&t=30' },
  @{ dir = '.edge-check2'; shot = $shot2; url = "$url" + '?demo&god&t=95' }
)

foreach ($j in $jobs) {
  $tmp = Join-Path $base $j.dir
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
  if (Test-Path $j.shot) { Remove-Item $j.shot -Force -ErrorAction SilentlyContinue }
  & $edge --headless --disable-gpu --no-first-run --hide-scrollbars --window-size=1280,832 `
    --virtual-time-budget=2000 "--user-data-dir=$tmp" "--screenshot=$($j.shot)" $j.url 2>&1 | Out-Null
  $waited = 0
  while (-not (Test-Path $j.shot) -and $waited -lt 40) { Start-Sleep -Milliseconds 250; $waited++ }
}

Start-Sleep -Milliseconds 400
foreach ($j in $jobs) {
  $tmp = Join-Path $base $j.dir
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
}

$ok1 = Test-Path $shot1
$ok2 = Test-Path $shot2
if ($ok1 -and $ok2) {
  Write-Output ('OK: screenshots ' + (Get-Item $shot1).Length + ' / ' + (Get-Item $shot2).Length + ' bytes')
  Write-Output 'NEXT: open them with read_image; look for a red ERROR box in the bottom-left corner.'
} else {
  Write-Output ('FAIL: screenshot missing (30s=' + $ok1 + ', 95s=' + $ok2 + ')')
  exit 1
}
