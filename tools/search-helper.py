#!/usr/bin/env python3
"""Scriptorium search helper — a tiny LOCAL HTTP service that gives the in-page assistant two tools:
web_search (keyless) and read_url (page → readable text). Standard library only; Python 3.9+; any OS.

    python tools/search-helper.py            # 127.0.0.1:9194
    python tools/search-helper.py --port 9195 --host 127.0.0.1

Endpoints (all JSON, CORS * because scriptorium.html runs from file://):
    GET /health                  → {ok, backends, version}
    GET /search?q=…&n=8          → {query, backend, results:[{title,url,snippet}], tried:[…]}
    GET /fetch?url=…&max=8000    → {url, final_url, title, text, truncated}
    POST /trace  (JSON body)     → appends one exchange to ~/.local/share/scriptorium/trace/YYYY-MM-DD.jsonl
    GET /trace?n=5               → the last n exchanges back (what the assistant was sent, what it streamed, tool I/O)

  CONTROL CHANNEL (lets an external driver — e.g. Claude Code — operate the LIVE Scriptorium page):
    POST /control/push {cmd,args,timeout}  → enqueue a command for the page; blocks up to `timeout`s for its result
    GET  /control/poll?wait=25             → the PAGE long-polls this; returns queued commands to run
    POST /control/result {id,ok,result}    → the PAGE posts a command's result here (wakes the pusher)
    GET  /control/status                   → {connected, last_poll_age, queued}  (is a page listening?)
  The page decides which commands it honours; the helper is just the mailbox. localhost-only, no auth
  (same trust boundary as the rest of the helper). The page shows a "remote control" light when connected.

Everything the assistant does is written to TRACE_DIR (override: SCRIPTORIUM_TRACE_DIR): every search's full
result set, every fetch, and — when the page POSTs it — every model exchange with the FULL system prompt,
messages, raw stream and tool results. Local files, never leave the machine; delete them whenever you like.

Backends, in order: SearXNG (only if SCRIPTORIUM_SEARXNG=http://host:port is set — best, multi-engine),
Brave HTML (best ranking, no key; 429s after bursts → cooldown), Yahoo HTML (Bing-backed, tolerant), Bing RSS (last). DuckDuckGo is NOT used: its
html/lite endpoints answer scripted requests with a duck-captcha (verified 2026-08-26 from the P72).

Why a helper at all: a page opened from file:// cannot fetch search engines or arbitrary sites
(CORS), and LM Studio's own search plugins only run inside LM Studio's chat / its /api/v1/chat
endpoint, which has no client-side tools — using it would cost the assistant its document tools.
"""
import argparse, gzip, html, io, json, os, re, sys, time, urllib.parse, urllib.request, urllib.error
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "0.3 (2026-08-27)"
TRACE_DIR = os.environ.get("SCRIPTORIUM_TRACE_DIR") or os.path.join(os.path.expanduser("~"), ".local", "share", "scriptorium", "trace")
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/128.0 Safari/537.36 ScriptoriumSearchHelper/" + VERSION.split()[0])
TIMEOUT = 12
SEARXNG = os.environ.get("SCRIPTORIUM_SEARXNG", "").rstrip("/")

# ---------------------------------------------------------------- http --------------------------
def http_get(url, accept=None, timeout=TIMEOUT):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": accept or "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        if r.headers.get("Content-Encoding", "").lower() == "gzip":
            raw = gzip.decompress(raw)
        ctype = r.headers.get("Content-Type", "")
        m = re.search(r"charset=([\w-]+)", ctype)
        enc = m.group(1) if m else "utf-8"
        try: text = raw.decode(enc, errors="replace")
        except LookupError: text = raw.decode("utf-8", errors="replace")
        return text, ctype, r.geturl()

