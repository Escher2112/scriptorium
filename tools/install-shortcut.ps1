# install-shortcut.ps1 — put a "Scriptorium" launcher on the Desktop of THIS machine (Windows).
# The shortcut runs tools\scriptorium-open.cmd from this clone (starts the helper, cache-busts, opens the app window)
# and uses tools\scriptorium.ico. Nothing machine-specific is stored in the repo — run this on each box.
#
#   powershell -ExecutionPolicy Bypass -File tools\install-shortcut.ps1
#   powershell -ExecutionPolicy Bypass -File tools\install-shortcut.ps1 -Python "C:\path\to\python.exe"   # if plain "python" is the Store alias
#   powershell -ExecutionPolicy Bypass -File tools\install-shortcut.ps1 -Desktop "D:\Some\Folder"        # somewhere other than the Desktop
param(
  [string]$Python = "",
  [string]$Desktop = "",
  [string]$Name = "Scriptorium"
)
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$cmd  = Join-Path $root "tools\scriptorium-open.cmd"
$ico  = Join-Path $root "tools\scriptorium.ico"
if (-not (Test-Path $cmd)) { Write-Error "not found: $cmd"; exit 1 }
if ($Desktop -eq "") { $Desktop = [Environment]::GetFolderPath("Desktop") }   # follows OneDrive-redirected desktops
$lnk = Join-Path $Desktop "$Name.lnk"
$q = [char]34
$argStr = "/c " + $q + $q + $cmd + $q + $q
if ($Python -ne "") { $argStr = "/c " + $q + "set " + $q + "SCRIPTORIUM_PYTHON=" + $Python + $q + " && " + $q + $cmd + $q + $q }
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath = "$env:SystemRoot\System32\cmd.exe"
$s.Arguments = $argStr
$s.WorkingDirectory = $root
$s.IconLocation = "$ico,0"
$s.WindowStyle = 7
$s.Description = "Scriptorium — Markdown word processor (starts the helper, opens the app window)"
$s.Save()
Write-Output "created: $lnk"
Write-Output "  runs:  $cmd"
if ($Python -ne "") { Write-Output "  python: $Python" }
