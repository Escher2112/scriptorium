#!/usr/bin/env bash
# scriptorium-open.sh — Linux / macOS launcher (counterpart of scriptorium-open.cmd).
#   1. starts tools/search-helper.py in the background if nothing answers on :9194 (web search + the remote-control channel)
#   2. opens scriptorium.html as a browser app window with a cache-busting ?v=<mtime>, so a rebuilt file is NEVER served
#      stale from the file:// cache (localStorage is keyed by the file:// origin, not the query, so drafts/chats/settings survive)
# Optional per-machine settings in tools/scriptorium-open.local.sh (git-ignored), e.g.
#   SCRIPTORIUM_PYTHON=/opt/homebrew/bin/python3      SCRIPTORIUM_HTML=/elsewhere/scriptorium.html
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$HERE/scriptorium-open.local.sh" ]] && source "$HERE/scriptorium-open.local.sh"
HTML="${SCRIPTORIUM_HTML:-$HERE/../scriptorium.html}"
[[ -f $HTML ]] || { command -v notify-send >/dev/null 2>&1 && notify-send "Scriptorium" "not found: $HTML"; echo "not found: $HTML" >&2; exit 1; }
HTML="$(cd "$(dirname "$HTML")" && pwd)/$(basename "$HTML")"

# --- 1. helper (background, once) --------------------------------------------------------------
PY="${SCRIPTORIUM_PYTHON:-python3}"
if ! (command -v curl >/dev/null 2>&1 && curl -s -m 2 http://127.0.0.1:9194/health >/dev/null 2>&1); then
  nohup "$PY" "$HERE/search-helper.py" >/dev/null 2>&1 &
fi

# --- 2. cache-busting version = file mtime ----------------------------------------------------
V=$(stat -c %Y "$HTML" 2>/dev/null || stat -f %m "$HTML" 2>/dev/null || date +%s)
URL="file://${HTML}?v=${V}"

# --- 3. open as an app window --------------------------------------------------------------------
case "$(uname -s)" in
  Darwin)
    for app in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
               "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
               "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
               "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
      [[ -x $app ]] && { "$app" --app="$URL" >/dev/null 2>&1 & exit 0; }
    done
    exec open "$URL" ;;
  *)
    if command -v omarchy-launch-webapp >/dev/null 2>&1; then exec omarchy-launch-webapp "$URL"; fi
    for b in chromium google-chrome-stable google-chrome brave chromium-browser microsoft-edge; do
      command -v "$b" >/dev/null 2>&1 && exec "$b" --app="$URL"
    done
    exec xdg-open "$URL" ;;
esac