def strip_tags(s):
    s = re.sub(r"(?is)<(script|style|noscript|svg|template|iframe)[^>]*>.*?</\1>", " ", s)
    s = re.sub(r"(?i)<br\s*/?>|</(p|div|h[1-6]|li|tr|section|article|blockquote|pre)>", "\n", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    s = re.sub(r"[ \t\r\f\v]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n\n", s)
    return s.strip()

# ---------------------------------------------------------------- backends ----------------------
def search_searxng(q, n):
    if not SEARXNG: raise RuntimeError("SCRIPTORIUM_SEARXNG not set")
    url = SEARXNG + "/search?" + urllib.parse.urlencode({"q": q, "format": "json"})
    text, _, _ = http_get(url, accept="application/json")
    j = json.loads(text)
    out = []
    for r in j.get("results", []):
        if r.get("url") and r.get("title"):
            out.append({"title": strip_tags(r["title"]), "url": r["url"], "snippet": strip_tags(r.get("content") or "")})
        if len(out) >= n: break
    return out

def search_bing(q, n):
    url = "https://www.bing.com/search?" + urllib.parse.urlencode({"q": q, "format": "rss", "setlang": "en"})
    text, _, _ = http_get(url, accept="application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8")
    root = ET.fromstring(text.encode("utf-8", errors="replace"))
    out = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip(); link = (it.findtext("link") or "").strip()
        desc = strip_tags(it.findtext("description") or "")
        if title and link.startswith("http"):
            out.append({"title": html.unescape(title), "url": link, "snippet": desc})
        if len(out) >= n: break
    return out

def search_brave(q, n):
    url = "https://search.brave.com/search?" + urllib.parse.urlencode({"q": q, "source": "web"})
    text, _, _ = http_get(url)
    blocks = re.split(r'(?=<div class="snippet[^"]*" data-pos="\d+" data-type="web")', text)
    out = []
    for b in blocks:
        if 'data-type="web"' not in b[:200]: continue
        href = re.search(r'<a href="(https?://[^"]+)"', b)
        title = re.search(r'class="title[^"]*"[^>]*title="([^"]*)"', b) or re.search(r'class="title[^"]*"[^>]*>(.*?)</div>', b, re.S)
        desc = re.search(r'class="content [^"]*"[^>]*>(.*?)</div>', b, re.S)   # Brave: <div class="content desktop-default-regular …">
        if href and title:
            out.append({"title": strip_tags(html.unescape(title.group(1))), "url": href.group(1),
                        "snippet": strip_tags(desc.group(1)) if desc else ""})
        if len(out) >= n: break
    return out

def search_yahoo(q, n):
    url = "https://search.yahoo.com/search?" + urllib.parse.urlencode({"p": q, "n": str(max(10, n))})
    text, _, _ = http_get(url)
    out = []
    for blk in re.split(r'(?=<div class="[^"]*\balgo-sr\b)', text)[1:]:
        a = re.search(r'<a [^>]*href="([^"]+)"', blk)
        t = re.search(r'<h3[^>]*class="title[^"]*"[^>]*>(.*?)</h3>', blk, re.S)
        d = re.search(r'<div class="compText[^"]*">\s*<p[^>]*>(.*?)</p>', blk, re.S)
        if not (a and t): continue
        href = html.unescape(a.group(1))
        m = re.search(r'/RU=([^/]+)/', href)                      # Yahoo wraps the target in a redirect: …/RU=<urlencoded>/RK=…
        if m: href = urllib.parse.unquote(m.group(1))
        if not href.startswith("http"): continue
        out.append({"title": strip_tags(t.group(1)), "url": href, "snippet": strip_tags(d.group(1)) if d else ""})
        if len(out) >= n: break
    return out

BACKENDS = [("searxng", search_searxng)] if SEARXNG else []
BACKENDS += [("brave", search_brave), ("yahoo", search_yahoo), ("bing", search_bing)]
# Brave ranks best but 429s after a burst (→ cooldown); Yahoo HTML is Bing-backed and tolerant; Bing RSS/HTML from a
# scripted client degrades to 1 junk result for some queries (seen 2026-08-26). Rotation + cooldown + cache = resilience.

COOLDOWN = {}          # backend name → time until which it is skipped (after a 429/403/5xx)
COOLDOWN_SECS = 120
CACHE, CACHE_SECS = {}, 600   # (q, n) → (time, result): repeated queries in one session hit the engines once

def do_search(q, n):
    key = (q.lower().strip(), n); now = time.time()
    hit = CACHE.get(key)
    if hit and now - hit[0] < CACHE_SECS:
        r = dict(hit[1]); r["cached"] = True; return r
    tried, errors = [], []
    for name, fn in BACKENDS:
        if COOLDOWN.get(name, 0) > now:
            errors.append(name + ": cooling down %ds" % int(COOLDOWN[name] - now)); continue
        tried.append(name)
        try:
            res = fn(q, n)
            if res:
                r = {"query": q, "backend": name, "results": res, "tried": tried, "errors": errors}
                CACHE[key] = (now, r); return r
            errors.append(name + ": 0 results")
        except urllib.error.HTTPError as e:
            errors.append(name + ": HTTP %d" % e.code)
            if e.code in (403, 429) or e.code >= 500: COOLDOWN[name] = now + COOLDOWN_SECS
        except Exception as e:
            errors.append(name + ": " + type(e).__name__ + " " + str(e)[:120])
    return {"query": q, "backend": None, "results": [], "tried": tried, "errors": errors}

def do_fetch(url, max_chars):
    u = urllib.parse.urlparse(url)
    if u.scheme not in ("http", "https"): raise ValueError("only http/https URLs")
    text, ctype, final = http_get(url)
    title = ""
    if "html" in ctype or "<html" in text[:2000].lower():
        m = re.search(r"(?is)<title[^>]*>(.*?)</title>", text)
        title = strip_tags(m.group(1)) if m else ""
        # prefer the article/main body when present
        body = re.search(r"(?is)<(article|main)[^>]*>(.*?)</\1>", text)
        body_text = strip_tags(body.group(2)) if body else strip_tags(text)
    elif ctype.startswith("text/") or "json" in ctype or "xml" in ctype:
        body_text = text
    else:
        body_text = "(binary content-type %s — %d bytes; not readable as text)" % (ctype, len(text))
    truncated = len(body_text) > max_chars
    return {"url": url, "final_url": final, "title": title, "text": body_text[:max_chars], "truncated": truncated}

TRACE_MAX_DAYS = int(os.environ.get("SCRIPTORIUM_TRACE_DAYS", "14"))     # prune trace files older than this
TRACE_MAX_MB = float(os.environ.get("SCRIPTORIUM_TRACE_MB", "25"))       # cap a single day's file
_trace_prune_day = [None]
def _trace_prune():
    """Once a day: delete trace files older than TRACE_MAX_DAYS. Cheap, best-effort."""
    day = time.strftime("%Y-%m-%d")
    if _trace_prune_day[0] == day: return
    _trace_prune_day[0] = day
    try:
        cutoff = time.time() - TRACE_MAX_DAYS * 86400
        for fn in os.listdir(TRACE_DIR):
            if not fn.endswith(".jsonl"): continue
            fp = os.path.join(TRACE_DIR, fn)
            if os.path.getmtime(fp) < cutoff: os.remove(fp)
    except Exception: pass
def trace_write(kind, obj):
    try:
        os.makedirs(TRACE_DIR, exist_ok=True)
        _trace_prune()
        fp = os.path.join(TRACE_DIR, time.strftime("%Y-%m-%d") + ".jsonl")
        if os.path.exists(fp) and os.path.getsize(fp) > TRACE_MAX_MB * 1e6:
            os.replace(fp, fp + ".1")   # roll over; keep one previous
        rec = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "kind": kind}; rec.update(obj)
        with open(fp, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except Exception as e:
        sys.stderr.write("trace write failed: %s\n" % e)

def trace_tail(n, kind=None):
    out = []
    try:
        files = sorted(f for f in os.listdir(TRACE_DIR) if f.endswith(".jsonl"))
        for fn in reversed(files):
            for line in reversed(open(os.path.join(TRACE_DIR, fn), encoding="utf-8").read().splitlines()):
                try: r = json.loads(line)
                except Exception: continue
                if kind and r.get("kind") != kind: continue
                out.append(r)
                if len(out) >= n: return list(reversed(out))
    except FileNotFoundError: pass
    return list(reversed(out))

# ---------------------------------------------------------------- control channel ---------------
import threading, itertools
_CTL_LOCK = threading.Lock()
_CTL_COND = threading.Condition(_CTL_LOCK)
_CTL_QUEUE = []                    # commands waiting for the page to pick up: {id,cmd,args,ts}
_CTL_RESULTS = {}                  # id -> result dict, set by the page
_CTL_IDS = itertools.count(1)
_CTL_LAST_POLL = [0.0]            # last time the page long-polled (liveness)

def ctl_push(cmd, args, timeout):
    """Enqueue a command and block until the page posts its result (or timeout)."""
    cid = next(_CTL_IDS)
    with _CTL_COND:
        _CTL_QUEUE.append({"id": cid, "cmd": cmd, "args": args, "ts": _now()})
        _CTL_COND.notify_all()
        deadline = _monotonic() + timeout
        while cid not in _CTL_RESULTS:
            remaining = deadline - _monotonic()
            if remaining <= 0:
                # give up: drop the command if still queued
                for i, c in enumerate(_CTL_QUEUE):
                    if c["id"] == cid: _CTL_QUEUE.pop(i); break
                return {"ok": False, "error": "timeout: no page picked this up (is Scriptorium open, control ON?)", "id": cid}
            _CTL_COND.wait(remaining)
        return _CTL_RESULTS.pop(cid)

def ctl_poll(wait):
    """The page calls this; block up to `wait`s for commands, return whatever is queued."""
    with _CTL_COND:
        _CTL_LAST_POLL[0] = _monotonic()
        deadline = _monotonic() + wait
        while not _CTL_QUEUE:
            remaining = deadline - _monotonic()
            if remaining <= 0: return []
            _CTL_COND.wait(remaining)
        cmds = _CTL_QUEUE[:]; _CTL_QUEUE.clear()
        return cmds

def ctl_result(cid, result):
    with _CTL_COND:
        _CTL_RESULTS[cid] = result
        _CTL_COND.notify_all()

def ctl_status():
    age = _monotonic() - _CTL_LAST_POLL[0] if _CTL_LAST_POLL[0] else None
    return {"connected": age is not None and age < 40, "last_poll_age": round(age, 1) if age is not None else None,
            "queued": len(_CTL_QUEUE)}

# time helpers that don't break resume-style tooling if time is patched elsewhere
def _now(): return time.strftime("%Y-%m-%dT%H:%M:%S")
def _monotonic(): return time.monotonic()

# ---------------------------------------------------------------- server ------------------------
class H(BaseHTTPRequestHandler):
    server_version = "ScriptoriumSearch/" + VERSION.split()[0]
    def _send(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers(); self.wfile.write(data)
    def do_OPTIONS(self):
        self.send_response(204); self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*"); self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); self.end_headers()
    def do_POST(self):
        p = urllib.parse.urlparse(self.path)
        try:
            n = int(self.headers.get("Content-Length") or 0); body = self.rfile.read(n) if n else b""
            if p.path == "/trace":
                obj = json.loads(body.decode("utf-8") or "{}")
                trace_write("exchange", obj if isinstance(obj, dict) else {"data": obj})
                self._send(200, {"ok": True, "dir": TRACE_DIR}); return
            if p.path == "/control/push":
                obj = json.loads(body.decode("utf-8") or "{}")
                cmd = obj.get("cmd")
                if not cmd: self._send(400, {"error": "missing cmd"}); return
                to = float(obj.get("timeout", 30)); to = max(1.0, min(120.0, to))
                r = ctl_push(cmd, obj.get("args", {}), to)
                trace_write("control", {"cmd": cmd, "args": obj.get("args", {}), "ok": r.get("ok"), "error": r.get("error")})
                self._send(200, r); return
            if p.path == "/control/result":
                obj = json.loads(body.decode("utf-8") or "{}")
                cid = obj.get("id")
                if cid is None: self._send(400, {"error": "missing id"}); return
                ctl_result(int(cid), {"ok": bool(obj.get("ok", True)), "result": obj.get("result"), "error": obj.get("error")})
                self._send(200, {"ok": True}); return
            self._send(404, {"error": "unknown path"})
        except Exception as e:
            self._send(400, {"error": type(e).__name__ + ": " + str(e)[:200]})
    def do_GET(self):
        t0 = time.time()
        p = urllib.parse.urlparse(self.path); qs = urllib.parse.parse_qs(p.query)
        g = lambda k, d="": (qs.get(k) or [d])[0]
        try:
            if p.path == "/health":
                self._send(200, {"ok": True, "backends": [b for b, _ in BACKENDS], "version": VERSION, "trace_dir": TRACE_DIR, "control": ctl_status()}); return
            if p.path == "/trace":
                n = max(1, min(200, int(g("n", "5") or 5))); self._send(200, {"dir": TRACE_DIR, "items": trace_tail(n, g("kind") or None)}); return
            if p.path == "/search":
                q = g("q").strip()
                if not q: self._send(400, {"error": "missing q"}); return
                n = max(1, min(20, int(g("n", "8") or 8)))
                r = do_search(q, n); self._send(200, r); trace_write("search", r)
                self.log_message("search %r → %s %d results (%.1fs)%s", q, r["backend"], len(r["results"]), time.time() - t0,
                                 ("  [" + "; ".join(r["errors"]) + "]") if r.get("errors") else ""); return
            if p.path == "/fetch":
                url = g("url").strip()
                if not url: self._send(400, {"error": "missing url"}); return
                mx = max(500, min(60000, int(g("max", "8000") or 8000)))
                r = do_fetch(url, mx); self._send(200, r); trace_write("fetch", {"url": url, "final_url": r["final_url"], "title": r["title"], "chars": len(r["text"]), "truncated": r["truncated"], "text": r["text"]})
                self.log_message("fetch %s → %d chars (%.1fs)", url[:80], len(r["text"]), time.time() - t0); return
            if p.path == "/control/poll":
                wait = max(1.0, min(50.0, float(g("wait", "25") or 25)))
                self._send(200, {"commands": ctl_poll(wait)}); return
            if p.path == "/control/status":
                self._send(200, ctl_status()); return
            self._send(404, {"error": "unknown path", "paths": ["/health", "/search?q=", "/fetch?url=", "/trace", "/control/push", "/control/poll", "/control/result", "/control/status"]})
        except urllib.error.HTTPError as e:
            self._send(502, {"error": "upstream HTTP %d" % e.code})
        except Exception as e:
            self._send(500, {"error": type(e).__name__ + ": " + str(e)[:200]})
    def log_message(self, fmt, *a):
        sys.stderr.write("[%s] %s\n" % (time.strftime("%H:%M:%S"), fmt % a)); sys.stderr.flush()

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--host", default="127.0.0.1"); ap.add_argument("--port", type=int, default=9194)
    ap.add_argument("--selftest", metavar="QUERY", help="run a search + fetch from the CLI and exit")
    a = ap.parse_args()
    if a.selftest:
        r = do_search(a.selftest, 5); print(json.dumps({k: v for k, v in r.items() if k != "results"}))
        for x in r["results"]: print(" -", x["title"][:70], "|", x["url"][:80])
        if r["results"]:
            f = do_fetch(r["results"][0]["url"], 600); print("fetch:", f["title"][:70], "|", len(f["text"]), "chars, truncated=", f["truncated"])
        sys.exit(0 if r["results"] else 1)
    srv = ThreadingHTTPServer((a.host, a.port), H)
    sys.stderr.write("scriptorium search helper %s on http://%s:%d  backends=%s\n" % (VERSION, a.host, a.port, [b for b, _ in BACKENDS]))
    try: srv.serve_forever()
    except KeyboardInterrupt: pass

if __name__ == "__main__": main()
