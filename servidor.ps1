param([int]$Port = 8080, [switch]$NoBrowser, [switch]$Lan)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[Net.ServicePointManager]::DefaultConnectionLimit = 32
Add-Type -AssemblyName System.Net.Http

$root     = Join-Path $PSScriptRoot 'web'
$stations = Get-Content (Join-Path $root 'data\estacions.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$ids      = @($stations | ForEach-Object { $_.id })

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.ico' = 'image/x-icon'
}

# ---- fil en segon pla: descarrega les dades de totes les estacions cada minut ----
$shared = [hashtable]::Synchronized(@{ cache = $null; stats = @{} })
$worker = {
  param($shared, $ids, $intervalSecs)
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Add-Type -AssemblyName System.Net.Http
  $http = New-Object System.Net.Http.HttpClient
  $http.Timeout = [TimeSpan]::FromSeconds(10)
  $http.DefaultRequestHeaders.Add('User-Agent', 'Mozilla/5.0 (PROJECTE-METEO local viewer)')
  $http.DefaultRequestHeaders.Add('X-Requested-With', 'XMLHttpRequest')
  while ($true) {
    try {
      $tasks = [ordered]@{}
      foreach ($id in $ids) { $tasks[$id] = $http.GetStringAsync("https://app.weathercloud.net/device/values?code=$id") }
      try { [void][Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($tasks.Values), 20000) } catch {}
      $values = [ordered]@{}
      foreach ($id in $tasks.Keys) {
        if ($tasks[$id].Status -eq 'RanToCompletion') { try { $values[$id] = $tasks[$id].Result | ConvertFrom-Json } catch {} }
      }
      $shared.cache = [pscustomobject]@{
        generated = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds(); ok = $values.Count; total = $ids.Count; values = $values
      } | ConvertTo-Json -Depth 5 -Compress
    } catch { }
    Start-Sleep -Seconds $intervalSecs
  }
}
$rs = [runspacefactory]::CreateRunspace(); $rs.Open()
$ps = [powershell]::Create(); $ps.Runspace = $rs
[void]$ps.AddScript($worker).AddArgument($shared).AddArgument($ids).AddArgument(60)
[void]$ps.BeginInvoke()

$http = New-Object System.Net.Http.HttpClient
$http.Timeout = [TimeSpan]::FromSeconds(10)
$http.DefaultRequestHeaders.Add('User-Agent', 'Mozilla/5.0 (PROJECTE-METEO local viewer)')
$http.DefaultRequestHeaders.Add('X-Requested-With', 'XMLHttpRequest')

function Send-Bytes($ctx, [byte[]]$bytes, [string]$type, [int]$status = 200) {
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = $type
  $ctx.Response.Headers.Add('Cache-Control', 'no-store')
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.OutputStream.Close()
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($(if ($Lan) { "http://+:$Port/" } else { "http://localhost:$Port/" }))
$listener.Start()
Write-Host "Meteo Alt Penedes  ->  http://localhost:$Port/   (Ctrl+C per aturar)" -ForegroundColor Cyan
if ($Lan) {
  Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.PrefixOrigin -in 'Dhcp', 'Manual' } |
    ForEach-Object { Write-Host "Des del mobil (mateixa wifi):  http://$($_.IPAddress):$Port/" -ForegroundColor Yellow }
}
Write-Host "Carregant dades de $($ids.Count) estacions..."
$waited = 0
while (-not $shared.cache -and $waited -lt 40) { Start-Sleep -Milliseconds 500; $waited += 0.5 }
Write-Host "Dades llestes." -ForegroundColor Green
if (-not $NoBrowser) { Start-Process "http://localhost:$Port/" }

try {
  while ($listener.IsListening) {
    $pending = $listener.GetContextAsync()
    while (-not $pending.Wait(300)) { }
    $ctx = $pending.Result
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
      if ($path -eq '/api/dades') {
        $body = if ($shared.cache) { $shared.cache } else { '{"generated":0,"ok":0,"total":0,"values":{}}' }
        Send-Bytes $ctx ([Text.Encoding]::UTF8.GetBytes($body)) $mime['.json']
        continue
      }
      if ($path -match '^/api/estadistiques/(\d{10})$') {
        $id = $Matches[1]
        $hit = $shared.stats[$id]
        if (-not $hit -or ((Get-Date) - $hit.time).TotalSeconds -gt 300) {
          try { $raw = $http.GetStringAsync("https://app.weathercloud.net/device/stats?code=$id").GetAwaiter().GetResult() }
          catch { $raw = '{}' }
          $hit = @{ time = Get-Date; body = $raw }
          $shared.stats[$id] = $hit
        }
        Send-Bytes $ctx ([Text.Encoding]::UTF8.GetBytes($hit.body)) $mime['.json']
        continue
      }
      if ($path -eq '/') { $path = '/index.html' }
      $file = [IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
      if (-not $file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $file -PathType Leaf)) {
        Send-Bytes $ctx ([Text.Encoding]::UTF8.GetBytes('404')) 'text/plain' 404
        continue
      }
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      Send-Bytes $ctx ([IO.File]::ReadAllBytes($file)) $type
    } catch {
      Write-Host "Error: $_" -ForegroundColor Yellow
      try { $ctx.Response.Abort() } catch {}
    }
  }
} finally {
  $listener.Stop()
  $ps.Stop()
}
