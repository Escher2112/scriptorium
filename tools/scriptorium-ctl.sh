#!/bin/bash
# scriptorium-ctl — drive a LIVE Scriptorium page from the shell (an agent — Claude Code, Codex, …) through the helper
# /control mailbox. The page must be open with Remote control ON (default). localhost only.
#
#   scriptorium-ctl status                          # is a page connected?
#   scriptorium-ctl ping
#   scriptorium-ctl get_document                    # print the current doc
#   scriptorium-ctl get_selection                   # what the user highlighted
#   scriptorium-ctl open_tab report.md < file.md    # push a NEW doc into the editor (markdown on stdin)
#   scriptorium-ctl set_document < file.md          # replace the current doc (markdown on stdin)
#   scriptorium-ctl append_text < snippet.md        # append markdown on stdin
#   scriptorium-ctl apply_edit 'old text' 'new text'
#   scriptorium-ctl replace_selection 'reworked passage'   # rework what the user highlighted
#   scriptorium-ctl set_view render|write|source
#   scriptorium-ctl render                          # switch to Page view
#   scriptorium-ctl print                           # open the print/PDF dialog on the page
#   scriptorium-ctl raw '{"cmd":"set_font","args":{"color":"#2e8b57"}}'   # any command, raw JSON
#
# Env: SCRIPTORIUM_HELPER (default http://127.0.0.1:9194), SCRIPTORIUM_CTL_TIMEOUT (default 30)
set -euo pipefail
H="${SCRIPTORIUM_HELPER:-http://127.0.0.1:9194}"
TO="${SCRIPTORIUM_CTL_TIMEOUT:-30}"
cmd="${1:-status}"; shift || true
jstr(){ python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$1"; }
post(){ curl -s -X POST "$H/control/push" -H 'Content-Type: application/json' -d "$1" \
        | python3 -c 'import json,sys;r=json.load(sys.stdin);print(r.get("result") if r.get("ok") else "ERROR: "+str(r.get("error")), file=(sys.stderr if not r.get("ok") else sys.stdout));sys.exit(0 if r.get("ok") else 1)'; }
case "$cmd" in
  status)   curl -s "$H/control/status" ; echo ;;
  ping|get_document|get_selection|get_state|list_tabs|render|print|export_html|save)
            post "{\"cmd\":\"$cmd\",\"timeout\":$TO}" ;;
  set_view) post "{\"cmd\":\"set_view\",\"args\":{\"view\":\"${1:?view: write|source|render}\"},\"timeout\":$TO}" ;;
  switch_tab) post "{\"cmd\":\"switch_tab\",\"args\":{\"index\":${1:?index}},\"timeout\":$TO}" ;;
  open_tab) md=$(cat); post "{\"cmd\":\"open_tab\",\"args\":{\"name\":$(jstr "${1:-untitled.md}"),\"markdown\":$(jstr "$md")},\"timeout\":$TO}" ;;
  set_document|append_text) md=$(cat); post "{\"cmd\":\"$cmd\",\"args\":{\"markdown\":$(jstr "$md")},\"timeout\":$TO}" ;;
  apply_edit) post "{\"cmd\":\"apply_edit\",\"args\":{\"old_string\":$(jstr "${1:?old}"),\"new_string\":$(jstr "${2:?new}")},\"timeout\":$TO}" ;;
  replace_selection) post "{\"cmd\":\"replace_selection\",\"args\":{\"text\":$(jstr "${1:?text}")},\"timeout\":$TO}" ;;
  raw)      body=$(python3 -c 'import json,sys;o=json.loads(sys.argv[1]);o.setdefault("timeout",'"$TO"');print(json.dumps(o))' "${1:?json}"); post "$body" ;;
  *) echo "unknown command: $cmd (see the header of $0)"; exit 2 ;;
esac
