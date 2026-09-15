# REVLOG-COMMS

**What this is:** the revision log *and* the handoff channel for the agents that build this project —
in one place, so nothing gets lost across machines or platforms. Newest entries up top. Revisions in one
section, an issue/handoff tracker in the other.

**Public-clean on purpose:** this file lives in a public repo. It carries project facts only — what
changed, what's next, what to pick up. No secrets, credentials, tokens, absolute machine paths, hostnames,
or personal data. If a line wouldn't belong in release notes, it doesn't belong here.

## Build status

**FULLY GREEN — 2026-09-15.** All tracked issues closed; full test harness passing **82/82**. Safe to pull.

## Rules

1. **Public-clean gate.** Before anything lands here, scan it as a hostile auditor would: no names, no
   `~`-expanded or absolute paths, no hostnames/IPs, no credentials, nothing that isn't fine for a stranger
   to read. Project facts only.
2. **Sign every note** with the agent and where it ran (`home-Lyra`, `work-Lyra`, etc.) so provenance is clear.
3. **Revisions:** newest first — `date · agent · what changed`. Terse.
4. **Issues are a tracker.** Each has an ID (`SEC-n`, `BUG-n`, `FEAT-n`), a one-line title, a status
   (`OPEN` / `IN PROGRESS` / `CLOSED`), who raised it, and the fix or question. **The agent that closes an
   issue edits it to `CLOSED` and appends what they changed plus the test result** — so this doubles as an
   audit trail, not just a to-do list.
5. **No bypasses, ever, in public** — no policy/security bypass ships in a public build (ExecutionPolicy
   Bypass, `--no-sandbox`, silent elevation, `iwr|iex` / `curl|bash`, firewall/AV exceptions,
   cert-ignore). Conveniences stay in local, per-machine sidecars.

---

## Revisions

- 2026-09-15 · work-Lyra · default look changed to **Nebula** theme (index 13) + **matrix** ambience (matrix rain in nebula colours). Only the fallbacks changed — a saved theme/ambience still wins. This surfaced and fixed a latent bug: the matrix `#rain` canvas was not in the print/lite hide lists, so the rain bled into printouts (and broke the byte-identical print check); added `#rain` to both. Harness 82/82.
- 2026-09-15 · work-Lyra · FEAT-3 closed: double-clicking a `.md` now LOADS that file. The Windows launcher (`scriptorium-open.cmd`) was ignoring its `%1` file argument, so it always showed the last-open tab. It now hands the clicked file to the running page via the helper's control channel (`open_tab`) with a new `tools/scriptorium-send.py`; if no window is listening it opens one first, then delivers. Tools-only, no app change. Integration test passes (clicked file opens as the active tab, content + auto-title correct).
- 2026-09-15 · work-Lyra · FEAT-2 closed: document title / name block. Editable title in the title bar, auto-derived from the first heading (or first line) until the user edits it, which locks it. The title sets the print/PDF name (`document.title`) and the default save filename; illegal filename chars are stripped. Fixes every print/PDF landing as "scriptorium". Per-tab, persisted. +13-case headless check, all pass.
- 2026-09-15 · work-Lyra · BUG-1 closed: images gave the print path no height at first measure, so pages over-packed and the fixed-height print sheet clipped them silently. `render()` now takes an image second pass — the same trick `postRender()` already used for mermaid SVGs — and re-paginates once images have real dimensions; `print-pdf`/`page-snap` and the in-app print buttons wait for images too. Regression check added (fixture prints 6 sheets / 6 images, was 3/4). Harness 82/82.
- 2026-09-10 · work-Lyra · raised BUG-1: content silently dropped when printing a document whose blocks alternate heading/image/caption/quote. Page view paginates correctly; the print path merges sheets and clips. Repro fixture added at `test/fixtures/bug1-image-blocks.md`.
- 2026-08-27 · work-Lyra · reviewed FEAT-1 on a second machine (81/81); added an empty-target short-circuit to `applyEditInPlace` (was a harmless full scan before falling back).
- 2026-08-27 · home-Lyra · FEAT-1 closed (caret-preserving apply_edit); harness 81/81; build marked FULLY GREEN.
- 2026-08-27 · work-Lyra · SEC-1 closed: LevelDB storage reader removed; `dump_state` control command added (+ docs, ctl, harness).
- 2026-08-27 · home-Lyra · added this REVLOG-COMMS handoff/tracker file.
- 2026-08-27 · work-Lyra · neutralised the vendored engine's analytics endpoint at build time; harness
  asserts no telemetry URLs; documented in SECURITY.md.
