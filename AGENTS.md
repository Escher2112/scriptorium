# AGENTS.md — continue Scriptorium with your own coding agent

Scriptorium was built almost entirely by an AI coding agent, and it's set up so *your* agent
(Claude Code, Codex, or anything similar) can pick it up and keep going. This file is the handoff.
Point your agent at this repo and tell it to read `AGENTS.md` first.

## What it is

A single self-contained HTML file that is a real WYSIWYG Markdown word processor: write on a paper sheet,
the document stays a real `.md`, print to clean paginated PDF, KaTeX math + Mermaid diagrams render, and an
optional AI assistant edits the document with tools over any OpenAI-compatible endpoint (local or cloud).
No install, no account, no telemetry. MIT.

## Architecture in one breath

- **`scriptorium.src.html`** is the TEMPLATE you edit. **`scriptorium.html`** is the BUILT single file — never
  edit it by hand; it's generated.
- **`build.py`** inlines the vendored engine into the template: Toast UI Editor 3 (ProseMirror) + colour/
  code-highlight plugins + Prism (bundled via esbuild from `engine.entry.js`), plus KaTeX and Mermaid, with
  KaTeX's fonts embedded as data: URIs. Markers in the template are `<!--@@CSS:path@@-->` / `<!--@@JS:path@@-->`
  and `@@BUILDSTAMP@@`.
- The editing surface is Toast UI Editor (WYSIWYG ⇄ Markdown, both ProseMirror). A `src` facade
  (`get value`/`set value`) means every code path — tabs, tools, export, counts — sees one Markdown string.
- Three views: **Write** (WYSIWYG paper sheet), **Source** (Markdown + live preview), **Page** (a
  zero-dependency `md2html` paginated into Letter sheets — this is what prints/exports).
- The AI assistant is a streaming, tool-using loop against any OpenAI-compatible chat-completions endpoint.
  Tools operate on the live document. See `docs/CONTROL-API.md`.
- The optional **search helper** (`tools/search-helper.py`) gives the assistant `web_search`/`read_url` and
  doubles as a **control channel** so an external agent can drive the live page (`docs/CONTROL-API.md`).

## Build · test · run

```
python build.py                 # regenerate scriptorium.html from the template
node test/run.mjs               # ~70 browser-driven checks, green/red (Node >= 22 + a Chromium/Chrome)
node test/run.mjs --build       # rebuild first
```

`test/run.mjs` drives a headless Chromium over the DevTools protocol (pure Node, no npm — `test/cdp.mjs`).
**The harness is the memory of everything that ever broke — keep it green; add a check for every fix.**
It also asserts the public build carries no personal identifiers.

## Repo layout

```
scriptorium.src.html   TEMPLATE — edit this
build.py               inlines the engine + katex + mermaid -> scriptorium.html
engine.entry.js        what esbuild bundles (Toast UI Editor + ProseMirror + colour plugin + Prism)
scriptorium.html       BUILT single file (~5 MB). Generated — never hand-edit.
scriptorium-lite.html  v1 edition, zero-dependency, ~95 KB, hand-maintained (frozen)
tools/                 search-helper.py (search + control mailbox), scriptorium-ctl.sh (CLI driver),
                       scriptorium-open.sh/.cmd (launchers), install-shortcut.sh/.ps1 (desktop shortcut on any OS),
                       print-pdf.mjs (headless md -> PDF), scriptorium.ico/.png (app icon)
test/                  run.mjs (harness), cdp.mjs (Node CDP client)
docs/CONTROL-API.md    the control channel + tool API, fully documented
README.md · SECURITY.md (what every part touches on a machine) · LICENSE (MIT)
```

## How to extend

- **Add an AI tool:** add an entry to the `TOOLS` array in the template, handle it in `execTool(name,args)`,
  and (if it's a document op) surface it through `docCommand` so the remote channel gets it too. Add a harness
  check. Keep the tool's description tight — the model reads it.
- **Add a remote command:** add a `case` to `docCommand(cmd,args)`; it's instantly available to
  `scriptorium-ctl` and any driver.
- **Change the chrome/theme:** the design system is the Rialto token set (`:root` variables + `color-mix`);
  the page ("the clean sheet") stays near-neutral ink on every theme. Colour is never the only signal.
- **Rebuild and test before you ship** — a stale `file://` cache is the #1 false bug; the status bar shows the
  build time so you can tell you're on the current file (`tools/scriptorium-open.sh` busts the cache).

## Locked decisions (don't re-litigate without a reason)

- **Single self-contained file** is the deliverable. Template + build, not a served app.
- **Engine = Toast UI Editor**, bundled ourselves (its npm UMD externalizes ProseMirror and throws in a
  browser — that's why esbuild exists in the build). Hand-rolling contenteditable was rejected.
- **The page is a clean sheet** — glass/plasma/CRT live on the frame only; paper ink stays near-neutral.
- **MIT, no telemetry, no account.** It stays the user's.

## Drive it while you work

With the helper running and Remote control ON, your agent can operate the *live* page:
`scriptorium-ctl open_tab doc.md < doc.md`, `get_selection`, `replace_selection '...'`, `render`. Full API in
`docs/CONTROL-API.md`. This is how the app was iterated — the agent pushes a document in, renders it, and sees
the result, without the human copy-pasting anything.
