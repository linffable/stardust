# 把 stardust/ 内联成单个 HTML（发给朋友最省事：一个文件，双击就玩）
# 用法：powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\build-html.ps1
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$out  = Join-Path (Split-Path -Parent $root) 'dist'
New-Item -ItemType Directory -Force -Path $out | Out-Null

$html = [IO.File]::ReadAllText((Join-Path $root 'index.html'), [Text.Encoding]::UTF8)
$css  = [IO.File]::ReadAllText((Join-Path $root 'style.css'), [Text.Encoding]::UTF8)
$js1  = [IO.File]::ReadAllText((Join-Path $root 'js\core.js'), [Text.Encoding]::UTF8)
$js2  = [IO.File]::ReadAllText((Join-Path $root 'js\game.js'), [Text.Encoding]::UTF8)

$html = $html.Replace('<link rel="stylesheet" href="style.css">', "<style>`n$css`n</style>")
$html = $html.Replace('<script src="js/core.js"></script>', "<script>`n$js1`n</script>")
$html = $html.Replace('<script src="js/game.js"></script>', "<script>`n$js2`n</script>")

$dst = Join-Path $out 'Stardust.html'
[IO.File]::WriteAllText($dst, $html, (New-Object Text.UTF8Encoding($true)))
$kb = [math]::Round((Get-Item $dst).Length / 1KB, 1)
Write-Output "OK: $dst ($kb KB)"

# 同上：去掉 Low 完整性标签
icacls $out /setintegritylevel '(OI)(CI)Medium' /T | Out-Null
