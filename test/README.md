# Scriptorium test harness

One command, green or red. Pure Node (≥ 22) driving your installed Chrome headlessly over the
DevTools Protocol — no npm packages, no Puppeteer download, never touches your real browser profile.

```
node test/run.mjs            # run against the built scriptorium.html (+ lite smoke)
node test/run.mjs --build    # run python build.py first
node test/run.mjs --shots    # also save Write / Source / Page screenshots to test/out/
```

Exit code 0 = all green. Anything else = read the ✗ list at the bottom.

## What it covers (≈40 checks)

| section | proves |
|---|---|
| build | built file exists, no unexpanded `@@` markers, engine + history API inlined, sane size, **no personal/company identifiers** leaked into the public build, lite edition present |
| load | no uncaught exceptions, engine class + plugins registered, WYSIWYG mode, welcome doc on the sheet, identity = `scriptorium.local.js` override or Scribe |
| reflow | soft-wrapped paragraphs reflow to one line, no injected `<br>`, lists/quotes/fences preserved, code block highlighted **and legible** |
| styling | `<span style>` round-trips markdown → WYSIWYG → markdown; `wrapSpan` applies font+size as a merged mark on a selection; colour plugin command |
| assistant-tools | `apply_edit` (incl. ambiguity/missing refusals), `replace_all`, `set_document`/`read_document`, `get_selection` — all against the live engine |
| undo | history empty after a load, assistant edit undoes to the **exact** prior markdown, redo, Ctrl+Z on typed text, **no cross-tab bleed** through undo |
| views | Source/Write mode switching, Page paginates into 8.5×11 sheets, `\newpage`, zoom-invariant page breaks, Ctrl+E cycle order, scanline mask targets the right surface |
| tabs | persistence to localStorage, close keeps others |
| assistant-stream | mocked SSE server: streamed bubble, tok/s + TTFT metrics, turn history, auto-title; a **tool call from the model executes and the loop continues**; rename/delete chats |
| export-theme | HTML export is a standalone page; theme swap re-derives tokens while paper ink stays neutral; Lite mode strips overlays; no exceptions overall |
| lite | `scriptorium-lite.html` loads clean and renders |

## Hands on the model: `llm-probe`

```
node test/llm-probe.mjs "say hi"                                   # http://localhost:1234, first loaded model
node test/llm-probe.mjs "..." --tools --raw                        # tool schema on; print every raw SSE line
node test/llm-probe.mjs "..." --endpoint http://host:1234 --model NAME --system "You are X"
```

Sends one prompt exactly the way Scriptorium does and prints every delta, then a summary: which
delta keys the server uses (`content` / `reasoning_content` / `tool_calls`), finish reason, usage,
TTFT, whether inline think tags appeared in the content. LM Studio's own server log records
requests but **not** response content — this is how you see what the model actually sent.

Inside the app, ⚙ → **Copy debug trace** copies the raw request/response lines of the last 10
exchanges (also `window.__aiTrace`).

## Adding a check

`check('name', () => E(\`<expression evaluated in the page>\`))` — return `true`, or
`{ok, info, detail}`. Page globals (`editor`, `tabs`, `execTool`, `setView`, …) are reachable by
name. Every check should correspond to something that once broke or was verified by eye; the
harness is the memory of those moments.

## Requirements

- Node ≥ 22 (built-in `WebSocket`); Node 24 is what it's developed on
- Chrome or Edge installed (auto-detected; override with `SCRIPTORIUM_CHROME=<path>`)
- Ports 9192 (static server) and 9223 (DevTools) free
