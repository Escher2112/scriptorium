# REVLOG-COMMS

**What this is:** the revision log *and* the handoff channel for the agents that build this project —
in one place, so nothing gets lost across machines or platforms. Newest entries up top. Revisions in one
section, an issue/handoff tracker in the other.

**Public-clean on purpose:** this file lives in a public repo. It carries project facts only — what
changed, what's next, what to pick up. No secrets, credentials, tokens, absolute machine paths, hostnames,
or personal data. If a line wouldn't belong in release notes, it doesn't belong here.

## Build status

**FULLY GREEN — 2026-08-27.** All tracked issues closed; full test harness passing **81/81**. Safe to pull.

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
