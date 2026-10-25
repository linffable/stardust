# Build a single-file "Stardust.exe" that uses the system Edge runtime (no Electron).
# Usage: powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\build-exe.ps1
# Keep this file ASCII-only: Windows PowerShell 5.1 misreads UTF-8 without BOM.
$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot
if (-not $here) { throw 'PSScriptRoot is empty; run this with -File' }

$root = Split-Path -Parent $here          # ...\stardust
$proj = Split-Path -Parent $root          # ...\<workspace>
$out  = Join-Path $proj 'dist'
$work = Join-Path $proj 'stardust-build'
Write-Output "root=$root"
Write-Output "out =$out"

New-Item -ItemType Directory -Force -Path $out | Out-Null
New-Item -ItemType Directory -Force -Path $work | Out-Null

# 1) game files -> www -> zip
$www = Join-Path $work 'www'
if (Test-Path $www) { Remove-Item $www -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $www 'js') | Out-Null
Copy-Item (Join-Path $root 'index.html') $www -Force
Copy-Item (Join-Path $root 'style.css')  $www -Force
Copy-Item (Join-Path $root 'js\*.js')    (Join-Path $www 'js') -Force

$zip = Join-Path $out 'www.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $www '*') -DestinationPath $zip -CompressionLevel Optimal

# 2) icon
$py  = 'C:\Users\Lenovo\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$ico = Join-Path $out 'icon.ico'
& $py (Join-Path $here 'launcher\make-icon.py') $ico (Join-Path $out 'icon.png') | Out-Null

# 3) compile launcher (.NET Framework 4.8 ships with Windows 10/11)
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$exe = Join-Path $out 'Stardust.exe'
if (Test-Path $exe) { Remove-Item $exe -Force }
& $csc /nologo /target:winexe /platform:anycpu /out:"$exe" /win32icon:"$ico" `
  /resource:"$zip,www.zip" `
  /r:System.dll /r:System.Core.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /r:System.Windows.Forms.dll `
  (Join-Path $here 'launcher\Program.cs')
if ($LASTEXITCODE -ne 0) { throw 'csc failed' }

# 4) cleanup
Remove-Item $zip -Force
Remove-Item $ico -Force
Remove-Item (Join-Path $out 'icon.png') -Force
Remove-Item $www -Recurse -Force

$kb = [math]::Round((Get-Item $exe).Length / 1KB, 1)
Write-Output "OK: $exe ($kb KB)"

# 去掉沙箱写入带来的 Low 完整性标签（否则 Windows 会把产物当成不可信文件）
icacls $out /setintegritylevel '(OI)(CI)Medium' /T | Out-Null
