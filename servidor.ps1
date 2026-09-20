param([int]$Port = 8080, [switch]$NoBrowser, [switch]$Lan)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[Net.ServicePointManager]::DefaultConnectionLimit = 64
Add-Type -AssemblyName System.Net.Http

$root     = Join-Path $PSScriptRoot 'web'
$stations = Get-Content (Join-Path $root 'data\estacions.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$wcIds    = @($stations | Where-Object { $_.src -eq 'wc' } | ForEach-Object { $_.id })
$xemaIds  = @($stations | Where-Object { $_.src -eq 'xema' } | ForEach-Object { $_.id })

$xemaAlt = @{}
foreach ($s in ($stations | Where-Object { $_.src -eq 'xema' })) { $xemaAlt[$s.id] = [double]$s.alt }

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.ico' = 'image/x-icon'
}

# ---- fil en segon pla: descarrega les dades de totes les estacions cada minut ----
$shared = [hashtable]::Synchronized(@{ cache = $null; stats = @{} })
$worker = {
  param($shared, $wcIds, $xemaIds, $xemaAlt, $intervalSecs)
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Add-Type -AssemblyName System.Net.Http
  $inv = [Globalization.CultureInfo]::InvariantCulture
  $http = New-Object System.Net.Http.HttpClient
  $http.Timeout = [TimeSpan]::FromSeconds(12)
  $http.DefaultRequestHeaders.Add('User-Agent', 'Mozilla/5.0 (PROJECTE-METEO local viewer)')
  $http.DefaultRequestHeaders.Add('X-Requested-With', 'XMLHttpRequest')
  $soda = 'https://analisi.transparenciacatalunya.cat/resource/nzvn-apee.json'
  $tz = [TimeZoneInfo]::FindSystemTimeZoneById('Romance Standard Time')

  function ToEpoch($s) {
    $d = [DateTime]::SpecifyKind([DateTime]::Parse($s, $inv), [DateTimeKind]::Utc)
    [DateTimeOffset]::new($d).ToUnixTimeSeconds()
  }

  while ($true) {
    try {
      $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
      $tasks = [ordered]@{}
      foreach ($id in $wcIds) { $tasks[$id] = $http.GetStringAsync("https://app.weathercloud.net/device/values?code=$id") }

      $xt1 = $null; $xt2 = $null
      if ($xemaIds.Count -gt 0) {
        $codes = ($xemaIds | ForEach-Object { "'$_'" }) -join ','
        $since = [DateTime]::UtcNow.AddHours(-3).ToString('yyyy-MM-ddTHH:mm:ss')
        $midUtc = [TimeZoneInfo]::ConvertTimeToUtc([TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $tz).Date, $tz).ToString('yyyy-MM-ddTHH:mm:ss')
        $w1 = "codi_estacio in($codes) AND codi_variable in('30','31','32','33','34','35','36','50') AND data_lectura >= '$since'"
        $w2 = "codi_estacio in($codes) AND codi_variable='35' AND data_lectura >= '$midUtc'"
        $xt1 = $http.GetStringAsync($soda + '?$limit=20000&$where=' + [uri]::EscapeDataString($w1))
        $xt2 = $http.GetStringAsync($soda + '?$limit=20000&$where=' + [uri]::EscapeDataString($w2))
      }

      $all = @($tasks.Values); if ($xt1) { $all += $xt1; $all += $xt2 }
      try { [void][Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]$all, 25000) } catch {}

      $values = [ordered]@{}
      foreach ($id in $tasks.Keys) {
        if ($tasks[$id].Status -eq 'RanToCompletion') { try { $values[$id] = $tasks[$id].Result | ConvertFrom-Json } catch {} }
      }

      if ($xt1 -and $xt1.Status -eq 'RanToCompletion') {
        $rows = $xt1.Result | ConvertFrom-Json
        $rain = @{}
        if ($xt2.Status -eq 'RanToCompletion') {
          foreach ($r in ($xt2.Result | ConvertFrom-Json)) {
            $v = 0.0; if ([double]::TryParse($r.valor_lectura, [Globalization.NumberStyles]::Float, $inv, [ref]$v)) { $rain[$r.codi_estacio] = [double]$rain[$r.codi_estacio] + $v }
          }
        }
        foreach ($g in ($rows | Group-Object codi_estacio)) {
          $latest = @{}; $lastRain = $null; $maxTs = ''
          foreach ($r in ($g.Group | Sort-Object data_lectura -Descending)) {
            $k = [string]$r.codi_variable
            if (-not $latest.ContainsKey($k)) {
              $v = 0.0
              if ([double]::TryParse($r.valor_lectura, [Globalization.NumberStyles]::Float, $inv, [ref]$v)) { $latest[$k] = $v }
            }
            if ($r.data_lectura -gt $maxTs) { $maxTs = $r.data_lectura }
          }
          if (-not $maxTs) { continue }
          $o = [ordered]@{ epoch = [math]::Min($now, (ToEpoch $maxTs) + 1800) }
          if ($latest.ContainsKey('32')) { $o.temp = $latest['32'] }
          if ($latest.ContainsKey('33')) { $o.hum = $latest['33'] }
          if ($latest.ContainsKey('30')) { $o.wspd = $latest['30'] }
          if ($latest.ContainsKey('31')) { $o.wdir = $latest['31'] }
          if ($latest.ContainsKey('34')) {
            $h0 = [double]$xemaAlt[$g.Name]; $t0 = 15.0; if ($latest.ContainsKey('32')) { $t0 = $latest['32'] }
            $o.bar = [math]::Round($latest['34'] * [math]::Pow(1 - (0.0065 * $h0) / ($t0 + 0.0065 * $h0 + 273.15), -5.257), 1)
          }
          if ($latest.ContainsKey('36')) { $o.solarrad = $latest['36'] }
          if ($latest.ContainsKey('50')) { $o.wspdhi = $latest['50'] }
          if ($rain.ContainsKey($g.Name)) { $o.rain = [math]::Round($rain[$g.Name], 1) }
          if ($latest.ContainsKey('35')) { $o.rainrate = [math]::Round($latest['35'] * 2, 1) }
          if ($o.Contains('temp') -and $o.Contains('hum') -and $o.hum -gt 0) {
            $t = $o.temp; $h = $o.hum
            $gm = [math]::Log($h / 100) + 17.62 * $t / (243.12 + $t)
            $o.dew = [math]::Round(243.12 * $gm / (17.62 - $gm), 1)
            $e = $h / 100 * 6.105 * [math]::Exp(17.27 * $t / (237.7 + $t))
            $ws = 0; if ($o.Contains('wspd')) { $ws = $o.wspd }
            $o.feels = [math]::Round($t + 0.33 * $e - 0.70 * $ws - 4.0, 1)
          }
          $values[$g.Name] = $o
        }
      }

      $shared.cache = [pscustomobject]@{
        generated = $now; ok = $values.Count; total = ($wcIds.Count + $xemaIds.Count); values = $values
      } | ConvertTo-Json -Depth 5 -Compress
    } catch { }
    Start-Sleep -Seconds $intervalSecs
  }
}
$rs = [runspacefactory]::CreateRunspace(); $rs.Open()
$ps = [powershell]::Create(); $ps.Runspace = $rs
[void]$ps.AddScript($worker).AddArgument($shared).AddArgument($wcIds).AddArgument($xemaIds).AddArgument($xemaAlt).AddArgument(60)
[void]$ps.BeginInvoke()

