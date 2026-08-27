#!/usr/bin/env bash
# install-shortcut.sh — put a "Scriptorium" launcher on THIS machine (Linux or macOS). Windows: install-shortcut.ps1.
#   tools/install-shortcut.sh                       # Linux: app-menu entry (+ Desktop copy if ~/Desktop exists); macOS: ~/Applications/Scriptorium.app
#   tools/install-shortcut.sh -p /path/to/python3   # record the interpreter for the helper (writes tools/scriptorium-open.local.sh, git-ignored)
#   tools/install-shortcut.sh -d /some/dir          # put the launcher somewhere else
# Nothing machine-specific goes into the repo; run this once per computer.
set -e
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCH="$HERE/scriptorium-open.sh"; PNG="$HERE/scriptorium.png"
PYTHON=""; DEST=""; NAME="Scriptorium"
while getopts "p:d:n:" o; do case $o in p) PYTHON=$OPTARG;; d) DEST=$OPTARG;; n) NAME=$OPTARG;; esac; done
chmod +x "$LAUNCH" "$HERE/scriptorium-ctl.sh" 2>/dev/null || true
if [[ -n $PYTHON ]]; then
  printf 'SCRIPTORIUM_PYTHON=%q\n' "$PYTHON" > "$HERE/scriptorium-open.local.sh"; echo "wrote:   $HERE/scriptorium-open.local.sh"
fi
OS="${SCRIPTORIUM_OS:-$(uname -s)}"
case "$OS" in
  Darwin)
    DEST="${DEST:-$HOME/Applications}"; mkdir -p "$DEST"
    APP="$DEST/$NAME.app"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
    cat > "$APP/Contents/MacOS/$NAME" <<EOF
#!/usr/bin/env bash
exec "$LAUNCH"
EOF
    chmod +x "$APP/Contents/MacOS/$NAME"
    ICON_LINE=""
    if command -v sips >/dev/null 2>&1 && [[ -f $PNG ]]; then
      sips -s format icns "$PNG" --out "$APP/Contents/Resources/$NAME.icns" >/dev/null 2>&1 && ICON_LINE="  <key>CFBundleIconFile</key><string>$NAME.icns</string>"
    fi
    cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>$NAME</string>
  <key>CFBundleDisplayName</key><string>$NAME</string>
  <key>CFBundleIdentifier</key><string>com.escher2112.scriptorium</string>
  <key>CFBundleVersion</key><string>2</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>$NAME</string>
$ICON_LINE
  <key>LSUIElement</key><false/>
</dict></plist>
EOF
    echo "created: $APP  (also drag it to the Dock if you like)"
    ;;
  Linux|*)
    ENTRY="[Desktop Entry]
Type=Application
Version=1.0
Name=$NAME
Comment=Markdown word processor - one file, WYSIWYG, AI assistant
Exec=\"$LAUNCH\"
Icon=$PNG
Terminal=false
Categories=Office;WordProcessor;
StartupWMClass=scriptorium"
    APPDIR="${DEST:-$HOME/.local/share/applications}"; mkdir -p "$APPDIR"
    printf '%s\n' "$ENTRY" > "$APPDIR/scriptorium.desktop"; chmod +x "$APPDIR/scriptorium.desktop"
    echo "created: $APPDIR/scriptorium.desktop"
    if [[ -z $DEST && -d $HOME/Desktop ]]; then
      printf '%s\n' "$ENTRY" > "$HOME/Desktop/$NAME.desktop"; chmod +x "$HOME/Desktop/$NAME.desktop"
      command -v gio >/dev/null 2>&1 && gio set "$HOME/Desktop/$NAME.desktop" metadata::trusted true 2>/dev/null || true
      echo "created: $HOME/Desktop/$NAME.desktop"
    fi
    command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPDIR" 2>/dev/null || true
    ;;
esac
echo "  runs:  $LAUNCH"
