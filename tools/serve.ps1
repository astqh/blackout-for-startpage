# Serves this folder's install page and add-on files on http://localhost:8777/ (this PC only) until the window is
# closed. Only the files listed below can be fetched. Started by "Install add-ons.cmd".
param([switch]$NoOpen)                       # -NoOpen: don't open a browser
$root = Split-Path -Parent $PSScriptRoot
$js = 'text/javascript; charset=utf-8'
$files = @{
  '/'                               = @("$root\index.html", 'text/html; charset=utf-8')
  '/index.html'                     = @("$root\index.html", 'text/html; charset=utf-8')
  '/theme/blackout.user.css'        = @("$root\theme\blackout.user.css", 'text/css; charset=utf-8')
  '/theme/blackout-searxng.user.css' = @("$root\theme\blackout-searxng.user.css", 'text/css; charset=utf-8')
  '/scripts/tweaks.user.js'         = @("$root\scripts\tweaks.user.js", $js)
  '/scripts/home.user.js'           = @("$root\scripts\home.user.js", $js)
  '/scripts/instant-answer.user.js' = @("$root\scripts\instant-answer.user.js", $js)
  '/scripts/f1.user.js'             = @("$root\scripts\f1.user.js", $js)
  '/scripts/quick.user.js'          = @("$root\scripts\quick.user.js", $js)
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:8777/')
try { $listener.Start() } catch { Write-Host "Couldn't start (is it already open in another window?) $_" -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1 }
Write-Host ''
Write-Host '  Install page running.' -ForegroundColor Green
Write-Host '  In each browser or profile, open:  http://localhost:8777/'
Write-Host '  Close this window when you are done.'
Write-Host ''
if (-not $NoOpen) { Start-Process 'http://localhost:8777/' }      # opens in your default browser

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = $ctx.Request.Url.AbsolutePath
  $res = $ctx.Response
  $res.Headers.Add('Cache-Control', 'no-store')
  if ($files.ContainsKey($path) -and (Test-Path $files[$path][0])) {
    $bytes = [IO.File]::ReadAllBytes($files[$path][0])
    $res.ContentType = $files[$path][1]
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    Write-Host ("  sent " + $path)
  } else { $res.StatusCode = 404 }
  $res.Close()
}
