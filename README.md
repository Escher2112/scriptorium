# Scriptorium

**A word processor that only speaks Markdown. Tron on the walls, crisp ink on the page.**

One HTML file. Double-click it. Write directly on a paper sheet — what you're editing *is* a `.md`
file, round-tripped losslessly by a real document engine (ProseMirror, via Toast UI Editor).

![status](https://img.shields.io/badge/status-v2-informational) ![license](https://img.shields.io/badge/license-MIT-green)

## Two editions

| file | what | size |
|---|---|---|
| `scriptorium.html` | **v2 — true WYSIWYG.** Write / Source / Page views, engine + KaTeX + Mermaid inlined | ~5 MB |
| `scriptorium-lite.html` | **v1 — zero dependencies.** Source + live preview; the same shell, chrome, AI and export | ~95 KB |

Both are single self-contained files. The lite edition is handy on weak machines or where a 5 MB
file is awkward; everything below applies to both unless marked *v2*.

## What it does

**Writing**
- *v2:* **Write** view is a Letter-width sheet you type on directly — headings, lists, tables, code
  blocks (syntax-highlighted), images, quotes — and the Markdown underneath stays exact
- **Source** view: raw Markdown with a live preview beside it
- **Page** view: the document paginated into real Letter sheets, auto-flowed; `\newpage` for a
  manual break. This is what prints.
- `Ctrl+E` cycles the views
- Tabbed multi-document editing; copy/paste between tabs; tabs persist across reloads
- Toolbar: bold / italic / strike / code, H1–H3, lists, quote, rule, link, image, table, code block,
  math, **font / size / colour** (applied as inline HTML spans — still valid Markdown)
- Paste a screenshot → it embeds as base64. Documents stay fully self-contained.
- Document zoom, focus/zen mode
- *v2:* **Math (KaTeX) and diagrams (Mermaid) are bundled** — `$…$`, `$$…$$` and ```` ```mermaid ```` fences
  render in the **Page** view and in print; in the **Write** view a diagram shows as an editable fence with a
  live preview card beside it (a parse error is shown in the card, in words). Lite falls back to styled source.

**Files**
- New / Open / Save `.md` (File System Access API, download fallback)
- Print → PDF: one sheet per page, black ink on white, manual breaks honoured
- Export a self-contained HTML page

**AI assistant** (`Ctrl+A`)
- Streams replies with **tok/s and TTFT** under each answer; **regen** and **copy** per bubble
- **Tool use:** `read_document`, `apply_edit`, `append_text`, `replace_all`, `set_document`, `replace_selection`
  — "make the paragraph on X italic and indent it" gets *done*, to the live document
- **Point at the screen:** highlight a passage and an *✦ ask about this* button appears — the assistant reworks
  exactly the selection (any function-calling model can use `get_selection` + `replace_selection`)
- **Web search** (optional): `web_search` + `read_url` when the tiny local helper is running — see below.
  The assistant is told its training has a cutoff and to search first for anything current, then cite URLs.
- Persistent chat sessions: list, new, rename, delete (☰ in the panel)
- Server config in ⚙: endpoint auto-completes to `/v1/chat/completions`, lock, poll models, pick one
- **Bring your own persona:** ⚙ → *Load from file…* (a leading `# Name` line sets the name), or make
  it permanent: copy `scriptorium.local.js.example` → `scriptorium.local.js` (gitignored, loads
  automatically) and fill in `name` / `identity` / `endpoint`

**Design system**
- 20 five-stop palettes; the whole UI re-themes live via `color-mix()`
- Ambience: off · plasma (WebGL) · matrix rain — the backdrop only *breathes*, never reacts
- CRT: screen glass (off/soft/full), scanlines (off/subtle/strong), **Clean page** toggle that keeps
  every effect off the writing surface
- Colourblind-safe: no state is carried by hue alone
- `prefers-reduced-motion` respected; **Low-end laptop mode** strips every blur and overlay

## Run it

1. Download `scriptorium.html` (or `scriptorium-lite.html`)
2. Double-click it

Drafts, tabs, chats, theme and AI settings persist in the browser's local storage for that file.

**Launchers** (optional): `tools/scriptorium-open.sh` (Linux/macOS) and `tools/scriptorium-open.cmd` (Windows)
start the search/control helper if it isn't running and open Scriptorium as its own app window with a
cache-busting URL. On Windows, point a desktop shortcut at the `.cmd` (icon: `tools/scriptorium.ico`); set
`SCRIPTORIUM_PYTHON=<path to python.exe>` in the shortcut if plain `python` is the Store alias.

> Chrome caches `file://` pages aggressively. The status bar shows the **build time** (bottom-right); if it isn't the version you just built, you're seeing a cached copy — hard-refresh (`Ctrl+Shift+R`), or for an installed web-app window, close it and reopen.

## Hook up an AI

Any OpenAI-compatible chat-completions server works.

- **LM Studio:** start the server (default `http://localhost:1234`), enable CORS in its server
  settings, load a model. In Scriptorium: ⚙ → AI Assistant · server → paste `http://localhost:1234`
  → **Poll** → pick the model.
- **Ollama:** `http://localhost:11434`, same steps.
- **Cloud:** paste the provider's chat-completions URL. (Auth headers not yet supported — local-first
  by design.)

