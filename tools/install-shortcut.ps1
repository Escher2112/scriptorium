# install-shortcut.ps1 - create a "Scriptorium" desktop shortcut on THIS Windows machine.
#
# The shortcut points straight at tools\scriptorium-open.cmd in this clone (which starts the local search/control
# helper if needed and opens the app window) and uses tools\scriptorium.ico. Nothing machine-specific is stored in
# the repo: run this once per computer.
#
#   powershell -File tools\install-shortcut.ps1
#   powershell -File tools\install-shortcut.ps1 -Python "C:\path\to\python.exe"   # if plain "python" on this box is the Store alias
#   powershell -File tools\install-shortcut.ps1 -Desktop "D:\Some\Folder"        # somewhere other than the Desktop
#
# If Windows refuses to run local scripts ("running scripts is disabled"), allow local scripts for your user once:
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
# (-Python writes tools\scriptorium-open.local.cmd, a one-line, git-ignored file the launcher reads.)
param(
  [string]$Python = "",
  [string]$Desktop = "",
  [string]$Name = "Scriptorium"
)
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$cmd  = Join-Path $root "tools\scriptorium-open.cmd"
$ico  = Join-Path $root "tools\scriptorium.ico"
if (-not (Test-Path $cmd)) { Write-Error "not found: $cmd"; exit 1 }
if ($Desktop -eq "") { $Desktop = [Environment]::GetFolderPath("Desktop") }   # follows a OneDrive-redirected Desktop
if ($Python -ne "") {
  $local = Join-Path $root "tools\scriptorium-open.local.cmd"
  Set-Content -Path $local -Value ("set ""SCRIPTORIUM_PYTHON=" + $Python + """") -Encoding ASCII
  Write-Output "wrote:   $local"
}
$lnk = Join-Path $Desktop "$Name.lnk"
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath = $cmd
$s.WorkingDirectory = $root
$s.IconLocation = "$ico,0"
$s.WindowStyle = 7
$s.Description = "Scriptorium - Markdown word processor"
$s.Save()
Write-Output "created: $lnk"
Write-Output "  runs:  $cmd"
