# What this software does on your machine

Scriptorium is a single HTML file plus a few optional helper scripts. This page says, plainly, what each part
touches, what it stores, and what leaves your computer — so you (or an agent reading this repo on your behalf)
can judge it without reading the code. Nothing here requires administrator rights, changes system settings, or
phones home.

## The app: `scriptorium.html` / `scriptorium-lite.html`

- Runs entirely in your browser from a local file. **No account, no analytics, no telemetry.** The bundled editor
  engine (Toast UI Editor) ships a usage-statistics beacon; it is disabled by option **and** its endpoint is
  neutralised at build time, so the built file contains no analytics URL at all — the test harness asserts this.
  Other URL strings inside the bundle are library documentation/licence links in error messages, not requests.
- **Network:** the app makes no network requests on its own. The only outbound calls are the ones you configure:
  - the AI endpoint you enter in ⚙ (LM Studio, Ollama, or a cloud URL) — your documents are sent there only when
    you talk to the assistant, and only to that URL;
  - the optional local helper on `127.0.0.1:9194` (below), if you start it.
- **Storage:** drafts, tabs, chat history, theme and settings live in your browser's `localStorage` for that
  file. Nothing is written to disk except when you press Save / Save As / Export (browser file dialogs).
- Rendered Markdown is sanitised before display: inline styling spans are kept; scripts, iframes, objects and
  event handlers are stripped, so opening someone else's `.md` cannot run code.

## The helper: `tools/search-helper.py`

- A small, standard-library Python HTTP service bound to **`127.0.0.1` only** (not reachable from the network).
- Gives the assistant `web_search` (queries public search engines) and `read_url` (fetches a page and returns
  readable text). Those are the only outbound requests it makes, and only when the assistant invokes them.
- Keeps a **local** trace of assistant exchanges and searches in `~/.local/share/scriptorium/trace/` (plain files;
  delete them any time).
- Hosts the **remote-control mailbox** (`docs/CONTROL-API.md`) so a script or agent on the same machine can drive
  the live page. Localhost only, **no authentication** — the trust boundary is your own user account. Turn it off in
  ⚙ → Remote control, or don't run the helper.

## The launchers: `tools/scriptorium-open.cmd` / `.sh`

- Start the helper in the background if nothing answers on `:9194`, then open `scriptorium.html` in your browser
  as an app window with a cache-busting `?v=<file mtime>` query.
- Read an optional one-line per-machine file next to them (`scriptorium-open.local.cmd` / `.sh`, git-ignored) for
  the Python interpreter path. They write nothing else.

## The shortcut installers: `tools/install-shortcut.ps1` / `.sh`

- **Windows** (`.ps1`): creates `Scriptorium.lnk` on your Desktop whose target is `tools\scriptorium-open.cmd`
  in this clone — a plain script, no `cmd.exe` command line embedded — with the repo's icon. If you pass `-Python`,
  it writes the one-line `tools\scriptorium-open.local.cmd`. It does **not** change the execution policy or any
  system setting; if local scripts are disabled, the README suggests the standard user-scoped `RemoteSigned`.
- **Linux** (`.sh`): writes `~/.local/share/applications/scriptorium.desktop` (and a copy on `~/Desktop` if that
  folder exists). **macOS**: writes `~/Applications/Scriptorium.app`, a folder with a plist and a two-line shell
  script that runs the launcher. Both only write inside your home directory.

## Building

`build.py` installs the editor engine from npm into `.build/` and inlines it. The vendored components and their
licences: Toast UI Editor 3.2.2, ProseMirror, Prism, KaTeX, Mermaid — all MIT. `engine.entry.js` is the exact list.

## Reporting a problem

Open an issue on the repository. If it is security-sensitive, say so in the title and keep details out of the
public text; the maintainer will reply with a private channel.