Tool calling needs a model that supports function calling; most current instruct models do.

### Give it web search (optional)

A page opened from `file://` can't call search engines itself (CORS), so a **tiny local helper** does
it — one standard-library Python file, no keys, no accounts:

```
python tools/search-helper.py          # listens on http://127.0.0.1:9194
```

Then ⚙ → *Search helper* → **Ping** (the default URL is already filled in). The assistant gains
`web_search` (keyless engines in rotation — Brave, Yahoo, Bing — with cooldown and a short cache; set
`SCRIPTORIUM_SEARXNG=http://host:port` to prefer your own SearXNG) and `read_url` (page → readable text). Keep it running in the background —
on Linux a `systemd --user` unit, on Windows a shortcut in Startup, on macOS a launchd agent — or just
start it when you need it. Without it, the assistant simply says search is unavailable.

The helper also keeps a **local trace** of everything the assistant does — each model step (full prompt,
messages, streamed reply, tool calls) and each search/fetch — in `~/.local/share/scriptorium/trace/`
(`curl 'http://127.0.0.1:9194/trace?n=5'` shows the last five). Local files only; delete them any time.
The assistant is told the current date and time on every request, because a local model has no clock.

## Keys

| Key | Action |
|---|---|
| `Ctrl+E` | cycle Write / Source / Page |
| `Ctrl+F` | find & replace |
| `Ctrl+A` | toggle the assistant (native select-all still works inside the sheet) |
| `Ctrl+S` / `Ctrl+O` / `Ctrl+N` | save / open / new tab |
| `Ctrl+Shift+S` | **Save As** — write a copy to a new file; the original is untouched |
| `Ctrl+Z` / `Ctrl+Y` | undo / redo — keystrokes first, then whole-document steps (AI edits, loads) |
| `Ctrl+P` | print / PDF |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+K` | bold / italic / link |

## Building v2 from source

`scriptorium.html` is generated from `scriptorium.src.html` by inlining the editor engine:

```
python build.py
```

That installs the engine into `.build/` on first run (`npm` required), bundles it with esbuild from
`engine.entry.js` (Toast UI Editor + ProseMirror + colour plugin + Prism with a dozen languages),
and writes the single file — KaTeX (with its fonts as data URIs) and Mermaid are inlined the same
way. Edit the template, never the built file.

Engine: [Toast UI Editor](https://github.com/nhn/tui.editor) 3.2.2 (MIT) · ProseMirror (MIT) ·
Prism (MIT) · [KaTeX](https://katex.org) (MIT) · [Mermaid](https://mermaid.js.org) (MIT).

## Testing

```
node test/run.mjs          # ~57 browser-driven checks, green/red (Node ≥ 22 + installed Chrome)
node test/run.mjs --build  # rebuild first
```

See `test/README.md`. Run it before every release; it is the memory of everything that ever broke.

## Design credits

Built to the *Rialto* design system — the five-stop palette engine, glass recipe, plasma shader,
CRT overlay and the "cathedral around a clean sheet of paper" rule all come from there.

## Drive it from another program (remote control)

The optional search helper doubles as a **control channel**: a local mailbox that lets another program —
a script, or an AI agent like Claude Code — operate the *live* page. Turn on **⚙ → Remote control** (on by
default), keep the page open, and from a shell:

```
scriptorium-ctl open_tab report.md < report.md   # push a document straight into the editor
scriptorium-ctl get_selection                     # read what the user highlighted
scriptorium-ctl replace_selection 'reworked text' # rework exactly that
scriptorium-ctl render                            # switch to Page view, ready to print
```

Commands: `ping get_state get_document get_selection set_document apply_edit append_text replace_all
replace_selection open_tab list_tabs switch_tab set_view set_font render print export_html save`. It's the
same command core the in-page AI uses. localhost only; a status-bar light shows when a driver is connected.

## For agents & builders

- **`AGENTS.md`** — how to continue Scriptorium with your own coding agent (architecture, build, test, extend).
- **`docs/CONTROL-API.md`** — the full control-channel + tool API: drive the live editor from a script or an
  AI agent, every command documented.

## License

MIT — see `LICENSE`. Vendored engine components retain their own MIT licenses.