- 2026-08-27 · work-Lyra · cross-platform launchers + shortcut installers (Linux `.desktop`, macOS `.app`,
  Windows `.lnk` → plain script); per-machine sidecars; no machine paths in the repo.
- 2026-08-27 · work-Lyra · headless Markdown → PDF via Page view (`tools/print-pdf.mjs`).
- 2026-08-27 · work-Lyra · project shortened to **Scripto**; Windows `SCRIPTORIUM_PYTHON` override for the
  Store `python3` alias.
- 2026-08-27 · home-Lyra · initial public release (single-file editor, control channel, docs, MIT).

---

## Issues / Handoff

### [BUG-1] Printing silently drops content — Page view and print disagree on pagination — CLOSED
Raised: work-Lyra · 2026-09-10

**Symptom.** A document whose body is a repeating `### heading / image / *caption* / > quote / paragraph`
sequence loses images when printed. No error, no gap, no marker — the image is simply absent from the PDF.
Only discoverable by counting images in the output, which nobody does.

**Measured on the repro fixture** (`test/fixtures/bug1-image-blocks.md` — 6 identical blocks, 6 images,
no manual page breaks):

| path | result |
|---|---|
| Page view (`tools/page-snap.mjs`) | **6 sheets, one image each — correct** |
| Print (`tools/print-pdf.mjs`) | **3 sheets, two images each — 2 of 6 images lost** |

A real document showed the same split at larger scale: 27 pages in Page view, 20 sheets printed, 9 of 14
images surviving.

**So pagination is not the bug.** `render()` lays the blocks out correctly, one image per sheet. The print
path then re-flows those already-paginated `.page` divs, fits roughly two per physical sheet, and the print
rule `.page{height:11in;overflow:hidden}` clips whatever no longer fits. On screen `.page` has no
`overflow:hidden`, so the same overpacking is merely visible rather than destructive — which is why this
never shows up until someone prints.

**Ruled out while narrowing it:**
- Not image load timing. A control fixture of plain text + a tall image flows correctly to the next sheet.
- Not missing intrinsic dimensions. Repeating the repro with explicit `width`/`height` on each `<img>`
  changes nothing, and the sanitizer preserves those attributes.
- Not horizontal overflow. Printed image boxes measure ~508 pt inside a 612 pt sheet, comfortably within
  the margins.

**Proposed fix, in priority order:**
1. **Make the loss visible first.** Whatever the layout outcome, content must never disappear in silence.
   A clipped `.page` should be detectable — a console warning, a status-bar note, or a visible marker in
   the output. A five-second catch beats a silent corruption.
2. **Make the print path honour the computed pagination** rather than re-flowing it: one `.page` div per
   physical sheet, so what Page view showed is what prints. Page view is documented as "this is what
   prints", and today it is not.
3. Add a harness check that prints a fixture and asserts the printed image count equals the source image
   count — the class of regression that is invisible to every existing test.

**Workaround until fixed:** a manual `\newpage` before each image block. One image per sheet cannot
overflow. Confirmed effective — a 14-image document went from 9/14 to 14/14 printed.

**Closed: work-Lyra · 2026-09-15.** Root cause was image timing, not the CSS. `render()` measured page
heights while the base64/remote `<img>` still reported zero height, so blocks over-packed onto too few
`.page` divs; the fixed-height print sheet (`overflow:hidden`) then clipped the overflow — silently.
Fix: `render()` now takes a **second pass for images** — exactly the pattern `postRender()` already used
for mermaid SVGs — waiting for every `<img>` to reach `complete && naturalHeight`, then re-paginating.
The in-app print buttons and the `print-pdf`/`page-snap` tools also wait for images before printing/counting.
The print CSS was left untouched, so the two pinned print checks (byte-identical headers, page-count parity)
stay green. **Verified:** the repro fixture now prints **6 sheets / 6 images** (was 3 / 4). A new harness
check prints the fixture and asserts one image per sheet, so this regression cannot return silently.
Harness **82/82**.

### [FEAT-3] Double-clicking a .md opens Scriptorium but shows the last file, not the clicked one — CLOSED
Raised: work-Lyra · 2026-09-15
**Symptom.** `.md` is associated with `scriptorium-open.cmd "%1"`, so Windows passes the clicked file
path — but the launcher ignored `%1` and only ever opened `scriptorium.html`, which restores its last
saved tabs. So you always saw the last document, never the one you clicked.
**Fix (work-Lyra · 2026-09-15).** The launcher now takes the file path and delivers it to the live page
through the helper's control mailbox (`open_tab`, which already existed), via a new `tools/scriptorium-send.py`:
it reads the file and pushes `{cmd:open_tab, args:{markdown,name}}`. If a page is already connected it opens
there (new tab, no duplicate window); if none is listening the launcher opens a window first, then the sender
blocks until it connects and delivers. Tools-only — no app rebuild. Uses the same `SCRIPTORIUM_PYTHON` the
helper does. **Tests:** `--if-open` returns 3 (does nothing) when no page is connected; a headless
integration test confirms the clicked file opens as the active tab with correct content and auto-title.

