# Scriptorium — Control API

Scriptorium can be driven by another program — a script, or an AI agent like Claude Code or Codex.
It exposes the *same* command core two ways:

1. **In-page tools** — the built-in assistant (or any OpenAI-compatible model you point it at) calls them as
   function tools.
2. **A remote control channel** — an outside process drives the *live* page through a tiny local mailbox.

Both run the one dispatcher (`docCommand` in the page). Anything the AI can do to your document, an external
driver can do too, and vice-versa.

---

## 1. Turn it on

- Run the helper: `python tools/search-helper.py` (listens on `http://127.0.0.1:9194`).
- Open Scriptorium and leave **⚙ → Remote control** ON (the default).
- The status bar shows **`remote ●`** when a driver is connected, and flashes **`remote ⚡ driving`** while a
  command runs. If the light is off, no driver is attached.

Security model: the channel is **localhost only** and has **no auth token** — the trust boundary is your own
machine. Turn Remote control OFF to disable it entirely. Nothing is exposed to the network.

---

## 2. The easy way — `scriptorium-ctl`

`tools/scriptorium-ctl.sh` (put it on your PATH as `scriptorium-ctl`) wraps the channel:

```bash
scriptorium-ctl status                            # is a page connected?
scriptorium-ctl ping
scriptorium-ctl get_document                      # print the current document
scriptorium-ctl get_selection                     # what the user has highlighted
scriptorium-ctl open_tab report.md < report.md    # push a NEW document into the editor (markdown on stdin)
scriptorium-ctl set_document < report.md          # replace the current document
scriptorium-ctl append_text < snippet.md          # append markdown
scriptorium-ctl apply_edit 'old text' 'new text'  # targeted, unique-substring edit
scriptorium-ctl replace_selection 'reworked text' # rework exactly what the user highlighted
scriptorium-ctl set_view render|write|source
scriptorium-ctl render                            # switch to Page (print) view
scriptorium-ctl print                             # open the browser print/PDF dialog
scriptorium-ctl raw '{"cmd":"set_font","args":{"color":"#2e8b57"}}'
```

Env: `SCRIPTORIUM_HELPER` (default `http://127.0.0.1:9194`), `SCRIPTORIUM_CTL_TIMEOUT` (default 30s).

---

## 3. The raw HTTP channel (build your own driver)

The helper is just a mailbox. Your driver pushes a command and blocks for the result; the page long-polls,
runs it, and posts the result back.

| Method + path | Body / query | Who calls it | Returns |
|---|---|---|---|
| `POST /control/push` | `{cmd, args, timeout}` | your driver | blocks up to `timeout`s → `{ok, result, error}` |
| `GET /control/poll?wait=25` | — | the page | `{commands:[{id,cmd,args,ts}]}` (long-poll) |
| `POST /control/result` | `{id, ok, result, error}` | the page | `{ok:true}` |
| `GET /control/status` | — | anyone | `{connected, last_poll_age, queued}` |
| `GET /health` | — | anyone | includes `control: {...status}` |

Example (curl):

```bash
curl -s -X POST http://127.0.0.1:9194/control/push \
  -H 'Content-Type: application/json' \
  -d '{"cmd":"open_tab","args":{"name":"report.md","markdown":"# Hello\n\nfrom my agent\n"},"timeout":20}'
# → {"ok":true,"result":"opened tab report.md","error":null}
```

If no page is listening, `push` returns `{ok:false, error:"timeout: no page picked this up ..."}` after the
timeout — it never hangs forever.

---

## 4. Commands

Every command returns `{ok, result, error}`. `result` is a string for document ops, an object for state ops.

| Command | Args | Does |
|---|---|---|
| `ping` | — | liveness: `{build, tab, tabs, view}` |
| `get_state` | — | `{tab, activeTab, tabs[], view, dirty, words, chars, build}` |
| `get_document` | — | the current tab's full Markdown |
| `read_document` | — | same as get_document (tool-name alias) |
| `get_selection` | — | the text the user currently has highlighted (empty if none) |
| `set_document` | `{markdown}` | replace the whole document (mermaid is validated) |
| `apply_edit` | `{old_string, new_string}` | replace one **unique** substring; whitespace-lenient; refuses ambiguous/missing |
| `replace_all` | `{find, replace}` | replace every occurrence |
| `append_text` | `{markdown}` | append to the end (blank line inserted before) |
| `replace_selection` | `{text}` | replace exactly the highlighted passage (plain text — ideal for rewording) |
| `open_tab` | `{name, markdown}` | open a NEW tab with this content (push a doc straight in) |
| `list_tabs` | — | `[{i, name, active, dirty}]` |
| `switch_tab` | `{index}` | switch to tab N |
| `set_view` | `{view}` | `write` \| `source` \| `render` (Page) |
| `set_font` | `{family?, size?, color?}` | apply to the current selection (font family / size / colour) |
| `render` | — | switch to Page view |
| `print` | — | switch to Page view and open the browser print/PDF dialog |
| `export_html` | — | download a self-contained HTML export |
| `save` | — | invoke Save (File System Access or download) |

Notes:
- `apply_edit` is the workhorse for targeted formatting/rewording. Base edits on the *real* current text
  (`get_document` first if unsure). It will refuse a substring that isn't unique — add surrounding context.
- Mermaid diagrams written by `set_document` / `append_text` / `apply_edit` are parsed by the real renderer;
  a syntax error comes back in the result so you can fix it. Bar/line charts are `xychart-beta` (there is no
  `barChart` type).
- `replace_selection` uses the last selection the user made in the editor, so it survives the user opening the
  assistant. It inserts plain text; for markdown formatting use `apply_edit`.

---

## 5. The in-page tool API (for any model)

When the built-in assistant runs, the model is given these as function tools (same core as above):
`read_document`, `get_selection`, `replace_selection`, `apply_edit`, `replace_all`, `set_document`,
`append_text`, and — if the search helper is running — `web_search`, `read_url`. Any function-calling model
you point Scriptorium at can use them. Point the assistant at your own endpoint in **⚙ → AI Assistant · server**
(LM Studio, Ollama, or any OpenAI-compatible chat-completions URL).

`window.scriptoriumCommand(cmd, args)` is also exposed on the page for console/CDP debugging.
