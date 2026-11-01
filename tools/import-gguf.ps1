# 把本机已有的 .gguf 模型导入 Ollama —— 不用重新下载（联想天禧的 Qwen3 就是 GGUF）
#
# 用法（在本仓库根目录打开 PowerShell）：
#   powershell -ExecutionPolicy Bypass -File .\tools\import-gguf.ps1 `
#     -Gguf "C:\ProgramData\Lenovo\AIAgent\data\Qwen3-4B-Thinking\Qwen3-4B-Thinking-2507_IA_Q4_0.gguf" `
#     -Name qwen3-4b
#
# 前提：已经装好 Ollama（https://ollama.com/download），并且它在运行（托盘图标 / ollama serve）
param(
  [Parameter(Mandatory = $true)][string]$Gguf,
  [string]$Name = 'local-gguf',
  [string]$NumCtx = '8192'
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  Write-Host '还没装 Ollama：https://ollama.com/download' -ForegroundColor Yellow
  Write-Host '装完重开一个 PowerShell 窗口，再运行本脚本。' -ForegroundColor Yellow
  exit 1
}
if (-not (Test-Path -LiteralPath $Gguf)) {
  Write-Host "找不到模型文件：$Gguf" -ForegroundColor Red
  exit 1
}

$size = [math]::Round((Get-Item -LiteralPath $Gguf).Length / 1MB, 1)
Write-Host "模型：$Gguf （$size MB）" -ForegroundColor Cyan

# 写一个临时 Modelfile：FROM 指向已有的 gguf，不复制、不下载
$mf = Join-Path $env:TEMP ("Modelfile-$Name")
@(
  ('FROM "' + $Gguf + '"'),
  ('PARAMETER num_ctx ' + $NumCtx),
  'PARAMETER temperature 0.2'
) | Set-Content -LiteralPath $mf -Encoding ASCII
Write-Host "Modelfile：$mf" -ForegroundColor DarkGray

try {
  ollama create $Name -f $mf
} catch {
  Write-Host '导入失败。最常见的原因：Ollama 服务没在跑。' -ForegroundColor Red
  Write-Host '  做法：开始菜单打开 Ollama，或在另一个窗口运行 ollama serve，然后再执行本脚本。' -ForegroundColor Yellow
  exit 1
}

Write-Host ''
Write-Host "✅ 已把 $Name 注册进 Ollama（几乎不占额外空间，只是登记 + 计算指纹）。" -ForegroundColor Green
Write-Host '下一步：回网页点「⚙ 接本机模型」→「一键检测并启用」，它会自动认到这个模型。' -ForegroundColor Green
ollama list
