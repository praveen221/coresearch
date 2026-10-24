# Coresearch skill design review

Reviewed 24 Oct 2026 against `main` at `8bfef15`, by following `SKILL.md` literally on Node v24.14.0 from a fresh `npm ci`, then reading the guide, role briefs, CLI, and UI. Other agents already filed PRs #1, #3, #4, and #5; those are not repeated here.

## Open design questions

**Duplicate ideas: allow, but warn on exact text.** `idea:add` inserts freely. The same sentence can be saved twice (confirmed: ids 1 and 2 with identical text). That is harmless for a student rephrasing, and dangerous for an agent that retries a failed-looking save. Exact-text duplicates then block every agent `track:add` until each idea has its own track (PR #4 only makes that error readable). Recommendation: keep duplicates (students do restate an idea); on exact `kind`+`text` match, return the existing row and a `duplicate: true` flag, or refuse with “Idea N already has this text.” Do not silently drop a near-paraphrase.

**Duplicate track links: keep the upsert; document it.** `track:link` is `ON CONFLICT (track_id, source_id) DO UPDATE` of `role` and `note`. A paper cannot have two roles on one track. That is the right default: a seed paper that later competes should change role, not appear twice. Recommendation: keep one row per `(track, source)`. On a no-op (same role and note), return the detail unchanged. On a role change, say so in the JSON (`roleChangedFrom`). Reject only if the source belongs to another target (already done). Do not add a second link row.

## Findings, ranked by impact

### 1. README is not enough for a public first run

A new human (or an agent installing for one) cannot get from the README to a working app without guessing. Missing: Node 24.14+ as a real prerequisite (how to check `node -v`, what the engine error looks like when 22 is installed), a numbered quickstart, an example session, troubleshooting, and install steps that differ by host.

Current Claude Code line is a paste-into-chat instruction. Cursor and Codex are lumped as “other agents: clone, then read SKILL.md.” Public users will also hit: workspace-inside-git refusal, `Run setup before start`, empty-stdin JSON errors, and port 3780 in use. None of those are in the README.

**Do:** add Prerequisites, per-host install (Claude Code personal skill dir, Cursor project/user skill dir, Codex: clone and “Read SKILL.md and set up Coresearch”), a 5-step quickstart, a short example session, and a troubleshooting table. Keep it short; do not restate the research loop.

### 2. `workspace` output does not match SKILL.md

SKILL.md: “It prints the student's workspace folder, or `null` before the first setup.” Then “If `null`: ask the student…”

Actual: `{"workspace": null}` or `{"workspace": "/abs/path"}`. An agent following the words looks for a bare `null` or a path on its own line. The JSON is correct; the skill text is wrong.

**Do:** say it prints JSON with a `workspace` field, and treat a null field as first run.

### 3. Write commands fail with “Unexpected end of JSON input”

Every write that uses `inputFromStdin()` (`profile:update`, `idea:add`, `track:add`, `track:link`, `source:future`, …) calls `JSON.parse` on empty stdin. Agents routinely run the command first, then wonder what flags it wants. TTY detection only helps when stdin is a real TTY; piped empty and `</dev/null` both yield the SyntaxError.

`source:future` is the worst case: the guide shows `source:future --id <source>` with no stdin (PR #5). `track:link` is next (PR #3 fixes the field names, not the missing-stdin error).

**Do:** if stdin is empty, throw `Supply JSON on stdin.` If `JSON.parse` fails, throw `Stdin was not valid JSON.` Point at the matching `:schema` command.

### 4. Unknown command dumps the entire enum as Zod JSON

`npm run coresearch` and `… -- help` and `… -- foobar` each print ~3.5 KB of Zod `invalid_value` listing every command. Agents try `help` first. The payload burns tokens and hides the actual advice (run `guide`).

Schema failures are the same shape: `idea:add` with `{}` prints a JSON issue array instead of `kind: expected question or area. text: required.`

**Do:** unknown command → one line pointing at `guide`. Format `ZodError` the way Server Actions already do (`path: message`).

### 5. Home, empty, tells the student they are already applying

With no professors, Home still says “You are applying to 0 professors: 0 research proposals (UK and Europe) and 0 pitches (US and elsewhere).” “What to do next” always includes “Ask your agent to rank your professors by fit” whenever no fit scores exist, including when there are no professors. Proposal and pitch sections say “None yet” with no link to add one.

The Professors page is better: “No professors yet. Import your list below, or add one.” — but “add one” is not a link.

**Do:** zero-professor Home should say to add a professor (link `/targets/new`) or tell the agent. Only ask to rank fit when at least one professor exists. Link “add one” on Professors.

### 6. Default pathway from region will mis-file the starting case

`defaultPathway` is proposal only for `uk` and `europe`. Katie Seaborn (product starting case, Institute of Science Tokyo / Cambridge) is `asia-pacific` or mixed and becomes a **pitch** unless the student changes it. The agent script in SKILL.md never says “ask which path.” The guide says the region sets the default and the student can change it — after the target is already saved.

Many Asia-Pacific and Canadian programmes still want a proposal. Silent default is the kind of mistake that sends the whole research loop down the wrong path.

**Do (skill, not a default-flip):** after region, always ask “Does this programme want a research proposal, or a contact pitch?” before `target:add`. Leave the region default as a fallback only. A default change is a product decision; put it in the skill now.

### 7. Guide order fights the work the roles actually do

Printed `guide` is the real procedure (~21 KB). Problems when an agent follows it in order:

- **Fit** (step 3) runs `role fit-scorer`, which needs papers and pages, **before** Kickstart the library (step 7).
- **Share** sits between Fit and Pitch, so a first-time agent offers export before any research.
- **Application requirements** comes after Pitch, so pitch-writer is told to check AI-assistance rules that have not been clipped yet. The pitch-writer brief does this itself; the guide order does not.
- “Open one frontier track per target” is a single unexplained sentence. Frontier is a `kind` on `track:add`, one per target, “the general state of the art.” Agents will invent a meaning or skip it.
- Cost in SKILL.md is “40 minutes”; the guide says “30 to 45 minutes.” Pick one.

**Do:** reorder to Context → Professors → Library → Requirements → Fit → Pitch or Batches → Shortlist, with Share last or in SKILL.md only. Define frontier in that sentence. Align the cost line.

### 8. Token use: dump-all commands, then dump-all paper text

Measured: `guide` 21,278 bytes; `research:schema` 26,037 bytes; `role fit-scorer` ~6 KB plus the commands it tells the sub-agent to run (`profile:get`, `profile:cv-text`, `source:list`, `clip:list`, …). `source:text` and `profile:cv-text` without `--page` return every page. Role briefs already prefer `--page <n>`; the guide’s “Application requirements” step says `source:text --id <source>` with no page.

`track:get` returns every linked source object (abstract, references, paths). `research:overview` is the compact form and is under-advertised.

SQLite’s `ExperimentalWarning` prints on **every** command (roles say to ignore it). It still occupies the agent’s context and interleaves with JSON.

**Do (later, not this pass):** `research:schema --command idea:add`; require `--page` once `pageCount > 1` or cap unpaged text; `NODE_NO_WARNINGS=1` or `process.emitWarning` filter in the CLI. **Do now:** guide and roles must say “always `source:text --id <id> --page <n>`.”

### 9. Hallucinated quotes: the write path is strong, the chat path is not

`clip:add` rejects words that are not in the saved text and finds the page. Fit scores of 2–3, pitch connections, track conclusions, and reviewer rationales all require `[c<id>]` or a CV quote that `locateQuote` checks. That is the right architecture.

Gaps:

- The agent can still invent a quote **in chat** and never call `clip:add`. Nothing replays chat against the library.
- `source:text` hands the model the raw page, so it can paraphrase and then present the paraphrase as a quote. The skill says “exact words” but does not say “never quote in chat; only through `clip:add`.”
- Pitch-writer and fit-scorer are told to cite cutouts; they are not told to refuse to draft if a connection has no clip yet (the schema enforces it only at `pitch:draft` / `fit:score` time).
- “No matching study found” is handled; invented citations of unsaved papers are not. `paper:add` then `clip:add` is the intended path, but a reviewer can write `[c99]` only if that clip exists (`assertRefs`). Good. A rationale that names “Smith 2024” with no source is still accepted.

**Do:** one guide rule: “Never present a quotation except the JSON returned by `clip:add` or `fit:score`. If `clip:add` rejects it, do not rephrase; copy from `source:text --page`.” Optionally reject `track:score` / `track:update` rationales that contain quotation marks but no `[c<id>]`.

### 10. CLI errors that name a field but not a fix

Good already: workspace-inside-git, setup-before-start, missing `--id` / `--target` / `--file`, list:preview without a source, role without a name, critic without drafts, clip quote mismatch, pending student ideas (PR #4).

Still poor:

- Zod blobs (finding 4).
- Empty stdin SyntaxError (finding 3).
- `The idea was not saved.` / `The clip was not saved.` after a successful-looking insert (should not happen; if it does, it means a read-back bug).
- App `error.tsx` always says “Unable to load your profile” on any page.
- `Provide --id.` on `source:get` when the agent passed JSON `{sourceId: 1}` on stdin. Agents mix stdin and flags constantly. A slightly longer “Provide --id. This command does not read stdin.” would stop the loop.

### 11. Skill vs code mismatches (beyond PRs #3 and #5)

- SKILL.md Sharing: export options `pitches`, `notes`, `cv`, `texts` on stdin — matches `exportOptionsSchema`. Good. `export` with no stdin succeeds (defaults). SKILL implies JSON is required; it is optional.
- SKILL.md “Return the URL only after successful startup.” `start` already prints `{ running, url, workspace, shared }`. Fine; do not also invent a sentence.
- After setup, SKILL.md says omit `--workspace`. Role briefs always pass `--workspace`. Correct for a sub-agent whose cwd is uncertain; the parent skill should say that exception.
- `npm run coresearch --` vs role header `npm run -s coresearch --`. The `-s` hides npm’s “> coresearch@0.1.0” banner. The parent skill should use `-s` too; the banner is noise in every transcript.
- `role` in SKILL.md lists `--target` or `--track`. Code: investigator/reviewer need `--track` (or a track that implies target). Error text is already good.

### 12. UI copy and navigation

Clear: How it works flowchart, Add a professor form, Ideas empty (“No ideas yet”), export options, “Not provided.”, live-refresh failure, pitch “Coresearch never contacts anyone.”

Confusing:

- Sidebar **Professors** is the outreach table (all paths, ranked by fit) but the subtitle becomes “N to pitch.” Proposal-path people live under **Research proposals**. A student looking for “my list” may miss half of it. Rename the nav item to “All professors” or keep “Professors” and always list both paths in the subtitle.
- New-target page title in metadata is “Add target”; the heading says “Add a professor.” Use “professor” everywhere in the UI (SKILL.md’s “target” is the agent word).
- Ideas page: “Each one becomes a student track.” Not until the agent opens it. Say “Your agent should open a student track for each.”
- Method page with no data shows the flowchart with no counts — fine.

### 13. First-time agent workflow is ask-heavy, then dump-heavy

SKILL.md Professors: five clarifying questions before `target:add` (lab kind, named professor, university/lab, links, confirm searched links). That is right and slow. Then `guide` dumps the entire PhD procedure. Then each role reprints the same five rules.

A first session that only wanted “save my name and this professor” still has to pull `guide` to know `idea:add` exists — SKILL.md never names idea commands.

**Do:** SKILL.md should name `idea:list` / `idea:add` in Chat updates or a one-line “Student ideas” section, and say “Run `guide` only when starting fit, pitch, or research — not during profile setup.”

## Large changes (review only)

- Reorder `guide` steps (finding 7).
- `research:schema --command <name>` and paged-only `source:text`.
- Suppress SQLite ExperimentalWarning in the CLI.
- Change region→pathway defaults.
- Chat-level quote verifier.
- Dedup ideas / richer track-link response (open questions above).
- A `help` command (would stop agents hitting the Zod enum).

## Already in flight

- PR #1: app test schema (`batches`, `seeds`, `categories`).
- PR #3: `track:link` is one `sourceId` + `role` per call, not `labPaperIds`.
- PR #4: pending-idea error names the idea text.
- PR #5: `source:future` stdin. Prefer making `note` optional with a default over teaching every agent to pipe JSON for a mark-scanned command.

PR #2 (Node 24 → 22) was correctly closed. Node 24.14+ exists and is the engine range. The public README must say so, because many machines still have 22 and the engine error is the first thing a public clone hits.
