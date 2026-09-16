# ===========================================================================
# 问数星途 · 服务器上传包（部署路线二：云服务器）
# ---------------------------------------------------------------------------
# 用法（在项目根目录）：
#   powershell -ExecutionPolicy Bypass -File tools\pack-for-server.ps1
#
# 产出：dist-package\wenshu-fullstack-<年月日-时分>.zip
#
# 包里**不含**：node_modules / .pnpm-store / .env / .git / frontend\dist / dist-package
#   - node_modules 不带：本地是 pnpm 软链接结构，拷到 Linux 上必然是坏链接，
#     服务器上由 tools/deploy-server.sh 重新 npm install。
#   - .env 不带：里面有真实密钥，上传包可能被转手/发群里，别把密钥捎进去；
#     服务器上会自动生成一份新的（JWT_SECRET 随机、LLM_API_KEY 留空）。
# ===========================================================================
[CmdletBinding()]
param(
    [string]$OutputDir
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression            # ZipArchive / ZipArchiveMode
Add-Type -AssemblyName System.IO.Compression.FileSystem  # ZipFile / ZipFileExtensions

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not (Test-Path (Join-Path $root 'backend\src\app.js'))) {
    throw "找不到 backend\src\app.js，脚本没放在 tools\ 里？当前推断的项目根：$root"
}
if (-not $OutputDir) { $OutputDir = Join-Path $root 'dist-package' }
[System.IO.Directory]::CreateDirectory($OutputDir) | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$zipPath = Join-Path $OutputDir "wenshu-fullstack-$stamp.zip"
if ([System.IO.File]::Exists($zipPath)) { [System.IO.File]::Delete($zipPath) }

# 目录名命中即整棵子树跳过
$skipDirs = @('node_modules', '.pnpm-store', '.git', 'dist', 'dist-package', '.vscode', '.idea')
# 文件名命中即跳过
$skipFiles = @('.env', '.env.local', '.env.production', 'Thumbs.db', '.DS_Store')

$files = Get-ChildItem -LiteralPath $root -Recurse -Force -File -ErrorAction SilentlyContinue |
    Where-Object {
        $rel = $_.FullName.Substring($root.Length + 1)
        $parts = $rel -split '[\\/]'
        $skip = $false
        foreach ($p in $parts[0..([Math]::Max(0, $parts.Count - 2))]) {
            if ($skipDirs -contains $p) { $skip = $true; break }
        }
        if (-not $skip -and ($skipFiles -contains $parts[-1])) { $skip = $true }
        if (-not $skip -and $rel -like '*.log') { $skip = $true }
        -not $skip
    }

$skippedEnv = Test-Path (Join-Path $root 'backend\.env')

$archive = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($f in $files) {
        $rel = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive, $f.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal)
    }
} finally {
    $archive.Dispose()
}

$sizeMb = [Math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 2)

Write-Host ""
Write-Host "打包完成" -ForegroundColor Green
Write-Host "  文件     : $zipPath"
Write-Host "  条目     : $($files.Count) 个文件 / $sizeMb MB"
Write-Host "  已排除   : node_modules(含 pnpm 软链接) / .pnpm-store / .git / frontend\dist"
if ($skippedEnv) {
    Write-Host "  注意     : backend\.env 没有进包（里面有真实密钥）。服务器上脚本会自动生成一份新的" -ForegroundColor Yellow
    Write-Host "             要接 DeepSeek 就上传后执行：LLM_API_KEY=sk-xxx sudo bash tools/deploy-server.sh" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "下一步（把 <服务器IP> 换成你的机器）：" -ForegroundColor Cyan
Write-Host "  scp `"$zipPath`" root@<服务器IP>:/root/"
Write-Host "  ssh root@<服务器IP>"
Write-Host "  # 服务器上："
Write-Host "  apt-get install -y unzip && unzip -q /root/wenshu-fullstack-$stamp.zip -d /root/wenshu-src"
Write-Host "  cd /root/wenshu-src && sudo bash tools/deploy-server.sh           # 只跑 HTTP（用 IP 访问）"
Write-Host "  cd /root/wenshu-src && sudo bash tools/deploy-server.sh 你的域名   # 顺带申请 HTTPS"
Write-Host ""