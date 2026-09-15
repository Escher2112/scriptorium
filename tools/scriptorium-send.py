#!/usr/bin/env python3
"""Hand a Markdown file to a running Scriptorium page via the helper's control mailbox.

    scriptorium-send.py [--if-open] <file.md>

The page long-polls the helper's /control channel and honours an `open_tab` command, so this
just reads the file and pushes `open_tab {markdown, name}`. Used by scriptorium-open.cmd when a
.md is double-clicked, so the clicked file actually loads (instead of the app showing its last tab).

    --if-open   only deliver if a page is already connected; otherwise exit 3 and change nothing
                (the caller then opens a window and re-sends without this flag).

Exit codes: 0 delivered · 1 error · 3 no page connected (only with --if-open).
Helper base URL: $SCRIPTORIUM_HELPER or http://127.0.0.1:9194
"""
import sys, os, json, urllib.request

BASE = os.environ.get("SCRIPTORIUM_HELPER", "http://127.0.0.1:9194").rstrip("/")


def _get(path, timeout=4):
    with urllib.request.urlopen(BASE + path, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def _post(path, obj, timeout):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(obj).encode("utf-8"),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    args = sys.argv[1:]
    if_open = "--if-open" in args
    files = [a for a in args if not a.startswith("--")]
    if not files:
        sys.stderr.write("usage: scriptorium-send.py [--if-open] <file.md>\n")
        return 1
    path = files[0]
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            md = f.read()
    except OSError as e:
        sys.stderr.write("cannot read %s: %s\n" % (path, e))
        return 1
    name = os.path.basename(path)

    if if_open:
        try:
            if not _get("/control/status").get("connected"):
                return 3          # no page listening — caller should open one
        except Exception:
            return 3              # helper unreachable — treat as no page

    timeout = 8 if if_open else 45   # without --if-open, block while a freshly-opened window boots
    try:
        r = _post("/control/push",
                  {"cmd": "open_tab", "args": {"markdown": md, "name": name}, "timeout": timeout},
                  timeout + 5)
    except Exception as e:
        sys.stderr.write("send failed: %s\n" % e)
        return 1
    if r.get("ok"):
        print("opened %s in Scriptorium" % name)
        return 0
    sys.stderr.write("not delivered: %s\n" % (r.get("error") or "unknown"))
    return 1


if __name__ == "__main__":
    sys.exit(main())