$http = New-Object System.Net.Http.HttpClient
$http.Timeout = [TimeSpan]::FromSeconds(12)
$http.DefaultRequestHeaders.Add('User-Agent', 'Mozilla/5.0 (PROJECTE-METEO local viewer)')
$http.DefaultRequestHeaders.Add('X-Requested-With', 'XMLHttpRequest')
$inv = [Globalization.CultureInfo]::InvariantCulture

function Get-XemaStats([string]$code) {
  $tz = [TimeZoneInfo]::FindSystemTimeZoneById('Romance Standard Time')
  $midUtc = [TimeZoneInfo]::ConvertTimeToUtc([TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $tz).Date, $tz).ToString('yyyy-MM-ddTHH:mm:ss')
  $w = "codi_estacio='$code' AND codi_variable in('35','40','42') AND data_lectura >= '$midUtc'"
  $rows = $http.GetStringAsync('https://analisi.transparenciacatalunya.cat/resource/nzvn-apee.json?$limit=2000&$where=' + [uri]::EscapeDataString($w)).GetAwaiter().GetResult() | ConvertFrom-Json
  $res = [ordered]@{}
  $rain = 0.0; $hasRain = $false
  foreach ($r in $rows) {
    $v = 0.0
    if (-not [double]::TryParse($r.valor_lectura, [Globalization.NumberStyles]::Float, $inv, [ref]$v)) { continue }
    $ts = $r.data_extrem; if (-not $ts) { $ts = $r.data_lectura }
    $ep = [DateTimeOffset]::new([DateTime]::SpecifyKind([DateTime]::Parse($ts, $inv), [DateTimeKind]::Utc)).ToUnixTimeSeconds()
    switch ([string]$r.codi_variable) {
      '35' { $rain += $v; $hasRain = $true }
      '40' { if (-not $res.Contains('temp_day_max') -or $v -gt $res['temp_day_max'][1]) { $res['temp_day_max'] = @($ep, $v) } }
      '42' { if (-not $res.Contains('temp_day_min') -or $v -lt $res['temp_day_min'][1]) { $res['temp_day_min'] = @($ep, $v) } }
    }
  }
  if ($hasRain) { $res['rain_day_total'] = [math]::Round($rain, 1) }
  $res | ConvertTo-Json -Compress
}

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
Write-Host "Meteo Penedes  ->  http://localhost:$Port/   (Ctrl+C per aturar)" -ForegroundColor Cyan
if ($Lan) {
  Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.PrefixOrigin -in 'Dhcp', 'Manual' } |
    ForEach-Object { Write-Host "Des del mobil (mateixa wifi):  http://$($_.IPAddress):$Port/" -ForegroundColor Yellow }
}
Write-Host "Carregant dades de $($wcIds.Count + $xemaIds.Count) estacions..."
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
      if ($path -match '^/api/estadistiques/([A-Za-z0-9]{2}|\d{10})$') {
        $id = $Matches[1]
        $known = @($stations | Where-Object { $_.id -eq $id }).Count -gt 0
        $hit = $shared.stats[$id]
        if ($known -and (-not $hit -or ((Get-Date) - $hit.time).TotalSeconds -gt 300)) {
          try {
            if ($id.Length -eq 2) { $raw = Get-XemaStats $id }
            else { $raw = $http.GetStringAsync("https://app.weathercloud.net/device/stats?code=$id").GetAwaiter().GetResult() }
          } catch { $raw = '{}' }
          $hit = @{ time = Get-Date; body = $raw }
          $shared.stats[$id] = $hit
        }
        $body = if ($hit) { $hit.body } else { '{}' }
        Send-Bytes $ctx ([Text.Encoding]::UTF8.GetBytes($body)) $mime['.json']
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
