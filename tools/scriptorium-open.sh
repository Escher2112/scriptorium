#!/bin/bash
# Launch Scriptorium with a cache-busting ?v=<mtime> so a rebuilt scriptorium.html is NEVER served stale from
# Chromium's file:// cache (the #1 false-bug in this project — see WHAT-THIS-IS.md). localStorage is keyed by the
# file:// origin, NOT the query, so drafts/chats/settings are unaffected (verified 2026-08-26).
HTML="${SCRIPTORIUM_HTML:-$HOME/Master-Projects/scriptorium/scriptorium.html}"
[[ -f $HTML ]] || { notify-send "Scriptorium" "not found: $HTML" 2>/dev/null; echo "not found: $HTML" >&2; exit 1; }
V=$(stat -c %Y "$HTML" 2>/dev/null || date +%s)
URL="file://${HTML}?v=${V}"
if command -v omarchy-launch-webapp >/dev/null 2>&1; then exec omarchy-launch-webapp "$URL"; fi
# portable fallback: first available Chromium-family browser as an app window
for b in chromium google-chrome-stable google-chrome brave chromium-browser; do
  command -v "$b" >/dev/null 2>&1 && exec "$b" --app="$URL"
done
xdg-open "$URL"
