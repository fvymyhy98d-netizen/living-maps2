# 天禧本地模型 -> 网页 的小桥（PowerShell 版，零依赖：Windows 自带）
# ---------------------------------------------------------------
# 为什么还要这一版：别人的电脑不一定装了 Python，装了也可能是 3.6/3.12/微软商店版，
# 版本差异让人抓狂。PowerShell 5.1 是 Windows 自带的，所以这条路人人可走。
#
# 作用与 tools/tianxi-bridge.py 完全一致：
#   127.0.0.1:11468  ->  http://[::1]:11466（天禧）
#   补 CORS 头 + 处理 OPTIONS 预检 + 边读边写（SSE 逐字到达）
#
# 用法：
#   双击 tools\start-tianxi-bridge.cmd      （推荐，找人自动挑 Python 或本脚本）
#   或： powershell -ExecutionPolicy Bypass -File tools\tianxi-bridge.ps1
#   参数： -Port 11468  -Target "http://[::1]:11466"

param(
  [int]$Port = 11468,
  [string]$Target = 'http://[::1]:11466'
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$Cors = @(
  'Access-Control-Allow-Origin: *',
  'Access-Control-Allow-Methods: GET, POST, OPTIONS',
  'Access-Control-Allow-Headers: *',
  'Access-Control-Max-Age: 600',
  'Access-Control-Allow-Private-Network: true',
  'Access-Control-Expose-Headers: *'
) -join "`r`n"
$Cors = $Cors + "`r`n"

# 每条连接跑在自己的 runspace 里：一个 30 秒的流式回答不会把「探测/其它请求」堵住
$Worker = {
  param($client, $target, $cors)

  $stream = $null
  try {
    $client.NoDelay = $true
    $stream = $client.GetStream()
    $stream.ReadTimeout = 15000

    # ---------- 读请求头（逐字节读到 CRLFCRLF，头很小，够快） ----------
    $hb = New-Object System.Collections.Generic.List[byte]
    while ($true) {
      $b = $stream.ReadByte()
      if ($b -lt 0) { break }
      [void]$hb.Add([byte]$b)
      $n = $hb.Count
      if ($n -ge 4 -and $hb[$n - 1] -eq 10 -and $hb[$n - 2] -eq 13 -and $hb[$n - 3] -eq 10 -and $hb[$n - 4] -eq 13) { break }
      if ($n -gt 65536) { break }
    }
    if ($hb.Count -eq 0) { return }

    $txt = [System.Text.Encoding]::ASCII.GetString($hb.ToArray())
    $lines = $txt -split "`r`n"
    if (-not $lines -or $lines.Count -lt 1) { return }
    $parts = $lines[0] -split ' '
    if ($parts.Count -lt 2) { return }
    $method = $parts[0].ToUpper()
    $path = $parts[1]

    $hdr = @{}
    for ($i = 1; $i -lt $lines.Count; $i++) {
      $ln = $lines[$i]
      if (-not $ln) { continue }
      $c = $ln.IndexOf(':')
      if ($c -gt 0) { $hdr[$ln.Substring(0, $c).Trim().ToLower()] = $ln.Substring($c + 1).Trim() }
    }

    $len = 0
    if ($hdr.ContainsKey('content-length')) { [void][int]::TryParse($hdr['content-length'], [ref]$len) }

    $body = $null
    if ($len -gt 0) {
      $raw = New-Object byte[] $len
      $got = 0
      while ($got -lt $len) {
        $r = $stream.Read($raw, $got, $len - $got)
        if ($r -le 0) { break }
        $got += $r
      }
      $body = $raw
    }

    # ---------- 预检直接回 204 ----------
    if ($method -eq 'OPTIONS') {
      $resp = "HTTP/1.0 204 No Content`r`n" + $cors + "`r`n"
      $out = [System.Text.Encoding]::ASCII.GetBytes($resp)
      $stream.Write($out, 0, $out.Length)
      $stream.Flush()
      return
    }

    # ---------- 转发 ----------
    $req = [System.Net.WebRequest]::Create($target.TrimEnd('/') + $path)
    $req.Method = $method
    $req.Timeout = 600000
    $req.ReadWriteTimeout = 600000
    $req.AllowAutoRedirect = $false
    $req.Proxy = $null
    if ($hdr.ContainsKey('content-type')) { $req.ContentType = $hdr['content-type'] }
    if ($null -ne $body) {
      $req.ContentLength = $body.Length
      $rq = $req.GetRequestStream()
      $rq.Write($body, 0, $body.Length)
      $rq.Flush()
      $rq.Close()
    }

    $respObj = $null
    try {
      $respObj = $req.GetResponse()
    } catch [System.Net.WebException] {
      $respObj = $_.Exception.Response
    }

    if ($null -eq $respObj) {
      $msg = "bridge: 连不上天禧 $target（它没在跑 / 端口变了）。`n"
      $head = "HTTP/1.0 502 Bad Gateway`r`n" + $cors + "Content-Type: text/plain; charset=utf-8`r`n`r`n"
      $h1 = [System.Text.Encoding]::ASCII.GetBytes($head)
      $stream.Write($h1, 0, $h1.Length)
      $b1 = [System.Text.Encoding]::UTF8.GetBytes($msg)
      $stream.Write($b1, 0, $b1.Length)
      $stream.Flush()
      return
    }

    $code = [int]$respObj.StatusCode
    $desc = $respObj.StatusDescription
    $ctype = $respObj.ContentType
    if (-not $ctype) { $ctype = 'application/json; charset=utf-8' }

    $head = "HTTP/1.0 $code $desc`r`n" + $cors + "Content-Type: $ctype`r`n`r`n"
    $hb2 = [System.Text.Encoding]::ASCII.GetBytes($head)
    $stream.Write($hb2, 0, $hb2.Length)
    $stream.Flush()

    # 边读边写：SSE 才能逐字到达浏览器
    $rs = $respObj.GetResponseStream()
    $buf = New-Object byte[] 1024
    while (($n = $rs.Read($buf, 0, 1024)) -gt 0) {
      $stream.Write($buf, 0, $n)
      $stream.Flush()
    }
    $rs.Close()
  } catch {
    # 浏览器切走 / 连接被重置都属于正常，别让整条连接线程报红
  } finally {
    if ($null -ne $stream) { try { $stream.Close() } catch { } }
    try { $client.Close() } catch { }
  }
}

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host ''
Write-Host "  天禧桥已启动： http://127.0.0.1:$Port  ->  $Target"
Write-Host '  网页里点 [接本机模型] -> [一键检测并启用] 即可。Ctrl+C 结束。'
Write-Host ''
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    $ps = [PowerShell]::Create()
    [void]$ps.AddScript($Worker).AddArgument($client).AddArgument($Target).AddArgument($Cors)
    [void]$ps.BeginInvoke()
  }
} finally {
  $listener.Stop()
}
