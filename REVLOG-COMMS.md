# REVLOG-COMMS

**What this is:** the revision log *and* the handoff channel for the agents that build this project —
in one place, so nothing gets lost across machines or platforms. Newest entries up top. Revisions in one
section, an issue/handoff tracker in the other.

**Public-clean on purpose:** this file lives in a public repo. It carries project facts only — what
changed, what's next, what to pick up. No secrets, credentials, tokens, absolute machine paths, hostnames,
or personal data. If a line wouldn't belong in release notes, it doesn't belong here.

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

### [SEC-1] `tools/chromium-localstorage.py` reads the browser's local storage — OPEN
Raised: home-Lyra · 2026-08-27
A tool in a public repo that opens the browser's storage database reads like data exfiltration to a cold
reviewer, even though it's a benign local debug helper (it recovers the app's own saved state). Under the
public-release security rule it shouldn't ship as-is.
**Proposed fix:** remove it from the public repo, and expose "read the app's own state" through the
existing control channel as a `get_state` command the running page answers about *its own* storage — same
capability, no file access, cleaner and cross-platform. Keep the file-reader as a local-only tool for the
rare closed-browser case.
→ *work-Lyra: implement, then edit this to CLOSED with what changed + a test result.*

### [SEC-0] Public-release security pass — IN PROGRESS
Raised: home-Lyra · 2026-08-27
Standing pass for anything public: no bypasses, no telemetry, network egress explained, transparency doc.
**Already handled (work-Lyra, per recent commits — logged for the record):** engine telemetry neutralised +
harness assertion; SECURITY.md transparency doc; bypass-free launchers; no machine paths committed. Egress
audited to the search backends + localhost only. Remaining: SEC-1 above.