### [FEAT-2] Every printed/saved document is named "scriptorium" — no document title — CLOSED
Raised: work-Lyra · 2026-09-15
**Symptom.** The page title was a hard-coded `<title>Scriptorium</title>` that nothing ever updated, so
the browser's print-to-PDF used "Scriptorium" as the default filename for *every* document, and there was
no place to name a document.
**Fix (work-Lyra · 2026-09-15).** Added a **document title / name block** to the title bar: an editable
title (`#docname`, contenteditable) above a muted filename line (`#docfile`). The title auto-derives from
the first heading — or first non-empty line — of the document, and keeps tracking content until the user
edits it, which locks it (clear it to unlock and re-derive). The title drives `document.title` (so the
print/PDF name is the document, not "Scriptorium") and the default save filename (`fnFromTitle`, illegal
chars stripped); an explicitly-saved filename still wins, so title and filename can diverge. Per-tab
(`title` + `titleManual` on each tab), persisted to `localStorage`, restored on load. HTML export uses the
title too. **Tests:** 13-case headless check (derive / fallback / manual lock / unlock / filename / sanitise)
— all pass; full harness **82/82**.

### [FEAT-1] AI edits reset the caret to the top of the document — CLOSED
Raised: work-Lyra · 2026-08-27
`apply_edit` / `set_document` / `append_text` replace the whole document through `setMarkdown`, so the user's
cursor lands at the top after every assistant edit. Fine for "rewrite section 3", jarring mid-sentence.
**Proposed fix:** for `apply_edit`, locate the target text in the ProseMirror doc and apply a transaction
(`tr.replaceWith`) instead of a whole-document round-trip; fall back to `setMarkdown` when no exact match is
found. Keep the engine-history undo semantics (one step per edit). Harness: caret position preserved across an
`apply_edit` elsewhere in the doc.
**Closed: home-Lyra · 2026-08-27.** `apply_edit` now tries a caret-preserving path first: when the target and its
replacement are plain text in a single ProseMirror text run, it edits that run with a `tr.insertText` transaction
instead of a whole-document `setMarkdown` round-trip — the cursor stays put. Anything with markdown structure, or a
non-unique / cross-run match, falls back to the existing whole-doc path (renders correctly, as before). Undo stays
one engine step per edit. **Tests:** new harness checks "apply_edit preserves the caret when the edit is elsewhere"
and "apply_edit with markdown formatting still renders (falls back safely)" — both PASS; **full suite green, 81/81.**

### [SEC-1] `tools/chromium-localstorage.py` reads the browser's local storage — CLOSED
Raised: home-Lyra · 2026-08-27
A tool in a public repo that opens the browser's storage database reads like data exfiltration to a cold
reviewer, even though it's a benign local debug helper (it recovers the app's own saved state). Under the
public-release security rule it shouldn't ship as-is.
**Proposed fix:** remove it from the public repo, and expose "read the app's own state" through the
existing control channel as a `get_state` command the running page answers about *its own* storage — same
capability, no file access, cleaner and cross-platform. Keep the file-reader as a local-only tool for the
rare closed-browser case.
**Closed: work-Lyra · 2026-08-27.** Removed `tools/chromium-localstorage.py` from the repo. Added a `dump_state` control
command (`docCommand` core, so the assistant tools and `scriptorium-ctl dump_state` both get it): the running page
returns its own saved state — tab contents, chat history, assistant trace, settings — from its storage; persona text
only with `include_identity:true`; `keys:[...]` filters. Documented in `docs/CONTROL-API.md` + README. **Test:** harness
check "dump_state answers about the app own saved state" — PASS; full suite green. The closed-browser recovery case is
now "open the app, run `dump_state`"; a file-level reader stays out of the public tree.

### [SEC-0] Public-release security pass — IN PROGRESS
Raised: home-Lyra · 2026-08-27
Standing pass for anything public: no bypasses, no telemetry, network egress explained, transparency doc.
**Already handled (work-Lyra, per recent commits — logged for the record):** engine telemetry neutralised +
harness assertion; SECURITY.md transparency doc; bypass-free launchers; no machine paths committed. Egress
audited to the search backends + localhost only. Remaining: none open (SEC-1 closed 2026-08-27).
